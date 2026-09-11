// ---------------------------------------------------------------------------
//  RÈGLE ACTUALITÉ IA — le contexte commercial d'UN environnement.
//
//  C'est ce qui fait qu'une même dépêche est déterminante pour un client et sans
//  intérêt pour un autre. Sans ce contexte, le moteur ne peut produire qu'un
//  agrégateur d'articles — exactement ce qu'on ne veut plus.
//
//  ⚠️ L'ICP N'EST PAS RECOPIÉ ICI. Les profils existent déjà dans les espaces
//  (`data.icpProfiles`, avec secteurs, effectifs et postes) : on les COCHE. Les
//  ressaisir créerait une seconde définition du même client, et les deux finiraient
//  par diverger sans que personne ne sache laquelle fait foi.
//
//  Le même écran sert à la création (assistant de l'atelier) et à la modification
//  (fiche de l'environnement) : une règle qu'on ne peut régler qu'une fois, à la
//  livraison, serait fausse au bout d'un trimestre.
// ---------------------------------------------------------------------------
import React, { useState } from 'react'
import { Sparkles, Check } from 'lucide-react'
import { SIGNAL_TYPES, SIGNAL_PRIORITIES, SIGNAL_SOURCES, defaultNewsRules } from '../store.jsx'
import { Field, toast } from '../ui.jsx'

// Personas proposés d'emblée. Ce ne sont que des suggestions : le champ reste libre,
// parce qu'aucune liste ne couvrira les intitulés réels de tous les marchés.
const PERSONA_SUGGESTIONS = [
  'DRH', 'Directeur RH', 'HRBP', 'Talent Acquisition', 'DAF', 'CEO', 'COO', 'CTO',
  'Directeur Transformation', 'Directeur des opérations', 'Head of People', 'Responsable formation',
]

