import React, { useState } from 'react'
import { Clock, Building2, Users, UserRound, MessageSquare } from 'lucide-react'
import { useStore, parseISO, fmtDate, applyRdvAutomations, OPP_COLORS, PHASE_COLORS, phaseColor, oppColor, companyKey } from '../store.jsx'
import { Modal, Empty, toast, confetti } from '../ui.jsx'
import { openCompany } from './Company.jsx'

const recentDate = (r) => r.dateRdv || r.datePriseRdv || r.createdAt || ''

// Regroupe les RDV par entreprise (clé insensible à la casse/espaces) : une entreprise = une carte unique.
function groupByCompany(rdvs) {
  const map = {}
  rdvs.forEach(r => {
    const key = companyKey(r.entreprise) || 'sans nom'
    map[key] = map[key] || { entreprise: (r.entreprise || 'Sans nom').trim(), key, rdvs: [] }
    map[key].rdvs.push(r)
  })
  return Object.values(map).map(g => {
    // Le RDV le plus récent représente l'état actuel de l'entreprise dans le pipeline.
    const rep = [...g.rdvs].sort((a, b) => recentDate(b).localeCompare(recentDate(a)))[0]
    const starts = g.rdvs.map(r => r.datePriseRdv || r.createdAt).filter(Boolean).sort()
    // Dernière activité = dernier événement d'historique de toute la famille
    const activities = g.rdvs.flatMap(r => (r.history || []).map(h => h.date)).filter(Boolean).sort()
    const lastDate = activities.length ? activities[activities.length - 1] : (starts[starts.length - 1] || rep.createdAt)
    // Date de fermeture = date du passage en statut clos (Gagnée/Perdue/Signée), sinon vide (lead ouvert)
    const closed = ['Gagnée', 'Perdue', 'Signée'].includes(rep.opportunite) || ['Signée', 'KO'].includes(rep.phase)
    const closeDate = closed ? (rep.history?.length ? rep.history[rep.history.length - 1].date : rep.dateRdv) : ''
    return { ...g, rep, owner: rep._owner || '', opportunite: rep.opportunite, firstDate: starts[0] || rep.createdAt, lastDate, closeDate }
  })
}

function companyLifeDays(group) {
  const start = parseISO(group.firstDate)
  if (!start) return 0
  const closed = ['Gagnée', 'Perdue', 'Signée'].includes(group.opportunite)
  let end = new Date()
  if (closed && group.rep.history?.length) {
    end = parseISO(group.rep.history[group.rep.history.length - 1].date) || end
  }
  return Math.max(0, Math.round((end - start) / 86400000))
}

