import React, { useEffect, useRef, useState } from 'react'
import {
  X, Play, Pause, ChevronLeft, ChevronRight, Sparkles, Lock, Mail, Building2, User,
  UserCog, MousePointerClick, ShieldCheck, ArrowRight,
} from 'lucide-react'
import { StoreProvider, useStore, demoSession } from '../store.jsx'
import { I18nProvider } from '../i18n.jsx'
import App from '../App.jsx'

// ===========================================================================
//  DÉMO COMMERCIALE — la VRAIE application, montée dans un StoreProvider isolé
//  (prop `demo` : aucune persistance, aucun cloud, aucune session enregistrée).
//  Parcours d'achat : écran de création de compte → interface réelle avec toutes
//  ses options et beaucoup de données, bascule Employé ⇄ Manager, et une visite
//  guidée qui parcourt chaque brique de chaque onglet, pour les deux casquettes.
//  100 % isolé : aucun compte réel n'est touché.
// ===========================================================================

// Étapes de la visite guidée. `role` bascule la casquette, `page` = id d'onglet réel.
const TOUR = [
  { role: 'employe', page: 'dashboard', title: 'Tableau de bord', text: 'La vue employé : activité du mois, entonnoir de conversion, prochains rendez‑vous et recommandations — tout en un coup d’œil.' },
  { role: 'employe', page: 'rdv', title: 'Mes rendez‑vous', text: 'Cartes, tableau ou calendrier. On crée, qualifie et fait avancer chaque RDV dans le pipeline (R1 → SQL → Signée), avec export agenda.' },
  { role: 'employe', page: 'leads', title: 'Leads', text: 'Le kanban des opportunités : glisser‑déposer entre les phases, et une vue pipeline entreprise partagée par l’équipe.' },
  { role: 'employe', page: 'primes', title: 'Primes & commissions', text: 'Le barème calcule automatiquement la prime de chaque SQL/signature, figée au passage en SQL. Le commercial voit exactement ce qu’il gagne.' },
  { role: 'employe', page: 'contacts', title: 'Mes contacts', text: 'Le carnet d’adresses alimenté automatiquement depuis les rendez‑vous : entreprises, interlocuteurs, coordonnées.' },
  { role: 'employe', page: 'notes', title: 'Mes notes', text: 'Prise de notes libre, dictée vocale, et création d’un RDV directement depuis une note.' },
  { role: 'employe', page: 'icp', title: 'ICP', text: 'Le profil client idéal : quels secteurs et tailles d’entreprise convertissent le mieux, pour cibler juste.' },
  { role: 'employe', page: 'support', title: 'Support client', text: 'L’employé ouvre un ticket au support BD Report et suit ses échanges sans quitter l’app.' },
  { role: 'manager', page: 'dashboard', title: 'Casquette Manager', text: 'On bascule en manager : même app, mais l’accès s’ouvre sur le pilotage d’équipe.' },
  { role: 'manager', page: 'kpi', title: 'KPI Entreprise', text: 'La vue consolidée de toute l’équipe : volumes, taux de conversion, primes — filtrable par période et par commercial.' },
  { role: 'manager', page: 'teamlead', title: 'Pilotage équipe', text: 'Le tableau de bord du Team Lead : performance individuelle, objectifs, et validation des primes (le manager peut invalider une prime).' },
  { role: 'manager', page: 'leads', title: 'Pipeline entreprise', text: 'Le manager voit le pipeline agrégé de tous les commerciaux et commente les comptes stratégiques.' },
  { role: 'manager', page: 'teams', title: 'Gérez mes équipes', text: 'Composition de l’équipe, invitations, accès — le manager administre son périmètre.' },
]

// Contrôleur monté À L’INTÉRIEUR du provider de démo : applique la casquette et
// la navigation demandées par la barre de contrôle (au‑dessus, hors provider).
function DemoController({ role, navSeq }) {
  const store = useStore()
  const curRole = useRef(role)
  useEffect(() => {
    if (curRole.current !== role) {
      curRole.current = role
      store.setSession(demoSession(role))
    }
  }, [role, store])
  // navSeq change à chaque étape de visite → navigue vers la page ciblée.
  useEffect(() => {
    if (navSeq && navSeq.page) {
      // laisse le temps à un éventuel changement de casquette de s’appliquer
      const t = setTimeout(() => window.dispatchEvent(new CustomEvent('app-navigate', { detail: navSeq.page })), navSeq.role !== curRole.current ? 260 : 40)
      return () => clearTimeout(t)
    }
  }, [navSeq])
  return null
}

