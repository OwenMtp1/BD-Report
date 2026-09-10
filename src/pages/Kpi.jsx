import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore, computePrimes, primeOpts, inTimeline, fmtMoney, uid, SOURCES } from '../store.jsx'
import { TimelinePicker, Empty } from '../ui.jsx'

const METRICS = [
  { id: 'rdv', label: 'Nb RDV réalisés' },
  { id: 'pris', label: 'Nb RDV pris' },
  { id: 'mql', label: 'Nb MQL' },
  { id: 'sql', label: 'Nb SQL' },
  { id: 'sign', label: 'Nb Signatures' },
  { id: 'primes', label: 'Primes (€)' },
  { id: 'conv', label: 'Taux RDV → SQL' },
]

function metricValue(data, metric, tl, custom, source) {
  let rdvs = data.rdvs.filter(r => inTimeline(r.dateRdv || r.datePriseRdv, tl, custom))
  if (source) rdvs = rdvs.filter(r => r.source === source)
  switch (metric) {
    case 'rdv': return rdvs.length
    case 'pris': return data.rdvs.filter(r => inTimeline(r.datePriseRdv, tl, custom) && (!source || r.source === source)).length
    // Jalons lus dans les réglages de l'espace : une équipe qui renomme ses étapes garde ses chiffres.
    case 'mql': return rdvs.filter(r => phaseAtLeast(data, r.phase, qualifyPhase(data))).length
    case 'sql': return rdvs.filter(r => phaseAtLeast(data, r.phase, milestonePhase(data))).length
    case 'sign': return rdvs.filter(r => isWonPhase(data, r.phase)).length
    case 'primes': return fmtMoney(computePrimes(rdvs, data.bareme, primeOpts(data)).reduce((a, p) => a + p.montant, 0), data.currency || 'EUR')
    case 'conv': {
      const sql = rdvs.filter(r => phaseAtLeast(data, r.phase, milestonePhase(data))).length
      return rdvs.length ? Math.round((sql / rdvs.length) * 100) + '%' : '—'
    }
    default: return '—'
  }
}

// `embedded` : rendu comme section de « Pilotage équipe » plutôt que comme page.
export default function Kpi({ embedded }) {
  const store = useStore()
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const subs = store.db.subenvs.filter(s => s.envId === session.envId)
  const sheets = env?.kpiSheets || []
  const setSheets = (s) => store.updateEnv(env.id, { kpiSheets: s })

  const [newName, setNewName] = useState('')

  const addSheet = () => {
    setSheets([...sheets, {
      id: uid(), name: newName || `Tableur ${sheets.length + 1}`,
      profiles: subs.map(s => s.id), metrics: ['rdv', 'sql', 'primes'],
      tl: 'year', custom: {}, source: '',
    }])
    setNewName('')
  }
  const patch = (id, p) => setSheets(sheets.map(s => s.id === id ? { ...s, ...p } : s))

  return (
    <div className="space-y-4">
      {!embedded && <h2 className="text-xl font-extrabold">KPI Entreprise</h2>}
      <p className="text-sm text-muted -mt-2">Créez des tableurs croisant les données de plusieurs profils de l'environnement.</p>
      <div className="card p-3 flex items-center gap-2">
        <input className="input !w-64" placeholder="Nom du tableur" value={newName} onChange={e => setNewName(e.target.value)} />
        <button className="btn-primary" onClick={addSheet}><Plus size={15} /> Créer un tableur</button>
      </div>
      {sheets.length === 0 && <Empty text="Aucun tableur. Créez-en un pour croiser les données des profils." />}
      {sheets.map(sheet => (
        <div key={sheet.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <input className="font-bold bg-transparent outline-none border-b border-transparent focus:border-line" value={sheet.name}
              onChange={e => patch(sheet.id, { name: e.target.value })} />
            <div className="flex items-center gap-2 flex-wrap">
              <select className="input !w-auto !py-1 text-xs" value={sheet.source} onChange={e => patch(sheet.id, { source: e.target.value })}>
                <option value="">Sources : toutes</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <TimelinePicker value={sheet.tl} onChange={v => patch(sheet.id, { tl: v })} custom={sheet.custom} onCustomChange={c => patch(sheet.id, { custom: c })} />
              <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" onClick={() => setSheets(sheets.filter(s => s.id !== sheet.id))}><Trash2 size={15} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="label !mb-0 self-center">Profils :</span>
            {subs.map(s => (
              <label key={s.id} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={sheet.profiles.includes(s.id)}
                  onChange={e => patch(sheet.id, { profiles: e.target.checked ? [...sheet.profiles, s.id] : sheet.profiles.filter(x => x !== s.id) })} />
                {s.prenom} {s.nom}
              </label>
            ))}
            <span className="label !mb-0 self-center ml-4">Variables :</span>
            {METRICS.map(m => (
              <label key={m.id} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={sheet.metrics.includes(m.id)}
                  onChange={e => patch(sheet.id, { metrics: e.target.checked ? [...sheet.metrics, m.id] : sheet.metrics.filter(x => x !== m.id) })} />
                {m.label}
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead><tr className="text-left text-xs text-muted uppercase">
                <th className="py-2">Profil</th>
                {sheet.metrics.map(m => <th key={m}>{METRICS.find(x => x.id === m)?.label}</th>)}
              </tr></thead>
              <tbody>
                {subs.filter(s => sheet.profiles.includes(s.id)).map(s => {
                  const data = store.db.data[s.id]
                  if (!data) return null
                  return (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-2 font-semibold">{s.prenom} {s.nom} <span className="text-muted text-xs">({s.poste})</span></td>
                      {sheet.metrics.map(m => <td key={m} className="font-bold">{metricValue(data, m, sheet.tl, sheet.custom, sheet.source)}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
