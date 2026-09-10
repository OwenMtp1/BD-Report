import React, { useState } from 'react'
import { Trash2, RotateCcw, Inbox, LifeBuoy, FolderKanban } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

const daysLeft = (deletedAt) => Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000))
const fmtTs = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function SupportTrash() {
  const store = useStore()
  const items = store.db.supportTrash || []
  const [confirm, setConfirm] = useState(null) // {kind:'all'} | {kind:'one', id}

  const restore = (id) => { store.restoreSupportItem(id); toast('Élément restauré') }
  const purge = () => {
    // Purger une livraison supprime aussi les comptes qui ne vivaient que chez elle : c'est
    // un geste de gestion de projet, et le store peut le refuser. On ne prétend pas l'avoir
    // fait quand il ne s'est rien passé.
    const done = confirm.kind === 'all' ? store.emptySupportTrash() : store.purgeSupportItem(confirm.id)
    toast(done === false ? "Vous n'avez pas le droit de supprimer une livraison définitivement." : 'Supprimé définitivement')
    setConfirm(null)
  }
  const purgeText = () => {
    if (confirm.kind === 'all') return 'Vider définitivement la corbeille support ? Les livraisons archivées seront supprimées sans retour, avec les comptes de leurs environnements.'
    const it = items.find(x => x.id === confirm.id)
    return it?.kind === 'project'
      ? 'Supprimer définitivement cette livraison ? L\'environnement, ses espaces, leurs données et les comptes de cet environnement seront supprimés sans retour possible.'
      : 'Supprimer définitivement cet élément ?'
  }

  // Une livraison archivée n'est pas une ligne de plus : c'est un environnement entier,
  // ses espaces et leurs données. On dit ce qui reviendrait, sinon « Restaurer » demande
  // un acte de foi.
  const label = (it) => {
    if (it.kind === 'request') return { icon: <Inbox size={15} className="text-brand" />, title: it.data.name || 'Demande', sub: it.data.email || '', tag: 'Demande' }
    if (it.kind === 'project') {
      const n = (it.data?.subenvs || []).length
      const env = it.data?.env?.name || ''
      return {
        icon: <FolderKanban size={15} className="text-brand" />,
        title: it.data?.project?.name || env || 'Livraison',
        sub: `${env ? env + ' · ' : ''}${n} ${n > 1 ? 'espaces' : 'espace'}${it.deletedBy ? ' · par ' + it.deletedBy : ''}${it.reason ? ' · ' + it.reason : ''}`,
        tag: 'Projet & environnement',
      }
    }
    return { icon: <LifeBuoy size={15} className="text-brand" />, title: it.data.category || 'Ticket', sub: it.data.userName || '', tag: 'Ticket' }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Trash2 size={20} className="text-brand" /> Corbeille support</h2>
        {items.length > 0 && <button className="btn-ghost text-xs text-red-500" onClick={() => setConfirm({ kind: 'all' })}>Vider la corbeille</button>}
      </div>
      <p className="text-xs text-muted -mt-2">Demandes, tickets et livraisons supprimés — restaurables pendant 30 jours, puis purgés automatiquement. Restaurer une livraison remet en place son environnement, ses espaces et leurs données.</p>

      {items.length === 0 ? <Empty text="La corbeille support est vide." /> : (
        <div className="space-y-2">
          {items.map(it => {
            const l = label(it)
            return (
              <div key={it.id} className="card p-3 flex items-center gap-3 flex-wrap">
                <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">{l.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{l.title} <span className="chip bg-surface text-muted ml-1">{l.tag}</span></div>
                  <div className="text-xs text-muted truncate">{l.sub} · supprimé le {fmtTs(it.deletedAt)}</div>
                </div>
                <span className="text-xs text-muted shrink-0">expire dans {daysLeft(it.deletedAt)} j</span>
                <button className="btn-ghost !py-1 text-xs" onClick={() => restore(it.id)}><RotateCcw size={12} /> Restaurer</button>
                <button className="btn-danger !py-1 text-xs" onClick={() => setConfirm({ kind: 'one', id: it.id })}><Trash2 size={12} /></button>
              </div>
            )
          })}
        </div>
      )}

      {confirm && <Confirm message={purgeText()} onYes={purge} onNo={() => setConfirm(null)} />}
    </div>
  )
}