// Écran de création de compte (parcours d’achat). Purement visuel : rien n’est enregistré.
function Signup({ onDone }) {
  const [pw, setPw] = useState('')
  const [email, setEmail] = useState('camille.rivet@peoplespheres.io')
  const [name, setName] = useState('Camille Rivet')
  const [busy, setBusy] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true)
    setTimeout(onDone, 850) // petite animation « création de l’espace »
  }
  return (
    <div className="min-h-full flex items-center justify-center p-6" style={{ background: 'radial-gradient(1200px 600px at 20% -10%, #1e2a52, #0b1020 60%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-white font-extrabold text-lg"><span className="grid place-items-center w-9 h-9 rounded-xl" style={{ background: 'linear-gradient(135deg,#5EDCFF,#3b82f6)' }}>BD</span> BD Report</div>
          <p className="text-white/50 text-sm mt-2">Créez votre espace commercial en 30 secondes</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl p-6 space-y-3" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
          <Labeled icon={User} label="Votre nom">
            <input value={name} onChange={e => setName(e.target.value)} className="demo-inp" />
          </Labeled>
          <Labeled icon={Mail} label="Email professionnel">
            <input value={email} onChange={e => setEmail(e.target.value)} className="demo-inp" />
          </Labeled>
          <Labeled icon={Building2} label="Entreprise">
            <input defaultValue="PeopleSpheres" className="demo-inp" />
          </Labeled>
          <Labeled icon={Lock} label="Mot de passe">
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Choisissez un mot de passe" className="demo-inp" autoFocus />
          </Labeled>
          <button disabled={busy} className="w-full rounded-xl py-2.5 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-70" style={{ background: 'linear-gradient(135deg,#3b82f6,#5EDCFF)' }}>
            {busy ? <>Création de votre espace…</> : <>Créer mon espace <ArrowRight size={16} /></>}
          </button>
          <p className="text-[11px] text-white/40 flex items-center gap-1.5 justify-center pt-1"><ShieldCheck size={12} /> Démonstration isolée — aucune donnée réelle, rien n’est enregistré.</p>
        </form>
      </div>
      <style>{`.demo-inp{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:.6rem;padding:.5rem .7rem;color:#fff;font-size:.9rem;outline:none}.demo-inp::placeholder{color:rgba(255,255,255,.35)}.demo-inp:focus{border-color:#5EDCFF}`}</style>
    </div>
  )
}
function Labeled({ icon: Ic, label, children }) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-white/70 flex items-center gap-1.5 mb-1"><Ic size={13} /> {label}</span>
      {children}
    </label>
  )
}

