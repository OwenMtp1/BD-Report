import React, { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { Gauge, KanbanSquare, Coins, Target, Users2, Sparkles, TrendingUp, CalendarDays, Bell, Moon, Globe, ShieldCheck, StickyNote, BookUser, ArrowRight } from 'lucide-react'

// ---------------------------------------------------------------------------
//  Démo commerciale : page web interactive et autonome pour une présentation.
//  100 % données FICTIVES en mémoire locale — n'existe dans AUCUN compte réel,
//  ne lit et n'écrit jamais le store. But : montrer toutes les fonctionnalités.
// ---------------------------------------------------------------------------

const RDV_SERIE = [
  { m: 'Jan', pris: 22, réalisés: 18, sql: 5 }, { m: 'Fév', pris: 26, réalisés: 21, sql: 7 },
  { m: 'Mar', pris: 31, réalisés: 27, sql: 9 }, { m: 'Avr', pris: 28, réalisés: 24, sql: 8 },
  { m: 'Mai', pris: 35, réalisés: 30, sql: 12 }, { m: 'Juin', pris: 41, réalisés: 36, sql: 14 },
]
const PRIMES_SERIE = [
  { m: 'Jan', v: 900 }, { m: 'Fév', v: 1250 }, { m: 'Mar', v: 1600 },
  { m: 'Avr', v: 1400 }, { m: 'Mai', v: 2100 }, { m: 'Juin', v: 2450 },
]
const SOURCES_PIE = [
  { name: 'Outbound', value: 58 }, { name: 'Inbound', value: 27 }, { name: 'Référral', value: 15 },
]
const PIE_COLORS = ['rgb(var(--brand))', 'rgb(var(--brand2))', '#34d399']

const ICP = [
  { name: 'SaaS · 50‑200 · DRH', r: 34, sql: 71, sign: 22 },
  { name: 'Industrie · 200‑500 · Dir. Ops', r: 28, sql: 54, sign: 18 },
  { name: 'Finance · <100 · CFO', r: 41, sql: 63, sign: 26 },
]
const BAREME = [
  { min: 1, max: 50, out: 100, in: 80 }, { min: 51, max: 200, out: 200, in: 150 },
  { min: 201, max: 500, out: 350, in: 250 }, { min: 501, max: 99999, out: 500, in: 300 },
]
const FEATURES = [
  '📊 Dashboards & KPI', '📅 Gestion des rendez‑vous', '🗓️ Calendrier multi‑vues', '🧲 Pipeline kanban anti‑doublon',
  '⏱️ Timeline de vie du lead', '🏢 Fiche entreprise 360°', '📇 Contacts auto‑alimentés', '🗒️ Notes & modèles',
  '💶 Primes versionnées', '🧮 Barème configurable', '🔮 Prévisionnel pondéré', '🎯 Profils ICP en %',
  '🧑‍✈️ Pilotage d’équipe', '🌳 Organigramme', '💬 Commentaires & @mentions', '🔔 Centre de notifications',
  '🔁 Automatisations de phase', '🔎 Recherche globale (Ctrl+K)', '🗄️ Multi‑environnements + PIN', '📜 Logs d’audit',
  '🗑️ Corbeille 30 jours', '💾 Sauvegarde & restauration', '🎨 20 thèmes + mode sombre', '🌍 FR · EN · ES',
  '📱 PWA installable & hors‑ligne', '🖥️ App de bureau', '🛡️ Rôles & permissions', '⚖️ Conformité RGPD',
]

function Counter({ to, suffix = '', dur = 1200 }) {
  const [v, setV] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const t0 = performance.now()
    let raf
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, dur])
  return <span ref={ref} className="stat-num">{v.toLocaleString('fr-FR')}{suffix}</span>
}

