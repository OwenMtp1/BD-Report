import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Building2, User, StickyNote, CalendarDays, Users2 } from 'lucide-react'
import { useStore, fmtDate } from './store.jsx'
import { openCompany } from './pages/Company.jsx'

// Recherche globale (Ctrl/Cmd+K) : entreprises, contacts, RDV, notes.
export default function GlobalSearch({ onNavigate }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) }
      if (e.key === 'Escape') setOpen(false)
    }
    const opener = () => setOpen(true)
    window.addEventListener('keydown', h)
    window.addEventListener('open-global-search', opener)
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('open-global-search', opener) }
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  const sub = store.sub
  const results = useMemo(() => {
    if (!sub || q.trim().length < 2) return []
    const needle = q.trim().toLowerCase()
    const match = (v) => (v || '').toLowerCase().includes(needle)
    const out = []
    // Collaborateurs de l'environnement : accès à leur fiche + conversation directe.
    const mySubId = store.session?.subEnvId
    store.db.subenvs.filter(s => s.envId === store.session?.envId && (match(s.prenom) || match(s.nom) || match(s.poste) || match(`${s.prenom} ${s.nom}`)))
      .slice(0, 5).forEach(s => out.push({
        kind: 'Collaborateur', icon: Users2, label: `${s.prenom} ${s.nom}`.trim() || 'Collaborateur',
        sub: [s.poste, s.id === mySubId ? 'vous' : null].filter(Boolean).join(' · '),
        go: () => window.dispatchEvent(new CustomEvent('open-collaborator', { detail: s.id })),
      }))
    const companies = [...new Set(sub.rdvs.map(r => (r.entreprise || '').trim()).filter(Boolean))]
    companies.filter(c => c.toLowerCase().includes(needle)).slice(0, 5).forEach(c =>
      out.push({ kind: 'Entreprise', icon: Building2, label: c, sub: `${sub.rdvs.filter(r => r.entreprise === c).length} RDV`, go: () => openCompany(c) }))
    sub.contacts.filter(c => match(c.nom) || match(c.email) || match(c.poste)).slice(0, 5).forEach(c =>
      out.push({ kind: 'Contact', icon: User, label: c.nom || c.email, sub: [c.poste, c.entreprise].filter(Boolean).join(' · '), go: () => { onNavigate('contacts'); c.entreprise && openCompany(c.entreprise) } }))
    sub.rdvs.filter(r => match(r.entreprise) || match(r.notes) || (r.contacts || []).some(c => match(c.nom))).slice(0, 5).forEach(r =>
      out.push({ kind: 'RDV', icon: CalendarDays, label: `${r.entreprise} — ${r.phase}`, sub: `RDV : ${fmtDate(r.dateRdv)}`, go: () => onNavigate('rdv') }))
    sub.notes.filter(n => match(n.title) || match(n.content)).slice(0, 5).forEach(n =>
      out.push({ kind: 'Note', icon: StickyNote, label: n.title, sub: fmtDate(n.createdAt), go: () => onNavigate('notes') }))
    return out.slice(0, 12)
  }, [q, sub, onNavigate])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[12vh] p-4" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="card w-full max-w-xl shadow-2xl fade-in overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <Search size={17} className="text-muted" />
          <input ref={inputRef} className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Rechercher une entreprise, un contact, un RDV, une note..." value={q} onChange={e => setQ(e.target.value)} />
          <kbd className="text-[10px] text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {q.trim().length < 2 && <p className="text-xs text-muted text-center py-6">Tapez au moins 2 caractères… (raccourci : Ctrl/Cmd + K)</p>}
          {q.trim().length >= 2 && results.length === 0 && <p className="text-xs text-muted text-center py-6">Aucun résultat pour « {q} ».</p>}
          {results.map((r, i) => (
            <button key={i} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface text-left"
              onClick={() => { r.go(); setOpen(false); setQ('') }}>
              <r.icon size={16} className="text-brand shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{r.label}</span>
                <span className="block text-xs text-muted truncate">{r.sub}</span>
              </span>
              <span className="chip bg-surface text-muted">{r.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
