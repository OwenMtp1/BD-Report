import React, { useState } from 'react'
import { Inbox, LifeBuoy, Users2, FolderKanban, BookOpen, ScrollText, Trash2, MonitorPlay, MessagesSquare, Tag, ShieldCheck } from 'lucide-react'
import { useStore, slaInfo } from '../store.jsx'
import Requests from './Requests.jsx'
import Tickets from './Tickets.jsx'
import Clients from './Clients.jsx'
import Projects from './Projects.jsx'
import KnowledgeBase from './KnowledgeBase.jsx'
import SupportLogs from './SupportLogs.jsx'
import SupportTrash from './SupportTrash.jsx'
import DemoSales from './DemoSales.jsx'
import Conversations from './Conversations.jsx'
import OffersAdmin from './OffersAdmin.jsx'
import StaffPermissions from './StaffPermissions.jsx'

const SupportConversations = () => <Conversations scope="support" />

// Console Support unifiée : un tableau de bord unique (KPI + onglets) qui regroupe
// tout le back-office support. Chaque onglet porte la permission (`perm`) qui le
// déverrouille — un membre du staff ne voit que ce que son rôle autorise.
const TABS = [
  { id: 'requests', label: 'Demandes', icon: Inbox, El: Requests, perm: 'requests.view' },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare, El: SupportConversations },
  { id: 'tickets', label: 'Tickets', icon: LifeBuoy, El: Tickets, perm: 'tickets.view' },
  { id: 'clients', label: 'Clients', icon: Users2, El: Clients, perm: 'clients.view' },
  { id: 'projects', label: 'Projets', icon: FolderKanban, El: Projects, perm: 'projects.view' },
  { id: 'offers', label: 'Offres', icon: Tag, El: OffersAdmin, perm: 'offers.manage' },
  { id: 'kb', label: 'Base de connaissances', icon: BookOpen, El: KnowledgeBase, perm: 'kb.manage' },
  { id: 'permissions', label: 'Permissions staff', icon: ShieldCheck, El: StaffPermissions, perm: 'permissions.manage' },
  { id: 'logs', label: 'Logs', icon: ScrollText, El: SupportLogs, perm: 'logs.view' },
  { id: 'trash', label: 'Corbeille', icon: Trash2, El: SupportTrash, perm: 'trash.manage' },
  { id: 'demo', label: 'Démo commerciale', icon: MonitorPlay, El: DemoSales, perm: 'demo.access' },
]

export default function SupportHub() {
  const store = useStore()
  const db = store.db
  // Onglets visibles selon les permissions du rôle (le Fondateur voit tout).
  const tabs = TABS.filter(t => !t.perm || store.hasPerm(t.perm))
  const [tab, setTab] = useState(tabs[0]?.id || 'conversations')

  const newReq = (db.supportRequests || []).filter(r => !r.archived && r.status === 'new').length
  const openTickets = (db.tickets || []).filter(t => t.status !== 'closed')
  const slaRisk = openTickets.filter(t => { const s = slaInfo(t); return !s.responded && s.breached }).length
  const kpis = [
    { label: 'Nouvelles demandes', value: newReq, tab: 'requests', color: 'text-brand' },
    { label: 'Tickets ouverts', value: openTickets.length, tab: 'tickets', color: 'text-sky-600' },
    { label: 'SLA à risque', value: slaRisk, tab: 'tickets', color: slaRisk ? 'text-red-600' : 'text-muted' },
    { label: 'Clients', value: (db.clients || []).length, tab: 'clients', color: 'text-emerald-600' },
    { label: 'Projets', value: (db.projects || []).length, tab: 'projects', color: 'text-amber-600' },
  ]

  const Current = tabs.find(t => t.id === tab)?.El || tabs[0]?.El || Requests

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold">Console Support</h2>
        <p className="text-xs text-muted -mt-0.5">Tout piloter au même endroit : demandes, tickets, clients, projets et base de connaissances.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <button key={k.label} onClick={() => setTab(k.tab)}
            className={`card p-3 text-left transition hover:border-brand ${tab === k.tab ? '!border-brand' : ''}`}>
            <div className={`text-2xl font-extrabold stat-num ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted">{k.label}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-line">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-surface'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div><Current /></div>
    </div>
  )
}
