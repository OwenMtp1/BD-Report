// ---------------------------------------------------------------------------
//  MES ENTREPRISES — la liste des comptes, et l'état de ce qu'on sait d'eux.
//
//  Le kanban Leads montre déjà une carte par société, mais il répond à une autre
//  question : « où en est l'affaire ? ». Ici la question est « que sait-on de ce
//  compte ? » — et c'est celle qui compte au moment de préparer un appel ou de
//  lancer un enrichissement. D'où le tri par informations MANQUANTES plutôt que
//  par étape de pipeline.
//
//  ⚠️ UNE CARTE = UNE ENTREPRISE, pas une affaire. C'est ce qui distingue
//  durablement cet écran de Leads : une société qui porte quatre deals fait ici
//  UNE ligne, avec ce qu'on sait d'elle et ce qui lui manque.
//
//  ⚠️ L'AXE DU KANBAN SE CHOISIT. Le figer sur l'étape du pipeline aurait refait
//  Leads ; le figer sur la complétude n'aurait servi qu'à préparer un
//  enrichissement. On regarde son portefeuille sous l'angle du moment — ce qu'on
//  sait, ce qui bouge, à qui on vend — et l'axe suit.
//
//  L'écran n'invente aucune donnée : il agrège ce que les rendez-vous, les contacts,
//  la fiche entreprise et les signaux contiennent déjà, et ouvre la fiche existante.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { Building2, Users, CalendarDays, Search, Sparkles, Globe, Linkedin, LayoutGrid, LayoutList, MapPin, Radar, X, RefreshCw, KanbanSquare } from 'lucide-react'
import { useStore, phaseColor, companyKey } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'
import { MyPipeline } from './Leads.jsx'
import { ENRICHABLE, enrichCompany, enrichmentDiff } from '../enrich.js'
import { newsRelayUrl } from '../news.js'

const norm = (s) => String(s || '').trim().toLowerCase()
const DAY = 86400000
// Plafond du balayage. Chaque fiche interroge plusieurs sources publiques : en traiter
// deux cents d'un coup les solliciterait sans mesure, et l'attente deviendrait absurde.
const MAX_BULK = 25

// Bandes d'effectif. L'effectif est saisi à la main ou trouvé par l'enrichissement :
// il arrive sous forme de texte (« 200-500 », « ~120 »). On lit le premier nombre —
// mieux vaut classer approximativement que ne rien classer.
const SIZES = [
  { id: '1-50', label: '1–50', min: 1, max: 50 },
  { id: '51-200', label: '51–200', min: 51, max: 200 },
  { id: '201-500', label: '201–500', min: 201, max: 500 },
  { id: '500+', label: '500 et +', min: 501, max: Infinity },
]
const effNum = (v) => { const m = String(v || '').match(/\d[\d\s  ]*/); return m ? Number(m[0].replace(/[^\d]/g, '')) : 0 }
const sizeOf = (v) => { const n = effNum(v); return n ? SIZES.find(b => n >= b.min && n <= b.max) : null }

// Ce qu'on sait d'une fiche, en trois états lisibles. « Partielle » couvre tout
// l'entre-deux : découper plus finement n'aiderait personne à décider quoi faire.
const KNOWLEDGE = [
  { id: 'empty', label: 'Rien de renseigné' },
  { id: 'partial', label: 'Fiche partielle' },
  { id: 'full', label: 'Fiche complète' },
]
const knowledgeOf = (filled, total) => (filled === 0 ? 'empty' : filled >= total ? 'full' : 'partial')

const ACTIVITY = [
  { id: 'hot', label: 'Vue ce mois-ci' },
  { id: 'warm', label: 'Vue ce trimestre' },
  { id: 'cold', label: 'Sans nouvelle depuis 3 mois' },
  { id: 'none', label: 'Jamais de rendez-vous' },
]
const activityOf = (lastDate) => {
  if (!lastDate) return 'none'
  const age = Date.now() - Date.parse(lastDate)
  if (!Number.isFinite(age)) return 'none'
  return age <= 30 * DAY ? 'hot' : age <= 90 * DAY ? 'warm' : 'cold'
}

const SIGNAL_STATE = [
  { id: 'todo', label: 'Signaux à traiter' },
  { id: 'seen', label: 'Signaux traités' },
  { id: 'none', label: 'Aucun signal' },
]

