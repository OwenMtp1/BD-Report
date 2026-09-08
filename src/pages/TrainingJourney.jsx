import React, { useEffect, useRef, useState } from 'react'
import {
  X, MousePointerClick, ChevronLeft, ChevronRight, Play, Pause, Sparkles, GraduationCap,
} from 'lucide-react'
import { StoreProvider, useStore, trainingSession, isClientRole, STAFF_PERMISSION_IDS } from '../store.jsx'
import { I18nProvider } from '../i18n.jsx'
import App from '../App.jsx'

// ===========================================================================
//  FORMATION STAFF — la VRAIE application, montée dans un StoreProvider isolé
//  alimenté par l'environnement de formation (`dataset="training"`). On y incarne
//  un membre du support face à un portefeuille complet : demandes à qualifier,
//  tickets à tous les stades, clients satisfaits et à risque, projets à
//  paramétrer. Aucune donnée réelle n'est touchée, rien n'est enregistré.
// ===========================================================================

// Parcours guidé. `page` = onglet de l'application, `hub` = onglet interne de la
// console support, pour arriver exactement là où l'étape en parle.
const TOUR = [
  {
    perm: 'dashboard.view', page: 'supporthub', hub: 'dashboard', title: 'Le tableau de bord support',
    text: "Votre point d'entrée chaque matin : portefeuille, taux de churn, tickets ouverts et sans réponse, délais moyens. Les chiffres sont recalculés en permanence — ils ne mentent pas sur l'état réel du service.",
  },
  {
    perm: 'dashboard.view', page: 'supporthub', hub: 'dashboard', title: 'Clients à risque',
    text: "L'indicateur croise les notes sous 3/5, tous canaux confondus, avec les tickets ouverts et les délais dépassés. Cliquez sur « Détail » : vous verrez les faits retenus, pas un score opaque. Prisma Group cumule deux notes basses et trois tickets — c'est là qu'il faut agir.",
  },
  {
    perm: 'requests.view', page: 'supporthub', hub: 'requests', title: 'Les demandes entrantes',
    text: "Les messages laissés depuis le site arrivent ici. Trois attendent : une demande de démonstration, une question tarifaire, une question d'hébergement des données. Qualifiez-les avant qu'elles ne refroidissent.",
  },
  {
    perm: 'tickets.view', page: 'supporthub', hub: 'tickets', title: 'Prendre un ticket en charge',
    text: "Ouvrez le ticket urgent de Vallon Industries : personne ne s'en est saisi. Vous avez le choix entre revenir en arrière et le prendre en charge. Une fois pris, votre nom s'affiche — mais tout le support peut continuer à répondre.",
  },
  {
    perm: 'tickets.view', page: 'supporthub', hub: 'tickets', title: 'Lire le SLA et la priorité',
    text: "Chaque ticket affiche son délai de première réponse et signale un dépassement. La priorité n'est pas décorative : elle fixe ce délai. Un ticket « urgente » sans réponse depuis trois heures est déjà hors délai.",
  },
  {
    perm: 'clients.view', page: 'supporthub', hub: 'clients', title: 'Le portefeuille client',
    text: "Le kanban range les entreprises par situation, jusqu'aux « clients non aboutis ». Ouvrez une fiche : vous y trouvez ses tickets, les notes de l'équipe et les motifs de clôture de ses projets.",
  },
  {
    perm: 'projects.view', page: 'supporthub', hub: 'projects', title: 'Les projets à paramétrer',
    text: "Vallon et Hexatel sont signés mais rien n'est en place. Le planning montre les phases ; le bouton « Utilisateurs » gère les accès, et l'icône d'organigramme ouvre l'organisation du client.",
  },
  {
    perm: 'projects.manage', page: 'supporthub', hub: 'projects', title: "Rôles et accès d'un client",
    text: "Depuis l'organigramme d'un projet, « Rôles et accès » décide de ce que voit chaque rôle de l'entreprise et de ce qu'il peut faire. Rien ne s'applique avant que vous n'enregistriez : ces cases changent le quotidien de vraies personnes.",
  },
  {
    perm: 'kb.manage', page: 'supporthub', hub: 'kb', title: 'La base de connaissances',
    text: "Avant de rédiger une réponse, cherchez ici : quarante-cinq articles rangés par catégorie. Répondre par un lien à jour vaut mieux qu'un texte réécrit à chaque fois — et fait baisser le nombre de tickets.",
  },
  {
    perm: 'permissions.manage', page: 'supporthub', hub: 'permissions', title: 'Les droits du staff',
    text: "La matrice croise droits et rôles. Une case par catégorie accorde tout un bloc. Rien ne s'applique au clic : une barre récapitule ce que vous avez changé et demande confirmation.",
  },
  {
    perm: 'services.manage', page: 'supporthub', hub: 'orgchart', title: "L'organigramme de l'équipe",
    text: "Glissez une personne sur une autre pour la rattacher, gérez les services. Les droits ne se règlent pas ici : ils restent dans « Permissions staff », pour qu'il n'existe qu'un seul endroit où un accès se donne ou se retire.",
  },
  {
    perm: 'logs.view', page: 'supporthub', hub: 'logs', title: 'Le journal des actions',
    text: "Toute action sensible est tracée : prise en charge, clôture, changement de droits, effacement de données. C'est ce qui permet de répondre à « qui a fait quoi » sans supposition.",
  },
  {
    page: 'support', title: "Ce que voit le client",
    text: "Enfin, la même application côté client : son onglet Support, ses tickets, la base de connaissances. Savoir ce qu'il a sous les yeux évite de lui décrire un écran qui n'existe pas chez lui.",
  },
]

