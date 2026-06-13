import React, { useRef, useState } from 'react'
import { Download, Upload, Trash2, Search, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useStore, uid, todayISO, fmtDate, SOURCES } from '../store.jsx'
import { Empty, Confirm, Select, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'

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

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const split = (l) => l.match(new RegExp(`(".*?"|[^"${sep}]+)(?=\\s*${sep}|\\s*$)`, 'g'))?.map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"')) || []
  const head = split(lines[0]).map(h => h.toLowerCase())
  const idx = (names) => head.findIndex(h => names.some(n => h.includes(n)))
  const map = {
    nom: idx(['nom', 'name', 'contact']), poste: idx(['poste', 'title', 'job']),
    entreprise: idx(['entreprise', 'company', 'société']), email: idx(['email', 'mail']),
    tel: idx(['tel', 'phone', 'téléphone']), secteur: idx(['secteur', 'industry']),
    linkedin: idx(['linkedin']), source: idx(['source']),
  }
  return lines.slice(1).map(l => {
    const cells = split(l)
    const c = { id: uid(), createdAt: todayISO() }
    Object.entries(map).forEach(([k, i]) => { c[k] = i >= 0 ? (cells[i] || '') : '' })
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
  const fileRef = useRef(null)

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
      const added = parseCSV(String(reader.result))
      store.setSub(d => ({ ...d, contacts: [...d.contacts, ...added] }))
      store.logAction('Contact', 'Import CSV', `${added.length} contact(s) depuis ${file.name}`)
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Mes contacts <span className="text-muted text-sm font-semibold">({sub.contacts.length})</span></h2>
        <div className="flex items-center gap-2">
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
            {contacts.length === 0 && <tr><td colSpan={COLS.length + 1}><Empty text="Aucun contact. Ils sont ajoutés automatiquement à chaque création de RDV." /></td></tr>}
            {contacts.map(c => (
              <tr key={c.id} className="border-t border-line hover:bg-surface/60">
                <td className="py-2 pl-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td className="font-semibold">{c.nom || '—'}</td>
                <td className="text-muted">{c.poste || '—'}</td>
                <td>{c.entreprise ? <button className="hover:text-brand hover:underline" title="Ouvrir la fiche entreprise" onClick={() => openCompany(c.entreprise)}>{c.entreprise}</button> : '—'}</td>
                <td className="text-xs">{c.email || '—'}</td>
                <td className="text-xs">{c.tel || '—'}</td>
                <td className="text-muted text-xs">{c.secteur || '—'}</td>
                <td className="text-xs">{c.linkedin ? <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-brand underline">Profil</a> : '—'}</td>
                <td><span className="chip bg-surface text-muted">{c.source || '—'}</span></td>
                <td className="text-xs text-muted">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDel && (
        <Confirm message={`Supprimer ${selected.size} contact(s) ?`}
          onYes={() => { store.logAction('Contact', 'Contacts supprimés', `${selected.size} contact(s)`); store.setSub(d => ({ ...d, contacts: d.contacts.filter(c => !selected.has(c.id)) })); setSelected(new Set()); setConfirmDel(false) }}
          onNo={() => setConfirmDel(false)} />
      )}
    </div>
  )
}
