import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  MessagesSquare, Plus, Hash, Radio, Send, ImagePlus, Smile, Trash2, Settings2, Users2,
  Lock, Globe, X, ChevronLeft, Bell, BellOff, Paperclip, MoreVertical, Reply, Forward,
  Pin, PinOff, MailOpen, FileText, Download, CornerUpLeft, User, LogOut, Search, CheckCheck,
} from 'lucide-react'
import { useStore, reportEventsFor, PRESENCE_META } from '../store.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

const MAX_FILE = 4 * 1024 * 1024 // 4 Mo (stockage local)
// Lit un fichier quelconque en dataURL (nom/type/taille conservés).
function readAnyFile(file, cb) {
  if (file.size > MAX_FILE) { toast('Fichier trop volumineux (max 4 Mo)'); return }
  const reader = new FileReader()
  reader.onload = () => cb({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: reader.result })
  reader.readAsDataURL(file)
}
const humanSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko'

const EMOJIS = ['👍', '🎉', '🔥', '❤️', '😂', '👏', '🚀', '✅', '👀', '🙌']

// Redimensionne une image en dataURL compacte (max 1024px, JPEG) pour ne pas gonfler le stockage.
function fileToDataUrl(file, cb) {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const max = 1024
      let { width, height } = img
      if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r) }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      try { cb(canvas.toDataURL('image/jpeg', 0.82)) } catch (e) { cb(reader.result) }
    }
    img.onerror = () => cb(reader.result)
    img.src = reader.result
  }
  reader.readAsDataURL(file)
}

const timeStr = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch (e) { return '' } }
const initials = (n) => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