// Mini‑pipeline manipulable (glisser‑déposer, état local).
function MiniPipeline() {
  const COLS = ['R1', 'R2', 'MQL', 'SQL', 'Signée']
  const COLOR = { R1: 'bg-slate-100 text-slate-600', R2: 'bg-sky-100 text-sky-700', MQL: 'bg-amber-100 text-amber-700', SQL: 'bg-violet-100 text-violet-700', 'Signée': 'bg-emerald-100 text-emerald-700' }
  const [cards, setCards] = useState({
    R1: [{ id: 1, e: 'Acme Corp', eff: 120 }, { id: 2, e: 'Globex', eff: 450 }],
    R2: [{ id: 3, e: 'Initech', eff: 80 }],
    MQL: [{ id: 4, e: 'Umbrella', eff: 900 }],
    SQL: [{ id: 5, e: 'Hooli', eff: 300 }],
    'Signée': [{ id: 6, e: 'Stark Industries', eff: 1500 }],
  })
  const [drag, setDrag] = useState(null)
  const drop = (col) => {
    if (!drag) return
    setCards(prev => {
      const next = {}; for (const c of COLS) next[c] = prev[c].filter(x => x.id !== drag.card.id)
      next[col] = [...next[col], drag.card]; return next
    })
    setDrag(null)
  }
  return (
    <div>
      <p className="text-xs text-muted mb-2">Glissez une carte d'une colonne à l'autre — les phases se mettent à jour, comme dans l'app.</p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {COLS.map(col => (
          <div key={col} onDragOver={e => e.preventDefault()} onDrop={() => drop(col)}
            className="min-w-[9rem] flex-1 rounded-xl bg-surface/70 border border-line p-2">
            <div className="flex items-center justify-between mb-2"><span className={`chip ${COLOR[col]}`}>{col}</span><span className="text-xs font-bold text-muted">{cards[col].length}</span></div>
            <div className="space-y-1.5 min-h-[3rem]">
              {cards[col].map(c => (
                <div key={c.id} draggable onDragStart={() => setDrag({ card: c })} onDragEnd={() => setDrag(null)}
                  className="card !rounded-lg p-2 cursor-grab active:cursor-grabbing">
                  <div className="font-bold text-xs truncate">{c.e}</div>
                  <div className="text-[10px] text-muted">{c.eff} employés</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Simulateur de prime (barème fictif).
function PrimeSim() {
  const [eff, setEff] = useState(150)
  const [src, setSrc] = useState('out')
  const row = BAREME.find(b => eff >= b.min && eff <= b.max) || BAREME[BAREME.length - 1]
  const prime = src === 'out' ? row.out : row.in
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="label">Effectif de la cible</label>
          <input type="number" min="1" className="input" value={eff} onChange={e => setEff(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label">Source du lead</label>
          <select className="input" value={src} onChange={e => setSrc(e.target.value)}>
            <option value="out">Outbound</option><option value="in">Inbound</option>
          </select>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted">Prime calculée :</span>
        <span className="text-3xl font-extrabold text-emerald-600 stat-num">{prime.toLocaleString('fr-FR')} €</span>
      </div>
      <p className="text-[11px] text-muted mt-1">Figée au barème en vigueur au passage en SQL — le passé ne bouge jamais.</p>
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Vue d’ensemble', icon: Gauge },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'primes', label: 'Rémunération', icon: Coins },
  { id: 'icp', label: 'Ciblage ICP', icon: Target },
  { id: 'all', label: 'Toutes les fonctionnalités', icon: Sparkles },
]

export default function DemoSales() {
  const [tab, setTab] = useState('overview')
  return (
    <div className="space-y-4">
      {/* Bandeau démo */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#10162e,#1e2a52 45%,#14346b)' }}>
        <span className="chip" style={{ background: 'rgba(94,220,255,.15)', color: '#5EDCFF' }}>▶ Démo commerciale · données fictives</span>
        <h2 className="text-2xl font-extrabold mt-2">BD Report en action</h2>
        <p className="text-white/70 text-sm mt-1 max-w-xl">Un environnement de présentation interactif — manipulez le pipeline, simulez une prime, explorez les dashboards. Rien n'est enregistré, aucun compte réel n'est touché.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          {[['RDV réalisés', 248, ''], ['SQL générés', 62, ''], ['Taux R1→SQL', 25, '%'], ['Primes du mois', 2450, ' €']].map(([l, v, s]) => (
            <div key={l}><div className="text-2xl font-extrabold" style={{ background: 'linear-gradient(90deg,#7C9BFF,#5EDCFF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}><Counter to={v} suffix={s} /></div><div className="text-xs text-white/55">{l}</div></div>
          ))}
        </div>
      </div>

      {/* Onglets internes de la démo */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-line">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-surface'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-bold mb-1 flex items-center gap-2"><TrendingUp size={16} className="text-brand" /> Activité — RDV & SQL</h3>
            <div className="h-56"><ResponsiveContainer>
              <BarChart data={RDV_SERIE} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
                <XAxis dataKey="m" fontSize={11} stroke="rgb(var(--muted))" /><YAxis fontSize={11} stroke="rgb(var(--muted))" />
                <Tooltip /><Bar dataKey="pris" name="RDV pris" fill="rgb(var(--brand2))" radius={[4, 4, 0, 0]} /><Bar dataKey="sql" name="SQL" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </div>
          <div className="card p-4">
            <h3 className="font-bold mb-1 flex items-center gap-2"><Coins size={16} className="text-emerald-600" /> Primes par mois de paiement</h3>
            <div className="h-56"><ResponsiveContainer>
              <LineChart data={PRIMES_SERIE} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
                <XAxis dataKey="m" fontSize={11} stroke="rgb(var(--muted))" /><YAxis fontSize={11} stroke="rgb(var(--muted))" />
                <Tooltip formatter={v => v + ' €'} /><Line type="monotone" dataKey="v" name="Primes" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer></div>
          </div>
          <div className="card p-4">
            <h3 className="font-bold mb-1 flex items-center gap-2"><KanbanSquare size={16} className="text-brand" /> Répartition des sources</h3>
            <div className="h-56"><ResponsiveContainer>
              <PieChart><Pie data={SOURCES_PIE} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={3}>
                {SOURCES_PIE.map((e, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie><Tooltip formatter={v => v + ' %'} /></PieChart>
            </ResponsiveContainer></div>
          </div>
          <div className="card p-4 flex flex-col justify-center gap-3">
            <h3 className="font-bold flex items-center gap-2"><Sparkles size={16} className="text-brand" /> Ce que voient vos équipes</h3>
            {[['Objectifs & quotas suivis en temps réel', CalendarDays], ['Recommandations d’actions priorisées', Bell], ['Alertes de dérive automatiques pour le manager', TrendingUp]].map(([t, Icon]) => (
              <div key={t} className="flex items-center gap-2 text-sm"><span className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0"><Icon size={15} className="text-brand" /></span>{t}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="card p-4">
          <h3 className="font-bold mb-2 flex items-center gap-2"><KanbanSquare size={16} className="text-brand" /> Pipeline kanban interactif</h3>
          <MiniPipeline />
        </div>
      )}

      {tab === 'primes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-bold mb-2 flex items-center gap-2"><Coins size={16} className="text-emerald-600" /> Simulateur de prime</h3>
            <PrimeSim />
          </div>
          <div className="card p-4">
            <h3 className="font-bold mb-2">Barème (exemple)</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted uppercase"><th className="py-1">Effectif</th><th>Outbound</th><th>Inbound</th></tr></thead>
              <tbody>
                {BAREME.map((b, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-1.5 font-semibold">{b.min}–{b.max === 99999 ? '∞' : b.max}</td><td>{b.out} €</td><td>{b.in} €</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'icp' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ICP.map(p => (
            <div key={p.name} className="card p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Target size={15} className="text-brand" /> {p.name}</h3>
              {[['R1 → MQL', p.r], ['MQL → SQL', p.sql], ['R1 → Signé', p.sign]].map(([l, v]) => (
                <div key={l} className="mb-2">
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted">{l}</span><span className="font-bold">{v}%</span></div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: v + '%', background: 'linear-gradient(90deg,rgb(var(--brand)),rgb(var(--brand2)))' }} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'all' && (
        <div className="card p-4">
          <h3 className="font-bold mb-1 flex items-center gap-2"><Sparkles size={16} className="text-brand" /> Toutes les fonctionnalités</h3>
          <p className="text-xs text-muted mb-3">Un espace sales tout‑en‑un — de la prise de rendez‑vous au versement de la prime.</p>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(f => <span key={f} className="chip bg-surface text-ink border border-line">{f}</span>)}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            {[[Globe, 'FR · EN · ES'], [Moon, 'Mode sombre'], [ShieldCheck, 'RGPD'], [Users2, 'Multi‑équipes'], [BookUser, 'Contacts'], [StickyNote, 'Notes']].map(([Icon, t], i) => (
              <span key={i} className="flex items-center gap-1.5 text-muted"><Icon size={15} className="text-brand" /> {t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