export default function DemoJourney({ onClose }) {
  const [phase, setPhase] = useState('signup') // 'signup' | 'app'
  const [role, setRole] = useState('employe')
  const [tourIdx, setTourIdx] = useState(-1) // -1 = visite inactive
  const [autoplay, setAutoplay] = useState(false)
  const [navSeq, setNavSeq] = useState(null)

  const touring = tourIdx >= 0
  const step = touring ? TOUR[tourIdx] : null

  // Applique la casquette + navigation de l’étape courante.
  useEffect(() => {
    if (!touring) return
    setRole(step.role)
    setNavSeq({ page: step.page, role: step.role, n: tourIdx })
  }, [tourIdx]) // eslint-disable-line

  // Lecture automatique de la visite.
  useEffect(() => {
    if (!touring || !autoplay) return
    const t = setTimeout(() => {
      if (tourIdx < TOUR.length - 1) setTourIdx(i => i + 1)
      else { setAutoplay(false); setTourIdx(-1) }
    }, 5200)
    return () => clearTimeout(t)
  }, [tourIdx, autoplay, touring])

  const startTour = () => { setTourIdx(0); setAutoplay(true) }
  const stopTour = () => { setTourIdx(-1); setAutoplay(false) }

  const switchRole = (r) => { if (touring) stopTour(); setRole(r); setNavSeq({ page: 'dashboard', role: r, n: Date.now() }) }

  const close = () => {
    // Ramène l’app RÉELLE (derrière l’overlay) sur la console support.
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'supporthub' }))
    onClose && onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col" style={{ isolation: 'isolate' }}>
      {/* Barre de contrôle de la démo (hors app) */}
      <div className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-12 text-white" style={{ background: 'linear-gradient(90deg,#0f1730,#1e2a52)' }}>
        <span className="inline-flex items-center gap-1.5 font-bold text-sm"><span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> Démo commerciale</span>
        <span className="hidden sm:inline text-white/40 text-xs">·</span>
        <span className="hidden sm:inline text-white/50 text-xs">environnement isolé</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Bascule casquette */}
          <div className="flex rounded-lg overflow-hidden text-xs font-semibold" style={{ border: '1px solid rgba(255,255,255,.18)' }}>
            <button onClick={() => switchRole('employe')} className={`px-3 py-1.5 flex items-center gap-1.5 ${role === 'employe' ? 'bg-white/90 text-slate-900' : 'text-white/70 hover:bg-white/10'}`}><User size={13} /> Employé</button>
            <button onClick={() => switchRole('manager')} className={`px-3 py-1.5 flex items-center gap-1.5 ${role === 'manager' ? 'bg-white/90 text-slate-900' : 'text-white/70 hover:bg-white/10'}`}><UserCog size={13} /> Manager</button>
          </div>
          {phase === 'app' && (
            touring
              ? <button onClick={stopTour} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 flex items-center gap-1.5"><X size={13} /> Arrêter la visite</button>
              : <button onClick={startTour} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg,#5EDCFF,#3b82f6)' }}><MousePointerClick size={13} /> Visite guidée</button>
          )}
          <button onClick={close} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1.5"><X size={14} /> Quitter</button>
        </div>
      </div>

      {/* Scène : soit la création de compte, soit la VRAIE app isolée */}
      <div className="flex-1 min-h-0 relative overflow-auto bg-app">
        {phase === 'signup'
          ? <Signup onDone={() => setPhase('app')} />
          : (
            <StoreProvider demo>
              <I18nProvider>
                <DemoController role={role} navSeq={navSeq} />
                <App />
              </I18nProvider>
            </StoreProvider>
          )}

        {/* Carte de visite guidée */}
        {phase === 'app' && touring && step && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[210] w-[min(560px,92vw)]">
            <div className="rounded-2xl shadow-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#12203f,#1e2a52)', border: '1px solid rgba(94,220,255,.35)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="chip" style={{ background: 'rgba(94,220,255,.18)', color: '#5EDCFF' }}>
                  {step.role === 'manager' ? <><UserCog size={12} /> Manager</> : <><User size={12} /> Employé</>}
                </span>
                <span className="text-white/50 text-xs">Étape {tourIdx + 1} / {TOUR.length}</span>
                <button onClick={() => setAutoplay(a => !a)} className="ml-auto p-1.5 rounded-lg bg-white/10 hover:bg-white/20" title={autoplay ? 'Pause' : 'Lecture auto'}>
                  {autoplay ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
              <div className="font-extrabold text-lg leading-tight">{step.title}</div>
              <p className="text-white/70 text-sm mt-1">{step.text}</p>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${((tourIdx + 1) / TOUR.length) * 100}%`, background: 'linear-gradient(90deg,#5EDCFF,#3b82f6)' }} />
                </div>
                <button onClick={() => setTourIdx(i => Math.max(0, i - 1))} disabled={tourIdx === 0} className="px-2.5 py-1.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center gap-1"><ChevronLeft size={15} /></button>
                {tourIdx < TOUR.length - 1
                  ? <button onClick={() => setTourIdx(i => i + 1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1" style={{ background: 'linear-gradient(135deg,#5EDCFF,#3b82f6)' }}>Suivant <ChevronRight size={15} /></button>
                  : <button onClick={stopTour} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 flex items-center gap-1">Terminer <Sparkles size={14} /></button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
