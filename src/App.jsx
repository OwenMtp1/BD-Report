import React, { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, CalendarDays, KanbanSquare, BookUser, StickyNote, Coins,
  Table2, Shield, Users, Settings as SettingsIcon, Network, LogOut, Plus, Sparkles, Lock, ArrowLeft, Code2, ListChecks, Search,
  ScrollText, ChevronDown, ChevronRight, Menu, X, Trash2, Gauge, Bell, CheckSquare, LifeBuoy, Inbox, Users2, FolderKanban, BookOpen, Target,
  AtSign, CalendarClock, AlertTriangle, Clock, Check, Gift, MessagesSquare, Trophy, ShieldCheck,
} from 'lucide-react'
import { useStore, APP_VERSION, setCurrentCurrency, allowedBricks, hasTeamAccess, findOffer, PLANS, SUPPORT_ROLES, ticketHasUnread, slaInfo, todayISO, PRESENCE_META, PRESENCE_ORDER } from './store.jsx'
import { NAV_GROUPS, NAV } from './nav.jsx'
import { Logo, LogoMark, Wordmark, SplashScreen } from './Brand.jsx'
import { useT, LANGS } from './i18n.jsx'
import { THEMES, applyTheme } from './themes.js'
import { Modal, Field, Toasts, Confetti } from './ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Rdv from './pages/Rdv.jsx'
import Leads from './pages/Leads.jsx'
import Tasks from './pages/Tasks.jsx'
import MyTasks from './pages/MyTasks.jsx'
import Contacts from './pages/Contacts.jsx'
import Notes from './pages/Notes.jsx'
import Primes from './pages/Primes.jsx'
import Admin from './pages/Admin.jsx'
import Kpi from './pages/Kpi.jsx'
import Icp from './pages/Icp.jsx'
import Settings from './pages/Settings.jsx'
import OrgChart from './pages/OrgChart.jsx'
import SupportHub from './pages/SupportHub.jsx'
import Conversations from './pages/Conversations.jsx'
import DataQuality from './pages/DataQuality.jsx'
import Classement from './pages/Classement.jsx'
import Simulateur from './pages/Simulateur.jsx'
import Souscrire from './pages/Souscrire.jsx'
import Hubspot from './pages/Hubspot.jsx'
import Logs from './pages/Logs.jsx'
import Trash from './pages/Trash.jsx'
import TeamLead from './pages/TeamLead.jsx'
import Support from './pages/Support.jsx'
import Requests from './pages/Requests.jsx'
import Tickets from './pages/Tickets.jsx'
import Clients from './pages/Clients.jsx'
import Projects from './pages/Projects.jsx'
import SupportTrash from './pages/SupportTrash.jsx'
import SupportLogs from './pages/SupportLogs.jsx'
import KnowledgeBase from './pages/KnowledgeBase.jsx'
import CompanyModal from './pages/Company.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import Chatbot from './Chatbot.jsx'

