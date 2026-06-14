import React, { useState } from 'react'
import { ScrollText, User, Filter } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty } from '../ui.jsx'

const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

const TYPE_CLASS = {
  Ticket: 'bg-blue-100 text-blue-700',
  Demande: 'bg-amber-100 text-amber-700',
  Client: 'bg-emerald-100 text-emerald-700',
  Abonnement: 'bg-red-100 text-red-700',
}

export default function SupportLogs() {
  const store = useStore()
  const me = store.account
  const isFounder = me.role === 'Fondateur'
  const [fType, setFType] = useState('')
  const [fActor, setFActor] = useState('')

  // Le fondateur voit les logs de toute l'équipe support ; un support voit ses propres logs.
  let logs = (store.db.supportLogs || [])
  if (!isFounder) logs = logs.filter(l => l.actorId === me.id)
  if (fType) logs = logs.filter(l => l.type === fType)
  if (fActor) logs = logs.filter(l => l.actorName === fActor)

  const types = [...new Set((store.db.supportLogs || []).map(l => l.type))]
  const actors = isFounder ? [...new Set((store.db.supportLogs || []).map(l => l.actorName))] : []

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold flex items-center gap-2"><ScrollText size={20} className="text-brand" /> Logs Support</h2>
      <p className="text-xs text-muted -mt-2">
        {isFounder
          ? "Journal de toute l'activité du support (tous les membres support et fondateurs)."
          : 'Journal de votre activité de support.'}
      </p>

      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <Filter size={14} className="text-muted" />
        <select className="input !w-auto !py-1.5" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">Tous les types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {isFounder && (
          <select className="input !w-auto !py-1.5" value={fActor} onChange={e => setFActor(e.target.value)}>
            <option value="">Tous les acteurs</option>
            {actors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <span className="text-muted ml-auto">{logs.length} entrée{logs.length > 1 ? 's' : ''}</span>
      </div>

      {logs.length === 0 ? <Empty text="Aucun log pour le moment." /> : (
        <div className="card divide-y divide-line">
          {logs.slice(0, 500).map(l => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-xs text-muted w-28 shrink-0">{fmtTs(l.ts)}</span>
              <span className={`chip shrink-0 ${TYPE_CLASS[l.type] || 'bg-surface text-muted'}`}>{l.type}</span>
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{l.action}</span>
                {l.details && <span className="text-muted"> — {l.details}</span>}
              </span>
              <span className="text-xs text-muted flex items-center gap-1 shrink-0"><User size={11} /> {l.actorName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
