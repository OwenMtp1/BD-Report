import React, { useState, useEffect } from 'react'
import { LifeBuoy, Plus, ArrowLeft, MessageSquare, Star } from 'lucide-react'
import { useStore, TICKET_CATEGORIES, TICKET_PRIORITIES, fmtDate, ticketHasUnread } from '../store.jsx'
import { Modal, Field, Empty, toast } from '../ui.jsx'
import TicketChat from './TicketChat.jsx'

const STATUS_LABEL = { open: 'Ouvert', in_progress: 'En cours', closed: 'Clôturé' }
const STATUS_CLASS = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-200 text-gray-600',
}
const prio = (id) => TICKET_PRIORITIES.find(p => p.id === id) || TICKET_PRIORITIES[1]

// Widget de notation 1→5 étoiles (CSAT).
function Stars({ value, onChange, readOnly }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={readOnly} title={`${n}/5`}
          onMouseEnter={() => !readOnly && setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => !readOnly && onChange(n)} className={readOnly ? '' : 'cursor-pointer'}>
          <Star size={readOnly ? 14 : 22} className={(hover || value) >= n ? 'text-amber-400 fill-amber-400' : 'text-line'} />
        </button>
      ))}
    </div>
  )
}

function CsatPrompt({ ticket }) {
  const store = useStore()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  if (ticket.csat) {
    return (
      <div className="card p-3 flex items-center gap-2 text-sm">
        <span className="text-muted">Votre satisfaction :</span>
        <Stars value={ticket.csat.score} readOnly />
        {ticket.csat.comment && <span className="text-muted italic truncate">« {ticket.csat.comment} »</span>}
      </div>
    )
  }
  return (
    <div className="card p-3 space-y-2">
      <div className="text-sm font-bold">Ce ticket est clôturé — comment évaluez-vous notre support ?</div>
      <Stars value={score} onChange={setScore} />
      <input className="input text-sm" placeholder="Un commentaire (optionnel)…" value={comment} onChange={e => setComment(e.target.value)} />
      <button className="btn-primary !py-1.5 text-xs" disabled={!score} onClick={() => { store.rateTicket(ticket.id, score, comment.trim()); toast('Merci pour votre retour !') }}>Envoyer mon avis</button>
    </div>
  )
}

export default function Support() {
  const store = useStore()
  const me = store.account
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState('')
  const [form, setForm] = useState({ category: TICKET_CATEGORIES[0], message: '', priority: 'normale' })

  // Ouverture déclenchée par l'assistant IA (problème énoncé) : pré-remplit le ticket.
  useEffect(() => {
    const h = (e) => { setOpenId(''); setForm({ category: TICKET_CATEGORIES[0], message: e.detail || '', priority: 'normale' }); setCreating(true) }
    window.addEventListener('open-support-ticket', h)
    return () => window.removeEventListener('open-support-ticket', h)
  }, [])

  // L'utilisateur ne voit que ses propres tickets.
  const myTickets = (store.db.tickets || [])
    .filter(t => t.userAccountId === me.id)
    .sort((a, b) => (b.messages.at(-1)?.ts || b.createdAt).localeCompare(a.messages.at(-1)?.ts || a.createdAt))

  const openTicket = openId ? myTickets.find(t => t.id === openId) : null

  const create = () => {
    if (!form.message.trim()) { toast('Décrivez votre problème.'); return }
    const ticket = store.createTicket(form)
    setCreating(false)
    setForm({ category: TICKET_CATEGORIES[0], message: '', priority: 'normale' })
    setOpenId(ticket.id)
    toast('Ticket créé — le support va vous répondre')
  }

  if (openTicket) {
    return (
      <div className="space-y-3">
        <button className="btn-ghost text-xs" onClick={() => setOpenId('')}><ArrowLeft size={14} /> Retour à mes tickets</button>
        <div className="card p-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold flex items-center gap-2"><LifeBuoy size={16} className="text-brand" /> {openTicket.category}</div>
            <div className="text-xs text-muted">Ouvert le {fmtDate(openTicket.createdAt.slice(0, 10))}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`chip ${prio(openTicket.priority).color}`}>{prio(openTicket.priority).label}</span>
            <span className={`chip ${STATUS_CLASS[openTicket.status]}`}>{STATUS_LABEL[openTicket.status]}</span>
          </div>
        </div>
        {openTicket.status === 'closed' && <CsatPrompt ticket={openTicket} />}
        <div className="card p-3 h-[60vh]"><TicketChat ticket={openTicket} role="user" /></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><LifeBuoy size={20} className="text-brand" /> Support</h2>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nouveau ticket</button>
      </div>
      <p className="text-sm text-muted -mt-2">Un problème sur l'application ? Ouvrez un ticket : l'équipe technique BD Report vous répond directement ici.</p>

      {myTickets.length === 0 ? (
        <Empty text="Aucun ticket pour le moment. Créez-en un avec « Nouveau ticket »." />
      ) : (
        <div className="space-y-2">
          {myTickets.map(t => {
            const last = t.messages.at(-1)
            const unread = ticketHasUnread(t, 'user')
            return (
              <button key={t.id} className="card p-3 w-full text-left hover:bg-surface transition flex items-center gap-3" onClick={() => setOpenId(t.id)}>
                <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 relative">
                  <MessageSquare size={17} />
                  {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm flex items-center gap-2 ${unread ? 'font-extrabold' : 'font-bold'}`}>{t.category}<span className={`chip ${prio(t.priority).color}`}>{prio(t.priority).label}</span></div>
                  <div className="text-xs text-muted truncate">{last?.from === 'bot' ? 'BD Report : ' : last?.from === 'support' ? `${last.authorName} : ` : 'Vous : '}{last?.photo && !last?.text ? '📷 Photo' : last?.text}</div>
                </div>
                <span className={`chip ${STATUS_CLASS[t.status]} shrink-0`}>{STATUS_LABEL[t.status]}</span>
              </button>
            )
          })}
        </div>
      )}

      {creating && (
        <Modal title="Nouveau ticket de support" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Catégorie du problème" required>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Priorité">
                <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {TICKET_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Décrivez votre problème" required>
              <textarea className="input min-h-[120px]" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Expliquez ce qui ne va pas, avec un maximum de détails…" autoFocus />
            </Field>
            <p className="text-xs text-muted">Dès l'envoi, une conversation s'ouvre et un membre de l'équipe technique prend en charge votre demande.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn-primary" onClick={create}>Créer le ticket</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
