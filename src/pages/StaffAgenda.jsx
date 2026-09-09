import React, { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, User, Users2, Hand, FolderKanban } from 'lucide-react'
import { useStore, PROJECT_PHASE_COLORS, PROJECT_PHASES, fmtDate } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'

// Agenda de l'équipe BD Report.
// Deux lectures de la même donnée, et c'est volontaire : « mon agenda » ne montre que ce dont
// je réponds — sinon il ne sert à rien pour organiser sa semaine — tandis que l'agenda d'équipe
// montre tout, y compris ce que personne n'a pris. C'est là qu'on voit ce qui va tomber.

const DAY = 86400000
const iso = (d) => d.toISOString().slice(0, 10)
const parse = (s) => (s ? new Date(s + 'T00:00:00Z') : null)
const phaseColor = (name) => PROJECT_PHASE_COLORS[PROJECT_PHASES.indexOf(name)] || '#64748b'

export default function StaffAgenda() {
  const store = useStore()
  const me = store.account
  const [scope, setScope] = useState('mine')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d
  })

  const projects = (store.db.projects || []).filter(p => p.status !== 'termine')
  const shown = scope === 'mine' ? projects.filter(p => p.ownerId === me.id) : projects
  const days = [...Array(7)].map((_, i) => new Date(weekStart.getTime() + i * DAY))
  const today = new Date().toISOString().slice(0, 10)

  // Une phase de projet occupe une plage de jours : c'est ce qui fait un agenda plutôt
  // qu'une liste de dates.
  const bars = useMemo(() => shown.flatMap(p => (p.phases || [])
    .filter(ph => ph.start && ph.end)
    .map(ph => ({ project: p, phase: ph }))), [shown])

  const inDay = (b, dayIso) => b.phase.start <= dayIso && dayIso <= b.phase.end
  const shift = (n) => setWeekStart(d => new Date(d.getTime() + n * 7 * DAY))

  // À prendre : ce que personne ne s'est attribué. La question qu'on veut voir en ouvrant l'agenda.
  const unowned = projects.filter(p => !p.ownerId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2"><CalendarDays size={20} className="text-brand" /> Agenda</h2>
          <p className="text-xs text-muted -mt-0.5">Les phases des projets d'implémentation, semaine par semaine.</p>
        </div>
        <div className="flex rounded-lg border border-line overflow-hidden">
          {[['mine', 'Mon agenda', User], ['team', "Agenda de l'équipe", Users2]].map(([id, label, Ic]) => (
            <button key={id} onClick={() => setScope(id)}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${scope === id ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}>
              <Ic size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {scope === 'team' && unowned.length > 0 && (
        <div className="card p-3">
          <div className="text-sm font-bold mb-1.5 flex items-center gap-2"><Hand size={15} className="text-amber-500" /> À prendre en charge ({unowned.length})</div>
          <p className="text-[11px] text-muted mb-2">Un projet que personne n'a pris est à tout le monde, c'est-à-dire à personne.</p>
          <div className="flex flex-wrap gap-1.5">
            {unowned.map(p => (
              <button key={p.id} className="chip bg-card border border-line text-muted hover:bg-brand/10 hover:text-brand"
                onClick={() => { store.takeProject(p.id); toast('Projet pris en charge — il apparaît dans votre agenda') }}>
                {p.name || p.clientName || 'Projet'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-3">
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => shift(-1)}><ChevronLeft size={17} /></button>
          <span className="font-bold text-sm min-w-[13rem] text-center">
            {days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })} → {days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </span>
          <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => shift(1)}><ChevronRight size={17} /></button>
          <button className="btn-ghost !py-1 text-xs ml-1" onClick={() => {
            const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); setWeekStart(d)
          }}>Cette semaine</button>
        </div>

        {bars.length === 0 ? (
          <Empty text={scope === 'mine'
            ? "Aucun projet à votre nom. Prenez-en un depuis l'agenda de l'équipe ou la liste des projets."
            : 'Aucune phase de projet planifiée.'} />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(d => {
              const k = iso(d)
              const items = bars.filter(b => inDay(b, k))
              return (
                <div key={k} className={`min-h-[9rem] rounded-lg border p-1.5 ${k === today ? 'border-brand bg-brand/5' : 'border-line bg-surface/50'}`}>
                  <div className={`text-[11px] font-bold mb-1 ${k === today ? 'text-brand' : 'text-muted'}`}>
                    {d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </div>
                  {items.map((b, i) => {
                    const owner = store.db.accounts.find(a => a.id === b.project.ownerId)
                    return (
                      <div key={b.project.id + b.phase.id + i} className="mb-1 rounded px-1.5 py-1 text-[10px] leading-tight text-white truncate"
                        style={{ background: phaseColor(b.phase.name) }}
                        title={`${b.project.name || b.project.clientName} — ${b.phase.name} (${fmtDate(b.phase.start)} → ${fmtDate(b.phase.end)})${owner ? ` · ${owner.pseudo}` : ' · non pris'}`}>
                        <div className="font-bold truncate">{b.project.name || b.project.clientName}</div>
                        <div className="truncate opacity-90">{b.phase.name}{scope === 'team' ? ` · ${owner ? owner.pseudo : 'non pris'}` : ''}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {scope === 'mine' && (
        <div className="card p-3">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><FolderKanban size={15} className="text-brand" /> Mes projets</div>
          {store.myProjects().length === 0
            ? <p className="text-xs text-muted">Vous n'avez pris aucun projet en charge.</p>
            : (
              <div className="space-y-1.5">
                {store.myProjects().map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-surface flex-wrap">
                    <span className="font-semibold flex-1 min-w-0 truncate">{p.name || p.clientName}</span>
                    <span className="text-[11px] text-muted">{p.clientName}</span>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => { store.releaseProject(p.id); toast('Projet relâché') }}>Relâcher</button>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  )
}
