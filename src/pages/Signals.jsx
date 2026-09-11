// ---------------------------------------------------------------------------
//  SIGNAUX — l'écran de Sales Intelligence.
//
//  Ce n'est pas une liste d'articles : chaque carte est un FAIT qui donne une raison
//  d'appeler ce compte maintenant, avec le score qui dit à quel point, et les preuves
//  qui le soutiennent. Le RÉSUMÉ tient ici ; « Analyse détaillée… » ouvre la fiche de
//  l'entreprise, là où vit le reste de ce qu'on sait d'elle.
//
//  ⚠️ Rien ne s'analyse tout seul. Le balayage est un geste : il coûte un appel IA par
//  entreprise, et une liste qui se remplit sans qu'on l'ait demandé se paie deux fois —
//  en quota, et en confiance quand elle se trompe.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { Radar, Search, RefreshCw, ArrowRight, Check, EyeOff, Flame, X } from 'lucide-react'
import { useStore, SIGNAL_TYPES, signalType, signalScore, SIGNAL_PRIORITIES, fmtDate } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'
import { collectEvidence, analyzeEvidence, buildContext, cachedCollect, evidencePrint } from '../signals.js'

const STATUS = [
  { id: 'new', label: 'Non traité' },
  { id: 'done', label: 'Traité' },
  { id: 'ignored', label: 'Ignoré' },
]
const scoreClass = (n) => n >= 75
  ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  : n >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : 'bg-surface text-muted'

/** Ouvre la fiche de l'entreprise sur sa vue Signaux — le détail vit là où vit le compte. */
export const openSignalDetail = (company) => {
  window.dispatchEvent(new CustomEvent('open-company', { detail: company }))
  window.dispatchEvent(new CustomEvent('company-view', { detail: 'signals' }))
}