export default function Conversations({ scope = 'team' }) {
  const store = useStore()
  const session = store.session
  const isSupport = scope === 'support'
  const canManage = store.canManageChannels(scope)
  const meId = isSupport ? store.account?.id : session?.subEnvId

  const channels = store.listChannels(scope)
  const [selId, setSelId] = useState(channels[0]?.id || null)
  const [editing, setEditing] = useState(null) // channel en cours d'édition, ou 'new'
  const [confirmDel, setConfirmDel] = useState(null)
  const [manageServices, setManageServices] = useState(false)

  const sel = channels.find(c => c.id === selId) || channels[0] || null
  useEffect(() => { if (!channels.some(c => c.id === selId)) setSelId(channels[0]?.id || null) }, [channels.length]) // eslint-disable-line

  // Ouverture d'une conversation ciblée (ex : depuis la recherche → message direct).
  useEffect(() => {
    if (isSupport) return
    if (window.__pendingChannel) { setSelId(window.__pendingChannel); window.__pendingChannel = null }
    const h = (e) => { if (e.detail) setSelId(e.detail) }
    window.addEventListener('open-conversation', h)
    return () => window.removeEventListener('open-conversation', h)
  }, [isSupport])

  const people = isSupport ? store.db.accounts : store.db.subenvs.filter(s => s.envId === session?.envId)
  const services = isSupport ? store.staffServices() : store.envServices()
  const personName = (p) => isSupport ? (p.pseudo || p.email || '—') : `${p.prenom || ''} ${p.nom || ''}`.trim()
  // Nom affiché d'un canal (pour un message direct : le nom de l'autre interlocuteur).
  const chName = (c) => {
    if (c.dm) { const others = store.channelMembers(c).filter(m => m.subId !== meId && m.accountId !== meId); return others.map(o => o.name).join(', ') || 'Conversation' }
    return c.name
  }
  const chIcon = (c) => c.dm ? User : c.personal ? FileText : c.kind === 'reporting' ? Radio : Hash
  // Épinglés d'abord, puis ordre d'origine.
  const orderedChannels = [...channels].sort((a, b) => (store.isChannelPinned(b.id) ? 1 : 0) - (store.isChannelPinned(a.id) ? 1 : 0))

  return (
    <div className="space-y-4">
      {!isSupport && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2"><MessagesSquare size={20} className="text-brand" /> Conversations</h2>
            <p className="text-xs text-muted -mt-0.5">Canaux d'équipe et reporting automatique — pilotés par le manager.</p>
          </div>
          {canManage && <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Nouveau canal</button>}
        </div>
      )}
      {isSupport && canManage && (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setManageServices(true)}><Users2 size={15} /> Services du staff</button>
          <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Nouveau canal</button>
        </div>
      )}

      <div className="grid md:grid-cols-[240px_minmax(0,1fr)_210px] gap-4 items-start">
        {/* Liste des canaux */}
        <div className={`card p-2 ${sel ? 'hidden md:block' : ''}`}>
          {channels.length === 0 && <div className="p-3"><Empty text="Aucun canal accessible." /></div>}
          <div className="space-y-1">
            {orderedChannels.map(c => {
              const unread = store.isChannelMuted(c.id) ? 0 : store.channelUnread(c.id)
              const Ic = chIcon(c)
              return (
                <button key={c.id} onClick={() => setSelId(c.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm ${sel?.id === c.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-surface'}`}>
                  <Ic size={15} className={`shrink-0 ${c.kind === 'reporting' ? 'text-amber-500' : c.dm ? 'text-brand' : 'opacity-60'}`} />
                  <span className="truncate flex-1">{chName(c)}</span>
                  {store.isChannelPinned(c.id) && <Pin size={11} className="text-brand shrink-0" />}
                  {store.isChannelMuted(c.id) && <BellOff size={12} className="opacity-40 shrink-0" />}
                  {!c.dm && !c.personal && c.access !== 'all' && <Lock size={12} className="opacity-40 shrink-0" />}
                  {unread > 0 && <span className="shrink-0 text-[10px] font-extrabold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white">{unread > 9 ? '9+' : unread}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Thread du canal sélectionné */}
        {sel ? (
          <ChannelThread key={sel.id} channel={sel} title={chName(sel)} store={store} meId={meId} canManage={canManage}
            onEdit={() => setEditing(sel)} onDelete={() => setConfirmDel(sel)} onBack={() => setSelId(null)} />
        ) : (
          <div className="card p-8"><Empty text={canManage ? 'Créez un premier canal pour démarrer.' : 'Aucune conversation pour le moment.'} /></div>
        )}

        {/* Membres du canal + présence */}
        {sel && <MemberList channel={sel} store={store} meId={meId} />}
      </div>

      {editing && (
        <ChannelEditor scope={scope} store={store} people={people} services={services} personName={personName}
          channel={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); if (id) setSelId(id) }} />
      )}
      {confirmDel && (
        <Confirm message={`Supprimer le canal « ${confirmDel.name} » et tous ses messages ?`}
          onYes={() => { store.deleteChannel(confirmDel.id); if (selId === confirmDel.id) setSelId(null); setConfirmDel(null) }}
          onNo={() => setConfirmDel(null)} />
      )}
      {manageServices && <StaffServices store={store} onClose={() => setManageServices(false)} />}
    </div>
  )
}

// -------------------------------------------------- Fil de discussion d'un canal
function ChannelThread({ channel, title, store, meId, canManage, onEdit, onDelete, onBack }) {
  const allMsgs = store.channelMessages(channel.id)
  const draftKey = 'bdr_draft_' + channel.id
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) || '' } catch (e) { return '' } })
  const [image, setImage] = useState('')
  const [file, setFile] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'delete' | 'pin', msg }
  const [headMenu, setHeadMenu] = useState(false)
  const [convPending, setConvPending] = useState(null) // 'leave' | 'deleteAll' | 'deletePersonal'
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [, setTick] = useState(0) // rafraîchit « en train d'écrire » / accusés de lecture
  const imgRef = useRef(null), fileRef = useRef(null), endRef = useRef(null), typingRef = useRef(0)
  const muted = store.isChannelMuted(channel.id)
  const personal = channel.personal
  const pinnedChan = store.isChannelPinned(channel.id)
  const q = query.trim().toLowerCase()
  const msgs = q ? allMsgs.filter(m => (m.text || '').toLowerCase().includes(q)) : allMsgs
  const typers = store.channelTypers(channel.id)
  const lastMine = [...allMsgs].reverse().find(m => !m.system && (m.authorSubId === meId || m.authorId === meId))
  const readers = lastMine ? store.channelReadersAfter(channel, lastMine.ts, lastMine.authorSubId) : []

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 3000); return () => clearInterval(i) }, [])
  useEffect(() => { if (!q) endRef.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [allMsgs.length, q])
  useEffect(() => { store.markChannelRead(channel.id) }, [channel.id, allMsgs.length]) // eslint-disable-line
  // Sauvegarde du brouillon par canal (localStorage, personnel à l'appareil).
  useEffect(() => { try { text ? localStorage.setItem(draftKey, text) : localStorage.removeItem(draftKey) } catch (e) { /* ignore */ } }, [text, draftKey])

  const pinned = allMsgs.filter(m => m.pinned || store.isPinnedForMe(m.id))

  const onType = (v) => {
    setText(v)
    const now = Date.now()
    if (v && now - typingRef.current > 2500) { typingRef.current = now; store.setChannelTyping(channel.id) }
  }

  const send = () => {
    if (!text.trim() && !image && !file) return
    const rt = replyTo ? { id: replyTo.id, authorName: replyTo.authorName, text: (replyTo.text || '').slice(0, 120) || (replyTo.image ? '📷 image' : replyTo.file ? '📎 fichier' : '') } : null
    store.postChannelMessage(channel.id, { text, image, file, replyTo: rt })
    setText(''); setImage(''); setFile(null); setReplyTo(null); typingRef.current = 0
  }
  const onImg = (e) => { const f = e.target.files?.[0]; if (!f) return; if (!f.type.startsWith('image/')) { toast('Choisissez une image'); return } fileToDataUrl(f, setImage); e.target.value = '' }
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; readAnyFile(f, setFile); e.target.value = '' }
  const doDelete = (msg, all) => { all ? store.deleteMessageForAll(channel.id, msg.id) : store.deleteMessageForMe(msg.id); setConfirm(null) }
  const doPin = (msg, all) => { all ? store.pinMessageForAll(channel.id, msg.id, !msg.pinned) : store.pinMessageForMe(msg.id); setConfirm(null) }

  return (
    <div className="card flex flex-col h-[70vh] min-h-[420px]">
      {/* En-tête */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <button className="md:hidden btn-ghost !p-1.5" onClick={onBack}><ChevronLeft size={18} /></button>
        {channel.dm ? <User size={17} className="text-brand" /> : personal ? <FileText size={17} className="text-brand" /> : channel.kind === 'reporting' ? <Radio size={17} className="text-amber-500" /> : <Hash size={17} className="opacity-60" />}
        <div className="min-w-0">
          <div className="font-bold truncate flex items-center gap-2">{title || channel.name}
            {channel.dm && <span className="chip bg-surface text-muted !text-[10px]"><Lock size={10} /> message direct</span>}
            {personal && <span className="chip bg-surface text-muted !text-[10px]"><Lock size={10} /> privé</span>}
            {!personal && !channel.dm && channel.access === 'members' && <span className="chip bg-surface text-muted !text-[10px]"><Lock size={10} /> restreint</span>}
            {!personal && !channel.dm && channel.access === 'services' && <span className="chip bg-surface text-muted !text-[10px]"><Users2 size={10} /> par service</span>}
            {!personal && !channel.dm && channel.access === 'all' && <span className="chip bg-surface text-muted !text-[10px]"><Globe size={10} /> ouvert</span>}
          </div>
          {channel.kind === 'reporting' && <div className="text-[11px] text-muted">Reporting automatique BD Report</div>}
          {personal && <div className="text-[11px] text-muted">Votre espace personnel — visible de vous seul</div>}
        </div>
        <div className="ml-auto flex gap-1">
          <button className={`btn-ghost !p-1.5 ${searchOpen ? 'text-brand' : ''}`} title="Rechercher dans les messages" onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery('') }}><Search size={16} /></button>
          {!personal && <button className={`btn-ghost !p-1.5 ${muted ? 'text-red-500' : ''}`} title={muted ? 'Réactiver les notifications' : 'Couper les notifications de ce canal'} onClick={() => store.toggleMuteChannel(channel.id)}>
            {muted ? <BellOff size={16} /> : <Bell size={16} />}
          </button>}
          {canManage && !personal && !channel._general && !channel.dm && (
            <button className="btn-ghost !p-1.5" title="Réglages du canal" onClick={onEdit}><Settings2 size={16} /></button>
          )}
          <div className="relative">
            <button className="btn-ghost !p-1.5" title="Options de la conversation" onClick={() => setHeadMenu(v => !v)}><MoreVertical size={16} /></button>
            {headMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setHeadMenu(false)} />
                <div className="absolute z-30 top-9 right-0 card shadow-lg w-56 p-1 text-sm">
                  <MenuItem icon={pinnedChan ? PinOff : Pin} label={pinnedChan ? 'Désépingler de la liste' : 'Épingler en haut'} onClick={() => { store.togglePinChannel(channel.id); setHeadMenu(false) }} />
                  {channel.dm && <MenuItem icon={Trash2} label="Supprimer la conversation" danger onClick={() => { store.hideChannelForMe(channel.id); setHeadMenu(false); toast('Conversation supprimée') }} />}
                  {personal && <MenuItem icon={Trash2} label="Supprimer le bloc-notes" danger onClick={() => { setConvPending('deletePersonal'); setHeadMenu(false) }} />}
                  {store.isGroupChannel(channel) && <>
                    <MenuItem icon={Trash2} label="Supprimer pour moi" onClick={() => { store.hideChannelForMe(channel.id); setHeadMenu(false); toast('Masquée — elle réapparaîtra au prochain message') }} />
                    <MenuItem icon={LogOut} label="Quitter le groupe" danger onClick={() => { setConvPending('leave'); setHeadMenu(false) }} />
                    {canManage && !channel._general && <MenuItem icon={Trash2} label="Supprimer pour tout le monde" danger onClick={() => { setConvPending('deleteAll'); setHeadMenu(false) }} />}
                  </>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recherche dans les messages */}
      {searchOpen && (
        <div className="px-3 py-2 border-b border-line flex items-center gap-2">
          <Search size={15} className="text-muted shrink-0" />
          <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Rechercher dans cette conversation…" value={query} onChange={e => setQuery(e.target.value)} />
          {q && <span className="text-xs text-muted shrink-0">{msgs.length} résultat{msgs.length > 1 ? 's' : ''}</span>}
          <button className="btn-ghost !p-1" onClick={() => { setSearchOpen(false); setQuery('') }}><X size={14} /></button>
        </div>
      )}

      {/* Bandeau messages épinglés */}
      {pinned.length > 0 && (
        <div className="px-4 py-2 border-b border-line bg-amber-50/60 dark:bg-amber-500/5 space-y-1">
          {pinned.slice(-3).map(m => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <Pin size={12} className="text-amber-500 shrink-0" />
              <span className="font-semibold shrink-0">{m.authorName} :</span>
              <span className="truncate text-muted flex-1">{m.text || (m.image ? '📷 image' : '📎 fichier')}</span>
              {m.pinned && canManage && <button className="text-muted hover:text-red-500" title="Désépingler pour tous" onClick={() => store.pinMessageForAll(channel.id, m.id, false)}><PinOff size={12} /></button>}
              {store.isPinnedForMe(m.id) && !m.pinned && <button className="text-muted hover:text-red-500" title="Retirer l'épingle" onClick={() => store.pinMessageForMe(m.id)}><PinOff size={12} /></button>}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <div className="pt-8"><Empty text={personal ? 'Notez ce que vous voulez ici (texte, images, fichiers).' : channel.kind === 'reporting' ? 'Les événements apparaîtront ici automatiquement.' : 'Démarrez la conversation.'} /></div>}
        {msgs.map(m => (
          <MessageRow key={m.id} m={m} channel={channel} store={store} meId={meId} canManage={canManage}
            pickerFor={pickerFor} setPickerFor={setPickerFor} menuFor={menuFor} setMenuFor={setMenuFor}
            onReply={() => { setReplyTo(m); setMenuFor(null) }} onForward={() => { setForwardMsg(m); setMenuFor(null) }}
            onDelete={() => { setConfirm({ kind: 'delete', msg: m }); setMenuFor(null) }} onPin={() => { setConfirm({ kind: 'pin', msg: m }); setMenuFor(null) }}
            onUnread={() => { store.markChannelUnreadFrom(channel.id, m.ts); setMenuFor(null); toast('Marqué comme non lu') }} />
        ))}
        {!q && readers.length > 0 && (
          <div className="flex items-center justify-end gap-1 text-[11px] text-muted pr-1">
            <CheckCheck size={13} className="text-brand" /> Lu par {readers.slice(0, 3).join(', ')}{readers.length > 3 ? ` +${readers.length - 3}` : ''}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Indicateur « en train d'écrire… » */}
      {typers.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-muted italic flex items-center gap-1.5">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '240ms' }} />
          </span>
          {typers.length === 1 ? `${typers[0]} écrit…` : `${typers.slice(0, 2).join(', ')} écrivent…`}
        </div>
      )}

      {/* Composeur */}
      <div className="border-t border-line p-2.5">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-xs bg-surface rounded-lg px-2 py-1.5">
            <CornerUpLeft size={13} className="text-brand shrink-0" />
            <span className="text-muted truncate">Réponse à <b>{replyTo.authorName}</b> : {(replyTo.text || (replyTo.image ? '📷 image' : '📎 fichier')).slice(0, 60)}</span>
            <button className="ml-auto shrink-0" onClick={() => setReplyTo(null)}><X size={13} /></button>
          </div>
        )}
        {(image || file) && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {image && <div className="relative"><img src={image} alt="" className="h-20 rounded-lg" /><button onClick={() => setImage('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={12} /></button></div>}
            {file && <div className="relative flex items-center gap-2 bg-surface rounded-lg px-3 py-2 text-xs"><FileText size={16} className="text-brand" /><span className="max-w-[140px] truncate">{file.name}</span><span className="text-muted">{humanSize(file.size)}</span><button onClick={() => setFile(null)} className="text-red-500"><X size={13} /></button></div>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button className="btn-ghost !p-2 shrink-0" title="Joindre une image" onClick={() => imgRef.current?.click()}><ImagePlus size={18} /></button>
          <button className="btn-ghost !p-2 shrink-0" title="Joindre un fichier" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button>
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={onImg} />
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
          <textarea rows={1} className="input flex-1 resize-none max-h-32" placeholder={personal ? 'Écrivez une note…' : 'Écrivez un message…'} value={text}
            onChange={e => onType(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="btn-primary !px-3 shrink-0" onClick={send} disabled={!text.trim() && !image && !file}><Send size={16} /></button>
        </div>
      </div>

      {forwardMsg && <ForwardModal store={store} scope={channel.scope} fromId={channel.id} msg={forwardMsg} onClose={() => setForwardMsg(null)} />}
      {confirm?.kind === 'delete' && <DoubleChoice title="Supprimer le message" desc="Choisissez la portée de la suppression :" a="Seulement pour moi" b="Pour tout le monde" onA={() => doDelete(confirm.msg, false)} onB={() => doDelete(confirm.msg, true)} onClose={() => setConfirm(null)} />}
      {confirm?.kind === 'pin' && <DoubleChoice title="Épingler le message" desc="Épingler ce message :" a="Pour moi" b="Pour tout le monde" onA={() => doPin(confirm.msg, false)} onB={() => doPin(confirm.msg, true)} onClose={() => setConfirm(null)} />}
      {convPending === 'leave' && <Confirm yesLabel="Quitter" message={`Quitter le groupe « ${title || channel.name} » ? Vous ne le verrez plus (un manager peut vous y rajouter).`} onYes={() => { store.leaveChannel(channel.id); setConvPending(null); toast('Vous avez quitté le groupe') }} onNo={() => setConvPending(null)} />}
      {convPending === 'deleteAll' && <Confirm message={`Supprimer la conversation « ${title || channel.name} » pour tout le monde ? Cette action est définitive.`} onYes={() => { store.deleteChannel(channel.id); setConvPending(null); toast('Conversation supprimée') }} onNo={() => setConvPending(null)} />}
      {convPending === 'deletePersonal' && <Confirm message="Supprimer définitivement votre bloc-notes et toutes ses notes ?" onYes={() => { store.deleteChannel(channel.id); setConvPending(null); toast('Bloc-notes supprimé') }} onNo={() => setConvPending(null)} />}
    </div>
  )
}

// Une ligne de message avec son menu d'actions (répondre, transférer, épingler, non-lu, supprimer).
function MessageRow({ m, channel, store, meId, canManage, pickerFor, setPickerFor, menuFor, setMenuFor, onReply, onForward, onDelete, onPin, onUnread }) {
  const mine = m.authorSubId === meId || m.authorId === meId
  if (m.system) return (
    <div className="flex justify-center">
      <div className="max-w-[92%] rounded-xl px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
        <span className="mr-2">{m.text}</span>
        <span className="text-[10px] opacity-60 whitespace-nowrap">{timeStr(m.ts)}</span>
        <Reactions m={m} channel={channel} store={store} meId={meId} pickerFor={pickerFor} setPickerFor={setPickerFor} />
      </div>
    </div>
  )
  const open = menuFor === m.id
  return (
    <div className={`group flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      {m.authorPhoto
        ? <img src={m.authorPhoto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-[11px] font-extrabold flex items-center justify-center shrink-0">{initials(m.authorName)}</div>}
      <div className={`min-w-0 max-w-[78%] flex flex-col ${mine ? 'items-end' : ''}`}>
        <div className="text-[11px] text-muted mb-0.5 flex items-center gap-1">
          {m.authorName} · {timeStr(m.ts)}
          {(m.pinned || store.isPinnedForMe(m.id)) && <Pin size={10} className="text-amber-500" />}
        </div>
        <div className="relative">
          <div className="rounded-2xl px-3 py-2 bg-surface inline-block text-left align-top">
            {m.forwardedFrom && <div className="text-[10px] text-muted italic mb-1 flex items-center gap-1"><Forward size={10} /> Transféré de {m.forwardedFrom}</div>}
            {m.replyTo && <div className="text-xs border-l-2 border-brand/50 pl-2 mb-1 text-muted"><b>{m.replyTo.authorName}</b><div className="truncate max-w-[220px]">{m.replyTo.text}</div></div>}
            {m.image && <img src={m.image} alt="" className="rounded-lg max-h-64 mb-1.5" />}
            {m.file && <a href={m.file.dataUrl} download={m.file.name} className="flex items-center gap-2 bg-app rounded-lg px-2.5 py-1.5 mb-1.5 hover:bg-brand/5 no-underline"><FileText size={16} className="text-brand shrink-0" /><span className="text-xs max-w-[160px] truncate">{m.file.name}</span><span className="text-[10px] text-muted shrink-0">{humanSize(m.file.size || 0)}</span><Download size={13} className="text-muted shrink-0" /></a>}
            {m.text && <div className="text-sm whitespace-pre-wrap break-words"><MsgText text={m.text} /></div>}
          </div>
          <button className={`absolute top-0 opacity-0 group-hover:opacity-100 transition p-1 text-muted hover:text-brand ${mine ? '-left-6' : '-right-6'}`} onClick={() => setMenuFor(open ? null : m.id)}><MoreVertical size={15} /></button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
              <div className={`absolute z-30 top-6 ${mine ? 'left-0' : 'right-0'} card shadow-lg w-48 p-1 text-sm`}>
                <MenuItem icon={Reply} label="Répondre" onClick={onReply} />
                <MenuItem icon={Forward} label="Transférer" onClick={onForward} />
                <MenuItem icon={Pin} label={(m.pinned || store.isPinnedForMe(m.id)) ? 'Épingler / retirer' : 'Épingler'} onClick={onPin} />
                <MenuItem icon={MailOpen} label="Marquer comme non lu" onClick={onUnread} />
                <MenuItem icon={Trash2} label="Supprimer" danger onClick={onDelete} />
              </div>
            </>
          )}
        </div>
        <Reactions m={m} channel={channel} store={store} meId={meId} pickerFor={pickerFor} setPickerFor={setPickerFor} />
      </div>
    </div>
  )
}
// Rend le texte d'un message en surlignant les @mentions.
function MsgText({ text }) {
  const parts = String(text).split(/(@[\p{L}][\p{L}\p{N}'-]*)/u)
  return parts.map((p, i) => p.startsWith('@')
    ? <span key={i} className="text-brand font-semibold">{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>)
}
function MenuItem({ icon: Icon, label, onClick, danger }) {
  return <button onClick={onClick} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-surface text-left ${danger ? 'text-red-500' : ''}`}><Icon size={14} /> {label}</button>
}
// Petite modale à double choix (pour moi / pour tout le monde).
function DoubleChoice({ title, desc, a, b, onA, onB, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-muted mb-4">{desc}</p>
      <div className="flex flex-col gap-2">
        <button className="btn-ghost justify-center" onClick={onA}>{a}</button>
        <button className="btn-primary justify-center" onClick={onB}>{b}</button>
      </div>
    </Modal>
  )
}
// Choix du canal de destination pour transférer un message.
function ForwardModal({ store, scope, fromId, msg, onClose }) {
  const channels = store.listChannels(scope).filter(c => c.id !== fromId)
  return (
    <Modal title="Transférer le message" onClose={onClose}>
      <p className="text-sm text-muted mb-3">Choisissez la conversation de destination :</p>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {channels.length === 0 && <div className="text-xs text-muted italic">Aucune autre conversation disponible.</div>}
        {channels.map(c => (
          <button key={c.id} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface text-left text-sm"
            onClick={() => { store.forwardChannelMessage(msg, c.id); toast('Message transféré vers ' + c.name); onClose() }}>
            {c.personal ? <FileText size={15} className="text-brand" /> : c.kind === 'reporting' ? <Radio size={15} className="text-amber-500" /> : <Hash size={15} className="opacity-60" />} {c.name}
          </button>
        ))}
      </div>
    </Modal>
  )
}

// Réactions émoji sous un message.
function Reactions({ m, channel, store, meId, pickerFor, setPickerFor }) {
  const reactions = m.reactions || {}
  const open = pickerFor === m.id
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {Object.entries(reactions).map(([emo, users]) => (
        <button key={emo} onClick={() => store.toggleChannelReaction(channel.id, m.id, emo)}
          className={`text-xs rounded-full px-1.5 py-0.5 border ${(users || []).includes(meId) ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}>
          {emo} {(users || []).length}
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setPickerFor(open ? null : m.id)} className="text-muted hover:text-brand p-0.5" title="Réagir"><Smile size={14} /></button>
        {open && (
          <div className="absolute z-20 bottom-6 left-0 card p-1.5 flex gap-1 flex-wrap w-44 shadow-lg">
            {EMOJIS.map(e => (
              <button key={e} className="text-lg hover:scale-125 transition" onClick={() => { store.toggleChannelReaction(channel.id, m.id, e); setPickerFor(null) }}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------- Liste des membres + présence
function MemberList({ channel, store, meId }) {
  const members = store.channelMembers(channel)
  const rank = { online: 0, dnd: 1, offline: 2 }
  const sorted = [...members].sort((a, b) => (rank[a.presence] - rank[b.presence]) || a.name.localeCompare(b.name))
  const online = members.filter(m => m.presence === 'online').length
  return (
    <div className="card p-3 hidden md:block">
      <div className="text-xs font-bold uppercase text-muted mb-2 flex items-center gap-1.5"><Users2 size={13} /> Membres · {online}/{members.length} en ligne</div>
      <div className="space-y-1.5">
        {members.length === 0 && <div className="text-xs text-muted italic">Aucun membre.</div>}
        {sorted.map(m => {
          const clickable = !!m.subId
          const open = () => { if (m.subId) window.dispatchEvent(new CustomEvent('open-collaborator', { detail: m.subId })) }
          return (
            <button key={m.key} type="button" onClick={open} disabled={!clickable}
              className={`w-full flex items-center gap-2 text-left rounded-lg px-1 py-0.5 ${clickable ? 'hover:bg-surface cursor-pointer' : 'cursor-default'}`}>
              <div className="relative shrink-0">
                {m.photo
                  ? <img src={m.photo} alt="" className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center">{initials(m.name)}</div>}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card ${PRESENCE_META[m.presence]?.dot}`} title={PRESENCE_META[m.presence]?.label} />
              </div>
              <div className="min-w-0">
                <div className="text-sm truncate">{m.name}{(m.subId === meId || m.accountId === meId) ? ' (moi)' : ''}</div>
                {m.poste && <div className="text-[10px] text-muted truncate">{m.poste}</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// -------------------------------------------------- Éditeur de canal (création / réglages)
function ChannelEditor({ scope, store, people, services, personName, channel, onClose, onSaved }) {
  const isSupport = scope === 'support'
  const catalog = reportEventsFor(scope)
  const [name, setName] = useState(channel?.name || '')
  const [kind, setKind] = useState(channel?.kind || 'chat')
  const [access, setAccess] = useState(channel?.access || 'all')
  const [members, setMembers] = useState(channel?.members || [])
  const [svcSel, setSvcSel] = useState(channel?.services || [])
  const [events, setEvents] = useState(() => channel?.reporting?.events || {})

  const toggleMember = (id) => setMembers(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id])
  const toggleSvc = (id) => setSvcSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleEvent = (key) => setEvents(ev => ({ ...ev, [key]: ev[key]?.on ? { ...ev[key], on: false } : { on: true, fields: ev[key]?.fields || Object.keys(catalog[key].fields) } }))
  const toggleField = (key, f) => setEvents(ev => {
    const cur = ev[key] || { on: true, fields: Object.keys(catalog[key].fields) }
    const fields = cur.fields.includes(f) ? cur.fields.filter(x => x !== f) : [...cur.fields, f]
    return { ...ev, [key]: { ...cur, fields } }
  })

  const save = () => {
    if (!name.trim()) { toast('Nommez le canal'); return }
    const patch = { name: name.trim(), kind, access, members: access === 'members' ? members : [], services: access === 'services' ? svcSel : [], reporting: kind === 'reporting' ? { events } : null }
    if (channel) { store.updateChannel(channel.id, patch); onSaved(channel.id); toast('Canal mis à jour') }
    else { const c = store.createChannel({ scope, ...patch }); onSaved(c?.id); toast('Canal créé') }
  }

  const Seg = ({ value, set, options }) => (
    <div className="flex rounded-lg overflow-hidden border border-line text-sm w-full">
      {options.map(([v, label, Icon]) => (
        <button key={v} onClick={() => set(v)} className={`flex-1 px-2 py-1.5 flex items-center justify-center gap-1.5 ${value === v ? 'bg-brand text-white font-semibold' : 'hover:bg-surface'}`}>
          {Icon && <Icon size={14} />} {label}
        </button>
      ))}
    </div>
  )

  return (
    <Modal title={channel ? 'Réglages du canal' : 'Nouveau canal'} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Nom du canal" required>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={isSupport ? 'ex : Reporting tickets' : 'ex : Reporting équipe'} autoFocus />
        </Field>

        <Field label="Type de canal">
          <Seg value={kind} set={setKind} options={[['chat', 'Discussion', Hash], ['reporting', 'Reporting auto', Radio]]} />
        </Field>

        {kind === 'reporting' && (
          <div className="rounded-xl border border-line p-3 space-y-2 bg-surface/50">
            <div className="text-sm font-bold flex items-center gap-1.5"><Radio size={15} className="text-amber-500" /> Événements postés automatiquement</div>
            <p className="text-xs text-muted">Choisissez les événements et, pour chacun, les informations affichées dans le message.</p>
            {Object.entries(catalog).map(([key, ev]) => {
              const on = !!events[key]?.on
              const selFields = events[key]?.fields || Object.keys(ev.fields)
              return (
                <div key={key} className="rounded-lg bg-app border border-line p-2.5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleEvent(key)} />
                    <span>{ev.emoji} {ev.label}</span>
                  </label>
                  {on && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pl-6">
                      {Object.entries(ev.fields).map(([f, flabel]) => (
                        <label key={f} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={selFields.includes(f)} onChange={() => toggleField(key, f)} /> {flabel}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Field label="Accès">
          <Seg value={access} set={setAccess} options={[['all', 'Tout le monde', Globe], ['services', 'Par service', Users2], ['members', 'Membres choisis', Lock]]} />
        </Field>

        {access === 'services' && (
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted mb-2">Seuls les membres de ces services voient le canal.</div>
            {services.length === 0 && <div className="text-xs text-muted italic">Aucun service défini pour l'instant.</div>}
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <label key={s.id} className={`chip cursor-pointer ${svcSel.includes(s.id) ? 'bg-brand text-white' : 'bg-surface text-muted'}`}>
                  <input type="checkbox" className="hidden" checked={svcSel.includes(s.id)} onChange={() => toggleSvc(s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {access === 'members' && (
          <div className="rounded-xl border border-line p-3 max-h-52 overflow-y-auto">
            <div className="text-xs text-muted mb-2">Cochez les personnes qui ont accès à ce canal.</div>
            <div className="space-y-1">
              {people.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input type="checkbox" checked={members.includes(p.id)} onChange={() => toggleMember(p.id)} />
                  {personName(p)}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save}>{channel ? 'Enregistrer' : 'Créer le canal'}</button>
        </div>
      </div>
    </Modal>
  )
}

// -------------------------------------------------- Services du staff (fondateur/support)
function StaffServices({ store, onClose }) {
  const [name, setName] = useState('')
  const services = store.staffServices()
  const staff = store.db.accounts
  const add = () => { if (name.trim()) { store.addService(name.trim(), 'staff'); setName('') } }
  return (
    <Modal title="Services du staff BD Report" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Nom du service (ex : Support N1, CSM…)" value={name}
            onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add}><Plus size={15} /> Ajouter</button>
        </div>
        {services.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {services.map(s => (
              <span key={s.id} className="chip bg-surface text-muted">
                {s.name}
                <button className="ml-1 text-red-500" onClick={() => store.removeService(s.id, 'staff')}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div>
          <div className="text-sm font-bold mb-2">Affectation des membres</div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {staff.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{a.pseudo} <span className="text-muted text-xs">({a.role})</span></span>
                <select className="input !w-auto !py-1 text-xs" value={a.staffServiceId || ''} onChange={e => store.assignStaffService(a.id, e.target.value || null)}>
                  <option value="">— Aucun —</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
