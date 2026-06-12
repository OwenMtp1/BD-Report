import React, { useState } from 'react'
import { Clock, Building2 } from 'lucide-react'
import { useStore, parseISO, fmtDate, applyRdvAutomations, OPP_COLORS, PHASE_COLORS } from '../store.jsx'
import { Modal, Empty } from '../ui.jsx'

const recentDate = (r) => r.dateRdv || r.datePriseRdv || r.createdAt || ''

// Regroupe les RDV par entreprise : une entreprise = une carte unique dans le pipeline.
function groupByCompany(rdvs) {
  const map = {}
  rdvs.forEach(r => {
    const key = (r.entreprise || 'Sans nom').trim()
    map[key] = map[key] || { entreprise: key, rdvs: [] }
    map[key].rdvs.push(r)
  })
  return Object.values(map).map(g => {
    // Le RDV le plus récent représente l'état actuel de l'entreprise dans le pipeline.
    const rep = [...g.rdvs].sort((a, b) => recentDate(b).localeCompare(recentDate(a)))[0]
    const starts = g.rdvs.map(r => r.datePriseRdv || r.createdAt).filter(Boolean).sort()
    return { ...g, rep, opportunite: rep.opportunite, firstDate: starts[0] || rep.createdAt }
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

  const cols = sub.opportunites // le kanban se met à jour avec chaque nouveau statut créé
  const groups = groupByCompany(sub.rdvs)

  const drop = (opp) => {
    if (!dragKey) return
    store.setSub(d => {
      const group = groupByCompany(d.rdvs).find(g => g.entreprise === dragKey)
      if (group) {
        const r = d.rdvs.find(x => x.id === group.rep.id)
        if (r && r.opportunite !== opp) Object.assign(r, applyRdvAutomations(r, { opportunite: opp }))
      }
      return d
    })
    setDragKey(null)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Leads — Pipeline par entreprise</h2>
      <p className="text-xs text-muted -mt-2">Une carte = une entreprise (pas de doublon). Glissez-déposez pour changer son statut d'opportunité ; la phase de transaction se met à jour automatiquement.</p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map(opp => {
          const cards = groups.filter(g => g.opportunite === opp)
          return (
            <div key={opp} className="kanban-col flex-1 rounded-2xl bg-surface/80 border border-line p-2.5"
              onDragOver={e => e.preventDefault()} onDrop={() => drop(opp)}>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className={`chip ${OPP_COLORS[opp] || 'bg-card text-ink'}`}>{opp}</span>
                <span className="text-xs font-bold text-muted">{cards.length}</span>
              </div>
              <div className="space-y-2 min-h-[6rem]">
                {cards.length === 0 && <div className="text-xs text-muted text-center py-4">—</div>}
                {cards.map(g => (
                  <div key={g.entreprise} draggable onDragStart={() => setDragKey(g.entreprise)} onDragEnd={() => setDragKey(null)}
                    className={`card !rounded-xl p-3 cursor-grab active:cursor-grabbing ${dragKey === g.entreprise ? 'dragging' : ''}`}>
                    <div className="font-bold text-sm flex items-center gap-1.5"><Building2 size={13} className="text-muted shrink-0" /> {g.entreprise}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`chip ${PHASE_COLORS[g.rep.phase] || 'bg-surface text-ink'}`}>{g.rep.phase}</span>
                      {g.rdvs.length > 1 && <span className="chip bg-surface text-muted">{g.rdvs.length} RDV</span>}
                    </div>
                    <button className="flex items-center gap-1 text-xs text-brand font-semibold mt-2 hover:underline" onClick={() => setDetail(g)}>
                      <Clock size={12} /> Actif depuis {companyLifeDays(g)} j
                    </button>
                  </div>
                ))}
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
