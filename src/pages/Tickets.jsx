import React, { useState } from 'react'
import { LifeBuoy, ArrowLeft, MessageSquare, CheckCircle2, Trash2, Building2, Star, UserCog } from 'lucide-react'
import { useStore, fmtDate, ticketHasUnread, TICKET_PRIORITIES, SUPPORT_ROLES, priorityRank } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'
import TicketChat from './TicketChat.jsx'

const STATUS_LABEL = { open: 'Ouvert', in_progress: 'En cours', closed: 'Clôturé' }
const STATUS_CLASS = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-200 text-gray-600',
}
const prio = (id) => TICKET_PRIORITIES.find(p => p.id === id) || TICKET_PRIORITIES[1]

export default function Tickets() {
  const store = useStore()
  const me = store.account
  const [openId, setOpenId] = useState('')
  const [filter, setFilter] = useState('') // statut
  const [fPrio, setFPrio] = useState('')
  const [fAssignee, setFAssignee] = useState('') // '' | 'me' | accountId
  const [confirmDel, setConfirmDel] = useState(null)

  const envName = (id) => store.db.environments.find(e => e.id === id)?.name || '—'
  const supportMembers = store.db.accounts.filter(a => SUPPORT_ROLES.includes(a.role))
  const memberName = (id) => store.db.accounts.find(a => a.id === id)?.pseudo || '—'

  let tickets = (store.db.tickets || [])
    // Tri : non clôturés d'abord, puis priorité décroissante, puis activité récente.
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed')
      || priorityRank(b.priority) - priorityRank(a.priority)
      || (b.messages.at(-1)?.ts || b.createdAt).localeCompare(a.messages.at(-1)?.ts || a.createdAt))
  if (filter) tickets = tickets.filter(t => t.status === filter)
  if (fPrio) tickets = tickets.filter(t => t.priority === fPrio)
  if (fAssignee) tickets = tickets.filter(t => fAssignee === 'me' ? t.assignedTo === me.id : t.assignedTo === fAssignee)

  const openTicket = openId ? (store.db.tickets || []).find(t => t.id === openId) : null
  const counts = (store.db.tickets || []).reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m }, {})

  const remove = (id) => { store.deleteTicket(id); setConfirmDel(null); setOpenId(''); toast('Ticket supprimé') }

  if (openTicket) {
    return (
      <div className="space-y-3">
        <button className="btn-ghost text-xs" onClick={() => setOpenId('')}><ArrowLeft size={14} /> Retour aux tickets</button>
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <div className="font-bold flex items-center gap-2"><LifeBuoy size={16} className="text-brand" /> {openTicket.category}</div>
              <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                <span>{openTicket.userName}</span>
                <span className="flex items-center gap-1"><Building2 size={11} /> {envName(openTicket.envId)}</span>
                <span>· Ouvert le {fmtDate(openTicket.createdAt.slice(0, 10))}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`chip ${STATUS_CLASS[openTicket.status]}`}>{STATUS_LABEL[openTicket.status]}</span>
              {openTicket.status !== 'closed'
                ? <button className="btn-ghost !py-1 text-xs" onClick={() => store.setTicketStatus(openTicket.id, 'closed')}><CheckCircle2 size={13} /> Clôturer</button>
                : <button className="btn-ghost !py-1 text-xs" onClick={() => store.setTicketStatus(openTicket.id, 'in_progress')}>Rouvrir</button>}
              <button className="btn-danger !py-1 text-xs" onClick={() => setConfirmDel(openTicket.id)}><Trash2 size={13} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs border-t border-line pt-2">
            <span className="text-muted">Priorité</span>
            <select className="input !w-auto !py-1" value={openTicket.priority} onChange={e => store.setTicketPriority(openTicket.id, e.target.value)}>
              {TICKET_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="text-muted ml-2 flex items-center gap-1"><UserCog size={12} /> Assigné à</span>
            <select className="input !w-auto !py-1" value={openTicket.assignedTo || ''} onChange={e => store.assignTicket(openTicket.id, e.target.value)}>
              <option value="">Personne</option>
              {supportMembers.map(m => <option key={m.id} value={m.id}>{m.pseudo}</option>)}
            </select>
            {openTicket.csat && (
              <span className="ml-auto flex items-center gap-1 text-amber-600 font-semibold">
                <Star size={13} className="fill-amber-400 text-amber-400" /> {openTicket.csat.score}/5
                {openTicket.csat.comment && <span className="text-muted italic font-normal">« {openTicket.csat.comment} »</span>}
              </span>
            )}
          </div>
        </div>
        <div className="card p-3 h-[60vh]"><TicketChat ticket={openTicket} role="support" /></div>
        {confirmDel && <Confirm message="Supprimer définitivement ce ticket ?" onYes={() => remove(confirmDel)} onNo={() => setConfirmDel(null)} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold flex items-center gap-2"><LifeBuoy size={20} className="text-brand" /> Tickets Techniques</h2>
      <p className="text-sm text-muted -mt-2">Tous les tickets ouverts par les utilisateurs de BD Report, triés par priorité.</p>

      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        {[['', 'Tous'], ['open', 'Ouverts'], ['in_progress', 'En cours'], ['closed', 'Clôturés']].map(([id, lbl]) => (
          <button key={id} className={`btn text-xs ${filter === id ? 'bg-brand text-white' : 'bg-card border border-line'}`} onClick={() => setFilter(id)}>
            {lbl}{id && counts[id] ? ` (${counts[id]})` : ''}
          </button>
        ))}
        <select className="input !w-auto !py-1.5 ml-1" value={fPrio} onChange={e => setFPrio(e.target.value)}>
          <option value="">Toutes priorités</option>
          {TICKET_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select className="input !w-auto !py-1.5" value={fAssignee} onChange={e => setFAssignee(e.target.value)}>
          <option value="">Tous assignés</option>
          <option value="me">Mes tickets</option>
          {supportMembers.map(m => <option key={m.id} value={m.id}>{m.pseudo}</option>)}
        </select>
      </div>

      {tickets.length === 0 ? (
        <Empty text="Aucun ticket." />
      ) : (
        <div className="space-y-2">
          {tickets.map(t => {
            const last = t.messages.at(-1)
            const unread = ticketHasUnread(t, 'support')
            return (
              <button key={t.id} className="card p-3 w-full text-left hover:bg-surface transition flex items-center gap-3" onClick={() => setOpenId(t.id)}>
                <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 relative">
                  <MessageSquare size={17} />
                  {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm flex items-center gap-2 flex-wrap ${unread ? 'font-extrabold' : 'font-bold'}`}>
                    {t.category} <span className="text-xs text-muted font-normal">· {t.userName}</span>
                    <span className={`chip ${prio(t.priority).color}`}>{prio(t.priority).label}</span>
                    {t.assignedTo && <span className="chip bg-brand/10 text-brand">{memberName(t.assignedTo)}</span>}
                    {t.csat && <span className="chip bg-amber-100 text-amber-700 flex items-center gap-0.5"><Star size={9} className="fill-amber-500 text-amber-500" /> {t.csat.score}</span>}
                  </div>
                  <div className="text-xs text-muted truncate">{last?.from === 'bot' ? 'BD Report : ' : last?.from === 'support' ? `${last.authorName} : ` : `${t.userName} : `}{last?.photo && !last?.text ? '📷 Photo' : last?.text}</div>
                </div>
                <span className={`chip ${STATUS_CLASS[t.status]} shrink-0`}>{STATUS_LABEL[t.status]}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
