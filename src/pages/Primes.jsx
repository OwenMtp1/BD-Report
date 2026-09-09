import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { AlertTriangle, Activity, Settings2, Gauge } from 'lucide-react'
import { useStore, computePrimes, primeOpts, computeActivityPrimes, monthKey, monthLabel, fmtDate, fmtMoney, parseISO, SOURCES, DEFAULT_PHASES, DEFAULT_PRIME_CUTOFF, DEFAULT_PRIME_PHASES, phaseProbability, milestonePhase, applyPrimeRules } from '../store.jsx'
import { Empty } from '../ui.jsx'
import { MyStatement } from './Statements.jsx'

const SUIVI_TL = [
  { id: 'next', label: 'Le mois suivant' },
  { id: 'cur', label: 'Ce mois-ci' },
  { id: 'prev', label: 'Le mois dernier' },
  { id: '3m', label: 'Les 3 derniers mois' },
  { id: 'year', label: 'Cette année' },
  { id: 'total', label: 'Total Primes' },
  { id: 'custom', label: 'Date personnalisée' },
]

function monthOf(offset) {
  const n = new Date()
  return monthKey(new Date(n.getFullYear(), n.getMonth() + offset, 1))
}

function filterPrimes(primes, tl, custom) {
  if (tl === 'total') return primes
  if (tl === 'cur') return primes.filter(p => p.payMonthKey === monthOf(0))
  if (tl === 'next') return primes.filter(p => p.payMonthKey === monthOf(1))
  if (tl === 'prev') return primes.filter(p => p.payMonthKey === monthOf(-1))
  if (tl === '3m') { const ks = [monthOf(0), monthOf(-1), monthOf(-2)]; return primes.filter(p => ks.includes(p.payMonthKey)) }
  if (tl === 'year') return primes.filter(p => p.payMonthKey?.startsWith(String(new Date().getFullYear())))
  if (tl === 'custom') {
    return primes.filter(p => {
      const d = parseISO(p.triggerDate)
      if (!d) return false
      if (custom.start && d < parseISO(custom.start)) return false
      if (custom.end && d > parseISO(custom.end)) return false
      return !!(custom.start || custom.end)
    })
  }
  return primes
}

