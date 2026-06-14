import React, { useState } from 'react'
import { Plus, Pin, PinOff, Archive, CalendarPlus, FileDown, Trash2, FolderPlus, Pencil } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate } from '../store.jsx'
import { Modal, Field, Select, Empty, Confirm, toast, DictateButton } from '../ui.jsx'

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function exportNote(note, format) {
  const body = `<h1>${esc(note.title)}</h1><p><i>${fmtDate(note.createdAt)}</i></p><div>${esc(note.content).replace(/\n/g, '<br/>')}</div>`
  if (format === 'docx') {
    // En-tête Office : Word ouvre proprement ce document Word-HTML (extension .doc).
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(note.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:18pt}</style></head>
<body>${body}</body></html>`
    const blob = new Blob(['﻿' + doc], { type: 'application/msword' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(note.title || 'note').replace(/[^\w\-]+/g, '_')}.doc`
    a.click()
    URL.revokeObjectURL(a.href)
  } else {
    const w = window.open('', '_blank')
    if (!w) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '⚠️ Fenêtre bloquée : autorisez les pop-ups pour exporter en PDF.' })); return }
    w.document.write(`<html><head><meta charset="utf-8"><title>${esc(note.title)}</title></head><body>${body}</body></html>`)
    w.document.close()
    w.print()
  }
}

