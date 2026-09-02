import React, { useRef, useState } from 'react'
import { Download, Upload, Trash2, Search, FileSpreadsheet, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useStore, uid, todayISO, fmtDate, SOURCES } from '../store.jsx'
import { safeUrl } from '../security.js'
import { Empty, Confirm, Select, Modal, Field, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'

function emptyContact() { return { nom: '', poste: '', entreprise: '', email: '', tel: '', secteur: '', linkedin: '', source: '' } }

const COLS = [
  ['nom', 'Nom & Prénom'], ['poste', 'Poste'], ['entreprise', 'Entreprise'],
  ['email', 'Email'], ['tel', 'Téléphone'], ['secteur', 'Secteur'],
  ['linkedin', 'LinkedIn'], ['source', 'Source'], ['createdAt', 'Ajouté le'],
]

function toCSV(contacts) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = COLS.map(c => c[1]).join(';')
  const rows = contacts.map(c => COLS.map(([k]) => esc(c[k])).join(';'))
  return [head, ...rows].join('\n')
}

// Parseur CSV robuste : gère les guillemets, virgules/points-virgules internes,
// guillemets échappés ("") et sauts de ligne dans les champs entre guillemets (bug 8).
function parseCSVRows(text, sep) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch === '\r') { /* ignoré */ }
    else field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ','
  const rows = parseCSVRows(text, sep)
  if (!rows.length) return []
  const head = rows[0].map(h => h.trim().toLowerCase())
  const idx = (names) => head.findIndex(h => names.some(n => h.includes(n)))
  const map = {
    nom: idx(['nom', 'name', 'contact']), poste: idx(['poste', 'title', 'job']),
    entreprise: idx(['entreprise', 'company', 'société']), email: idx(['email', 'mail']),
    tel: idx(['tel', 'phone', 'téléphone']), secteur: idx(['secteur', 'industry']),
    linkedin: idx(['linkedin']), source: idx(['source']),
  }
  return rows.slice(1).map(cells => {
    const c = { id: uid(), createdAt: todayISO() }
    Object.entries(map).forEach(([k, i]) => { c[k] = i >= 0 ? (cells[i] || '').trim() : '' })
    return c
  }).filter(c => c.nom || c.email)
}

