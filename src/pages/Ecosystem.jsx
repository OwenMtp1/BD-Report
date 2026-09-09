import React, { useState } from 'react'
import {
  Workflow, Plus, Trash2, Pencil, Check, X, Coins, CalendarClock, AlertTriangle,
  ChevronUp, ChevronDown, Save,
} from 'lucide-react'
import { useStore, uid, DEFAULT_PHASES, DEFAULT_PRIME_CUTOFF, fmtMoney } from '../store.jsx'
import { Confirm, Field, toast } from '../ui.jsx'

// « Créer votre écosystème » : le manager compose ici le vocabulaire de son équipe —
// les étapes de son pipeline — et les règles qui transforment une étape en prime.
// Ces réglages touchent des montants versés : chaque bloc s'enregistre explicitement.

function Phases({ store, sub }) {
  const phases = sub.phases || DEFAULT_PHASES
  const primePhases = sub.primePhases || []
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
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" title="Un passage à cette étape déclenche le calcul d'une prime">
                    <input type="checkbox" checked={triggers}
                      onChange={e => {
                        const next = e.target.checked ? [...primePhases, p] : primePhases.filter(x => x !== p)
                        store.setEcosystem({ primePhases: next })
                      }} />
                    déclenche une prime
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
      <PayRule store={store} sub={sub} />
      <Bareme store={store} sub={sub} />
    </div>
  )
}
