import React, { useState } from 'react'
import {
  GraduationCap, FolderKanban, LifeBuoy, MessagesSquare, Lightbulb, ArrowLeft, CheckSquare, Square,
} from 'lucide-react'
import { TRAINING_PROJECTS, TRAINING_TICKETS, TRAINING_THREAD, TRAINING_STATUS } from '../trainingContent.js'
import { TICKET_PRIORITIES } from '../store.jsx'

// Espace de formation du staff : des cas fictifs pour s'entraîner sans toucher aux
// données réelles. Rien n'est enregistré ni synchronisé — les cases cochées et les
// tickets ouverts ne vivent que le temps de la session, volontairement.

const prio = (id) => TICKET_PRIORITIES.find(p => p.id === id) || { label: id, color: 'bg-surface text-muted' }
const hoursAgo = (h) => new Date(Date.now() + h * 3600000)
const fmtWhen = (d) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Lesson({ text }) {
  return (
    <div className="rounded-xl bg-brand/5 border border-brand/20 p-2.5 flex gap-2">
      <Lightbulb size={15} className="text-brand shrink-0 mt-0.5" />
      <p className="text-xs text-muted"><b className="text-ink">À retenir :</b> {text}</p>
    </div>
  )
}

function Projects() {
  const [done, setDone] = useState({})
  const toggle = (pid, i) => setDone(d => ({ ...d, [`${pid}:${i}`]: !d[`${pid}:${i}`] }))
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted">
        Dix projets à différents stades. Ceux marqués « à paramétrer » attendent une mise en service :
        entraînez-vous à dérouler leur liste de tâches dans le bon ordre.
      </p>
      {TRAINING_PROJECTS.map(p => {
        const st = TRAINING_STATUS[p.status] || TRAINING_STATUS.encours
        return (
          <div key={p.id} className="card p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-muted">{p.client} · {p.seats} sièges · {p.owner === 'Non assigné' ? <span className="text-amber-600 font-semibold">non assigné</span> : p.owner}</div>
              </div>
              <span className={`chip ${st.color} shrink-0`}>{st.label}</span>
            </div>
            <p className="text-xs text-muted mt-1.5">{p.brief}</p>
            {p.closeReason && (
              <p className="text-xs text-muted italic mt-1">Motif de clôture : « {p.closeReason} »</p>
            )}
            {p.todo.length > 0 && (
              <div className="mt-2 space-y-1">
                {p.todo.map((t, i) => {
                  const ok = done[`${p.id}:${i}`]
                  return (
                    <button key={i} className="flex items-center gap-2 text-xs text-left w-full hover:text-brand"
                      onClick={() => toggle(p.id, i)}>
                      {ok ? <CheckSquare size={14} className="text-emerald-600 shrink-0" /> : <Square size={14} className="text-muted shrink-0" />}
                      <span className={ok ? 'line-through text-muted' : ''}>{t}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Tickets() {
  const [openId, setOpenId] = useState('')
  const t = TRAINING_TICKETS.find(x => x.id === openId)

  if (t) {
    return (
      <div className="space-y-3">
        <button className="btn-ghost text-xs" onClick={() => setOpenId('')}><ArrowLeft size={14} /> Retour aux cas</button>
        <div className="card p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-bold text-sm">{t.category}</div>
              <div className="text-xs text-muted">{t.client}</div>
            </div>
            <div className="flex gap-1.5">
              <span className={`chip ${prio(t.priority).color}`}>{prio(t.priority).label}</span>
              <span className={`chip ${t.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {t.status === 'closed' ? 'Clôturé' : 'Ouvert'}
              </span>
            </div>
          </div>
        </div>
        <div className="card p-3 space-y-2">
          {t.messages.map(([from, text], i) => (
            <div key={i} className={`max-w-[85%] p-2.5 rounded-xl text-sm ${from === 'support' ? 'ml-auto bg-brand text-white' : 'bg-surface'}`}>
              <div className={`text-[10px] mb-0.5 ${from === 'support' ? 'text-white/70' : 'text-muted'}`}>
                {from === 'support' ? 'Support BD Report' : t.client}
              </div>
              {text}
            </div>
          ))}
        </div>
        <Lesson text={t.lesson} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Douze cas couvrant tous les sujets qui arrivent au support. Ouvrez-en un, formulez votre réponse,
        puis comparez avec ce qu'il faut retenir.
      </p>
      {TRAINING_TICKETS.map(x => (
        <button key={x.id} className="card p-3 w-full text-left hover:bg-surface transition flex items-center gap-3"
          onClick={() => setOpenId(x.id)}>
          <LifeBuoy size={16} className="text-brand shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{x.category}</div>
            <div className="text-xs text-muted truncate">{x.client} — « {x.messages[0][1].slice(0, 70)}… »</div>
          </div>
          <span className={`chip ${prio(x.priority).color} shrink-0`}>{prio(x.priority).label}</span>
          {x.status === 'closed' && <span className="chip bg-emerald-100 text-emerald-700 shrink-0">clôturé</span>}
        </button>
      ))}
    </div>
  )
}

function Thread() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Une discussion de projet réelle dans son déroulé : un client qui pousse, des demandes de rôles que
        le produit ne sait pas satisfaire, et la façon de le dire sans promettre l'impossible.
      </p>
      <div className="card p-3">
        <div className="font-bold text-sm flex items-center gap-2 mb-2">
          <MessagesSquare size={16} className="text-brand" /> {TRAINING_THREAD.project}
        </div>
        <div className="space-y-2">
          {TRAINING_THREAD.messages.map(([who, h, text], i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center shrink-0">
                {who.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted">{who} · {fmtWhen(hoursAgo(h))}</div>
                <div className="text-sm">{text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Lesson text="Un besoin qui n'existe pas dans le produit se dit tout de suite. Le contourner par un montage fragile coûte plus cher au client qu'un « non » assorti d'une alternative." />
    </div>
  )
}

const TABS = [
  { id: 'projects', label: 'Projets', icon: FolderKanban, El: Projects },
  { id: 'tickets', label: 'Cas de support', icon: LifeBuoy, El: Tickets },
  { id: 'thread', label: 'Discussion de projet', icon: MessagesSquare, El: Thread },
]

export default function StaffTraining() {
  const [tab, setTab] = useState('projects')
  const Current = TABS.find(t => t.id === tab)?.El || Projects
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <GraduationCap size={20} className="text-brand" /> Formation staff
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Un espace d'entraînement rempli de cas fictifs. Rien n'est enregistré et aucune donnée réelle
          n'est touchée : vous pouvez vous tromper autant que nécessaire.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-surface'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <Current />
    </div>
  )
}
