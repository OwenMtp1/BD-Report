import React, { useEffect, useRef, useState } from 'react'
import { Building2, Globe, MapPin, Linkedin, Euro, CalendarDays, Users, StickyNote, MessageSquare, Send, Trash2, Newspaper, Sparkles, RefreshCw, ExternalLink, X, Flame, Factory } from 'lucide-react'
import { useStore, fmtDate, PHASE_COLORS, OPP_COLORS, phaseColor, oppColor } from '../store.jsx'
import { Modal, Field, Empty, toast } from '../ui.jsx'
import { fetchCompanyNews, analyzeCompanyNews, cachedNews, newsRelayUrl } from '../news.js'
import { enrichCompany, cachedEnrichment, enrichmentDiff, ENRICHABLE } from '../enrich.js'

const CONF_CLASS = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'bg-surface text-muted',
}
const URGENCY_CLASS = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  LOW: 'bg-surface text-muted',
}
const fmtNewsDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * ✨ ENRICHIR — panneau ouvert DANS la fiche entreprise.
 *
 * Deux principes gouvernent cet écran :
 *  · ON NE CRÉE AUCUN CHAMP. La liste vient de `ENRICHABLE`, qui décrit les champs
 *    réellement présents dans la fiche. Rien d'autre ne peut arriver jusqu'ici.
 *  · ON N'ÉCRASE RIEN SANS DEMANDER. Un champ vide se propose ; un champ déjà rempli
 *    dont la valeur trouvée diffère s'affiche EN REGARD de l'actuelle, et c'est
 *    l'utilisateur qui tranche. Appliquer en silence reviendrait à préférer une
 *    trouvaille de l'IA à ce qu'un commercial a saisi de sa main.
 */
