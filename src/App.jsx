import React, { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, CalendarDays, KanbanSquare, BookUser, StickyNote, Coins,
  Table2, Shield, Users, Settings as SettingsIcon, Network, LogOut, Plus, Sparkles, Lock, ArrowLeft, Code2, ListChecks, Search,
  ScrollText, ChevronDown, ChevronRight, Menu, X, Trash2, Gauge, Bell,
} from 'lucide-react'
import { useStore, APP_VERSION } from './store.jsx'
import { Logo, LogoMark, Wordmark, SplashScreen } from './Brand.jsx'
import { THEMES, applyTheme } from './themes.js'
import { Modal, Field, Toasts } from './ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Rdv from './pages/Rdv.jsx'
import Leads from './pages/Leads.jsx'
import Tasks from './pages/Tasks.jsx'
import Contacts from './pages/Contacts.jsx'
import Notes from './pages/Notes.jsx'
import Primes from './pages/Primes.jsx'
import Admin from './pages/Admin.jsx'
import Kpi from './pages/Kpi.jsx'
import Settings from './pages/Settings.jsx'
import OrgChart from './pages/OrgChart.jsx'
import AiDashboard from './pages/AiDashboard.jsx'
import Logs from './pages/Logs.jsx'
import Trash from './pages/Trash.jsx'
import TeamLead from './pages/TeamLead.jsx'
import CompanyModal from './pages/Company.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import Chatbot from './Chatbot.jsx'

// ---------------------------------------------------------------- Connexion
function Login() {
  const store = useStore()
  const [mode, setMode] = useState('login')
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    setErr('')
    if (mode === 'login') {
      const acc = store.login(id.trim(), pw)
      if (!acc) setErr('Identifiants incorrects (mail ou pseudo + mot de passe).')
    } else {
      if (!id.includes('@')) { setErr('Entrez un email valide pour créer un compte.'); return }
      if (!pw) { setErr('Choisissez un mot de passe.'); return }
      const r = store.register({ email: id.trim(), pseudo: pseudo.trim(), password: pw })
      if (r.error) setErr(r.error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1e2a52 0%, #3b5bdb 55%, #0ea5e9 100%)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md fade-in">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-fit"><LogoMark size={56} /></div>
          <h1 className="text-2xl font-extrabold tracking-tight"><span className="text-[#3B5BDB]">BD</span><span className="text-gray-900"> Report</span></h1>
          <p className="text-sm text-gray-500">Votre espace sales tout-en-un</p>
        </div>
        <div className="space-y-3">
          <button className="w-full btn border border-gray-200 justify-center text-gray-700 hover:bg-gray-50"
            onClick={() => setErr("La connexion Google nécessite un déploiement avec OAuth configuré — utilisez l'email + mot de passe en attendant.")}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.8 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20c11 0 19.5-8 19.5-20 0-1.3-.1-2.7-.9-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.8 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.7 13.5-4.7l-6.2-5.3C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.9l6.2 5.3C41.4 35.8 44 30.5 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            Continuer avec Google
          </button>
          <div className="flex items-center gap-3 text-xs text-gray-400"><div className="flex-1 h-px bg-gray-200" />ou<div className="flex-1 h-px bg-gray-200" /></div>
          <input className="input !bg-gray-50" placeholder={mode === 'login' ? 'Mail ou pseudo' : 'Email'} value={id} onChange={e => setId(e.target.value)} />
          {mode === 'register' && <input className="input !bg-gray-50" placeholder="Pseudo" value={pseudo} onChange={e => setPseudo(e.target.value)} />}
          <input className="input !bg-gray-50" type="password" placeholder="Mot de passe" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <button className="w-full btn-primary justify-center !py-2.5" onClick={submit}>
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
          <button className="w-full text-xs text-gray-500 hover:underline" onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setErr('') }}>
            {mode === 'login' ? "Pas de compte ? Créer un compte" : 'Déjà un compte ? Se connecter'}
          </button>
          <p className="text-center text-[10px] text-gray-400">version {APP_VERSION}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Bienvenue
function Welcome({ name, onDone }) {
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setShowHint(true), 2000)
    const t2 = setTimeout(onDone, 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
      <h1 className="reveal-text text-2xl sm:text-4xl font-extrabold text-gray-900 px-4">
        Bienvenue {name} dans votre Espace BDR
      </h1>
      {showHint && <p className="text-sm text-gray-400 fade-in">Chargement de vos environnements...</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Environnements
function PinGate({ title, expected, onOk, onBack }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === expected) onOk()
      else { setErr(true); setPin('') }
    }
  }, [pin, expected, onOk])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface">
      <Lock size={32} className="text-brand" />
      <h2 className="font-extrabold text-lg">{title}</h2>
      <p className="text-sm text-muted">Entrez le code d'accès à 4 chiffres</p>
      <input autoFocus type="password" inputMode="numeric" maxLength={4}
        className="input !w-40 text-center text-2xl tracking-[0.5em] font-extrabold"
        value={pin} onChange={e => { setErr(false); setPin(e.target.value.replace(/\D/g, '')) }} />
      {err && <p className="text-red-500 text-sm">Code incorrect.</p>}
      <button className="btn-ghost text-xs" onClick={onBack}><ArrowLeft size={13} /> Retour</button>
    </div>
  )
}

