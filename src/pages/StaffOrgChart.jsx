import React, { useState } from 'react'
import { Network, Plus, Pencil, Trash2, Check, X, GripVertical, Crown, Users, UserPlus, Building2, KeyRound } from 'lucide-react'
import { useStore, isClientRole, roleColor } from '../store.jsx'
import { Empty, Confirm, Field, toast } from '../ui.jsx'

// Organigramme de l'équipe BD Report. Il ne traite que du rattachement et des services :
// les droits, eux, se règlent dans l'onglet « Permissions staff », pour qu'il n'existe
// qu'un seul endroit où l'on donne ou retire un accès.
const ROLE_TINT = {
  'Fondateur': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Support BD Report': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Administrateur': 'bg-blue-100 text-blue-700 dark:bg-blue-500/15',
  'Développeur': 'bg-slate-200 text-slate-700 dark:bg-slate-500/20',
}

function Card({ acc, store, roles, services, roleKeys, dragId, setDragId, depth }) {
  const role = roles.find(r => (r.roleKey || r.name) === acc.role)
  const tint = roleColor(role?.color).tint || ROLE_TINT[acc.role] || 'bg-brand/10 text-brand'
  // Le rôle ne se change ici que s'il est à la portée de l'acteur : la hiérarchie
  // (rang, anti-escalade) reste arbitrée par le store, la liste n'affiche que le possible.
  const canEditRole = store.canManageRole(acc.role)
  const options = roleKeys.filter(r => r === acc.role || store.canManageRole(r))
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
        {canEditRole ? (
          <select className={`input !w-auto !py-1 !text-[11px] shrink-0 ${tint}`} value={acc.role}
            title="Rôle staff"
            onChange={e => { store.setAccountRole(acc.id, e.target.value); toast('Rôle mis à jour') }}>
            {options.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <span className={`chip ${tint} !text-[10px] shrink-0`}>{acc.role}</span>
        )}
        <select className="input !w-auto !py-1 !text-[11px] shrink-0" value={acc.staffServiceId || ''}
          onChange={e => { store.assignStaffService(acc.id, e.target.value); toast('Service mis à jour') }}>
          <option value="">Sans service</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {children.map(c => (
        <Card key={c.id} acc={c} store={store} roles={roles} services={services} roleKeys={roleKeys}
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

// Deux façons de faire entrer quelqu'un dans l'équipe BD Report : reprendre un compte
// existant chez un client (il garde son espace, seul son rôle bascule) ou créer un
// profil de toutes pièces. Dans les deux cas le rôle reste modifiable ensuite.
function Recruit({ store, roleKeys, services, staff }) {
  const [mode, setMode] = useState(null) // 'existing' | 'create'
  const [envId, setEnvId] = useState('')
  const [accId, setAccId] = useState('')
  const [role, setRole] = useState(() => roleKeys.find(r => r === 'Développeur') || roleKeys[0] || '')
  const [teamOf, setTeamOf] = useState('')
  const [form, setForm] = useState({ email: '', pseudo: '', password: '', serviceId: '' })
  const [showPw, setShowPw] = useState(false)

  const groups = store.clientAccountsByEnv()
  const options = roleKeys.filter(r => store.canManageRole(r))
  // Un bouton qui ne mènerait à rien vaut moins qu'un bouton absent : les deux entrées
  // ne s'affichent qu'avec le droit correspondant, et le store re-vérifie de son côté.
  const canJoin = store.hasPerm('accounts.role') || store.hasPerm('permissions.manage')
  const canCreate = store.hasPerm('accounts.create')
  const group = groups.find(g => g.env.id === envId)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const genPw = () => setF('password', Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6))

  const reset = () => { setMode(null); setEnvId(''); setAccId(''); setTeamOf(''); setForm({ email: '', pseudo: '', password: '', serviceId: '' }); setShowPw(false) }

  const integrate = () => {
    if (!accId) return
    store.joinStaff(accId, role, teamOf || null)
    const still = store.db.accounts.find(a => a.id === accId)
    // Le store refuse en silence un rôle hors de portée : le dire plutôt que de laisser
    // croire à une intégration réussie.
    toast(still && isClientRole(still.role) ? "Rôle refusé : il dépasse vos droits." : 'Intégré à l\'équipe staff')
    reset()
  }
  const create = () => {
    const res = store.createStaffAccount({ ...form, role, teamOf: teamOf || null, staffServiceId: form.serviceId })
    if (res?.error) { toast(res.error); return }
    toast(`Profil créé — ${res.account.pseudo}`)
    reset()
  }

  if (!canJoin && !canCreate) return null

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <UserPlus size={15} className="text-brand" />
        <h3 className="font-bold text-sm flex-1">Ajouter quelqu'un à l'équipe</h3>
        {canJoin && (
          <button className={`btn-ghost !py-1 text-xs ${mode === 'existing' ? '!text-brand' : ''}`} onClick={() => setMode(mode === 'existing' ? null : 'existing')}>
            <Building2 size={13} /> Depuis un environnement
          </button>
        )}
        {canCreate && (
          <button className={`btn-ghost !py-1 text-xs ${mode === 'create' ? '!text-brand' : ''}`} onClick={() => setMode(mode === 'create' ? null : 'create')}>
            <Plus size={13} /> Créer un profil
          </button>
        )}
      </div>

      {mode === 'existing' && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Choisissez l'entreprise, puis la personne. Elle garde son espace client : seul son rôle bascule
            côté BD Report, ce qui la fait apparaître dans l'organigramme et dans les permissions staff.
          </p>
          {groups.length === 0 ? <Empty text="Aucun utilisateur client à reprendre." /> : (
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Environnement">
                <select className="input" value={envId} onChange={e => { setEnvId(e.target.value); setAccId('') }}>
                  <option value="">— Choisir —</option>
                  {groups.map(g => <option key={g.env.id} value={g.env.id}>{g.env.name} ({g.people.length})</option>)}
                </select>
              </Field>
              <Field label="Personne">
                <select className="input" value={accId} onChange={e => setAccId(e.target.value)} disabled={!group}>
                  <option value="">— Choisir —</option>
                  {(group?.people || []).map(p => <option key={p.account.id} value={p.account.id}>{p.name} · {p.account.email}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="Pseudo" required><input className="input" value={form.pseudo} onChange={e => setF('pseudo', e.target.value)} placeholder="ex : camille" /></Field>
          <Field label="E-mail" required><input className="input" type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="camille@bdreport.fr" /></Field>
          <Field label="Mot de passe" required>
            <div className="flex gap-1.5">
              <input className="input" type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setF('password', e.target.value)} placeholder="Mot de passe provisoire" />
              <button type="button" className="btn-ghost !py-1.5 shrink-0" title="Générer" onClick={() => { genPw(); setShowPw(true) }}><KeyRound size={14} /></button>
            </div>
          </Field>
          <Field label="Service">
            <select className="input" value={form.serviceId} onChange={e => setF('serviceId', e.target.value)}>
              <option value="">Sans service</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {mode && (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            <Field label="Rôle staff">
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                {options.length === 0 && <option value="">Aucun rôle à votre portée</option>}
                {options.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Rattaché à">
              <select className="input" value={teamOf} onChange={e => setTeamOf(e.target.value)}>
                <option value="">Personne (racine de l'organigramme)</option>
                {staff.map(a => <option key={a.id} value={a.id}>{a.pseudo || a.email}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost !py-1.5 text-sm" onClick={reset}>Annuler</button>
            {mode === 'existing'
              ? <button className="btn-primary !py-1.5 text-sm" disabled={!accId || !role} onClick={integrate}><UserPlus size={14} /> Intégrer à l'équipe staff</button>
              : <button className="btn-primary !py-1.5 text-sm" disabled={!form.email.trim() || !form.pseudo.trim() || !form.password || !role} onClick={create}><Plus size={14} /> Créer le profil</button>}
          </div>
        </>
      )}
    </div>
  )
}

export default function StaffOrgChart() {
  const store = useStore()
  const [dragId, setDragId] = useState(null)
  const [newSvc, setNewSvc] = useState('')
  const services = store.staffServices()
  const roles = store.staffRoles()
  const roleKeys = store.staffRoleKeys()

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
          Glissez une personne sur une autre pour la lui rattacher, et choisissez son rôle dans la liste
          de sa carte. Ce que chaque rôle a le droit de faire se règle dans l'onglet « Permissions staff »
          — un seul endroit pour donner ou retirer un accès.
        </p>
      </div>

      <Recruit store={store} roleKeys={roleKeys} services={services} staff={staff} />

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
            <Card key={a.id} acc={a} store={store} roles={roles} services={services} roleKeys={roleKeys}
              dragId={dragId} setDragId={setDragId} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}