function EnrichPanel({ name, info, store, onApply, onClose }) {
  const [found, setFound] = useState(() => cachedEnrichment(name)?.found || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState({})
  const relay = newsRelayUrl(store.db)
  const quota = store.aiUsageToday()

  const rows = found ? enrichmentDiff(found, info) : []
  const usable = rows.filter(r => r.state === 'empty' || r.state === 'conflict')

  const run = async (force) => {
    if (store.aiQuotaReached()) { setError(`Plafond interne atteint (${quota.limit} appels aujourd'hui). Réessayez demain, ou relevez-le dans Paramètres.`); return }
    setBusy(true); setError('')
    const r = await enrichCompany(name, info, store.db, { force })
    setBusy(false)
    if (r.error) {
      if (!r.fromCache) store.recordAiCall({ feature: 'company_enrichment', companyId: name, status: 'error' })
      setError(r.error); return
    }
    // Seul un appel RÉEL est décompté : une réponse du cache n'a rien consommé.
    if (!r.fromCache) {
      store.recordAiCall({
        feature: 'company_enrichment', companyId: name, status: 'ok',
        model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
      })
    }
    setFound(r.found)
    // Les champs vides sont cochés d'avance — il n'y a rien à y perdre. Les conflits,
    // non : remplacer une donnée existante se décide, ça ne se subit pas.
    const pre = {}
    enrichmentDiff(r.found, info).forEach(x => { if (x.state === 'empty') pre[x.id] = true })
    setPicked(pre)
  }

  useEffect(() => { if (!found && relay) run(false) }, []) // eslint-disable-line

  const apply = () => {
    const chosen = rows.filter(r => picked[r.id] && r.value)
    if (!chosen.length) return
    onApply(chosen.map(r => ({ id: r.id, value: r.value })))
    toast(`${chosen.length} information(s) appliquée(s)`)
    onClose()
  }

  return (
    <div className="rounded-xl border border-line bg-surface/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm flex items-center gap-1.5"><Sparkles size={15} className="text-brand" /> Enrichissement</span>
        <button className="btn-ghost !p-1" onClick={onClose} title="Fermer l'enrichissement"><X size={14} /></button>
      </div>

      {!relay && <p className="text-xs text-muted">Le relais n'est pas configuré. L'équipe BD Report doit publier son URL dans Paramètres → Intégrations.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {relay && busy && (
        <div className="space-y-1">
          <p className="text-xs text-muted">Recherche des informations publiques…</p>
          {ENRICHABLE.map(f => <div key={f.id} className="text-xs text-muted">◌ {f.label}</div>)}
        </div>
      )}

      {relay && !busy && found && (
        <>
          {usable.length === 0 ? (
            <p className="text-sm text-muted">Aucune information publique nouvelle. La fiche est déjà à jour, ou rien de fiable n'a été trouvé.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => {
                if (r.state === 'none') return <div key={r.id} className="text-xs text-muted">◌ {r.label} — rien trouvé</div>
                if (r.state === 'same') return <div key={r.id} className="text-xs text-muted">✓ {r.label} — déjà à jour</div>
                return (
                  <label key={r.id} className="flex items-start gap-2 rounded-xl bg-card border border-line p-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={!!picked[r.id]}
                      onChange={e => setPicked(p => ({ ...p, [r.id]: e.target.checked }))} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold flex items-center gap-2 flex-wrap">
                        {r.label}
                        <span className={`chip ${CONF_CLASS[r.hit.confidence] || CONF_CLASS.low}`}>confiance {r.hit.confidence}</span>
                        {r.state === 'conflict' && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15">valeur différente</span>}
                      </div>
                      {r.state === 'conflict' && (
                        <div className="text-xs text-muted mt-0.5">Actuel : <span className="line-through">{r.current}</span></div>
                      )}
                      <div className="text-sm break-words">{r.value}</div>
                      <div className="text-[11px] text-muted">
                        {r.hit.publisher || 'source non nommée'}
                        {r.hit.url && <> · <a href={r.hit.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">source</a></>}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button className="btn-ghost !py-1 text-xs" onClick={() => run(true)}>
              <RefreshCw size={12} /> Actualiser
            </button>
            <div className="ml-auto flex gap-2">
              <button className="btn-ghost !py-1 text-xs" onClick={onClose}>Annuler</button>
              <button className="btn-primary !py-1 text-xs" disabled={!rows.some(r => picked[r.id])} onClick={apply}>Appliquer</button>
            </div>
          </div>
          <p className="text-[11px] text-muted">Informations publiques sur l'entreprise uniquement — jamais sur les personnes qui y travaillent.</p>
        </>
      )}
    </div>
  )
}

/**
 * 📰 ACTUALITÉS — panneau ouvert DANS la fiche entreprise.
 *
 * Deux temps, volontairement séparés : on récupère d'abord les dépêches (gratuit,
 * mis en cache 24 h), et l'analyse par l'IA ne part QUE sur demande. Analyser
 * automatiquement à chaque ouverture d'une fiche reviendrait à payer un appel pour
 * des articles que personne ne lira, et à faire attendre l'utilisateur sans qu'il
 * l'ait demandé.
 *
 * L'IA ne travaille que sur les articles récupérés : le relais retire toute URL
 * qu'elle aurait inventée, plutôt que d'envoyer un commercial vers une page vide.
 */
function NewsPanel({ name, store, onClose }) {
  const [state, setState] = useState(() => {
    const hit = cachedNews(name)
    return hit ? { articles: hit.articles || [], signals: hit.signals || null, at: hit.at } : null
  })
  const [busy, setBusy] = useState('')     // '' | 'news' | 'ai'
  const [error, setError] = useState('')
  const relay = newsRelayUrl(store.db)

  const load = async (force) => {
    setBusy('news'); setError('')
    const r = await fetchCompanyNews(name, store.db, { force })
    setBusy('')
    if (r.error) { setError(r.error); return }
    setState({ articles: r.articles, signals: r.signals, at: r.cachedAt })
  }
  const analyse = async () => {
    // Plafond interne atteint : les actualités RESTENT lisibles, seule l'analyse s'arrête.
    // Une fonctionnalité qui s'éteint entièrement parce que l'IA n'est plus disponible
    // punit l'utilisateur d'une limite qui n'est pas la sienne.
    if (store.aiQuotaReached()) {
      const q = store.aiUsageToday()
      setError(`Plafond interne atteint (${q.limit} appels aujourd'hui). Les actualités restent consultables.`)
      return
    }
    setBusy('ai'); setError('')
    const r = await analyzeCompanyNews(name, state?.articles || [], store.db)
    setBusy('')
    if (r.error) { store.recordAiCall({ feature: 'news_analysis', companyId: name, status: 'error' }); setError(r.error); return }
    store.recordAiCall({ feature: 'news_analysis', companyId: name, status: 'ok' })
    setState(s => ({ ...s, signals: r.signals }))
    store.logAction('Lead', 'Actualités analysées', name)
    toast(r.signals.length ? `${r.signals.length} signal(s) commercial(aux)` : 'Aucun signal commercial détecté.')
  }

  // Première ouverture sans cache : on va chercher les dépêches, pas l'IA.
  useEffect(() => { if (!state && relay) load(false) }, []) // eslint-disable-line

  const articles = state?.articles || []
  const signals = state?.signals

  return (
    <div className="rounded-xl border border-line bg-surface/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm flex items-center gap-1.5"><Newspaper size={15} className="text-brand" /> Actualités</span>
        <button className="btn-ghost !p-1" onClick={onClose} title="Fermer les actualités"><X size={14} /></button>
      </div>

      {!relay && (
        <p className="text-xs text-muted">
          Le relais Actualités n'est pas configuré. L'équipe BD Report doit publier son URL dans Paramètres → Intégrations.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {relay && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">
              {busy === 'news' ? 'Recherche en cours…' : `${articles.length} actualité${articles.length > 1 ? 's' : ''} trouvée${articles.length > 1 ? 's' : ''}`}
            </span>
            {articles.length > 0 && !signals && (
              <button className="btn-primary !py-1 text-xs" disabled={busy === 'ai'} onClick={analyse}>
                <Sparkles size={13} /> {busy === 'ai' ? 'Analyse en cours…' : 'Analyser avec l\'IA'}
              </button>
            )}
            <button className="btn-ghost !py-1 text-xs ml-auto" disabled={!!busy} onClick={() => load(true)}>
              <RefreshCw size={12} /> Actualiser les actualités
            </button>
          </div>

          {/* Résultat de l'analyse, quand elle a eu lieu. */}
          {signals && signals.length === 0 && (
            <p className="text-sm text-muted">Aucun signal commercial détecté.</p>
          )}
          {signals && signals.length > 0 && (
            <div className="space-y-2">
              {signals.map((s, i) => (
                <div key={i} className="rounded-xl border border-brand/30 bg-brand/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="chip bg-brand/15 text-brand flex items-center gap-1"><Flame size={11} /> Signal commercial</span>
                    {s.type && <span className="chip bg-surface text-muted">{s.type}</span>}
                  </div>
                  <div className="font-bold text-sm">{s.title}</div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-muted">Pertinence <b className="text-ink">{s.score}/100</b></span>
                    <span className={`chip ${URGENCY_CLASS[s.urgency] || URGENCY_CLASS.LOW}`}>{s.urgency}</span>
                  </div>
                  {s.summary && <p className="text-sm text-ink/90">{s.summary}</p>}
                  {s.why_now && (
                    <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Pourquoi maintenant — </span>{s.why_now}</p>
                  )}
                  {(s.targets || []).length > 0 && (
                    <div className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Cibles — </span>{s.targets.join(' · ')}</div>
                  )}
                  {s.angle && (
                    <p className="text-sm italic">« {s.angle} »</p>
                  )}
                  <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
                    <span>{[s.source, fmtNewsDate(s.date)].filter(Boolean).join(' · ')}</span>
                    {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline flex items-center gap-0.5">Lire <ExternalLink size={10} /></a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Les dépêches elles-mêmes : elles restent visibles sous l'analyse, pour
              qu'on puisse vérifier ce sur quoi l'IA s'est appuyée. */}
          {articles.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-2">
              {articles.map((a, i) => (
                <div key={i} className="text-sm">
                  <div className="text-[11px] text-muted">{fmtNewsDate(a.date)}</div>
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-brand font-medium">{a.title}</a>
                  {a.source && <div className="text-[11px] text-muted">{a.source}</div>}
                </div>
              ))}
            </div>
          )}
          {!busy && !articles.length && !error && (
            <p className="text-sm text-muted">Aucune actualité trouvée pour cette entreprise ces 30 derniers jours.</p>
          )}
        </>
      )}
    </div>
  )
}

// Ouvre la fiche entreprise depuis n'importe quelle page (événement global).
export function openCompany(name) {
  if (!name) return
  window.dispatchEvent(new CustomEvent('open-company', { detail: name }))
}

// Fil de commentaires partagé : stocké au niveau de l'environnement, visible par tous ses membres.
function CommentThread({ name, store }) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState([])          // suggestions de mention ouvertes
  const [hi, setHi] = useState(0)               // suggestion surlignée
  const [mentioned, setMentioned] = useState([]) // subIds choisis dans la liste — cible exacte
  const inputRef = useRef(null)
  const curSub = store.db.subenvs.find(s => s.id === store.session.subEnvId)
  const comments = store.companyComments(name)
  const teammates = store.db.subenvs.filter(s => s.envId === store.session.envId && s.id !== curSub?.id)

  // Met en évidence les @mentions dans le texte affiché. On teste le nom complet AVANT le
  // prénom seul : sinon « @Lucas Fabre » ne serait surligné que sur la moitié du nom.
  const renderText = (t) => {
    const people = store.db.subenvs.filter(s => s.envId === store.session.envId)
    if (!people.length) return t
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const forms = [
      ...people.map(s => esc(`${s.prenom} ${s.nom}`.trim())),
      ...people.map(s => esc(s.prenom)),
    ].filter(Boolean)
    const re = new RegExp(`(@(?:${forms.join('|')}))`, 'gi')
    return t.split(re).map((part, i) => (part || '').startsWith('@')
      ? <span key={i} className="text-brand font-bold">{part}</span>
      : part)
  }

  // Autocomplétion : dès deux lettres après un @, on propose les collègues. Le choix
  // enregistre l'identifiant de la personne — c'est lui qui sert à notifier, jamais le
  // texte : deux Lucas dans une équipe et la notification partirait aux deux.
  const onType = (value, caret) => {
    setText(value)
    const before = value.slice(0, caret)
    const m = before.match(/@([\p{L}\p{N}\-'’ ]*)$/u)
    const token = m ? m[1] : null
    if (token == null || token.trim().length < 2) { setHits([]); return }
    const q = token.trim().toLowerCase()
    const found = teammates.filter(s =>
      `${s.prenom} ${s.nom}`.toLowerCase().includes(q) || (s.poste || '').toLowerCase().includes(q)).slice(0, 6)
    setHits(found); setHi(0)
  }
  const pick = (s) => {
    const el = inputRef.current
    const caret = el ? el.selectionStart : text.length
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}\-'’ ]*)$/u, '')
    const full = `${s.prenom} ${s.nom}`.trim()
    const next = `${before}@${full} ${text.slice(caret)}`
    setText(next)
    setMentioned(ids => (ids.includes(s.id) ? ids : [...ids, s.id]))
    setHits([])
    // Le curseur doit rester après la mention, sinon la frappe suivante repart du début.
    setTimeout(() => { if (el) { el.focus(); const p = before.length + full.length + 2; el.setSelectionRange(p, p) } }, 0)
  }
  const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const send = () => {
    if (!text.trim()) return
    // On ne transmet que les personnes encore citées dans le texte : effacer une mention
    // avant d'envoyer doit vraiment annuler la notification.
    const still = mentioned.filter(id => {
      const s = teammates.find(x => x.id === id)
      return s && text.toLowerCase().includes('@' + `${s.prenom} ${s.nom}`.trim().toLowerCase())
    })
    store.addCompanyComment(name, text, still)
    store.logAction('Lead', 'Commentaire ajouté', name)
    setText(''); setMentioned([]); setHits([])
  }
  return (
    <div>
      <p className="label flex items-center gap-1.5"><MessageSquare size={13} /> Commentaires d'équipe ({comments.length}) <span className="normal-case font-normal">— visibles par toute l'organisation</span></p>
      <div className="space-y-1.5 mb-2">
        {comments.length === 0 && <p className="text-xs text-muted">Aucun commentaire. Soyez le premier à partager une info sur ce compte.</p>}
        {comments.map(c => (
          <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-surface text-sm">
            <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center shrink-0">
              {c.author.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs">{c.author}</span>
                <span className="text-[10px] text-muted">{fmtTs(c.ts)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{renderText(c.text)}</p>
            </div>
            {c.authorSubId === curSub?.id && (
              <button className="p-1 rounded hover:bg-card text-red-400" title="Supprimer mon commentaire"
                onClick={() => store.deleteCompanyComment(name, c.id)}><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 relative">
        <div className="flex-1 relative">
          <input ref={inputRef} className="input !py-1.5 text-sm w-full"
            placeholder="Ajouter un commentaire… (tapez @ puis deux lettres pour citer un collègue)" value={text}
            onChange={e => onType(e.target.value, e.target.selectionStart)}
            onBlur={() => setTimeout(() => setHits([]), 150)}
            onKeyDown={e => {
              if (hits.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => (i + 1) % hits.length); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => (i - 1 + hits.length) % hits.length); return }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(hits[hi]); return }
                if (e.key === 'Escape') { setHits([]); return }
              }
              if (e.key === 'Enter') send()
            }} />
          {hits.length > 0 && (
            <div className="absolute z-40 left-0 right-0 bottom-full mb-1 card p-1 shadow-xl max-h-52 overflow-y-auto">
              {hits.map((s, i) => (
                <button key={s.id} type="button"
                  className={`w-full text-left p-2 rounded-lg ${i === hi ? 'bg-brand/10' : 'hover:bg-surface'}`}
                  onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}>
                  <div className="text-sm font-semibold">{s.prenom} {s.nom}</div>
                  <div className="text-[11px] text-muted truncate">{[s.poste, s.service].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn-primary !px-2.5" onClick={send}><Send size={14} /></button>
      </div>
      {mentioned.length > 0 && (
        <p className="text-[11px] text-muted mt-1">
          Sera notifié : {mentioned.map(id => teammates.find(s => s.id === id)).filter(Boolean).map(s => `${s.prenom} ${s.nom}`).join(', ')}
        </p>
      )}
    </div>
  )
}

// Modale "Fiche entreprise" : tous les RDV, contacts et notes de la société + infos société éditables.
export default function CompanyModal() {
  const store = useStore()
  const [name, setName] = useState(null)
  const [news, setNews] = useState(false)     // panneau Actualités, replié par défaut
  const [enrich, setEnrich] = useState(false) // panneau Enrichir, replié par défaut
  const prevHash = useRef(null) // hash de l'onglet avant ouverture, pour le restaurer à la fermeture

  useEffect(() => {
    // Changer d'entreprise referme le panneau : il montrerait sinon les actualités
    // de la société précédente sous le nom de la nouvelle.
    const h = (e) => { setNews(false); setEnrich(false); setName(e.detail) }
    window.addEventListener('open-company', h)
    return () => window.removeEventListener('open-company', h)
  }, [])

  // URL partageable : la fiche ouverte se reflète dans #/company/<nom> ; à la fermeture,
  // on restaure l'onglet précédent (ou le tableau de bord si on venait d'un lien direct).
  useEffect(() => {
    if (name) {
      const target = '#/company/' + encodeURIComponent(name)
      if (prevHash.current === null && !window.location.hash.startsWith('#/company/')) {
        prevHash.current = window.location.hash || '#/dashboard'
      }
      if (window.location.hash !== target) window.location.hash = target
    } else if (window.location.hash.startsWith('#/company/')) {
      const restore = prevHash.current || '#/dashboard'
      prevHash.current = null
      window.location.hash = restore
    }
  }, [name])

  const sub = store.sub
  if (!name || !sub) return null

  const rdvs = sub.rdvs.filter(r => (r.entreprise || '').trim().toLowerCase() === name.trim().toLowerCase())
  const contacts = sub.contacts.filter(c => (c.entreprise || '').trim().toLowerCase() === name.trim().toLowerCase())
  const notes = sub.notes.filter(n => (n.content || '').toLowerCase().includes(name.toLowerCase()) || (n.title || '').toLowerCase().includes(name.toLowerCase()))
  const info = (sub.companies || {})[name] || {}
  const rep = rdvs[rdvs.length - 1]

  const setInfo = (k, v) => store.setSub(d => ({
    ...d,
    companies: { ...(d.companies || {}), [name]: { ...((d.companies || {})[name] || {}), [k]: v } },
  }))

  return (
    <Modal title={<span className="flex items-center gap-2"><Building2 size={18} className="text-brand" /> {name}</span>} onClose={() => setName(null)} wide>
      <div className="space-y-5">
        {/* Actions de la fiche. Une seule pour l'instant : elle vit ici plutôt que dans une
            page à part — on consulte les actualités d'une entreprise en la regardant. */}
        {/* Les deux actions relèvent d'une seule brique : elles partagent le relais, la clé
            et le compteur. Un client qui n'a pas pris l'analyse IA ne voit ni l'une ni l'autre. */}
        {store.hasModule('aiInsights') && (
          <div className="flex items-center gap-2 flex-wrap">
            <button className={`btn-ghost !py-1 text-xs ${news ? 'text-brand' : ''}`} onClick={() => setNews(v => !v)}>
              <Newspaper size={13} /> Actualités
            </button>
            <button className={`btn-ghost !py-1 text-xs ${enrich ? 'text-brand' : ''}`} onClick={() => setEnrich(v => !v)}>
              <Sparkles size={13} /> Enrichir
            </button>
          </div>
        )}
        {news && <NewsPanel name={name} store={store} onClose={() => setNews(false)} />}
        {enrich && (
          <EnrichPanel name={name} info={info} store={store} onClose={() => setEnrich(false)}
            onApply={(list) => {
              // Une seule écriture pour tous les champs retenus : passer par `setInfo`
              // champ par champ enchaînerait autant de mises à jour d'état, dont chacune
              // repartirait de la précédente — la dernière seule survivrait.
              store.setSub(d => ({
                ...d,
                companies: {
                  ...(d.companies || {}),
                  [name]: { ...((d.companies || {})[name] || {}), ...Object.fromEntries(list.map(x => [x.id, x.value])) },
                },
              }))
              store.logAction('Lead', 'Fiche enrichie', `${name} — ${list.map(x => x.id).join(', ')}`)
            }} />
        )}

        {/* Infos société (enrichissement manuel) */}
        <div className="rounded-xl bg-surface p-3">
          <p className="label">Infos société</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5">
              <Euro size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="CA (ex : 5 M€)" value={info.ca || ''} onChange={e => setInfo('ca', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Globe size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Site web" value={info.site || ''} onChange={e => setInfo('site', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Linkedin size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="LinkedIn entreprise" value={info.linkedin || ''} onChange={e => setInfo('linkedin', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Localisation" value={info.localisation || ''} onChange={e => setInfo('localisation', e.target.value)} />
            </div>
            {/* Effectif et secteur étaient lus sur le DERNIER rendez-vous : deux commerciaux
                pouvaient donc voir deux valeurs pour la même société, et rien ne permettait de
                corriger celle qui était fausse. Ce sont des attributs de l'ENTREPRISE — ils
                vivent maintenant sur sa fiche. La valeur du rendez-vous sert encore de point
                de départ tant que personne n'a saisi la sienne. */}
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Effectif" value={info.effectif ?? (rep?.effectif || '')} onChange={e => setInfo('effectif', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Factory size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Secteur d'activité" value={info.secteur ?? (rep?.secteur || '')} onChange={e => setInfo('secteur', e.target.value)} />
            </div>
          </div>
          {rep && <div className="flex gap-2 mt-2 text-xs text-muted flex-wrap">
            {rep.source && <span>Source : <b>{rep.source}</b></span>}
            {rep.provenance && <span>Provenance : <b>{rep.provenance}</b></span>}
          </div>}
        </div>

        {/* RDV */}
        <div>
          <p className="label flex items-center gap-1.5"><CalendarDays size={13} /> Rendez-vous ({rdvs.length})</p>
          {rdvs.length === 0 ? <Empty text="Aucun rendez-vous." /> : (
            <div className="space-y-1.5">
              {rdvs.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-surface flex-wrap">
                  <span className={`chip ${phaseColor(r.phase)}`}>{r.phase}</span>
                  <span className={`chip ${oppColor(r.opportunite)}`}>{r.opportunite}</span>
                  <span className="text-muted text-xs">RDV : {fmtDate(r.dateRdv)} · pris le {fmtDate(r.datePriseRdv)}</span>
                  {r.notes && <span className="text-xs text-muted truncate max-w-[16rem]" title={r.notes}>📝 {r.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div>
          <p className="label flex items-center gap-1.5"><Users size={13} /> Contacts ({contacts.length})</p>
          {contacts.length === 0 ? <Empty text="Aucun contact." /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {contacts.map(c => (
                <div key={c.id} className="text-sm p-2 rounded-lg bg-surface">
                  <div className="font-semibold">{c.nom} <span className="text-muted text-xs font-normal">{c.poste}</span></div>
                  <div className="text-xs text-muted">{[c.email, c.tel].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commentaires partagés (visibles par toute l'organisation) */}
        <CommentThread name={name} store={store} />

        {/* Notes liées */}
        {notes.length > 0 && (
          <div>
            <p className="label flex items-center gap-1.5"><StickyNote size={13} /> Notes mentionnant l'entreprise ({notes.length})</p>
            <div className="space-y-1.5">
              {notes.map(n => (
                <div key={n.id} className="text-sm p-2 rounded-lg bg-surface">
                  <span className="font-semibold">{n.title}</span> <span className="text-xs text-muted">— {fmtDate(n.createdAt)}</span>
                  <p className="text-xs text-muted line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
