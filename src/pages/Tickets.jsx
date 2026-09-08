import React, { useState } from 'react'
import { LifeBuoy, ArrowLeft, MessageSquare, CheckCircle2, Trash2, Building2, Star, UserCog, MessageSquareText, Plus, Clock, AlertTriangle } from 'lucide-react'
import { useStore, fmtDate, ticketHasUnread, TICKET_PRIORITIES, SUPPORT_ROLES, priorityRank, slaInfo, fmtDuration, SLA_HOURS } from '../store.jsx'
import { Empty, Confirm, toast, Modal, Field } from '../ui.jsx'
import TicketChat from './TicketChat.jsx'

// Tableau de bord satisfaction (CSAT)
function CsatDashboard({ tickets }) {
  const rated = tickets.filter(t => t.csat)
  if (!rated.length) return null
  const avg = rated.reduce((a, t) => a + t.csat.score, 0) / rated.length
  const dist = [1, 2, 3, 4, 5].map(n => rated.filter(t => t.csat.score === n).length)
  const comments = rated.filter(t => t.csat.comment).slice(0, 3)
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <div className="text-xs text-muted font-bold uppercase tracking-wide">Satisfaction (CSAT)</div>
          <div className="flex items-baseline gap-1"><span className="text-3xl font-extrabold">{avg.toFixed(1)}</span><span className="text-muted">/5</span></div>
          <div className="text-xs text-muted">{rated.length} avis</div>
        </div>
        <div className="flex-1 min-w-[160px] space-y-0.5">
          {[5, 4, 3, 2, 1].map(n => {
            const c = dist[n - 1], pct = rated.length ? Math.round(c / rated.length * 100) : 0
            return (
              <div key={n} className="flex items-center gap-2 text-[11px]">
                <span className="w-3 text-muted">{n}</span><Star size={10} className="text-amber-400 fill-amber-400" />
                <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                <span className="w-7 text-right text-muted">{c}</span>
              </div>
            )
          })}
        </div>
        {comments.length > 0 && (
          <div className="flex-1 min-w-[200px] space-y-1">
            {comments.map(t => <div key={t.id} className="text-xs text-muted italic">« {t.csat.comment} » — {t.userName}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

// Gestion des réponses types
function CannedManager({ store, onClose }) {
  const list = store.db.cannedReplies || []
  const [form, setForm] = useState({ title: '', text: '' })
  return (
    <Modal title="Réponses types" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {list.length === 0 && <p className="text-xs text-muted">Aucune réponse type.</p>}
          {list.map(r => (
            <div key={r.id} className="rounded-xl bg-surface p-2.5">
              <div className="flex items-center gap-2">
                <input className="input !py-1 text-sm font-bold" value={r.title} onChange={e => store.updateCannedReply(r.id, { title: e.target.value })} />
                <button className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0" onClick={() => store.deleteCannedReply(r.id)}><Trash2 size={14} /></button>
              </div>
              <textarea className="input !py-1 text-sm mt-1 min-h-[50px]" value={r.text} onChange={e => store.updateCannedReply(r.id, { text: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="border-t border-line pt-3 space-y-2">
          <div className="text-xs font-bold">Nouvelle réponse type</div>
          <input className="input text-sm" placeholder="Titre" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea className="input text-sm min-h-[60px]" placeholder="Texte de la réponse…" value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
          <button className="btn-primary !py-1.5 text-sm" onClick={() => { if (!form.text.trim()) return; store.addCannedReply(form); setForm({ title: '', text: '' }); toast('Réponse type ajoutée') }}><Plus size={14} /> Ajouter</button>
        </div>
      </div>
    </Modal>
  )
}

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
  const [manageCanned, setManageCanned] = useState(false)

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

        {/* Prise en charge : on sait qui mène l'échange. Tout le support peut répondre —
            c'est une responsabilité affichée, pas un verrou. */}
        {openTicket.status !== 'closed' && (
          openTicket.assignedTo ? (
            <div className="card p-2.5 flex items-center gap-2 flex-wrap text-sm">
              <UserCog size={15} className="text-brand shrink-0" />
              <span>Pris en charge par <b>{memberName(openTicket.assignedTo)}</b></span>
              {openTicket.takenAt && <span className="text-xs text-muted">· depuis le {fmtDate(openTicket.takenAt.slice(0, 10))}</span>}
              {openTicket.assignedTo !== me.id && (
                <button className="btn-ghost !py-1 text-xs ml-auto" onClick={() => { store.takeTicket(openTicket.id); toast('Vous reprenez ce ticket') }}>
                  Reprendre à mon compte
                </button>
              )}
            </div>
          ) : (
            <div className="card p-3 flex items-center gap-2 flex-wrap bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span className="text-sm">Ce ticket n'est pris en charge par personne.</span>
              <div className="flex gap-2 ml-auto">
                <button className="btn-ghost !py-1 text-xs" onClick={() => setOpenId('')}>Retour</button>
                <button className="btn-primary !py-1 text-xs" onClick={() => { store.takeTicket(openTicket.id); toast('Ticket pris en charge') }}>
                  <UserCog size={13} /> Prendre en charge
                </button>
              </div>
            </div>
          )
        )}

        {/* Clôture demandée par le client : son motif, tel qu'il l'a écrit. */}
        {openTicket.closure?.by === 'client' && (
          <div className="card p-2.5 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>Clôturé par le client — <b>{openTicket.closure.reason === 'resolved' ? 'problème résolu' : 'autre motif'}</b></span>
            </div>
            {openTicket.closure.comment && (
              <p className="text-xs text-muted italic mt-1 whitespace-pre-wrap">« {openTicket.closure.comment} »</p>
            )}
          </div>
        )}

        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <div className="font-bold flex items-center gap-2"><LifeBuoy size={16} className="text-brand" /> {openTicket.category}</div>
              <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                <span>{openTicket.userName}</span>
                <span className="flex items-center gap-1"><Building2 size={11} /> {envName(openTicket.envId)}</span>
                <span>· Ouvert le {fmtDate(openTicket.createdAt.slice(0, 10))}</span>
              </div>
              {(() => {
                const s = slaInfo(openTicket)
                return (
                  <div className="text-xs flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-muted flex items-center gap-1"><Clock size={11} /> SLA {SLA_HOURS[openTicket.priority]}h :</span>
                    {s.responded
                      ? <span className={s.breached ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>1re réponse en {fmtDuration(s.ms)}{s.breached ? ' (hors délai)' : ''}</span>
                      : openTicket.status === 'closed'
                        ? <span className="text-muted">clôturé sans réponse</span>
                        : <span className={s.breached ? 'text-red-600 font-semibold flex items-center gap-1' : 'text-amber-600'}>{s.breached && <AlertTriangle size={11} />}en attente depuis {fmtDuration(s.ms)}{s.breached ? ' — SLA dépassé' : ''}</span>}
                    {openTicket.closedAt && <span className="text-muted">· résolu en {fmtDuration(new Date(openTicket.closedAt) - new Date(openTicket.createdAt))}</span>}
                  </div>
                )
              })()}
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><LifeBuoy size={20} className="text-brand" /> Tickets Techniques</h2>
        <button className="btn-ghost text-xs" onClick={() => setManageCanned(true)}><MessageSquareText size={14} /> Réponses types</button>
      </div>
      <p className="text-sm text-muted -mt-2">Tous les tickets ouverts par les utilisateurs de BD Report, triés par priorité.</p>

      <CsatDashboard tickets={store.db.tickets || []} />

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
            const sla = slaInfo(t)
            const slaOverdue = sla.breached && !sla.responded && t.status !== 'closed'
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
                    {slaOverdue && <span className="chip bg-red-100 text-red-700 flex items-center gap-0.5"><AlertTriangle size={9} /> SLA dépassé</span>}
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
      {manageCanned && <CannedManager store={store} onClose={() => setManageCanned(false)} />}
    </div>
  )
}