export default function Primes() {
  const store = useStore()
  const sub = store.sub
  // Deux types de barème : par lead (effectif × source) + par activité (volume de RDV × phases).
  const allPrimes = useMemo(() => [
    ...computePrimes(sub.rdvs, sub.bareme, primeOpts(sub)),
    ...computeActivityPrimes(sub.rdvs, sub.activityRules),
  ], [sub.rdvs, sub.bareme, sub.activityRules])
  const primes = allPrimes.filter(p => !p.invalidated)   // stats & sommes : primes valides uniquement
  const invalidated = allPrimes.filter(p => p.invalidated)
  const phaseOptions = (sub.phases && sub.phases.length ? sub.phases : DEFAULT_PHASES)
  // Réglages de l'écosystème rappelés à l'écran : la règle décrite doit être celle qui s'applique.
  const cutoffDay = sub.primeCutoffDay || DEFAULT_PRIME_CUTOFF
  const triggerLabel = (sub.primePhases && sub.primePhases.length ? sub.primePhases : DEFAULT_PRIME_PHASES).join(' ou ')

  const [repTl, setRepTl] = useState('cur')
  const [repCustom, setRepCustom] = useState({})
  const [suiviTl, setSuiviTl] = useState('year')
  const [suiviCustom, setSuiviCustom] = useState({})
  const [openPrime, setOpenPrime] = useState('')

  const repPrimes = filterPrimes(primes, repTl, repCustom)
  const suiviPrimes = filterPrimes(primes, suiviTl, suiviCustom)

  const suiviByMonth = {}
  suiviPrimes.forEach(p => {
    if (!p.payMonthKey) return
    suiviByMonth[p.payMonthKey] = suiviByMonth[p.payMonthKey] || { label: p.payMonthLabel, total: 0, sk: p.payMonthKey }
    suiviByMonth[p.payMonthKey].total += p.montant
  })
  const suiviPoints = Object.values(suiviByMonth).sort((a, b) => a.sk.localeCompare(b.sk))

  const setBareme = (rows) => store.setSub(d => ({ ...d, bareme: rows }))
  const patchRow = (id, k, v) => setBareme(sub.bareme.map(r => r.id === id ? { ...r, [k]: v } : r))

  // ---- Tableau stats : répartition sources + tranches d'effectif du barème
  const tranches = [...new Map(sub.bareme.map(b => [`${b.min}-${b.max}`, { min: Number(b.min), max: Number(b.max) }])).values()]
    .sort((a, b) => a.min - b.min)
  const totalRdv = sub.rdvs.length || 1
  const srcCounts = Object.fromEntries(SOURCES.map(s => [s, sub.rdvs.filter(r => r.source === s).length]))
  const trancheCount = (t) => sub.rdvs.filter(r => { const e = Number(r.effectif) || 0; return e >= t.min && e <= t.max }).length

  // ---- Modulateurs de prime (seuil / accélérateur / qualité / plafond) sur le mois en cours.
  // Ils ne s'appliquent jamais à une prime isolée mais au TOTAL d'un mois de paiement : c'est
  // à cette maille que se décide une politique de rémunération variable.
  const curMonthKey = monthKey(new Date())
  const rawMonth = primes.filter(p => p.payMonthKey === curMonthKey).reduce((a, p) => a + p.montant, 0)
  const modulated = useMemo(
    () => applyPrimeRules(rawMonth, {
      data: sub,
      env: store.db.environments.find(e => e.id === store.session?.envId),
      subId: store.session?.subEnvId,
      monthKey: curMonthKey,
    }),
    [rawMonth, sub.primeRules, sub.rdvs, curMonthKey], // eslint-disable-line
  )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Primes & Commissions</h2>

      {/* Détail du calcul du mois. Affiché dès qu'une règle joue : un montant modifié sans
          explication est un litige qui arrive. */}
      {modulated.steps.length > 0 && (
        <div className="card p-4">
          <h3 className="font-bold flex items-center gap-2"><Gauge size={16} className="text-brand" /> Calcul de vos primes du mois</h3>
          {modulated.reference && (
            <p className="text-xs text-muted mt-0.5">
              Référence : {modulated.reference.done} / {modulated.reference.target} sur votre quota, soit {modulated.reference.pct} %.
            </p>
          )}
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Total du barème</span>
              <span className="font-semibold num">{fmtMoney(rawMonth, sub.currency)}</span>
            </div>
            {modulated.steps.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted min-w-0">{s.label}</span>
                <span className={`num shrink-0 ${s.to < s.from ? 'text-red-500' : 'text-emerald-600'}`}>
                  {fmtMoney(Math.round(s.to), sub.currency)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-1.5 border-t border-line">
              <span className="font-bold">Versé ce mois</span>
              <span className="font-extrabold num text-brand">{fmtMoney(modulated.total, sub.currency)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Le relevé mensuel : le document opposable, une fois le manager passé dessus. */}
      {store.hasModule('statements') && <MyStatement />}

      {invalidated.length > 0 && (
        <div className="card p-4 !border-amber-300 dark:!border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5">
          <h3 className="font-bold flex items-center gap-2 text-amber-700 dark:text-amber-300"><AlertTriangle size={16} /> Primes invalidées ({invalidated.length})</h3>
          <p className="text-xs text-muted mb-2">Invalidées par un manager — elles ne comptent pas dans vos statistiques.</p>
          <div className="space-y-1">
            {invalidated.map(p => (
              <div key={p.rdvId} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-card">
                <span className="font-semibold line-through text-muted truncate">{p.entreprise} — {fmtMoney(p.montant)}</span>
                <span className="text-xs text-muted shrink-0">par {p.invalidatedBy}{p.invalidatedReason ? ` · ${p.invalidatedReason}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tableau de suivi primes (graphique) */}
        <div className="card p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="font-bold">Tableau de suivi primes</h3>
            <div className="flex items-center gap-1">
              <select className="input !w-auto !py-1.5 text-xs font-semibold" value={suiviTl} onChange={e => setSuiviTl(e.target.value)}>
                {SUIVI_TL.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {suiviTl === 'custom' && <>
                <input type="date" className="input !w-auto !py-1 text-xs" value={suiviCustom.start || ''} onChange={e => setSuiviCustom(c => ({ ...c, start: e.target.value }))} />
                <input type="date" className="input !w-auto !py-1 text-xs" value={suiviCustom.end || ''} onChange={e => setSuiviCustom(c => ({ ...c, end: e.target.value }))} />
              </>}
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 mb-2">{fmtMoney(suiviPrimes.reduce((a, p) => a + p.montant, 0))}</div>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={suiviPoints} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
                <XAxis dataKey="label" fontSize={11} stroke="rgb(var(--muted))" />
                <YAxis fontSize={11} stroke="rgb(var(--muted))" />
                <Tooltip formatter={(v) => fmtMoney(v)} />
                {/* Sans plafond, un seul mois de données occupe toute la largeur de la
                    zone et se lit comme un aplat de couleur, plus comme un graphique. */}
                <Bar dataKey="total" name="Primes" fill="rgb(var(--brand))" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reporting primes (en haut à droite) */}
        <div className="card p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="font-bold">Reporting primes</h3>
            <div className="flex items-center gap-1">
              <select className="input !w-auto !py-1.5 text-xs font-semibold" value={repTl} onChange={e => setRepTl(e.target.value)}>
                <option value="cur">Ce mois-ci</option>
                <option value="next">Le mois suivant</option>
                <option value="prev">Le mois dernier</option>
                <option value="custom">Date personnalisée</option>
              </select>
              {repTl === 'custom' && <>
                <input type="date" className="input !w-auto !py-1 text-xs" value={repCustom.start || ''} onChange={e => setRepCustom(c => ({ ...c, start: e.target.value }))} />
                <input type="date" className="input !w-auto !py-1 text-xs" value={repCustom.end || ''} onChange={e => setRepCustom(c => ({ ...c, end: e.target.value }))} />
              </>}
            </div>
          </div>
          {/* Le jour de bascule se règle dans « Créer votre écosystème » : l'annoncer en dur
              décrirait une règle que l'équipe a pu changer. */}
          <p className="text-xs text-muted mb-3">Règle : déclenchée à la date de passage en {triggerLabel}. Payée le mois en cours si le passage a lieu avant le {cutoffDay}, sinon le mois suivant. 🔒 = prime figée au barème en vigueur lors du passage (un changement de barème ne réécrit pas le passé).</p>
          {repPrimes.length === 0 ? <Empty text="Aucune prime sur cette période." /> : (
            <div className="space-y-1.5">
              {repPrimes.sort((a, b) => b.montant - a.montant).map((p, i) => {
                const key = (p.rdvId || p.id)
                const act = p.kind === 'activity'
                return (
                  <div key={key + i}>
                    <button className="w-full flex items-center justify-between text-sm p-2 rounded-xl bg-surface hover:bg-line/50"
                      onClick={() => setOpenPrime(openPrime === key ? '' : key)}>
                      <span className="font-semibold flex items-center gap-1.5">
                        {act && <Activity size={13} className="text-brand shrink-0" title="Prime d'activité" />}
                        #{i + 1} — {act ? `${p.ruleLabel} (${p.periodLabel})` : p.entreprise} {p.figee && <span title={`Prime figée le ${p.figeeLe}`}>🔒</span>}
                      </span>
                      <span className="font-extrabold text-emerald-600">{fmtMoney(p.montant)}</span>
                    </button>
                    {openPrime === key && (
                      <div className="text-xs text-muted px-3 py-2">
                        {act
                          ? <>Activité : {p.count} RDV {p.phases?.length ? `en ${p.phases.join('/')}` : '(toutes phases)'} · Palier ≥ {p.tierMin} · Période : {p.periodLabel} · Paiement : {p.payMonthLabel}</>
                          : <>Passage SQL : {fmtDate(p.triggerDate)} · Paiement : {p.payMonthLabel} · Effectif : {p.effectif} · Source : {p.source}</>}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="flex justify-between pt-2 border-t border-line font-extrabold text-sm">
                <span>Total</span><span>{fmtMoney(repPrimes.reduce((a, p) => a + p.montant, 0))}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prévisionnel de primes : opportunités en cours pondérées par leur phase */}
      <div className="card p-4">
        <h3 className="font-bold mb-1">Prévisionnel de primes</h3>
        <p className="text-xs text-muted mb-3">
          Estimation des primes à venir : montant du barème de chaque opportunité en cours, pondéré par sa
          probabilité d'atteindre {milestonePhase(sub)} — déduite du chemin restant dans votre pipeline
          ({phaseOptions.filter(p => phaseProbability(sub, p) > 0 && phaseProbability(sub, p) < 1)
            .map(p => `${p} : ${Math.round(phaseProbability(sub, p) * 100)} %`).join(' · ')}).
        </p>
        {(() => {
          const proba = (ph) => phaseProbability(sub, ph)
          const pending = sub.rdvs.filter(r => r.opportunite === 'En cours' && proba(r.phase) > 0 && proba(r.phase) < 1)
          const rows = pending.map(r => {
            const eff = Number(r.effectif) || 0
            const bar = sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max) && (!b.leadSource || b.leadSource === r.source))
              || sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max))
            const montant = bar ? Number(bar.montant) || 0 : 0
            return { r, montant, espere: montant * proba(r.phase), proba: proba(r.phase) }
          }).filter(x => x.montant > 0)
          const total = rows.reduce((a, x) => a + x.espere, 0)
          if (!rows.length) return <Empty text="Aucune opportunité en cours avec un barème applicable." />
          return (
            <div className="space-y-1.5">
              {rows.sort((a, b) => b.espere - a.espere).map(({ r, montant, espere, proba }) => (
                <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded-xl bg-surface flex-wrap gap-1">
                  <span className="font-semibold">{r.entreprise} <span className="text-xs text-muted font-normal">({r.phase} · {Math.round(proba * 100)} %)</span></span>
                  <span className="text-xs text-muted">{fmtMoney(montant)} × {Math.round(proba * 100)} % = <b className="text-emerald-600">{fmtMoney(espere)}</b></span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-line font-extrabold text-sm">
                <span>Prévisionnel total</span><span className="text-emerald-600">≈ {fmtMoney(total)}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Tableau répartition sources × tranches d'effectif */}
      <div className="card p-4 overflow-x-auto">
        <h3 className="font-bold mb-3">Répartition des leads (sources × tranches d'effectif)</h3>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase">
              <th className="py-1.5">Catégorie</th><th>Nombre de leads</th><th>%</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(s => (
              <tr key={s} className="border-t border-line">
                <td className="py-1.5 font-semibold">{s}</td>
                <td>{srcCounts[s]}</td>
                <td>{Math.round((srcCounts[s] / totalRdv) * 100)}%</td>
              </tr>
            ))}
            {tranches.map(t => (
              <tr key={`${t.min}-${t.max}`} className="border-t border-line">
                <td className="py-1.5 font-semibold">Effectif {t.min} – {t.max >= 99999 ? '∞' : t.max}</td>
                <td>{trancheCount(t)}</td>
                <td>{Math.round((trancheCount(t) / totalRdv) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Renvoi visible : les réglages ont déménagé, le dire évite de les chercher ici. */}
      <div className="card p-3 flex items-start gap-2">
        <Settings2 size={15} className="text-brand shrink-0 mt-0.5" />
        <p className="text-xs text-muted">
          Les barèmes et les règles de prime se règlent désormais dans
          <b className="text-ink"> « Créer votre écosystème » </b>
          (console Gestion Manager) : un seul endroit décide de ce qui déclenche un montant,
          plutôt que deux écrans qui pouvaient se contredire. Cette page suit, rapporte et prévoit.
        </p>
      </div>
    </div>
  )
}

