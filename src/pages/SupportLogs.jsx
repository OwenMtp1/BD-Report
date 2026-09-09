import React, { useMemo, useState } from 'react'
import { ScrollText, User, Filter, Search, X, Download, Building2, Clock } from 'lucide-react'
import { useStore, STAFF_LOG_CATEGORIES, logCategoryOf } from '../store.jsx'
import { Empty } from '../ui.jsx'

// Journal de l'équipe BD Report.
// Une revue de conformité ne demande pas « qu'est-ce qui s'est passé » mais « qui a fait quoi,
// chez quel client, sur quel compte, et quand ». Chaque question a donc son filtre, et ils se
// combinent — chercher un mot dans les seules actions d'accès d'un collègue sur un client
// donné, un mardi après-midi, doit être possible sans exporter quoi que ce soit.

const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10)
const hourOf = (ts) => new Date(ts).getHours()
const catMeta = (id) => STAFF_LOG_CATEGORIES.find(c => c.id === id) || { label: id, cls: 'bg-surface text-muted' }

function csv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Horodatage', 'Catégorie', 'Type', 'Acteur', 'Action', 'Détails', 'Client impacté', 'Utilisateur impacté']
  const lines = rows.map(l => [fmtTs(l.ts), catMeta(logCategoryOf(l)).label, l.type, l.actorName, l.action, l.details, l.envName, l.targetName].map(esc).join(';'))
  return [head.map(esc).join(';'), ...lines].join('\n')
}

