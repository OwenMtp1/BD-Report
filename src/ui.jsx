import React, { useEffect, useRef, useState } from 'react'
import { X, Pencil, Trash2, Plus, ChevronDown, Mic, MicOff } from 'lucide-react'
import { TIMELINES } from './store.jsx'

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto fade-in`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-card z-10 rounded-t-2xl">
          <h3 className="font-bold text-lg">{title}</h3>
          <button className="p-1.5 rounded-lg hover:bg-surface" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Confirm({ message, onYes, onNo }) {
  return (
    <Modal title="Confirmation" onClose={onNo}>
      <p className="text-sm mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onNo}>Annuler</button>
        <button className="btn-danger" onClick={onYes}>Supprimer</button>
      </div>
    </Modal>
  )
}

export function Field({ label, children, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  )
}

// Menu déroulant simple
export function Select({ value, onChange, options, placeholder = '—', className = '' }) {
  return (
    <select className={`input ${className}`} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// Menu déroulant avec édition de la liste (petit crayon en haut du menu)
export function EditableSelect({ value, onChange, options, onOptionsChange, placeholder = '—', label = 'valeurs' }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newVal, setNewVal] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setEditing(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen(o => !o)}>
        <span className={value ? '' : 'text-muted'}>{value || placeholder}</span>
        <ChevronDown size={14} className="text-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full card p-1 max-h-72 overflow-y-auto shadow-lg">
          <div className="flex items-center justify-between px-2 py-1 border-b border-line mb-1">
            <span className="text-xs text-muted font-semibold">Choisir</span>
            <button type="button" title={`Modifier les ${label}`} className="p-1 rounded hover:bg-surface" onClick={() => setEditing(e => !e)}>
              <Pencil size={13} className="text-muted" />
            </button>
          </div>
          {options.map((o, i) => (
            <div key={o + i} className="flex items-center group">
              <button type="button" className="flex-1 text-left px-2 py-1.5 text-sm rounded-lg hover:bg-surface"
                onClick={() => { onChange(o); setOpen(false) }}>{o}</button>
              {editing && (
                <button type="button" className="p-1 opacity-60 hover:opacity-100" onClick={() => onOptionsChange(options.filter(x => x !== o))}>
                  <Trash2 size={13} className="text-red-500" />
                </button>
              )}
            </div>
          ))}
          {editing && (
            <div className="flex gap-1 p-1 border-t border-line mt-1">
              <input className="input !py-1 text-xs" placeholder="Nouvelle valeur" value={newVal} onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newVal.trim()) { onOptionsChange([...options, newVal.trim()]); setNewVal('') } }} />
              <button type="button" className="btn-primary !px-2 !py-1" onClick={() => { if (newVal.trim()) { onOptionsChange([...options, newVal.trim()]); setNewVal('') } }}>
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sélecteur de timeline avec date début / date fin pour "Date personnalisée"
export function TimelinePicker({ value, onChange, custom, onCustomChange, include = TIMELINES.map(t => t.id) }) {
  const opts = TIMELINES.filter(t => include.includes(t.id))
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select className="input !w-auto !py-1.5 text-xs font-semibold" value={value} onChange={e => onChange(e.target.value)}>
        {opts.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {value === 'custom' && (
        <div className="flex items-center gap-1">
          <input type="date" className="input !w-auto !py-1 text-xs" value={custom?.start || ''} onChange={e => onCustomChange({ ...custom, start: e.target.value })} />
          <span className="text-xs text-muted">→</span>
          <input type="date" className="input !w-auto !py-1 text-xs" value={custom?.end || ''} onChange={e => onCustomChange({ ...custom, end: e.target.value })} />
        </div>
      )}
    </div>
  )
}

// Bulle de statistique cliquable (drill-down "Détails")
export function StatBubble({ title, value, tone = 'blue', icon, onDetails, sub }) {
  const tones = {
    blue: 'bg-blue-500/15 text-blue-600 border-blue-300/50',
    red: 'bg-red-500/15 text-red-600 border-red-300/50',
    green: 'bg-emerald-500/15 text-emerald-600 border-emerald-300/50',
    yellow: 'bg-yellow-400/20 text-yellow-700 border-yellow-300/60',
    amber: 'bg-amber-500/15 text-amber-700 border-amber-300/50',
    gray: 'bg-gray-400/15 text-gray-600 border-gray-300/60',
    pink: 'bg-pink-500/15 text-pink-600 border-pink-300/50',
  }
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${tones[tone]} fade-in`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide opacity-80">{title}</span>
        {icon}
      </div>
      <button className="text-3xl font-extrabold text-left hover:underline decoration-2 underline-offset-4" onClick={onDetails} title="Voir le détail">
        {value}
      </button>
      {sub && <span className="text-xs opacity-75">{sub}</span>}
      {onDetails && <button className="text-xs font-semibold self-start mt-1 opacity-80 hover:opacity-100 underline" onClick={onDetails}>Détails →</button>}
    </div>
  )
}

