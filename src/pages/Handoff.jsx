import React, { useMemo, useState } from 'react'
import { ArrowRightLeft, Check, X, Clock, UserCheck, AlertTriangle } from 'lucide-react'
import {
  useStore, fmtDate, handoffState, handoffStats, handoffPhases, milestonePhase,
  HANDOFF_STATES, DEFAULT_HANDOFF_REASONS,
} from '../store.jsx'
import { Modal, Empty, Select, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'

// « Passation au closer » — le lead qualifié change de mains. Tant que personne ne l'accepte,
// il n'est ni un succès ni un échec : c'est un dossier remis, en attente d'un avis.
// Deux lectures cohabitent sur la même donnée :
//   · « Mes leads »     — ce que j'ai transmis, et ce qu'on m'en a dit ;
//   · « À traiter »     — ce qu'on m'a transmis (ou, pour un encadrant, tout ce qui traîne).
// Le taux d'acceptation n'inclut jamais les dossiers en attente : un lead non traité ne dit
// rien de la qualité du travail de celui qui l'a transmis.

const Chip = ({ state }) => {
  const meta = HANDOFF_STATES[state] || HANDOFF_STATES.pending
  return <span className={`chip ${meta.chip}`}>{meta.label}</span>
}

function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-extrabold num ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  )
}

function DecideModal({ entry, store, onClose }) {
  const data = store.db.data[entry.subId] || {}
  const reasons = data.handoffReasons?.length ? data.handoffReasons : DEFAULT_HANDOFF_REASONS
  const [reason, setReason] = useState(reasons[0] || '')
  const [free, setFree] = useState('')
  return (
    <Modal title={`Refuser ${entry.rdv.entreprise || 'ce lead'}`} onClose={onClose}>
      <p className="text-sm text-muted mb-3">
        Le motif revient au commercial qui a transmis le dossier : c'est ce qui lui permet de
        corriger son ciblage plutôt que de recommencer la même erreur.
      </p>
      <Select value={reason} onChange={setReason} options={reasons} placeholder="Motif du refus" />
      <textarea className="input min-h-[80px] mt-2" placeholder="Précision (facultatif)…"
        value={free} onChange={e => setFree(e.target.value)} />
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-danger" disabled={!reason}
          onClick={() => {
            store.decideHandoff(entry.subId, entry.rdv.id, 'refused', [reason, free.trim()].filter(Boolean).join(' — '))
            toast('Lead refusé — le commercial est prévenu')
            onClose()
          }}>Refuser le lead</button>
      </div>
    </Modal>
  )
}