export default function Notes({ onCreateRdvFromNote }) {
  const store = useStore()
  const sub = store.sub
  const [editing, setEditing] = useState(null) // note en édition
  const [tplModal, setTplModal] = useState(false)
  const [tplEdit, setTplEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [folder, setFolder] = useState('')
  const [fPhase, setFPhase] = useState('')
  const [fOpp, setFOpp] = useState('')
  const [fDate, setFDate] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const setNotes = (fn) => store.setSub(d => ({ ...d, notes: fn(d.notes) }))

  const save = () => {
    setNotes(notes => {
      const i = notes.findIndex(n => n.id === editing.id)
      if (i >= 0) notes[i] = editing
      else notes.push(editing)
      return [...notes]
    })
    store.logAction('Note', 'Note enregistrée', editing.title)
    toast('Note enregistrée')
    setEditing(null)
  }

  const newNote = (content = '', title = '') => setEditing({
    id: uid(), title: title || 'Nouvelle note', content, folder: folder || 'Général',
    pinned: false, archived: false, createdAt: todayISO(), phase: '', opportunite: '',
  })

  let notes = sub.notes.filter(n => (showArchived ? n.archived : !n.archived))
  if (folder) notes = notes.filter(n => n.folder === folder)
  if (fPhase) notes = notes.filter(n => n.phase === fPhase)
  if (fOpp) notes = notes.filter(n => n.opportunite === fOpp)
  if (fDate) notes = notes.filter(n => n.createdAt === fDate)
  notes = [...notes].sort((a, b) => (b.pinned - a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || ''))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Mes notes</h2>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={() => setTplModal(true)}>Templates</button>
          <button className="btn-primary !px-2.5" title="Nouvelle note" onClick={() => newNote()}><Plus size={18} /></button>
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <Select value={folder} onChange={setFolder} options={sub.noteFolders} placeholder="Dossier : tous" className="!w-auto !py-1.5" />
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => {
          const name = prompt('Nom du nouveau dossier :')
          if (name) store.setSub(d => ({ ...d, noteFolders: [...new Set([...d.noteFolders, name])] }))
        }}><FolderPlus size={14} /> Dossier</button>
        <input type="date" className="input !w-auto !py-1.5" value={fDate} onChange={e => setFDate(e.target.value)} />
        <Select value={fPhase} onChange={setFPhase} options={sub.phases} placeholder="Phase : toutes" className="!w-auto !py-1.5" />
        <Select value={fOpp} onChange={setFOpp} options={sub.opportunites} placeholder="Opportunité : toutes" className="!w-auto !py-1.5" />
        <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archivées
        </label>
      </div>

      {sub.noteTemplates.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {sub.noteTemplates.map(t => (
            <button key={t.id} className="chip bg-brand/10 text-brand hover:bg-brand/20" onClick={() => newNote(t.content, t.name)}>
              📋 {t.name}
            </button>
          ))}
        </div>
      )}

      {notes.length === 0 ? <Empty text="Aucune note. Créez-en une avec le bouton +." /> : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="card p-4 flex items-start gap-3 fade-in">
              <button onClick={() => setNotes(ns => ns.map(x => x.id === n.id ? { ...x, pinned: !x.pinned } : x))} title="Épingler">
                {n.pinned ? <Pin size={16} className="text-amber-500" /> : <PinOff size={16} className="text-muted" />}
              </button>
              <div className="flex-1 cursor-pointer" onClick={() => setEditing({ ...n })}>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{n.title}</span>
                  <span className="chip bg-surface text-muted">{n.folder}</span>
                  {n.phase && <span className="chip bg-blue-100 text-blue-700">{n.phase}</span>}
                  {n.opportunite && <span className="chip bg-amber-100 text-amber-700">{n.opportunite}</span>}
                  <span className="text-xs text-muted ml-auto">{fmtDate(n.createdAt)}</span>
                </div>
                <p className="text-sm text-muted line-clamp-2 mt-1 whitespace-pre-wrap">{n.content}</p>
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 rounded-lg hover:bg-surface" title="Exporter en Word" onClick={() => exportNote(n, 'docx')}><FileDown size={15} /></button>
                <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" title="Supprimer" onClick={() => setConfirmDel(n.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.title || 'Note'} onClose={() => setEditing(null)} wide>
          <div className="space-y-3">
            <input className="input font-bold" value={editing.title} onChange={e => setEditing(x => ({ ...x, title: e.target.value }))} placeholder="Titre" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Select value={editing.folder} onChange={v => setEditing(x => ({ ...x, folder: v }))} options={sub.noteFolders} placeholder="Dossier" />
              <Select value={editing.phase} onChange={v => setEditing(x => ({ ...x, phase: v }))} options={sub.phases} placeholder="Phase" />
              <Select value={editing.opportunite} onChange={v => setEditing(x => ({ ...x, opportunite: v }))} options={sub.opportunites} placeholder="Opportunité" />
              <input type="date" className="input" value={editing.createdAt} onChange={e => setEditing(x => ({ ...x, createdAt: e.target.value }))} />
            </div>
            <div className="flex justify-end">
              <DictateButton onText={(txt) => setEditing(x => ({ ...x, content: (x.content ? x.content + ' ' : '') + txt }))} />
            </div>
            <textarea className="input min-h-[45vh] text-sm leading-relaxed" value={editing.content}
              onChange={e => setEditing(x => ({ ...x, content: e.target.value }))} placeholder="Écrivez ou dictez votre note..." />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => exportNote(editing, 'docx')}><FileDown size={14} /> Word</button>
                <button className="btn-ghost text-xs" onClick={() => exportNote(editing, 'pdf')}><FileDown size={14} /> PDF</button>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => {
                  setNotes(ns => {
                    const i = ns.findIndex(x => x.id === editing.id)
                    const v = { ...editing, archived: true }
                    if (i >= 0) ns[i] = v; else ns.push(v)
                    return [...ns]
                  })
                  store.logAction('Note', 'Note archivée', editing.title)
                  setEditing(null)
                }}><Archive size={15} /> Archiver la note</button>
                <button className="btn-ghost" onClick={() => { save(); onCreateRdvFromNote(editing.content) }}>
                  <CalendarPlus size={15} /> Créer un RDV
                </button>
                <button className="btn-primary" onClick={save}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {tplModal && (
        <Modal title="Templates de notes" onClose={() => { setTplModal(false); setTplEdit(null) }} wide>
          {!tplEdit ? (
            <div className="space-y-2">
              {sub.noteTemplates.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface">
                  <span className="font-semibold text-sm">{t.name}</span>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded-lg hover:bg-card" onClick={() => setTplEdit({ ...t })}><Pencil size={14} /></button>
                    <button className="p-1.5 rounded-lg hover:bg-card text-red-500"
                      onClick={() => store.setSub(d => ({ ...d, noteTemplates: d.noteTemplates.filter(x => x.id !== t.id) }))}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              <button className="btn-primary text-xs" onClick={() => setTplEdit({ id: uid(), name: '', content: '' })}><Plus size={14} /> Créer un template</button>
            </div>
          ) : (
            <div className="space-y-3">
              <input className="input" placeholder="Nom du template" value={tplEdit.name} onChange={e => setTplEdit(x => ({ ...x, name: e.target.value }))} />
              <textarea className="input min-h-[30vh]" placeholder="Contenu du template" value={tplEdit.content} onChange={e => setTplEdit(x => ({ ...x, content: e.target.value }))} />
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setTplEdit(null)}>Retour</button>
                <button className="btn-primary" onClick={() => {
                  store.setSub(d => {
                    const i = d.noteTemplates.findIndex(x => x.id === tplEdit.id)
                    if (i >= 0) d.noteTemplates[i] = tplEdit; else d.noteTemplates.push(tplEdit)
                    return { ...d }
                  })
                  setTplEdit(null)
                }}>Enregistrer le template</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmDel && <Confirm yesLabel="Mettre à la corbeille" message="Mettre cette note à la corbeille ? (restaurable 30 jours)" onYes={() => {
        const note = sub.notes.find(n => n.id === confirmDel)
        store.logAction('Note', 'Note mise à la corbeille', note?.title || '')
        store.setSub(d => ({
          ...d,
          notes: d.notes.filter(x => x.id !== confirmDel),
          noteTrash: [...(d.noteTrash || []), { ...note, deletedAt: new Date().toISOString() }],
        }))
        toast('Note mise à la corbeille')
        setConfirmDel(null)
      }} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}
