import React, { useState } from 'react'
import { Trash2, RotateCcw, CalendarDays, StickyNote } from 'lucide-react'
import { useStore, fmtDate } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

const daysLeft = (deletedAt) => Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000))

export default function Trash() {
  const store = useStore()
  const sub = store.sub
  const [confirmPurge, setConfirmPurge] = useState(null) // {kind, id} ou {kind:'all'}

  const rdvs = sub.rdvTrash || []
  const notes = sub.noteTrash || []

  const restoreRdv = (id) => {
    store.setSub(d => {
      const item = d.rdvTrash.find(t => t.id === id)
      if (!item) return d
      const { deletedAt, ...rdv } = item
      d.rdvs.push(rdv)
      d.rdvTrash = d.rdvTrash.filter(t => t.id !== id)
      return d
    })
    store.logAction('RDV', 'RDV restauré depuis la corbeille')
    toast('Rendez-vous restauré')
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
  const purge = () => {
    const { kind, id } = confirmPurge
    store.setSub(d => {
      if (kind === 'all') { d.rdvTrash = []; d.noteTrash = [] }
      if (kind === 'rdv') d.rdvTrash = d.rdvTrash.filter(t => t.id !== id)
      if (kind === 'note') d.noteTrash = d.noteTrash.filter(t => t.id !== id)
      return d
    })
    toast('Supprimé définitivement')
    setConfirmPurge(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Trash2 size={20} className="text-brand" /> Corbeille</h2>
        {(rdvs.length > 0 || notes.length > 0) && (
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

      {confirmPurge && (
        <Confirm message={confirmPurge.kind === 'all' ? 'Vider définitivement toute la corbeille ?' : 'Supprimer définitivement cet élément ?'}
          onYes={purge} onNo={() => setConfirmPurge(null)} />
      )}
    </div>
  )
}