// Jauge circulaire (performance) — rose par défaut
export function Gauge({ score, max = 10, label, color = '#ec4899' }) {
  const pct = Math.max(0, Math.min(1, score / max))
  const r = 42, c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
        <text x="55" y="52" textAnchor="middle" fontSize="20" fontWeight="800" fill="rgb(var(--ink))">{score.toFixed(1)}</text>
        <text x="55" y="68" textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">/ {max}</text>
      </svg>
      <span className="text-xs font-semibold text-muted text-center max-w-[10rem]">{label}</span>
    </div>
  )
}

export function Empty({ text }) {
  return <div className="text-center text-muted text-sm py-10">{text}</div>
}

// ---------------------------------------------------------------- Toasts de confirmation
export const toast = (msg) => window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }))

export function Toasts() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const h = (e) => {
      const id = Math.random().toString(36).slice(2)
      setItems(list => [...list, { id, msg: e.detail }])
      setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 2600)
    }
    window.addEventListener('app-toast', h)
    return () => window.removeEventListener('app-toast', h)
  }, [])
  if (!items.length) return null
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] space-y-2 pointer-events-none">
      {items.map(t => (
        <div key={t.id} className="fade-in bg-ink text-card text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <span className="text-emerald-400">✓</span> {t.msg}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Confettis (feature 24)
export const confetti = () => window.dispatchEvent(new CustomEvent('app-confetti'))
const CONFETTI_COLORS = ['#3B5BDB', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#A7F3D0', '#FBBF24']
export function Confetti() {
  const [bursts, setBursts] = useState([])
  useEffect(() => {
    const h = () => {
      const id = Math.random().toString(36).slice(2)
      const pieces = Array.from({ length: 90 }, (_, i) => ({
        i, left: Math.random() * 100, delay: Math.random() * 0.25,
        dur: 1.8 + Math.random() * 1.4, rot: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], size: 6 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 200,
      }))
      setBursts(b => [...b, { id, pieces }])
      setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 3400)
    }
    window.addEventListener('app-confetti', h)
    return () => window.removeEventListener('app-confetti', h)
  }, [])
  if (!bursts.length) return null
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none overflow-hidden">
      {bursts.map(burst => burst.pieces.map(p => (
        <span key={burst.id + p.i} className="confetti-piece" style={{
          left: `${p.left}%`, background: p.color, width: p.size, height: p.size * 0.5,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          '--rot': `${p.rot}deg`, '--drift': `${p.drift}px`,
        }} />
      )))}
    </div>
  )
}

// ---------------------------------------------------------------- Dictée vocale (feature 18)
export function DictateButton({ onText, className = '' }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const supported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const toggle = () => {
    if (!supported) { toast("La dictée vocale n'est pas disponible sur ce navigateur."); return }
    if (listening) { recRef.current?.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = (localStorage.getItem('bdr_lang') === 'en' ? 'en-US' : localStorage.getItem('bdr_lang') === 'es' ? 'es-ES' : 'fr-FR')
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      let txt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript
      if (txt.trim()) onText(txt.trim())
    }
    rec.onerror = () => { setListening(false); toast('Dictée interrompue.') }
    rec.onend = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }
  return (
    <button type="button" onClick={toggle} title={listening ? 'Arrêter la dictée' : 'Dicter une note vocale'}
      className={`btn ${listening ? 'bg-red-500 text-white animate-pulse' : 'btn-ghost'} !py-1.5 text-xs ${className}`}>
      {listening ? <MicOff size={14} /> : <Mic size={14} />}
      {listening ? 'Stop' : 'Dicter'}
    </button>
  )
}