export default function Contacts() {
  const store = useStore()
  const sub = store.sub
  const [selected, setSelected] = useState(new Set())
  const [q, setQ] = useState('')
  const [fEntreprise, setFEntreprise] = useState('')
  const [fPoste, setFPoste] = useState('')
  const [fSource, setFSource] = useState('')
  const [fSecteur, setFSecteur] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [form, setForm] = useState(null) // contact en cours de création
  const fileRef = useRef(null)

  const createContact = () => {
    if (!form.nom.trim() && !form.email.trim()) { toast('Renseignez au moins un nom ou un email.'); return }
    store.setSub(d => ({ ...d, contacts: [...d.contacts, { ...form, id: uid(), createdAt: todayISO() }] }))
    store.logAction('Contact', 'Contact créé manuellement', form.nom || form.email)
    toast('Contact créé')
    setForm(null)
  }

  const allOf = (key) => [...new Set(sub.contacts.map(c => c[key]).filter(Boolean))].sort()
  const hasFilters = !!(q || fEntreprise || fPoste || fSource || fSecteur)

  const contacts = sub.contacts.filter(c =>
    (!q || [c.nom, c.email, c.entreprise, c.poste].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))
    && (!fEntreprise || c.entreprise === fEntreprise)
    && (!fPoste || c.poste === fPoste)
    && (!fSource || c.source === fSource)
    && (!fSecteur || c.secteur === fSecteur))

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const exportCSV = (onlySelected) => {
    // Sans filtre : tout. Avec filtre(s) : uniquement les contacts filtrés.
    const list = onlySelected ? sub.contacts.filter(c => selected.has(c.id)) : contacts
    const blob = new Blob(['﻿' + toCSV(list)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'contacts.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    store.logAction('Contact', 'Export CSV', `${list.length} contact(s)${onlySelected ? ' (sélection)' : hasFilters ? ' (filtre)' : ''}`)
    toast(`${list.length} contact(s) exporté(s) en CSV`)
  }

  const exportXLSX = () => {
    // Même règle que le CSV : sans filtre = tout, avec filtre = uniquement le résultat filtré.
    const list = selected.size > 0 ? sub.contacts.filter(c => selected.has(c.id)) : contacts
    const rows = list.map(c => Object.fromEntries(COLS.map(([k, l]) => [l, k === 'createdAt' ? fmtDate(c[k]) : (c[k] || '')])))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = COLS.map(([, l]) => ({ wch: Math.max(14, l.length + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
    XLSX.writeFile(wb, 'contacts.xlsx')
    store.logAction('Contact', 'Export Excel', `${list.length} contact(s)`)
    toast(`${list.length} contact(s) exporté(s) en Excel`)
  }

  const importCSV = (file) => {
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result))
      // Déduplication à l'import : on met à jour la fiche existante (email/nom) au lieu de dupliquer.
      let added = 0, updated = 0
      store.setSub(d => {
        parsed.forEach(p => {
          const email = (p.email || '').toLowerCase()
          const nom = (p.nom || '').toLowerCase()
          const found = d.contacts.find(x =>
            (email && (x.email || '').toLowerCase() === email) ||
            (!email && nom && (x.nom || '').toLowerCase() === nom))
          if (found) { Object.keys(p).forEach(k => { if (k !== 'id' && p[k]) found[k] = p[k] }); updated++ }
          else { d.contacts.push(p); added++ }
        })
        return d
      })
      store.logAction('Contact', 'Import CSV', `${added} ajouté(s), ${updated} mis à jour depuis ${file.name}`)
      toast(`Import : ${added} ajouté(s), ${updated} mis à jour`)
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Mes contacts <span className="text-muted text-sm font-semibold">({sub.contacts.length})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-primary text-xs" onClick={() => setForm(emptyContact())}><Plus size={14} /> Nouveau contact</button>
          <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={e => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = '' }} />
          <button className="btn-ghost text-xs" onClick={() => fileRef.current.click()}><Upload size={14} /> Importer CSV</button>
          <button className="btn-ghost text-xs" onClick={() => exportCSV(false)}>
            <Download size={14} /> {hasFilters ? `CSV filtré (${contacts.length})` : 'Exporter CSV'}
          </button>
          <button className="btn-ghost text-xs" onClick={exportXLSX}>
            <FileSpreadsheet size={14} /> {hasFilters ? `Excel filtré (${contacts.length})` : 'Exporter Excel'}
          </button>
          {selected.size > 0 && <>
            <button className="btn-primary text-xs" onClick={() => exportCSV(true)}><Download size={14} /> Exporter la sélection ({selected.size})</button>
            <button className="btn-danger text-xs" onClick={() => setConfirmDel(true)}><Trash2 size={14} /></button>
          </>}
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <Search size={15} className="text-muted" />
        <input className="bg-transparent outline-none text-sm flex-1 min-w-[12rem]" placeholder="Rechercher un contact, une entreprise, un poste..." value={q} onChange={e => setQ(e.target.value)} />
        <Select value={fEntreprise} onChange={setFEntreprise} options={allOf('entreprise')} placeholder="Entreprise : toutes" className="!w-auto !py-1.5 text-xs" />
        <Select value={fPoste} onChange={setFPoste} options={allOf('poste')} placeholder="Poste : tous" className="!w-auto !py-1.5 text-xs" />
        <Select value={fSecteur} onChange={setFSecteur} options={allOf('secteur')} placeholder="Secteur : tous" className="!w-auto !py-1.5 text-xs" />
        <Select value={fSource} onChange={setFSource} options={SOURCES} placeholder="Source : toutes" className="!w-auto !py-1.5 text-xs" />
        {hasFilters && <button className="text-xs text-brand underline" onClick={() => { setQ(''); setFEntreprise(''); setFPoste(''); setFSource(''); setFSecteur('') }}>Réinitialiser</button>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase">
              <th className="py-2.5 pl-3 w-8">
                <input type="checkbox" checked={contacts.length > 0 && contacts.every(c => selected.has(c.id))}
                  onChange={e => setSelected(e.target.checked ? new Set(contacts.map(c => c.id)) : new Set())} />
              </th>
              {COLS.map(([k, l]) => <th key={k}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && <tr><td colSpan={COLS.length + 1}><Empty text="Aucun contact. Créez-en un avec « Nouveau contact », importez un CSV, ou ils s'ajoutent automatiquement à chaque RDV." /></td></tr>}
            {contacts.map(c => (
              <tr key={c.id} className="border-t border-line hover:bg-surface/60">
                <td className="py-2 pl-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td className="font-semibold">{c.nom || '—'}</td>
                <td className="text-muted">{c.poste || '—'}</td>
                <td>{c.entreprise ? <button className="hover:text-brand hover:underline" title="Ouvrir la fiche entreprise" onClick={() => openCompany(c.entreprise)}>{c.entreprise}</button> : '—'}</td>
                <td className="text-xs">{c.email || '—'}</td>
                <td className="text-xs">{c.tel || '—'}</td>
                <td className="text-muted text-xs">{c.secteur || '—'}</td>
                <td className="text-xs">{safeUrl(c.linkedin) ? <a href={safeUrl(c.linkedin)} target="_blank" rel="noreferrer" className="text-brand underline">Profil</a> : '—'}</td>
                <td><span className="chip bg-surface text-muted">{c.source || '—'}</span></td>
                <td className="text-xs text-muted">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title="Nouveau contact" onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom & Prénom"><input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} autoFocus /></Field>
            <Field label="Poste"><input className="input" value={form.poste} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))} /></Field>
            <Field label="Entreprise"><input className="input" value={form.entreprise} onChange={e => setForm(f => ({ ...f, entreprise: e.target.value }))} /></Field>
            <Field label="Secteur"><input className="input" value={form.secteur} onChange={e => setForm(f => ({ ...f, secteur: e.target.value }))} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Téléphone"><input className="input" value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} /></Field>
            <Field label="LinkedIn"><input className="input" value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/…" /></Field>
            <Field label="Source"><Select value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} options={SOURCES} placeholder="—" /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn-primary" onClick={createContact}>Créer le contact</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Supprimer ${selected.size} contact(s) ?`}
          onYes={() => { store.logAction('Contact', 'Contacts supprimés', `${selected.size} contact(s)`); store.setSub(d => ({ ...d, contacts: d.contacts.filter(c => !selected.has(c.id)) })); setSelected(new Set()); setConfirmDel(false) }}
          onNo={() => setConfirmDel(false)} />
      )}
    </div>
  )
}
