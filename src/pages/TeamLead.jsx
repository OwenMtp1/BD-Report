import React, { useMemo, useState } from 'react'
import { TrendingUp, Sun, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { useStore, inTimeline, computePrimes, parseISO, fmtDate, monthKey, todayISO, uid, syncContacts, PHASE_COLORS } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'

const dayISO = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// Dernière activité d'un RDV (dernier événement d'historique, sinon prise de RDV)
const lastActivity = (r) => {
  const h = r.history || []
  return (h.length ? h[h.length - 1].date : '') || r.datePriseRdv || r.createdAt || ''
}

function memberStats(data) {
  const rdvs = data.rdvs || []
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const prisMois = rdvs.filter(r => inTimeline(r.datePriseRdv, 'month')).length
  const sqlMois = rdvs.filter(r => inTimeline(r.datePassageSQL, 'month')).length
  const primes = computePrimes(rdvs, data.bareme)
  const primesMois = primes.filter(p => p.payMonthKey === monthKey(new Date(now.getFullYear(), now.getMonth(), 1))).reduce((a, p) => a + p.montant, 0)
  const projection = Math.round((prisMois / Math.max(1, dayOfMonth)) * daysInMonth)
  const lastPrise = rdvs.map(r => r.datePriseRdv).filter(Boolean).sort().pop() || null
  const daysSinceLast = lastPrise ? Math.floor((now - parseISO(lastPrise)) / 86400000) : null
  const noShows = rdvs.filter(r => (r.opportunite || '').startsWith('No Show')).length
  const noShowRate = rdvs.length ? Math.round((noShows / rdvs.length) * 100) : 0
  const dormant = rdvs.filter(r => r.opportunite === 'En cours' && lastActivity(r) < dayISO(-14))
  return {
    prisMois, sqlMois, primesMois, projection,
    goals: data.goals || {}, daysSinceLast, noShowRate, dormant,
    hier: rdvs.filter(r => r.dateRdv === dayISO(-1)),
    aujourdhui: rdvs.filter(r => r.dateRdv === dayISO(0)),
    sqlSemaine: rdvs.filter(r => inTimeline(r.datePassageSQL, 'week')).length,
  }
}

export default function TeamLead() {
  const store = useStore()
  const envId = store.session.envId
  const members = store.db.subenvs.filter(s => s.envId === envId)
  const stats = useMemo(() => members.map(m => ({ m, s: memberStats(store.db.data[m.id] || { rdvs: [], bareme: [] }) })), [store.db, envId])

  // ---- Réassignation
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [picked, setPicked] = useState(new Set())
  const fromRdvs = (store.db.data[fromId]?.rdvs || []).filter(r => !r.parentId)

  const transfer = () => {
    if (!fromId || !toId || fromId === toId || picked.size === 0) return
    const fromName = members.find(m => m.id === fromId)
    const toName = members.find(m => m.id === toId)
    store.setDb(d => {
      const src = d.data[fromId], dst = d.data[toId]
      const moving = src.rdvs.filter(r => picked.has(r.id) || picked.has(r.parentId))
      src.rdvs = src.rdvs.filter(r => !picked.has(r.id) && !picked.has(r.parentId))
      moving.forEach(r => { dst.rdvs.push(r); syncContacts(dst, r) })
      const log = (data, action) => {
        data.logs = data.logs || []
        data.logs.unshift({ id: uid(), ts: new Date().toISOString(), type: 'Lead', action, details: `${moving.length} RDV — ${fromName?.prenom} → ${toName?.prenom}` })
      }
      log(src, 'Leads réassignés (sortants)')
      log(dst, 'Leads réassignés (entrants)')
      return d
    })
    toast(`${picked.size} lead(s) transféré(s) de ${fromName?.prenom} vers ${toName?.prenom}`)
    setPicked(new Set())
  }

  // ---- Totaux équipe
  const team = stats.reduce((a, { s }) => ({
    pris: a.pris + s.prisMois, sql: a.sql + s.sqlMois, primes: a.primes + s.primesMois,
    proj: a.proj + s.projection, goalPris: a.goalPris + 4 * (Number(s.goals.rdvSemaine) || 0), goalSql: a.goalSql + (Number(s.goals.sqlMois) || 0),
  }), { pris: 0, sql: 0, primes: 0, proj: 0, goalPris: 0, goalSql: 0 })

  // ---- Alertes de dérive
  const alerts = []
  stats.forEach(({ m, s }) => {
    const name = `${m.prenom} ${m.nom}`
    if (s.daysSinceLast === null) alerts.push({ name, text: 'aucun RDV enregistré pour le moment' })
    else if (s.daysSinceLast >= 5) alerts.push({ name, text: `aucun RDV pris depuis ${s.daysSinceLast} jours` })
    if (s.noShowRate >= 30) alerts.push({ name, text: `taux de no-show élevé : ${s.noShowRate} %` })
    if (s.dormant.length >= 3) alerts.push({ name, text: `${s.dormant.length} leads en cours sans activité depuis 14 jours` })
  })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Pilotage équipe <span className="text-sm text-muted font-semibold">({members.length} espaces)</span></h2>

      {/* Alertes de dérive */}
      {alerts.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50/50">
          <h3 className="font-bold mb-2 flex items-center gap-2 text-amber-700"><AlertTriangle size={17} /> Points d'attention</h3>
          <ul className="space-y-1 text-sm">
            {alerts.map((a, i) => <li key={i}><b>{a.name}</b> — {a.text}</li>)}
          </ul>
        </div>
      )}

      {/* Forecast d'équipe */}
      <div className="card p-4 overflow-x-auto">
        <h3 className="font-bold mb-1 flex items-center gap-2"><TrendingUp size={17} className="text-brand" /> Forecast du mois</h3>
        <p className="text-xs text-muted mb-3">Projection de fin de mois au rythme actuel. Objectif RDV mensuel = objectif hebdo × 4.</p>
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-left text-xs text-muted uppercase">
            <th className="py-2">BDR</th><th>RDV pris</th><th>Projection</th><th>SQL</th><th>Primes</th><th>Statut</th>
          </tr></thead>
          <tbody>
            {stats.map(({ m, s }) => {
              const goalMois = 4 * (Number(s.goals.rdvSemaine) || 0)
              const onTrack = goalMois ? s.projection >= goalMois : null
              return (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{m.prenom} {m.nom} <span className="text-xs text-muted font-normal">({m.poste})</span></td>
                  <td>{s.prisMois}{goalMois ? <span className="text-xs text-muted"> / {goalMois}</span> : ''}</td>
                  <td className="font-bold">{s.projection}</td>
                  <td>{s.sqlMois}{s.goals.sqlMois ? <span className="text-xs text-muted"> / {s.goals.sqlMois}</span> : ''}</td>
                  <td>{s.primesMois} €</td>
                  <td>{onTrack === null ? <span className="chip bg-surface text-muted">pas d'objectif</span>
                    : onTrack ? <span className="chip bg-emerald-100 text-emerald-700">✓ en bonne voie</span>
                    : <span className="chip bg-red-100 text-red-700">⚠ en retard</span>}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-line font-extrabold">
              <td className="py-2">Équipe</td>
              <td>{team.pris}{team.goalPris ? <span className="text-xs text-muted font-normal"> / {team.goalPris}</span> : ''}</td>
              <td>{team.proj}</td>
              <td>{team.sql}{team.goalSql ? <span className="text-xs text-muted font-normal"> / {team.goalSql}</span> : ''}</td>
              <td>{team.primes} €</td>
              <td>{team.goalPris ? (team.proj >= team.goalPris
                ? <span className="chip bg-emerald-100 text-emerald-700">✓ quota atteignable</span>
                : <span className="chip bg-red-100 text-red-700">⚠ {Math.max(0, team.goalPris - team.proj)} RDV manquants</span>) : null}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Daily standup */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><Sun size={17} className="text-amber-500" /> Daily Standup</h3>
        <p className="text-xs text-muted mb-3">La lecture de 30 secondes pour animer le stand-up du matin.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {stats.map(({ m, s }) => (
            <div key={m.id} className="rounded-xl bg-surface p-3">
              <div className="font-bold text-sm mb-1.5">{m.prenom} {m.nom}</div>
              <div className="text-xs space-y-1">
                <div>📅 Hier : <b>{s.hier.length}</b> RDV {s.hier.length > 0 && <span className="text-muted">({s.hier.map(r => r.entreprise).join(', ')})</span>}</div>
                <div>🎯 Aujourd'hui : <b>{s.aujourdhui.length}</b> RDV {s.aujourdhui.length > 0 && <span className="text-muted">({s.aujourdhui.map(r => r.entreprise).join(', ')})</span>}</div>
                <div>🔥 SQL cette semaine : <b>{s.sqlSemaine}</b></div>
                <div className={s.dormant.length ? 'text-amber-700' : 'text-muted'}>💤 Leads dormants (14 j+) : <b>{s.dormant.length}</b>{s.dormant.length > 0 && <span> — {s.dormant.slice(0, 3).map(r => r.entreprise).join(', ')}{s.dormant.length > 3 ? '…' : ''}</span>}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Réassignation de leads */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><ArrowRightLeft size={17} className="text-brand" /> Réassigner des leads</h3>
        <p className="text-xs text-muted mb-3">Transférez des RDV (et leurs rendez-vous suivants) d'un espace à un autre — départ, surcharge, redécoupage de territoire. L'opération est tracée dans les logs des deux espaces.</p>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className="input !w-auto text-sm" value={fromId} onChange={e => { setFromId(e.target.value); setPicked(new Set()) }}>
            <option value="">Depuis l'espace de…</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <span className="text-muted">→</span>
          <select className="input !w-auto text-sm" value={toId} onChange={e => setToId(e.target.value)}>
            <option value="">Vers l'espace de…</option>
            {members.filter(m => m.id !== fromId).map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <button className="btn-primary text-xs" disabled={!fromId || !toId || picked.size === 0} onClick={transfer}>
            <ArrowRightLeft size={13} /> Transférer {picked.size > 0 ? `(${picked.size})` : ''}
          </button>
        </div>
        {fromId && (fromRdvs.length === 0 ? <Empty text="Aucun rendez-vous dans cet espace." /> : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {fromRdvs.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={picked.has(r.id)}
                  onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} />
                <span className={`chip ${PHASE_COLORS[r.phase] || 'bg-surface'}`}>{r.phase}</span>
                <span className="font-semibold">{r.entreprise}</span>
                <span className="text-xs text-muted">RDV {fmtDate(r.dateRdv)} · {r.opportunite}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
