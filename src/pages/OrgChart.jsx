import React, { useState } from 'react'
import { Plus, X, Pencil, Check, Network, Users2 } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'

export default function OrgChart({ onOpenProfile }) {
  const store = useStore()
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const subs = store.db.subenvs.filter(s => s.envId === session.envId)
  const isManager = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(store.account.role)
  const services = store.envServices()
  const [editServices, setEditServices] = useState(false)
  const [newSvc, setNewSvc] = useState('')

  const accOf = (s) => store.db.accounts.find(a => a.id === s.ownerId)
  // Hiérarchie par manager : un espace est rattaché au manager (teamOf) de son propriétaire.
  const managerSubs = subs.filter(s => subs.some(x => accOf(x)?.teamOf === s.ownerId))
  const teamOfManager = (m) => subs.filter(s => accOf(s)?.teamOf === m.ownerId)
  const attached = new Set([...managerSubs.map(s => s.id), ...managerSubs.flatMap(m => teamOfManager(m).map(s => s.id))])
  const unattached = subs.filter(s => !attached.has(s.id))
  // Regroupe les personnes non rattachées par service (id), avec repli sur l'ancien libellé.
  const svcName = (s) => services.find(v => v.id === s.serviceId)?.name || s.service || 'Sans service'
  const groups = {}
  unattached.forEach(s => { const k = svcName(s); (groups[k] = groups[k] || []).push(s) })

  const addService = () => { if (newSvc.trim()) { store.addService(newSvc.trim()); setNewSvc(''); toast('Service ajouté') } }

  const PersonCard = ({ s, small }) => (
    <div className={`card p-4 text-center ${small ? 'w-40' : 'w-44'}`}>
      {s.photo
        ? <img src={s.photo} alt="" className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border-2 border-brand/30" />
        : <div className="w-14 h-14 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center mx-auto mb-2 text-lg">
            {(s.prenom?.[0] || '') + (s.nom?.[0] || '')}
          </div>}
      <div className="font-bold text-sm">{s.prenom} {s.nom}</div>
      <div className="text-xs text-muted">{s.poste}</div>
      {isManager && editServices && (
        <select className="input !py-1 text-xs mt-2" value={s.serviceId || ''} onChange={e => store.assignSubService(s.id, e.target.value || null)}>
          <option value="">— Sans service —</option>
          {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      {isManager && !editServices && (
        <button className="btn-ghost !py-1 text-xs mt-2 w-full justify-center" onClick={() => onOpenProfile(s)}>
          Afficher le profil
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Network size={20} className="text-brand" /> Organigramme — {env?.name}</h2>
        {isManager && (
          <button className={`btn-${editServices ? 'primary' : 'ghost'}`} onClick={() => setEditServices(v => !v)}>
            {editServices ? <><Check size={15} /> Terminer</> : <><Users2 size={15} /> Gérer les services</>}
          </button>
        )}
      </div>

      {isManager && editServices && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-bold flex items-center gap-1.5"><Users2 size={16} className="text-brand" /> Services de l'organigramme</div>
          <p className="text-xs text-muted">Créez des services et affectez chaque personne (menu sous sa carte). Les services servent aussi à sectoriser l'accès aux conversations.</p>
          <div className="flex gap-2 max-w-md">
            <input className="input flex-1" placeholder="Nom du service (ex : Sales, SDR, CSM…)" value={newSvc}
              onChange={e => setNewSvc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addService()} />
            <button className="btn-primary whitespace-nowrap" onClick={addService}><Plus size={15} /> Ajouter</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {services.map(v => <ServiceChip key={v.id} svc={v} store={store} />)}
            {services.length === 0 && <span className="text-xs text-muted italic">Aucun service pour l'instant.</span>}
          </div>
        </div>
      )}

      {subs.length === 0 && <Empty text="Aucun profil dans cet environnement." />}
      <div className="flex flex-col items-center gap-6">
        {env && (
          <div className="card px-6 py-3 text-center border-2 border-brand">
            {env.logo && <img src={env.logo} alt="" className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" />}
            <div className="font-extrabold">{env.name}</div>
          </div>
        )}
        {/* Équipes hiérarchiques : manager au-dessus, son équipe en dessous */}
        {managerSubs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-10 w-full">
            {managerSubs.map(m => (
              <div key={m.id} className="flex flex-col items-center gap-0">
                <PersonCard s={m} />
                <div className="w-px h-5 bg-line" />
                <div className="chip bg-brand/15 text-brand font-extrabold mb-3">Équipe de {m.prenom}</div>
                <div className="flex flex-wrap justify-center gap-3">
                  {teamOfManager(m).map(s => <PersonCard key={s.id} s={s} small />)}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Espaces sans rattachement : regroupés par service */}
        <div className="flex flex-wrap justify-center gap-8 w-full">
          {Object.entries(groups).map(([service, list]) => (
            <div key={service} className="flex flex-col items-center gap-3">
              <div className="chip bg-brand/15 text-brand !text-sm !px-4 !py-1.5 font-extrabold">{service}</div>
              <div className="w-px h-4 bg-line" />
              <div className="flex flex-wrap justify-center gap-3">
                {list.map(s => <PersonCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
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
