import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  MessagesSquare, Plus, Hash, Radio, Send, ImagePlus, Smile, Trash2, Settings2, Users2,
  Lock, Globe, X, ChevronLeft, Bell, BellOff,
} from 'lucide-react'
import { useStore, reportEventsFor, PRESENCE_META } from '../store.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

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

  const people = isSupport ? store.db.accounts : store.db.subenvs.filter(s => s.envId === session?.envId)
  const services = isSupport ? store.staffServices() : store.envServices()
  const personName = (p) => isSupport ? (p.pseudo || p.email || '—') : `${p.prenom || ''} ${p.nom || ''}`.trim()

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
            {channels.map(c => {
              const unread = store.isChannelMuted(c.id) ? 0 : store.channelUnread(c.id)
              return (
                <button key={c.id} onClick={() => setSelId(c.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm ${sel?.id === c.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-surface'}`}>
                  {c.kind === 'reporting' ? <Radio size={15} className="shrink-0 text-amber-500" /> : <Hash size={15} className="shrink-0 opacity-60" />}
                  <span className="truncate flex-1">{c.name}</span>
                  {store.isChannelMuted(c.id) && <BellOff size={12} className="opacity-40 shrink-0" />}
                  {c.access !== 'all' && <Lock size={12} className="opacity-40 shrink-0" />}
                  {unread > 0 && <span className="shrink-0 text-[10px] font-extrabold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white">{unread > 9 ? '9+' : unread}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Thread du canal sélectionné */}
        {sel ? (
          <ChannelThread key={sel.id} channel={sel} store={store} meId={meId} canManage={canManage}
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
function ChannelThread({ channel, store, meId, canManage, onEdit, onDelete, onBack }) {
  const msgs = store.channelMessages(channel.id)
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [pickerFor, setPickerFor] = useState(null) // id de message pour lequel le sélecteur d'émoji est ouvert
  const fileRef = useRef(null)
  const endRef = useRef(null)
  const muted = store.isChannelMuted(channel.id)
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [msgs.length])
  // Marque le canal comme lu à l'ouverture et à chaque nouveau message consulté.
  useEffect(() => { store.markChannelRead(channel.id) }, [channel.id, msgs.length]) // eslint-disable-line

  const send = () => {
    if (!text.trim() && !image) return
    store.postChannelMessage(channel.id, { text, image })
    setText(''); setImage('')
  }
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    if (!f.type.startsWith('image/')) { toast('Seules les images sont acceptées'); return }
    fileToDataUrl(f, setImage)
    e.target.value = ''
  }

  return (
    <div className="card flex flex-col h-[70vh] min-h-[420px]">
      {/* En-tête */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <button className="md:hidden btn-ghost !p-1.5" onClick={onBack}><ChevronLeft size={18} /></button>
        {channel.kind === 'reporting' ? <Radio size={17} className="text-amber-500" /> : <Hash size={17} className="opacity-60" />}
        <div className="min-w-0">
          <div className="font-bold truncate flex items-center gap-2">{channel.name}
            {channel.access === 'members' && <span className="chip bg-surface text-muted !text-[10px]"><Lock size={10} /> restreint</span>}
            {channel.access === 'services' && <span className="chip bg-surface text-muted !text-[10px]"><Users2 size={10} /> par service</span>}
            {channel.access === 'all' && <span className="chip bg-surface text-muted !text-[10px]"><Globe size={10} /> ouvert</span>}
          </div>
          {channel.kind === 'reporting' && <div className="text-[11px] text-muted">Reporting automatique BD Report</div>}
        </div>
        <div className="ml-auto flex gap-1">
          <button className={`btn-ghost !p-1.5 ${muted ? 'text-red-500' : ''}`} title={muted ? 'Réactiver les notifications' : 'Couper les notifications de ce canal'} onClick={() => store.toggleMuteChannel(channel.id)}>
            {muted ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
          {canManage && <>
            <button className="btn-ghost !p-1.5" title="Réglages du canal" onClick={onEdit}><Settings2 size={16} /></button>
            <button className="btn-ghost !p-1.5 text-red-500" title="Supprimer" onClick={onDelete}><Trash2 size={16} /></button>
          </>}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <div className="pt-8"><Empty text={channel.kind === 'reporting' ? 'Les événements apparaîtront ici automatiquement.' : 'Démarrez la conversation.'} /></div>}
        {msgs.map(m => m.system ? (
          <div key={m.id} className="flex justify-center">
            <div className="max-w-[92%] rounded-xl px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
              <span className="mr-2">{m.text}</span>
              <span className="text-[10px] opacity-60 whitespace-nowrap">{timeStr(m.ts)}</span>
              <Reactions m={m} channel={channel} store={store} meId={meId} pickerFor={pickerFor} setPickerFor={setPickerFor} />
            </div>
          </div>
        ) : (
          <div key={m.id} className={`flex gap-2.5 ${m.authorSubId === meId || m.authorId === meId ? 'flex-row-reverse' : ''}`}>
            {m.authorPhoto
              ? <img src={m.authorPhoto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-[11px] font-extrabold flex items-center justify-center shrink-0">{initials(m.authorName)}</div>}
            <div className={`min-w-0 max-w-[78%] ${m.authorSubId === meId || m.authorId === meId ? 'items-end text-right' : ''} flex flex-col`}>
              <div className="text-[11px] text-muted mb-0.5">{m.authorName} · {timeStr(m.ts)}</div>
              <div className="rounded-2xl px-3 py-2 bg-surface inline-block text-left">
                {m.image && <img src={m.image} alt="" className="rounded-lg max-h-64 mb-1.5" />}
                {m.text && <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>}
              </div>
              <Reactions m={m} channel={channel} store={store} meId={meId} pickerFor={pickerFor} setPickerFor={setPickerFor} />
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composeur */}
      <div className="border-t border-line p-2.5">
        {image && (
          <div className="relative inline-block mb-2">
            <img src={image} alt="" className="h-20 rounded-lg" />
            <button onClick={() => setImage('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={12} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button className="btn-ghost !p-2 shrink-0" title="Joindre une image" onClick={() => fileRef.current?.click()}><ImagePlus size={18} /></button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <textarea rows={1} className="input flex-1 resize-none max-h-32" placeholder="Écrivez un message…" value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="btn-primary !px-3 shrink-0" onClick={send} disabled={!text.trim() && !image}><Send size={16} /></button>
        </div>
      </div>
    </div>
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
        {sorted.map(m => (
          <div key={m.key} className="flex items-center gap-2">
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
          </div>
        ))}
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
