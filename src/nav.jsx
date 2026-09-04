// ---------------------------------------------------------------------------
//  Source de vérité unique des onglets de l'application.
//  Chaque page « accordable » porte un `brick` (= son unité d'accès dans les offres).
//  → L'éditeur d'offres (OffersAdmin) liste automatiquement TOUS ces onglets, et tout
//    nouvel onglet ajouté ici apparaît instantanément dans le choix des offres.
//  Ce module n'importe QUE lucide (pas de cycle avec store.jsx).
// ---------------------------------------------------------------------------
import {
  LayoutDashboard, Table2, Target, Trophy, Gauge, CalendarDays, KanbanSquare, ListChecks,
  CheckSquare, Coins, MessagesSquare, BookUser, ShieldCheck, StickyNote, ScrollText, Trash2,
  LifeBuoy, Gift, Shield, Users,
} from 'lucide-react'

const SUPPORT_ROLES = ['Fondateur', 'Support BD Report']
const MANAGER_ROLES = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report']

export const NAV_GROUPS = [
  {
    id: 'pilotage', label: 'Pilotage', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, brick: 'Dashboard' },
      { id: 'kpi', label: 'KPI Entreprise', icon: Table2, brick: 'KPI Entreprise', roles: MANAGER_ROLES },
      { id: 'icp', label: 'ICP', icon: Target, brick: 'ICP' },
      { id: 'classement', label: 'Classement', icon: Trophy, brick: 'Classement' },
      { id: 'teamlead', label: 'Pilotage équipe', icon: Gauge, brick: 'Pilotage équipe', roles: MANAGER_ROLES },
    ],
  },
  {
    id: 'activite', label: 'Activité commerciale', items: [
      { id: 'rdv', label: 'Mes Rendez-vous', icon: CalendarDays, brick: 'Mes Rendez-vous' },
      { id: 'leads', label: 'Leads', icon: KanbanSquare, brick: 'Leads' },
      { id: 'tasks', label: 'Recommandations prioritaires', icon: ListChecks, brick: 'Recommandations prioritaires' },
      { id: 'mytasks', label: 'Mes tâches', icon: CheckSquare, brick: 'Mes tâches' },
      { id: 'primes', label: 'Primes & Commissions', icon: Coins, brick: 'Primes & Commissions' },
      { id: 'simulateur', label: 'Simulateur de primes', icon: Gauge, brick: 'Simulateur de primes' },
    ],
  },
  {
    id: 'echanges', label: 'Échanges', items: [
      { id: 'conversations', label: 'Conversations', icon: MessagesSquare, brick: 'Conversations' },
    ],
  },
  {
    id: 'donnees', label: 'Mes données', items: [
      { id: 'contacts', label: 'Mes contacts', icon: BookUser, brick: 'Mes contacts' },
      { id: 'dataquality', label: 'Qualité des données', icon: ShieldCheck, brick: 'Qualité des données' },
      { id: 'notes', label: 'Mes notes', icon: StickyNote, brick: 'Mes notes' },
      { id: 'logs', label: 'Logs', icon: ScrollText, brick: 'Logs' },
      { id: 'corbeille', label: 'Corbeille', icon: Trash2, brick: 'Corbeille' },
      { id: 'support', label: 'Support', icon: LifeBuoy, always: true },
      { id: 'souscrire', label: 'Souscrire à une offre', icon: Gift, always: true },
    ],
  },
  {
    id: 'administration', label: 'Administration', items: [
      { id: 'admin', label: 'Gestion Administration', icon: Shield, brick: 'Gestion Administration', roles: ['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur'] },
      { id: 'teams', label: 'Gérez mes équipes', icon: Users, brick: 'Gérez mes équipes', roles: ['Manager'] },
    ],
  },
  {
    id: 'supportbdr', label: 'Support Client BD Report', items: [
      { id: 'supporthub', label: 'Équipe support', icon: LifeBuoy, roles: SUPPORT_ROLES, staffOnly: true },
    ],
  },
]

export const NAV = NAV_GROUPS.flatMap(g => g.items)

// Onglets accordables via une offre (tous ceux qui portent un `brick`).
export const GRANTABLE_TABS = NAV.filter(i => i.brick).map(i => {
  const g = NAV_GROUPS.find(gr => gr.items.includes(i))
  return { id: i.id, label: i.label, brick: i.brick, group: g.label }
})
// Ensemble des unités d'accès (bricks) — l'éditeur d'offres et la page Souscrire s'appuient dessus.
export const ALL_BRICKS = [...new Set(GRANTABLE_TABS.map(t => t.brick))]
// Bricks historiques (avant l'ajout des nouveaux onglets) — sert à la migration douce des comptes existants.
export const LEGACY_BRICKS = ['Dashboard', 'Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches', 'Mes contacts', 'Mes notes', 'Primes & Commissions', 'KPI Entreprise', 'ICP', 'Logs']