function Line({ e, store, mine, canDecide, closers, onRefuse, members }) {
  const decided = e.state !== 'pending'
  // À qui revient la prime. Par défaut à celui qui a demandé la passation — c'est-à-dire
  // l'espace qui porte l'affaire — et le champ reste vide dans ce cas : une valeur vide se
  // lit « la règle s'applique », ce qui reste vrai si le dossier change de mains.
  const beneficiary = e.rdv.primeTo || e.subId
  return (
    <div className="rounded-xl border border-line p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <button className="font-bold text-sm hover:text-brand hover:underline text-left truncate max-w-full"
          onClick={() => openCompany(e.rdv.entreprise)}>{e.rdv.entreprise || '— sans entreprise —'}</button>
        <div className="text-[11px] text-muted">
          {mine ? '' : `${e.sub.prenom} ${e.sub.nom} · `}
          {e.rdv.phase} · qualifié le {fmtDate(e.rdv.datePassageSQL || e.rdv.datePriseRdv)}
          {e.handoff?.decidedBy ? ` · par ${e.handoff.decidedBy}` : ''}
        </div>
        {e.state === 'refused' && e.handoff?.reason && (
          <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">Motif : {e.handoff.reason}</div>
        )}
      </div>
      <Chip state={e.state} />
      {/* Désigner un closer reste facultatif : sans destinataire la file est commune, ce qui
          convient aux équipes où le premier disponible prend le dossier. */}
      {canDecide && !decided && closers.length > 0 && (
        <select className="input !w-auto !py-1 text-xs" value={e.handoff?.to || ''}
          onChange={ev => { store.assignHandoff(e.subId, e.rdv.id, ev.target.value); toast('Dossier attribué') }}>
          <option value="">Non attribué</option>
          {closers.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
      )}
      {canDecide && !decided && (
        <div className="flex gap-1.5">
          <button className="btn-ghost !py-1 text-xs !text-emerald-600"
            onClick={() => { store.decideHandoff(e.subId, e.rdv.id, 'accepted'); toast('Lead accepté') }}>
            <Check size={13} /> Accepter
          </button>
          <button className="btn-ghost !py-1 text-xs !text-red-600" onClick={() => onRefuse(e)}>
            <X size={13} /> Refuser
          </button>
        </div>
      )}
      {canDecide && decided && (
        <button className="btn-ghost !py-1 text-xs" title="Remettre le dossier en attente"
          onClick={() => { store.decideHandoff(e.subId, e.rdv.id, 'pending'); toast('Dossier remis en attente') }}>
          Rouvrir
        </button>
      )}
      {/* Bénéficiaire de la prime. Presque toujours le demandeur : c'est la valeur par défaut,
          et l'écran le dit plutôt que de la laisser deviner. Le changer sert aux cas réels —
          lead sourcé par un collègue, affaire reprise en route, binôme convenu — qui se
          réglaient jusqu'ici à la main, hors de l'outil et donc sans trace. */}
      {canDecide && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted w-full sm:w-auto">
          <span>Prime pour</span>
          <select className="input !w-auto !py-1 text-xs" value={beneficiary}
            onChange={ev => { store.setPrimeBeneficiary(e.subId, e.rdv.id, ev.target.value); toast('Bénéficiaire de la prime modifié') }}>
            {(members || []).map(m => (
              <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

export default function Handoff() {
  const store = useStore()
  const sub = store.sub
  const mySubId = store.session?.subEnvId
  const [tab, setTab] = useState('todo')
  const [refuseFor, setRefuseFor] = useState(null)
  // ⚠️ Tous les hooks AVANT le moindre retour conditionnel : un espace qui se charge après
  // coup ferait sinon varier l'ordre des hooks d'un rendu à l'autre, et React casse.
  const all = useMemo(() => store.envHandoffs(), [store.db, store.session?.envId]) // eslint-disable-line
  if (!sub) return null

  // Encadrer donne la vue d'ensemble. Trancher est un autre droit : le manager close tout,
  // y compris ses propres dossiers — refuser cela bloquerait une équipe où il vend aussi.
  const supervises = store.hasClientPerm('team.view') || store.hasClientPerm('team.manage')
  const canClose = store.canClose()
  const mine = all.filter(e => e.subId === mySubId)
  // File de traitement : tout ce qui attend un verdict quand on a le droit de le rendre.
  // Les dossiers qui nous sont nommément attribués passent devant.
  const todo = canClose
    ? [...all].sort((a, b) => (b.handoff?.to === mySubId ? 1 : 0) - (a.handoff?.to === mySubId ? 1 : 0))
    : all.filter(e => e.subId !== mySubId && e.handoff?.to === mySubId)
  // Tous les espaces de l'environnement : `closers` est une liste filtrée, mais une prime
  // peut revenir à n'importe qui — y compris à quelqu'un qui ne close pas.
  const members = store.db.subenvs.filter(s => s.envId === store.session?.envId)
  const closers = store.db.subenvs.filter(s => s.envId === store.session?.envId)

  const stats = handoffStats(sub.rdvs || [], sub)
  const teamStats = handoffStats(all.map(e => e.rdv), sub)
  const list = tab === 'todo' ? todo : mine
  const phases = handoffPhases(sub)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <ArrowRightLeft size={20} className="text-brand" /> Passation au closer
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Un lead qui atteint {phases.length > 1 ? 'une de ces étapes' : `l'étape « ${phases[0] || milestonePhase(sub)} »`} change de mains.
          Le closer l'accepte, ou le refuse avec un motif — c'est ce verdict, et non le simple passage d'étape,
          qui dit si le lead était bon.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Mes leads transmis" value={stats.pending + stats.decided} hint={`${stats.pending} en attente`} />
        <Stat label="Acceptés" value={stats.accepted} tone="text-emerald-600" />
        <Stat label="Refusés" value={stats.refused} tone={stats.refused ? 'text-red-500' : ''} />
        <Stat label="Mon taux d'acceptation" tone={stats.rate === null ? '' : stats.rate >= 70 ? 'text-emerald-600' : 'text-amber-600'}
          value={stats.rate === null ? '—' : stats.rate + ' %'}
          hint={stats.decided ? `sur ${stats.decided} dossier(s) tranché(s)` : 'aucun dossier tranché'} />
      </div>

      {supervises && (
        <div className="card p-3 flex items-center gap-3 flex-wrap text-sm">
          <UserCheck size={16} className="text-brand" />
          <span className="font-semibold">Équipe :</span>
          <span className="text-muted">
            {teamStats.pending} en attente · {teamStats.accepted} acceptés · {teamStats.refused} refusés
            {teamStats.rate !== null && <> · taux d'acceptation <b className="text-ink">{teamStats.rate} %</b></>}
          </span>
        </div>
      )}

      {sub.primeOnAccept && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 flex gap-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Votre écosystème paie les primes <b>à l'acceptation</b> : un lead en attente ou refusé ne génère aucun montant.
          </p>
        </div>
      )}

      {!canClose && (
        <p className="text-[11px] text-muted">
          Vous ne tranchez pas les passations : ce droit revient au manager de l'environnement, à
          son propriétaire s'il n'y a pas de manager, ou aux personnes que l'équipe BD Report a désignées.
        </p>
      )}

      <div className="flex rounded-lg border border-line overflow-hidden w-fit">
        {[['todo', `À traiter (${todo.filter(e => e.state === 'pending').length})`], ['mine', `Mes leads (${mine.length})`]].map(([id, label]) => (
          <button key={id} className={`px-3 py-1.5 text-xs font-semibold ${tab === id ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="space-y-2">
        {list.length === 0 && (
          <Empty text={tab === 'todo'
            ? (canClose ? "Aucun dossier n'attend de verdict." : "Aucun dossier ne vous est remis pour l'instant.")
            : "Aucun de vos leads n'a encore atteint l'étape de passation."} />
        )}
        {list.map(e => (
          <Line key={e.subId + e.rdv.id} e={e} store={store} mine={tab === 'mine' && e.subId === mySubId}
            canDecide={canClose} closers={closers} members={members} onRefuse={setRefuseFor} />
        ))}
      </div>

      {list.some(e => e.state === 'pending') && tab === 'mine' && (
        <p className="text-[11px] text-muted flex items-center gap-1.5"><Clock size={12} /> Un dossier en attente n'entre dans aucun taux : il n'est ni accepté ni refusé.</p>
      )}

      {refuseFor && <DecideModal entry={refuseFor} store={store} onClose={() => setRefuseFor(null)} />}
    </div>
  )
}