// Les axes de regroupement du kanban. `of` donne la clé d'une entreprise, `columns`
// l'ordre des colonnes — calculé à partir des données pour les axes ouverts (secteur),
// figé pour les axes fermés (on veut « Rien de renseigné » à gauche, toujours).
const AXES = [
  { id: 'knowledge', label: 'Ce qu\'on sait', of: (r) => r.knowledge, columns: () => KNOWLEDGE },
  { id: 'activity', label: 'Dernier contact', of: (r) => r.activity, columns: () => ACTIVITY },
  { id: 'signals', label: 'Signaux', of: (r) => r.signalState, columns: () => SIGNAL_STATE },
  { id: 'phase', label: 'Étape', of: (r) => r.last?.phase || '', columns: (rows, sub) => [
    ...(sub.phases || []).map(p => ({ id: p, label: p })),
    ...((rows.some(r => !r.last?.phase)) ? [{ id: '', label: 'Sans rendez-vous' }] : []),
  ] },
  { id: 'secteur', label: 'Secteur', of: (r) => r.info.secteur || '', columns: (rows) => [
    ...[...new Set(rows.map(r => r.info.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')).map(s => ({ id: s, label: s })),
    ...((rows.some(r => !r.info.secteur)) ? [{ id: '', label: 'Secteur inconnu' }] : []),
  ] },
  { id: 'taille', label: 'Taille', of: (r) => r.size?.id || '', columns: (rows) => [
    ...SIZES.map(b => ({ id: b.id, label: b.label })),
    ...((rows.some(r => !r.size)) ? [{ id: '', label: 'Taille inconnue' }] : []),
  ] },
]

const SORTS = [
  { id: 'name', label: 'Nom (A→Z)' },
  { id: 'recent', label: 'Dernier contact' },
  { id: 'rdvs', label: 'Nombre de rendez-vous' },
  { id: 'missing', label: 'Informations manquantes' },
  { id: 'signals', label: 'Signaux à traiter' },
]

function Badges({ r }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {r.knowledge === 'full'
        ? <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">fiche complète</span>
        : <span className="chip bg-surface text-muted flex items-center gap-1">
            <Sparkles size={10} /> {r.total - r.filled} information{r.total - r.filled > 1 ? 's' : ''} à compléter
          </span>}
      {r.todo > 0 && <span className="chip bg-brand/15 text-brand flex items-center gap-1"><Radar size={10} /> {r.todo} signal{r.todo > 1 ? 'ux' : ''}</span>}
      {r.info.site && <span className="chip bg-surface text-muted flex items-center gap-1"><Globe size={10} /> site</span>}
      {r.info.linkedin && <span className="chip bg-surface text-muted flex items-center gap-1"><Linkedin size={10} /> LinkedIn</span>}
    </div>
  )
}

function Card({ r }) {
  return (
    <button className="card p-3 text-left hover:bg-surface transition w-full" onClick={() => openCompany(r.name)}>
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
            {r.info.localisation && <span className="flex items-center gap-1"><MapPin size={11} /> {r.info.localisation}</span>}
          </div>
        </div>
        {r.last?.phase && <span className={`chip shrink-0 ${phaseColor(r.last.phase)}`}>{r.last.phase}</span>}
      </div>
      <div className="mt-2"><Badges r={r} /></div>
    </button>
  )
}

export default function Companies() {
  const store = useStore()
  const sub = store.sub
  const [view, setView] = useState('list')  // 'list' | 'kanban'
  const [axis, setAxis] = useState('knowledge')
  const [sort, setSort] = useState('name')
  const [q, setQ] = useState('')
  const [f, setF] = useState({ knowledge: '', activity: '', signals: '', phase: '', secteur: '', taille: '', lieu: '' })
  const [busy, setBusy] = useState('')
  const [report, setReport] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const reset = () => { setF({ knowledge: '', activity: '', signals: '', phase: '', secteur: '', taille: '', lieu: '' }); setQ('') }

  const rows = useMemo(() => {
    if (!sub) return []
    const infos = sub.companies || {}
    const map = new Map()
    const touch = (name) => {
      const key = norm(name)
      if (!key) return null
      if (!map.has(key)) map.set(key, { name: String(name).trim(), rdvs: [], contacts: 0, people: [] })
      return map.get(key)
    }
    ;(sub.rdvs || []).forEach(r => { const e = touch(r.entreprise); if (e) e.rdvs.push(r) })
    ;(sub.contacts || []).forEach(c => { const e = touch(c.entreprise); if (e) { e.contacts += 1; e.people.push(c.nom) } })
    // Une société peut n'exister que par sa fiche (enrichie avant le premier rendez-vous).
    Object.keys(infos).forEach(n => touch(n))

    // Les signaux sont rattachés par NOM d'entreprise : on les indexe sous la même clé
    // normalisée que le reste, sinon « Acme » et « ACME » compteraient séparément.
    const byCompany = new Map()
    ;(sub.signals || []).forEach(s => {
      const k = companyKey(s.company)
      if (!byCompany.has(k)) byCompany.set(k, [])
      byCompany.get(k).push(s)
    })

    return [...map.values()].map(e => {
      const info = infos[e.name] || {}
      const last = e.rdvs[e.rdvs.length - 1] || null
      const lastDate = e.rdvs.map(r => r.dateRdv || r.datePriseRdv || r.createdAt || '').filter(Boolean).sort().pop() || ''
      const filled = ENRICHABLE.filter(x => String(info[x.id] || '').trim()).length
      const signals = byCompany.get(companyKey(e.name)) || []
      const todo = signals.filter(s => s.status === 'new').length
      return {
        ...e, info, last, lastDate, filled, total: ENRICHABLE.length,
        knowledge: knowledgeOf(filled, ENRICHABLE.length),
        activity: activityOf(lastDate),
        size: sizeOf(info.effectif || last?.effectif),
        signals, todo,
        signalState: signals.length ? (todo ? 'todo' : 'seen') : 'none',
      }
    })
  }, [sub])

  // Les valeurs proposées aux filtres viennent des DONNÉES : un secteur qu'aucune
  // entreprise ne porte ne sélectionnerait rien, et on ne saurait pas pourquoi.
  const secteurs = useMemo(() => [...new Set(rows.map(r => r.info.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [rows])
  const lieux = useMemo(() => [...new Set(rows.map(r => r.info.localisation).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [rows])

  const list = useMemo(() => {
    const needle = norm(q)
    const out = rows.filter(r => {
      if (f.knowledge && r.knowledge !== f.knowledge) return false
      if (f.activity && r.activity !== f.activity) return false
      if (f.signals && r.signalState !== f.signals) return false
      if (f.phase && (r.last?.phase || '') !== f.phase) return false
      if (f.secteur && r.info.secteur !== f.secteur) return false
      if (f.taille && (r.size?.id || '') !== f.taille) return false
      if (f.lieu && r.info.localisation !== f.lieu) return false
      if (!needle) return true
      // La recherche porte sur tout ce qui identifie un compte — son nom, mais aussi
      // son secteur, son implantation, son site et les personnes qu'on y connaît :
      // on cherche souvent « le SaaS lyonnais » sans se rappeler sa raison sociale.
      return [r.name, r.info.secteur, r.info.localisation, r.info.site, ...r.people].some(v => norm(v).includes(needle))
    })
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'fr'),
      recent: (a, b) => String(b.lastDate).localeCompare(String(a.lastDate)),
      rdvs: (a, b) => b.rdvs.length - a.rdvs.length,
      missing: (a, b) => (b.total - b.filled) - (a.total - a.filled),
      signals: (a, b) => b.todo - a.todo,
    }[sort]
    return out.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name, 'fr'))
  }, [rows, q, f, sort])

  /**
   * ENRICHIR TOUT LE PÉRIMÈTRE VISIBLE, comme le balayage de l'onglet Signaux.
   *
   * ⚠️ SEULS LES CHAMPS VIDES SONT REMPLIS. La règle du produit est « rien n'est écrasé
   * sans décision » : en masse, personne ne décide rien. Une valeur DIFFÉRENTE de celle
   * qu'un commercial a saisie est donc signalée dans le compte rendu et laissée intacte —
   * c'est à la fiche, une par une, qu'on tranche.
   *
   * ⚠️ UNE SEULE ÉCRITURE à la fin : une écriture par société sérialiserait tout l'état
   * autant de fois, et l'interface se figerait le temps du balayage.
   */
  const enrichAll = async () => {
    if (!store.hasModule('aiInsights')) { toast("La brique Analyse IA n'est pas installée."); return }
    if (!newsRelayUrl(store.db)) { setReport({ lines: [], note: "Le relais n'est pas configuré. L'équipe BD Report doit publier son URL." }); return }
    // On ne retravaille que ce qui a des trous : réinterroger une fiche complète
    // n'apprendrait rien et solliciterait les sources pour rien.
    const targets = list.filter(r => r.filled < r.total).slice(0, MAX_BULK)
    if (!targets.length) {
      setReport({ lines: [], note: list.length ? 'Toutes les fiches du périmètre sont déjà complètes.' : 'Aucune entreprise dans ce périmètre.' })
      return
    }
    const lines = []
    const patch = {}
    let filled = 0
    let stop = list.length > MAX_BULK ? `Limité aux ${MAX_BULK} premières fiches à compléter — relancez pour la suite.` : ''
    for (const r of targets) {
      setBusy(r.name)
      const res = await enrichCompany(r.name, r.info, store.db)
      if (res.error) {
        // Relais injoignable ou non configuré : inutile de le redemander vingt fois.
        if (/relais/i.test(res.error)) { stop = res.error; break }
        lines.push({ name: r.name, state: 'error', why: res.error }); continue
      }
      const rows = enrichmentDiff(res.found, r.info)
      const empty = rows.filter(x => x.state === 'empty')
      const conflicts = rows.filter(x => x.state === 'conflict')
      if (empty.length) {
        patch[r.name] = { ...(patch[r.name] || {}) }
        empty.forEach(x => { patch[r.name][x.id] = x.value })
        filled += empty.length
      }
      const why = [
        empty.length ? `${empty.length} champ(s) complété(s) : ${empty.map(x => x.label).join(', ')}` : '',
        conflicts.length ? `${conflicts.length} valeur(s) différente(s) de la vôtre, laissée(s) intacte(s)` : '',
      ].filter(Boolean).join(' · ')
      lines.push({
        name: r.name,
        state: empty.length ? 'ok' : conflicts.length ? 'cached' : 'none',
        why: why || "Rien de plus que ce que la fiche contient déjà.",
      })
    }
    setBusy('')
    // ⚠️ Une seule écriture pour tout le lot.
    const names = Object.keys(patch)
    if (names.length) {
      store.setSub(d => {
        const companies = { ...(d.companies || {}) }
        names.forEach(n => { companies[n] = { ...(companies[n] || {}), ...patch[n] } })
        return { ...d, companies }
      })
    }
    setReport({ lines, note: stop })
    toast(filled ? `${filled} information(s) ajoutée(s)` : 'Aucune information nouvelle — voir le détail.')
  }

  if (!sub) return null

  const active = Object.values(f).filter(Boolean).length + (q.trim() ? 1 : 0)
  const axe = AXES.find(a => a.id === axis) || AXES[0]
  const columns = axe.columns(list, sub)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Building2 size={20} className="text-brand" /> Mes entreprises</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !py-1.5 !pl-8 text-sm !w-64" placeholder="Nom, secteur, ville, contact…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Enrichir TOUT le périmètre visible, comme le balayage de l'onglet Signaux.
              ⚠️ Seuls les champs VIDES sont remplis : en masse, personne ne décide rien,
              et écraser une valeur saisie serait la remplacer sans que son auteur le sache. */}
          {store.hasModule('aiInsights') && (
            <button className="btn-primary !py-1.5 text-xs" disabled={!!busy} onClick={enrichAll}>
              <Sparkles size={13} /> {busy ? `Enrichissement de ${busy}…` : 'Enrichir les fiches'}
            </button>
          )}
          <div className="flex rounded-lg border border-line overflow-hidden">
            {[['list', 'Liste', LayoutList], ['pipeline', 'Mon pipeline', KanbanSquare], ['kanban', 'Kanban', LayoutGrid]].map(([id, label, Icon]) => (
              <button key={id} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${view === id ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
                onClick={() => setView(id)}><Icon size={13} /> {label}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        Toutes les sociétés de votre espace, et ce qu'on sait d'elles. Cliquez sur une carte pour ouvrir sa fiche — signaux, enrichissement, contacts et historique.
      </p>

      {/* Filtres. Chacun n'est proposé que s'il a de quoi filtrer.
          ⚠️ Masqués sur le pipeline : il a les siens (propriétaire, dates), et deux barres
          de filtres superposées sur un même écran ne se comprennent plus. */}
      {view !== 'pipeline' && (
      <div className="card p-3 flex items-end gap-2 flex-wrap">
        <label className="text-xs">
          <span className="label !mb-1">Ce qu'on sait</span>
          <select className="input !py-1.5 !w-auto text-xs" value={f.knowledge} onChange={e => set('knowledge', e.target.value)}>
            <option value="">Toutes les fiches</option>
            {KNOWLEDGE.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="label !mb-1">Dernier contact</span>
          <select className="input !py-1.5 !w-auto text-xs" value={f.activity} onChange={e => set('activity', e.target.value)}>
            <option value="">Peu importe</option>
            {ACTIVITY.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="label !mb-1">Signaux</span>
          <select className="input !py-1.5 !w-auto text-xs" value={f.signals} onChange={e => set('signals', e.target.value)}>
            <option value="">Peu importe</option>
            {SIGNAL_STATE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="label !mb-1">Étape</span>
          <select className="input !py-1.5 !w-auto text-xs" value={f.phase} onChange={e => set('phase', e.target.value)}>
            <option value="">Toutes</option>
            {(sub.phases || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {secteurs.length > 0 && (
          <label className="text-xs">
            <span className="label !mb-1">Secteur</span>
            <select className="input !py-1.5 !w-auto text-xs" value={f.secteur} onChange={e => set('secteur', e.target.value)}>
              <option value="">Tous</option>
              {secteurs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs">
          <span className="label !mb-1">Taille</span>
          <select className="input !py-1.5 !w-auto text-xs" value={f.taille} onChange={e => set('taille', e.target.value)}>
            <option value="">Toutes</option>
            {SIZES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        {lieux.length > 0 && (
          <label className="text-xs">
            <span className="label !mb-1">Implantation</span>
            <select className="input !py-1.5 !w-auto text-xs" value={f.lieu} onChange={e => set('lieu', e.target.value)}>
              <option value="">Toutes</option>
              {lieux.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs">
          <span className="label !mb-1">{view === 'kanban' ? 'Colonnes par' : 'Trier par'}</span>
          {view === 'kanban' ? (
            <select className="input !py-1.5 !w-auto text-xs" value={axis} onChange={e => setAxis(e.target.value)}>
              {AXES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          ) : (
            <select className="input !py-1.5 !w-auto text-xs" value={sort} onChange={e => setSort(e.target.value)}>
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
        </label>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span><b className="text-ink">{list.length}</b> / {rows.length} entreprise(s)</span>
          {active > 0 && <button className="btn-ghost !py-1 text-xs" onClick={reset}><X size={12} /> Effacer les filtres</button>}
        </div>
      </div>
      )}

      {/* ⚠️ LE COMPTE RENDU DIT CE QUI S'EST PASSÉ, FICHE PAR FICHE. Un balayage qui se
          contente de « terminé » laisse croire à une panne quand il n'a rien trouvé, et
          cache les valeurs qu'il a délibérément laissées intactes. */}
      {report && (
        <div className="card p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Dernier enrichissement</span>
            <button className="btn-ghost !p-1 ml-auto" title="Fermer le compte rendu" onClick={() => setReport(null)}><X size={13} /></button>
          </div>
          {report.note && <p className="text-xs text-amber-700 dark:text-amber-300">{report.note}</p>}
          {report.lines.map((l, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <span className="shrink-0">{l.state === 'ok' ? '✅' : l.state === 'cached' ? '✋' : l.state === 'error' ? '⚠️' : '◌'}</span>
              <span className="font-semibold shrink-0">{l.name}</span>
              <span className="text-muted">{l.why}</span>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Empty text={active ? 'Aucune entreprise ne correspond à ces filtres.' : "Aucune entreprise pour l'instant. Elles apparaissent dès le premier rendez-vous."} />
      ) : view === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {list.map(r => <Card key={r.name} r={r} />)}
        </div>
      ) : view === 'pipeline' ? (
        // ⚠️ LE PIPELINE PERSONNEL VIT ICI, plus dans « Leads ». Une carte de pipeline EST
        // une entreprise — le même objet que les lignes de la liste, vu sous l'angle
        // « où en est l'affaire ? » plutôt que « que sait-on de ce compte ? ».
        // « Leads » ne porte plus que le pipeline de l'entreprise, la vue partagée.
        <MyPipeline />
      ) : (
        // Kanban : une colonne par valeur de l'axe choisi. ⚠️ Une colonne VIDE reste
        // affichée — « aucune entreprise ici » est une information, et la faire
        // disparaître ferait croire que la catégorie n'existe pas.
        <div className="flex gap-3 overflow-x-auto pb-2" data-kanban>
          {columns.map(col => {
            const cards = list.filter(r => axe.of(r) === col.id)
            return (
              <div key={col.id || '∅'} className="min-w-[15rem] w-[15rem] shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted truncate">{col.label}</span>
                  <span className="chip bg-surface text-muted shrink-0">{cards.length}</span>
                </div>
                {cards.length === 0
                  ? <p className="text-xs text-muted px-1">Aucune entreprise ici.</p>
                  : cards.map(r => <Card key={r.name} r={r} />)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
