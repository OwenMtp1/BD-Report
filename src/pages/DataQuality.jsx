import React, { useMemo, useState } from 'react'
import {
  ShieldCheck, Phone, Mail, Copy, Building2, CalendarClock, Clock, Tag, ChevronDown, ChevronRight,
  ArrowRight, CheckCircle2,
} from 'lucide-react'
import { useStore, companyKey, todayISO, fmtDate } from '../store.jsx'
import { Empty } from '../ui.jsx'

const dayISO = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }
const lastActivity = (r) => {
  const ds = [r.dateRdv, r.datePriseRdv, r.createdAt, ...((r.history || []).map(h => h.date))].filter(Boolean).sort()
  return ds[ds.length - 1] || ''
}
const go = (page, company) => {
  if (company) window.dispatchEvent(new CustomEvent('open-company', { detail: company }))
  else window.dispatchEvent(new CustomEvent('app-navigate', { detail: page }))
}

// Anneau de score (SVG) — vert/ambre/rouge selon la note.
function ScoreRing({ score }) {
  const R = 54, C = 2 * Math.PI * R
  const color = score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgb(var(--line))" strokeWidth="12" />
        <circle cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-extrabold" style={{ color }}>{score}</div>
        <div className="text-[11px] text-muted font-semibold">/ 100</div>
      </div>
    </div>
  )
}

