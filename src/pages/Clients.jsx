import React, { useState } from 'react'
import { Building2, Users2, MessageSquare, Clock, Trash2, X, ShieldAlert } from 'lucide-react'
import { useStore, CLIENT_STATUSES, fmtDate } from '../store.jsx'
import { Empty, Confirm, toast, CommitTextarea } from '../ui.jsx'

const fmtTs = (ts) => ts ? new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'

export default function Clients() {
  const store = useStore()
  const all = store.db.clients || []
  const tickets = store.db.tickets || []
  const [dragId, setDragId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  // Les cartes nées d'une demande close sont rangées, pas supprimées : le tableau dit ce
  // qu'il reste à faire, et l'interrupteur rend l'historique quand on le cherche.
  const [showArchived, setShowArchived] = useState(false)
  const archivedCount = all.filter(c => c.archived).length
  const clients = showArchived ? all : all.filter(c => !c.archived)

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Users2 size={20} className="text-brand" /> Clients</h2>
        {archivedCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            <span>Demandes closes</span> <span className="chip bg-surface text-muted">{archivedCount}</span>
          </label>
        )}
      </div>
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
                          {c.archived && <span className="chip bg-surface text-muted">Demande close</span>}
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
                  <CommitTextarea className="input min-h-[70px]" value={detail.note || ''}
                    onCommit={v => { setDetail({ ...detail, note: v }); store.updateClient(detail.id, { note: v }) }}
                    placeholder="Notes de l'équipe support sur ce client…" />
                </div>
                {/* Motifs de clôture des projets : saisis à la fermeture, ils expliquent
                    ici pourquoi la relation s'est arrêtée. */}
                {(() => {
                  const closed = (store.db.projects || []).filter(p => p.status === 'termine'
                    && (p.clientName === detail.name || (p.envId && p.envId === detail.envId)))
                  if (!closed.length) return null
                  return (
                    <div>
                      <span className="label">Projets clôturés ({closed.length})</span>
                      <div className="space-y-1.5">
                        {closed.map(p => (
                          <div key={p.id} className="p-2 rounded-lg bg-surface">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{p.name}</span>
                              {p.closedAt && <span className="text-[11px] text-muted shrink-0">{fmtDate(p.closedAt.slice(0, 10))}</span>}
                            </div>
                            <p className="text-xs text-muted mt-0.5 whitespace-pre-wrap">
                              {p.closeReason || 'Aucun motif renseigné (projet clôturé avant que le motif ne soit obligatoire).'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
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
                {/* Bloquer un accès ou supprimer un environnement se fait désormais dans
                    Projets → Utilisateurs : les gestes qui touchent l'accès du client vivent
                    au même endroit que le reste de son administration, pas éparpillés. */}
                {env ? (
                  <div className="rounded-xl border border-line p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="label !mb-0">Environnement :</span>
                      {env.subState === 'blocked'
                        ? <span className="chip bg-red-100 text-red-700 flex items-center gap-1"><ShieldAlert size={11} /> Bloqué</span>
                        : env.subState === 'cancelling'
                          ? <span className="chip bg-amber-100 text-amber-700">Résiliation en cours</span>
                          : <span className="chip bg-emerald-100 text-emerald-700">Actif</span>}
                    </div>
                    <p className="text-[11px] text-muted">
                      Bloquer l'accès ou supprimer cet environnement se fait dans l'onglet
                      <b className="text-ink"> Projets </b>, bouton <b className="text-ink">Utilisateurs</b> du projet du client.
                    </p>
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

      {confirmDel && <Confirm yesLabel="Retirer" message="Retirer ce client de la liste ? (ses tickets ne sont pas supprimés)" onYes={() => remove(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}
