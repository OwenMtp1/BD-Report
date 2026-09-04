import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Plus, Trash2, AlertTriangle, CalendarRange, Layers, Activity } from 'lucide-react'
import { useStore, computePrimes, computeActivityPrimes, ACTIVITY_PERIODS, activityRuleTitle, monthKey, monthLabel, fmtDate, fmtMoney, parseISO, uid, SOURCES, DEFAULT_PHASES } from '../store.jsx'
import { Empty } from '../ui.jsx'

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
    ...computePrimes(sub.rdvs, sub.bareme),
    ...computeActivityPrimes(sub.rdvs, sub.activityRules),
  ], [sub.rdvs, sub.bareme, sub.activityRules])
  const primes = allPrimes.filter(p => !p.invalidated)   // stats & sommes : primes valides uniquement
  const invalidated = allPrimes.filter(p => p.invalidated)
  const phaseOptions = (sub.phases && sub.phases.length ? sub.phases : DEFAULT_PHASES)

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

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Primes & Commissions</h2>

      {invalidated.length > 0 && (
        <div className="card p-4 !border-amber-300 bg-amber-50/60">
          <h3 className="font-bold flex items-center gap-2 text-amber-700"><AlertTriangle size={16} /> Primes invalidées ({invalidated.length})</h3>
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
                <Bar dataKey="total" name="Primes" fill="rgb(var(--brand))" radius={[6, 6, 0, 0]} />
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
          <p className="text-xs text-muted mb-3">Règle : déclenchée à la date de passage en SQL. Payée le mois en cours si le passage a lieu avant le 15, sinon le mois suivant. 🔒 = prime figée au barème en vigueur lors du passage en SQL (un changement de barème ne réécrit pas le passé).</p>
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
        <p className="text-xs text-muted mb-3">Estimation des primes à venir : montant du barème de chaque opportunité en cours, pondéré par sa probabilité de passage en SQL selon la phase (R1 : 25 % · R2 : 40 % · MQL : 60 %).</p>
        {(() => {
          const PROBA = { R1: 0.25, R2: 0.4, MQL: 0.6 }
          const pending = sub.rdvs.filter(r => r.opportunite === 'En cours' && PROBA[r.phase])
          const rows = pending.map(r => {
            const eff = Number(r.effectif) || 0
            const bar = sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max) && (!b.leadSource || b.leadSource === r.source))
              || sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max))
            const montant = bar ? Number(bar.montant) || 0 : 0
            return { r, montant, espere: montant * PROBA[r.phase], proba: PROBA[r.phase] }
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

      {/* Barème de commissions (en bas, catégories en colonnes) */}
      <div className="card p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Barème de commissions</h3>
          <button className="btn-primary !py-1.5 text-xs" onClick={() => { setBareme([...sub.bareme, { id: uid(), min: 0, max: 0, montant: 0, leadSource: '' }]); store.logAction('Prime', 'Catégorie de commission ajoutée') }}>
            <Plus size={14} /> Ajouter une catégorie
          </button>
        </div>
        <table className="text-sm min-w-[500px]">
          <tbody>
            <tr>
              <td className="label py-2 pr-4 whitespace-nowrap">Catégorie</td>
              {sub.bareme.map((b, i) => <td key={b.id} className="px-2 text-center font-bold text-xs text-muted">#{i + 1}
                <button className="ml-1 align-middle" title="Supprimer" onClick={() => setBareme(sub.bareme.filter(x => x.id !== b.id))}>
                  <Trash2 size={12} className="text-red-400 inline" /></button>
              </td>)}
            </tr>
            <tr>
              <td className="label py-2 pr-4 whitespace-nowrap">Collaborateurs min</td>
              {sub.bareme.map(b => <td key={b.id} className="px-1 py-1">
                <input type="number" className="input !w-24 text-center" value={b.min} onChange={e => patchRow(b.id, 'min', e.target.value)} /></td>)}
            </tr>
            <tr>
              <td className="label py-2 pr-4 whitespace-nowrap">Collaborateurs max</td>
              {sub.bareme.map(b => <td key={b.id} className="px-1 py-1">
                <input type="number" className="input !w-24 text-center" value={b.max} onChange={e => patchRow(b.id, 'max', e.target.value)} /></td>)}
            </tr>
            <tr>
              <td className="label py-2 pr-4 whitespace-nowrap">Montant de la prime (€)</td>
              {sub.bareme.map(b => <td key={b.id} className="px-1 py-1">
                <input type="number" className="input !w-24 text-center font-bold" value={b.montant} onChange={e => patchRow(b.id, 'montant', e.target.value)} /></td>)}
            </tr>
            <tr>
              <td className="label py-2 pr-4 whitespace-nowrap">Lead source</td>
              {sub.bareme.map(b => <td key={b.id} className="px-1 py-1">
                <select className="input !w-24 text-xs" value={b.leadSource || ''} onChange={e => patchRow(b.id, 'leadSource', e.target.value)}>
                  <option value="">Toutes</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select></td>)}
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted mt-2">Chaque RDV en phase SQL ou Signée déclenche automatiquement la prime correspondant à sa tranche d'effectif et sa lead source.</p>
      </div>

      <ActivityBaremeCard store={store} sub={sub} phaseOptions={phaseOptions} />
    </div>
  )
}

// -------------------------------------------------- Barème par activité (règles façon Excel)
function ActivityBaremeCard({ store, sub, phaseOptions }) {
  const rules = sub.activityRules || []
  const setRules = (fn) => store.setSub(d => ({ ...d, activityRules: typeof fn === 'function' ? fn(d.activityRules || []) : fn }))
  const addRule = () => { setRules(rs => [...rs, { id: uid(), label: '', period: 'mois', phases: [], tiers: [{ id: uid(), min: 10, montant: 200 }] }]); store.logAction('Prime', "Règle de prime d'activité ajoutée") }
  const patchRule = (id, patch) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  const removeRule = (id) => setRules(rs => rs.filter(r => r.id !== id))
  const togglePhase = (id, ph) => setRules(rs => rs.map(r => r.id === id ? { ...r, phases: (r.phases || []).includes(ph) ? r.phases.filter(x => x !== ph) : [...(r.phases || []), ph] } : r))
  const setTiers = (id, tiers) => patchRule(id, { tiers })

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold flex items-center gap-2"><Activity size={17} className="text-brand" /> Barème par activité (volume de RDV)</h3>
          <p className="text-xs text-muted -mt-0.5">Des règles façon « règles de données Excel » : une condition (période + phases) → un résultat (prime par palier de RDV).</p>
        </div>
        <button className="btn-primary !py-1.5 text-xs" onClick={addRule}><Plus size={14} /> Ajouter une règle</button>
      </div>

      {rules.length === 0 && <Empty text="Aucune règle d'activité. Exemple : « ≥ 10 RDV en R1 dans le mois → 200 € »." />}

      <div className="space-y-3">
        {rules.map((rule, ri) => {
          const tiers = rule.tiers || []
          const results = computeActivityPrimes(sub.rdvs, [rule])
          const total = results.reduce((a, p) => a + p.montant, 0)
          return (
            <div key={rule.id} className="rounded-xl border border-line p-3 space-y-2.5 bg-surface/40">
              {/* Ligne 1 : SI (période) + nom + suppression */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="chip bg-brand/10 text-brand font-bold shrink-0">Règle {ri + 1}</span>
                <input className="input !py-1 text-sm flex-1 min-w-[140px]" placeholder={activityRuleTitle(rule)} value={rule.label || ''} onChange={e => patchRule(rule.id, { label: e.target.value })} />
                <button className="btn-ghost !p-1.5 text-red-500 shrink-0" title="Supprimer la règle" onClick={() => removeRule(rule.id)}><Trash2 size={15} /></button>
              </div>

              {/* Ligne 2 : période + phases */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <CalendarRange size={14} /> Sur la
                  <select className="input !w-auto !py-1 text-xs" value={rule.period} onChange={e => patchRule(rule.id, { period: e.target.value })}>
                    {ACTIVITY_PERIODS.map(p => <option key={p.id} value={p.id}>{p.label.toLowerCase()}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-muted flex items-center gap-1"><Layers size={14} /> compter les RDV en :</span>
                  {phaseOptions.map(ph => (
                    <button key={ph} onClick={() => togglePhase(rule.id, ph)}
                      className={`chip cursor-pointer ${(rule.phases || []).includes(ph) ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}>{ph}</button>
                  ))}
                  {(rule.phases || []).length === 0 && <span className="text-[11px] text-muted italic">toutes les phases</span>}
                </div>
              </div>

              {/* Ligne 3 : paliers (ALORS) */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted">Paliers de prime :</div>
                {tiers.map((t, ti) => (
                  <div key={t.id || ti} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-muted">À partir de</span>
                    <input type="number" min="1" className="input !w-20 !py-1 text-center" value={t.min}
                      onChange={e => setTiers(rule.id, tiers.map(x => x === t ? { ...x, min: e.target.value } : x))} />
                    <span className="text-muted">RDV →</span>
                    <input type="number" min="0" className="input !w-24 !py-1 text-center font-bold" value={t.montant}
                      onChange={e => setTiers(rule.id, tiers.map(x => x === t ? { ...x, montant: e.target.value } : x))} />
                    <span className="text-muted">€</span>
                    <button className="text-red-400 shrink-0" title="Retirer le palier" onClick={() => setTiers(rule.id, tiers.filter(x => x !== t))}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button className="btn-ghost !py-1 text-xs" onClick={() => setTiers(rule.id, [...tiers, { id: uid(), min: (Number(tiers[tiers.length - 1]?.min) || 0) + 10, montant: 0 }])}><Plus size={13} /> Ajouter un palier</button>
              </div>

              {/* Aperçu sur les données réelles */}
              <div className="text-xs rounded-lg bg-card border border-line px-3 py-2">
                {results.length === 0
                  ? <span className="text-muted">Sur vos RDV actuels : aucun palier atteint pour l'instant.</span>
                  : <span>Sur vos RDV : <b className="text-emerald-600">{fmtMoney(total)}</b> — {results.sort((a, b) => a.periodKey.localeCompare(b.periodKey)).map(r => `${r.periodLabel} (${r.count} RDV → ${fmtMoney(r.montant)})`).join(' · ')}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted">La prime versée par période est celle du <b>palier le plus élevé atteint</b>. Ces primes s'ajoutent aux primes par lead et apparaissent dans le suivi et le reporting ci-dessus.</p>
    </div>
  )
}
