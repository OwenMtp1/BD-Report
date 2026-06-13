import React, { useEffect, useState } from 'react'
import { Building2, Globe, MapPin, Linkedin, Euro, CalendarDays, Users, StickyNote, MessageSquare, Send, Trash2 } from 'lucide-react'
import { useStore, fmtDate, PHASE_COLORS, OPP_COLORS } from '../store.jsx'
import { Modal, Field, Empty } from '../ui.jsx'

// Ouvre la fiche entreprise depuis n'importe quelle page (événement global).
export function openCompany(name) {
  if (!name) return
  window.dispatchEvent(new CustomEvent('open-company', { detail: name }))
}

// Fil de commentaires partagé : stocké au niveau de l'environnement, visible par tous ses membres.
function CommentThread({ name, store }) {
  const [text, setText] = useState('')
  const curSub = store.db.subenvs.find(s => s.id === store.session.subEnvId)
  const comments = store.companyComments(name)
  const teammates = store.db.subenvs.filter(s => s.envId === store.session.envId && s.id !== curSub?.id)

  // Met en évidence les @mentions dans le texte affiché
  const renderText = (t) => {
    const names = store.db.subenvs.filter(s => s.envId === store.session.envId).map(s => s.prenom)
    if (!names.length) return t
    const re = new RegExp(`(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'gi')
    return t.split(re).map((part, i) => part.startsWith('@')
      ? <span key={i} className="text-brand font-bold">{part}</span>
      : part)
  }
  const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const send = () => {
    if (!text.trim()) return
    store.addCompanyComment(name, text)
    store.logAction('Lead', 'Commentaire ajouté', name)
    setText('')
  }
  return (
    <div>
      <p className="label flex items-center gap-1.5"><MessageSquare size={13} /> Commentaires d'équipe ({comments.length}) <span className="normal-case font-normal">— visibles par toute l'organisation</span></p>
      <div className="space-y-1.5 mb-2">
        {comments.length === 0 && <p className="text-xs text-muted">Aucun commentaire. Soyez le premier à partager une info sur ce compte.</p>}
        {comments.map(c => (
          <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-surface text-sm">
            <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center shrink-0">
              {c.author.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs">{c.author}</span>
                <span className="text-[10px] text-muted">{fmtTs(c.ts)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{renderText(c.text)}</p>
            </div>
            {c.authorSubId === curSub?.id && (
              <button className="p-1 rounded hover:bg-card text-red-400" title="Supprimer mon commentaire"
                onClick={() => store.deleteCompanyComment(name, c.id)}><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input !py-1.5 text-sm" placeholder="Ajouter un commentaire... (@Prénom pour notifier un collègue)" value={text}
          onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        {teammates.length > 0 && (
          <select className="input !w-auto !py-1.5 text-xs" value="" title="Mentionner un collègue"
            onChange={e => { if (e.target.value) setText(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${e.target.value} `) }}>
            <option value="">@</option>
            {teammates.map(s => <option key={s.id} value={s.prenom}>@{s.prenom}</option>)}
          </select>
        )}
        <button className="btn-primary !px-2.5" onClick={send}><Send size={14} /></button>
      </div>
    </div>
  )
}

// Modale "Fiche entreprise" : tous les RDV, contacts et notes de la société + infos société éditables.
export default function CompanyModal() {
  const store = useStore()
  const [name, setName] = useState(null)

  useEffect(() => {
    const h = (e) => setName(e.detail)
    window.addEventListener('open-company', h)
    return () => window.removeEventListener('open-company', h)
  }, [])

  const sub = store.sub
  if (!name || !sub) return null

  const rdvs = sub.rdvs.filter(r => (r.entreprise || '').trim().toLowerCase() === name.trim().toLowerCase())
  const contacts = sub.contacts.filter(c => (c.entreprise || '').trim().toLowerCase() === name.trim().toLowerCase())
  const notes = sub.notes.filter(n => (n.content || '').toLowerCase().includes(name.toLowerCase()) || (n.title || '').toLowerCase().includes(name.toLowerCase()))
  const info = (sub.companies || {})[name] || {}
  const rep = rdvs[rdvs.length - 1]

  const setInfo = (k, v) => store.setSub(d => ({
    ...d,
    companies: { ...(d.companies || {}), [name]: { ...((d.companies || {})[name] || {}), [k]: v } },
  }))

  return (
    <Modal title={<span className="flex items-center gap-2"><Building2 size={18} className="text-brand" /> {name}</span>} onClose={() => setName(null)} wide>
      <div className="space-y-5">
        {/* Infos société (enrichissement manuel) */}
        <div className="rounded-xl bg-surface p-3">
          <p className="label">Infos société</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex items-center gap-1.5">
              <Euro size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="CA (ex : 5 M€)" value={info.ca || ''} onChange={e => setInfo('ca', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Globe size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Site web" value={info.site || ''} onChange={e => setInfo('site', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Linkedin size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="LinkedIn entreprise" value={info.linkedin || ''} onChange={e => setInfo('linkedin', e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-muted shrink-0" />
              <input className="input !py-1.5 text-xs" placeholder="Localisation" value={info.localisation || ''} onChange={e => setInfo('localisation', e.target.value)} />
            </div>
          </div>
          {rep && <div className="flex gap-2 mt-2 text-xs text-muted flex-wrap">
            {rep.effectif && <span>Effectif : <b>{rep.effectif}</b></span>}
            {rep.secteur && <span>Secteur : <b>{rep.secteur}</b></span>}
            {rep.source && <span>Source : <b>{rep.source}</b></span>}
            {rep.provenance && <span>Provenance : <b>{rep.provenance}</b></span>}
          </div>}
        </div>

        {/* RDV */}
        <div>
          <p className="label flex items-center gap-1.5"><CalendarDays size={13} /> Rendez-vous ({rdvs.length})</p>
          {rdvs.length === 0 ? <Empty text="Aucun rendez-vous." /> : (
            <div className="space-y-1.5">
              {rdvs.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-surface flex-wrap">
                  <span className={`chip ${PHASE_COLORS[r.phase] || 'bg-card'}`}>{r.phase}</span>
                  <span className={`chip ${OPP_COLORS[r.opportunite] || 'bg-card'}`}>{r.opportunite}</span>
                  <span className="text-muted text-xs">RDV : {fmtDate(r.dateRdv)} · pris le {fmtDate(r.datePriseRdv)}</span>
                  {r.notes && <span className="text-xs text-muted truncate max-w-[16rem]" title={r.notes}>📝 {r.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div>
          <p className="label flex items-center gap-1.5"><Users size={13} /> Contacts ({contacts.length})</p>
          {contacts.length === 0 ? <Empty text="Aucun contact." /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {contacts.map(c => (
                <div key={c.id} className="text-sm p-2 rounded-lg bg-surface">
                  <div className="font-semibold">{c.nom} <span className="text-muted text-xs font-normal">{c.poste}</span></div>
                  <div className="text-xs text-muted">{[c.email, c.tel].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commentaires partagés (visibles par toute l'organisation) */}
        <CommentThread name={name} store={store} />

        {/* Notes liées */}
        {notes.length > 0 && (
          <div>
            <p className="label flex items-center gap-1.5"><StickyNote size={13} /> Notes mentionnant l'entreprise ({notes.length})</p>
            <div className="space-y-1.5">
              {notes.map(n => (
                <div key={n.id} className="text-sm p-2 rounded-lg bg-surface">
                  <span className="font-semibold">{n.title}</span> <span className="text-xs text-muted">— {fmtDate(n.createdAt)}</span>
                  <p className="text-xs text-muted line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
