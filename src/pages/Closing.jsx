import React, { useMemo, useState } from 'react'
import { Handshake, Trophy, XCircle, ChevronRight, Wallet, Percent, AlertTriangle } from 'lucide-react'
import {
  useStore, fmtDate, fmtMoney, closingPhases, closingState, closingStats, dealAnnualValue,
  dealValueLabel, DEFAULT_CLOSING_LOST_REASONS,
} from '../store.jsx'
import { Modal, Empty, Select, toast } from '../ui.jsx'
import { openCompany } from './Company.jsx'

// « Closing » — module `closing`.
// Le pipeline AVAL, celui qui commence là où le travail du BDR s'arrête. C'est un axe séparé du
// pipeline de prospection, et volontairement : fusionner les deux obligerait chaque équipe à
// faire vivre les étapes de l'autre métier, et fausserait tous les entonnoirs existants.
// Une affaire n'y entre qu'une fois ACCEPTÉE — avant, elle n'appartient pas au closer.

function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-extrabold num ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  )
}

function DealCard({ e, store, onSettle, dealValue, draggable, onDragStart }) {
  const r = e.rdv
  const v = dealAnnualValue(r)
  return (
    <div draggable={draggable} onDragStart={onDragStart}
      className={`rounded-xl border border-line bg-card p-2.5 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <button className="font-bold text-sm hover:text-brand hover:underline text-left truncate max-w-full block"
        onClick={() => openCompany(r.entreprise)}>{r.entreprise || '— sans entreprise —'}</button>
      <div className="text-[11px] text-muted truncate">
        {e.sub.prenom} {e.sub.nom}
        {r.datePassageSQL ? ` · qualifié le ${fmtDate(r.datePassageSQL)}` : ''}
      </div>
      {dealValue && v > 0 && (
        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
          {fmtMoney(Number(r.montant), e.data?.currency)}{dealValueLabel(r)}
        </div>
      )}
      {e.state !== 'won' && e.state !== 'lost' && (
        <div className="flex gap-1 mt-2">
          <button className="btn-ghost !py-0.5 text-[11px] !text-emerald-600" onClick={() => onSettle(e, 'won')}>
            <Trophy size={11} /> Signée
          </button>
          <button className="btn-ghost !py-0.5 text-[11px] !text-red-600" onClick={() => onSettle(e, 'lost')}>
            <XCircle size={11} /> Perdue
          </button>
        </div>
      )}
      {e.state === 'lost' && r.closing?.lostReason && (
        <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">Motif : {r.closing.lostReason}</div>
      )}
    </div>
  )
}

export default function Closing() {
  const store = useStore()
  const sub = store.sub
  const [settle, setSettle] = useState(null)   // { entry, outcome }
  const [reason, setReason] = useState('')
  const [drag, setDrag] = useState(null)
  const deals = useMemo(() => store.envClosingDeals(), [store.db, store.session?.envId]) // eslint-disable-line
  if (!sub) return null

  const canClose = store.canClose()
  const dealValue = store.hasModule('dealValue')
  const phases = closingPhases(sub)
  const stats = closingStats(deals.map(e => e.rdv), sub)
  const reasons = sub.closingLostReasons?.length ? sub.closingLostReasons : DEFAULT_CLOSING_LOST_REASONS

  const byPhase = (p) => deals.filter(e => e.state === p)
  const won = deals.filter(e => e.state === 'won')
  const lost = deals.filter(e => e.state === 'lost')

  const drop = (phase) => {
    if (!drag || !canClose) return
    store.setClosingPhase(drag.subId, drag.rdv.id, phase)
    store.logAction('Closing', 'Affaire déplacée', `${drag.rdv.entreprise} → ${phase}`)
    setDrag(null)
  }

  const confirmSettle = () => {
    const { entry, outcome } = settle
    store.settleClosing(entry.subId, entry.rdv.id, outcome, outcome === 'lost' ? reason : '')
    store.logAction('Closing', outcome === 'won' ? 'Affaire signée' : 'Affaire perdue', entry.rdv.entreprise)
    toast(outcome === 'won' ? '🎉 Affaire signée' : 'Affaire enregistrée comme perdue')
    setSettle(null); setReason('')
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <Handshake size={20} className="text-brand" /> Closing
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Les affaires acceptées, de la découverte à la signature. C'est un pipeline distinct de celui
          de la prospection : le travail du closer ne se mesure pas aux mêmes étapes.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Affaires en cours" value={stats.open}
          hint={dealValue && stats.openValue ? `${fmtMoney(stats.openValue, sub.currency)} en jeu` : ''} />
        <Stat label="Signées" value={stats.won} tone="text-emerald-600"
          hint={dealValue && stats.wonValue ? fmtMoney(stats.wonValue, sub.currency) : ''} />
        <Stat label="Perdues" value={stats.lost} tone={stats.lost ? 'text-red-500' : ''} />
        <Stat label="Taux de closing" value={stats.rate === null ? '—' : stats.rate + ' %'}
          tone={stats.rate === null ? '' : stats.rate >= 30 ? 'text-emerald-600' : 'text-amber-600'}
          hint={stats.decided ? `sur ${stats.decided} affaire(s) tranchée(s)` : 'aucune affaire tranchée'} />
      </div>

      {!canClose && (
        <p className="text-[11px] text-muted">
          Vous suivez ce pipeline sans pouvoir le faire avancer : ce droit revient aux closers désignés
          et au manager de l'environnement.
        </p>
      )}

      {deals.length === 0 ? (
        <Empty text="Aucune affaire en closing. Une affaire y entre dès qu'un closer accepte le lead qualifié." />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
          {phases.map(p => {
            const list = byPhase(p)
            const val = list.reduce((a, e) => a + dealAnnualValue(e.rdv), 0)
            return (
              <div key={p} onDragOver={ev => ev.preventDefault()} onDrop={() => drop(p)}
                className={`rounded-xl border p-2 min-h-[10rem] ${drag ? 'border-brand bg-brand/5' : 'border-line bg-surface/40'}`}>
                <div className="flex items-center justify-between gap-1 mb-2 px-1">
                  <span className="text-xs font-bold truncate">{p}</span>
                  <span className="text-[11px] text-muted shrink-0">{list.length}</span>
                </div>
                {dealValue && val > 0 && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 px-1 mb-1.5">{fmtMoney(val, sub.currency)}</div>
                )}
                <div className="space-y-1.5">
                  {list.map(e => (
                    <DealCard key={e.subId + e.rdv.id} e={e} store={store} dealValue={dealValue}
                      draggable={canClose} onDragStart={() => setDrag(e)}
                      onSettle={(entry, outcome) => { setSettle({ entry, outcome }); setReason(reasons[0] || '') }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(won.length > 0 || lost.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-3">
            <div className="text-sm font-bold mb-2 flex items-center gap-2"><Trophy size={15} className="text-emerald-600" /> Signées ({won.length})</div>
            <div className="space-y-1.5">
              {won.slice(0, 8).map(e => (
                <div key={e.subId + e.rdv.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{e.rdv.entreprise}</span>
                  {dealValue && <span className="num text-emerald-600 shrink-0">{fmtMoney(dealAnnualValue(e.rdv), sub.currency)}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="card p-3">
            <div className="text-sm font-bold mb-2 flex items-center gap-2"><XCircle size={15} className="text-red-500" /> Perdues ({lost.length})</div>
            {/* Le motif de perte APRÈS acceptation ne dit pas la même chose qu'un lead refusé :
                là, le lead était bon et l'affaire s'est perdue au closing. */}
            <div className="space-y-1.5">
              {lost.slice(0, 8).map(e => (
                <div key={e.subId + e.rdv.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{e.rdv.entreprise}</span>
                  <span className="text-[11px] text-muted shrink-0">{e.rdv.closing?.lostReason || e.rdv.motifKo || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {settle && (
        <Modal title={settle.outcome === 'won' ? 'Enregistrer la signature' : "Enregistrer la perte"} onClose={() => setSettle(null)}>
          <p className="text-sm text-muted mb-3">
            {settle.entry.rdv.entreprise} — travaillée par {settle.entry.sub.prenom} {settle.entry.sub.nom}.
            {settle.outcome === 'won'
              ? " L'affaire passera en gagnée : elle comptera dans les entonnoirs et la prime du commercial."
              : " L'affaire passera en perdue. Le commercial qui l'a transmise en sera informé."}
          </p>
          {settle.outcome === 'lost' && (
            <>
              <Select value={reason} onChange={setReason} options={reasons} placeholder="Pourquoi l'affaire est-elle perdue ?" />
              <p className="text-[11px] text-muted mt-1.5">
                Ce motif-là n'est pas celui d'un lead refusé : le lead était bon, l'affaire s'est perdue au closing.
              </p>
            </>
          )}
          {settle.outcome === 'won' && !dealValue && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 mt-2 flex gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Le module « Montant des affaires » n'est pas installé : cette signature ne sera comptée qu'en nombre, pas en chiffre d'affaires.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setSettle(null)}>Annuler</button>
            <button className={settle.outcome === 'won' ? 'btn-primary' : 'btn-danger'}
              disabled={settle.outcome === 'lost' && !reason} onClick={confirmSettle}>
              {settle.outcome === 'won' ? 'Enregistrer la signature' : 'Enregistrer la perte'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
