import React, { useState } from 'react'
import { Shield } from 'lucide-react'
import { useStore, allowedBricks } from '../store.jsx'
import { MANAGER_TABS } from '../nav.jsx'
import Admin from './Admin.jsx'
import OrgChart from './OrgChart.jsx'
import Kpi from './Kpi.jsx'
import TeamLead from './TeamLead.jsx'
import Hubspot from './Hubspot.jsx'
import Ecosystem from './Ecosystem.jsx'
import { Empty } from '../ui.jsx'

// Console « Gestion Manager » : regroupe en un seul écran tout ce qu'un manager est seul
// à voir, jusqu'ici éparpillé dans la barre latérale. Les onglets restent déclarés dans
// nav.jsx (donc toujours accordables par une offre) — cette page ne fait que les réunir.
//
// L'onglet « Utilisateurs » rend Admin en périmètre d'équipe : la vue globale (tous les
// comptes, tous les environnements) appartient au back-office éditeur et vit désormais
// dans la Console Support, sans quoi un administrateur client verrait les comptes des
// autres entreprises clientes.
const RENDERERS = {
  admin: () => <Admin mode="teams" />,
  teams: () => <Admin mode="teams" />,
  orgchart: () => <OrgChart />,
  kpi: () => <Kpi />,
  teamlead: () => <TeamLead />,
  hubspot: () => <Hubspot />,
  ecosystem: () => <Ecosystem />,
}
// Ordre d'affichage : la gestion des personnes d'abord, le pilotage ensuite, l'outillage après.
const ORDER = ['admin', 'teams', 'orgchart', 'ecosystem', 'teamlead', 'kpi', 'hubspot']

export default function ManagerHub() {
  const store = useStore()
  const me = store.account
  const bricks = allowedBricks(me, store.db.offers)
  const byPerm = store.hasPerm('manager.view')

  // Un rôle d'environnement décide seul de ce que voit son titulaire : ses onglets
  // priment sur le filtre par nom de rôle, sans quoi un rôle créé sur mesure ne pourrait
  // jamais ouvrir un onglet que celui-ci réserve aux managers.
  const envRole = store.myEnvRole ? store.myEnvRole() : null
  const visible = MANAGER_TABS
    .filter(t => RENDERERS[t.id])
    .filter(t => envRole || !t.roles || t.roles.includes(me?.role) || byPerm)
    .filter(t => !envRole || !t.brick || (envRole.tabs || []).includes(t.brick))
    .filter(t => !t.brick || bricks.includes(t.brick) || byPerm)
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))

  // « Utilisateurs » et « Mon équipe » ouvrent le même écran selon le rôle : on n'en garde
  // qu'un seul onglet, sous un libellé commun.
  const tabs = []
  visible.forEach(t => {
    if ((t.id === 'admin' || t.id === 'teams') && tabs.some(x => x.id === 'admin' || x.id === 'teams')) return
    tabs.push(t.id === 'teams' ? { ...t, label: 'Utilisateurs' } : t)
  })

  const [tab, setTab] = useState(tabs[0]?.id)
  const current = tabs.find(t => t.id === tab) || tabs[0]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <Shield size={20} className="text-brand" /> Gestion Manager
        </h2>
        <p className="text-xs text-muted -mt-0.5">
          Votre équipe, son organisation et son pilotage, réunis au même endroit.
        </p>
      </div>

      {tabs.length === 0 ? (
        <Empty text="Aucun outil de gestion n'est inclus dans votre offre pour le moment." />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-line">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px ${current?.id === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-surface'}`}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
          <div>{RENDERERS[current.id]()}</div>
        </>
      )}
    </div>
  )
}