// ---------------------------------------------------------------- Connexion
function Login() {
  const store = useStore()
  const { t, lang } = useT()
  const saved = store.getSavedCreds ? store.getSavedCreds() : null
  const [mode, setMode] = useState('login')
  const [id, setId] = useState(saved?.id || '')
  const [pw, setPw] = useState(saved?.pw || '')
  const [pseudo, setPseudo] = useState('')
  const [err, setErr] = useState('')
  const [remember, setRemember] = useState(false)
  const [savePw, setSavePw] = useState(!!saved)

  const submit = () => {
    setErr('')
    if (mode === 'login') {
      const acc = store.login(id.trim(), pw, { remember, savePw })
      if (acc && acc.error === 'disabled') setErr('Accès désactivé. Contactez le support BD Report.')
      else if (!acc || acc.error) setErr(t('login.errBad'))
    } else {
      if (!id.includes('@')) { setErr(t('login.errEmail')); return }
      if (!pw) { setErr(t('login.errPw')); return }
      const r = store.register({ email: id.trim(), pseudo: pseudo.trim(), password: pw })
      if (r.error) setErr(r.error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1e2a52 0%, #3b5bdb 55%, #0ea5e9 100%)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md fade-in">
        <div className="flex justify-end -mt-2 -mr-2 mb-1 gap-1">
          {LANGS.map(l => (
            <button key={l.id} title={l.label} onClick={() => store.setUiLang(l.id)}
              className={`text-base px-1.5 py-1 rounded-lg ${l.id === lang ? 'bg-gray-100' : 'opacity-50 hover:opacity-100'}`}>{l.flag}</button>
          ))}
        </div>
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-fit"><LogoMark size={56} /></div>
          <h1 className="text-2xl font-extrabold tracking-tight"><span className="text-[#3B5BDB]">BD</span><span className="text-gray-900"> Report</span></h1>
          <p className="text-sm text-gray-500">{t('login.tagline')}</p>
        </div>
        <div className="space-y-3">
          <button className="w-full btn border border-gray-200 justify-center text-gray-700 hover:bg-gray-50"
            onClick={() => setErr(t('login.googleSoon'))}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.8 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20c11 0 19.5-8 19.5-20 0-1.3-.1-2.7-.9-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.8 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.7 13.5-4.7l-6.2-5.3C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.9l6.2 5.3C41.4 35.8 44 30.5 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
            {t('login.google')}
          </button>
          <div className="flex items-center gap-3 text-xs text-gray-400"><div className="flex-1 h-px bg-gray-200" />{t('login.or')}<div className="flex-1 h-px bg-gray-200" /></div>
          <input className="input !bg-gray-50" placeholder={mode === 'login' ? t('login.idph') : t('login.emailph')} value={id} onChange={e => setId(e.target.value)} />
          {mode === 'register' && <input className="input !bg-gray-50" placeholder={t('login.userph')} value={pseudo} onChange={e => setPseudo(e.target.value)} />}
          <input className="input !bg-gray-50" type="password" placeholder={t('login.pwph')} value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {mode === 'login' && (
            <div className="flex flex-col gap-1.5 text-xs text-gray-600">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Rester connecté pendant 30 jours (ne plus demander le mot de passe)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={savePw} onChange={e => setSavePw(e.target.checked)} />
                Enregistrer mon mot de passe sur cet appareil
              </label>
            </div>
          )}
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <button className="w-full btn-primary justify-center !py-2.5" onClick={submit}>
            {mode === 'login' ? t('login.signin') : t('login.signup')}
          </button>
          <button className="w-full text-xs text-gray-500 hover:underline" onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setErr('') }}>
            {mode === 'login' ? t('login.toSignup') : t('login.toSignin')}
          </button>
          <p className="text-center text-[10px] text-gray-400">version {APP_VERSION}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Bienvenue
function Welcome({ name, onDone }) {
  const { t } = useT()
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setShowHint(true), 2000)
    const t2 = setTimeout(onDone, 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="welcome-reveal text-2xl sm:text-4xl font-extrabold text-gray-900 max-w-2xl leading-snug">
        {t('welcome.hello')} {name} {t('welcome.inSpace')}
      </h1>
      {showHint && <p className="text-sm text-gray-400 fade-in">{t('welcome.loading')}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Environnements
function PinGate({ title, expected, onOk, onBack }) {
  const { t } = useT()
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
      <p className="text-sm text-muted">{t('env.pinTitle')}</p>
      <input autoFocus type="password" inputMode="numeric" maxLength={4}
        className="input !w-40 text-center text-2xl tracking-[0.5em] font-extrabold"
        value={pin} onChange={e => { setErr(false); setPin(e.target.value.replace(/\D/g, '')) }} />
      {err && <p className="text-red-500 text-sm">{t('env.pinWrong')}</p>}
      <button className="btn-ghost text-xs" onClick={onBack}><ArrowLeft size={13} /> {t('env.back')}</button>
    </div>
  )
}

function EnvPicker() {
  const store = useStore()
  const { t } = useT()
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
        <h2 className="text-2xl font-extrabold">{t('env.choose')}</h2>
        {me.developer && <p className="text-xs text-muted mt-1 flex items-center gap-1 justify-center"><Code2 size={13} /> {t('env.devPortal')}</p>}
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
          <Plus size={28} /> <span className="text-sm font-semibold">{t('env.create')}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">{t('env.connectedAs')} : {me.pseudo} ({me.email})</span>
        <button className="btn-ghost !py-1 text-xs" onClick={store.logout}><LogOut size={13} /> {t('common.logout')}</button>
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
  const { t } = useT()
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
        <h2 className="text-2xl font-extrabold">{env?.name} — {t('env.chooseSpace')}</h2>
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
          <Plus size={28} /> <span className="text-sm font-semibold">{t('env.newSpace')}</span>
        </button>
      </div>
      <button className="btn-ghost text-xs" onClick={() => store.setSession(s => ({ ...s, envId: null }))}><ArrowLeft size={13} /> {t('env.changeEnv')}</button>
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
// NAV_GROUPS / NAV proviennent de src/nav.jsx (source unique des onglets).

function MainApp() {
  const store = useStore()
  const me = store.account
  const session = store.session
  const sub = store.db.subenvs.find(s => s.id === session.subEnvId)
  const env = store.db.environments.find(e => e.id === session.envId)
  const { t: tr } = useT()
  const [page, setPage] = useState(() => {
    if (store.demo) return 'dashboard' // démo isolée : n'hérite pas de l'URL de l'app réelle
    const seg = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '')).split('/')
    return (seg[0] && seg[0] !== 'company') ? seg[0] : 'dashboard'
  })
  const [pendingNote, setPendingNote] = useState('')
  const [theme, setTheme] = useState(() => store.sub?.theme || 'ocean-pro')
  const [profileOpen, setProfileOpen] = useState(false)
  const [collabSub, setCollabSub] = useState(null) // fiche d'un collaborateur (depuis la recherche)

  useEffect(() => { applyTheme(store.sub?.theme || 'ocean-pro') }, [session.subEnvId])
  // Mode « Auto (système)» : réagit en direct au basculement clair/sombre de l'appareil.
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if ((store.sub?.theme || 'ocean-pro') === 'auto') applyTheme('auto') }
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener?.(onChange) }
  }, [store.sub?.theme])
  useEffect(() => { setCurrentCurrency(store.sub?.currency || 'EUR') }, [session.subEnvId, store.sub?.currency])

  const themeObj = THEMES.find(t => t.id === (store.sub?.theme || theme)) || THEMES[0]

  // Pastilles « nouveaux messages » : côté client (mes tickets) et côté support (tous les tickets).
  const isSupportUser = SUPPORT_ROLES.includes(me.role)
  const myTickets = (store.db.tickets || []).filter(t => t.userAccountId === me.id)
  const supportUnread = isSupportUser ? (store.db.tickets || []).filter(t => ticketHasUnread(t, 'support')).length : 0
  const newRequests = isSupportUser ? (store.db.supportRequests || []).filter(r => !r.archived && r.status === 'new').length : 0
  const badges = {
    support: myTickets.filter(t => ticketHasUnread(t, 'user')).length,
    // La console Support unifie tickets + demandes : pastille cumulée sur « Équipe support ».
    supporthub: supportUnread + newRequests + (isSupportUser ? store.totalChannelUnread('support') : 0),
    conversations: store.totalChannelUnread('team'),
  }

  const myBricks = allowedBricks(me, store.db.offers) // briques permises par l'offre
  const myTeam = hasTeamAccess(me, store.db.offers)   // accès équipe/pilotage (offre `team` ou support)
  const myOffer = findOffer(store.db.offers, me.plan)
  const noOffer = !myOffer && !isSupportUser          // compte sans offre : support + souscrire seulement
  const canSee = (item) => {
    if (item.roles && !item.roles.includes(me.role)) return false
    if (item.staffOnly) return isSupportUser            // console support : équipe BD Report uniquement
    if (item.always) return true                         // Support / Souscrire : toujours accessibles
    if (noOffer) return false                            // sans offre : rien d'autre que les onglets « always »
    if (item.brick && !myBricks.includes(item.brick)) return false // l'offre décide de chaque onglet
    return true
  }
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(canSee) })).filter(g => g.items.length)
  // Densité adaptative de la sidebar : les rubriques se resserrent quand il y a beaucoup
  // d'onglets (et se relâchent quand il y en a moins) pour tenir sur une seule page sans scroll.
  const navRows = groups.reduce((n, g) => n + g.items.length, 0) + groups.length
  const dense = navRows > 26 ? 2 : navRows > 20 ? 1 : 0
  const itemCls = dense === 2 ? 'py-[3px] text-[12px]' : dense === 1 ? 'py-[5px] text-[12.5px]' : 'py-[7px] text-[13px]'
  const grpHdrCls = dense >= 1 ? 'py-1' : 'py-1.5'
  const grpWrapCls = dense === 2 ? 'mb-0.5' : 'mb-1'
  const iconSz = dense === 2 ? 14 : 15
  const [closedGroups, setClosedGroups] = useState({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  useEffect(() => { const t = setTimeout(() => setBooting(false), 350); return () => clearTimeout(t) }, [session.subEnvId])
  const goto = (id) => { setPage(id); setSidebarOpen(false) }

  // Au changement d'onglet, remonter automatiquement en haut de la page.
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }, [page])

  // Deep-links : l'onglet courant se reflète dans l'URL (#/page) → bookmarkable + back/forward.
  // On n'écrase jamais un lien de fiche entreprise (#/company/<nom>), géré par CompanyModal.
  useEffect(() => {
    if (store.demo) return // démo isolée : ne touche jamais à l'URL (sinon l'app réelle bouge)
    const raw = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, ''))
    if (raw.startsWith('company/')) return
    if (raw.split('/')[0] !== page) window.location.hash = '/' + page
  }, [page])

  useEffect(() => {
    if (store.demo) return // démo isolée : n'écoute pas les changements d'URL
    const seg = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '')).split('/')
    if (seg[0] === 'company' && seg[1]) setTimeout(() => window.dispatchEvent(new CustomEvent('open-company', { detail: seg[1] })), 300)
    const onHash = () => {
      const parts = decodeURIComponent((window.location.hash || '').replace(/^#\/?/, '')).split('/')
      if (parts[0] === 'company' && parts[1]) window.dispatchEvent(new CustomEvent('open-company', { detail: parts[1] }))
      else if (parts[0]) setPage(parts[0])
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Navigation déclenchée par d'autres composants (ex : l'assistant IA renvoie vers le Support).
  // En démo, l'app réelle NE réagit PAS à app-navigate (sinon la visite guidée démonterait
  // l'overlay de démo) ; seul l'instance de démo écoute son canal privé 'demo-navigate'.
  useEffect(() => {
    if (store.demo) return
    const h = (e) => { if (e.detail) goto(e.detail) }
    window.addEventListener('app-navigate', h)
    return () => window.removeEventListener('app-navigate', h)
  }, [store.demo])
  useEffect(() => {
    if (!store.demo) return
    const h = (e) => { if (e.detail) goto(e.detail) }
    window.addEventListener('demo-navigate', h)
    return () => window.removeEventListener('demo-navigate', h)
  }, [store.demo])
  // Fiche d'un collaborateur ouverte depuis la recherche globale.
  useEffect(() => {
    const h = (e) => { if (e.detail) setCollabSub(e.detail) }
    window.addEventListener('open-collaborator', h)
    return () => window.removeEventListener('open-collaborator', h)
  }, [])

  const goCreateRdvFromNote = (content) => { setPendingNote(content); setPage('rdv') }

  const pageEl = {
    dashboard: <Dashboard />,
    rdv: <Rdv pendingNote={pendingNote} onPendingNoteUsed={() => setPendingNote('')} />,
    leads: <Leads />,
    tasks: <Tasks />,
    mytasks: <MyTasks />,
    contacts: <Contacts />,
    notes: <Notes onCreateRdvFromNote={goCreateRdvFromNote} />,
    primes: <Primes />,
    supporthub: <SupportHub />,
    conversations: <Conversations scope="team" />,
    dataquality: <DataQuality />,
    classement: <Classement />,
    simulateur: <Simulateur />,
    souscrire: <Souscrire />,
    logs: <Logs />,
    corbeille: <Trash />,
    support: <Support />,
    requests: <Requests />,
    tickets: <Tickets />,
    clients: <Clients />,
    projects: <Projects />,
    kb: <KnowledgeBase />,
    supportlogs: <SupportLogs />,
    supporttrash: <SupportTrash />,
    kpi: <Kpi />,
    icp: <Icp />,
    teamlead: <TeamLead />,
    admin: <Admin mode="admin" />,
    teams: <Admin mode="teams" />,
    hubspot: <Hubspot />,
    settings: <Settings onEditWidgets={() => setPage('dashboard')} currentTheme={store.sub?.theme || 'ocean-pro'}
      onThemeSaved={(t) => { store.setSub(d => ({ ...d, theme: t })); setTheme(t) }} />,
    org: <OrgChart onOpenProfile={(s) => {
      // Respecte le code PIN (micro 16) : accès direct seulement si on gère la personne
      // ou si on est principal/dev/admin/fondateur ; sinon on passe par la saisie du code.
      const env = store.db.environments.find(e => e.id === session.envId)
      const owner = store.db.accounts.find(a => a.id === s.ownerId)
      const elevated = ['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur'].includes(me.role) || env?.createdBy === me.id
      const manages = me.role === 'Manager' && owner?.teamOf === me.id
      const own = s.ownerId === me.id
      if (elevated || manages || own || !s.pin) { store.enterSubEnv(s.id); setPage('dashboard') }
      else { store.setSession(sx => ({ ...sx, subEnvId: null })) } // renvoie au sélecteur d'espace (avec PIN)
    }} />,
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
      <aside className={`w-60 shrink-0 bg-card/95 backdrop-blur border-r border-line flex flex-col
        fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:translate-x-0 lg:z-10
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-3.5 py-2.5 border-b border-line">
          <Logo size={26} textClass="text-[16px]" />
          <div className="flex items-center gap-1.5 min-w-0 mt-1.5">
            {env?.logo && <img src={env.logo} alt="" className="w-5 h-5 rounded-md object-cover shrink-0" />}
            <div className="text-[11px] text-muted truncate">{env?.name}{sub ? ` · ${sub.prenom} ${sub.nom}` : ''}</div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          {groups.map(g => {
            const open = !closedGroups[g.id]
            const hasActive = g.items.some(i => i.id === page)
            return (
              <div key={g.id} className={grpWrapCls}>
                <button onClick={() => setClosedGroups(c => ({ ...c, [g.id]: !c[g.id] }))}
                  className={`w-full flex items-center justify-between px-2 ${grpHdrCls} rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${hasActive ? 'text-brand' : 'text-muted'} hover:bg-surface`}>
                  {tr(`nav.${g.id}`, g.label)}
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {(open || hasActive) && (
                  <div className="space-y-0.5 mt-0.5">
                    {g.items.map(item => {
                      const label = tr(`page.${item.id}`, item.label)
                      // En lecture seule (résiliation/blocage), les briques apparaissent transparentes (consultation uniquement).
                      const dimmed = store.readOnly && item.brick
                      return (
                        <button key={item.id} onClick={() => goto(item.id)} title={dimmed ? `${label} — lecture seule` : label}
                          className={`w-full flex items-center gap-2 pl-3 pr-2 ${itemCls} rounded-lg font-semibold transition ${page === item.id ? 'bg-brand text-white' : 'text-ink hover:bg-surface'} ${dimmed && page !== item.id ? 'opacity-40' : ''}`}>
                          <item.icon size={iconSz} className={`shrink-0 ${page === item.id ? '' : 'text-muted'}`} />
                          <span className="truncate">{label}</span>
                          {badges[item.id] > 0 && (
                            <span className={`ml-auto shrink-0 text-[10px] font-extrabold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ${page === item.id ? 'bg-white text-brand' : 'bg-red-500 text-white'}`}>
                              {badges[item.id]}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="px-2 py-2 border-t border-line space-y-0.5">
          {!myTeam && !isSupportUser && (
            <button className="mt-1 w-full rounded-lg bg-brand/10 p-2 text-center hover:bg-brand/15" onClick={() => goto('souscrire')}>
              <div className="text-[11px] font-bold text-brand">{myOffer ? `Offre ${myOffer.name}` : 'Aucune offre active'}</div>
              <div className="text-[10px] text-muted">{myOffer ? 'Passez à une offre équipe pour tout débloquer' : 'Souscrivez à une offre pour accéder à l’app'}</div>
            </button>
          )}
          <p className="text-center text-[10px] text-muted pt-1">v{APP_VERSION} · {myOffer ? myOffer.name : 'Sans offre'}</p>
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex-1 min-w-0 z-10">
        <header className="h-14 px-3 sm:px-5 flex items-center justify-between bg-card/80 backdrop-blur border-b border-line sticky top-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button className="p-2 rounded-xl hover:bg-surface lg:hidden" title="Menu" onClick={() => setSidebarOpen(o => !o)}>
              {sidebarOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            {/* Titre affiché uniquement sur mobile (les pages ont déjà leur titre — micro 3) */}
            <span className="font-bold text-sm text-muted truncate lg:hidden">{tr(`page.${page}`, NAV.find(n => n.id === page)?.label || (page === 'settings' ? 'Paramètres' : page === 'org' ? 'Organigramme' : ''))}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button title="Recherche (Ctrl+K)" className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-line text-muted text-xs hover:bg-surface"
              onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}>
              <Search size={14} /> <span className="hidden sm:inline">{tr('common.search')}</span> <kbd className="hidden sm:inline text-[10px] border border-line rounded px-1">⌘K</kbd>
            </button>
            <LangPicker />
            <WhatsNew />
            <NotificationsBell />
            <button title="Organigramme" className={`p-2 rounded-xl hover:bg-surface ${page === 'org' ? 'text-brand' : 'text-muted'}`} onClick={() => setPage('org')}>
              <Network size={19} />
            </button>
            <button title="Paramètres" className={`p-2 rounded-xl hover:bg-surface ${page === 'settings' ? 'text-brand' : 'text-muted'}`} onClick={() => setPage('settings')}>
              <SettingsIcon size={19} />
            </button>
            <button title={tr('common.changeSpace')} className="p-2 rounded-xl hover:bg-surface text-muted hidden sm:inline-flex" onClick={() => store.setSession(s => ({ ...s, subEnvId: null }))}>
              <ArrowLeft size={19} />
            </button>
            <button title={tr('common.logout')} className="p-2 rounded-xl hover:bg-red-500/10 text-red-500" onClick={store.logout}>
              <LogOut size={19} />
            </button>
            <button title="Mon profil et statut" onClick={() => setProfileOpen(true)} className="relative ml-1 rounded-full hover:ring-2 hover:ring-brand/30 transition">
              {me.photo
                ? <img src={me.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-xs font-extrabold flex items-center justify-center">{me.pseudo?.slice(0, 2).toUpperCase()}</div>}
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-card ${PRESENCE_META[store.myPresence()]?.dot || 'bg-slate-400'}`} />
            </button>
          </div>
        </header>
        {profileOpen && <ProfileModal store={store} onClose={() => setProfileOpen(false)} />}
        {collabSub && <CollaboratorCard store={store} subId={collabSub} onClose={() => setCollabSub(null)} />}
        <main className="p-3 sm:p-5 pb-24 max-w-[1400px] mx-auto">
          {store.readOnly && page !== 'support' && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 flex items-center gap-2 fade-in">
              <Lock size={16} className="shrink-0" />
              <span className="flex-1">
                {env?.subState === 'cancelling'
                  ? 'Abonnement en cours de résiliation — accès en lecture seule. '
                  : 'Environnement bloqué — accès en lecture seule. '}
                Seule la rubrique Support reste accessible.
              </span>
              <button className="btn-primary !py-1 text-xs shrink-0" onClick={() => goto('support')}>Aller au Support</button>
            </div>
          )}
          {!booting && !store.readOnly && <OnboardingChecklist store={store} goto={goto} />}
          {booting ? <PageSkeleton /> : pageEl}
        </main>
      </div>
      {/* Barre de navigation basse (mobile) : accès rapide + bouton Menu vers la sidebar complète. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-line flex items-stretch justify-around h-14"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Accueil' },
          { id: 'rdv', icon: CalendarDays, label: 'RDV' },
          { id: 'leads', icon: KanbanSquare, label: 'Leads' },
          { id: 'mytasks', icon: CheckSquare, label: 'Tâches' },
        ].filter(i => groups.some(g => g.items.some(it => it.id === i.id))).map(i => (
          <button key={i.id} onClick={() => goto(i.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${page === i.id ? 'text-brand' : 'text-muted'}`}>
            <i.icon size={19} /> {i.label}
          </button>
        ))}
        <button onClick={() => setSidebarOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-muted">
          <Menu size={19} /> Menu
        </button>
      </nav>
      <CompanyModal />
      <GlobalSearch onNavigate={goto} />
      <Chatbot />
      <Toasts />
      <Confetti />
    </div>
  )
}

// Sélecteur de langue (drapeau) — interface FR / EN / ES
function LangPicker() {
  const store = useStore()
  const { lang } = useT()
  const [open, setOpen] = useState(false)
  const cur = LANGS.find(l => l.id === lang) || LANGS[0]
  return (
    <div className="relative">
      <button title="Langue / Language / Idioma" className="p-2 rounded-xl hover:bg-surface text-base leading-none" onClick={() => setOpen(o => !o)}>{cur.flag}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 card shadow-xl p-1 w-40 fade-in">
            {LANGS.map(l => (
              <button key={l.id} onClick={() => { store.setUiLang(l.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-surface ${l.id === lang ? 'text-brand font-bold' : ''}`}>
                <span className="text-base">{l.flag}</span> {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Cloche de notifications UNIFIÉE : @mentions, RDV du jour, no-shows à replanifier,
// SLA tickets qui approchent/dépassent, et événements stockés (ex. prime invalidée).
// Fil trié par récence. L'état « lu » des mentions/notifs est persisté dans la donnée ;
// celui des éléments dérivés (RDV/SLA…) dans localStorage (par appareil).
// Fiche profil + sélecteur de statut de présence (en ligne / hors ligne / ne pas déranger).
function ProfileModal({ store, onClose }) {
  const me = store.account
  const session = store.session
  const sub = store.db.subenvs.find(s => s.id === session.subEnvId)
  const env = store.db.environments.find(e => e.id === session.envId)
  const managerAcc = me.teamOf ? store.db.accounts.find(a => a.id === me.teamOf) : null
  const managerSub = managerAcc ? store.db.subenvs.find(s => s.ownerId === managerAcc.id && s.envId === session.envId) : null
  const managerName = managerSub ? `${managerSub.prenom} ${managerSub.nom}`.trim() : (managerAcc?.pseudo || null)
  const name = sub ? `${sub.prenom} ${sub.nom}`.trim() : me.pseudo
  const svc = (store.envServices(session.envId) || []).find(v => v.id === sub?.serviceId)
  const presence = store.myPresence()
  const rows = [
    ['Entreprise', env?.name || '—'],
    ['Poste', sub?.poste || '—'],
    ['Service', svc?.name || sub?.service || '—'],
    ['Manager direct', managerName || 'Aucun (responsable)'],
    ['Rôle', me.role],
  ]
  return (
    <Modal title="Mon profil" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            {sub?.photo || me.photo
              ? <img src={sub?.photo || me.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
              : <div className="w-16 h-16 rounded-full bg-brand/15 text-brand text-xl font-extrabold flex items-center justify-center">{(name || '?').slice(0, 2).toUpperCase()}</div>}
            <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ring-2 ring-card ${PRESENCE_META[presence]?.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-lg truncate">{name}</div>
            <div className={`text-xs font-semibold ${PRESENCE_META[presence]?.text}`}>{PRESENCE_META[presence]?.label}</div>
          </div>
        </div>

        <div className="rounded-xl border border-line divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted">{k}</span>
              <span className="font-semibold text-right truncate ml-3">{v}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="text-xs font-bold uppercase text-muted mb-1.5">Mon statut</div>
          <div className="space-y-1.5">
            {PRESENCE_ORDER.map(p => (
              <button key={p} onClick={() => store.setPresence(p)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left ${presence === p ? 'border-brand bg-brand/5 font-semibold' : 'border-line hover:bg-surface'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${PRESENCE_META[p].dot}`} />
                <span className="flex-1">{PRESENCE_META[p].label}</span>
                {p === 'dnd' && <span className="text-[11px] text-muted">coupe les notifications</span>}
                {presence === p && <Check size={15} className="text-brand" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// Fiche d'un collaborateur (depuis la recherche) : récap + démarrage d'une conversation directe.
function CollaboratorCard({ store, subId, onClose }) {
  const sub = store.db.subenvs.find(s => s.id === subId)
  if (!sub) return null
  const env = store.db.environments.find(e => e.id === sub.envId)
  const owner = store.db.accounts.find(a => a.id === sub.ownerId)
  const managerAcc = owner?.teamOf ? store.db.accounts.find(a => a.id === owner.teamOf) : null
  const managerSub = managerAcc ? store.db.subenvs.find(s => s.ownerId === managerAcc.id && s.envId === sub.envId) : null
  const managerName = managerSub ? `${managerSub.prenom} ${managerSub.nom}`.trim() : (managerAcc?.pseudo || null)
  const svc = (store.envServices(sub.envId) || []).find(v => v.id === sub.serviceId)
  const presence = store.presenceOf(owner?.id)
  const name = `${sub.prenom || ''} ${sub.nom || ''}`.trim() || 'Collaborateur'
  const isMe = sub.id === store.session?.subEnvId
  const rows = [
    ['Entreprise', env?.name || '—'],
    ['Poste', sub.poste || '—'],
    ['Service', svc?.name || sub.service || '—'],
    ['Manager direct', managerName || 'Aucun (responsable)'],
  ]
  const startConversation = () => {
    const id = store.openOrCreateDM(sub.id)
    onClose()
    if (!id) return
    window.__pendingChannel = id
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'conversations' }))
    window.dispatchEvent(new CustomEvent('demo-navigate', { detail: 'conversations' }))
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-conversation', { detail: id })), 80)
  }
  return (
    <Modal title="Profil du collaborateur" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            {sub.photo
              ? <img src={sub.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
              : <div className="w-16 h-16 rounded-full bg-brand/15 text-brand text-xl font-extrabold flex items-center justify-center">{(name).slice(0, 2).toUpperCase()}</div>}
            <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ring-2 ring-card ${PRESENCE_META[presence]?.dot}`} title={PRESENCE_META[presence]?.label} />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-lg truncate">{name}{isMe && <span className="text-xs text-muted font-normal"> (vous)</span>}</div>
            <div className={`text-xs font-semibold ${PRESENCE_META[presence]?.text}`}>{PRESENCE_META[presence]?.label}</div>
          </div>
        </div>
        <div className="rounded-xl border border-line divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted">{k}</span>
              <span className="font-semibold text-right truncate ml-3">{v}</span>
            </div>
          ))}
        </div>
        {!isMe && (
          <button className="btn-primary w-full justify-center" onClick={startConversation}>
            <MessagesSquare size={16} /> Démarrer une conversation
          </button>
        )}
      </div>
    </Modal>
  )
}

function NotificationsBell() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const sub = store.sub
  const me = store.account
  const isSupport = SUPPORT_ROLES.includes(me?.role)
  const today = todayISO()

  const SEEN_KEY = 'bdr_notif_seen_' + (me?.id || '')
  const [seen, setSeen] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []) } catch (e) { return new Set() } })
  const markSeen = (...ids) => setSeen(prev => {
    const n = new Set(prev); ids.forEach(i => n.add(i))
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...n])) } catch (e) {}
    return n
  })

  const nav = (page, company) => {
    setOpen(false)
    if (company) window.dispatchEvent(new CustomEvent('open-company', { detail: company }))
    else if (page) window.dispatchEvent(new CustomEvent('app-navigate', { detail: page }))
  }

  const items = []
  ;(sub?.mentions || []).forEach(m => items.push({
    id: 'mention-' + m.id, read: m.read, ts: m.ts,
    icon: <AtSign size={14} className="text-brand" />,
    title: `${m.from} vous a mentionné`, text: `${m.company} — ${m.text}`,
    onClick: () => { store.setSub(d => ({ ...d, mentions: d.mentions.map(x => x.id === m.id ? { ...x, read: true } : x) })); nav(null, m.company) },
  }))
  ;(sub?.notifs || []).forEach(n => items.push({
    id: 'notif-' + n.id, read: n.read, ts: n.ts,
    icon: <Coins size={14} className="text-amber-600" />,
    title: n.title || 'Notification', text: n.text || '',
    onClick: () => { store.setSub(d => ({ ...d, notifs: (d.notifs || []).map(x => x.id === n.id ? { ...x, read: true } : x) })); nav(n.page) },
  }))
  // Nouveaux messages de conversation (canaux non coupés) — silencieux en « Ne pas déranger ».
  if (store.myPresence() !== 'dnd') {
    const scopes = isSupport ? ['team', 'support'] : ['team']
    scopes.forEach(scope => (store.listChannels(scope) || []).forEach(ch => {
      if (store.isChannelMuted(ch.id)) return
      const last = me?.channelReads?.[ch.id]
      store.channelMessages(ch.id)
        .filter(m => !m.system && m.authorId !== me?.id && (!last || m.ts > last))
        .forEach(m => items.push({
          id: 'chan-' + m.id, read: false, ts: m.ts,
          icon: <MessagesSquare size={14} className="text-brand" />,
          title: `Nouveau message · ${ch.name}`, text: `${m.authorName} : ${m.text || '📷 image'}`,
          onClick: () => { store.markChannelRead(ch.id); nav(scope === 'support' ? 'supporthub' : 'conversations') },
        }))
    }))
  }
  ;(sub?.rdvs || []).filter(r => r.dateRdv === today).forEach(r => {
    const id = 'rdv-' + r.id + '-' + today
    items.push({ id, read: seen.has(id), ts: today + 'T07:00',
      icon: <CalendarClock size={14} className="text-sky-600" />,
      title: 'RDV aujourd’hui', text: r.entreprise || 'Rendez-vous',
      onClick: () => { markSeen(id); nav('rdv') } })
  })
  ;(sub?.rdvs || []).filter(r => r.opportunite === 'No Show R1').forEach(r => {
    const id = 'noshow-' + r.id
    items.push({ id, read: seen.has(id), ts: r.dateRdv || today,
      icon: <AlertTriangle size={14} className="text-orange-600" />,
      title: 'No-show à replanifier', text: r.entreprise || 'Rendez-vous',
      onClick: () => { markSeen(id); nav('tasks') } })
  })
  ;(store.db.tickets || []).filter(t => (isSupport ? true : t.userAccountId === me?.id) && t.status !== 'closed').forEach(t => {
    const s = slaInfo(t)
    const soon = !s.responded && !s.breached && s.ms > s.targetMs * 0.75
    const breached = !s.responded && s.breached
    if (!soon && !breached) return
    const id = 'sla-' + t.id
    items.push({ id, read: seen.has(id), ts: t.createdAt,
      icon: <Clock size={14} className={breached ? 'text-red-600' : 'text-amber-600'} />,
      title: breached ? 'SLA dépassé' : 'SLA bientôt dépassé', text: t.category || t.clientName || 'Ticket',
      onClick: () => { markSeen(id); nav(isSupport ? 'tickets' : 'support') } })
  })

  items.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  const unread = items.filter(i => !i.read).length

  const markAllRead = () => {
    store.setSub(d => ({ ...d, mentions: (d.mentions || []).map(x => ({ ...x, read: true })), notifs: (d.notifs || []).map(x => ({ ...x, read: true })) }))
    markSeen(...items.map(i => i.id))
  }

  return (
    <div className="relative">
      <button title="Notifications" className={`p-2 rounded-xl hover:bg-surface relative ${open ? 'text-brand' : 'text-muted'}`} onClick={() => setOpen(o => !o)}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-extrabold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 card shadow-xl w-80 p-2 fade-in">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-bold uppercase text-muted">Notifications</span>
              {items.length > 0 && <button className="text-[11px] text-brand underline" onClick={markAllRead}>Tout marquer lu</button>}
            </div>
            {items.length === 0 && <p className="text-xs text-muted text-center py-5">Aucune notification. Vous êtes à jour ✨</p>}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {items.slice(0, 30).map(i => (
                <button key={i.id} onClick={i.onClick} className={`w-full text-left p-2 rounded-lg hover:bg-surface flex gap-2 ${i.read ? 'opacity-55' : ''}`}>
                  <div className="mt-0.5 shrink-0">{i.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{i.title}</div>
                    <div className="text-xs text-muted line-clamp-2">{i.text}</div>
                    <div className="text-[10px] text-muted">{new Date(i.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Onboarding « Premiers pas » : checklist actionnable au premier lancement, skippable.
// Se masque quand tout est fait ou quand l'utilisateur clique « Passer » (mémorisé).
function OnboardingChecklist({ store, goto }) {
  const me = store.account
  const sub = store.sub
  const KEY = 'bdr_onboarding_skipped_' + (me?.id || '')
  const [skipped, setSkipped] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch (e) { return false } })
  if (skipped || !sub) return null
  const steps = [
    { done: (sub.rdvs || []).length > 0, label: 'Créer votre premier rendez-vous', page: 'rdv' },
    { done: (sub.contacts || []).length > 0, label: 'Ajouter un contact', page: 'contacts' },
    { done: (sub.rdvs || []).length > 0, label: 'Explorer votre pipeline de leads', page: 'leads' },
    { done: !!(sub.bareme && sub.bareme.length), label: 'Configurer votre barème de primes', page: 'primes' },
    { done: !!(sub.theme && sub.theme !== 'ocean-pro'), label: 'Personnaliser votre thème', page: 'settings' },
  ]
  const doneCount = steps.filter(s => s.done).length
  if (doneCount === steps.length) return null
  const skip = () => { try { localStorage.setItem(KEY, '1') } catch (e) {} setSkipped(true) }
  return (
    <div className="card p-4 mb-4 !border-brand/40 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold flex items-center gap-2"><Sparkles size={17} className="text-brand" /> Bienvenue ! Premiers pas</h3>
          <p className="text-xs text-muted">{doneCount}/{steps.length} — quelques étapes pour prendre en main votre espace.</p>
        </div>
        <button className="btn-ghost !py-1 text-xs shrink-0" onClick={skip}>Passer</button>
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">
        {steps.map((s, i) => (
          <button key={i} onClick={() => goto(s.page)}
            className={`flex items-center gap-2 p-2 rounded-lg text-sm text-left border transition ${s.done ? 'border-line bg-surface' : 'border-line hover:border-brand'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-brand text-white' : 'border-2 border-line'}`}>
              {s.done && <Check size={12} />}
            </span>
            <span className={s.done ? 'line-through text-muted' : 'font-semibold'}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// « Nouveautés » : lit app/changelog.json (auto-généré au déploiement depuis les
// commits) et affiche les dernières évolutions. Pastille tant qu'elles ne sont pas vues.
function WhatsNew() {
  const [entries, setEntries] = useState([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem('bdr_changelog_seen') || '' } catch (e) { return '' } })
  useEffect(() => {
    fetch('changelog.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (Array.isArray(d)) setEntries(d) })
      .catch(() => {})
  }, [])
  if (!entries.length) return null
  const latestKey = (entries[0]?.date || '') + '|' + (entries[0]?.text || '')
  const hasNew = latestKey && latestKey !== seen
  const markSeen = () => { setSeen(latestKey); try { localStorage.setItem('bdr_changelog_seen', latestKey) } catch (e) {} }
  return (
    <div className="relative">
      <button title="Nouveautés" className={`p-2 rounded-xl hover:bg-surface relative ${open ? 'text-brand' : 'text-muted'}`}
        onClick={() => { if (!open) markSeen(); setOpen(o => !o) }}>
        <Gift size={19} />
        {hasNew && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 card shadow-xl w-80 p-2 fade-in">
            <div className="px-2 py-1 text-xs font-bold uppercase text-muted flex items-center gap-1.5"><Gift size={13} /> Nouveautés</div>
            <div className="max-h-96 overflow-y-auto space-y-0.5">
              {entries.slice(0, 25).map((e, i) => (
                <div key={i} className="p-2 rounded-lg hover:bg-surface">
                  <div className="text-sm font-semibold first-letter:uppercase">{e.text}</div>
                  <div className="text-[10px] text-muted">{e.date}</div>
                </div>
              ))}
            </div>
          </div>
        </>
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
    // Affiche le prénom si un espace de ce compte existe, sinon le pseudo (micro 2)
    const ownSub = store.db.subenvs.find(s => s.ownerId === store.account.id)
    const displayName = ownSub?.prenom || store.account.pseudo
    return <Welcome name={displayName} onDone={() => store.setSession(s => ({ ...s, welcomed: true }))} />
  }
  if (!session.envId) return <EnvPicker />
  if (!session.subEnvId) return <SubEnvPicker />
  if (!store.sub) return <SubEnvPicker />
  return <MainApp />
}
