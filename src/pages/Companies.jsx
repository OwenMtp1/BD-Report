// ---------------------------------------------------------------------------
//  MES ENTREPRISES — la liste des comptes, et l'état de ce qu'on sait d'eux.
//
//  Le kanban Leads montre déjà une carte par société, mais il répond à une autre
//  question : « où en est l'affaire ? ». Ici la question est « que sait-on de ce
//  compte ? » — et c'est celle qui compte au moment de préparer un appel ou de
//  lancer un enrichissement. D'où le tri par informations MANQUANTES plutôt que
//  par étape de pipeline.
//
//  L'écran n'invente aucune donnée : il agrège ce que les rendez-vous, les contacts
//  et la fiche entreprise contiennent déjà, et ouvre la fiche existante.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { Building2, Users, CalendarDays, Search, Sparkles, Globe, Linkedin } from 'lucide-react'
import { useStore, phaseColor } from '../store.jsx'
import { Empty } from '../ui.jsx'
import { openCompany } from './Company.jsx'
import { ENRICHABLE } from '../enrich.js'

const norm = (s) => String(s || '').trim().toLowerCase()

export default function Companies() {
  const store = useStore()
  const sub = store.sub
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all') // 'all' | 'incomplete'

  const rows = useMemo(() => {
    if (!sub) return []
    const infos = sub.companies || {}
    const map = new Map()
    const touch = (name) => {
      const key = norm(name)
      if (!key) return null
      if (!map.has(key)) map.set(key, { name: String(name).trim(), rdvs: [], contacts: 0 })
      return map.get(key)
    }
    ;(sub.rdvs || []).forEach(r => { const e = touch(r.entreprise); if (e) e.rdvs.push(r) })
    ;(sub.contacts || []).forEach(c => { const e = touch(c.entreprise); if (e) e.contacts += 1 })
    // Une société peut n'exister que par sa fiche (enrichie avant le premier rendez-vous).
    Object.keys(infos).forEach(n => touch(n))

    return [...map.values()].map(e => {
      const info = infos[e.name] || {}
      const last = e.rdvs[e.rdvs.length - 1] || null
      const filled = ENRICHABLE.filter(f => String(info[f.id] || '').trim()).length
      return { ...e, info, last, filled, total: ENRICHABLE.length }
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [sub])

  const list = rows.filter(r => {
    if (only === 'incomplete' && r.filled === r.total) return false
    if (!q.trim()) return true
    return norm(r.name).includes(norm(q))
  })

  if (!sub) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Building2 size={20} className="text-brand" /> Mes entreprises</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !py-1.5 !pl-8 text-sm !w-56" placeholder="Rechercher une entreprise" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="flex rounded-lg border border-line overflow-hidden">
            {[['all', 'Toutes'], ['incomplete', 'À compléter']].map(([id, label]) => (
              <button key={id} className={`px-3 py-1.5 text-xs font-semibold ${only === id ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
                onClick={() => setOnly(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        Toutes les sociétés de votre espace, et ce qu'on sait d'elles. Cliquez sur une ligne pour ouvrir sa fiche — actualités, enrichissement, contacts et historique.
      </p>

      {list.length === 0 ? (
        <Empty text={q.trim() ? 'Aucune entreprise ne correspond.' : "Aucune entreprise pour l'instant. Elles apparaissent dès le premier rendez-vous."} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {list.map(r => (
            <button key={r.name} className="card p-3 text-left hover:bg-surface transition" onClick={() => openCompany(r.name)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    <Building2 size={13} className="text-muted shrink-0" /> {r.name}
                  </div>
                  <div className="text-xs text-muted flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="flex items-center gap-1"><CalendarDays size={11} /> {r.rdvs.length} RDV</span>
                    <span className="flex items-center gap-1"><Users size={11} /> {r.contacts} contact{r.contacts > 1 ? 's' : ''}</span>
                    {r.info.secteur && <span className="truncate max-w-[10rem]">{r.info.secteur}</span>}
                    {r.info.effectif && <span>{r.info.effectif}</span>}
                  </div>
                </div>
                {r.last?.phase && <span className={`chip shrink-0 ${phaseColor(r.last.phase)}`}>{r.last.phase}</span>}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Ce qui manque, dit simplement : c'est ce qui déclenche un enrichissement. */}
                {r.filled === r.total
                  ? <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">fiche complète</span>
                  : <span className="chip bg-surface text-muted flex items-center gap-1">
                      <Sparkles size={10} /> {r.total - r.filled} information{r.total - r.filled > 1 ? 's' : ''} à compléter
                    </span>}
                {r.info.site && <span className="chip bg-surface text-muted flex items-center gap-1"><Globe size={10} /> site</span>}
                {r.info.linkedin && <span className="chip bg-surface text-muted flex items-center gap-1"><Linkedin size={10} /> LinkedIn</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
