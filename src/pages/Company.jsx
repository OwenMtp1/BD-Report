import React, { useEffect, useRef, useState } from 'react'
import { Building2, Globe, MapPin, Linkedin, Euro, CalendarDays, Users, StickyNote, MessageSquare, Send, Trash2, Sparkles, RefreshCw, X, Factory, Radar, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore, fmtDate, PHASE_COLORS, OPP_COLORS, phaseColor, oppColor, SIGNAL_TYPES, signalType } from '../store.jsx'
import { Modal, Field, Empty, toast } from '../ui.jsx'
import { newsRelayUrl } from '../news.js'
import { enrichCompany, cachedEnrichment, enrichmentDiff, ENRICHABLE } from '../enrich.js'
import { collectEvidence, analyzeEvidence, buildContext, cachedCollect } from '../signals.js'

const CONF_CLASS = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'bg-surface text-muted',
}
const fmtNewsDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}


// Ce que chaque source a donné, en une phrase. Le relais renvoie le motif ; l'écran
// n'en invente aucun — « rien trouvé » et « pas de site renseigné » sont deux situations
// différentes, et seule la seconde se corrige.
const SOURCE_LABELS = { news: 'Presse', website: 'Site de l\'entreprise', careers: 'Page carrière' }

/**
 * SIGNAUX D'UNE ENTREPRISE — ex-« Actualités », fusionnés en une seule rubrique.
 *
 * ⚠️ UN SEUL GESTE. Il y avait deux panneaux et deux boutons : « chercher les
 * actualités », puis « analyser avec l'IA ». Personne ne veut une liste de dépêches —
 * on veut savoir s'il y a une raison d'appeler ce compte. La recherche va donc
 * directement jusqu'au bout, et c'est le RÉSULTAT DE L'IA qui s'affiche.
 *
 * ⚠️ LES SOURCES NE S'ÉTALENT PLUS : elles se dépliENT. Un signal sans ses preuves est
 * une affirmation, elles doivent donc rester atteignables — mais les lire n'est pas ce
 * qu'on vient faire, et elles noyaient l'analyse qu'elles servaient à vérifier.
 *
 * ⚠️ L'IA NE PART JAMAIS SEULE : aucune collecte ni analyse au montage. Le panneau
 * s'ouvre sur ce qu'on sait déjà, et n'appelle le relais que sur un clic.
 */
