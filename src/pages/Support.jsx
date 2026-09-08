import React, { useState, useEffect } from 'react'
import { LifeBuoy, Plus, ArrowLeft, MessageSquare, Star, BookOpen, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useStore, TICKET_CATEGORIES, TICKET_PRIORITIES, KB_CATEGORIES, fmtDate, ticketHasUnread } from '../store.jsx'
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

// Base de connaissances côté client : on entre par une catégorie, ou directement par la
// recherche. Objectif assumé : qu'un client trouve sa réponse seul plutôt que d'ouvrir un
// ticket — la recherche couvre donc aussi des mots-clés absents du texte de l'article.
function KbBrowser() {
  const store = useStore()
  const articles = store.db.kbArticles || []
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [openId, setOpenId] = useState('')
  if (!articles.length) return null

  const ql = q.trim().toLowerCase()
  const matches = (a) => (a.title + ' ' + a.category + ' ' + (a.keywords || '') + ' ' + a.content).toLowerCase().includes(ql)
  const searching = ql.length > 0

  // Catégories réellement peuplées, dans l'ordre du catalogue ; celles ajoutées à la main
  // par le support viennent ensuite pour ne jamais disparaître de l'écran.
  const counts = articles.reduce((m, a) => { m[a.category] = (m[a.category] || 0) + 1; return m }, {})
  const known = KB_CATEGORIES.filter(c => counts[c.id])
  const extra = Object.keys(counts)
    .filter(k => !KB_CATEGORIES.some(c => c.id === k))
    .map(k => ({ id: k, emoji: '📄', desc: '' }))
  const cats = [...known, ...extra]

  const list = searching ? articles.filter(matches) : articles.filter(a => a.category === cat)

  const Article = ({ a }) => (
    <div className="rounded-lg border border-line">
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
        onClick={() => setOpenId(openId === a.id ? '' : a.id)}>
        {openId === a.id ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
        <span className="flex-1">{a.title}</span>
        {searching && <span className="chip bg-surface text-muted">{a.category}</span>}
      </button>
      {openId === a.id && <p className="text-sm text-muted whitespace-pre-wrap px-3 pb-3 pl-9 leading-relaxed">{a.content}</p>}
    </div>
  )

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {cat && !searching && (
          <button className="btn-ghost !p-1" title="Toutes les catégories" onClick={() => { setCat(''); setOpenId('') }}>
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="font-bold flex items-center gap-2">
          <BookOpen size={16} className="text-brand" />
          {cat && !searching ? cat : 'Base de connaissances'}
        </div>
        <span className="text-xs text-muted ml-auto">{articles.length} articles</span>
      </div>
      {!cat && !searching && <p className="text-xs text-muted -mt-1">Trouvez votre réponse en quelques secondes, avant d'ouvrir un ticket.</p>}

      <div className="flex items-center gap-2 rounded-xl bg-surface px-2">
        <Search size={14} className="text-muted" />
        <input className="input !py-1.5 border-0 !bg-transparent text-sm" placeholder="Rechercher par mot-clé…"
          value={q} onChange={e => { setQ(e.target.value); setOpenId('') }} />
        {searching && <button className="btn-ghost !p-1 shrink-0" title="Effacer" onClick={() => setQ('')}>✕</button>}
      </div>

      {/* Grille des catégories : le point d'entrée par défaut. */}
      {!searching && !cat && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); setOpenId('') }}
              className="text-left p-3 rounded-xl border border-line hover:border-brand hover:bg-surface transition">
              <div className="flex items-center gap-2">
                <span className="text-lg">{c.emoji}</span>
                <span className="font-semibold text-sm flex-1">{c.id}</span>
                <span className="text-xs text-muted">{counts[c.id]}</span>
              </div>
              {c.desc && <p className="text-[11px] text-muted mt-0.5">{c.desc}</p>}
            </button>
          ))}
        </div>
      )}

      {(searching || cat) && (
        <div className="space-y-1">
          {searching && (
            <p className="text-xs text-muted">
              {list.length === 0 ? 'Aucun article ne correspond.' : `${list.length} article${list.length > 1 ? 's' : ''} trouvé${list.length > 1 ? 's' : ''}.`}
            </p>
          )}
          {list.map(a => <Article key={a.id} a={a} />)}
          {searching && list.length === 0 && (
            <p className="text-xs text-muted">Essayez un autre mot, ou ouvrez un ticket : le support vous répondra.</p>
          )}
        </div>
      )}
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

      <KbBrowser />

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
