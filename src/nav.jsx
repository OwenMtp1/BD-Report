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
  LifeBuoy, Gift, Shield, Users, Link2, Network, Workflow, ArrowRightLeft, Handshake,
} from 'lucide-react'

const SUPPORT_ROLES = ['Fondateur', 'Support BD Report']
const MANAGER_ROLES = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report']

export const NAV_GROUPS = [
  {
    id: 'pilotage', label: 'Pilotage', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, brick: 'Dashboard' },
      { id: 'icp', label: 'ICP', icon: Target, brick: 'ICP' },
      { id: 'teamlead', label: 'Pilotage équipe', icon: Gauge, brick: 'Pilotage équipe', roles: MANAGER_ROLES, inManagerHub: true },
    ],
  },
  {
    id: 'activite', label: 'Activité commerciale', items: [
      { id: 'rdv', label: 'Mes Rendez-vous', icon: CalendarDays, brick: 'Mes Rendez-vous' },
      { id: 'leads', label: 'Leads', icon: KanbanSquare, brick: 'Leads' },
      { id: 'tasks', label: 'Recommandations prioritaires', icon: ListChecks, brick: 'Recommandations prioritaires' },
      { id: 'mytasks', label: 'Mes tâches', icon: CheckSquare, brick: 'Mes tâches' },
      // `module` : onglet livré à la carte. Le staff coche ou décoche le module à la création
      // de l'environnement ; l'onglet disparaît alors de la navigation pour toute l'entreprise.
      { id: 'handoff', label: 'Passation au closer', icon: ArrowRightLeft, brick: 'Passation au closer', module: 'handoff' },
      { id: 'closing', label: 'Closing', icon: Handshake, brick: 'Closing', module: 'closing' },
      { id: 'primes', label: 'Primes & Commissions', icon: Coins, brick: 'Primes & Commissions' },
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
      { id: 'notes', label: 'Mes notes', icon: StickyNote, brick: 'Mes notes' },
      { id: 'logs', label: 'Logs', icon: ScrollText, brick: 'Logs' },
      { id: 'corbeille', label: 'Corbeille', icon: Trash2, brick: 'Corbeille' },
      { id: 'support', label: 'Support', icon: LifeBuoy, always: true },
      { id: 'souscrire', label: 'Souscrire à une offre', icon: Gift, always: true },
    ],
  },
  {
    id: 'administration', label: 'Administration', items: [
      // Entrée unique : la console « Gestion Manager » regroupe tout ce qu'un manager est
      // seul à voir. Les onglets ci-dessous restent déclarés (donc toujours accordables via
      // une offre) mais sont marqués `inManagerHub` : ils deviennent des onglets de la
      // console au lieu d'entrées de la barre latérale.
      { id: 'manager', label: 'Gestion Manager', icon: Shield, brick: 'Gestion Manager', roles: MANAGER_ROLES, perm: 'manager.view' },
      { id: 'admin', label: 'Utilisateurs', icon: Shield, brick: 'Gestion Administration', roles: ['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur'], inManagerHub: true },
      { id: 'teams', label: 'Mon équipe', icon: Users, brick: 'Gérez mes équipes', roles: ['Manager'], inManagerHub: true },
      { id: 'orgchart', label: 'Organigramme', icon: Network, brick: 'Organigramme', roles: MANAGER_ROLES, inManagerHub: true },
      { id: 'ecosystem', label: 'Créer votre écosystème', icon: Workflow, brick: 'Écosystème', roles: MANAGER_ROLES, inManagerHub: true },
      { id: 'quotas', label: 'Objectifs & quotas', icon: Target, brick: 'Objectifs & quotas', roles: MANAGER_ROLES, inManagerHub: true, module: 'quotas' },
      { id: 'hubspot', label: 'Intégration HubSpot', icon: Link2, brick: 'Intégration HubSpot', roles: MANAGER_ROLES, inManagerHub: true },
    ],
  },
  {
    id: 'supportbdr', label: 'Support Client BD Report', items: [
      { id: 'supporthub', label: 'Équipe support', icon: LifeBuoy, roles: SUPPORT_ROLES, staffOnly: true },
    ],
  },
]

export const NAV = NAV_GROUPS.flatMap(g => g.items)
// Onglets de la console « Gestion Manager » (masqués de la barre latérale).
export const MANAGER_TABS = NAV.filter(i => i.inManagerHub)

// Onglets accordables via une offre (tous ceux qui portent un `brick`).
export const GRANTABLE_TABS = NAV.filter(i => i.brick).map(i => {
  const g = NAV_GROUPS.find(gr => gr.items.includes(i))
  return { id: i.id, label: i.label, brick: i.brick, group: g.label }
})
// Ensemble des unités d'accès (bricks) — l'éditeur d'offres et la page Souscrire s'appuient dessus.
export const ALL_BRICKS = [...new Set(GRANTABLE_TABS.map(t => t.brick))]
// Bricks historiques (avant l'ajout des nouveaux onglets) — sert à la migration douce des comptes existants.
export const LEGACY_BRICKS = ['Dashboard', 'Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches', 'Mes contacts', 'Mes notes', 'Primes & Commissions', 'KPI Entreprise', 'ICP', 'Logs']

// ---------------------------------------------------------------- Menu sur mesure par client
/**
 * L'ordre des rubriques et leur découpage ne sont pas universels : une équipe qui vit
 * dans le pipeline et une autre qui vit dans le reporting ne veulent pas la même première
 * ligne. Le staff compose donc le menu À LA LIVRAISON — `env.navLayout`.
 *
 * ⚠️ LA DISPOSITION N'ACCORDE AUCUN ACCÈS. Elle s'applique APRÈS le filtrage par offre,
 * rôle, module et permission : ranger un onglet ailleurs ne le rend pas visible à qui n'y
 * a pas droit, et retirer une catégorie ne retire aucun droit.
 * ⚠️ UN ONGLET NON MENTIONNÉ N'EST PAS PERDU. Une brique livrée après la composition du
 * menu retomberait sinon dans un trou : elle reste dans sa rubrique d'origine, à la fin.
 */
export function applyNavLayout(groups, layout) {
  if (!Array.isArray(layout) || !layout.length) return groups
  const byId = new Map()
  groups.forEach(g => g.items.forEach(it => byId.set(it.id, it)))
  const placed = new Set()
  const out = []
  layout.forEach(g => {
    const items = (g.items || []).map(id => byId.get(id)).filter(Boolean)
    items.forEach(it => placed.add(it.id))
    if (items.length) out.push({ id: g.id, label: g.label, items })
  })
  // Le reliquat : tout ce que la disposition ne nomme pas, à sa place d'origine.
  groups.forEach(g => {
    const rest = g.items.filter(it => !placed.has(it.id))
    if (!rest.length) return
    const existing = out.find(x => x.id === g.id)
    if (existing) existing.items.push(...rest)
    else out.push({ ...g, items: rest })
  })
  return out
}

// Disposition par défaut : la structure livrée, mise à plat pour être éditée.
export const defaultNavLayout = () => NAV_GROUPS.map(g => ({
  id: g.id, label: g.label, items: g.items.filter(i => !i.inManagerHub).map(i => i.id),
}))