function EnvPicker() {
  const store = useStore()
  const me = store.account
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', logo: '' })
  const [pinFor, setPinFor] = useState(null)

  // Owen (développeur) voit tous les environnements ; les autres, ceux qu'ils ont créés
  // ou ceux auxquels un administrateur / manager les a ajoutés (membres).
  const envs = me.developer
    ? store.db.environments
    : store.db.environments.filter(e => e.createdBy === me.id || (e.members || []).includes(me.id))

  const enter = (env) => {
    if (env.pin) setPinFor(env)
    else store.enterEnv(env.id)
  }

  if (pinFor) return <PinGate title={pinFor.name} expected={pinFor.pin} onOk={() => store.enterEnv(pinFor.id)} onBack={() => setPinFor(null)} />

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold">Choisissez un environnement</h2>
        {me.developer && <p className="text-xs text-muted mt-1 flex items-center gap-1 justify-center"><Code2 size={13} /> Portail Développeur — accès à tous les environnements</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {envs.map(env => (
          <button key={env.id} className="card w-44 h-44 flex flex-col items-center justify-center gap-3 hover:scale-105 transition fade-in" onClick={() => enter(env)}>
            {env.logo
              ? <img src={env.logo} alt="" className="w-16 h-16 rounded-2xl object-cover" />
              : <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand2 text-white text-2xl font-extrabold flex items-center justify-center">{env.name[0]}</div>}
            <span className="font-bold">{env.name}</span>
            {env.pin && <Lock size={13} className="text-muted" />}
          </button>
        ))}
        <button className="card w-44 h-44 flex flex-col items-center justify-center gap-2 border-dashed hover:scale-105 transition text-muted" onClick={() => setCreating(true)}>
          <Plus size={28} /> <span className="text-sm font-semibold">Créer un environnement</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">Connecté : {me.pseudo} ({me.email})</span>
        <button className="btn-ghost !py-1 text-xs" onClick={store.logout}><LogOut size={13} /> Déconnexion</button>
      </div>
      {creating && (
        <Modal title="Créer un environnement" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label="Nom de l'environnement" required>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Logo (image de fond)">
              <input type="file" accept="image/*" className="text-sm" onChange={e => {
                const f = e.target.files[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => setForm(x => ({ ...x, logo: String(r.result) }))
                r.readAsDataURL(f)
              }} />
            </Field>
            <p className="text-xs text-muted">Le nouvel environnement contient toutes les fonctionnalités de l'app, vide de données. Vous en devenez le Manager.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn-primary" onClick={() => {
                if (!form.name.trim()) return
                const env = store.createEnv(form)
                setCreating(false)
                store.enterEnv(env.id)
              }}>Créer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SubEnvPicker() {
  const store = useStore()
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const subs = store.db.subenvs.filter(s => s.envId === session.envId)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ prenom: '', nom: '', poste: '', service: '', pin: '' })
  const [pinFor, setPinFor] = useState(null)

  if (pinFor) return <PinGate title={`${pinFor.prenom} ${pinFor.nom}`} expected={pinFor.pin} onOk={() => store.enterSubEnv(pinFor.id)} onBack={() => setPinFor(null)} />

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        {env?.logo && <img src={env.logo} alt="" className="w-14 h-14 rounded-2xl object-cover mx-auto mb-2" />}
        <h2 className="text-2xl font-extrabold">{env?.name} — Choisissez votre espace</h2>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {subs.map(s => (
          <button key={s.id} className="card w-44 h-44 flex flex-col items-center justify-center gap-2 hover:scale-105 transition fade-in"
            onClick={() => s.pin ? setPinFor(s) : store.enterSubEnv(s.id)}>
            {s.photo
              ? <img src={s.photo} alt="" className="w-14 h-14 rounded-full object-cover" />
              : <div className="w-14 h-14 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center text-lg">{(s.prenom?.[0] || '') + (s.nom?.[0] || '')}</div>}
            <span className="font-bold text-sm">{s.prenom} {s.nom}</span>
            <span className="text-xs text-muted">{s.poste} · {s.service}</span>
            {s.pin && <Lock size={12} className="text-muted" />}
          </button>
        ))}
        <button className="card w-44 h-44 flex flex-col items-center justify-center gap-2 border-dashed hover:scale-105 transition text-muted" onClick={() => setCreating(true)}>
          <Plus size={28} /> <span className="text-sm font-semibold">Nouvel espace</span>
        </button>
      </div>
      <button className="btn-ghost text-xs" onClick={() => store.setSession(s => ({ ...s, envId: null }))}><ArrowLeft size={13} /> Changer d'environnement</button>
      {creating && (
        <Modal title="Créer votre espace collaborateur" onClose={() => setCreating(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" required><input className="input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} /></Field>
            <Field label="Nom" required><input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} /></Field>
            <Field label="Poste" required><input className="input" value={form.poste} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))} /></Field>
            <Field label="Service" required>
              <select className="input" value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))}>
                <option value="">—</option>
                {(env?.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Code d'accès (4 chiffres)"><input className="input" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} /></Field>
          </div>
          <p className="text-xs text-muted mt-3">Ce nouvel espace est totalement indépendant et démarre vide de données.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button className="btn-primary" onClick={() => {
              if (!form.prenom || !form.nom || !form.poste || !form.service) return
              const sub = store.createSubEnv(env.id, form)
              setCreating(false)
              store.enterSubEnv(sub.id)
            }}>Créer mon espace</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- App principale
const NAV_GROUPS = [
  {
    id: 'pilotage', label: 'Pilotage', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, brick: 'Dashboard' },
      { id: 'ai', label: 'Dashboard personnalisé', icon: Sparkles, brick: 'Dashboard personnalisé' },
      { id: 'kpi', label: 'KPI Entreprise', icon: Table2, brick: 'KPI Entreprise', roles: ['Manager', 'Administrateur', 'Fondateur'] },
      { id: 'teamlead', label: 'Pilotage équipe', icon: Gauge, roles: ['Manager', 'Administrateur', 'Fondateur'] },
    ],
  },
  {
    id: 'activite', label: 'Activité commerciale', items: [
      { id: 'rdv', label: 'Mes Rendez-vous', icon: CalendarDays, brick: 'Mes Rendez-vous' },
      { id: 'leads', label: 'Leads', icon: KanbanSquare, brick: 'Leads' },
      { id: 'tasks', label: 'Tâches prioritaires', icon: ListChecks, brick: 'Tâches prioritaires' },
    ],
  },
  {
    id: 'donnees', label: 'Données', items: [
      { id: 'contacts', label: 'Mes contacts', icon: BookUser, brick: 'Mes contacts' },
      { id: 'notes', label: 'Mes notes', icon: StickyNote, brick: 'Mes notes' },
      { id: 'logs', label: 'Logs', icon: ScrollText, brick: 'Logs' },
      { id: 'corbeille', label: 'Corbeille', icon: Trash2 },
    ],
  },
  {
    id: 'remuneration', label: 'Rémunération', items: [
      { id: 'primes', label: 'Primes & Commissions', icon: Coins, brick: 'Primes & Commissions' },
    ],
  },
  {
    id: 'administration', label: 'Administration', items: [
      { id: 'admin', label: 'Gestion Administration', icon: Shield, roles: ['Fondateur', 'Administrateur'] },
      { id: 'teams', label: 'Gérez mes équipes', icon: Users, roles: ['Manager'] },
    ],
  },
]
const NAV = NAV_GROUPS.flatMap(g => g.items)

