import React, { useState, useRef, useEffect } from 'react'
import { Send, ImagePlus, X, MessageSquareText } from 'lucide-react'
import { useStore, ticketHasUnread } from '../store.jsx'
import { LogoMark } from '../Brand.jsx'
import { toast } from '../ui.jsx'

const TYPING_WINDOW = 4000 // ms : durée d'affichage de « … est en train d'écrire »

const fmtTime = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Avatar d'un message : photo du technicien si fournie, sinon logo BD Report (équipe/bot),
// sinon initiales (côté utilisateur sans photo).
function MsgAvatar({ m }) {
  if (m.photo === undefined) { /* no-op */ }
  if (m.from === 'user') {
    return m.authorPhoto
      ? <img src={m.authorPhoto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
      : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-xs font-extrabold flex items-center justify-center shrink-0">{(m.authorName || '?').slice(0, 2).toUpperCase()}</div>
  }
  // support ou bot
  return m.authorPhoto
    ? <img src={m.authorPhoto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
    : <div className="w-8 h-8 rounded-xl bg-white border border-line flex items-center justify-center shrink-0"><LogoMark size={22} /></div>
}

export default function TicketChat({ ticket, role }) {
  const store = useStore()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState('')
  const endRef = useRef(null)
  const typingTimer = useRef(null)

  const mySide = role // 'user' | 'support'
  const otherSide = role === 'user' ? 'support' : 'user'

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [ticket.messages.length])
  // L'accusé de réception automatique n'a d'utilité que tant que personne n'a répondu :
  // dès qu'un agent intervient, il ne fait plus qu'éloigner la vraie réponse.
  const answered = ticket.messages.some(m => m.from === 'support')
  const visibleMessages = answered ? ticket.messages.filter(m => m.from !== 'bot') : ticket.messages

  // La conversation est ouverte : on marque les nouveaux messages comme lus pour effacer la pastille rouge.
  useEffect(() => {
    if (ticketHasUnread(ticket, mySide)) store.markTicketRead(ticket.id, mySide)
  }, [ticket.id, ticket.messages.length, mySide])

  // Re-rendu périodique pour faire expirer l'indicateur de saisie de l'autre partie.
  const [, forceTick] = useState(0)
  useEffect(() => { const i = setInterval(() => forceTick(x => x + 1), 1500); return () => clearInterval(i) }, [])

  const otherTypingAt = ticket.typing?.[otherSide + 'At'] || 0
  const otherTypingName = ticket.typing?.[otherSide + 'Name'] || (otherSide === 'user' ? ticket.userName : 'Le support')
  const otherTyping = Date.now() - otherTypingAt < TYPING_WINDOW

  const onType = (v) => {
    setText(v)
    store.setTicketTyping(ticket.id, mySide, true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => store.setTicketTyping(ticket.id, mySide, false), 2500)
  }

  const pickPhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 1.5 * 1024 * 1024) { toast('Image trop lourde (max 1,5 Mo).'); return }
    const r = new FileReader()
    r.onload = () => setPhoto(String(r.result))
    r.readAsDataURL(f)
    e.target.value = ''
  }

  const send = () => {
    if (!text.trim() && !photo) return
    store.postTicketMessage(ticket.id, { text: text.trim(), photo, from: mySide })
    setText(''); setPhoto('')
    clearTimeout(typingTimer.current)
    store.setTicketTyping(ticket.id, mySide, false)
  }

  const closed = ticket.status === 'closed'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-1">
        {visibleMessages.map(m => {
          const mine = m.from === mySide
          const senderLabel = m.from === 'bot' ? 'BD Report'
            : m.from === 'support' ? `${m.authorName} · BD Report`
              : m.authorName
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <MsgAvatar m={m} />
              <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                <span className="text-[10px] text-muted px-1">{senderLabel}</span>
                <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-white rounded-br-sm' : 'bg-surface text-ink rounded-bl-sm'}`}>
                  {m.photo && <img src={m.photo} alt="" className="rounded-xl mb-1.5 max-h-60 object-cover" />}
                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                </div>
                <span className="text-[10px] text-muted px-1">{fmtTime(m.ts)}</span>
              </div>
            </div>
          )
        })}
        {otherTyping && (
          <div className="flex items-center gap-2 text-xs text-muted px-2 fade-in">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {otherTypingName} est en train d'écrire…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {closed ? (
        <div className="border-t border-line pt-3 text-center text-xs text-muted">
          Ce ticket est clôturé.
          {role === 'support' && <button className="ml-2 text-brand underline" onClick={() => store.setTicketStatus(ticket.id, 'in_progress')}>Rouvrir</button>}
        </div>
      ) : (
        <div className="border-t border-line pt-3 space-y-2">
          {photo && (
            <div className="relative inline-block">
              <img src={photo} alt="" className="h-20 rounded-xl object-cover" />
              <button className="absolute -top-2 -right-2 bg-ink text-white rounded-full p-0.5" onClick={() => setPhoto('')}><X size={13} /></button>
            </div>
          )}
          {role === 'support' && (store.db.cannedReplies || []).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted flex items-center gap-1"><MessageSquareText size={12} /> Réponses types :</span>
              {(store.db.cannedReplies || []).map(r => (
                <button key={r.id} type="button" title={r.text}
                  className="chip bg-surface text-ink hover:bg-brand/10 hover:text-brand"
                  onClick={() => onType(text ? text + '\n' + r.text : r.text)}>{r.title}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="p-2 rounded-xl hover:bg-surface text-muted cursor-pointer shrink-0" title="Joindre une photo">
              <ImagePlus size={18} />
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
            <textarea className="input min-h-[42px] max-h-32 resize-none py-2" rows={1} placeholder="Votre message…"
              value={text} onChange={e => onType(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <button className="btn-primary shrink-0 !px-3" onClick={send} title="Envoyer"><Send size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