function TimelineDetail({ group, onClose }) {
  // Fusionne l'historique de tous les RDV de l'entreprise, trié par date.
  const events = [{ value: 'Lead créé', date: group.firstDate }]
  group.rdvs.forEach(r => (r.history || []).forEach(h => events.push({ value: `${h.value} (${r.phase === h.value ? 'phase' : h.type})`, date: h.date })))
  const sorted = events.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date))
  const rows = sorted.map((e, i) => {
    const next = sorted[i + 1]
    const d1 = parseISO(e.date)
    const d2 = next ? parseISO(next.date) : new Date()
    const days = d1 && d2 ? Math.max(0, Math.round((d2 - d1) / 86400000)) : 0
    return { ...e, days, last: !next }
  })
  const closed = ['Gagnée', 'Perdue', 'Signée'].includes(group.opportunite)
  return (
    <Modal title={`Timeline — ${group.entreprise}`} onClose={onClose}>
      <p className="text-sm text-muted mb-4">
        {closed ? 'Lead clôturé' : `Actif depuis ${companyLifeDays(group)} jour(s)`} · {group.rdvs.length} rendez-vous
      </p>
      <div className="space-y-0">
        {rows.map((e, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-brand mt-1" />
              {!e.last && <div className="w-0.5 flex-1 bg-line" />}
            </div>
            <div className="pb-5">
              <div className="font-bold text-sm">{e.value}</div>
              <div className="text-xs text-muted">
                {fmtDate(e.date)} — {e.last ? (closed ? 'étape finale' : `depuis ${e.days} jour(s)`) : `pendant ${e.days} jour(s)`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default function Leads() {
  const store = useStore()
  const sub = store.sub
  const [detail, setDetail] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [scope, setScope] = useState('me') // 'me' = mon pipeline | 'org' = pipeline entreprise (partagé)
  // Filtres : propriétaire + plages de dates (ouverture / fermeture / dernière activité)
  const [fOwner, setFOwner] = useState('')
  const [fOpen, setFOpen] = useState({ start: '', end: '' })
  const [fClose, setFClose] = useState({ start: '', end: '' })
  const [fActivity, setFActivity] = useState({ start: '', end: '' })

  const cols = sub.opportunites // le kanban se met à jour avec chaque nouveau statut créé

  // Vue entreprise : agrège les RDV de tous les espaces de l'environnement, avec leur propriétaire.
  const envSubs = store.db.subenvs.filter(s => s.envId === store.session.envId)
  const orgRdvs = envSubs.flatMap(s => (store.db.data[s.id]?.rdvs || []).map(r => ({ ...r, _owner: `${s.prenom} ${s.nom}` })))
  const ownerOptions = [...new Set(envSubs.map(s => `${s.prenom} ${s.nom}`))]
  const inRange = (d, range) => {
    if (!range.start && !range.end) return true
    if (!d) return false
    if (range.start && d < range.start) return false
    if (range.end && d > range.end) return false
    return true
  }
  const allGroups = groupByCompany(scope === 'me' ? sub.rdvs : orgRdvs)
  const groups = allGroups.filter(g =>
    (!fOwner || g.owner === fOwner) &&
    inRange(g.firstDate, fOpen) &&
    (fClose.start || fClose.end ? inRange(g.closeDate, fClose) : true) &&
    inRange(g.lastDate, fActivity))
  const hasFilter = fOwner || fOpen.start || fOpen.end || fClose.start || fClose.end || fActivity.start || fActivity.end

  const drop = (opp) => {
    if (!dragKey || scope === 'org') { setDragKey(null); return }
    // Le RDV représentatif est résolu hors de l'updater pour éviter tout double effet (StrictMode).
    const group = groupByCompany(sub.rdvs).find(g => g.key === dragKey)
    if (group && group.rep.opportunite !== opp) {
      store.setSub(d => {
        const r = d.rdvs.find(x => x.id === group.rep.id)
        if (r) Object.assign(r, applyRdvAutomations(r, { opportunite: opp }))
        return d
      })
      store.logAction('Lead', 'Statut déplacé (kanban)', `${group.entreprise} → ${opp}`)
      if (opp === 'Signée') { confetti(); toast(`🎉 Signature ! Bravo pour ${group.entreprise} 🏆`) }
      else toast(opp === 'Perdue' ? `${group.entreprise} → Perdue — pensez à renseigner le motif (menu ⋯ dans Mes RDV)`
        : opp.startsWith('No Show') ? `${group.entreprise} → ${opp} — pensez à renseigner la raison`
        : `${group.entreprise} → ${opp}`)
    }
    setDragKey(null)
  }

  // Drag & drop tactile : suit le doigt et dépose sur la colonne sous le point de contact.
  const touchDrop = (e) => {
    if (!dragKey) return
    const t = e.changedTouches?.[0]
    if (!t) { setDragKey(null); return }
    const el = document.elementFromPoint(t.clientX, t.clientY)
    const col = el?.closest?.('[data-opp]')
    if (col) drop(col.getAttribute('data-opp'))
    else setDragKey(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Leads — Pipeline</h2>
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${scope === 'me' ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
            onClick={() => setScope('me')}><UserRound size={13} /> Mon pipeline</button>
          <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${scope === 'org' ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
            onClick={() => setScope('org')}><Users size={13} /> Pipeline entreprise</button>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        {scope === 'me'
          ? "Une carte = une entreprise (pas de doublon). Glissez-déposez pour changer son statut d'opportunité."
          : 'Vue partagée de toute l\'organisation (lecture). Ouvrez une fiche entreprise pour laisser un commentaire visible par tous les membres.'}
      </p>

      <div className="card p-3 flex items-end gap-3 flex-wrap text-xs">
        {scope === 'org' && (
          <div>
            <span className="label">Propriétaire du lead</span>
            <select className="input !w-auto !py-1.5" value={fOwner} onChange={e => setFOwner(e.target.value)}>
              <option value="">Tous</option>
              {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        {[['Date d\'ouverture', fOpen, setFOpen], ['Date de fermeture', fClose, setFClose], ['Dernière activité', fActivity, setFActivity]].map(([label, val, setter]) => (
          <div key={label}>
            <span className="label">{label}</span>
            <div className="flex items-center gap-1">
              <input type="date" className="input !w-auto !py-1.5" value={val.start} onChange={e => setter(v => ({ ...v, start: e.target.value }))} />
              <span className="text-muted">→</span>
              <input type="date" className="input !w-auto !py-1.5" value={val.end} onChange={e => setter(v => ({ ...v, end: e.target.value }))} />
            </div>
          </div>
        ))}
        {hasFilter && <button className="text-brand underline pb-2" onClick={() => { setFOwner(''); setFOpen({ start: '', end: '' }); setFClose({ start: '', end: '' }); setFActivity({ start: '', end: '' }) }}>Réinitialiser</button>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map(opp => {
          const cards = groups.filter(g => g.opportunite === opp)
          return (
            <div key={opp} data-opp={opp} className="kanban-col flex-1 rounded-2xl bg-surface/80 border border-line p-2.5"
              onDragOver={e => e.preventDefault()} onDrop={() => drop(opp)}>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className={`chip ${oppColor(opp)}`}>{opp}</span>
                <span className="text-xs font-bold text-muted">{cards.length}</span>
              </div>
              <div className="space-y-2 min-h-[6rem]">
                {cards.length === 0 && <div className="text-xs text-muted text-center py-4">—</div>}
                {cards.map(g => {
                  const nbComments = store.companyComments(g.entreprise).length
                  return (
                    <div key={g.key} draggable={scope === 'me'} onDragStart={() => setDragKey(g.key)} onDragEnd={() => setDragKey(null)}
                      onTouchStart={() => scope === 'me' && setDragKey(g.key)} onTouchEnd={touchDrop}
                      className={`card !rounded-xl p-3 ${scope === 'me' ? 'cursor-grab active:cursor-grabbing touch-none' : ''} ${dragKey === g.key ? 'dragging' : ''}`}>
                      <button className="font-bold text-sm flex items-center gap-1.5 hover:text-brand hover:underline" title="Ouvrir la fiche entreprise"
                        onClick={() => openCompany(g.entreprise)}><Building2 size={13} className="text-muted shrink-0" /> {g.entreprise}</button>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`chip ${phaseColor(g.rep.phase)}`}>{g.rep.phase}</span>
                        {g.rdvs.length > 1 && <span className="chip bg-surface text-muted">{g.rdvs.length} RDV</span>}
                        {scope === 'org' && g.rep._owner && <span className="chip bg-brand/10 text-brand">{g.rep._owner}</span>}
                        {nbComments > 0 && <span className="chip bg-amber-100 text-amber-700 flex items-center gap-0.5"><MessageSquare size={10} /> {nbComments}</span>}
                      </div>
                      <button className="flex items-center gap-1 text-xs text-brand font-semibold mt-2 hover:underline" onClick={() => setDetail(g)}>
                        <Clock size={12} /> Actif depuis {companyLifeDays(g)} j
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {groups.length === 0 && <Empty text="Aucun lead. Créez un rendez-vous pour alimenter le pipeline." />}
      {detail && <TimelineDetail group={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