function MainApp() {
  const store = useStore()
  const me = store.account
  const session = store.session
  const sub = store.db.subenvs.find(s => s.id === session.subEnvId)
  const env = store.db.environments.find(e => e.id === session.envId)
  const [page, setPage] = useState('dashboard')
  const [pendingNote, setPendingNote] = useState('')
  const [theme, setTheme] = useState(() => store.sub?.theme || 'ocean-pro')

  useEffect(() => { applyTheme(store.sub?.theme || 'ocean-pro') }, [session.subEnvId])

  const themeObj = THEMES.find(t => t.id === (store.sub?.theme || theme)) || THEMES[0]

  const canSee = (item) => {
    if (item.roles && !item.roles.includes(me.role)) return false
    if (item.brick && !(me.bricks || []).includes(item.brick)) return false
    return true
  }
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(canSee) })).filter(g => g.items.length)
  const [closedGroups, setClosedGroups] = useState({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  useEffect(() => { const t = setTimeout(() => setBooting(false), 350); return () => clearTimeout(t) }, [session.subEnvId])
  const goto = (id) => { setPage(id); setSidebarOpen(false) }

  const goCreateRdvFromNote = (content) => { setPendingNote(content); setPage('rdv') }

  const pageEl = {
    dashboard: <Dashboard />,
    rdv: <Rdv pendingNote={pendingNote} onPendingNoteUsed={() => setPendingNote('')} />,
    leads: <Leads />,
    tasks: <Tasks />,
    contacts: <Contacts />,
    notes: <Notes onCreateRdvFromNote={goCreateRdvFromNote} />,
    primes: <Primes />,
    ai: <AiDashboard />,
    logs: <Logs />,
    corbeille: <Trash />,
    kpi: <Kpi />,
    teamlead: <TeamLead />,
    admin: <Admin mode="admin" />,
    teams: <Admin mode="teams" />,
    settings: <Settings onEditWidgets={() => setPage('dashboard')} currentTheme={store.sub?.theme || 'ocean-pro'}
      onThemeSaved={(t) => { store.setSub(d => ({ ...d, theme: t })); setTheme(t) }} />,
    org: <OrgChart onOpenProfile={(s) => { store.enterSubEnv(s.id); setPage('dashboard') }} />,
  }[page] || <Dashboard />

  return (
    <div className="min-h-screen flex relative">
      {themeObj.type === 'animated' && (themeObj.bubbles || []).map((c, i) => (
        <div key={i} className="bubble-float" style={{
          background: c, width: 220 + i * 60, height: 220 + i * 60,
          left: `${15 + i * 30}%`, top: `${20 + i * 22}%`, animationDelay: `${i * 2.5}s`,
        }} />
      ))}
      {/* Sidebar (off-canvas sur mobile, fixe sur desktop) */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`w-56 shrink-0 bg-card/95 backdrop-blur border-r border-line flex flex-col
        fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:translate-x-0 lg:z-10
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-3.5 py-3 border-b border-line space-y-2">
          <Logo size={28} textClass="text-[17px]" />
          <div className="flex items-center gap-2 min-w-0">
            {env?.logo && <img src={env.logo} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />}
            <div className="min-w-0">
              <div className="font-bold text-[12px] leading-tight truncate">Espace Sales de {me.pseudo}</div>
              <div className="text-[11px] text-muted truncate">{env?.name} · {sub?.prenom} {sub?.nom}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          {groups.map(g => {
            const open = !closedGroups[g.id]
            const hasActive = g.items.some(i => i.id === page)
            return (
              <div key={g.id} className="mb-1">
                <button onClick={() => setClosedGroups(c => ({ ...c, [g.id]: !c[g.id] }))}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${hasActive ? 'text-brand' : 'text-muted'} hover:bg-surface`}>
                  {g.label}
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {(open || hasActive) && (
                  <div className="space-y-0.5 mt-0.5">
                    {g.items.map(item => (
                      <button key={item.id} onClick={() => goto(item.id)}
                        className={`w-full flex items-center gap-2 pl-3 pr-2 py-[7px] rounded-lg text-[13px] font-semibold transition ${page === item.id ? 'bg-brand text-white' : 'text-ink hover:bg-surface'}`}>
                        <item.icon size={15} className={page === item.id ? '' : 'text-muted'} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="px-2 py-2 border-t border-line space-y-0.5">
          <button className="w-full flex items-center gap-2 px-3 py-[7px] rounded-lg text-[13px] font-semibold text-muted hover:bg-surface"
            onClick={() => store.setSession(s => ({ ...s, subEnvId: null }))}>
            <ArrowLeft size={15} /> Changer d'espace
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-[7px] rounded-lg text-[13px] font-semibold text-red-500 hover:bg-red-50"
            onClick={store.logout}>
            <LogOut size={15} /> Déconnexion
          </button>
          <p className="text-center text-[10px] text-muted pt-1">v{APP_VERSION}</p>
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex-1 min-w-0 z-10">
        <header className="h-14 px-3 sm:px-5 flex items-center justify-between bg-card/80 backdrop-blur border-b border-line sticky top-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button className="p-2 rounded-xl hover:bg-surface lg:hidden" title="Menu" onClick={() => setSidebarOpen(o => !o)}>
              {sidebarOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <span className="font-bold text-sm text-muted truncate">{NAV.find(n => n.id === page)?.label || (page === 'settings' ? 'Paramètres' : page === 'org' ? 'Organigramme' : '')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button title="Recherche (Ctrl+K)" className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-line text-muted text-xs hover:bg-surface"
              onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}>
              <Search size={14} /> <span className="hidden sm:inline">Rechercher</span> <kbd className="hidden sm:inline text-[10px] border border-line rounded px-1">⌘K</kbd>
            </button>
            <MentionsBell />
            <button title="Organigramme" className={`p-2 rounded-xl hover:bg-surface ${page === 'org' ? 'text-brand' : 'text-muted'}`} onClick={() => setPage('org')}>
              <Network size={19} />
            </button>
            <button title="Paramètres" className={`p-2 rounded-xl hover:bg-surface ${page === 'settings' ? 'text-brand' : 'text-muted'}`} onClick={() => setPage('settings')}>
              <SettingsIcon size={19} />
            </button>
            {me.photo
              ? <img src={me.photo} alt="" className="w-8 h-8 rounded-full object-cover ml-1" />
              : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-xs font-extrabold flex items-center justify-center ml-1">{me.pseudo?.slice(0, 2).toUpperCase()}</div>}
          </div>
        </header>
        <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
          {booting ? <PageSkeleton /> : pageEl}
        </main>
      </div>
      <CompanyModal />
      <GlobalSearch onNavigate={goto} />
      <Chatbot />
      <Toasts />
    </div>
  )
}

// Cloche de notifications : @mentions reçues dans les commentaires d'entreprise
function MentionsBell() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const mentions = store.sub?.mentions || []
  const unread = mentions.filter(m => !m.read).length
  const openMention = (m) => {
    store.setSub(d => ({ ...d, mentions: d.mentions.map(x => x.id === m.id ? { ...x, read: true } : x) }))
    setOpen(false)
    window.dispatchEvent(new CustomEvent('open-company', { detail: m.company }))
  }
  return (
    <div className="relative">
      <button title="Notifications" className={`p-2 rounded-xl hover:bg-surface relative ${open ? 'text-brand' : 'text-muted'}`} onClick={() => setOpen(o => !o)}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-extrabold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 card shadow-xl w-80 p-2 fade-in">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-bold uppercase text-muted">Mentions</span>
            {mentions.length > 0 && <button className="text-[11px] text-brand underline"
              onClick={() => store.setSub(d => ({ ...d, mentions: d.mentions.map(x => ({ ...x, read: true })) }))}>Tout marquer lu</button>}
          </div>
          {mentions.length === 0 && <p className="text-xs text-muted text-center py-5">Aucune mention. Vos collègues peuvent vous citer avec @{store.db.subenvs.find(s => s.id === store.session.subEnvId)?.prenom} dans les commentaires d'entreprise.</p>}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {mentions.slice(0, 20).map(m => (
              <button key={m.id} onClick={() => openMention(m)}
                className={`w-full text-left p-2 rounded-lg hover:bg-surface ${m.read ? 'opacity-60' : ''}`}>
                <div className="text-xs"><b>{m.from}</b> vous a mentionné sur <b>{m.company}</b></div>
                <div className="text-xs text-muted line-clamp-2">{m.text}</div>
                <div className="text-[10px] text-muted">{new Date(m.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Squelette affiché brièvement à l'entrée dans un espace (chargement perçu plus doux)
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-7 w-48 rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
      </div>
    </div>
  )
}

export default function App() {
  const store = useStore()
  const session = store.session
  // Splash screen BD Report : une fois par session navigateur
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('bdr_splashed'))
  useEffect(() => {
    if (!splash) return
    const t = setTimeout(() => { sessionStorage.setItem('bdr_splashed', '1'); setSplash(false) }, 1500)
    return () => clearTimeout(t)
  }, [splash])
  if (splash) return <SplashScreen />

  if (!session || !store.account) return <Login />
  if (!session.welcomed) {
    return <Welcome name={store.account.pseudo} onDone={() => store.setSession(s => ({ ...s, welcomed: true }))} />
  }
  if (!session.envId) return <EnvPicker />
  if (!session.subEnvId) return <SubEnvPicker />
  if (!store.sub) return <SubEnvPicker />
  return <MainApp />
}