export default function NewsRules({ store, envId, value, onChange, embedded }) {
  // Deux usages : piloté par l'assistant (`value`/`onChange`), ou autonome sur la fiche.
  const [local, setLocal] = useState(() => value || store.envNewsRules(envId))
  const rules = value || local
  const set = (patch) => {
    const next = { ...rules, ...patch }
    if (onChange) onChange(next); else setLocal(next)
  }
  const icps = store.envIcpProfiles ? store.envIcpProfiles(envId) : []
  const [persona, setPersona] = useState('')

  const toggleSignal = (id, patch) => set({
    signals: (rules.signals || defaultNewsRules().signals).map(s => (s.id === id ? { ...s, ...patch } : s)),
  })
  const sigOf = (id) => (rules.signals || []).find(s => s.id === id) || { on: false, priority: 'medium' }
  const addPersona = (p) => {
    const v = String(p || '').trim()
    if (!v || (rules.personas || []).includes(v)) return
    set({ personas: [...(rules.personas || []), v] })
    setPersona('')
  }

  const body = (
    <div className="space-y-4">
      <Field label="Décrivez votre activité">
        <textarea className="input min-h-[70px]" value={rules.activite || ''} onChange={e => set({ activite: e.target.value })}
          placeholder="Nous sommes un éditeur SaaS spécialisé dans les solutions SIRH pour les entreprises françaises de 100 à 5 000 salariés." />
      </Field>
      <Field label="Que vendez-vous ?">
        <textarea className="input min-h-[70px]" value={rules.offre || ''} onChange={e => set({ offre: e.target.value })}
          placeholder="SIRH complet : gestion des talents, onboarding, entretiens, formation, administration RH." />
      </Field>

      {/* ICP : on coche des profils qui EXISTENT, on n'en redéfinit pas. */}
      <div>
        <div className="label !mb-1.5">Profils ICP ciblés</div>
        {icps.length === 0 ? (
          <p className="text-xs text-muted">
            Aucun profil ICP dans cet environnement. Ils se créent dans l'onglet ICP de l'espace — le moteur les reprendra ensuite tels quels.
          </p>
        ) : (
          <div className="space-y-1.5">
            {icps.map(p => {
              const on = (rules.icpProfileIds || []).includes(p.id)
              return (
                <label key={p.id} className="flex items-start gap-2 text-sm cursor-pointer rounded-lg bg-surface p-2">
                  <input type="checkbox" className="mt-1" checked={on}
                    onChange={e => set({ icpProfileIds: e.target.checked
                      ? [...(rules.icpProfileIds || []), p.id]
                      : (rules.icpProfileIds || []).filter(x => x !== p.id) })} />
                  <span className="min-w-0">
                    <b>{p.name}</b>
                    <span className="block text-xs text-muted">
                      {[(p.secteurs || []).join(', '),
                        p.effMin || p.effMax ? `${p.effMin ?? '?'}–${p.effMax ?? '?'} salariés` : '',
                        (p.postes || []).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Personas */}
      <div>
        <div className="label !mb-1.5">Personas ciblés</div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {(rules.personas || []).map(p => (
            <span key={p} className="chip bg-brand/10 text-brand">
              {p} <button className="ml-1 text-red-500" onClick={() => set({ personas: rules.personas.filter(x => x !== p) })}>✕</button>
            </span>
          ))}
          {(rules.personas || []).length === 0 && <span className="text-xs text-muted italic">Aucun persona pour l'instant.</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input !py-1.5 text-sm !w-56" placeholder="Ajouter un persona" value={persona}
            onChange={e => setPersona(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPersona(persona)} />
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => addPersona(persona)}>Ajouter</button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PERSONA_SUGGESTIONS.filter(p => !(rules.personas || []).includes(p)).map(p => (
            <button key={p} className="chip bg-surface text-muted hover:text-ink" onClick={() => addPersona(p)}>+ {p}</button>
          ))}
        </div>
      </div>

      {/* Signaux recherchés + priorité */}
      <div>
        <div className="label !mb-1.5">Signaux recherchés</div>
        <p className="text-xs text-muted mb-2">
          Ce que le moteur doit chercher, et ce qui compte le plus. La priorité pèse dans le score — sans elle, tous les signaux se vaudraient.
        </p>
        <div className="space-y-1">
          {SIGNAL_TYPES.map(t => {
            const s = sigOf(t.id)
            return (
              <div key={t.id} className={`flex items-center gap-2 rounded-lg p-1.5 ${s.on ? 'bg-brand/5' : ''}`}>
                <label className="flex items-center gap-2 text-sm cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={!!s.on} onChange={e => toggleSignal(t.id, { on: e.target.checked })} />
                  <span className="shrink-0">{t.emoji}</span>
                  <span className="truncate">{t.label}</span>
                </label>
                <select className="input !w-auto !py-1 !text-xs" value={s.priority} disabled={!s.on}
                  onChange={e => toggleSignal(t.id, { priority: e.target.value })}>
                  {SIGNAL_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sources : chacune s'éteint seule. */}
      <div>
        <div className="label !mb-1.5">Sources</div>
        <div className="space-y-1.5">
          {SIGNAL_SOURCES.map(src => (
            <label key={src.id} className="flex items-start gap-2 text-sm cursor-pointer rounded-lg bg-surface p-2">
              <input type="checkbox" className="mt-1" checked={rules.sources?.[src.id] !== false}
                onChange={e => set({ sources: { ...(rules.sources || {}), [src.id]: e.target.checked } })} />
              <span className="min-w-0"><b>{src.label}</b><span className="block text-xs text-muted">{src.desc}</span></span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted mt-1.5">Sources publiques uniquement — aucune clé, aucun compte, rien qui contourne une protection.</p>
      </div>

      <Field label="Consignes supplémentaires pour l'IA">
        <textarea className="input min-h-[70px]" value={rules.consignes || ''} onChange={e => set({ consignes: e.target.value })}
          placeholder="Prioriser les entreprises qui recrutent sur les fonctions RH. Ne pas remonter les actualités sans impact commercial identifiable." />
      </Field>
    </div>
  )

  // Piloté par l'assistant : il enregistre lui-même à la création.
  if (onChange) return body

  return (
    <div className="space-y-3">
      {!embedded && <div className="text-sm font-bold flex items-center gap-2"><Sparkles size={15} className="text-brand" /> Règle Actualité IA</div>}
      {body}
      <div className="flex justify-end">
        <button className="btn-primary !py-1.5 text-sm" onClick={() => {
          store.saveEnvNewsRules(envId, rules)
          toast('Règle Actualité IA enregistrée')
        }}><Check size={14} /> Enregistrer la règle</button>
      </div>
    </div>
  )
}
