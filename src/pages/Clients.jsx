import React, { useState } from 'react'
import { Building2, Users2, MessageSquare, Clock, Trash2, X, Ban, Unlock, ShieldAlert } from 'lucide-react'
import { useStore, CLIENT_STATUSES, fmtDate } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

const fmtTs = (ts) => ts ? new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'

export default function Clients() {
  const store = useStore()
  const clients = store.db.clients || []
  const tickets = store.db.tickets || []
  const [dragId, setDragId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmEnv, setConfirmEnv] = useState(null) // { action:'block'|'delEnv', envId, name }

  const ticketsOf = (c) => tickets.filter(t => c.envId ? t.envId === c.envId : t.userAccountId === c.accountId)
  const stats = (c) => {
    const ts = ticketsOf(c)
    return { total: ts.length, open: ts.filter(t => t.status !== 'closed').length }
  }

  const drop = (status) => {
    if (!dragId) return
    const c = clients.find(x => x.id === dragId)
    if (c && c.status !== status) {
      store.setClientStatus(dragId, status)
      toast(`${c.name} → ${CLIENT_STATUSES.find(s => s.id === status)?.label}`)
    }
    setDragId(null)
  }
  const touchDrop = (e) => {
    if (!dragId) return
    const t = e.changedTouches?.[0]
    if (!t) { setDragId(null); return }
    const col = document.elementFromPoint(t.clientX, t.clientY)?.closest?.('[data-col]')
    if (col) drop(col.getAttribute('data-col')); else setDragId(null)
  }

  const remove = (id) => { store.deleteClient(id); setConfirmDel(null); setDetail(null); toast('Client retiré') }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold flex items-center gap-2"><Users2 size={20} className="text-brand" /> Clients</h2>
      <p className="text-xs text-muted -mt-2">Chaque client est enrichi automatiquement dès qu'une demande arrive au service technique. Glissez-déposez une carte pour la reclasser.</p>

      {clients.length === 0 ? (
        <Empty text="Aucun client pour le moment. Les clients apparaissent ici dès qu'un ticket de support est créé." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {CLIENT_STATUSES.map(col => {
            const cards = clients.filter(c => c.status === col.id)
            return (
              <div key={col.id} data-col={col.id} className="kanban-col flex-1 min-w-[220px] rounded-2xl bg-surface/80 border border-line p-2.5"
                onDragOver={e => e.preventDefault()} onDrop={() => drop(col.id)}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className={`chip ${col.color}`}>{col.label}</span>
                  <span className="text-xs font-bold text-muted">{cards.length}</span>
                </div>
                <div className="space-y-2 min-h-[6rem]">
                  {cards.length === 0 && <div className="text-xs text-muted text-center py-4">—</div>}
                  {cards.map(c => {
                    const s = stats(c)
                    return (
                      <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                        onTouchStart={() => setDragId(c.id)} onTouchEnd={touchDrop}
                        className={`card !rounded-xl p-3 cursor-grab active:cursor-grabbing touch-none ${dragId === c.id ? 'dragging' : ''}`}>
                        <button className="font-bold text-sm flex items-center gap-1.5 hover:text-brand text-left" onClick={() => setDetail(c)}>
                          <Building2 size={13} className="text-muted shrink-0" /> {c.name}
                        </button>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {c.blocked && <span className="chip bg-red-100 text-red-700 flex items-center gap-0.5"><ShieldAlert size={10} /> Bloqué</span>}
                          {s.open > 0 && <span className="chip bg-amber-100 text-amber-700 flex items-center gap-0.5"><MessageSquare size={10} /> {s.open} ouvert{s.open > 1 ? 's' : ''}</span>}
                          <span className="chip bg-surface text-muted">{s.total} ticket{s.total > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted mt-2"><Clock size={11} /> Activité : {fmtTs(c.lastActivity)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detail && (() => {
        const ts = ticketsOf(detail)
        const env = store.db.environments.find(e => e.id === detail.envId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && setDetail(null)}>
            <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto fade-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                <h3 className="font-bold text-lg flex items-center gap-2"><Building2 size={18} className="text-brand" /> {detail.name}</h3>
                <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => setDetail(null)}><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="label !mb-0">Statut :</span>
                  {CLIENT_STATUSES.map(s => (
                    <button key={s.id} className={`chip ${detail.status === s.id ? s.color : 'bg-surface text-muted'}`}
                      onClick={() => { store.setClientStatus(detail.id, s.id); setDetail({ ...detail, status: s.id }) }}>{s.label}</button>
                  ))}
                </div>
                <div>
                  <span className="label">Note interne</span>
                  <textarea className="input min-h-[70px]" value={detail.note || ''}
                    onChange={e => { setDetail({ ...detail, note: e.target.value }); store.updateClient(detail.id, { note: e.target.value }) }}
                    placeholder="Notes de l'équipe support sur ce client…" />
                </div>
                <div>
                  <span className="label">Tickets ({ts.length})</span>
                  {ts.length === 0 ? <p className="text-xs text-muted">Aucun ticket.</p> : (
                    <div className="space-y-1">
                      {ts.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-surface">
                          <span className="truncate">{t.category}</span>
                          <span className="text-xs text-muted shrink-0">{fmtDate(t.createdAt.slice(0, 10))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {env ? (
                  <div className="rounded-xl border border-line p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="label !mb-0">Environnement :</span>
                      {env.subState === 'blocked'
                        ? <span className="chip bg-red-100 text-red-700 flex items-center gap-1"><ShieldAlert size={11} /> Bloqué</span>
                        : env.subState === 'cancelling'
                          ? <span className="chip bg-amber-100 text-amber-700">Résiliation en cours</span>
                          : <span className="chip bg-emerald-100 text-emerald-700">Actif</span>}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {env.subState === 'active'
                        ? <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmEnv({ action: 'block', envId: env.id, name: env.name })}><Ban size={13} /> Bloquer le client</button>
                        : <button className="btn-ghost !py-1.5 text-xs text-emerald-600" onClick={() => { store.unblockEnv(env.id); toast('Environnement débloqué') }}><Unlock size={13} /> Débloquer</button>}
                      <button className="btn-danger !py-1.5 text-xs" onClick={() => setConfirmEnv({ action: 'delEnv', envId: env.id, name: env.name })}><Trash2 size={13} /> Supprimer l'environnement</button>
                    </div>
                    <p className="text-[11px] text-muted">Bloquer met l'accès du client en lecture seule (ex. impayé). Supprimer l'environnement efface ses données et le classe en « Anciens clients ».</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">Aucun environnement lié (client issu d'une demande directe).</p>
                )}
                <div className="flex justify-between pt-1">
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmDel(detail.id)}><Trash2 size={13} /> Retirer de la liste</button>
                  <button className="btn-ghost" onClick={() => setDetail(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {confirmDel && <Confirm message="Retirer ce client de la liste ? (ses tickets ne sont pas supprimés)" onYes={() => remove(confirmDel)} onNo={() => setConfirmDel(null)} />}
      {confirmEnv && (
        <Confirm
          yesLabel={confirmEnv.action === 'block' ? 'Bloquer' : 'Supprimer'}
          message={confirmEnv.action === 'block'
            ? `Bloquer l'environnement « ${confirmEnv.name} » ? Son accès passera en lecture seule.`
            : `Supprimer définitivement l'environnement « ${confirmEnv.name} » et toutes ses données ? Le client sera classé en « Anciens clients ».`}
          onYes={() => {
            if (confirmEnv.action === 'block') { store.blockEnv(confirmEnv.envId); toast('Client bloqué') }
            else { store.deleteClientEnv(confirmEnv.envId); toast('Environnement supprimé'); setDetail(null) }
            setConfirmEnv(null)
          }}
          onNo={() => setConfirmEnv(null)} />
      )}
    </div>
  )
}
