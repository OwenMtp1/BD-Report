import React, { useState } from 'react'
import { Plus, Pin, PinOff, Archive, Trash2, Building2, User, CalendarDays, CheckCircle2, Circle, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate } from '../store.jsx'
import { Modal, Field, Select, Empty, Confirm, toast } from '../ui.jsx'

const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

function emptyTask() {
  return { title: '', description: '', dueDate: todayISO(), assignee: '', company: '', contact: '', rdvId: '' }
}

export default function MyTasks() {
  const store = useStore()
  const sub = store.sub
  const members = store.db.subenvs.filter(s => s.envId === store.session.envId)
  const companies = [...new Set(sub.rdvs.map(r => r.entreprise).filter(Boolean))].sort()
  const contacts = [...new Set(sub.contacts.map(c => c.nom).filter(Boolean))].sort()

  const [form, setForm] = useState(null) // {mode:'create'|'edit', data}
  const [openId, setOpenId] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [fAssignee, setFAssignee] = useState('')
  const [fWhen, setFWhen] = useState('') // '' | 'today' | 'tomorrow' | 'late' | 'overdue'

  const setTasks = (fn) => store.setSub(d => ({ ...d, tasks: fn(d.tasks || []) }))

  const save = (data, mode, id) => {
    if (!data.title.trim()) { toast('Donnez un titre à la tâche.'); return }
    if (mode === 'create') {
      setTasks(ts => [...ts, { ...data, id: uid(), done: false, archived: false, pinned: false, createdAt: todayISO() }])
      store.logAction('Tâche', 'Tâche créée', data.title)
      toast('Tâche créée')
    } else {
      setTasks(ts => ts.map(t => t.id === id ? { ...t, ...data } : t))
      store.logAction('Tâche', 'Tâche modifiée', data.title)
      toast('Tâche modifiée')
    }
    setForm(null)
  }

  const toggleDone = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const togglePin = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t))
  const archive = (id) => { setTasks(ts => ts.map(t => t.id === id ? { ...t, archived: true, pinned: false } : t)); toast('Tâche archivée') }
  const unarchive = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, archived: false } : t))
  const remove = (id) => {
    // Suppression douce : la tâche part dans la corbeille (restaurable 30 jours), comme les RDV et notes.
    store.setSub(d => {
      const task = (d.tasks || []).find(t => t.id === id)
      if (!task) return d
      return {
        ...d,
        tasks: d.tasks.filter(t => t.id !== id),
        taskTrash: [...(d.taskTrash || []), { ...task, deletedAt: new Date().toISOString() }],
      }
    })
    store.logAction('Tâche', 'Tâche supprimée')
    toast('Tâche déplacée dans la corbeille')
    setConfirmDel(null)
  }

  const memberName = (id) => { const m = members.find(x => x.id === id); return m ? `${m.prenom} ${m.nom}` : '' }

  let list = (sub.tasks || []).filter(t => showArchived ? t.archived : !t.archived)
  if (fAssignee) list = list.filter(t => t.assignee === fAssignee)
  if (fWhen) {
    const today = todayISO(), tmr = tomorrowISO()
    list = list.filter(t => {
      if (fWhen === 'today') return t.dueDate === today
      if (fWhen === 'tomorrow') return t.dueDate === tmr
      if (fWhen === 'overdue') return t.dueDate && t.dueDate < today && !t.done
      if (fWhen === 'late') return t.dueDate && t.dueDate > tmr
      return true
    })
  }
  list = [...list].sort((a, b) => (b.pinned - a.pinned) || (a.done - b.done) || (a.dueDate || '').localeCompare(b.dueDate || ''))

  const dueBadge = (t) => {
    if (!t.dueDate) return null
    const today = todayISO()
    const overdue = t.dueDate < today && !t.done
    return <span className={`chip ${overdue ? 'bg-red-100 text-red-700' : t.dueDate === today ? 'bg-amber-100 text-amber-700' : 'bg-surface text-muted'}`}>
      <CalendarDays size={11} /> {fmtDate(t.dueDate)}{overdue ? ' · en retard' : ''}
    </span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Mes tâches</h2>
        <button className="btn-primary" onClick={() => setForm({ mode: 'create', data: emptyTask() })}><Plus size={16} /> Nouvelle tâche</button>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <select className="input !w-auto !py-1.5" value={fWhen} onChange={e => setFWhen(e.target.value)}>
          <option value="">Échéance : toutes</option>
          <option value="overdue">En retard</option>
          <option value="today">Aujourd'hui</option>
          <option value="tomorrow">Demain</option>
          <option value="late">Plus tard</option>
        </select>
        <select className="input !w-auto !py-1.5" value={fAssignee} onChange={e => setFAssignee(e.target.value)}>
          <option value="">Assigné : tous</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archivées
        </label>
      </div>

      {list.length === 0 ? <Empty text="Aucune tâche. Créez-en une avec « Nouvelle tâche »." /> : (
        <div className="space-y-2">
          {list.map(t => (
            <div key={t.id} className="card p-3 fade-in">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleDone(t.id)} title={t.done ? 'Marquer à faire' : 'Marquer fait'}>
                  {t.done ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} className="text-muted" />}
                </button>
                <button className="flex-1 min-w-0 text-left" onClick={() => setOpenId(openId === t.id ? '' : t.id)}>
                  <div className={`font-bold text-sm flex items-center gap-2 ${t.done ? 'line-through text-muted' : ''}`}>
                    {t.pinned && <Pin size={12} className="text-amber-500 shrink-0" />}
                    {t.title}
                    {t.description && (openId === t.id ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {t.company && <span className="chip bg-surface text-muted"><Building2 size={11} /> {t.company}</span>}
                    {t.contact && <span className="chip bg-surface text-muted"><User size={11} /> {t.contact}</span>}
                    {t.assignee && <span className="chip bg-brand/10 text-brand">{memberName(t.assignee)}</span>}
                    {dueBadge(t)}
                  </div>
                </button>
                <div className="flex gap-1 shrink-0">
                  <button className="p-1.5 rounded-lg hover:bg-surface" title="Épingler" onClick={() => togglePin(t.id)}>
                    {t.pinned ? <Pin size={15} className="text-amber-500" /> : <PinOff size={15} className="text-muted" />}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-surface text-xs font-semibold" title="Modifier" onClick={() => setForm({ mode: 'edit', id: t.id, data: { ...t } })}>✎</button>
                  {t.archived
                    ? <button className="p-1.5 rounded-lg hover:bg-surface" title="Désarchiver" onClick={() => unarchive(t.id)}><Archive size={15} className="text-brand" /></button>
                    : <button className="p-1.5 rounded-lg hover:bg-surface" title="Archiver" onClick={() => archive(t.id)}><Archive size={15} className="text-muted" /></button>}
                  <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" title="Supprimer" onClick={() => setConfirmDel(t.id)}><Trash2 size={15} /></button>
                </div>
              </div>
              {openId === t.id && t.description && (
                <p className="text-sm text-muted whitespace-pre-wrap mt-2 pl-9">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.mode === 'create' ? 'Nouvelle tâche' : 'Modifier la tâche'} onClose={() => setForm(null)}>
          <TaskForm initial={form.data} members={members} companies={companies} contacts={contacts} rdvs={sub.rdvs}
            onSave={(data) => save(data, form.mode, form.id)} onClose={() => setForm(null)} />
        </Modal>
      )}

      {confirmDel && <Confirm yesLabel="Déplacer" message="Déplacer cette tâche dans la corbeille ?" onYes={() => remove(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}

function TaskForm({ initial, members, companies, contacts, rdvs, onSave, onClose }) {
  const [f, setF] = useState(initial)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const companyRdvs = rdvs.filter(r => !f.company || r.entreprise === f.company)
  return (
    <div className="space-y-3">
      <Field label="Titre" required><input className="input" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Ex : Relancer le DAF" autoFocus /></Field>
      <Field label="Description"><textarea className="input min-h-[90px]" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Détails de la tâche..." /></Field>
      <div>
        <span className="label">Échéance</span>
        <div className="flex gap-2 flex-wrap items-center">
          {[['today', "Aujourd'hui", todayISO()], ['tomorrow', 'Demain', tomorrowISO()]].map(([id, lbl, val]) => (
            <button key={id} type="button" className={`btn text-xs ${f.dueDate === val ? 'bg-brand text-white' : 'bg-card border border-line'}`} onClick={() => set('dueDate', val)}>{lbl}</button>
          ))}
          <input type="date" className="input !w-auto !py-1.5 text-xs" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Assigner à">
          <select className="input" value={f.assignee} onChange={e => set('assignee', e.target.value)}>
            <option value="">Personne</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
        </Field>
        <Field label="Entreprise"><Select value={f.company} onChange={v => { set('company', v); set('rdvId', '') }} options={companies} placeholder="Aucune" /></Field>
        <Field label="Contact"><Select value={f.contact} onChange={v => set('contact', v)} options={contacts} placeholder="Aucun" /></Field>
        <Field label="Rendez-vous lié">
          <select className="input" value={f.rdvId} onChange={e => set('rdvId', e.target.value)}>
            <option value="">Aucun</option>
            {companyRdvs.map(r => <option key={r.id} value={r.id}>{r.entreprise} — {r.phase} ({fmtDate(r.dateRdv)})</option>)}
          </select>
        </Field>
      </div>
      {/* Le menu "Assigner à" affiche les ids ; on remappe les libellés ci-dessous pour l'aperçu */}
      {f.assignee && <p className="text-xs text-muted">Assignée à : {(members.find(m => m.id === f.assignee) || {}).prenom} {(members.find(m => m.id === f.assignee) || {}).nom}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => onSave(f)}>Enregistrer</button>
      </div>
    </div>
  )
}
