import React, { useState } from 'react'
import {
  Network, ArrowLeft, Plus, Pencil, Trash2, Check, X, GripVertical, Users, ShieldCheck, Save,
} from 'lucide-react'
import {
  useStore, uid, CLIENT_PERMISSION_GROUPS, ROLE_COLORS, roleColor,
} from '../store.jsx'
import { GRANTABLE_TABS } from '../nav.jsx'
import { Empty, Confirm, Modal, toast } from '../ui.jsx'

// Organigramme d'un projet client, vu depuis le back-office. Deux volets : l'organisation
// des personnes, et les rôles de l'environnement — qui voit quels onglets, et qui a quels
// droits de management. Les modifications de rôles restent en brouillon jusqu'à un
// enregistrement explicite : elles changent ce que des gens voient au quotidien.

function PersonCard({ sub, store, envId, subs, services, roles, dragId, setDragId, depth }) {
  const accById = Object.fromEntries(store.db.accounts.map(a => [a.id, a]))
  const subByOwner = Object.fromEntries(subs.filter(s => s.ownerId).map(s => [s.ownerId, s]))
  const children = subs.filter(s => {
    const acc = accById[s.ownerId]
    return acc?.teamOf && subByOwner[acc.teamOf]?.id === sub.id
  })
  const role = roles.find(r => r.id === sub.roleId)
  const tint = roleColor(role?.color).tint || 'bg-brand/10 text-brand'

  return (
    <div className={depth ? 'ml-5 pl-4 border-l border-line' : ''}>
      <div
        draggable onDragStart={() => setDragId(sub.id)} onDragEnd={() => setDragId(null)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => {
          if (!dragId || dragId === sub.id) return
          store.setSubManager(dragId, sub.id); setDragId(null); toast('Rattachement mis à jour')
        }}
        className={`card p-2.5 mb-1.5 flex items-center gap-2 flex-wrap cursor-grab active:cursor-grabbing ${dragId === sub.id ? 'opacity-40' : ''}`}>
        <GripVertical size={14} className="text-muted shrink-0" />
        <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-[11px] font-extrabold flex items-center justify-center shrink-0">
          {`${sub.prenom || ''}${sub.nom || ''}`.slice(0, 2).toUpperCase() || '??'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{sub.prenom} {sub.nom}</div>
          <div className="text-[11px] text-muted truncate">{sub.poste || '—'}</div>
        </div>
        {role && <span className={`chip ${tint} !text-[10px] shrink-0`}>{role.name}</span>}
        <select className="input !w-auto !py-1 !text-[11px] shrink-0" value={sub.roleId || ''}
          onChange={e => { store.assignSubRole(sub.id, e.target.value); toast('Rôle attribué') }}>
          <option value="">Sans rôle</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="input !w-auto !py-1 !text-[11px] shrink-0" value={sub.serviceId || ''}
          onChange={e => { store.assignSubService(sub.id, e.target.value); toast('Service mis à jour') }}>
          <option value="">Sans service</option>
          {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      {children.map(c => (
        <PersonCard key={c.id} sub={c} store={store} envId={envId} subs={subs} services={services}
          roles={roles} dragId={dragId} setDragId={setDragId} depth={depth + 1} />
      ))}
    </div>
  )
}

// Panneau des rôles : brouillon local, appliqué en une fois après confirmation.
function RolesPanel({ envId, store, onClose }) {
  const [draft, setDraft] = useState(() => store.envRoles(envId).map(r => ({ ...r, tabs: [...(r.tabs || [])], perms: [...(r.perms || [])] })))
  const [sel, setSel] = useState(draft[0]?.id || '')
  const [confirmSave, setConfirmSave] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const current = draft.find(r => r.id === sel) || draft[0]

  const patch = (id, p) => setDraft(list => list.map(r => (r.id === id ? { ...r, ...p } : r)))
  const toggleIn = (id, key, value) => setDraft(list => list.map(r => {
    if (r.id !== id) return r
    const set = new Set(r[key] || [])
    set.has(value) ? set.delete(value) : set.add(value)
    return { ...r, [key]: [...set] }
  }))
  const addRole = () => {
    const r = { id: uid(), name: 'Nouveau rôle', color: 'blue', builtin: false, tabs: [], perms: [] }
    setDraft(l => [...l, r]); setSel(r.id)
  }

  return (
    <Modal wide title="Rôles de cette entreprise" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Chaque rôle décide de ce que voient ses titulaires et de ce qu'ils peuvent faire.
          Manager et Membre existent partout et ne se suppriment pas : des personnes les portent.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {draft.map(r => (
            <button key={r.id} onClick={() => setSel(r.id)}
              className={`chip ${sel === r.id ? 'bg-brand text-white' : roleColor(r.color).tint || 'bg-surface text-muted'}`}>
              {r.name}
            </button>
          ))}
          <button className="chip bg-surface text-brand font-bold" onClick={addRole}><Plus size={12} /> Ajouter un rôle</button>
        </div>

        {current && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input !py-1.5 !w-48 text-sm" value={current.name}
                onChange={e => patch(current.id, { name: e.target.value })} disabled={current.builtin}
                title={current.builtin ? 'Un rôle intégré ne se renomme pas' : ''} />
              <div className="flex gap-1.5">
                {ROLE_COLORS.filter(c => c.id).map(c => (
                  <button key={c.id} title={c.label}
                    className={`w-5 h-5 rounded-full ${c.dot} ${current.color === c.id ? 'ring-2 ring-offset-1 ring-brand' : ''}`}
                    onClick={() => patch(current.id, { color: c.id })} />
                ))}
              </div>
              {!current.builtin && (
                <button className="btn-ghost !py-1 text-xs !text-red-500 ml-auto" onClick={() => setConfirmDel(current.id)}>
                  <Trash2 size={13} /> Supprimer ce rôle
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card p-3">
                <h4 className="font-bold text-sm mb-2">Onglets visibles</h4>
                <p className="text-[11px] text-muted mb-2">Ce que ce rôle voit dans le menu, dans la limite de l'offre souscrite.</p>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {GRANTABLE_TABS.map(t => (
                    <label key={t.brick} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={(current.tabs || []).includes(t.brick)}
                        onChange={() => toggleIn(current.id, 'tabs', t.brick)} />
                      <span className="flex-1">{t.label}</span>
                      <span className="text-[10px] text-muted">{t.group}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="card p-3">
                <h4 className="font-bold text-sm mb-2">Droits de management</h4>
                <p className="text-[11px] text-muted mb-2">Ce que ce rôle peut faire au-delà de son propre travail.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {CLIENT_PERMISSION_GROUPS.map(g => (
                    <div key={g.id}>
                      <div className="text-[10px] uppercase tracking-wide text-muted font-extrabold mb-0.5">{g.label}</div>
                      {g.perms.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={(current.perms || []).includes(p.id)}
                            onChange={() => toggleIn(current.id, 'perms', p.id)} />
                          <span>{p.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={() => setConfirmSave(true)}>
            <Save size={15} /> Enregistrer vos modifications
          </button>
        </div>
      </div>

      {confirmDel && (
        <Confirm message="Supprimer ce rôle ? Les personnes qui le portent se retrouveront sans rôle."
          onYes={() => { setDraft(l => l.filter(r => r.id !== confirmDel)); setSel(draft[0]?.id || ''); setConfirmDel(null) }}
          onNo={() => setConfirmDel(null)} />
      )}
      {confirmSave && (
        <Confirm message="Appliquer ces rôles ? Les onglets et les droits des personnes concernées changeront immédiatement."
          yesLabel="Confirmer"
          onYes={() => { store.saveEnvRoles(envId, draft); setConfirmSave(false); onClose(); toast('Rôles enregistrés') }}
          onNo={() => setConfirmSave(false)} />
      )}
    </Modal>
  )
}

export default function ProjectOrgChart({ envId, title, onBack }) {
  const store = useStore()
  const [dragId, setDragId] = useState(null)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [newSvc, setNewSvc] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [confirmDelSvc, setConfirmDelSvc] = useState(null)

  const subs = store.db.subenvs.filter(s => s.envId === envId)
  const services = store.envServicesOf(envId)
  const roles = store.envRoles(envId)
  const accById = Object.fromEntries(store.db.accounts.map(a => [a.id, a]))
  const subByOwner = Object.fromEntries(subs.filter(s => s.ownerId).map(s => [s.ownerId, s]))
  // Racine : personne sans responsable, ou dont le responsable n'est pas dans cet espace.
  const roots = subs.filter(s => {
    const acc = accById[s.ownerId]
    return !acc?.teamOf || !subByOwner[acc.teamOf]
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-ghost text-xs" onClick={onBack}><ArrowLeft size={14} /> Retour aux projets</button>
        <button className="btn-primary !py-1.5 text-sm ml-auto" onClick={() => setRolesOpen(true)}>
          <ShieldCheck size={15} /> Rôles et accès
        </button>
      </div>

      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <Network size={20} className="text-brand" /> Organigramme — {title}
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Glissez une personne sur une autre pour la lui rattacher. Le bouton « Rôles et accès » ouvre
          les rôles de cette entreprise : qui voit quoi, et qui peut quoi.
        </p>
      </div>

      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2"><Users size={15} className="text-brand" /><h3 className="font-bold text-sm">Services</h3></div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {services.map(v => (
            renaming === v.id ? (
              <span key={v.id} className="chip bg-surface flex items-center gap-1">
                <input className="input !py-0.5 !px-1.5 !w-28 text-xs" defaultValue={v.name} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { store.renameEnvService(envId, v.id, e.target.value); setRenaming(null); toast('Service renommé') } }}
                  onBlur={e => { store.renameEnvService(envId, v.id, e.target.value); setRenaming(null) }} />
                <button className="text-muted" onClick={() => setRenaming(null)}><X size={12} /></button>
              </span>
            ) : (
              <span key={v.id} className="chip bg-surface text-ink flex items-center gap-1.5">
                {v.name}
                <button className="opacity-60 hover:opacity-100" title="Renommer" onClick={() => setRenaming(v.id)}><Pencil size={11} /></button>
                <button className="opacity-60 hover:opacity-100 text-red-500" title="Supprimer" onClick={() => setConfirmDelSvc(v.id)}><Trash2 size={11} /></button>
              </span>
            )
          ))}
          {services.length === 0 && <span className="text-xs text-muted italic">Aucun service.</span>}
        </div>
        <div className="flex gap-2">
          <input className="input !py-1.5 text-sm" placeholder="Nom d'un nouveau service…" value={newSvc}
            onChange={e => setNewSvc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newSvc.trim()) { store.addEnvService(envId, newSvc); setNewSvc(''); toast('Service créé') } }} />
          <button className="btn-ghost !py-1.5 text-sm shrink-0" disabled={!newSvc.trim()}
            onClick={() => { store.addEnvService(envId, newSvc); setNewSvc(''); toast('Service créé') }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div onDragOver={e => e.preventDefault()}
        onDrop={() => { if (dragId) { store.setSubManager(dragId, null); setDragId(null); toast('Détaché de son responsable') } }}
        className={`rounded-xl border border-dashed p-2.5 text-center text-xs ${dragId ? 'border-brand text-brand bg-brand/5' : 'border-line text-muted'}`}>
        Déposer ici pour détacher de tout responsable
      </div>

      {subs.length === 0 ? (
        <Empty text="Aucune personne dans cet espace client." />
      ) : (
        <div>
          {roots.map(s => (
            <PersonCard key={s.id} sub={s} store={store} envId={envId} subs={subs} services={services}
              roles={roles} dragId={dragId} setDragId={setDragId} depth={0} />
          ))}
        </div>
      )}

      {rolesOpen && <RolesPanel envId={envId} store={store} onClose={() => setRolesOpen(false)} />}
      {confirmDelSvc && (
        <Confirm message="Supprimer ce service ? Les personnes rattachées n'auront plus de service."
          onYes={() => { store.removeEnvService(envId, confirmDelSvc); setConfirmDelSvc(null); toast('Service supprimé') }}
          onNo={() => setConfirmDelSvc(null)} />
      )}
    </div>
  )
}
