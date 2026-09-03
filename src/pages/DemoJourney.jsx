import React, { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import {
  Gauge, CalendarDays, KanbanSquare, ListChecks, BookUser, Coins, Users2, ShieldCheck, Network, BarChart3,
  Bell, Search, ArrowRight, X, Play, ChevronLeft, ChevronRight, Sparkles, Lock, Mail, Building2, TrendingUp,
  CheckCircle2, Target, LayoutDashboard,
} from 'lucide-react'

// ===========================================================================
//  PARCOURS DE DÉMO IMMERSIF — 100 % fictif, isolé (aucun compte réel touché).
//  Écran de création de compte → interface complète, bascule Employé/Manager,
//  et une visite guidée animée qui parcourt chaque brique de chaque onglet.
// ===========================================================================

const PIE_COLORS = ['rgb(var(--brand))', 'rgb(var(--brand2))', '#34d399']
const ACT = [
  { m: 'Jan', pris: 22, sql: 5 }, { m: 'Fév', pris: 26, sql: 7 }, { m: 'Mar', pris: 31, sql: 9 },
  { m: 'Avr', pris: 28, sql: 8 }, { m: 'Mai', pris: 35, sql: 12 }, { m: 'Juin', pris: 41, sql: 14 },
]
const PRIMES = [{ m: 'Jan', v: 900 }, { m: 'Fév', v: 1250 }, { m: 'Mar', v: 1600 }, { m: 'Avr', v: 1400 }, { m: 'Mai', v: 2100 }, { m: 'Juin', v: 2450 }]
const SRC = [{ name: 'Outbound', value: 58 }, { name: 'Inbound', value: 27 }, { name: 'Référral', value: 15 }]
const RDVS = [
  { e: 'Acme Corp', ph: 'SQL', c: 'Marie Durand', p: 'DRH', d: '12/06', eff: 120 },
  { e: 'Globex', ph: 'R2', c: 'Paul Martin', p: 'Dir. Ops', d: '11/06', eff: 450 },
  { e: 'Initech', ph: 'R1', c: 'Sophie Bernard', p: 'CFO', d: '10/06', eff: 80 },
  { e: 'Umbrella', ph: 'MQL', c: 'Luc Petit', p: 'VP Sales', d: '09/06', eff: 900 },
  { e: 'Hooli', ph: 'SQL', c: 'Emma Roux', p: 'CTO', d: '08/06', eff: 300 },
  { e: 'Stark Ind.', ph: 'Signée', c: 'Julie Moreau', p: 'Directrice', d: '05/06', eff: 1500 },
  { e: 'Wonka', ph: 'R1', c: 'Karim Haddad', p: 'Head of Sales', d: '04/06', eff: 220 },
]
const CONTACTS = RDVS.map((r, i) => ({ ...r, mail: `${r.c.toLowerCase().replace(/[^a-z]/g, '.')}@${r.e.toLowerCase().replace(/[^a-z]/g, '')}.fr`, tel: `06 12 34 ${10 + i} ${20 + i}` }))
const TEAM = [
  { n: 'Owen M.', pris: 41, sql: 14, primes: 2450, proj: 44 },
  { n: 'Julie R.', pris: 33, sql: 11, primes: 1800, proj: 36 },
  { n: 'Karim H.', pris: 29, sql: 8, primes: 1200, proj: 31 },
  { n: 'Sarah T.', pris: 37, sql: 12, primes: 2050, proj: 40 },
]
const PHCOLOR = { R1: 'bg-slate-100 text-slate-600', R2: 'bg-sky-100 text-sky-700', MQL: 'bg-amber-100 text-amber-700', SQL: 'bg-violet-100 text-violet-700', 'Signée': 'bg-emerald-100 text-emerald-700' }
const BAREME = [{ min: 1, max: 50, o: 100, i: 80 }, { min: 51, max: 200, o: 200, i: 150 }, { min: 201, max: 500, o: 350, i: 250 }, { min: 501, max: 99999, o: 500, i: 300 }]

function Counter({ to, suffix = '' }) {
  const [v, setV] = useState(0)
  useEffect(() => { const t0 = performance.now(); let raf; const s = (t) => { const p = Math.min(1, (t - t0) / 1100); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(s) }; raf = requestAnimationFrame(s); return () => cancelAnimationFrame(raf) }, [to])
  return <span className="stat-num">{v.toLocaleString('fr-FR')}{suffix}</span>
}
const Kpi = ({ label, val, suffix, color }) => (
  <div className="card p-3"><div className={`text-2xl font-extrabold ${color || 'text-ink'}`}><Counter to={val} suffix={suffix} /></div><div className="text-xs text-muted">{label}</div></div>
)
const CardBox = ({ title, icon: Ic, children, right }) => (
  <div className="card p-4"><div className="flex items-center justify-between mb-2"><h3 className="font-bold flex items-center gap-2">{Ic && <Ic size={16} className="text-brand" />} {title}</h3>{right}</div>{children}</div>
)

function MiniPipeline({ org }) {
  const COLS = ['R1', 'R2', 'MQL', 'SQL', 'Signée']
  const [cards, setCards] = useState({
    R1: [{ id: 1, e: 'Acme Corp', o: org ? 'Owen' : '' }, { id: 2, e: 'Globex', o: org ? 'Julie' : '' }],
    R2: [{ id: 3, e: 'Initech', o: org ? 'Karim' : '' }], MQL: [{ id: 4, e: 'Umbrella', o: org ? 'Sarah' : '' }],
    SQL: [{ id: 5, e: 'Hooli', o: org ? 'Owen' : '' }], 'Signée': [{ id: 6, e: 'Stark Ind.', o: org ? 'Julie' : '' }],
  })
  const [drag, setDrag] = useState(null)
  const drop = (col) => { if (!drag) return; setCards(p => { const n = {}; COLS.forEach(c => n[c] = p[c].filter(x => x.id !== drag.id)); n[col] = [...n[col], drag]; return n }); setDrag(null) }
  return (
    <div>
      <p className="text-xs text-muted mb-2">Glissez une carte d'une colonne à l'autre — les phases s'actualisent en direct.</p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {COLS.map(col => (
          <div key={col} onDragOver={e => e.preventDefault()} onDrop={() => drop(col)} className="min-w-[9rem] flex-1 rounded-xl bg-surface/70 border border-line p-2">
            <div className="flex items-center justify-between mb-2"><span className={`chip ${PHCOLOR[col]}`}>{col}</span><span className="text-xs font-bold text-muted">{cards[col].length}</span></div>
            <div className="space-y-1.5 min-h-[3rem]">
              {cards[col].map(c => (
                <div key={c.id} draggable onDragStart={() => setDrag(c)} onDragEnd={() => setDrag(null)} className="card !rounded-lg p-2 cursor-grab active:cursor-grabbing">
                  <div className="font-bold text-xs truncate">{c.e}</div>{c.o && <div className="text-[10px] text-brand">{c.o}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PrimeSim() {
  const [eff, setEff] = useState(150); const [src, setSrc] = useState('o')
  const row = BAREME.find(b => eff >= b.min && eff <= b.max) || BAREME[3]
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div><label className="label">Effectif</label><input type="number" className="input" value={eff} onChange={e => setEff(Number(e.target.value) || 0)} /></div>
        <div><label className="label">Source</label><select className="input" value={src} onChange={e => setSrc(e.target.value)}><option value="o">Outbound</option><option value="i">Inbound</option></select></div>
      </div>
      <div className="flex items-baseline gap-2"><span className="text-xs text-muted">Prime :</span><span className="text-3xl font-extrabold text-emerald-600 stat-num">{(src === 'o' ? row.o : row.i).toLocaleString('fr-FR')} €</span></div>
    </div>
  )
}

// --- Sections (contenu par onglet) ---
function Section({ id, role }) {
  const manager = role === 'manager'
  if (id === 'dashboard') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label={manager ? 'RDV équipe' : 'RDV réalisés'} val={manager ? 140 : 41} color="text-brand" />
        <Kpi label="SQL générés" val={manager ? 45 : 14} color="text-sky-600" />
        <Kpi label="Taux R1→SQL" val={manager ? 27 : 25} suffix="%" color="text-violet-600" />
        <Kpi label={manager ? 'Primes équipe' : 'Primes du mois'} val={manager ? 7500 : 2450} suffix=" €" color="text-emerald-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardBox title="Activité — RDV & SQL" icon={TrendingUp}>
          <div className="h-52"><ResponsiveContainer><BarChart data={ACT} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}><CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" /><XAxis dataKey="m" fontSize={11} stroke="rgb(var(--muted))" /><YAxis fontSize={11} stroke="rgb(var(--muted))" /><Tooltip /><Bar dataKey="pris" name="RDV" fill="rgb(var(--brand2))" radius={[4, 4, 0, 0]} /><Bar dataKey="sql" name="SQL" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </CardBox>
        <CardBox title="Sources" icon={KanbanSquare}>
          <div className="h-52"><ResponsiveContainer><PieChart><Pie data={SRC} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3}>{SRC.map((e, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip formatter={v => v + ' %'} /></PieChart></ResponsiveContainer></div>
        </CardBox>
      </div>
    </div>
  )
  if (id === 'rdv') return (
    <div className="space-y-2.5">{RDVS.map((r, i) => (
      <div key={i} className="card p-3.5">
        <div className="flex items-center justify-between gap-2"><div className="font-bold text-[15px] truncate">{r.e}</div><span className={`chip ${PHCOLOR[r.ph]}`}>{r.ph}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 mt-2 text-xs">
          <div><div className="text-muted">Contact</div><div className="font-semibold">{r.c}</div></div><div><div className="text-muted">Poste</div><div>{r.p}</div></div>
          <div><div className="text-muted">Date</div><div className="font-semibold">{r.d}</div></div><div><div className="text-muted">Effectif</div><div>{r.eff}</div></div>
        </div>
      </div>
    ))}</div>
  )
  if (id === 'pipeline') return <CardBox title={manager ? 'Pipeline entreprise' : 'Mon pipeline'} icon={KanbanSquare}><MiniPipeline org={manager} /></CardBox>
  if (id === 'tasks') return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {[['No‑show à replanifier', ['Globex', 'Wonka'], 'bg-orange-100 text-orange-600'], ['Opportunités en cours', ['Acme Corp', 'Umbrella', 'Hooli'], 'bg-amber-100 text-amber-600'], ['Leads à relancer', ['Vieux Lead SA', 'Old Corp'], 'bg-slate-100 text-slate-600']].map(([t, items, c], k) => (
        <CardBox key={k} title={t}><div className="space-y-1.5">{items.map(x => <div key={x} className="flex items-center justify-between text-sm p-2 rounded-lg bg-surface"><span className="font-semibold">{x}</span><span className={`chip ${c}`}>action</span></div>)}</div></CardBox>
      ))}
    </div>
  )
  if (id === 'contacts') return (
    <CardBox title="Mes contacts" icon={BookUser}>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-xs text-muted uppercase"><th className="py-2">Contact</th><th>Entreprise</th><th>Poste</th><th>Email</th></tr></thead>
        <tbody>{CONTACTS.map((c, i) => <tr key={i} className="border-t border-line"><td className="py-2 font-semibold">{c.c}</td><td>{c.e}</td><td className="text-muted">{c.p}</td><td className="text-muted text-xs">{c.mail}</td></tr>)}</tbody></table></div>
    </CardBox>
  )
  if (id === 'primes') return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CardBox title="Simulateur de prime" icon={Coins}><PrimeSim /></CardBox>
      <CardBox title="Évolution des primes"><div className="h-52"><ResponsiveContainer><LineChart data={PRIMES} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}><CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" /><XAxis dataKey="m" fontSize={11} stroke="rgb(var(--muted))" /><YAxis fontSize={11} stroke="rgb(var(--muted))" /><Tooltip formatter={v => v + ' €'} /><Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardBox>
    </div>
  )
  if (id === 'kpi') return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CardBox title="Performance équipe" icon={BarChart3}><div className="h-56"><ResponsiveContainer><BarChart data={TEAM} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}><CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" /><XAxis dataKey="n" fontSize={10} stroke="rgb(var(--muted))" /><YAxis fontSize={11} stroke="rgb(var(--muted))" /><Tooltip /><Bar dataKey="pris" name="RDV" fill="rgb(var(--brand2))" radius={[4, 4, 0, 0]} /><Bar dataKey="sql" name="SQL" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardBox>
      <CardBox title="Entonnoir de conversion"><div className="space-y-2 mt-1">{[['R1', 100], ['R2', 68], ['MQL', 45], ['SQL', 27], ['Signé', 12]].map(([l, v]) => <div key={l}><div className="flex justify-between text-xs mb-1"><span className="text-muted">{l}</span><span className="font-bold">{v}%</span></div><div className="h-2.5 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: v + '%', background: 'linear-gradient(90deg,rgb(var(--brand)),rgb(var(--brand2)))' }} /></div></div>)}</div></CardBox>
    </div>
  )
  if (id === 'teamlead') return (
    <div className="space-y-4">
      <CardBox title="Forecast du mois" icon={Users2}>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]"><thead><tr className="text-left text-xs text-muted uppercase"><th className="py-2">BDR</th><th>RDV</th><th>Projection</th><th>SQL</th><th>Primes</th></tr></thead>
          <tbody>{TEAM.map((m, i) => <tr key={i} className="border-t border-line"><td className="py-2 font-semibold">{m.n}</td><td>{m.pris}</td><td className="font-bold text-brand">{m.proj}</td><td>{m.sql}</td><td>{m.primes.toLocaleString('fr-FR')} €</td></tr>)}
            <tr className="border-t-2 border-line font-extrabold"><td className="py-2">Équipe</td><td>{TEAM.reduce((a, m) => a + m.pris, 0)}</td><td>{TEAM.reduce((a, m) => a + m.proj, 0)}</td><td>{TEAM.reduce((a, m) => a + m.sql, 0)}</td><td>{TEAM.reduce((a, m) => a + m.primes, 0).toLocaleString('fr-FR')} €</td></tr>
          </tbody></table></div>
      </CardBox>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{TEAM.map((m, i) => <div key={i} className="rounded-xl bg-surface p-3"><div className="font-bold text-sm">{m.n}</div><div className="text-xs text-muted mt-1">{m.pris} RDV · {m.sql} SQL</div><div className={`chip mt-2 ${m.proj >= 40 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{m.proj >= 40 ? '✓ en bonne voie' : '⚠ à suivre'}</div></div>)}</div>
    </div>
  )
  if (id === 'validation') return <ValidationDemo />
  if (id === 'org') return (
    <CardBox title="Organigramme" icon={Network}>
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="card px-4 py-2 text-center"><div className="font-bold">Manager</div><div className="text-xs text-muted">Owen M.</div></div>
        <div className="w-px h-6 bg-line" />
        <div className="flex gap-3 flex-wrap justify-center">{['Julie R.', 'Karim H.', 'Sarah T.'].map(n => <div key={n} className="card px-4 py-2 text-center"><div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-xs font-extrabold flex items-center justify-center mx-auto mb-1">{n.slice(0, 2)}</div><div className="text-xs font-semibold">{n}</div></div>)}</div>
      </div>
    </CardBox>
  )
  return null
}

function ValidationDemo() {
  const [state, setState] = useState({ Acme: true, Hooli: true, Stark: true })
  const list = [['Acme', 'Owen M.', 350], ['Hooli', 'Julie R.', 250], ['Stark', 'Sarah T.', 500]]
  return (
    <CardBox title="Validation des primes" icon={ShieldCheck}>
      <p className="text-xs text-muted mb-2">Les primes sont validées d'office ; le manager peut invalider — elles sortent des stats du collaborateur (qui est notifié).</p>
      <div className="space-y-1.5">{list.map(([e, who, v]) => (
        <div key={e} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-surface">
          <div><div className={`font-semibold ${!state[e] ? 'line-through text-muted' : ''}`}>{e} — {v} €</div><div className="text-[11px] text-muted">{who}</div></div>
          <button className={`btn-ghost !py-1 text-xs ${state[e] ? '!text-red-600' : ''}`} onClick={() => setState(s => ({ ...s, [e]: !s[e] }))}>{state[e] ? 'Invalider' : 'Revalider'}</button>
        </div>
      ))}</div>
    </CardBox>
  )
}

const SECTIONS = {
  employe: [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge }, { id: 'rdv', label: 'Mes rendez‑vous', icon: CalendarDays },
    { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare }, { id: 'tasks', label: 'Recommandations', icon: ListChecks },
    { id: 'contacts', label: 'Mes contacts', icon: BookUser }, { id: 'primes', label: 'Primes', icon: Coins },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge }, { id: 'kpi', label: 'KPI entreprise', icon: BarChart3 },
    { id: 'teamlead', label: 'Pilotage équipe', icon: Users2 }, { id: 'validation', label: 'Validation primes', icon: ShieldCheck },
    { id: 'pipeline', label: 'Pipeline entreprise', icon: KanbanSquare }, { id: 'org', label: 'Organigramme', icon: Network },
  ],
}
const TOUR = {
  employe: [
    { section: 'dashboard', t: 'Votre tableau de bord', x: 'Le BDR ouvre son espace et voit d\'un coup d\'œil ses RDV, SQL, taux de conversion et primes du mois.' },
    { section: 'rdv', t: 'Vos rendez‑vous', x: 'Chaque RDV en carte lisible : entreprise, phase, contact, date. Vues cartes, tableau et calendrier.' },
    { section: 'pipeline', t: 'Le pipeline', x: 'Un kanban anti‑doublon : glissez une carte pour changer de phase, la timeline se met à jour.' },
    { section: 'tasks', t: 'Recommandations prioritaires', x: 'L\'app dit quoi faire : no‑shows à replanifier, opportunités à traiter, leads à relancer.' },
    { section: 'contacts', t: 'Vos contacts', x: 'Le répertoire s\'alimente à chaque RDV. Import/export, recherche instantanée.' },
    { section: 'primes', t: 'Vos primes', x: 'Simulateur en direct + évolution mensuelle. Primes figées au barème du passage en SQL.' },
  ],
  manager: [
    { section: 'dashboard', t: 'Vue manager', x: 'Les mêmes indicateurs, mais agrégés sur toute l\'équipe.' },
    { section: 'kpi', t: 'KPI entreprise', x: 'Performance par BDR et entonnoir de conversion R1 → Signé.' },
    { section: 'teamlead', t: 'Pilotage d\'équipe', x: 'Forecast du mois avec projection, et le point stand‑up de 30 secondes.' },
    { section: 'validation', t: 'Validation des primes', x: 'Validez ou invalidez une prime : elle sort des stats du collaborateur, qui reçoit une notification.' },
    { section: 'pipeline', t: 'Pipeline entreprise', x: 'La vue partagée : qui travaille quoi, réassignation en quelques clics.' },
    { section: 'org', t: 'Organigramme', x: 'Managers et équipes affichés hiérarchiquement.' },
  ],
}

export default function DemoJourney({ onClose }) {
  const [phase, setPhase] = useState('landing') // 'landing' | 'loading' | 'app'
  const [role, setRole] = useState('employe')
  const [section, setSection] = useState('dashboard')
  const [tour, setTour] = useState(null) // null | index
  const [pw, setPw] = useState('')

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') { tour !== null ? setTour(null) : onClose() } }
    window.addEventListener('keydown', onEsc); return () => window.removeEventListener('keydown', onEsc)
  }, [tour, onClose])

  const enter = () => { setPhase('loading'); setTimeout(() => setPhase('app'), 1300) }
  const sections = SECTIONS[role]
  const steps = TOUR[role]
  const cur = tour !== null ? steps[tour] : null

  const switchRole = (r) => { setRole(r); setSection('dashboard'); setTour(null) }
  const startTour = () => { setTour(0); setSection(steps[0].section) }
  const tourGo = (i) => { if (i < 0 || i >= steps.length) { setTour(null); return } setTour(i); setSection(steps[i].section) }

  return (
    <div className="fixed inset-0 z-[80] bg-surface overflow-auto">
      {/* LANDING : création de compte */}
      {phase !== 'app' && (
        <div className="min-h-full flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#10162e,#1e2a52 45%,#14346b)' }}>
          <button className="absolute top-4 right-4 p-2 rounded-xl text-white/70 hover:bg-white/10" onClick={onClose}><X size={20} /></button>
          <div className="w-full max-w-md">
            {phase === 'loading' ? (
              <div className="text-center text-white">
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4 splash-logo" style={{ background: 'linear-gradient(135deg,#3B5BDB,#0EA5E9)' }}><Sparkles size={26} /></div>
                <div className="text-lg font-bold">Création de votre espace…</div>
                <div className="w-52 h-1 rounded-full bg-white/15 overflow-hidden mx-auto mt-4"><div className="splash-bar h-full rounded-full" style={{ background: 'linear-gradient(90deg,#3B5BDB,#0EA5E9)' }} /></div>
              </div>
            ) : (
              <div className="card p-6">
                <span className="chip bg-brand/10 text-brand">Démo · essai gratuit</span>
                <h2 className="text-2xl font-extrabold mt-2">Créez votre espace BD Report</h2>
                <p className="text-sm text-muted mb-4">30 secondes, aucune carte bancaire. Vous entrez dans un environnement de démonstration complet.</p>
                <label className="label">Entreprise</label>
                <div className="flex items-center gap-2 input mb-2"><Building2 size={15} className="text-muted shrink-0" /><input className="bg-transparent outline-none w-full text-sm" defaultValue="Ma société démo" /></div>
                <label className="label">Email</label>
                <div className="flex items-center gap-2 input mb-2"><Mail size={15} className="text-muted shrink-0" /><input className="bg-transparent outline-none w-full text-sm" defaultValue="demo@bdreport.app" /></div>
                <label className="label">Mot de passe</label>
                <div className="flex items-center gap-2 input mb-4"><Lock size={15} className="text-muted shrink-0" /><input type="password" className="bg-transparent outline-none w-full text-sm" placeholder="Choisissez un mot de passe" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()} /></div>
                <button className="btn-primary w-full justify-center" onClick={enter}>Créer mon espace <ArrowRight size={16} /></button>
                <p className="text-[11px] text-muted text-center mt-2">Démo isolée — aucune donnée réelle n'est créée.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APP DÉMO */}
      {phase === 'app' && (
        <div className="min-h-full flex flex-col">
          {/* Top bar */}
          <header className="h-14 px-4 flex items-center gap-3 bg-card border-b border-line sticky top-0 z-20">
            <span className="font-extrabold flex items-center gap-1.5"><LayoutDashboard size={18} className="text-brand" /> Espace démo</span>
            <div className="ml-2 flex rounded-lg border border-line overflow-hidden text-xs font-semibold">
              <button className={`px-3 py-1.5 ${role === 'employe' ? 'bg-brand text-white' : 'text-muted'}`} onClick={() => switchRole('employe')}>👤 Employé</button>
              <button className={`px-3 py-1.5 ${role === 'manager' ? 'bg-brand text-white' : 'text-muted'}`} onClick={() => switchRole('manager')}>🧑‍✈️ Manager</button>
            </div>
            <button className="btn-primary !py-1.5 text-xs ml-auto" onClick={startTour}><Play size={14} /> Visite guidée</button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={onClose}><X size={14} /> Quitter</button>
          </header>

          <div className="flex flex-1 min-h-0">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 bg-card border-r border-line p-2 hidden md:block">
              <div className="text-[10px] font-extrabold uppercase text-muted px-2 py-2">{role === 'manager' ? 'Pilotage' : 'Mon espace'}</div>
              {sections.map(s => (
                <button key={s.id} onClick={() => { setSection(s.id); setTour(null) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold mb-0.5 transition ${section === s.id ? 'bg-brand text-white' : 'text-ink hover:bg-surface'} ${cur && cur.section === s.id ? 'ring-2 ring-brand ring-offset-1' : ''}`}>
                  <s.icon size={15} /> {s.label}
                </button>
              ))}
            </aside>

            {/* Contenu */}
            <main className="flex-1 min-w-0 p-4 sm:p-5 pb-28">
              {/* Onglets horizontaux sur mobile */}
              <div className="flex gap-1.5 overflow-x-auto md:hidden mb-3">
                {sections.map(s => <button key={s.id} onClick={() => { setSection(s.id); setTour(null) }} className={`chip whitespace-nowrap ${section === s.id ? 'bg-brand text-white' : 'bg-surface text-muted'}`}>{s.label}</button>)}
              </div>
              <div className="fade-in" key={role + section}><Section id={section} role={role} /></div>
            </main>
          </div>

          {/* Visite guidée : carte flottante */}
          {cur && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 card shadow-xl w-[92vw] max-w-lg p-4 fade-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand/12 text-brand flex items-center justify-center shrink-0"><Sparkles size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold">{cur.t}</h4>
                    <span className="text-xs text-muted shrink-0">{tour + 1}/{steps.length} · {role === 'manager' ? 'Manager' : 'Employé'}</span>
                  </div>
                  <p className="text-sm text-muted mt-0.5">{cur.x}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex gap-1 flex-1">{steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full flex-1 ${i <= tour ? 'bg-brand' : 'bg-line'}`} />)}</div>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => tourGo(tour - 1)} disabled={tour === 0}><ChevronLeft size={14} /></button>
                    {tour < steps.length - 1
                      ? <button className="btn-primary !py-1 text-xs" onClick={() => tourGo(tour + 1)}>Suivant <ChevronRight size={14} /></button>
                      : <button className="btn-primary !py-1 text-xs" onClick={() => setTour(null)}><CheckCircle2 size={14} /> Terminer</button>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
