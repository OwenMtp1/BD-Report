import React, { useState } from 'react'
import { FolderKanban, Plus, Trash2, Pencil, ChevronLeft, ChevronRight, CalendarRange, GanttChartSquare, X } from 'lucide-react'
import { useStore, PROJECT_PHASES, PROJECT_PHASE_COLORS, PROJECT_STATUSES, uid, todayISO } from '../store.jsx'
import { Modal, Field, Empty, Confirm, toast } from '../ui.jsx'

const DAY = 86400000
// Dates manipulées en UTC pour rester stables quel que soit le fuseau du navigateur
// (sinon addDays via toISOString peut ne pas avancer et figer le calendrier — bug planté).
const toDate = (s) => s ? new Date(s + 'T00:00:00Z') : null
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY)
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const fmtShort = (s) => s ? toDate(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—'
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function defaultPhases() {
  // Plan d'implémentation type : 4 phases hebdomadaires séquentielles à partir d'aujourd'hui.
  const pick = ['Cadrage', 'Implémentation', 'Formation', 'Go-live']
  let cursor = todayISO()
  return pick.map((name) => {
    const idx = PROJECT_PHASES.indexOf(name)
    const start = cursor
    const end = addDays(start, 6)
    cursor = addDays(end, 1)
    return { id: uid(), name, start, end, done: false, color: PROJECT_PHASE_COLORS[idx] || '#3b5bdb' }
  })
}

function emptyProject(clientName = '') {
  return { id: uid(), name: '', clientName, envId: null, owner: '', status: 'prevu', phases: defaultPhases() }
}

// ---------------------------------------------------------------- Vue Gantt (calendrier des phases)
function Gantt({ projects, onEdit }) {
  const phases = projects.flatMap(p => p.phases.filter(ph => ph.start && ph.end))
  if (!phases.length) return <Empty text="Ajoutez des phases datées à vos projets pour voir le planning." />
  let min = phases.reduce((m, ph) => ph.start < m ? ph.start : m, phases[0].start)
  let max = phases.reduce((m, ph) => ph.end > m ? ph.end : m, phases[0].end)
  min = addDays(min, -3); max = addDays(max, 3)
  const total = dayDiff(min, max) + 1
  const dayPx = Math.max(5, Math.min(26, Math.round(1100 / total)))
  const width = total * dayPx
  const today = todayISO()
  const todayX = today >= min && today <= max ? dayDiff(min, today) * dayPx : null

  // Segments de mois pour l'en-tête
  const months = []
  let c = min
  let guard = 0
  while (c <= max && guard++ < 600) {
    const d = toDate(c)
    const y = d.getUTCFullYear(), m = d.getUTCMonth()
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
    const segEnd = monthEnd < max ? monthEnd : max
    months.push({ label: `${MONTHS[m]} ${y}`, days: dayDiff(c, segEnd) + 1 })
    c = addDays(segEnd, 1)
  }

  return (
    <div className="card p-3 overflow-x-auto">
      <div style={{ minWidth: width + 170 }}>
        {/* En-tête des mois */}
        <div className="flex">
          <div className="w-[170px] shrink-0" />
          <div className="flex relative" style={{ width }}>
            {months.map((m, i) => (
              <div key={i} className="text-[11px] font-bold text-muted border-l border-line pl-1 truncate" style={{ width: m.days * dayPx }}>{m.label}</div>
            ))}
          </div>
        </div>
        {/* Lignes projets */}
        <div className="relative mt-1">
          {todayX != null && <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10" style={{ left: 170 + todayX }} title="Aujourd'hui" />}
          {projects.map(p => (
            <div key={p.id} className="flex items-center border-t border-line/60 py-1.5">
              <button className="w-[170px] shrink-0 pr-2 text-left" onClick={() => onEdit(p)}>
                <div className="font-bold text-xs truncate hover:text-brand">{p.name || 'Projet'}</div>
                <div className="text-[10px] text-muted truncate">{p.clientName || '—'}</div>
              </button>
              <div className="relative h-7" style={{ width }}>
                {p.phases.filter(ph => ph.start && ph.end).map(ph => {
                  const left = dayDiff(min, ph.start) * dayPx
                  const w = Math.max(dayPx, (dayDiff(ph.start, ph.end) + 1) * dayPx)
                  return (
                    <div key={ph.id} title={`${ph.name} : ${fmtShort(ph.start)} → ${fmtShort(ph.end)}`}
                      className={`absolute top-1 h-5 rounded-md text-[10px] text-white font-semibold px-1.5 flex items-center overflow-hidden ${ph.done ? 'opacity-50' : ''}`}
                      style={{ left, width: w, background: ph.color }}>
                      <span className="truncate">{ph.done ? '✓ ' : ''}{ph.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Vue Calendrier mensuel
function MonthCalendar({ projects }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cursor.y, cursor.m, 1)
  const startPad = (first.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  // « Aujourd'hui » calculé en heure locale pour coïncider avec la grille (construite en local).
  const t0 = new Date()
  const today = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  const phasesOn = (iso) => projects.flatMap(p => p.phases.filter(ph => ph.start && ph.end && iso >= ph.start && iso <= ph.end).map(ph => ({ ...ph, projName: p.name })))
  const prev = () => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const next = () => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-3">
        <button className="p-1.5 rounded-lg hover:bg-surface" onClick={prev}><ChevronLeft size={18} /></button>
        <span className="font-bold">{MONTHS[cursor.m]} {cursor.y}</span>
        <button className="p-1.5 rounded-lg hover:bg-surface" onClick={next}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted mb-1">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />
          const ph = phasesOn(iso)
          const isToday = iso === today
          return (
            <div key={i} className={`min-h-[64px] rounded-lg border p-1 ${isToday ? 'border-brand bg-brand/5' : 'border-line'}`}>
              <div className={`text-[11px] font-bold ${isToday ? 'text-brand' : 'text-muted'}`}>{Number(iso.slice(-2))}</div>
              <div className="space-y-0.5 mt-0.5">
                {ph.slice(0, 3).map((x, j) => (
                  <div key={j} title={`${x.projName} · ${x.name}`} className="text-[9px] text-white rounded px-1 truncate" style={{ background: x.color }}>{x.name}</div>
                ))}
                {ph.length > 3 && <div className="text-[9px] text-muted">+{ph.length - 3}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Éditeur de projet
function ProjectForm({ initial, clients, onSave, onClose }) {
  const [p, setP] = useState(initial)
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const setPhase = (id, patch) => setP(x => ({ ...x, phases: x.phases.map(ph => ph.id === id ? { ...ph, ...patch } : ph) }))
  const addPhase = () => {
    const used = p.phases.length
    const name = PROJECT_PHASES[used % PROJECT_PHASES.length]
    const lastEnd = p.phases.length ? p.phases[p.phases.length - 1].end : todayISO()
    const start = addDays(lastEnd || todayISO(), 1)
    setP(x => ({ ...x, phases: [...x.phases, { id: uid(), name, start, end: addDays(start, 6), done: false, color: PROJECT_PHASE_COLORS[used % PROJECT_PHASE_COLORS.length] }] }))
  }
  const removePhase = (id) => setP(x => ({ ...x, phases: x.phases.filter(ph => ph.id !== id) }))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nom du projet" required><input className="input" value={p.name} onChange={e => set('name', e.target.value)} placeholder="Ex : Déploiement NovaTech" autoFocus /></Field>
        <Field label="Client">
          <input className="input" list="clients-list" value={p.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Nom du client" />
          <datalist id="clients-list">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <Field label="Responsable"><input className="input" value={p.owner} onChange={e => set('owner', e.target.value)} placeholder="Chef de projet" /></Field>
        <Field label="Statut">
          <select className="input" value={p.status} onChange={e => set('status', e.target.value)}>
            {PROJECT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label !mb-0">Phases du projet</span>
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={addPhase}><Plus size={13} /> Ajouter une phase</button>
        </div>
        <div className="space-y-1.5">
          {p.phases.map(ph => (
            <div key={ph.id} className="flex items-center gap-1.5 flex-wrap bg-surface rounded-lg p-1.5">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ph.color }} />
              <input className="input !py-1 !w-32 text-xs" value={ph.name} onChange={e => setPhase(ph.id, { name: e.target.value })} placeholder="Phase" />
              <input type="date" className="input !py-1 !w-auto text-xs" value={ph.start} onChange={e => setPhase(ph.id, { start: e.target.value })} />
              <span className="text-muted text-xs">→</span>
              <input type="date" className="input !py-1 !w-auto text-xs" value={ph.end} onChange={e => setPhase(ph.id, { end: e.target.value })} />
              <label className="flex items-center gap-1 text-xs cursor-pointer ml-auto"><input type="checkbox" checked={ph.done} onChange={e => setPhase(ph.id, { done: e.target.checked })} /> Fait</label>
              <button type="button" className="p-1 text-red-500 hover:bg-red-50 rounded" onClick={() => removePhase(ph.id)}><Trash2 size={13} /></button>
            </div>
          ))}
          {p.phases.length === 0 && <p className="text-xs text-muted">Aucune phase. Ajoutez-en une.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { if (!p.name.trim()) { toast('Donnez un nom au projet.'); return } onSave(p) }}>Enregistrer</button>
      </div>
    </div>
  )
}

export default function Projects() {
  const store = useStore()
  const projects = store.db.projects || []
  const clients = store.db.clients || []
  const [view, setView] = useState('gantt') // 'gantt' | 'calendar'
  const [form, setForm] = useState(null) // {mode, data}
  const [confirmDel, setConfirmDel] = useState(null)

  const save = (data) => {
    store.saveProject(data)
    toast(form.mode === 'create' ? 'Projet créé' : 'Projet mis à jour')
    setForm(null)
  }
  const progress = (p) => { const done = p.phases.filter(ph => ph.done).length; return p.phases.length ? Math.round(done / p.phases.length * 100) : 0 }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><FolderKanban size={20} className="text-brand" /> Gestion de Projet</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${view === 'gantt' ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`} onClick={() => setView('gantt')}><GanttChartSquare size={13} /> Planning</button>
            <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${view === 'calendar' ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`} onClick={() => setView('calendar')}><CalendarRange size={13} /> Calendrier</button>
          </div>
          <button className="btn-primary" onClick={() => setForm({ mode: 'create', data: emptyProject() })}><Plus size={16} /> Nouveau projet</button>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">Planifiez les implémentations clients : phases datées (cadrage, implémentation, formation, go-live…), suivi d'avancement et calendrier.</p>

      {projects.length === 0 ? (
        <Empty text="Aucun projet. Créez votre premier projet d'implémentation avec « Nouveau projet »." />
      ) : (
        <>
          {view === 'gantt' ? <Gantt projects={projects} onEdit={(p) => setForm({ mode: 'edit', data: structuredClone(p) })} /> : <MonthCalendar projects={projects} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map(p => {
              const st = PROJECT_STATUSES.find(s => s.id === p.status) || PROJECT_STATUSES[0]
              const pr = progress(p)
              return (
                <div key={p.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-2 truncate">{p.name}</div>
                      <div className="text-xs text-muted">{p.clientName || '—'}{p.owner ? ` · ${p.owner}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`chip ${st.color}`}>{st.label}</span>
                      <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => setForm({ mode: 'edit', data: structuredClone(p) })}><Pencil size={14} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" onClick={() => setConfirmDel(p.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted mb-1"><span>Avancement</span><span>{pr}%</span></div>
                    <div className="h-2 rounded-full bg-surface overflow-hidden"><div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pr}%` }} /></div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {p.phases.map(ph => (
                      <span key={ph.id} className={`chip text-white ${ph.done ? 'opacity-50' : ''}`} style={{ background: ph.color }} title={`${fmtShort(ph.start)} → ${fmtShort(ph.end)}`}>{ph.done ? '✓ ' : ''}{ph.name}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {form && (
        <Modal title={form.mode === 'create' ? 'Nouveau projet' : 'Modifier le projet'} onClose={() => setForm(null)} wide>
          <ProjectForm initial={form.data} clients={clients} onSave={save} onClose={() => setForm(null)} />
        </Modal>
      )}
      {confirmDel && <Confirm message="Supprimer ce projet ?" onYes={() => { store.deleteProject(confirmDel); setConfirmDel(null); toast('Projet supprimé') }} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}