// Monté À L'INTÉRIEUR du provider : applique la navigation demandée par le parcours.
function TrainingController({ navSeq }) {
  const store = useStore()
  useEffect(() => { store.setSession(trainingSession()) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!navSeq?.page) return
    const t1 = setTimeout(() => window.dispatchEvent(new CustomEvent('demo-navigate', { detail: navSeq.page })), 60)
    // L'onglet interne ne peut être visé qu'une fois la console montée.
    const t2 = navSeq.hub ? setTimeout(() => window.dispatchEvent(new CustomEvent('hub-tab', { detail: navSeq.hub })), 320) : null
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2) }
  }, [navSeq])
  return null
}

export default function TrainingJourney({ onClose }) {
  // Store RÉEL : il donne les rôles tels qu'ils sont configurés en production, pour que
  // la formation reflète les droits en vigueur et non des valeurs figées.
  const real = useStore()
  const [roleKey, setRoleKey] = useState('')
  const [touring, setTouring] = useState(false)
  const [tourIdx, setTourIdx] = useState(0)
  const [autoplay, setAutoplay] = useState(false)
  const [navSeq, setNavSeq] = useState(null)
  const seq = useRef(0)

  const roles = (real.staffRoles ? real.staffRoles() : [])
    .filter(r => !isClientRole(r.roleKey || r.name))
    .slice().sort((a, b) => b.rank - a.rank)
  const chosen = roles.find(r => (r.roleKey || r.name) === roleKey)
  const chosenPerms = !chosen ? []
    : (chosen.roleKey || chosen.name) === 'Fondateur' ? STAFF_PERMISSION_IDS : (chosen.permissions || [])
  // Le parcours ne montre que ce que la casquette choisie peut réellement ouvrir :
  // guider vers un écran interdit apprendrait l'inverse de ce qu'il faut savoir.
  const tour = TOUR.filter(st => !st.perm || chosenPerms.includes(st.perm))
  const step = touring ? tour[tourIdx] : null

  useEffect(() => {
    if (!step) return
    seq.current += 1
    setNavSeq({ n: seq.current, page: step.page, hub: step.hub })
  }, [tourIdx, touring]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!touring || !autoplay) return
    const t = setTimeout(() => {
      if (tourIdx < tour.length - 1) setTourIdx(i => i + 1)
      else setAutoplay(false)
    }, 9000)
    return () => clearTimeout(t)
  }, [touring, autoplay, tourIdx, tour.length])

  const startTour = () => { setTourIdx(0); setTouring(true) }
  const stopTour = () => { setTouring(false); setAutoplay(false) }

  // --- Choix de la casquette, avant de monter quoi que ce soit
  if (!roleKey) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 gap-7 overflow-auto"
        style={{ background: 'linear-gradient(135deg,#0f2b23,#14513f 55%,#0e7490)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5">
          <X size={14} /> Quitter
        </button>
        <div className="text-center text-white max-w-2xl">
          <span className="chip" style={{ background: 'rgba(52,211,153,.15)', color: '#34d399' }}>
            <GraduationCap size={12} /> Formation staff
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-3">Quelle casquette voulez-vous prendre ?</h2>
          <p className="text-white/70 text-sm mt-2">
            L'espace se règle sur les droits réellement accordés à ce rôle : vous verrez exactement les écrans
            auxquels il a accès, et le parcours guidé s'y adapte.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
          {roles.map(r => {
            const key = r.roleKey || r.name
            const count = key === 'Fondateur' ? STAFF_PERMISSION_IDS.length : (r.permissions || []).length
            const steps = TOUR.filter(st => !st.perm || (key === 'Fondateur' ? true : (r.permissions || []).includes(st.perm))).length
            return (
              <button key={r.id} onClick={() => setRoleKey(key)}
                className="w-56 text-left rounded-2xl p-4 transition hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }}>
                <div className="font-extrabold text-white">{r.name}</div>
                <div className="text-white/60 text-xs mt-1">{count} droit{count > 1 ? 's' : ''} · {steps} étape{steps > 1 ? 's' : ''} de formation</div>
                {r.suspended && <div className="text-amber-300 text-[11px] mt-1">rôle suspendu — droits retirés</div>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col" style={{ isolation: 'isolate' }}>
      <div className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-12 text-white" style={{ background: 'linear-gradient(90deg,#0f2b23,#14513f)' }}>
        <span className="inline-flex items-center gap-1.5 font-bold text-sm">
          <GraduationCap size={15} /> Formation staff
        </span>
        <span className="chip !text-[11px]" style={{ background: 'rgba(52,211,153,.18)', color: '#34d399' }}>{chosen?.name || roleKey}</span>
        <span className="hidden sm:inline text-white/50 text-xs">environnement isolé — rien n'est enregistré</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { stopTour(); setRoleKey('') }} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20">
            Changer de rôle
          </button>
          {touring
            ? <button onClick={stopTour} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 flex items-center gap-1.5"><X size={13} /> Arrêter</button>
            : <button onClick={startTour} disabled={!tour.length} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#34d399,#0ea5e9)' }}><MousePointerClick size={13} /> Formation guidée</button>}
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1.5"><X size={14} /> Quitter</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-auto bg-app">
        <StoreProvider demo dataset="training" datasetRole={roleKey} datasetRoles={roles}>
          <I18nProvider>
            <TrainingController navSeq={navSeq} />
            <App />
          </I18nProvider>
        </StoreProvider>

        {touring && step && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[210] w-[min(600px,92vw)]">
            <div className="rounded-2xl shadow-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#0f2b23,#14513f)', border: '1px solid rgba(52,211,153,.4)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="chip" style={{ background: 'rgba(52,211,153,.18)', color: '#34d399' }}>
                  <GraduationCap size={12} /> {chosen?.name || roleKey}
                </span>
                <span className="text-white/50 text-xs">Étape {tourIdx + 1} / {tour.length}</span>
                <button onClick={() => setAutoplay(a => !a)} className="ml-auto p-1.5 rounded-lg bg-white/10 hover:bg-white/20" title={autoplay ? 'Pause' : 'Lecture auto'}>
                  {autoplay ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
              <div className="font-extrabold text-lg leading-tight">{step.title}</div>
              <p className="text-white/70 text-sm mt-1">{step.text}</p>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${((tourIdx + 1) / tour.length) * 100}%`, background: 'linear-gradient(90deg,#34d399,#0ea5e9)' }} />
                </div>
                <button onClick={() => setTourIdx(i => Math.max(0, i - 1))} disabled={tourIdx === 0}
                  className="px-2.5 py-1.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center gap-1"><ChevronLeft size={15} /></button>
                {tourIdx < tour.length - 1
                  ? <button onClick={() => setTourIdx(i => i + 1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1" style={{ background: 'linear-gradient(135deg,#34d399,#0ea5e9)' }}>Suivant <ChevronRight size={15} /></button>
                  : <button onClick={stopTour} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 flex items-center gap-1">Terminer <Sparkles size={14} /></button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
