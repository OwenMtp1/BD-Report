import React, { useMemo, useState } from 'react'
import { Trophy, Flame, Target, Coins, TrendingUp, Percent, CalendarCheck, Medal, Crown } from 'lucide-react'
import { useStore, inTimeline, computePrimes, monthKey, fmtMoney } from '../store.jsx'
import { Empty } from '../ui.jsx'

const dayISO = (o = 0) => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10) }

function memberRow(m, data) {
  const rdvs = data.rdvs || []
  const now = new Date()
  const curK = monthKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const prevK = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const rdvMois = rdvs.filter(r => inTimeline(r.datePriseRdv, 'month')).length
  const sqlMois = rdvs.filter(r => inTimeline(r.datePassageSQL, 'month')).length
  const sql7j = rdvs.filter(r => r.datePassageSQL && r.datePassageSQL >= dayISO(-7)).length
  const primes = computePrimes(rdvs, data.bareme || []).filter(p => !p.invalidated)
  const primesMois = primes.filter(p => p.payMonthKey === curK).reduce((a, p) => a + p.montant, 0)
  const primesPrev = primes.filter(p => p.payMonthKey === prevK).reduce((a, p) => a + p.montant, 0)
  const conv = rdvMois ? Math.round((sqlMois / rdvMois) * 100) : 0
  const goalPrimes = Number((data.goals || {}).primesMois) || 0
  const objPct = goalPrimes ? Math.round((primesMois / goalPrimes) * 100) : 0
  const prog = primesPrev > 0 ? Math.round(((primesMois - primesPrev) / primesPrev) * 100) : (primesMois > 0 ? 100 : 0)
  const badges = []
  if (sql7j >= 10) badges.push({ id: 'hot', label: 'Hot Streak', icon: Flame, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15' })
  if (goalPrimes && primesMois >= goalPrimes) badges.push({ id: 'goal', label: 'Objectif atteint', icon: Target, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15' })
  if (primesMois >= 2000) badges.push({ id: '2k', label: '2 000 € de primes', icon: Coins, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15' })
  if (prog >= 30) badges.push({ id: 'up', label: `+${prog}% vs mois dernier`, icon: TrendingUp, cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15' })
  return { m, rdvMois, sqlMois, primesMois, conv, objPct, prog, sql7j, badges }
}

const METRICS = [
  { id: 'sql', label: 'SQL générés', icon: Target, get: r => r.sqlMois, fmt: v => v },
  { id: 'rdv', label: 'RDV réalisés', icon: CalendarCheck, get: r => r.rdvMois, fmt: v => v },
  { id: 'conv', label: 'Taux de conversion', icon: Percent, get: r => r.conv, fmt: v => `${v}%` },
  { id: 'primes', label: 'Primes', icon: Coins, get: r => r.primesMois, fmt: v => fmtMoney(v) },
  { id: 'prog', label: 'Progression vs mois dernier', icon: TrendingUp, get: r => r.prog, fmt: v => `${v > 0 ? '+' : ''}${v}%` },
  { id: 'obj', label: '% objectif atteint', icon: Trophy, get: r => r.objPct, fmt: v => `${v}%` },
]
const MEDAL = ['text-amber-400', 'text-slate-400', 'text-orange-400']

export default function Classement() {
  const store = useStore()
  const envId = store.session.envId
  const env = store.db.environments.find(e => e.id === envId)
  const members = store.db.subenvs.filter(s => s.envId === envId)
  const [metric, setMetric] = useState('sql')

  const rows = useMemo(() => members.map(m => memberRow(m, store.db.data[m.id] || { rdvs: [], bareme: [] })), [store.db, envId])
  const M = METRICS.find(x => x.id === metric)
  const ranked = [...rows].sort((a, b) => M.get(b) - M.get(a))
  const meId = store.session.subEnvId

  if (members.length === 0) return <Empty text="Aucun collaborateur dans cet environnement." />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Trophy size={20} className="text-amber-500" /> Classement du mois — {env?.name}</h2>
        <p className="text-xs text-muted -mt-0.5">Qui mène la danse ce mois-ci. Choisissez le critère de classement.</p>
      </div>

      {/* Sélecteur de critère */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {METRICS.map(x => (
          <button key={x.id} onClick={() => setMetric(x.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${metric === x.id ? 'bg-brand text-white border-brand' : 'bg-card border-line text-muted hover:bg-surface'}`}>
            <x.icon size={14} /> {x.label}
          </button>
        ))}
      </div>

      {/* Podium (top 3) */}
      {ranked.length >= 2 && (
        <div className="grid grid-cols-3 gap-2 items-end">
          {[1, 0, 2].map(pos => {
            const r = ranked[pos]; if (!r) return <div key={pos} />
            const h = pos === 0 ? 'h-28' : pos === 1 ? 'h-20' : 'h-16'
            return (
              <div key={pos} className="flex flex-col items-center">
                <div className="relative mb-1">
                  {r.m.photo ? <img src={r.m.photo} alt="" className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center">{(r.m.prenom?.[0] || '') + (r.m.nom?.[0] || '')}</div>}
                  {pos === 0 && <Crown size={18} className="text-amber-400 absolute -top-3 left-1/2 -translate-x-1/2" />}
                </div>
                <div className="text-xs font-bold truncate max-w-full">{r.m.prenom}</div>
                <div className="text-sm font-extrabold text-brand">{M.fmt(M.get(r))}</div>
                <div className={`w-full ${h} rounded-t-xl mt-1 flex items-start justify-center pt-1 font-extrabold text-white ${pos === 0 ? 'bg-amber-400' : pos === 1 ? 'bg-slate-300' : 'bg-orange-300'}`}>{pos + 1}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tableau complet */}
      <div className="card p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase">
              <th className="py-2 px-2">Rang</th><th>BDR</th><th className="text-center">SQL</th><th className="text-center">RDV</th>
              <th className="text-center">Conv.</th><th className="text-center">Primes</th><th className="text-center">vs M-1</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.m.id} className={`border-t border-line ${r.m.id === meId ? 'bg-brand/5' : ''}`}>
                <td className="py-2 px-2 font-extrabold">{i < 3 ? <Medal size={16} className={MEDAL[i]} /> : `#${i + 1}`}</td>
                <td className="font-semibold whitespace-nowrap">{r.m.prenom} {r.m.nom}{r.m.id === meId ? ' (moi)' : ''}
                  {r.badges.length > 0 && <span className="ml-1.5 inline-flex gap-1 align-middle">{r.badges.map(b => <b.icon key={b.id} size={13} className="text-amber-500" title={b.label} />)}</span>}</td>
                <td className="text-center">{r.sqlMois}</td>
                <td className="text-center">{r.rdvMois}</td>
                <td className="text-center">{r.conv}%</td>
                <td className="text-center font-semibold text-emerald-600">{fmtMoney(r.primesMois)}</td>
                <td className={`text-center font-semibold ${r.prog > 0 ? 'text-emerald-600' : r.prog < 0 ? 'text-red-500' : 'text-muted'}`}>{r.prog > 0 ? '+' : ''}{r.prog}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Badges gagnés */}
      <div className="card p-4">
        <div className="text-xs font-bold uppercase text-muted mb-2 flex items-center gap-1.5"><Medal size={14} className="text-amber-500" /> Badges du mois</div>
        {rows.every(r => r.badges.length === 0)
          ? <p className="text-xs text-muted">Aucun badge débloqué pour l'instant. Enchaînez les SQL et dépassez vos objectifs pour en gagner !</p>
          : (
            <div className="space-y-2">
              {rows.filter(r => r.badges.length).map(r => (
                <div key={r.m.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold w-28 truncate">{r.m.prenom} {r.m.nom}</span>
                  {r.badges.map(b => <span key={b.id} className={`chip ${b.cls}`}><b.icon size={12} /> {b.label}</span>)}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
