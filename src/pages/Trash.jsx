import React, { useState } from 'react'
import { Trash2, RotateCcw, CalendarDays, StickyNote, CheckSquare } from 'lucide-react'
import { useStore, fmtDate } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

const daysLeft = (deletedAt) => Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000))

export default function Trash() {
  const store = useStore()
  const sub = store.sub
  const [confirmPurge, setConfirmPurge] = useState(null) // {kind, id} ou {kind:'all'}

  const rdvs = sub.rdvTrash || []
  const notes = sub.noteTrash || []
  const tasks = sub.taskTrash || []

  const restoreRdv = (id) => {
    store.setSub(d => {
      const toRestore = new Set()
      const present = new Set(d.rdvs.map(r => r.id))
      const trashById = Object.fromEntries(d.rdvTrash.map(t => [t.id, t]))
      // Restaure l'élément, sa chaîne de parents (sinon orphelin invisible — bug 2) et ses enfants en corbeille.
      const pullParents = (item) => {
        toRestore.add(item.id)
        if (item.parentId && !present.has(item.parentId) && trashById[item.parentId]) pullParents(trashById[item.parentId])
      }
      const start = trashById[id]
      if (!start) return d
      pullParents(start)
      d.rdvTrash.filter(t => t.parentId === id).forEach(t => toRestore.add(t.id))
      d.rdvTrash.filter(t => toRestore.has(t.id)).forEach(t => { const { deletedAt, ...rdv } = t; d.rdvs.push(rdv) })
      d.rdvTrash = d.rdvTrash.filter(t => !toRestore.has(t.id))
      return d
    })
    store.logAction('RDV', 'RDV restauré depuis la corbeille')
    toast('Rendez-vous restauré (avec son contexte)')
  }
  const restoreNote = (id) => {
    store.setSub(d => {
      const item = d.noteTrash.find(t => t.id === id)
      if (!item) return d
      const { deletedAt, ...note } = item
      d.notes.push(note)
      d.noteTrash = d.noteTrash.filter(t => t.id !== id)
      return d
    })
    store.logAction('Note', 'Note restaurée depuis la corbeille')
    toast('Note restaurée')
  }
  const restoreTask = (id) => {
    store.setSub(d => {
      const item = (d.taskTrash || []).find(t => t.id === id)
      if (!item) return d
      const { deletedAt, ...task } = item
      d.tasks = [...(d.tasks || []), task]
      d.taskTrash = d.taskTrash.filter(t => t.id !== id)
      return d
    })
    store.logAction('Tâche', 'Tâche restaurée depuis la corbeille')
    toast('Tâche restaurée')
  }
  const purge = () => {
    const { kind, id } = confirmPurge
    store.setSub(d => {
      if (kind === 'all') { d.rdvTrash = []; d.noteTrash = []; d.taskTrash = [] }
      if (kind === 'rdv') d.rdvTrash = d.rdvTrash.filter(t => t.id !== id)
      if (kind === 'note') d.noteTrash = d.noteTrash.filter(t => t.id !== id)
      if (kind === 'task') d.taskTrash = (d.taskTrash || []).filter(t => t.id !== id)
      return d
    })
    toast('Supprimé définitivement')
    setConfirmPurge(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Trash2 size={20} className="text-brand" /> Corbeille</h2>
        {(rdvs.length > 0 || notes.length > 0 || tasks.length > 0) && store.hasClientPerm('data.trash') && (
          <button className="btn-ghost text-xs text-red-500" onClick={() => setConfirmPurge({ kind: 'all' })}>Vider la corbeille</button>
        )}
      </div>
      <p className="text-xs text-muted -mt-2">Les éléments supprimés restent restaurables pendant 30 jours, puis sont purgés automatiquement.</p>

      <div className="card p-4">
        <h3 className="font-bold mb-2 flex items-center gap-1.5"><CalendarDays size={15} /> Rendez-vous ({rdvs.length})</h3>
        {rdvs.length === 0 ? <Empty text="Aucun rendez-vous dans la corbeille." /> : (
          <div className="space-y-1.5">
            {rdvs.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-xl bg-surface text-sm flex-wrap">
                <span className="font-semibold flex-1">{r.entreprise || 'Sans nom'} <span className="text-xs text-muted font-normal">— {r.phase} · RDV {fmtDate(r.dateRdv)}</span></span>
                <span className="text-xs text-muted">expire dans {daysLeft(r.deletedAt)} j</span>
                <button className="btn-ghost !py-1 text-xs" onClick={() => restoreRdv(r.id)}><RotateCcw size={12} /> Restaurer</button>
                <button className="btn-danger !py-1 text-xs" onClick={() => setConfirmPurge({ kind: 'rdv', id: r.id })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="font-bold mb-2 flex items-center gap-1.5"><StickyNote size={15} /> Notes ({notes.length})</h3>
        {notes.length === 0 ? <Empty text="Aucune note dans la corbeille." /> : (
          <div className="space-y-1.5">
            {notes.map(n => (
              <div key={n.id} className="flex items-center gap-2 p-2 rounded-xl bg-surface text-sm flex-wrap">
                <span className="font-semibold flex-1">{n.title} <span className="text-xs text-muted font-normal">— {fmtDate(n.createdAt)}</span></span>
                <span className="text-xs text-muted">expire dans {daysLeft(n.deletedAt)} j</span>
                <button className="btn-ghost !py-1 text-xs" onClick={() => restoreNote(n.id)}><RotateCcw size={12} /> Restaurer</button>
                <button className="btn-danger !py-1 text-xs" onClick={() => setConfirmPurge({ kind: 'note', id: n.id })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="font-bold mb-2 flex items-center gap-1.5"><CheckSquare size={15} /> Tâches ({tasks.length})</h3>
        {tasks.length === 0 ? <Empty text="Aucune tâche dans la corbeille." /> : (
          <div className="space-y-1.5">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl bg-surface text-sm flex-wrap">
                <span className="font-semibold flex-1">{t.title || 'Sans titre'} <span className="text-xs text-muted font-normal">{t.dueDate ? `— échéance ${fmtDate(t.dueDate)}` : ''}</span></span>
                <span className="text-xs text-muted">expire dans {daysLeft(t.deletedAt)} j</span>
                <button className="btn-ghost !py-1 text-xs" onClick={() => restoreTask(t.id)}><RotateCcw size={12} /> Restaurer</button>
                <button className="btn-danger !py-1 text-xs" onClick={() => setConfirmPurge({ kind: 'task', id: t.id })}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmPurge && (
        <Confirm message={confirmPurge.kind === 'all' ? 'Vider définitivement toute la corbeille ?' : 'Supprimer définitivement cet élément ?'}
          onYes={purge} onNo={() => setConfirmPurge(null)} />
      )}
    </div>
  )
}
