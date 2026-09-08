import React, { useState } from 'react'
import { Network, Plus, Pencil, Trash2, Check, X, GripVertical, Crown, Users } from 'lucide-react'
import { useStore, isClientRole, roleColor } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

// Organigramme de l'équipe BD Report. Il ne traite que du rattachement et des services :
// les droits, eux, se règlent dans l'onglet « Permissions staff », pour qu'il n'existe
// qu'un seul endroit où l'on donne ou retire un accès.
const ROLE_TINT = {
  'Fondateur': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Support BD Report': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Administrateur': 'bg-blue-100 text-blue-700 dark:bg-blue-500/15',
  'Développeur': 'bg-slate-200 text-slate-700 dark:bg-slate-500/20',
}

function Card({ acc, store, roles, services, dragId, setDragId, depth }) {
  const role = roles.find(r => (r.roleKey || r.name) === acc.role)
  const tint = roleColor(role?.color).tint || ROLE_TINT[acc.role] || 'bg-brand/10 text-brand'
  const children = store.db.accounts.filter(a => a.teamOf === acc.id && !isClientRole(a.role))
  const isDragging = dragId === acc.id

  const drop = () => {
    if (!dragId || dragId === acc.id) return
    store.setStaffManager(dragId, acc.id)
    setDragId(null)
    toast('Rattachement mis à jour')
  }

  return (
    <div className={depth ? 'ml-5 pl-4 border-l border-line' : ''}>
      <div
        draggable onDragStart={() => setDragId(acc.id)} onDragEnd={() => setDragId(null)}
        onDragOver={e => e.preventDefault()} onDrop={drop}
        className={`card p-2.5 mb-1.5 flex items-center gap-2 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}>
        <GripVertical size={14} className="text-muted shrink-0" />
        <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-[11px] font-extrabold flex items-center justify-center shrink-0">
          {(acc.pseudo || acc.email || '?').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate flex items-center gap-1.5">
            {acc.role === 'Fondateur' && <Crown size={12} className="text-amber-500 shrink-0" />}
            {acc.pseudo || acc.email}
          </div>
          <div className="text-[11px] text-muted truncate">{acc.email}</div>
        </div>
        <span className={`chip ${tint} !text-[10px] shrink-0`}>{acc.role}</span>
        <select className="input !w-auto !py-1 !text-[11px] shrink-0" value={acc.staffServiceId || ''}
          onChange={e => { store.assignStaffService(acc.id, e.target.value); toast('Service mis à jour') }}>
          <option value="">Sans service</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {children.map(c => (
        <Card key={c.id} acc={c} store={store} roles={roles} services={services}
          dragId={dragId} setDragId={setDragId} depth={depth + 1} />
      ))}
    </div>
  )
}

function ServiceChip({ svc, store }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(svc.name)
  const [confirmDel, setConfirmDel] = useState(false)
  if (editing) {
    return (
      <span className="chip bg-surface flex items-center gap-1">
        <input className="input !py-0.5 !px-1.5 !w-28 text-xs" value={name} autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { store.renameService(svc.id, name, 'staff'); setEditing(false) } }} />
        <button className="text-emerald-600" onClick={() => { store.renameService(svc.id, name, 'staff'); setEditing(false); toast('Service renommé') }}><Check size={12} /></button>
        <button className="text-muted" onClick={() => { setName(svc.name); setEditing(false) }}><X size={12} /></button>
      </span>
    )
  }
  return (
    <span className="chip bg-surface text-ink flex items-center gap-1.5">
      {svc.name}
      <button className="opacity-60 hover:opacity-100" title="Renommer" onClick={() => setEditing(true)}><Pencil size={11} /></button>
      <button className="opacity-60 hover:opacity-100 text-red-500" title="Supprimer" onClick={() => setConfirmDel(true)}><Trash2 size={11} /></button>
      {confirmDel && (
        <Confirm message={`Supprimer le service « ${svc.name} » ? Les personnes qui y sont rattachées n'auront plus de service.`}
          onYes={() => { store.removeService(svc.id, 'staff'); setConfirmDel(false); toast('Service supprimé') }}
          onNo={() => setConfirmDel(false)} />
      )}
    </span>
  )
}

export default function StaffOrgChart() {
  const store = useStore()
  const [dragId, setDragId] = useState(null)
  const [newSvc, setNewSvc] = useState('')
  const services = store.staffServices()
  const roles = store.staffRoles()

  // L'organigramme ne montre que l'équipe BD Report : Manager et Membre appartiennent
  // aux environnements clients et relèvent de leur propre organigramme.
  const staff = store.db.accounts.filter(a => !isClientRole(a.role))
  const ids = new Set(staff.map(a => a.id))
  // Racine : ceux qui ne dépendent de personne, ou dont le responsable n'est pas du staff.
  const roots = staff.filter(a => !a.teamOf || !ids.has(a.teamOf))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <Network size={20} className="text-brand" /> Organigramme du staff
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Glissez une personne sur une autre pour la lui rattacher. Les droits ne se règlent pas ici,
          mais dans l'onglet « Permissions staff » — un seul endroit pour donner ou retirer un accès.
        </p>
      </div>

      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2"><Users size={15} className="text-brand" /><h3 className="font-bold text-sm">Services du staff</h3></div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {services.map(s => <ServiceChip key={s.id} svc={s} store={store} />)}
          {services.length === 0 && <span className="text-xs text-muted italic">Aucun service pour l'instant.</span>}
        </div>
        <div className="flex gap-2">
          <input className="input !py-1.5 text-sm" placeholder="Nom d'un nouveau service…" value={newSvc}
            onChange={e => setNewSvc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newSvc.trim()) { store.addService(newSvc, 'staff'); setNewSvc(''); toast('Service créé') } }} />
          <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!newSvc.trim()}
            onClick={() => { store.addService(newSvc, 'staff'); setNewSvc(''); toast('Service créé') }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* Zone de détachement : on ne peut sortir quelqu'un de la hiérarchie qu'en ayant
          une cible explicite, sinon un glissement raté le laisserait rattaché. */}
      <div onDragOver={e => e.preventDefault()}
        onDrop={() => { if (dragId) { store.setStaffManager(dragId, null); setDragId(null); toast('Détaché de son responsable') } }}
        className={`rounded-xl border border-dashed p-2.5 text-center text-xs ${dragId ? 'border-brand text-brand bg-brand/5' : 'border-line text-muted'}`}>
        Déposer ici pour détacher de tout responsable
      </div>

      {staff.length === 0 ? (
        <Empty text="Aucun membre du staff pour l'instant." />
      ) : (
        <div>
          {roots.map(a => (
            <Card key={a.id} acc={a} store={store} roles={roles} services={services}
              dragId={dragId} setDragId={setDragId} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}