function SignalsPanel({ name, info, store, onClose }) {
  const rules = store.envNewsRules()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [openSources, setOpenSources] = useState(false)
  const [state, setState] = useState(() => { const c = cachedCollect(name); return c ? { items: c.items || [], stats: c.stats || {} } : null })
  const mine = (store.sub?.signals || []).filter(s => s.company === name)
  const ctx = buildContext(rules, SIGNAL_TYPES, store.envIcpProfiles())
  const relay = newsRelayUrl(store.db)
  const items = state?.items || []

  /**
   * Chercher = collecter PUIS analyser. La collecte ne coûte rien ; seule l'analyse
   * consomme, et on ne la lance pas sur des preuves inexistantes.
   */
  const chercher = async (force) => {
    setError('')
    setBusy('collect')
    const col = await collectEvidence(name, info.site, ctx, store.db, { force })
    if (col.error) { setBusy(''); setError(col.error); return }
    setState({ items: col.items || [], stats: col.stats || {} })
    if (!(col.items || []).length) {
      setBusy(''); setOpenSources(true)
      setError('Aucune preuve publique trouvée — voir le détail par source ci-dessous.')
      return
    }
    // Plafond INTERNE atteint : les preuves restent consultables, seule l'analyse s'arrête.
    // Une fonctionnalité qui s'éteint entièrement punit l'utilisateur d'une limite qui
    // n'est pas la sienne.
    if (store.aiQuotaReached()) {
      setBusy(''); setOpenSources(true)
      setError(`Plafond interne atteint (${store.aiUsageToday().limit} appels aujourd'hui). Les sources restent consultables.`)
      return
    }
    setBusy('ai')
    const r = await analyzeEvidence(name, col.items, ctx, store.db)
    setBusy('')
    if (r.error) {
      if (!r.quota) store.recordAiCall({ feature: 'news_analysis', companyId: name, status: 'error' })
      setOpenSources(true) // l'analyse manque : ce qu'on a trouvé doit au moins se lire
      setError(r.error); return
    }
    store.recordAiCall({ feature: 'news_analysis', companyId: name, status: 'ok', model: r.model })
    store.saveCompanySignals(name, r.signals)
    store.logAction('Lead', 'Signaux analysés', name)
    toast(r.signals.length ? `${r.signals.length} signal(s) détecté(s)` : 'Aucun signal commercial détecté.')
  }

  const label = busy === 'collect' ? 'Recherche des sources…' : busy === 'ai' ? 'Analyse en cours…' : mine.length ? 'Relancer la recherche' : 'Chercher des signaux'

  return (
    <div className="rounded-xl border border-line bg-surface/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm flex items-center gap-1.5"><Radar size={15} className="text-brand" /> Signaux commerciaux</span>
        <button className="btn-ghost !p-1" onClick={onClose} title="Fermer les signaux"><X size={14} /></button>
      </div>

      {!relay && <p className="text-xs text-muted">Le relais n'est pas configuré. L'équipe BD Report doit publier son URL dans Paramètres → Intégrations.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {relay && (
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-primary !py-1 text-xs" disabled={!!busy} onClick={() => chercher(!!mine.length)}>
            <Sparkles size={13} /> {label}
          </button>
          {mine.length > 0 && !busy && <span className="text-xs text-muted">{mine.length} signal(s) en mémoire</span>}
        </div>
      )}

      {/* LES SIGNAUX, directement — c'est ce qu'on est venu chercher. */}
      {mine.length === 0 && !busy && !error && (
        <p className="text-sm text-muted">Aucun signal pour ce compte. Lancez une recherche : les sources publiques sont ramassées, puis analysées avec le contexte commercial de votre environnement.</p>
      )}
      {mine.map(s => {
        const t = signalType(s.type)
        return (
          <div key={s.id} className="rounded-xl border border-brand/30 bg-brand/5 p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip bg-brand/15 text-brand">{t.emoji} {t.label}</span>
              <span className="text-xs text-muted">Confiance {s.confidence}/100</span>
            </div>
            <div className="font-bold text-sm">{s.title}</div>
            {s.summary && <p className="text-sm">{s.summary}</p>}
            {s.whyNow && <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Pourquoi maintenant — </span>{s.whyNow}</p>}
            {s.whyRelevant && <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Pourquoi c'est pertinent — </span>{s.whyRelevant}</p>}
            {s.opportunity && <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Opportunité — </span>{s.opportunity}</p>}
            {s.persona && <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Persona — </span>{s.persona}</p>}
            {s.action && <p className="text-sm"><span className="text-muted text-xs uppercase tracking-wide">Action — </span>{s.action}</p>}
            {/* LES PREUVES. Un signal sans ses sources est une affirmation. */}
            {(s.evidence || []).length > 0 && (
              <div className="border-t border-line pt-1.5 space-y-0.5">
                <div className="text-[11px] uppercase tracking-wide text-muted">Preuves</div>
                {s.evidence.map((e, i) => (
                  <div key={i} className="text-[11px] text-muted">
                    {e.title} — {e.publisher || 'source'}
                    {e.url && <> · <a href={e.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">voir</a></>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* LES SOURCES — repliées. Elles restent atteignables (un signal sans ses preuves
          est une affirmation), mais ne s'étalent plus par-dessus l'analyse qu'elles servent
          à vérifier. Le détail par source dit POURQUOI une recherche n'a rien donné :
          « rien trouvé » et « pas de site renseigné » ne se corrigent pas de la même façon. */}
      {(items.length > 0 || (state?.stats?.bySource || []).length > 0) && (
        <div className="border-t border-line pt-2">
          <button className="text-xs text-muted hover:text-brand flex items-center gap-1" onClick={() => setOpenSources(o => !o)}>
            {openSources ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Sources{items.length ? ` (${items.length})` : ''}
          </button>
          {openSources && (
            <div className="mt-2 space-y-2">
              {(state?.stats?.bySource || []).map(s => (
                <div key={s.kind} className="text-[11px] text-muted">
                  <b className="text-ink">{SOURCE_LABELS[s.kind] || s.kind}</b>
                  {' — '}{s.n > 0 ? <span>{s.n} élément(s)</span> : <span>{s.why || 'Aucun résultat.'}</span>}
                </div>
              ))}
              {items.length > 0 && (
                <div className="space-y-1 border-t border-line pt-2">
                  {items.map((it, i) => (
                    <div key={i} className="text-xs">
                      {it.date && <span className="text-[11px] text-muted">{fmtNewsDate(it.date)} · </span>}
                      <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-brand">{it.title}</a>
                      <span className="text-muted"> — {it.publisher || SOURCE_LABELS[it.kind] || it.kind}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
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

  const rows = found ? enrichmentDiff(found, info) : []
  const usable = rows.filter(r => r.state === 'empty' || r.state === 'conflict')

  // ⚠️ AUCUN APPEL D'IA ICI — ni quota, ni plafond, ni délai d'attente. L'enrichissement
  // ne lit plus que des bases publiques (annuaire des entreprises, Wikidata). Les verrous
  // qui restaient empêchaient la requête de PARTIR (« Quota Google atteint, réessayez dans
  // 39 secondes ») alors que plus rien, derrière, n'avait besoin de Gemini.
  const run = async (force) => {
    setBusy(true); setError('')
    const r = await enrichCompany(name, info, store.db, { force })
    setBusy(false)
    if (r.error) { setError(r.error); return }
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
  const [enrich, setEnrich] = useState(false) // panneau Enrichir, replié par défaut
  const [sig, setSig] = useState(false)       // panneau Signaux (ex-Actualités), replié par défaut
  const prevHash = useRef(null) // hash de l'onglet avant ouverture, pour le restaurer à la fermeture

  useEffect(() => {
    // Changer d'entreprise referme le panneau : il montrerait sinon les signaux
    // de la société précédente sous le nom de la nouvelle.
    const h = (e) => { setEnrich(false); setSig(false); setName(e.detail) }
    // L'onglet Signaux ouvre la fiche DIRECTEMENT sur le détail : « Analyse détaillée… »
    // doit mener à l'analyse, pas à une fiche où il faudrait encore chercher.
    const v = (e) => { if (e.detail === 'signals') setSig(true) }
    window.addEventListener('company-view', v)
    window.addEventListener('open-company', h)
    return () => { window.removeEventListener('open-company', h); window.removeEventListener('company-view', v) }
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
        {/* Actions de la fiche : elles vivent ici plutôt que dans une page à part — on
            regarde les signaux d'une entreprise en la regardant, elle.
            ⚠️ « Actualités » a DISPARU : c'était la même fonctionnalité, arrêtée à
            mi-chemin. Elle ramenait des dépêches qu'il fallait ensuite faire analyser
            d'un second clic ; « Signaux » va jusqu'au bout en un seul geste, et range
            les dépêches là où elles servent — dans les sources, dépliables.
            Les deux actions relèvent d'une seule brique : elles partagent le relais, la clé
            et le compteur. Un client qui n'a pas pris l'analyse IA ne voit ni l'une ni l'autre. */}
        {store.hasModule('aiInsights') && (
          <div className="flex items-center gap-2 flex-wrap">
            <button className={`btn-ghost !py-1 text-xs ${sig ? 'text-brand' : ''}`} onClick={() => setSig(v => !v)}>
              <Radar size={13} /> Signaux
            </button>
            <button className={`btn-ghost !py-1 text-xs ${enrich ? 'text-brand' : ''}`} onClick={() => setEnrich(v => !v)}>
              <Sparkles size={13} /> Enrichir
            </button>
          </div>
        )}
        {sig && <SignalsPanel name={name} info={info} store={store} onClose={() => setSig(false)} />}
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
