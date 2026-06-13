import React, { useState } from 'react'
import { CalendarClock, Flame, RotateCcw, Phone, Mail, ExternalLink, Building2 } from 'lucide-react'
import { useStore, parseISO, fmtDate, applyRdvAutomations, PHASE_COLORS, phaseColor } from '../store.jsx'
import { Empty } from '../ui.jsx'

// Date à laquelle un RDV est passé "Perdu" (depuis l'historique), sinon sa date de RDV.
function lostDate(r) {
  const ev = [...(r.history || [])].reverse().find(h => h.value === 'Perdue' || h.value === 'KO')
  return ev?.date || r.dateRdv || r.datePriseRdv || r.createdAt
}

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

function TaskCard({ r, tone, action, store }) {
  const contact = r.contacts?.[0]
  return (
    <div className="card p-3 flex items-center gap-3 fade-in">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm flex items-center gap-1.5"><Building2 size={13} className="text-muted shrink-0" /> {r.entreprise || 'Sans nom'}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted">
          <span className={`chip ${phaseColor(r.phase)}`}>{r.phase}</span>
          {contact?.nom && <span>{contact.nom}{contact.poste ? ` · ${contact.poste}` : ''}</span>}
          <span>RDV : {fmtDate(r.dateRdv)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {contact?.tel && <a href={`tel:${contact.tel}`} className="p-2 rounded-lg hover:bg-surface text-muted" title={contact.tel}><Phone size={15} /></a>}
        {contact?.email && <a href={`mailto:${contact.email}`} className="p-2 rounded-lg hover:bg-surface text-muted" title={contact.email}><Mail size={15} /></a>}
        {r.linkedin && <a href={r.linkedin} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-surface text-muted" title="LinkedIn"><ExternalLink size={15} /></a>}
        <button className={`btn text-xs ${tone}`} onClick={action}>{action.label}</button>
      </div>
    </div>
  )
}

function Section({ icon, title, desc, count, color, children }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
        <div className="flex-1">
          <h3 className="font-bold">{title} <span className="text-muted font-semibold">({count})</span></h3>
          <p className="text-xs text-muted">{desc}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export default function Tasks() {
  const store = useStore()
  const sub = store.sub
  const [lostFilter, setLostFilter] = useState('6m') // défaut : perdues depuis 6 mois minimum
  const [custom, setCustom] = useState({ start: '', end: '' })

  const patch = (id, p) => store.setSub(d => {
    const r = d.rdvs.find(x => x.id === id)
    if (r) Object.assign(r, applyRdvAutomations(r, p))
    return d
  })

  // 1 — R1 No Show à replanifier
  const noShows = sub.rdvs.filter(r => r.opportunite === 'No Show R1')
  // 2 — Opportunités en cours à traiter (les plus anciennes d'abord)
  const enCours = sub.rdvs.filter(r => r.opportunite === 'En cours')
    .sort((a, b) => (a.dateRdv || '').localeCompare(b.dateRdv || ''))
  // 3 — Opportunités perdues à relancer, filtrées par ancienneté
  const lost = sub.rdvs.filter(r => r.opportunite === 'Perdue').filter(r => {
    const d = parseISO(lostDate(r))
    if (!d) return false
    if (lostFilter === '6m') return d <= monthsAgo(6)
    if (lostFilter === '1y') return d <= monthsAgo(12)
    if (lostFilter === 'custom') {
      if (custom.start && d < parseISO(custom.start)) return false
      if (custom.end && d > parseISO(custom.end)) return false
      return !!(custom.start || custom.end)
    }
    return true
  }).sort((a, b) => lostDate(a).localeCompare(lostDate(b)))

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Recommandations prioritaires</h2>
      <p className="text-xs text-muted -mt-2">Vos recommandations d'actions classées par priorité : d'abord les no-shows à replanifier, puis les opportunités en cours, enfin les leads perdus à relancer.</p>

      <Section icon={<CalendarClock size={18} className="text-orange-600" />} color="bg-orange-100"
        title="No Show R1 à replanifier" desc="Rendez-vous manqués : reprogrammez un nouveau créneau." count={noShows.length}>
        {noShows.length === 0 ? <Empty text="Aucun no-show à replanifier." />
          : noShows.map(r => <TaskCard key={r.id} r={r} store={store} tone="bg-orange-500 text-white hover:bg-orange-600"
            action={Object.assign(() => patch(r.id, { opportunite: 'En cours', phase: 'R1' }), { label: 'Replanifier' })} />)}
      </Section>

      <Section icon={<Flame size={18} className="text-amber-600" />} color="bg-amber-100"
        title="Opportunités en cours à traiter" desc="Les leads actifs, du plus ancien au plus récent." count={enCours.length}>
        {enCours.length === 0 ? <Empty text="Aucune opportunité en cours." />
          : enCours.map(r => <TaskCard key={r.id} r={r} store={store} tone="bg-amber-500 text-white hover:bg-amber-600"
            action={Object.assign(() => patch(r.id, { phase: 'R2' }), { label: 'Faire avancer' })} />)}
      </Section>

      <Section icon={<RotateCcw size={18} className="text-gray-600" />} color="bg-gray-200"
        title="Opportunités perdues à relancer" count={lost.length}
        desc={(
          <span className="flex items-center gap-2 flex-wrap mt-1">
            <span>Relancer les leads perdus —</span>
            <select className="input !w-auto !py-0.5 text-xs" value={lostFilter} onChange={e => setLostFilter(e.target.value)}>
              <option value="6m">perdues depuis 6 mois minimum</option>
              <option value="1y">perdues depuis 1 an minimum</option>
              <option value="custom">date personnalisée</option>
            </select>
            {lostFilter === 'custom' && <>
              <input type="date" className="input !w-auto !py-0.5 text-xs" value={custom.start} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} />
              <span>→</span>
              <input type="date" className="input !w-auto !py-0.5 text-xs" value={custom.end} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} />
            </>}
          </span>
        )}>
        {lost.length === 0 ? <Empty text="Aucune opportunité perdue sur cette période." />
          : lost.map(r => (
            <div key={r.id} className="space-y-0">
              <TaskCard r={r} store={store} tone="bg-gray-700 text-white hover:bg-gray-800"
                action={Object.assign(() => patch(r.id, { opportunite: 'En cours', phase: 'R1' }), { label: 'Relancer' })} />
              <div className="text-xs text-muted pl-3">Perdue le {fmtDate(lostDate(r))}</div>
            </div>
          ))}
      </Section>
    </div>
  )
}
