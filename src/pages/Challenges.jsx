import React, { useState } from 'react'
import { Swords, Plus, Trash2, Pencil, Trophy, X, Gift, CalendarRange } from 'lucide-react'
import {
  useStore, uid, todayISO, fmtDate, fmtMoney, QUOTA_METRICS, CHALLENGE_MODES, challengeIsActive,
} from '../store.jsx'
import { Modal, Field, Empty, Confirm, toast } from '../ui.jsx'

// Challenges d'équipe — module `challenges`.
// Un concours n'a de valeur que s'il a une fin. Deux formes seulement, parce qu'elles couvrent
// à peu près tout ce qu'une équipe commerciale organise : la course (le meilleur score gagne)
// et l'objectif (le premier à la cible). Le reste — points, malus, équipes — complique la règle
// sans rien ajouter à la motivation.

const showScore = (metric, v, currency) => (metric === 'primes' ? fmtMoney(v, currency) : String(v))
const metricLabel = (id) => (QUOTA_METRICS.find(m => m.id === id) || {}).label || id

const emptyChallenge = () => {
  const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  return { id: uid(), title: '', metric: 'sql', mode: 'course', target: 5, reward: '', start: todayISO(), end, createdAt: new Date().toISOString() }
}

// Tableau des scores d'un challenge, réutilisé par le bandeau et par la page.
export function ChallengeStandings({ ch, store, compact }) {
  const rows = store.challengeStandings(ch)
  const meId = store.session?.subEnvId
  const currency = store.sub?.currency || 'EUR'
  const best = rows[0]?.score || 0
  const shown = compact ? rows.slice(0, 3) : rows
  return (
    <div className="space-y-1.5">
      {shown.map((r, i) => {
        const reached = ch.mode === 'objectif' && r.score >= Number(ch.target || 0)
        const pct = ch.mode === 'objectif'
          ? (Number(ch.target) ? Math.min(100, (r.score / Number(ch.target)) * 100) : 0)
          : (best ? (r.score / best) * 100 : 0)
        return (
          <div key={r.sub.id} className={`flex items-center gap-2 text-sm ${r.sub.id === meId ? 'font-bold' : ''}`}>
            <span className="w-5 text-muted text-xs shrink-0">#{i + 1}</span>
            <span className="w-28 truncate shrink-0">{r.sub.prenom} {r.sub.nom}{r.sub.id === meId ? ' (moi)' : ''}</span>
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden min-w-[50px]">
              <div className={`h-full rounded-full ${reached ? 'bg-emerald-500' : i === 0 ? 'bg-amber-400' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 text-right shrink-0 tabular-nums">{showScore(ch.metric, r.score, currency)}</span>
          </div>
        )
      })}
      {compact && rows.length > 3 && <p className="text-[11px] text-muted">+ {rows.length - 3} autres participants</p>}
    </div>
  )
}

// Bandeau du tableau de bord : ce qui se joue en ce moment, refermable.
// Le rejet vit en sessionStorage, donc le challenge se rappelle à chaque nouvelle connexion —
// c'est un événement, pas une notification qu'on classe une fois pour toutes.
export function ChallengeBanner() {
  const store = useStore()
  const meId = store.session?.subEnvId
  const key = 'bdr_chal_hidden_' + (meId || 'x')
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || '[]') } catch (e) { return [] }
  })
  if (!store.hasModule('challenges')) return null
  const active = store.activeChallenges().filter(c => !hidden.includes(c.id))
  if (!active.length) return null
  const hide = (id) => {
    const next = [...hidden, id]
    setHidden(next)
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch (e) { /* navigation privée : le bandeau reviendra, tant pis */ }
  }
  return (
    <div className="space-y-2">
      {active.map(ch => (
        <div key={ch.id} className="card p-4 border-l-4 !border-l-amber-400 relative overflow-hidden">
          <button className="absolute top-2 right-2 p-1 rounded-lg hover:bg-surface text-muted" title="Masquer jusqu'à ma prochaine connexion" onClick={() => hide(ch.id)}>
            <X size={15} />
          </button>
          <div className="flex items-center gap-2 mb-1 pr-6 flex-wrap">
            <Swords size={17} className="text-amber-500 shrink-0" />
            <span className="font-extrabold">{ch.title || 'Challenge en cours'}</span>
            <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              jusqu'au {fmtDate(ch.end)}
            </span>
          </div>
          <p className="text-xs text-muted mb-3">
            {ch.mode === 'objectif'
              ? `Premier à ${showScore(ch.metric, ch.target, store.sub?.currency)} — ${metricLabel(ch.metric).toLowerCase()}.`
              : `Le meilleur score gagne — ${metricLabel(ch.metric).toLowerCase()}.`}
            {ch.reward ? ` À la clé : ${ch.reward}.` : ''}
          </p>
          <ChallengeStandings ch={ch} store={store} compact />
        </div>
      ))}
    </div>
  )
}

// Page de gestion : la liste des challenges, et leur création par le manager.
export default function Challenges() {
  const store = useStore()
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const canRun = store.canRunChallenges()
  const list = [...store.challenges()].sort((a, b) => (b.start || '').localeCompare(a.start || ''))
  const currency = store.sub?.currency || 'EUR'

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold flex items-center gap-2"><Swords size={17} className="text-amber-500" /> Challenges</h3>
          <p className="text-xs text-muted -mt-0.5">Un concours borné dans le temps, annoncé sur le tableau de bord de chacun tant qu'il dure.</p>
        </div>
        {canRun && <button className="btn-primary !py-1.5 text-xs" onClick={() => setEditing(emptyChallenge())}><Plus size={14} /> Lancer un challenge</button>}
      </div>

      {list.length === 0 && (
        <Empty text={canRun
          ? "Aucun challenge. Exemple : « le plus de leads qualifiés cette semaine »."
          : "Aucun challenge en cours pour le moment."} />
      )}

      <div className="space-y-3">
        {list.map(ch => {
          const active = challengeIsActive(ch)
          const done = ch.end < todayISO()
          const winner = done ? store.challengeStandings(ch)[0] : null
          return (
            <div key={ch.id} className={`rounded-xl border p-3 ${active ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-500/5 dark:border-amber-500/30' : 'border-line'}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <span className="font-bold text-sm flex-1 min-w-0">{ch.title || 'Challenge'}</span>
                {active
                  ? <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">en cours</span>
                  : done
                    ? <span className="chip bg-surface text-muted">terminé</span>
                    : <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">à venir</span>}
                {canRun && <>
                  <button className="btn-ghost !p-1" title="Modifier" onClick={() => setEditing({ ...ch })}><Pencil size={13} /></button>
                  <button className="btn-ghost !p-1 !text-red-500" title="Supprimer" onClick={() => setConfirmDel(ch.id)}><Trash2 size={13} /></button>
                </>}
              </div>
              <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><CalendarRange size={11} /> {fmtDate(ch.start)} → {fmtDate(ch.end)}</span>
                <span>{metricLabel(ch.metric)}</span>
                <span>{ch.mode === 'objectif' ? `objectif ${showScore(ch.metric, ch.target, currency)}` : 'meilleur score'}</span>
                {ch.reward && <span className="flex items-center gap-1"><Gift size={11} /> {ch.reward}</span>}
              </div>
              {done && winner && winner.score > 0 && (
                <p className="text-xs mt-2 flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Trophy size={13} /> <b>{winner.sub.prenom} {winner.sub.nom}</b> l'emporte avec {showScore(ch.metric, winner.score, currency)}.
                </p>
              )}
              <div className="mt-2.5"><ChallengeStandings ch={ch} store={store} /></div>
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal title={store.challenges().some(c => c.id === editing.id) ? 'Modifier le challenge' : 'Lancer un challenge'} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Intitulé" required>
              <input className="input" value={editing.title} placeholder="Ex. Sprint qualification de septembre"
                onChange={e => setEditing(x => ({ ...x, title: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Du"><input type="date" className="input" value={editing.start} onChange={e => setEditing(x => ({ ...x, start: e.target.value }))} /></Field>
              <Field label="Au"><input type="date" className="input" value={editing.end} onChange={e => setEditing(x => ({ ...x, end: e.target.value }))} /></Field>
            </div>
            <Field label="Ce qui est compté">
              <select className="input" value={editing.metric} onChange={e => setEditing(x => ({ ...x, metric: e.target.value }))}>
                {QUOTA_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Règle">
              <select className="input" value={editing.mode} onChange={e => setEditing(x => ({ ...x, mode: e.target.value }))}>
                {CHALLENGE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            {editing.mode === 'objectif' && (
              <Field label="Cible à atteindre">
                <input type="number" min="1" className="input !w-32" value={editing.target}
                  onChange={e => setEditing(x => ({ ...x, target: Number(e.target.value) || 0 }))} />
              </Field>
            )}
            <Field label="Récompense">
              <input className="input" value={editing.reward} placeholder="Ex. un déjeuner offert, un jour de congé…"
                onChange={e => setEditing(x => ({ ...x, reward: e.target.value }))} />
            </Field>
            {editing.end < editing.start && <p className="text-xs text-red-500">La date de fin précède la date de début.</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" disabled={!editing.title.trim() || editing.end < editing.start}
                onClick={() => {
                  store.saveChallenge(editing)
                  store.logAction('Challenge', 'Challenge enregistré', editing.title)
                  toast('Challenge enregistré — il apparaît sur le tableau de bord de l\'équipe')
                  setEditing(null)
                }}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message="Supprimer ce challenge et son classement ?" yesLabel="Supprimer"
          onYes={() => { store.deleteChallenge(confirmDel); setConfirmDel(null); toast('Challenge supprimé') }}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}