export default function SupportLogs() {
  const store = useStore()
  const me = store.account
  // Le fondateur voit l'équipe entière ; un membre du staff voit ce qu'il a fait lui-même.
  // Cette limite protège la vie privée d'un collègue autant qu'elle évite les règlements de compte.
  const isFounder = me.role === 'Fondateur'

  const all = useMemo(() => {
    const l = store.db.supportLogs || []
    return isFounder ? l : l.filter(x => x.actorId === me.id)
  }, [store.db.supportLogs, isFounder, me.id])

  const [cat, setCat] = useState('')
  const [actor, setActor] = useState('')
  const [envId, setEnvId] = useState('')
  const [target, setTarget] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [hFrom, setHFrom] = useState('')
  const [hTo, setHTo] = useState('')

  const actors = useMemo(() => [...new Set(all.map(l => l.actorName).filter(Boolean))].sort(), [all])
  const envs = useMemo(() => {
    const m = new Map()
    all.forEach(l => { if (l.envId) m.set(l.envId, l.envName || l.envId) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [all])
  const targets = useMemo(() => [...new Set(all.map(l => l.targetName).filter(Boolean))].sort(), [all])

  const logs = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return all.filter(l => {
      if (cat && logCategoryOf(l) !== cat) return false
      if (actor && l.actorName !== actor) return false
      if (envId && l.envId !== envId) return false
      if (target && l.targetName !== target) return false
      const d = dayOf(l.ts)
      if (from && d < from) return false
      if (to && d > to) return false
      // Plage horaire : « qui travaillait en dehors des heures » est une question de revue
      // à part entière, et elle ne se répond pas avec un filtre par jour.
      if (hFrom !== '' || hTo !== '') {
        const h = hourOf(l.ts)
        if (hFrom !== '' && h < Number(hFrom)) return false
        if (hTo !== '' && h > Number(hTo)) return false
      }
      if (ql && ![l.action, l.details, l.actorName, l.envName, l.targetName, l.type].some(v => (v || '').toLowerCase().includes(ql))) return false
      return true
    })
  }, [all, cat, actor, envId, target, q, from, to, hFrom, hTo])

  const active = !!(cat || actor || envId || target || q || from || to || hFrom !== '' || hTo !== '')
  const reset = () => { setCat(''); setActor(''); setEnvId(''); setTarget(''); setQ(''); setFrom(''); setTo(''); setHFrom(''); setHTo('') }

  const exportCsv = () => {
    const blob = new Blob(['﻿' + csv(logs)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `journal-bdreport-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Répartition par catégorie sur le résultat courant : donne l'allure du filtre appliqué.
  const counts = useMemo(() => {
    const m = {}
    logs.forEach(l => { const c = logCategoryOf(l); m[c] = (m[c] || 0) + 1 })
    return m
  }, [logs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2"><ScrollText size={20} className="text-brand" /> Journal de l'équipe</h2>
          <p className="text-xs text-muted -mt-0.5">
            {isFounder
              ? "Toutes les actions de l'équipe BD Report : écrans consultés, accès accordés ou retirés, interventions chez les clients."
              : 'Votre activité. Le journal complet de l\'équipe est réservé au fondateur.'}
          </p>
        </div>
        <button className="btn-ghost text-xs" onClick={exportCsv} disabled={logs.length === 0}><Download size={14} /> Exporter en CSV</button>
      </div>

      {/* Catégories : cliquables, elles cadrent la lecture avant même de filtrer plus finement. */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setCat('')}
          className={`chip cursor-pointer ${!cat ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}>
          Tout ({all.length})
        </button>
        {STAFF_LOG_CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}
            className={`chip cursor-pointer ${cat === c.id ? 'bg-brand text-white' : `${c.cls} opacity-90`}`}>
            {c.label}{counts[c.id] ? ` (${counts[c.id]})` : ''}
          </button>
        ))}
      </div>

      <div className="card p-3 space-y-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 rounded-lg bg-surface border border-line px-2 flex-1 min-w-[220px]">
            <Search size={14} className="text-muted shrink-0" />
            <input className="input !py-1.5 border-0 !bg-transparent text-sm" placeholder="Mot-clé dans l'action, le détail, le client…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {isFounder && (
            <select className="input !w-auto !py-1.5" value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">Tous les membres</option>
              {actors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <select className="input !w-auto !py-1.5" value={envId} onChange={e => setEnvId(e.target.value)}>
            <option value="">Tous les clients</option>
            {envs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="input !w-auto !py-1.5" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Tous les utilisateurs impactés</option>
            {targets.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-muted" />
          <span className="text-muted">Du</span>
          <input type="date" className="input !w-auto !py-1" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-muted">au</span>
          <input type="date" className="input !w-auto !py-1" value={to} onChange={e => setTo(e.target.value)} />
          <span className="text-muted flex items-center gap-1 ml-2"><Clock size={13} /> entre</span>
          <select className="input !w-auto !py-1" value={hFrom} onChange={e => setHFrom(e.target.value)}>
            <option value="">—</option>
            {[...Array(24)].map((_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h</option>)}
          </select>
          <span className="text-muted">et</span>
          <select className="input !w-auto !py-1" value={hTo} onChange={e => setHTo(e.target.value)}>
            <option value="">—</option>
            {[...Array(24)].map((_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h</option>)}
          </select>
          {active && <button className="btn-ghost !py-1 text-xs" onClick={reset}><X size={13} /> Réinitialiser</button>}
          <span className="text-muted ml-auto">{logs.length} entrée{logs.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {logs.length === 0 ? <Empty text={active ? 'Aucune entrée ne correspond à ces filtres.' : 'Aucune action journalisée pour le moment.'} /> : (
        <div className="card divide-y divide-line">
          {logs.slice(0, 600).map(l => {
            const c = catMeta(logCategoryOf(l))
            return (
              <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-sm flex-wrap">
                <span className="text-xs text-muted w-28 shrink-0">{fmtTs(l.ts)}</span>
                <span className={`chip shrink-0 ${c.cls}`}>{c.label}</span>
                <span className="flex-1 min-w-[180px]">
                  <span className="font-semibold">{l.action}</span>
                  {l.details && <span className="text-muted"> — {l.details}</span>}
                  {(l.envName || l.targetName) && (
                    <span className="block text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                      {l.envName && <span className="flex items-center gap-1"><Building2 size={11} /> {l.envName}</span>}
                      {l.targetName && <span className="flex items-center gap-1"><User size={11} /> {l.targetName}</span>}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted flex items-center gap-1 shrink-0"><User size={11} /> {l.actorName}</span>
              </div>
            )
          })}
          {logs.length > 600 && <div className="px-4 py-2 text-xs text-muted">600 entrées affichées sur {logs.length} — affinez les filtres ou exportez en CSV.</div>}
        </div>
      )}
    </div>
  )
}
