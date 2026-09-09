import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Copy, Search, Send, Wand2 } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate, MESSAGE_VARS, fillTemplate } from '../store.jsx'
import { Modal, Field, Select, Empty, Confirm, toast } from '../ui.jsx'

// « Modèles de messages » — onglet de Mes notes.
// Les BDR réécrivent chaque jour les mêmes quatre messages, un peu moins bien à chaque fois.
// On range donc le texte, avec ses variables, et on le remplit depuis un contact réel choisi
// dans le pipeline. L'ENVOI reste manuel : on donne le texte, pas un automate, et rien ne
// dépend d'un connecteur externe.

const emptyTemplate = (family = '') => ({
  id: uid(), name: '', family: family || 'Prise de contact', content: '', used: 0, lastUsed: '', createdAt: todayISO(),
})

export default function MessageTemplates() {
  const store = useStore()
  const sub = store.sub
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [useFor, setUseFor] = useState(null)   // modèle en cours de personnalisation
  const [target, setTarget] = useState('')     // rdvId choisi pour remplir les variables
  if (!sub) return null

  const list = sub.messageTemplates || []
  const families = [...new Set(list.map(t => t.family).filter(Boolean))]
  const me = store.db.subenvs.find(s => s.id === store.session?.subEnvId)
  const myName = me ? `${me.prenom} ${me.nom}`.trim() : (store.account?.pseudo || '')

  const setList = (fn) => store.setSub(d => ({ ...d, messageTemplates: fn(d.messageTemplates || []) }))

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return list
      .filter(t => !ql || [t.name, t.content, t.family].some(v => (v || '').toLowerCase().includes(ql)))
      .sort((a, b) => (b.used || 0) - (a.used || 0) || (a.name || '').localeCompare(b.name || ''))
  }, [list, q])

  // Contexte de remplissage : un rendez-vous du pipeline, donc un contact réel.
  const rdvs = (sub.rdvs || []).filter(r => r.entreprise).slice(0, 200)
  const ctxOf = (rdvId) => {
    const r = rdvs.find(x => x.id === rdvId)
    const c = (r?.contacts || [])[0] || {}
    const parts = String(c.nom || '').trim().split(/\s+/)
    return {
      prenom: parts[0] || '', nom: parts.slice(1).join(' ') || '',
      entreprise: r?.entreprise || '', poste: c.poste || '', secteur: r?.secteur || '', moi: myName,
    }
  }
  const preview = useFor ? fillTemplate(useFor.content, ctxOf(target)) : ''

  const copy = (t, text) => {
    try { navigator.clipboard?.writeText(text) } catch (e) { /* presse-papiers indisponible : le compteur reste juste */ }
    setList(l => l.map(x => x.id === t.id ? { ...x, used: (x.used || 0) + 1, lastUsed: todayISO() } : x))
    toast('Message copié — collez-le dans votre outil d\'envoi')
  }

  const save = () => {
    if (!editing.name.trim()) return
    setList(l => {
      const i = l.findIndex(x => x.id === editing.id)
      if (i >= 0) { const n = [...l]; n[i] = editing; return n }
      return [...l, editing]
    })
    store.logAction('Modèle', 'Modèle de message enregistré', editing.name)
    toast('Modèle enregistré')
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2 rounded-lg bg-surface border border-line px-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-muted shrink-0" />
          <input className="input !py-1.5 border-0 !bg-transparent text-sm" placeholder="Chercher un modèle…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="btn-primary !py-1.5 text-xs" onClick={() => setEditing(emptyTemplate(families[0]))}>
          <Plus size={14} /> Nouveau modèle
        </button>
      </div>

      {filtered.length === 0
        ? <Empty text={list.length === 0 ? 'Aucun modèle. Commencez par celui que vous réécrivez le plus souvent.' : 'Aucun modèle ne correspond à cette recherche.'} />
        : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.id} className="card p-3.5">
                <div className="flex items-start gap-2 flex-wrap">
                  {t.family && <span className="chip bg-surface text-muted">{t.family}</span>}
                  <span className="font-bold text-[15px] flex-1 min-w-0">{t.name}</span>
                  {(t.used || 0) > 0 && (
                    <span className="text-[11px] text-muted" title={t.lastUsed ? `Dernière fois le ${fmtDate(t.lastUsed)}` : ''}>
                      utilisé {t.used} fois
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted mt-2 whitespace-pre-wrap line-clamp-4">{t.content}</p>
                <div className="flex gap-1.5 mt-2.5 flex-wrap">
                  <button className="btn-primary !py-1 text-xs" onClick={() => { setUseFor(t); setTarget(rdvs[0]?.id || '') }}>
                    <Wand2 size={13} /> Personnaliser
                  </button>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => copy(t, t.content)}><Copy size={13} /> Copier tel quel</button>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => setEditing({ ...t })}><Pencil size={13} /> Modifier</button>
                  <button className="btn-ghost !py-1 text-xs !text-red-600" onClick={() => setConfirmDel(t.id)}><Trash2 size={13} /> Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {list.length > 0 && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          <Send size={12} /> BD Report n'envoie rien : le message est copié, vous l'envoyez depuis votre outil habituel.
        </p>
      )}

      {/* Personnalisation : on remplit depuis un rendez-vous réel plutôt que de saisir les
          variables à la main — c'est le geste rapide qu'on veut, pas un formulaire de plus. */}
      {useFor && (
        <Modal title={`Personnaliser — ${useFor.name}`} onClose={() => setUseFor(null)} wide>
          <div className="space-y-3">
            <Field label="Remplir à partir d'un rendez-vous">
              <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">— aucun (laisser les variables visibles) —</option>
                {rdvs.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.entreprise}{r.contacts?.[0]?.nom ? ` — ${r.contacts[0].nom}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <textarea className="input min-h-[220px] text-sm" value={preview} readOnly />
            <p className="text-[11px] text-muted">
              Une variable sans valeur reste affichée entre crochets : mieux vaut un trou visible qu'un message
              qui commence par « Bonjour , ».
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setUseFor(null)}>Fermer</button>
              <button className="btn-primary" onClick={() => { copy(useFor, preview); setUseFor(null) }}>
                <Copy size={14} /> Copier le message
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={list.some(x => x.id === editing.id) ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={() => setEditing(null)} wide>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom du modèle" required>
                <input className="input" value={editing.name} placeholder="Ex. Relance après silence"
                  onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} />
              </Field>
              <Field label="Famille">
                <input className="input" value={editing.family} placeholder="Ex. Relance"
                  onChange={e => setEditing(x => ({ ...x, family: e.target.value }))} />
              </Field>
            </div>
            <Field label="Message">
              <textarea className="input min-h-[220px] text-sm" value={editing.content}
                onChange={e => setEditing(x => ({ ...x, content: e.target.value }))}
                placeholder="Écrivez le message. Insérez des variables avec les boutons ci-dessous." />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] text-muted self-center">Variables :</span>
              {MESSAGE_VARS.map(v => (
                <button key={v.key} className="chip bg-brand/10 text-brand hover:bg-brand/20" title={v.label}
                  onClick={() => setEditing(x => ({ ...x, content: (x.content || '') + `{${v.key}}` }))}>
                  {'{' + v.key + '}'}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" disabled={!editing.name.trim()} onClick={save}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message="Supprimer ce modèle de message ?" yesLabel="Supprimer"
          onYes={() => { setList(l => l.filter(x => x.id !== confirmDel)); setConfirmDel(null); toast('Modèle supprimé') }}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}
