// ---------------------------------------------------------------------------
//  ATTERRISSAGE DE PÉRIODE
//
//  Le Simulateur répond « combien si je fais X ». Le tableau de bord dit « voilà
//  où j'en suis ». Personne ne répondait à la seule question qui se pose le 12 du
//  mois : « où j'arrive si je continue comme ça ? »
//
//  ⚠️ Deux estimations EXPLICABLES, jamais une prévision savante — et l'écran dit
//  d'où sort chaque chiffre. Un intervalle de confiance calculé sur quinze jours
//  de données aurait l'air scientifique jusqu'au jour où il se trompe, et plus
//  personne ne saurait dire pourquoi.
// ---------------------------------------------------------------------------
import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useStore, landingForecast, QUOTA_METRICS, fmtMoney } from '../store.jsx'

const metricLabel = (id) => QUOTA_METRICS.find(m => m.id === id)?.label || id
const PERIOD_LABEL = { semaine: 'la semaine', mois: 'le mois', trimestre: 'le trimestre', annee: "l'année" }

// Une métrique en euros ne se lit pas comme un compte de rendez-vous.
const fmt = (v, metricId, currency) => (metricId === 'primes' ? fmtMoney(Math.round(v), currency) : Math.round(v))

function Row({ f, currency }) {
  const late = f.onTrack === false
  const good = f.onTrack === true
  const Icon = f.last7 > f.sinceStart ? TrendingUp : f.last7 < f.sinceStart ? TrendingDown : Minus
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-muted">{metricLabel(f.metricId)}</span>
        <span className="text-[11px] text-muted">{f.done > 0 ? `${fmt(f.done, f.metricId, currency)} à ce jour` : 'rien à ce jour'}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <Icon size={16} className={late ? 'text-amber-500' : good ? 'text-emerald-500' : 'text-muted'} />
        <span className="text-xl font-extrabold num">
          {fmt(f.low, f.metricId, currency)}{f.low !== f.high ? ` – ${fmt(f.high, f.metricId, currency)}` : ''}
        </span>
      </div>
      {/* D'où sortent ces deux bornes. Sans cette ligne, le chiffre n'est pas discutable.
          Chaque phrase dans son propre nœud : une chaîne recollée avant l'affichage
          échapperait à la traduction (voir i18nAuto.js). */}
      <p className="text-[11px] text-muted mt-1 leading-snug">
        {fmt(f.sinceStart, f.metricId, currency)} <span>au rythme depuis le début</span> ·{' '}
        {fmt(f.last7, f.metricId, currency)} <span>au rythme des derniers jours</span> ({f.windowDays} j)
      </p>
      {f.target ? (
        <p className={`text-[11px] font-bold mt-1 ${late ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          <span>Objectif</span> {fmt(f.target, f.metricId, currency)} —{' '}
          <span>{late ? 'non tenu sur cette trajectoire' : 'tenu sur cette trajectoire'}</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted mt-1">Aucun objectif fixé pour cette métrique.</p>
      )}
    </div>
  )
}

/**
 * Atterrissage d'une ÉQUIPE : la somme des trajectoires individuelles.
 *
 * ⚠️ Somme des projections, et non projection d'un espace fusionné. Chaque personne a son
 * barème, son quota et sa montée en charge : agréger les rendez-vous avant de calculer
 * aurait produit un chiffre qui n'est celui de personne — et un total de primes faux.
 */
export function TeamLanding({ subs }) {
  const store = useStore()
  const env = store.currentEnv
  const period = env?.quotas?.period || 'mois'
  const metrics = (env?.quotas?.metrics?.length ? env.quotas.metrics : ['rdvPris', 'sql', 'primes'])
  const rows = useMemo(() => metrics.map(id => {
    const each = subs.map(s => landingForecast(s.data || {}, id, { env, subId: s.id, period }))
    const sum = (k) => each.reduce((a, f) => a + (f[k] || 0), 0)
    const target = each.reduce((a, f) => a + (f.target || 0), 0)
    const low = sum('low')
    return {
      metricId: id, period, done: sum('done'),
      sinceStart: sum('sinceStart'), last7: sum('last7'),
      low, high: sum('high'),
      windowDays: each[0]?.windowDays || 7,
      remaining: each[0]?.remaining ?? 0,
      target: target || null,
      onTrack: target ? low >= target : null,
    }
  }), [subs, env, period, metrics.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const currency = subs[0]?.data?.currency
  if (!subs.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {rows.map(f => <Row key={f.metricId} f={f} currency={currency} />)}
    </div>
  )
}

/**
 * Atterrissage d'UN espace. `data` et `subId` permettent de l'utiliser aussi bien
 * pour soi (tableau de bord) que pour un membre de l'équipe (pilotage).
 */
export default function LandingPanel({ data, subId, title, compact }) {
  const store = useStore()
  const env = store.currentEnv
  const period = env?.quotas?.period || 'mois'
  const metrics = (env?.quotas?.metrics?.length ? env.quotas.metrics : ['rdvPris', 'sql', 'primes'])
  const rows = useMemo(
    () => metrics.map(id => landingForecast(data || {}, id, { env, subId, period })),
    [data, subId, env, period, metrics.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (!data) return null
  const first = rows[0]
  return (
    <section className={compact ? '' : 'card p-4'}>
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h3 className="font-extrabold">{title || `Atterrissage — ${PERIOD_LABEL[period] || 'la période'}`}</h3>
        {first && (
          <span className="text-[11px] text-muted">
            {first.remaining > 0 ? `${first.remaining} jour${first.remaining > 1 ? 's' : ''} restants` : 'période terminée'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {rows.map(f => <Row key={f.metricId} f={f} currency={data.currency} />)}
      </div>
    </section>
  )
}
