import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, Coins, TrendingUp, Sparkles, Target, MousePointer2 } from 'lucide-react'
import { useStore, computePrimes, computeActivityPrimes, activityPeriodKey, monthKey, fmtMoney, baremeMatch, todayISO } from '../store.jsx'

const PROBA = { R1: 0.25, R2: 0.4, MQL: 0.6 }
// Géométrie de la jauge : arc de 270° (ouverture en bas).
const CX = 130, CY = 130, R = 100, START = 135, SWEEP = 270
const polar = (angleDeg) => {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) }
}

export default function Simulateur() {
  const store = useStore()
  const sub = store.sub
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(false)

  // Le simulateur raisonne selon le barème réellement en place :
  //  • s'il existe une règle de prime par activité (paliers de RDV), le levier est le RDV
  //    (combien de RDV dans les phases comptées pour débloquer le palier suivant) ;
  //  • sinon, le levier est le SQL (barème par lead : effectif × source).
  const { acquise, probable, objectif, avgPerUnit, unit, unitHint } = useMemo(() => {
    const now = new Date()
    const curK = monthKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const rdvs = sub.rdvs || []
    const primes = computePrimes(rdvs, sub.bareme || []).filter(p => !p.invalidated)
    const acquiseLead = primes.filter(p => p.payMonthKey === curK).reduce((a, p) => a + p.montant, 0)
    const actPrimes = computeActivityPrimes(rdvs, sub.activityRules || [])
    const acquiseAct = actPrimes.filter(p => p.payMonthKey === curK).reduce((a, p) => a + p.montant, 0)
    const acquise = acquiseLead + acquiseAct
    const pending = rdvs.filter(r => r.opportunite === 'En cours' && PROBA[r.phase])
    const probable = pending.reduce((a, r) => { const row = baremeMatch(sub.bareme || [], r.effectif, r.source); return a + (row ? (Number(row.montant) || 0) * PROBA[r.phase] : 0) }, 0)
    const objectif = Number((sub.goals || {}).primesMois) || 1000

    const rules = (sub.activityRules || []).filter(r => (r.tiers || []).length)
    if (rules.length) {
      const rule = rules[0]
      const tiers = [...rule.tiers].map(t => ({ min: Number(t.min) || 0, montant: Number(t.montant) || 0 })).sort((a, b) => a.min - b.min)
      const phases = rule.phases || []
      const pk = activityPeriodKey(rule.period, todayISO())
      const count = rdvs.filter(r => (!phases.length || phases.includes(r.phase)) && activityPeriodKey(rule.period, r.dateRdv || r.datePriseRdv || r.createdAt) === pk).length
      let curM = 0; tiers.forEach(t => { if (count >= t.min) curM = t.montant })
      const next = tiers.find(t => t.min > count) || tiers[tiers.length - 1]
      const dR = Math.max(1, next.min - count), dM = Math.max(1, next.montant - curM)
      return { acquise, probable, objectif, unit: 'RDV', avgPerUnit: Math.max(1, Math.round(dM / dR)), unitHint: phases.length ? ` en ${phases.join('/')}` : '' }
    }
    const montants = (sub.bareme || []).map(b => Number(b.montant) || 0).filter(Boolean)
    const avgBareme = montants.length ? montants.reduce((a, b) => a + b, 0) / montants.length : 200
    const avgPerUnit = primes.length ? Math.round(primes.reduce((a, p) => a + p.montant, 0) / primes.length) : Math.round(avgBareme)
    return { acquise, probable, objectif, unit: 'SQL', avgPerUnit, unitHint: '' }
  }, [sub.rdvs, sub.bareme, sub.activityRules, sub.goals])

  const potentielle = acquise + probable
  // Échelle énorme (jusqu'à +1000% de l'objectif) qui s'adapte au barème / au potentiel.
  const simMax = Math.max(objectif * 11, Math.ceil(potentielle * 1.2), acquise * 1.2, avgPerUnit * 10, 1)
  const [sim, setSim] = useState(() => Math.min(acquise, simMax))
  const [touched, setTouched] = useState(false)
  // Par défaut, le curseur suit en continu la performance acquise du mois en cours ;
  // il ne se fige que lorsque l'utilisateur le déplace lui-même.
  useEffect(() => { if (!touched) setSim(Math.min(acquise, simMax)) }, [acquise, simMax, touched])

  const tOf = (v) => Math.max(0, Math.min(1, v / simMax))
  const angleOf = (v) => START + tOf(v) * SWEEP
  const knob = polar(angleOf(sim))
  const objTick = objectif <= simMax ? polar(angleOf(objectif)) : null
  const C = 2 * Math.PI * R
  const arcLen = C * (SWEEP / 360)

  const setFromPointer = (e) => {
    const svg = svgRef.current; if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 260
    const py = ((e.clientY - rect.top) / rect.height) * 260
    let ang = (Math.atan2(py - CY, px - CX) * 180) / Math.PI
    let rel = (ang - START + 360) % 360
    if (rel > SWEEP) rel = rel > (SWEEP + (360 - SWEEP) / 2) ? 0 : SWEEP // clamp dans l'ouverture du bas
    setSim(Math.round((rel / SWEEP) * simMax))
  }
  const onDown = (e) => { setDrag(true); setTouched(true); setFromPointer(e); e.currentTarget.setPointerCapture?.(e.pointerId) }
  const onMove = (e) => { if (drag) setFromPointer(e) }
  const onUp = () => setDrag(false)

  const pct = Math.round((sim / objectif) * 100)
  const deltaUnit = Math.max(0, Math.ceil((sim - acquise) / Math.max(1, avgPerUnit)))
  const manqueUnit = acquise >= objectif ? 0 : Math.ceil((objectif - acquise) / Math.max(1, avgPerUnit))
  const color = sim >= objectif ? '#10b981' : 'rgb(var(--brand))'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Gauge size={20} className="text-brand" /> Combien vais-je toucher ?</h2>
        <p className="text-xs text-muted -mt-0.5">Votre progression vers l'objectif de primes — et un curseur pour simuler la cadence à tenir.</p>
      </div>

      <div className="card p-5 flex flex-col lg:flex-row items-center gap-6">
        {/* Jauge interactive */}
        <div className="shrink-0 select-none" style={{ touchAction: 'none' }}>
          <svg ref={svgRef} width="260" height="260" viewBox="0 0 260 260"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} style={{ cursor: 'pointer' }}>
            {/* piste */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgb(var(--line))" strokeWidth="16" strokeLinecap="round"
              strokeDasharray={`${arcLen} ${C}`} transform={`rotate(${START} ${CX} ${CY})`} />
            {/* remplissage */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
              strokeDasharray={`${tOf(sim) * arcLen} ${C}`} transform={`rotate(${START} ${CX} ${CY})`}
              style={{ transition: drag ? 'none' : 'stroke-dasharray .25s' }} />
            {/* repère objectif (100%) */}
            {objTick && <>
              <circle cx={objTick.x} cy={objTick.y} r="5" fill="#10b981" />
              <text x={objTick.x} y={objTick.y - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill="#10b981">obj.</text>
            </>}
            {/* curseur */}
            <circle cx={knob.x} cy={knob.y} r="11" fill="#fff" stroke={color} strokeWidth="4" />
            {/* centre */}
            <text x={CX} y={CY - 8} textAnchor="middle" fontSize="26" fontWeight="800" fill="rgb(var(--ink))">{fmtMoney(sim)}</text>
            <text x={CX} y={CY + 14} textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{pct}% de l'objectif</text>
            <text x={CX} y={CY + 34} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">objectif {fmtMoney(objectif)}</text>
          </svg>
          <div className="text-center text-[11px] text-muted flex items-center justify-center gap-1 -mt-2"><MousePointer2 size={12} /> Glissez le curseur pour simuler</div>
        </div>

        {/* Lecture & scénario */}
        <div className="flex-1 w-full space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Coins} label="Prime acquise" value={fmtMoney(acquise)} cls="text-emerald-600" />
            <Stat icon={TrendingUp} label="Prime probable" value={`+${fmtMoney(probable)}`} cls="text-sky-600" />
            <Stat icon={Sparkles} label="Prime potentielle" value={fmtMoney(potentielle)} cls="text-brand" />
          </div>

          <div className="rounded-xl bg-surface p-3 space-y-1.5">
            <div className="text-sm font-bold flex items-center gap-1.5"><Target size={15} className="text-brand" /> Scénario du curseur</div>
            <p className="text-sm">Viser <b>{fmtMoney(sim)}</b> ce mois-ci
              {deltaUnit > 0 ? <> demande environ <b className="text-brand">+{deltaUnit} {unit}{unitHint}</b> au-delà de vos primes acquises</> : <> est déjà couvert par vos primes acquises</>}.</p>
            <p className="text-xs text-muted">Estimation basée sur votre barème : ≈ {fmtMoney(avgPerUnit)} par {unit}{unit === 'RDV' ? unitHint : ''}.</p>
          </div>

          <div className={`rounded-xl p-3 text-sm font-semibold ${manqueUnit > 0 ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10'}`}>
            {manqueUnit > 0
              ? <>Il te manque <b>{manqueUnit} {unit}{unitHint}</b> pour atteindre ton objectif de {fmtMoney(objectif)}.</>
              : <>🎉 Objectif de {fmtMoney(objectif)} atteint — chaque {unit} supplémentaire est du bonus !</>}
          </div>

          <div className="flex gap-2">
            <button className={`btn-ghost text-xs ${!touched ? '!text-brand font-bold' : ''}`} onClick={() => { setTouched(false); setSim(Math.min(acquise, simMax)) }}>↺ Ma progression (live)</button>
            <button className="btn-ghost text-xs" onClick={() => { setTouched(true); setSim(Math.min(objectif, simMax)) }}>🎯 Objectif</button>
            <button className="btn-ghost text-xs" onClick={() => { setTouched(true); setSim(Math.min(Math.round(potentielle), simMax)) }}>✨ Potentiel</button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">Le simulateur s'appuie sur votre barème réel : {unit === 'RDV' ? 'une règle de prime par activité (paliers de RDV × phases)' : 'le barème par lead (effectif × source)'}. L'échelle monte jusqu'à +1000 % de l'objectif pour anticiper les primes déplafonnées.</p>
    </div>
  )
}

function Stat({ icon: Icon, label, value, cls }) {
  return (
    <div className="rounded-xl bg-surface p-3 text-center">
      <Icon size={16} className={`mx-auto mb-1 ${cls}`} />
      <div className={`text-lg font-extrabold ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted leading-tight">{label}</div>
    </div>
  )
}