export default function DataQuality() {
  const store = useStore()
  const sub = store.sub
  const [open, setOpen] = useState(null)

  const { score, checks } = useMemo(() => {
    const rdvs = sub.rdvs || []
    const contacts = sub.contacts || []
    const active = rdvs.filter(r => r.opportunite === 'En cours')
    const cutoff = dayISO(-30)
    const today = todayISO()

    // Doublons de contacts (même email) et d'entreprises (même nom normalisé, écritures différentes).
    const emailMap = {}
    contacts.forEach(c => { const e = (c.email || '').toLowerCase().trim(); if (e) (emailMap[e] = emailMap[e] || []).push(c) })
    const dupContacts = Object.entries(emailMap).filter(([, a]) => a.length > 1)
    const compMap = {}
    rdvs.forEach(r => { const k = companyKey(r.entreprise || ''); if (k) { compMap[k] = compMap[k] || new Set(); compMap[k].add((r.entreprise || '').trim()) } })
    const dupCompanies = Object.entries(compMap).filter(([, set]) => set.size > 1)

    const defs = [
      { id: 'phone', icon: Phone, label: 'Contacts sans téléphone', denom: contacts.length,
        items: contacts.filter(c => !(c.tel || '').trim()).map(c => ({ label: c.nom || c.email || '—', sub: c.entreprise || '', page: 'contacts' })) },
      { id: 'email', icon: Mail, label: 'Contacts sans e-mail', denom: contacts.length,
        items: contacts.filter(c => !(c.email || '').trim()).map(c => ({ label: c.nom || '—', sub: c.entreprise || '', page: 'contacts' })) },
      { id: 'dupc', icon: Copy, label: 'Doublons de contacts (même e-mail)', denom: contacts.length,
        items: dupContacts.map(([e, a]) => ({ label: a[0].nom || e, sub: `${a.length} fiches · ${e}`, page: 'contacts' })) },
      { id: 'dupco', icon: Building2, label: 'Doublons d’entreprises potentiels', denom: Object.keys(compMap).length,
        items: dupCompanies.map(([k, set]) => ({ label: [...set].join(' / '), sub: 'écritures différentes', company: [...set][0] })) },
      { id: 'sector', icon: Tag, label: 'RDV sans secteur d’activité', denom: rdvs.length,
        items: rdvs.filter(r => !(r.secteur || '').trim()).map(r => ({ label: r.entreprise || '—', sub: r.phase || '', company: r.entreprise })) },
      { id: 'source', icon: Tag, label: 'RDV sans source de lead', denom: rdvs.length,
        items: rdvs.filter(r => !(r.source || '').trim()).map(r => ({ label: r.entreprise || '—', sub: r.phase || '', company: r.entreprise })) },
      { id: 'next', icon: CalendarClock, label: 'Leads sans prochaine action', denom: active.length,
        items: active.filter(r => !(r.dateRdv && r.dateRdv >= today)).map(r => ({ label: r.entreprise || '—', sub: `dernier contact ${fmtDate(lastActivity(r))}`, company: r.entreprise })) },
      { id: 'stale', icon: Clock, label: 'Opportunités inactives depuis > 30 j', denom: active.length,
        items: active.filter(r => { const la = lastActivity(r); return la && la < cutoff }).map(r => ({ label: r.entreprise || '—', sub: `inactif depuis ${fmtDate(lastActivity(r))}`, company: r.entreprise })) },
    ]

    const applicable = defs.filter(d => d.denom > 0)
    const passRate = (d) => 1 - Math.min(1, d.items.length / Math.max(1, d.denom))
    const score = applicable.length ? Math.round(100 * applicable.reduce((a, d) => a + passRate(d), 0) / applicable.length) : 100
    return { score, checks: defs.map(d => ({ ...d, count: d.items.length })) }
  }, [sub.rdvs, sub.contacts])

  const withIssues = checks.filter(c => c.count > 0)
  const clean = checks.filter(c => c.count === 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2"><ShieldCheck size={20} className="text-brand" /> Qualité des données</h2>
        <p className="text-xs text-muted -mt-0.5">Repérez et corrigez les données manquantes, les doublons et les leads oubliés de votre espace.</p>
      </div>

      <div className="card p-5 flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={score} />
        <div className="flex-1 w-full">
          <div className="text-sm font-bold mb-2">{score >= 85 ? 'Excellente hygiène de données 🎉' : score >= 60 ? 'Quelques corrections à faire' : 'Données à nettoyer en priorité'}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {withIssues.slice(0, 4).map(c => (
              <button key={c.id} onClick={() => setOpen(c.id)} className="rounded-xl bg-surface p-2.5 text-left hover:bg-line/40">
                <div className="text-xl font-extrabold text-amber-600">{c.count}</div>
                <div className="text-[11px] text-muted leading-tight">{c.label}</div>
              </button>
            ))}
            {withIssues.length === 0 && <div className="col-span-full text-sm text-emerald-600 font-semibold flex items-center gap-1.5"><CheckCircle2 size={16} /> Aucun problème détecté.</div>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {withIssues.map(c => (
          <div key={c.id} className="card overflow-hidden">
            <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 flex items-center justify-center shrink-0"><c.icon size={17} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{c.label}</div>
                <div className="text-xs text-muted">{c.count} élément{c.count > 1 ? 's' : ''} · {Math.round((1 - c.count / Math.max(1, c.denom)) * 100)}% conformes</div>
              </div>
              <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15">{c.count}</span>
              {open === c.id ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
            </button>
            {open === c.id && (
              <div className="border-t border-line p-2 space-y-1 max-h-72 overflow-y-auto">
                {c.items.slice(0, 60).map((it, i) => (
                  <button key={i} onClick={() => go(it.page, it.company)} className="w-full flex items-center justify-between gap-2 text-sm p-2 rounded-lg hover:bg-surface text-left">
                    <span className="min-w-0"><span className="font-semibold block truncate">{it.label}</span>{it.sub && <span className="text-xs text-muted block truncate">{it.sub}</span>}</span>
                    <ArrowRight size={14} className="text-muted shrink-0" />
                  </button>
                ))}
                {c.items.length > 60 && <div className="text-xs text-muted text-center py-1">+ {c.items.length - 60} autre(s)…</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {clean.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-bold uppercase text-muted mb-2">Contrôles au vert</div>
          <div className="flex flex-wrap gap-2">
            {clean.map(c => <span key={c.id} className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15"><CheckCircle2 size={12} /> {c.label}</span>)}
          </div>
        </div>
      )}

      {(sub.rdvs || []).length === 0 && <Empty text="Aucune donnée à analyser pour l'instant." />}
    </div>
  )
}