export default function Signals() {
  const store = useStore()
  const sub = store.sub
  const rules = store.envNewsRules()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('new')
  const [minScore, setMinScore] = useState(0)
  const [busy, setBusy] = useState('')
  const [report, setReport] = useState(null) // compte rendu du dernier balayage

  // Le score est RECALCULÉ à l'affichage : la fraîcheur baisse avec les jours, et la
  // priorité du staff peut changer. Un score figé à la détection vieillirait en silence.
  const rows = useMemo(() => {
    const prio = Object.fromEntries((rules.signals || []).map(s => [s.id, s.priority || 'medium']))
    return (sub?.signals || []).map(s => ({
      ...s,
      score: signalScore({
        importance: s.importance, relevance: s.relevance, confidence: s.confidence,
        date: s.date, sources: s.evidence || [], priority: prio[s.type] || 'medium',
        matchConfidence: s.matchConfidence ?? 1,
      }),
    })).sort((a, b) => b.score - a.score)
  }, [sub?.signals, rules.signals])

  const list = rows.filter(s => {
    if (status && s.status !== status) return false
    if (type && s.type !== type) return false
    if (minScore && s.score < minScore) return false
    if (q.trim()) {
      const hay = `${s.company} ${s.title} ${s.summary}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })

  // Entreprises à balayer : celles qu'on suit, les plus actives d'abord.
  const companies = useMemo(() => {
    const map = new Map()
    ;(sub?.rdvs || []).forEach(r => {
      const n = (r.entreprise || '').trim()
      if (n) map.set(n, (map.get(n) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
  }, [sub?.rdvs])

  /**
   * ⚠️ UN BALAYAGE QUI NE TROUVE RIEN DOIT DIRE POURQUOI.
   * Il avalait chaque erreur et concluait « aucun nouveau signal » — le même message que le
   * relais soit périmé, l'entreprise sans site, la presse muette ou le quota atteint. On ne
   * pouvait donc rien corriger. Chaque compte repart maintenant avec sa raison.
   */
  const scan = async (limit) => {
    if (!store.hasModule('aiInsights')) { toast('La brique Analyse IA n\'est pas installée.'); return }
    const ctx = buildContext(rules, SIGNAL_TYPES, store.envIcpProfiles())
    const targets = companies.slice(0, limit)
    if (!targets.length) {
      setReport({ lines: [], note: "Aucune entreprise à analyser : les comptes viennent de vos rendez-vous." })
      return
    }
    const lines = []
    let made = 0
    let stop = ''
    for (const name of targets) {
      setBusy(name)
      const info = (sub.companies || {})[name] || {}
      const col = await collectEvidence(name, info.site, ctx, store.db)
      if (col.outdated) { stop = col.error; break }
      if (col.error) { lines.push({ name, state: 'error', why: col.error }); continue }
      if (!(col.items || []).length) {
        lines.push({ name, state: 'empty', why: info.site
          ? 'Rien trouvé : ni presse, ni page du site, ni offre publiée.'
          : "Rien trouvé — et aucun site web n'est renseigné, donc deux sources sur trois sont inutilisables." })
        continue
      }
      // ⚠️ On n'analyse QUE si les preuves ont changé : re-payer pour un résultat identique
      // est la façon la plus sûre d'épuiser le quota sans rien apprendre.
      const cached = cachedCollect(name)
      if (cached?.signals && cached.print === evidencePrint(col.items)) {
        store.saveCompanySignals(name, cached.signals, { analyzedAt: cached.analyzedAt })
        lines.push({ name, state: 'cached', why: `${cached.signals.length} signal(s), analyse déjà faite sur ces mêmes preuves.` })
        continue
      }
      const res = await analyzeEvidence(name, col.items, ctx, store.db)
      if (res.quota) { stop = res.error; break }
      if (res.error) { lines.push({ name, state: 'error', why: res.error }); continue }
      store.recordAiCall({ feature: 'news_analysis', companyId: name, status: 'ok', model: res.model })
      store.saveCompanySignals(name, res.signals)
      made += res.signals.length
      lines.push({
        name,
        state: res.signals.length ? 'ok' : 'none',
        why: res.signals.length
          ? `${res.signals.length} signal(s) — ${col.items.length} preuve(s) analysée(s).`
          : `${col.items.length} preuve(s) analysée(s), aucune ne constitue un signal commercial.`,
      })
    }
    setBusy('')
    setReport({ lines, note: stop })
    toast(made ? `${made} signal(s) détecté(s)` : 'Aucun nouveau signal — voir le détail du balayage.')
  }

  if (!sub) return null
  if (!store.hasModule('aiInsights')) {
    return <Empty text="La brique « Analyse IA des entreprises » n'est pas installée sur cet environnement." />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Radar size={20} className="text-brand" /> Signaux</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-ghost !py-1 text-xs" disabled={!!busy} onClick={() => scan(5)}>
            <RefreshCw size={12} /> {busy ? `Analyse de ${busy}…` : 'Analyser 5 comptes'}
          </button>
          <button className="btn-primary !py-1 text-xs" disabled={!!busy} onClick={() => scan(20)}>
            <Radar size={13} /> Balayer mes comptes
          </button>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        Les faits qui donnent une raison d'appeler maintenant, classés par ce qu'ils valent pour votre offre. Rien ne s'analyse tout seul : chaque balayage consomme.
      </p>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !py-1.5 !pl-8 text-sm !w-48" placeholder="Entreprise ou mot-clé" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto !py-1.5 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous les états</option>
          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-sm" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Tous les signaux</option>
          {SIGNAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-sm" value={minScore} onChange={e => setMinScore(Number(e.target.value))}>
          <option value={0}>Tous les scores</option>
          <option value={50}>50 et plus</option>
          <option value={75}>75 et plus — prioritaires</option>
        </select>
        <span className="text-xs text-muted ml-auto">{list.length} signal{list.length > 1 ? 'aux' : ''}</span>
      </div>

      {/* Compte rendu du dernier balayage : sans lui, « aucun signal » ne dit rien de ce
          qu'il faudrait corriger — un relais périmé, un site manquant, ou simplement un
          compte dont personne ne parle. */}
      {report && (
        <div className="card p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Dernier balayage</span>
            <button className="btn-ghost !p-1 ml-auto" title="Fermer le compte rendu" onClick={() => setReport(null)}><X size={13} /></button>
          </div>
          {report.note && <p className="text-xs text-amber-700 dark:text-amber-300">{report.note}</p>}
          {report.lines.map((l, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <span className="shrink-0">{l.state === 'ok' ? '✅' : l.state === 'cached' ? '💾' : l.state === 'error' ? '⚠️' : '◌'}</span>
              <span className="font-semibold shrink-0">{l.name}</span>
              <span className="text-muted">{l.why}</span>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Empty text={rows.length
          ? 'Aucun signal ne correspond à ces filtres.'
          : "Aucun signal pour l'instant. Lancez un balayage de vos comptes."} />
      ) : (
        <div className="space-y-2">
          {list.map(s => {
            const t = signalType(s.type)
            return (
              <div key={s.id} className="card p-3 space-y-2">
                <div className="flex items-start gap-3 flex-wrap">
                  <span className={`chip ${scoreClass(s.score)} flex items-center gap-1 shrink-0`}>
                    {s.score >= 75 && <Flame size={11} />} {s.score}/100
                  </span>
                  <div className="min-w-0 flex-1">
                    <button className="font-bold text-sm hover:text-brand text-left" onClick={() => openSignalDetail(s.company)}>
                      {s.company}
                    </button>
                    <div className="text-xs text-muted">{t.emoji} {t.label}{s.date ? ` · ${fmtDate(String(s.date).slice(0, 10))}` : ''}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="btn-ghost !p-1.5" title="Marquer traité" onClick={() => { store.setSignalStatus(s.id, 'done'); toast('Signal traité') }}><Check size={13} /></button>
                    <button className="btn-ghost !p-1.5" title="Ignorer" onClick={() => { store.setSignalStatus(s.id, 'ignored'); toast('Signal ignoré') }}><EyeOff size={13} /></button>
                  </div>
                </div>
                <div className="font-semibold text-sm">{s.title}</div>
                {s.summary && <p className="text-sm text-ink/90">{s.summary}</p>}
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted">
                  {s.persona && <span className="chip bg-surface text-muted">🎯 {s.persona}</span>}
                  <span>Confiance {s.confidence}/100</span>
                  <span>{(s.evidence || []).length} preuve{(s.evidence || []).length > 1 ? 's' : ''}</span>
                  <button className="text-brand hover:underline flex items-center gap-1 ml-auto" onClick={() => openSignalDetail(s.company)}>
                    Analyse détaillée… <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
