import React, { useState } from 'react'
import { Plus, X, Pencil, Check, Network, Users2, Move, ShieldCheck, Crown } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'

export default function OrgChart({ onOpenProfile }) {
  const store = useStore()
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const subs = store.db.subenvs.filter(s => s.envId === session.envId)
  const role = store.account.role
  const canEdit = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(role)
  const canRole = ['Administrateur', 'Fondateur', 'Support BD Report'].includes(role) // staff/fondateur : gestion du rôle Manager
  const services = store.envServices()
  const [edit, setEdit] = useState(false)
  const [newSvc, setNewSvc] = useState('')
  const [dragId, setDragId] = useState(null)

  const accById = Object.fromEntries(store.db.accounts.map(a => [a.id, a]))
  const subByOwner = {}; subs.forEach(s => { if (!subByOwner[s.ownerId]) subByOwner[s.ownerId] = s })
  const parentSub = (s) => { const acc = accById[s.ownerId]; const p = acc?.teamOf ? accById[acc.teamOf] : null; return p ? subByOwner[p.id] : null }
  const childrenOf = (s) => subs.filter(x => parentSub(x) === s)
  const managerSubId = env?.createdBy ? subByOwner[env.createdBy]?.id : null
  // Racines : personnes sans rattachement dans cet environnement ; le manager principal en tête.
  let roots = subs.filter(s => !parentSub(s))
  roots = roots.sort((a, b) => (a.id === managerSubId ? -1 : b.id === managerSubId ? 1 : 0))

  const addService = () => { if (newSvc.trim()) { store.addService(newSvc.trim()); setNewSvc(''); toast('Service ajouté') } }
  const svcName = (s) => services.find(v => v.id === s.serviceId)?.name || s.service || ''

  const onDrop = (targetSubId) => {
    if (!dragId || dragId === targetSubId) { setDragId(null); return }
    store.setManagerOf(dragId, targetSubId)
    setDragId(null)
  }

  const PersonCard = ({ s, small, top }) => {
    const acc = accById[s.ownerId]
    const isMgr = acc?.role === 'Manager'
    const isPrincipal = s.id === managerSubId
    return (
      <div
        draggable={edit}
        onDragStart={edit ? (e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
        onDragOver={edit ? (e) => e.preventDefault() : undefined}
        onDrop={edit ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(s.id) } : undefined}
        className={`card p-3 text-center relative ${small ? 'w-44' : 'w-48'} ${edit ? 'cursor-move ring-1 ring-brand/20' : ''} ${dragId === s.id ? 'opacity-50' : ''}`}>
        {edit && <Move size={13} className="absolute top-2 left-2 text-muted" />}
        {isMgr && <span title="Manager" className="absolute top-2 right-2 text-amber-500"><Crown size={14} /></span>}
        {s.photo
          ? <img src={s.photo} alt="" className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border-2 border-brand/30" />
          : <div className="w-14 h-14 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center mx-auto mb-2 text-lg">{(s.prenom?.[0] || '') + (s.nom?.[0] || '')}</div>}
        <div className="font-bold text-sm">{s.prenom} {s.nom}{isPrincipal && <span className="ml-1 text-[10px] text-amber-600 font-normal">· resp.</span>}</div>
        <div className="text-xs text-muted">{s.poste}{svcName(s) ? ` · ${svcName(s)}` : ''}</div>

        {edit ? (
          <div className="mt-2 space-y-1.5 text-left">
            <label className="block text-[10px] font-semibold text-muted">Rattaché à
              <select className="input !py-1 text-xs mt-0.5" value={parentSub(s)?.id || ''} onChange={e => store.setManagerOf(s.id, e.target.value || null)}>
                <option value="">— Haut de l'organigramme —</option>
                {subs.filter(x => x.id !== s.id).map(x => <option key={x.id} value={x.id}>{x.prenom} {x.nom}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-semibold text-muted">Service
              <select className="input !py-1 text-xs mt-0.5" value={s.serviceId || ''} onChange={e => store.assignSubService(s.id, e.target.value || null)}>
                <option value="">— Sans service —</option>
                {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            {canRole && (
              <button onClick={() => store.setEmployeeRole(s.id, !isMgr)}
                className={`w-full text-xs rounded-lg py-1 flex items-center justify-center gap-1 ${isMgr ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15' : 'bg-surface text-muted hover:bg-brand/10'}`}>
                <ShieldCheck size={12} /> {isMgr ? 'Retirer le rôle manager' : 'Nommer manager'}
              </button>
            )}
          </div>
        ) : (
          canEdit && <button className="btn-ghost !py-1 text-xs mt-2 w-full justify-center" onClick={() => onOpenProfile(s)}>Afficher le profil</button>
        )}
      </div>
    )
  }

  // Nœud récursif (protection anti-cycle par ensemble visité).
  const Node = ({ s, visited }) => {
    if (visited.has(s.id)) return null
    const nv = new Set(visited); nv.add(s.id)
    const kids = childrenOf(s)
    return (
      <div className="flex flex-col items-center">
        <PersonCard s={s} small={visited.size > 0} />
        {kids.length > 0 && (
          <>
            <div className="w-px h-5 bg-line" />
            <div className="flex flex-wrap justify-center gap-4 pt-1 border-t-2 border-line/60 px-2">
              {kids.map(k => <Node key={k.id} s={k} visited={nv} />)}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Network size={20} className="text-brand" /> Organigramme — {env?.name}</h2>
        {canEdit && (
          <button className={`btn-${edit ? 'primary' : 'ghost'}`} onClick={() => setEdit(v => !v)}>
            {edit ? <><Check size={15} /> Terminer</> : <><Move size={15} /> Modifier l'organigramme</>}
          </button>
        )}
      </div>

      {edit && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-bold flex items-center gap-1.5"><Move size={16} className="text-brand" /> Réorganisation libre</div>
          <p className="text-xs text-muted">Glissez-déposez une personne sur une autre pour la rattacher, ou utilisez le menu « Rattaché à ». Déposez sur l'entête de l'entreprise pour la remonter en haut.{canRole ? ' Vous pouvez aussi nommer/retirer des managers.' : ''}</p>
          <div>
            <div className="text-xs font-semibold text-muted mb-1.5">Services de l'organigramme</div>
            <div className="flex gap-2 max-w-md">
              <input className="input flex-1" placeholder="Nom du service (ex : Sales, SDR, CSM…)" value={newSvc}
                onChange={e => setNewSvc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addService()} />
              <button className="btn-primary whitespace-nowrap" onClick={addService}><Plus size={15} /> Ajouter</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {services.map(v => <ServiceChip key={v.id} svc={v} store={store} />)}
              {services.length === 0 && <span className="text-xs text-muted italic">Aucun service pour l'instant.</span>}
            </div>
          </div>
        </div>
      )}

      {subs.length === 0 && <Empty text="Aucun profil dans cet environnement." />}
      <div className="flex flex-col items-center gap-6 overflow-x-auto pb-4">
        {env && (
          <div
            onDragOver={edit ? (e) => e.preventDefault() : undefined}
            onDrop={edit ? (e) => { e.preventDefault(); onDrop(null) } : undefined}
            className={`card px-6 py-3 text-center border-2 border-brand ${edit ? 'ring-2 ring-brand/10' : ''}`}>
            {env.logo && <img src={env.logo} alt="" className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" />}
            <div className="font-extrabold">{env.name}</div>
            {edit && <div className="text-[10px] text-muted mt-0.5">Déposez ici pour placer en haut</div>}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-8">
          {roots.map(s => <Node key={s.id} s={s} visited={new Set()} />)}
        </div>
      </div>
    </div>
  )
}

function ServiceChip({ svc, store }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(svc.name)
  if (editing) {
    return (
      <span className="chip bg-surface">
        <input className="bg-transparent outline-none text-sm w-24" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { store.renameService(svc.id, name); setEditing(false) } }} autoFocus />
        <button className="text-emerald-600" onClick={() => { store.renameService(svc.id, name); setEditing(false) }}><Check size={13} /></button>
      </span>
    )
  }
  return (
    <span className="chip bg-brand/10 text-brand">
      {svc.name}
      <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => setEditing(true)}><Pencil size={11} /></button>
      <button className="ml-0.5 text-red-500" onClick={() => store.removeService(svc.id)}><X size={12} /></button>
    </span>
  )
}
