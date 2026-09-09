import React, { useEffect, useRef, useState } from 'react'
import { Building2, Globe, MapPin, Linkedin, Euro, CalendarDays, Users, StickyNote, MessageSquare, Send, Trash2 } from 'lucide-react'
import { useStore, fmtDate, PHASE_COLORS, OPP_COLORS, phaseColor, oppColor } from '../store.jsx'
import { Modal, Field, Empty } from '../ui.jsx'

// Ouvre la fiche entreprise depuis n'importe quelle page (événement global).
export function openCompany(name) {
  if (!name) return
  window.dispatchEvent(new CustomEvent('open-company', { detail: name }))
}

// Fil de commentaires partagé : stocké au niveau de l'environnement, visible par tous ses membres.
function CommentThread({ name, store }) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState([])          // suggestions de mention ouvertes
  const [hi, setHi] = useState(0)               // suggestion surlignée
  const [mentioned, setMentioned] = useState([]) // subIds choisis dans la liste — cible exacte
  const inputRef = useRef(null)
  const curSub = store.db.subenvs.find(s => s.id === store.session.subEnvId)
  const comments = store.companyComments(name)
  const teammates = store.db.subenvs.filter(s => s.envId === store.session.envId && s.id !== curSub?.id)

  // Met en évidence les @mentions dans le texte affiché. On teste le nom complet AVANT le
  // prénom seul : sinon « @Lucas Fabre » ne serait surligné que sur la moitié du nom.
  const renderText = (t) => {
    const people = store.db.subenvs.filter(s => s.envId === store.session.envId)
    if (!people.length) return t
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const forms = [
      ...people.map(s => esc(`${s.prenom} ${s.nom}`.trim())),
      ...people.map(s => esc(s.prenom)),
    ].filter(Boolean)
    const re = new RegExp(`(@(?:${forms.join('|')}))`, 'gi')
    return t.split(re).map((part, i) => (part || '').startsWith('@')
      ? <span key={i} className="text-brand font-bold">{part}</span>
      : part)
  }

  // Autocomplétion : dès deux lettres après un @, on propose les collègues. Le choix
  // enregistre l'identifiant de la personne — c'est lui qui sert à notifier, jamais le
  // texte : deux Lucas dans une équipe et la notification partirait aux deux.
  const onType = (value, caret) => {
    setText(value)
    const before = value.slice(0, caret)
    const m = before.match(/@([\p{L}\p{N}\-'’ ]*)$/u)
    const token = m ? m[1] : null
    if (token == null || token.trim().length < 2) { setHits([]); return }
    const q = token.trim().toLowerCase()
    const found = teammates.filter(s =>
      `${s.prenom} ${s.nom}`.toLowerCase().includes(q) || (s.poste || '').toLowerCase().includes(q)).slice(0, 6)
    setHits(found); setHi(0)
  }
  const pick = (s) => {
    const el = inputRef.current
    const caret = el ? el.selectionStart : text.length
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}\-'’ ]*)$/u, '')
    const full = `${s.prenom} ${s.nom}`.trim()
    const next = `${before}@${full} ${text.slice(caret)}`
    setText(next)
    setMentioned(ids => (ids.includes(s.id) ? ids : [...ids, s.id]))
    setHits([])
    // Le curseur doit rester après la mention, sinon la frappe suivante repart du début.
    setTimeout(() => { if (el) { el.focus(); const p = before.length + full.length + 2; el.setSelectionRange(p, p) } }, 0)
  }
  const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const send = () => {
    if (!text.trim()) return
    // On ne transmet que les personnes encore citées dans le texte : effacer une mention
    // avant d'envoyer doit vraiment annuler la notification.
    const still = mentioned.filter(id => {
      const s = teammates.find(x => x.id === id)
      return s && text.toLowerCase().includes('@' + `${s.prenom} ${s.nom}`.trim().toLowerCase())
    })
    store.addCompanyComment(name, text, still)
    store.logAction('Lead', 'Commentaire ajouté', name)
    setText(''); setMentioned([]); setHits([])
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
      <div className="flex gap-2 relative">
        <div className="flex-1 relative">
          <input ref={inputRef} className="input !py-1.5 text-sm w-full"
            placeholder="Ajouter un commentaire… (tapez @ puis deux lettres pour citer un collègue)" value={text}
            onChange={e => onType(e.target.value, e.target.selectionStart)}
            onBlur={() => setTimeout(() => setHits([]), 150)}
            onKeyDown={e => {
              if (hits.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => (i + 1) % hits.length); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => (i - 1 + hits.length) % hits.length); return }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(hits[hi]); return }
                if (e.key === 'Escape') { setHits([]); return }
              }
              if (e.key === 'Enter') send()
            }} />
          {hits.length > 0 && (
            <div className="absolute z-40 left-0 right-0 bottom-full mb-1 card p-1 shadow-xl max-h-52 overflow-y-auto">
              {hits.map((s, i) => (
                <button key={s.id} type="button"
                  className={`w-full text-left p-2 rounded-lg ${i === hi ? 'bg-brand/10' : 'hover:bg-surface'}`}
                  onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}>
                  <div className="text-sm font-semibold">{s.prenom} {s.nom}</div>
                  <div className="text-[11px] text-muted truncate">{[s.poste, s.service].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn-primary !px-2.5" onClick={send}><Send size={14} /></button>
      </div>
      {mentioned.length > 0 && (
        <p className="text-[11px] text-muted mt-1">
          Sera notifié : {mentioned.map(id => teammates.find(s => s.id === id)).filter(Boolean).map(s => `${s.prenom} ${s.nom}`).join(', ')}
        </p>
      )}
    </div>
  )
}

// Modale "Fiche entreprise" : tous les RDV, contacts et notes de la société + infos société éditables.
export default function CompanyModal() {
  const store = useStore()
  const [name, setName] = useState(null)
  const prevHash = useRef(null) // hash de l'onglet avant ouverture, pour le restaurer à la fermeture

  useEffect(() => {
    const h = (e) => setName(e.detail)
    window.addEventListener('open-company', h)
    return () => window.removeEventListener('open-company', h)
  }, [])

  // URL partageable : la fiche ouverte se reflète dans #/company/<nom> ; à la fermeture,
  // on restaure l'onglet précédent (ou le tableau de bord si on venait d'un lien direct).
  useEffect(() => {
    if (name) {
      const target = '#/company/' + encodeURIComponent(name)
      if (prevHash.current === null && !window.location.hash.startsWith('#/company/')) {
        prevHash.current = window.location.hash || '#/dashboard'
      }
      if (window.location.hash !== target) window.location.hash = target
    } else if (window.location.hash.startsWith('#/company/')) {
      const restore = prevHash.current || '#/dashboard'
      prevHash.current = null
      window.location.hash = restore
    }
  }, [name])

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
                  <span className={`chip ${phaseColor(r.phase)}`}>{r.phase}</span>
                  <span className={`chip ${oppColor(r.opportunite)}`}>{r.opportunite}</span>
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
