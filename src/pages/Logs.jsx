import React, { useState } from 'react'
import { ScrollText, Trash2, Download, Search } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

const TYPE_COLORS = {
  RDV: 'bg-blue-100 text-blue-700', Note: 'bg-amber-100 text-amber-700',
  Contact: 'bg-emerald-100 text-emerald-700', Prime: 'bg-yellow-100 text-yellow-700',
  Lead: 'bg-purple-100 text-purple-700', 'Paramètres': 'bg-gray-200 text-gray-600',
  Connexion: 'bg-sky-100 text-sky-700', 'Données': 'bg-rose-100 text-rose-700',
}

// Un journal d'audit ne vaut que si on peut y chercher et le sortir de l'outil :
// c'est exactement ce qu'on demande en revue de conformité — « montrez-moi qui a
// touché à quoi entre telle et telle date ».
function toCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Horodatage', 'Tâche', 'Action', 'Détails'].join(';')
  const body = rows.map(l => [l.ts, l.type, l.action, l.details].map(esc).join(';'))
  return [head, ...body].join('\n')
}

export default function Logs() {
  const store = useStore()
  const logs = store.sub.logs || []
  const [fType, setFType] = useState('')
  const [fStart, setFStart] = useState('')
  const [fEnd, setFEnd] = useState('')
  const [q, setQ] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const types = [...new Set(logs.map(l => l.type))]
  const ql = q.trim().toLowerCase()
  const filtered = logs.filter(l => {
    if (fType && l.type !== fType) return false
    const day = l.ts.slice(0, 10)
    if (fStart && day < fStart) return false
    if (fEnd && day > fEnd) return false
    if (ql && !`${l.type} ${l.action} ${l.details}`.toLowerCase().includes(ql)) return false
    return true
  })

  // L'export suit ce qui est à l'écran : ce qu'on voit est ce qu'on remet.
  const exportCSV = () => {
    if (!filtered.length) { toast('Rien à exporter avec ces filtres.'); return }
    const blob = new Blob(['\ufeff' + toCSV(filtered)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast(`${filtered.length} entrée(s) exportée(s)`)
  }

  const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><ScrollText size={20} className="text-brand" /> Logs <span className="text-sm text-muted font-semibold">({filtered.length})</span></h2>
        <div className="flex items-center gap-2">
          {logs.length > 0 && <button className="btn-ghost text-xs" onClick={exportCSV}><Download size={13} /> Exporter en CSV</button>}
          {logs.length > 0 && <button className="btn-ghost text-xs text-red-500" onClick={() => setConfirmClear(true)}><Trash2 size={13} /> Vider le journal</button>}
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">Traçabilité de toutes les actions effectuées dans votre espace.</p>

      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <select className="input !w-auto !py-1.5" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">Tâche : toutes</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-muted">Du</span>
        <input type="date" className="input !w-auto !py-1.5" value={fStart} onChange={e => setFStart(e.target.value)} />
        <span className="text-muted">au</span>
        <input type="date" className="input !w-auto !py-1.5" value={fEnd} onChange={e => setFEnd(e.target.value)} />
        <div className="flex items-center gap-1.5 rounded-lg bg-card border border-line px-2 flex-1 min-w-[180px]">
          <Search size={13} className="text-muted shrink-0" />
          <input className="input !py-1.5 border-0 !bg-transparent text-xs" placeholder="Rechercher dans les actions et les détails…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {(fType || fStart || fEnd || q) && <button className="text-brand underline" onClick={() => { setFType(''); setFStart(''); setFEnd(''); setQ('') }}>Réinitialiser</button>}
      </div>

      {filtered.length === 0 ? <Empty text="Aucune action enregistrée sur ces critères." /> : (
        <div className="card divide-y divide-line">
          {filtered.slice(0, 200).map(l => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="text-xs text-muted font-mono w-28 shrink-0">{fmtTs(l.ts)}</span>
              <span className={`chip shrink-0 ${TYPE_COLORS[l.type] || 'bg-surface text-ink'}`}>{l.type}</span>
              <span className="font-semibold">{l.action}</span>
              {l.details && <span className="text-xs text-muted truncate">— {l.details}</span>}
            </div>
          ))}
          {filtered.length > 200 && <p className="text-xs text-muted text-center py-2">… {filtered.length - 200} entrées plus anciennes (affinez les filtres)</p>}
        </div>
      )}

      {confirmClear && (
        <Confirm message="Vider tout le journal d'audit ?"
          onYes={() => { store.setSub(d => ({ ...d, logs: [] })); setConfirmClear(false) }}
          onNo={() => setConfirmClear(false)} />
      )}
    </div>
  )
}
