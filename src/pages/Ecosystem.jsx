import React, { useState } from 'react'
import {
  Workflow, Plus, Trash2, Pencil, Check, X, Coins, CalendarClock, AlertTriangle,
  ChevronUp, ChevronDown, Save, Activity, CalendarRange, Layers, ArrowRightLeft, Gauge, Handshake,
} from 'lucide-react'
import { useStore, uid, DEFAULT_PHASES, DEFAULT_PRIME_CUTOFF, fmtMoney, ACTIVITY_PERIODS, activityRuleTitle, computeActivityPrimes, handoffPhases, DEFAULT_HANDOFF_REASONS, primeRules, QUOTA_METRICS, closingPhases, DEFAULT_CLOSING_LOST_REASONS, DEFAULT_RECYCLE_DELAYS, RECYCLE_FALLBACK_DAYS } from '../store.jsx'
import { Confirm, Field, Empty, toast } from '../ui.jsx'

// « Créer votre écosystème » : le manager compose ici le vocabulaire de son équipe —
// les étapes de son pipeline — et les règles qui transforment une étape en prime.
// Ces réglages touchent des montants versés : chaque bloc s'enregistre explicitement.

function Phases({ store, sub }) {
  const phases = sub.phases || DEFAULT_PHASES
  const primePhases = sub.primePhases || []
  const wonPhases = sub.wonPhases || []
  const lostPhases = sub.lostPhases || []
  const [adding, setAdding] = useState('')
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const usedBy = (p) => (sub.rdvs || []).filter(r => r.phase === p).length
  const move = (i, dir) => {
    const next = [...phases]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    store.setEcosystem({ phases: next })
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-2"><Workflow size={17} className="text-brand" /> Étapes de votre pipeline</h3>
        <p className="text-xs text-muted mt-0.5">
          L'ordre est celui du kanban et des entonnoirs. Renommer une étape reporte le nouveau nom
          sur les rendez-vous qui la portent : rien n'est perdu.
        </p>
      </div>

      <div className="space-y-1.5">
        {phases.map((p, i) => {
          const count = usedBy(p)
          const triggers = primePhases.includes(p)
          return (
            <div key={p} className="flex items-center gap-2 p-2 rounded-xl border border-line">
              <div className="flex flex-col">
                <button className="btn-ghost !p-0.5" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={13} /></button>
                <button className="btn-ghost !p-0.5" disabled={i === phases.length - 1} onClick={() => move(i, 1)}><ChevronDown size={13} /></button>
              </div>

              {editing === p ? (
                <>
                  <input className="input !py-1 text-sm flex-1" value={name} autoFocus
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { store.renamePhase(p, name); setEditing(null); toast('Étape renommée') } }} />
                  <button className="btn-ghost !p-1 text-emerald-600" onClick={() => { store.renamePhase(p, name); setEditing(null); toast('Étape renommée') }}><Check size={14} /></button>
                  <button className="btn-ghost !p-1" onClick={() => setEditing(null)}><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="font-semibold text-sm flex-1">{p}</span>
                  <span className="text-[11px] text-muted">{count} RDV</span>
                  {/* Issue commerciale de l'étape. Sans cette information, les tableaux de bord
                      ne savent pas distinguer une affaire gagnée d'une affaire perdue : ils
                      comparaient jusqu'ici aux noms d'origine, et se vidaient dès qu'on les
                      renommait. Une étape ne peut pas être gagnée ET perdue. */}
                  <select className="input !w-auto !py-1 !text-[11px]" title="Ce que cette étape signifie pour l'affaire"
                    value={wonPhases.includes(p) ? 'won' : lostPhases.includes(p) ? 'lost' : 'open'}
                    onChange={e => {
                      const v = e.target.value
                      store.setEcosystem({
                        wonPhases: v === 'won' ? [...wonPhases.filter(x => x !== p), p] : wonPhases.filter(x => x !== p),
                        lostPhases: v === 'lost' ? [...lostPhases.filter(x => x !== p), p] : lostPhases.filter(x => x !== p),
                      })
                    }}>
                    <option value="open">en cours</option>
                    <option value="won">affaire gagnée</option>
                    <option value="lost">affaire perdue</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" title="Un passage à cette étape déclenche le calcul d'une prime">
                    <input type="checkbox" checked={triggers}
                      onChange={e => {
                        const next = e.target.checked ? [...primePhases, p] : primePhases.filter(x => x !== p)
                        store.setEcosystem({ primePhases: next })
                      }} />
                    prime
                  </label>
                  <button className="btn-ghost !p-1" title="Renommer" onClick={() => { setEditing(p); setName(p) }}><Pencil size={13} /></button>
                  <button className="btn-ghost !p-1 !text-red-500" title="Supprimer" onClick={() => setConfirmDel(p)}><Trash2 size={13} /></button>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <input className="input !py-1.5 text-sm" placeholder="Nom d'une nouvelle étape… (ex. Découverte, Cadrage)"
          value={adding} onChange={e => setAdding(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || !adding.trim()) return
            store.setEcosystem({ phases: [...phases, adding.trim()] }); setAdding(''); toast('Étape ajoutée')
          }} />
        <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!adding.trim() || phases.includes(adding.trim())}
          onClick={() => { store.setEcosystem({ phases: [...phases, adding.trim()] }); setAdding(''); toast('Étape ajoutée') }}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {primePhases.length === 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 flex gap-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Aucune étape ne déclenche de prime : plus aucun montant ne sera calculé.
            Cochez au moins l'étape qui qualifie une affaire.
          </p>
        </div>
      )}

      {confirmDel && (
        <Confirm
          message={usedBy(confirmDel) > 0
            ? `« ${confirmDel} » est portée par ${usedBy(confirmDel)} rendez-vous. Les supprimer de cette étape les laisserait sans étape : renommez-la plutôt. Supprimer quand même ?`
            : `Supprimer l'étape « ${confirmDel} » ?`}
          onYes={() => {
            store.setEcosystem({
              phases: phases.filter(x => x !== confirmDel),
              primePhases: primePhases.filter(x => x !== confirmDel),
              wonPhases: wonPhases.filter(x => x !== confirmDel),
              lostPhases: lostPhases.filter(x => x !== confirmDel),
            })
            setConfirmDel(null); toast('Étape supprimée')
          }}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

function PayRule({ store, sub }) {
  const current = sub.primeCutoffDay || DEFAULT_PRIME_CUTOFF
  const [day, setDay] = useState(current)
  const dirty = Number(day) !== Number(current)
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-2"><CalendarClock size={17} className="text-brand" /> Règle de rattachement au mois</h3>
        <p className="text-xs text-muted mt-0.5">
          Une affaire qualifiée avant ce jour est payée sur le mois en cours ; à partir de ce jour,
          elle bascule sur le mois suivant. Cela laisse au mois le temps d'être clôturé sans que des
          lignes s'y ajoutent après coup.
        </p>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <Field label="Jour de bascule">
          <input type="number" min={1} max={28} className="input !w-24" value={day}
            onChange={e => setDay(e.target.value)} />
        </Field>
        <p className="text-xs text-muted mb-2">
          Aujourd'hui : une qualification le <b>{Math.min(28, Math.max(1, Number(day) || 15))}</b> du mois est
          payée le mois en cours, le lendemain elle passe au suivant.
        </p>
        {dirty && (
          <button className="btn-primary !py-1.5 text-sm mb-1"
            onClick={() => {
              store.setEcosystem({ primeCutoffDay: Math.min(28, Math.max(1, Number(day) || 15)) })
              toast('Règle enregistrée')
            }}>
            <Save size={15} /> Enregistrer
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Les primes déjà figées ne bougent pas : ce réglage vaut pour les qualifications à venir.
      </p>
    </div>
  )
}

function Bareme({ store, sub }) {
  const rows = sub.bareme || []
  const currency = sub.currency || 'EUR'
  const sources = sub.sources || ['Outbound', 'Inbound', 'Event', 'Partner', 'Emailing', 'LinkedIn']
  const patch = (id, p) => store.setEcosystem({ bareme: rows.map(r => (r.id === id ? { ...r, ...p } : r)) })

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-2"><Coins size={17} className="text-brand" /> Barème des primes</h3>
        <p className="text-xs text-muted mt-0.5">
          Le montant d'une prime se lit ici, en croisant l'effectif de l'entreprise prospectée et la
          source du lead. La ligne la plus précise l'emporte.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5">Effectif min</th><th>Effectif max</th><th>Source</th><th>Montant</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1.5 pr-2"><input type="number" className="input !py-1 !w-24" value={r.min} onChange={e => patch(r.id, { min: Number(e.target.value) })} /></td>
                <td className="pr-2"><input type="number" className="input !py-1 !w-24" value={r.max} onChange={e => patch(r.id, { max: Number(e.target.value) })} /></td>
                <td className="pr-2">
                  <select className="input !py-1 !w-auto" value={r.leadSource || ''} onChange={e => patch(r.id, { leadSource: e.target.value })}>
                    <option value="">Toutes sources</option>
                    {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="pr-2"><input type="number" className="input !py-1 !w-24" value={r.montant} onChange={e => patch(r.id, { montant: Number(e.target.value) })} /></td>
                <td>
                  <button className="btn-ghost !p-1 !text-red-500" title="Supprimer la ligne"
                    onClick={() => { store.setEcosystem({ bareme: rows.filter(x => x.id !== r.id) }); toast('Ligne supprimée') }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-xs text-muted">Aucune ligne : aucune prime ne sera calculée.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="btn-ghost !py-1.5 text-sm"
        onClick={() => {
          store.setEcosystem({ bareme: [...rows, { id: uid(), min: 1, max: 50, montant: 100, leadSource: '' }] })
          toast('Ligne ajoutée')
        }}>
        <Plus size={14} /> Ajouter une ligne
      </button>

      <p className="text-[11px] text-muted">
        Exemple : une entreprise de 120 salariés issue d'un lead entrant touchera{' '}
        {fmtMoney((rows.find(r => 120 >= r.min && 120 <= r.max && r.leadSource === 'Inbound')
          || rows.find(r => 120 >= r.min && 120 <= r.max))?.montant || 0, currency)}.
      </p>
    </div>
  )
}

// -------------------------------------------------- Barème par activité (règles façon Excel)
function ActivityBaremeCard({ store, sub, phaseOptions }) {
  const rules = sub.activityRules || []
  const setRules = (fn) => store.setSub(d => ({ ...d, activityRules: typeof fn === 'function' ? fn(d.activityRules || []) : fn }))
  const addRule = () => { setRules(rs => [...rs, { id: uid(), label: '', period: 'mois', phases: [], tiers: [{ id: uid(), min: 10, montant: 200 }] }]); store.logAction('Prime', "Règle de prime d'activité ajoutée") }
  const patchRule = (id, patch) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  const removeRule = (id) => setRules(rs => rs.filter(r => r.id !== id))
  const togglePhase = (id, ph) => setRules(rs => rs.map(r => r.id === id ? { ...r, phases: (r.phases || []).includes(ph) ? r.phases.filter(x => x !== ph) : [...(r.phases || []), ph] } : r))
  const setTiers = (id, tiers) => patchRule(id, { tiers })

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold flex items-center gap-2"><Activity size={17} className="text-brand" /> Barème par activité (volume de RDV)</h3>
          <p className="text-xs text-muted -mt-0.5">Des règles façon « règles de données Excel » : une condition (période + phases) → un résultat (prime par palier de RDV).</p>
        </div>
        <button className="btn-primary !py-1.5 text-xs" onClick={addRule}><Plus size={14} /> Ajouter une règle</button>
      </div>

      {rules.length === 0 && <Empty text="Aucune règle d'activité. Exemple : « ≥ 10 RDV en R1 dans le mois → 200 € »." />}

      <div className="space-y-3">
        {rules.map((rule, ri) => {
          const tiers = rule.tiers || []
          const results = computeActivityPrimes(sub.rdvs, [rule])
          const total = results.reduce((a, p) => a + p.montant, 0)
          return (
            <div key={rule.id} className="rounded-xl border border-line p-3 space-y-2.5 bg-surface/40">
              {/* Ligne 1 : SI (période) + nom + suppression */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="chip bg-brand/10 text-brand font-bold shrink-0">Règle {ri + 1}</span>
                <input className="input !py-1 text-sm flex-1 min-w-[140px]" placeholder={activityRuleTitle(rule)} value={rule.label || ''} onChange={e => patchRule(rule.id, { label: e.target.value })} />
                <button className="btn-ghost !p-1.5 text-red-500 shrink-0" title="Supprimer la règle" onClick={() => removeRule(rule.id)}><Trash2 size={15} /></button>
              </div>

              {/* Ligne 2 : période + phases */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <CalendarRange size={14} /> Sur la
                  <select className="input !w-auto !py-1 text-xs" value={rule.period} onChange={e => patchRule(rule.id, { period: e.target.value })}>
                    {ACTIVITY_PERIODS.map(p => <option key={p.id} value={p.id}>{p.label.toLowerCase()}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-muted flex items-center gap-1"><Layers size={14} /> compter les RDV en :</span>
                  {phaseOptions.map(ph => (
                    <button key={ph} onClick={() => togglePhase(rule.id, ph)}
                      className={`chip cursor-pointer ${(rule.phases || []).includes(ph) ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}>{ph}</button>
                  ))}
                  {(rule.phases || []).length === 0 && <span className="text-[11px] text-muted italic">toutes les phases</span>}
                </div>
              </div>

              {/* Ligne 3 : paliers (ALORS) */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted">Paliers de prime :</div>
                {tiers.map((t, ti) => (
                  <div key={t.id || ti} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-muted">À partir de</span>
                    <input type="number" min="1" className="input !w-20 !py-1 text-center" value={t.min}
                      onChange={e => setTiers(rule.id, tiers.map(x => x === t ? { ...x, min: e.target.value } : x))} />
                    <span className="text-muted">RDV →</span>
                    <input type="number" min="0" className="input !w-24 !py-1 text-center font-bold" value={t.montant}
                      onChange={e => setTiers(rule.id, tiers.map(x => x === t ? { ...x, montant: e.target.value } : x))} />
                    <span className="text-muted">€</span>
                    <button className="text-red-400 shrink-0" title="Retirer le palier" onClick={() => setTiers(rule.id, tiers.filter(x => x !== t))}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button className="btn-ghost !py-1 text-xs" onClick={() => setTiers(rule.id, [...tiers, { id: uid(), min: (Number(tiers[tiers.length - 1]?.min) || 0) + 10, montant: 0 }])}><Plus size={13} /> Ajouter un palier</button>
              </div>

              {/* Aperçu sur les données réelles */}
              <div className="text-xs rounded-lg bg-card border border-line px-3 py-2">
                {results.length === 0
                  ? <span className="text-muted">Sur vos RDV actuels : aucun palier atteint pour l'instant.</span>
                  : <span>Sur vos RDV : <b className="text-emerald-600">{fmtMoney(total)}</b> — {results.sort((a, b) => a.periodKey.localeCompare(b.periodKey)).map(r => `${r.periodLabel} (${r.count} RDV → ${fmtMoney(r.montant)})`).join(' · ')}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted">La prime versée par période est celle du <b>palier le plus élevé atteint</b>. Ces primes s'ajoutent aux primes par lead et apparaissent dans le suivi et le reporting ci-dessus.</p>
    </div>
  )
}

// -------------------------------------------------- Seuils, accélérateurs et plafonds
// Trois leviers que toute politique de variable un peu sérieuse utilise, et qu'un barème
// strictement linéaire ne sait pas exprimer. Tout est FACULTATIF et désactivé par défaut :
// ces règles changent des montants versés, ce n'est pas au produit d'en décider.
function PrimeRulesCard({ store, sub }) {
  const r = primeRules(sub)
  const set = (patch) => store.setEcosystem({ primeRules: { ...r, ...patch } })
  const quotasOn = store.hasModule('quotas')
  const hasQuota = !!store.myQuota?.(r.refMetric) || Object.keys(store.quotas?.()?.byMember || {}).length > 0

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold flex items-center gap-2"><Gauge size={17} className="text-brand" /> Seuils, accélérateurs et plafonds</h3>
          <p className="text-xs text-muted mt-0.5">
            Facultatif. Sans ces règles, le barème reste strictement linéaire — c'est le
            comportement d'origine, et il convient à beaucoup d'équipes.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer shrink-0">
          <input type="checkbox" checked={!!r.on} onChange={e => { set({ on: e.target.checked }); toast(e.target.checked ? 'Règles activées' : 'Règles désactivées — barème linéaire') }} />
          Activer
        </label>
      </div>

      {r.on && (
        <div className="space-y-3">
          <Field label="Indicateur de référence (atteinte du quota)">
            <select className="input !w-auto" value={r.refMetric} onChange={e => set({ refMetric: e.target.value })}>
              {QUOTA_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          {!quotasOn && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 flex gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Le module « Objectifs & quotas » n'est pas installé : sans quota posé, le seuil et
                l'accélérateur n'ont pas de base de calcul et resteront sans effet. Le plafond, lui, s'applique.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={!!r.threshold?.on} onChange={e => set({ threshold: { ...r.threshold, on: e.target.checked } })} />
              Seuil de déclenchement
            </label>
            <p className="text-[11px] text-muted">Aucune prime versée tant que ce pourcentage du quota n'est pas atteint sur le mois.</p>
            {r.threshold?.on && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Rien avant</span>
                <input type="number" min="0" max="200" className="input !w-20 !py-1 text-center" value={r.threshold.pct}
                  onChange={e => set({ threshold: { ...r.threshold, pct: Number(e.target.value) || 0 } })} />
                <span className="text-muted">% du quota</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={!!r.accelerator?.on} onChange={e => set({ accelerator: { ...r.accelerator, on: e.target.checked } })} />
              Accélérateur au-delà du quota
            </label>
            <p className="text-[11px] text-muted">Multiplie les primes du mois quand le quota est dépassé.</p>
            {r.accelerator?.on && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted">À partir de</span>
                <input type="number" min="0" className="input !w-20 !py-1 text-center" value={r.accelerator.fromPct}
                  onChange={e => set({ accelerator: { ...r.accelerator, fromPct: Number(e.target.value) || 0 } })} />
                <span className="text-muted">% du quota, multiplier par</span>
                <input type="number" min="1" step="0.1" className="input !w-20 !py-1 text-center" value={r.accelerator.factor}
                  onChange={e => set({ accelerator: { ...r.accelerator, factor: Number(e.target.value) || 1 } })} />
              </div>
            )}
          </div>

          {store.hasModule('handoff') && (
            <div className="rounded-xl border border-line p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={!!r.quality?.on} onChange={e => set({ quality: { ...r.quality, on: e.target.checked } })} />
                Pondération par la qualité des leads
              </label>
              <p className="text-[11px] text-muted">
                Sous ce taux d'acceptation par les closers, les primes du mois sont minorées.
                Un mois sans dossier tranché n'est jamais pénalisé : une absence de donnée n'est pas un mauvais résultat.
              </p>
              {r.quality?.on && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-muted">Sous</span>
                  <input type="number" min="0" max="100" className="input !w-20 !py-1 text-center" value={r.quality.minRate}
                    onChange={e => set({ quality: { ...r.quality, minRate: Number(e.target.value) || 0 } })} />
                  <span className="text-muted">% d'acceptation, multiplier par</span>
                  <input type="number" min="0" max="1" step="0.05" className="input !w-20 !py-1 text-center" value={r.quality.factor}
                    onChange={e => set({ quality: { ...r.quality, factor: Number(e.target.value) || 1 } })} />
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-line p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={!!r.cap?.on} onChange={e => set({ cap: { ...r.cap, on: e.target.checked } })} />
              Plafond mensuel
            </label>
            <p className="text-[11px] text-muted">Montant maximum versé à une personne sur un mois de paiement.</p>
            {r.cap?.on && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Au maximum</span>
                <input type="number" min="0" className="input !w-28 !py-1 text-center" value={r.cap.amount}
                  onChange={e => set({ cap: { ...r.cap, amount: Number(e.target.value) || 0 } })} />
                <span className="text-muted">par mois</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted">
            Ces règles s'appliquent au total d'un mois, jamais à une prime prise isolément — et le
            détail du calcul est affiché sur la page Primes : un montant modifié sans explication est un litige qui arrive.
          </p>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------- Pipeline de closing (module `closing`)
// Un SECOND pipeline, celui du closer. Séparé du premier, et volontairement : fusionner les
// deux obligerait chaque BDR à faire vivre les étapes d'un métier qui n'est pas le sien.
function ClosingCard({ store, sub }) {
  const phases = closingPhases(sub)
  const reasons = sub.closingLostReasons?.length ? sub.closingLostReasons : DEFAULT_CLOSING_LOST_REASONS
  const [adding, setAdding] = useState('')
  const [addingReason, setAddingReason] = useState('')
  const move = (i, dir) => {
    const next = [...phases]; const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    store.setEcosystem({ closingPhases: next })
  }
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-2"><Handshake size={17} className="text-brand" /> Pipeline de closing</h3>
        <p className="text-xs text-muted mt-0.5">
          Les étapes du closer, en aval de la passation. L'issue — gagnée ou perdue — reste celle
          de votre pipeline principal : une affaire signée ici compte partout ailleurs.
        </p>
      </div>

      <div className="space-y-1.5">
        {phases.map((p, i) => (
          <div key={p} className="flex items-center gap-2 p-2 rounded-xl border border-line">
            <div className="flex flex-col">
              <button className="btn-ghost !p-0.5" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={13} /></button>
              <button className="btn-ghost !p-0.5" disabled={i === phases.length - 1} onClick={() => move(i, 1)}><ChevronDown size={13} /></button>
            </div>
            <span className="font-semibold text-sm flex-1">{p}</span>
            <button className="btn-ghost !p-1 !text-red-500" title="Supprimer l'étape"
              disabled={phases.length <= 1}
              onClick={() => { store.setEcosystem({ closingPhases: phases.filter(x => x !== p) }); toast('Étape supprimée') }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input !py-1.5 text-sm" placeholder="Nouvelle étape… (ex. Pilote, Juridique)"
          value={adding} onChange={e => setAdding(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && adding.trim()) { store.setEcosystem({ closingPhases: [...phases, adding.trim()] }); setAdding('') } }} />
        <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!adding.trim() || phases.includes(adding.trim())}
          onClick={() => { store.setEcosystem({ closingPhases: [...phases, adding.trim()] }); setAdding('') }}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">Motifs de perte au closing</div>
        <p className="text-[11px] text-muted mb-2">
          Distincts des motifs de refus d'un lead : ici le lead était bon, l'affaire s'est perdue plus tard.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {reasons.map(r => (
            <span key={r} className="chip bg-surface text-muted flex items-center gap-1">
              {r}
              <button className="text-red-400 hover:text-red-600" title="Retirer"
                onClick={() => store.setEcosystem({ closingLostReasons: reasons.filter(x => x !== r) })}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input !py-1.5 text-sm" placeholder="Nouveau motif…" value={addingReason}
            onChange={e => setAddingReason(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && addingReason.trim()) { store.setEcosystem({ closingLostReasons: [...reasons, addingReason.trim()] }); setAddingReason('') } }} />
          <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!addingReason.trim() || reasons.includes(addingReason.trim())}
            onClick={() => { store.setEcosystem({ closingLostReasons: [...reasons, addingReason.trim()] }); setAddingReason('') }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------- Passation au closer (module `handoff`)
function HandoffCard({ store, sub }) {
  const phases = sub.phases?.length ? sub.phases : DEFAULT_PHASES
  const active = handoffPhases(sub)
  const explicit = sub.handoffPhases || []
  const reasons = sub.handoffReasons?.length ? sub.handoffReasons : DEFAULT_HANDOFF_REASONS
  const [adding, setAdding] = useState('')

  const togglePhase = (p) => {
    // Liste vide = « le jalon », résolu automatiquement. Le premier clic matérialise donc la
    // sélection courante avant de la modifier, sinon décocher le jalon ne changerait rien.
    const base = explicit.length ? explicit : active
    const next = base.includes(p) ? base.filter(x => x !== p) : [...base, p]
    store.setEcosystem({ handoffPhases: next })
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-2"><ArrowRightLeft size={17} className="text-brand" /> Passation au closer</h3>
        <p className="text-xs text-muted mt-0.5">
          À partir de quelle étape le dossier change-t-il de mains ? Le closer l'accepte ou le refuse
          avec un motif : c'est ce verdict qui mesure la qualité réelle des leads transmis.
        </p>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">Étapes déclenchant une passation</div>
        <div className="flex flex-wrap gap-1.5">
          {phases.map(p => (
            <button key={p} onClick={() => togglePhase(p)}
              className={`chip cursor-pointer ${active.includes(p) ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}>{p}</button>
          ))}
        </div>
        {!explicit.length && <p className="text-[11px] text-muted mt-1.5">Par défaut : le jalon qui déclenche vos primes.</p>}
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">Motifs de refus proposés</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {reasons.map(r => (
            <span key={r} className="chip bg-surface text-muted flex items-center gap-1">
              {r}
              <button className="text-red-400 hover:text-red-600" title="Retirer ce motif"
                onClick={() => store.setEcosystem({ handoffReasons: reasons.filter(x => x !== r) })}>×</button>
            </span>
          ))}
          {reasons.length === 0 && <span className="text-[11px] text-muted italic">Aucun motif : le closer saisira du texte libre.</span>}
        </div>
        <div className="flex gap-2">
          <input className="input !py-1.5 text-sm" placeholder="Nouveau motif de refus…" value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && adding.trim()) { store.setEcosystem({ handoffReasons: [...reasons, adding.trim()] }); setAdding('') } }} />
          <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!adding.trim() || reasons.includes(adding.trim())}
            onClick={() => { store.setEcosystem({ handoffReasons: [...reasons, adding.trim()] }); setAdding('') }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* Choix de rémunération, pas règle du produit : rien n'est imposé, l'option reste
          décochée tant qu'un manager ne la retient pas explicitement. */}
      <label className="flex items-start gap-2 text-sm p-2 rounded-xl bg-surface/60 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={!!sub.primeOnAccept}
          onChange={e => { store.setEcosystem({ primeOnAccept: e.target.checked }); toast(e.target.checked ? 'Primes payées à l\'acceptation' : 'Primes payées au passage d\'étape') }} />
        <span>
          <span className="font-semibold">Ne payer la prime qu'une fois le lead accepté</span>
          <span className="block text-[11px] text-muted">
            Facultatif. Décoché, la prime se déclenche au passage d'étape comme aujourd'hui.
            Coché, un lead en attente ou refusé ne génère aucun montant — plus défendable, mais plus exigeant.
          </span>
        </span>
      </label>
    </div>
  )
}

// Délais de re-tentative, motif par motif. Le bon moment de rappeler dépend de la RAISON
// du refus, pas de l'ancienneté : « pas de budget » se retente à l'exercice suivant,
// « mauvais timing » dans un trimestre. Zéro = on ne retente pas.
function RecycleCard({ store, sub }) {
  const delays = store.recycleDelays()
  const motifs = [...new Set([...(sub.lostReasons || []), ...Object.keys(DEFAULT_RECYCLE_DELAYS)])]
  return (
    <div className="card p-4">
      <h3 className="font-bold mb-1">Recyclage des leads perdus</h3>
      <p className="text-xs text-muted mb-3">
        Au moment du refus, le motif fixe la date de re-tentative. L'affaire revient d'elle-même
        dans vos recommandations le jour venu — personne n'a à y penser entre-temps.
      </p>
      <div className="space-y-1.5">
        {motifs.map(m => (
          <div key={m} className="flex items-center justify-between gap-3">
            <span className="text-sm">{m}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <input type="number" min="0" className="input !w-20 !py-1 text-right num"
                value={delays[m] ?? RECYCLE_FALLBACK_DAYS}
                onChange={e => store.setRecycleDelay(m, e.target.value)} />
              <span className="text-xs text-muted w-24">
                {Number(delays[m] ?? RECYCLE_FALLBACK_DAYS) === 0 ? 'jamais' : 'jours après'}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-2.5">
        Un motif que vous ajoutez ensuite est retenté à {RECYCLE_FALLBACK_DAYS} jours par défaut :
        ne rien faire d'un motif inconnu reviendrait à perdre le lead une seconde fois.
      </p>
    </div>
  )
}

// Plans de relance : la séquence de touches que le manager veut voir appliquée. Le produit
// dit quoi faire et quand ; il n'envoie rien — voir le commentaire de `cadenceTasks`.
function CadenceCard({ store, sub }) {
  const list = store.cadences()
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const blank = () => ({ id: uid(), name: '', steps: [{ id: uid(), offset: 0, title: '', note: '' }] })
  const setStep = (i, k, v) => setEditing(c => ({ ...c, steps: c.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }))

  return (
    <div className="card p-4">
      <h3 className="font-bold mb-1">Plans de relance</h3>
      <p className="text-xs text-muted mb-3">
        Une séquence de touches, appliquée à une affaire depuis sa fiche : elle crée les tâches
        aux bonnes dates. <b>Rien n'est envoyé automatiquement</b> — le plan dit quoi faire et
        quand, une personne écrit et envoie.
      </p>

      {list.length === 0 && <Empty text="Aucun plan de relance. Créez-en un pour donner une méthode à votre équipe." />}
      <div className="space-y-1.5">
        {list.map(c => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl border border-line">
            <span className="font-semibold text-sm flex-1">{c.name}</span>
            <span className="text-[11px] text-muted">
              {c.steps.length} touche{c.steps.length > 1 ? 's' : ''} · sur {Math.max(...c.steps.map(s => Number(s.offset) || 0), 0)} jours
            </span>
            <button className="btn-ghost !p-1" title="Modifier" onClick={() => setEditing(JSON.parse(JSON.stringify(c)))}><Pencil size={13} /></button>
            <button className="btn-ghost !p-1 !text-red-500" title="Supprimer" onClick={() => setConfirmDel(c)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button className="btn-ghost !py-1.5 text-sm mt-2" onClick={() => setEditing(blank())}><Plus size={14} /> Nouveau plan</button>

      {editing && (
        <div className="mt-3 rounded-xl border border-line p-3 space-y-2.5">
          <Field label="Nom du plan">
            <input className="input" value={editing.name} onChange={e => setEditing(c => ({ ...c, name: e.target.value }))}
              placeholder="ex : Relance après salon" />
          </Field>
          <div className="space-y-2">
            {editing.steps.map((s, i) => (
              <div key={s.id} className="grid grid-cols-1 sm:grid-cols-[5rem_1fr_auto] gap-2 items-start">
                <label className="text-xs">
                  <span className="block text-muted mb-0.5">J+</span>
                  <input type="number" min="0" className="input !py-1 num" value={s.offset}
                    onChange={e => setStep(i, 'offset', e.target.value)} />
                </label>
                <div className="space-y-1">
                  <input className="input !py-1 text-sm" placeholder="Intitulé de la touche" value={s.title}
                    onChange={e => setStep(i, 'title', e.target.value)} />
                  <input className="input !py-1 text-xs" placeholder="Consigne (facultatif)" value={s.note}
                    onChange={e => setStep(i, 'note', e.target.value)} />
                </div>
                <button className="btn-ghost !p-1 !text-red-500 mt-4" title="Retirer cette touche"
                  disabled={editing.steps.length <= 1}
                  onClick={() => setEditing(c => ({ ...c, steps: c.steps.filter((_, j) => j !== i) }))}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button className="btn-ghost !py-1 text-xs"
            onClick={() => setEditing(c => ({ ...c, steps: [...c.steps, { id: uid(), offset: (Number(c.steps[c.steps.length - 1]?.offset) || 0) + 3, title: '', note: '' }] }))}>
            <Plus size={13} /> Ajouter une touche
          </button>
          <div className="flex gap-2 pt-1">
            <button className="btn-primary !py-1.5 text-sm" disabled={!editing.name.trim() || editing.steps.some(s => !s.title.trim())}
              onClick={() => { store.saveCadence(editing); setEditing(null); toast('Plan de relance enregistré') }}>
              <Save size={14} /> Enregistrer
            </button>
            <button className="btn-ghost !py-1.5 text-sm" onClick={() => setEditing(null)}>Annuler</button>
          </div>
          {editing.steps.some(s => !s.title.trim()) && (
            <p className="text-[11px] text-amber-600">Chaque touche a besoin d'un intitulé : c'est ce qui apparaîtra dans les tâches.</p>
          )}
        </div>
      )}

      {confirmDel && (
        <Confirm message={`Supprimer le plan « ${confirmDel.name} » ? Les tâches déjà créées ne sont pas touchées.`}
          onYes={() => { store.deleteCadence(confirmDel.id); setConfirmDel(null); toast('Plan supprimé') }}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

export default function Ecosystem() {
  const store = useStore()
  const sub = store.sub
  if (!sub) return null
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <Workflow size={20} className="text-brand" /> Créer votre écosystème
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Adaptez le vocabulaire et les règles de BD Report à votre organisation : vos étapes de
          pipeline, ce qui déclenche une prime, et comment elle se rattache à un mois.
        </p>
      </div>
      <Phases store={store} sub={sub} />
      {store.hasModule('handoff') && <HandoffCard store={store} sub={sub} />}
      {store.hasModule('closing') && <ClosingCard store={store} sub={sub} />}
      {store.hasModule('recycling') && <RecycleCard store={store} sub={sub} />}
      {store.hasModule('cadence') && <CadenceCard store={store} sub={sub} />}
      <PayRule store={store} sub={sub} />
      <Bareme store={store} sub={sub} />
      <PrimeRulesCard store={store} sub={sub} />
      <ActivityBaremeCard store={store} sub={sub}
        phaseOptions={(sub.phases && sub.phases.length ? sub.phases : DEFAULT_PHASES)} />
    </div>
  )
}
