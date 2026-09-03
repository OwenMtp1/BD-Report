import React, { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Globe, UserPlus, Search, UserCog, Eye, EyeOff, Network, X, Pencil, Check } from 'lucide-react'
import { useStore, ROLES, BRICKS, uid, hashPw, isSupportRole } from '../store.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

// Gestion du mot de passe d'un compte. Le manager/support/fondateur peut désormais afficher
// le mot de passe (comptes créés/réinitialisés depuis l'app) et en définir un nouveau.
function PasswordCell({ u, editable, store }) {
  const [val, setVal] = useState('')
  const [shown, setShown] = useState(false)
  const canView = store.canViewPasswords()
  const clear = canView && shown ? store.revealPassword(u.id) : null
  const reset = () => { if (val.trim()) { store.setAccountPassword(u.id, val.trim()); setVal(''); toast('Mot de passe mis à jour') } }
  return (
    <div className="space-y-1.5">
      {canView && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono px-2 py-1 rounded bg-surface min-w-[90px]">
            {shown ? (clear || 'non disponible') : '••••••••'}
          </span>
          <button type="button" className="btn-ghost !p-1.5" title={shown ? 'Masquer' : 'Afficher'} onClick={() => setShown(s => !s)}>
            {shown ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {shown && !clear && <span className="text-[10px] text-muted">(défini avant l'affichage — réinitialisez pour le voir)</span>}
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-1">
          <input className="input !py-1 text-xs" placeholder="Nouveau mot de passe…" value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') reset() }} />
          <button type="button" className="btn-ghost !py-1 text-xs shrink-0" disabled={!val.trim()} onClick={reset}>Réinitialiser</button>
        </div>
      )}
      {!editable && !canView && <span className="text-xs text-muted">••••••••</span>}
    </div>
  )
}

// Affecte la personne (sous-espace) d'un compte à un service de l'environnement courant.
function ServiceCell({ u, store }) {
  const envId = store.session?.envId
  const sub = store.db.subenvs.find(s => s.ownerId === u.id && s.envId === envId)
  const services = store.envServices(envId)
  if (!sub) return <span className="text-xs text-muted italic">Aucun espace dans cet environnement</span>
  return (
    <select className="input" value={sub.serviceId || ''} onChange={e => store.assignSubService(sub.id, e.target.value || null)}>
      <option value="">— Sans service —</option>
      {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  )
}

// ---- Accès aux environnements (administrateurs) : matrice utilisateurs × environnements
function EnvAccess({ store }) {
  const envs = store.db.environments
  const accounts = store.db.accounts
  const toggle = (env, accId, on) => {
    const members = new Set(env.members || [])
    on ? members.add(accId) : members.delete(accId)
    store.updateEnv(env.id, { members: [...members] })
  }
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1"><Globe size={17} className="text-brand" /><h3 className="font-bold">Accès aux environnements</h3></div>
      <p className="text-xs text-muted mb-3">Cochez pour donner à un utilisateur l'accès à un environnement (il le verra dans son menu d'environnements).</p>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-[400px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase">
              <th className="py-2 pr-4">Utilisateur</th>
              {envs.map(e => <th key={e.id} className="px-3 text-center">{e.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-2 pr-4 font-semibold whitespace-nowrap">{a.pseudo} <span className="text-xs text-muted font-normal">({a.email})</span></td>
                {envs.map(e => {
                  const isCreator = e.createdBy === a.id
                  const isMember = isCreator || a.developer || (e.members || []).includes(a.id)
                  return (
                    <td key={e.id} className="px-3 text-center">
                      <input type="checkbox" checked={isMember} disabled={isCreator || a.developer}
                        title={isCreator ? 'Créateur de l\'environnement' : a.developer ? 'Accès développeur global' : ''}
                        onChange={ev => toggle(e, a.id, ev.target.checked)} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- Ajout par email (managers) : invite n'importe quel mail dans l'environnement de l'équipe
function TeamInvite({ store, actor }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const envId = store.session.envId
  const env = store.db.environments.find(e => e.id === envId)
  const invite = () => {
    const mail = email.trim().toLowerCase()
    if (!mail || !mail.includes('@')) { setMsg({ err: true, text: 'Entrez un email valide.' }); return }
    let acc = store.db.accounts.find(a => a.email.toLowerCase() === mail)
    let provisional = null
    if (!acc) {
      provisional = Math.random().toString(36).slice(2, 8)
      acc = store.addAccount({ email: mail, pseudo: mail.split('@')[0], password: provisional, role: 'Membre', teamOf: actor.id })
    } else {
      store.updateAccount(acc.id, { teamOf: acc.teamOf || actor.id })
    }
    const members = new Set(env.members || [])
    members.add(acc.id)
    store.updateEnv(envId, { members: [...members] })
    setMsg(provisional
      ? { err: false, text: `✅ Compte créé pour ${mail} (mot de passe provisoire : ${provisional}) et ajouté à « ${env.name} » dans votre équipe.` }
      : { err: false, text: `✅ ${mail} a été ajouté à « ${env.name} » dans votre équipe.` })
    toast('Invitation enregistrée')
    setEmail('')
  }
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1"><UserPlus size={17} className="text-brand" /><h3 className="font-bold">Inviter dans mon environnement d'équipe</h3></div>
      <p className="text-xs text-muted mb-3">Ajoutez n'importe quel email à « {env?.name} » : si le compte n'existe pas, il est créé avec un mot de passe provisoire et rejoint votre équipe.</p>
      <div className="flex gap-2 max-w-md">
        <input className="input" type="email" placeholder="email@entreprise.com" value={email}
          onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && invite()} />
        <button className="btn-primary whitespace-nowrap" onClick={invite}><UserPlus size={15} /> Inviter</button>
      </div>
      {msg && <p className={`text-xs font-semibold mt-2 ${msg.err ? 'text-red-500' : 'text-emerald-600'}`}>{msg.text}</p>}
    </div>
  )
}

// ---- Services & organigramme : création de services + affectation des personnes de l'environnement
function ServicesPanel({ store }) {
  const envId = store.session?.envId
  const env = store.db.environments.find(e => e.id === envId)
  const services = store.envServices(envId)
  const subs = store.db.subenvs.filter(s => s.envId === envId)
  const [name, setName] = useState('')
  const countOf = (sid) => subs.filter(s => s.serviceId === sid).length
  const unassigned = subs.filter(s => !s.serviceId).length
  const add = () => { if (name.trim()) { store.addService(name.trim()); setName('') } }
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2"><Network size={17} className="text-brand" /><h3 className="font-bold">Services de « {env?.name} »</h3></div>
        <p className="text-xs text-muted">Créez des services, affectez les personnes et sectorisez l'accès aux conversations par service.</p>
        <div className="flex gap-2 max-w-md">
          <input className="input flex-1" placeholder="Nom du service (ex : Sales, SDR, CSM…)" value={name}
            onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn-primary whitespace-nowrap" onClick={add}><Plus size={15} /> Ajouter</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map(v => <SvcChip key={v.id} svc={v} count={countOf(v.id)} store={store} />)}
          {services.length === 0 && <span className="text-xs text-muted italic">Aucun service pour l'instant.</span>}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3"><Users size={17} className="text-brand" /><h3 className="font-bold">Affectation des personnes</h3>
          {unassigned > 0 && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15">{unassigned} sans service</span>}</div>
        {subs.length === 0 && <Empty text="Aucune personne dans cet environnement." />}
        <div className="space-y-1.5">
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center shrink-0">{(s.prenom?.[0] || '') + (s.nom?.[0] || '')}</div>
              <span className="flex-1 truncate">{s.prenom} {s.nom} <span className="text-muted text-xs">· {s.poste}</span></span>
              <select className="input !w-auto !py-1 text-xs" value={s.serviceId || ''} onChange={e => store.assignSubService(s.id, e.target.value || null)}>
                <option value="">— Sans service —</option>
                {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
function SvcChip({ svc, count, store }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(svc.name)
  if (editing) return (
    <span className="chip bg-surface">
      <input className="bg-transparent outline-none text-sm w-24" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { store.renameService(svc.id, name); setEditing(false) } }} autoFocus />
      <button className="text-emerald-600" onClick={() => { store.renameService(svc.id, name); setEditing(false) }}><Check size={13} /></button>
    </span>
  )
  return (
    <span className="chip bg-brand/10 text-brand">
      {svc.name} <span className="opacity-60">· {count}</span>
      <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => setEditing(true)}><Pencil size={11} /></button>
      <button className="ml-0.5 text-red-500" onClick={() => store.removeService(svc.id)}><X size={12} /></button>
    </span>
  )
}

// canManage(actor, target) : règles de hiérarchie des permissions
// « Support BD Report » a exactement les mêmes permissions que « Fondateur » (équipe BD Report).
function canManage(actor, target) {
  if (isSupportRole(actor.role)) return true
  if (actor.role === 'Développeur') return !isSupportRole(target.role)
  if (actor.role === 'Administrateur') return !isSupportRole(target.role)
  if (actor.role === 'Manager') return target.teamOf === actor.id && !['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur'].includes(target.role)
  return false
}

function rolesAssignable(actor) {
  if (isSupportRole(actor.role)) return ROLES
  if (actor.role === 'Développeur') return ROLES.filter(r => !isSupportRole(r))
  if (actor.role === 'Administrateur') return ROLES.filter(r => !isSupportRole(r))
  if (actor.role === 'Manager') return ['Membre', 'Développeur']
  return []
}

const ROLE_STYLE = {
  'Fondateur': 'bg-purple-100 text-purple-700',
  'Support BD Report': 'bg-purple-100 text-purple-700',
  'Administrateur': 'bg-blue-100 text-blue-700',
  'Développeur': 'bg-slate-200 text-slate-700',
  'Manager': 'bg-amber-100 text-amber-700',
  'Membre': 'bg-emerald-100 text-emerald-700',
}
const initials = (u) => (u.pseudo || u.email || '?').slice(0, 2).toUpperCase()

// Carte utilisateur compacte et repliable : aperçu au repos, éditeur complet au clic.
function UserRow({ u, actor, store, onDelete, defaultOpen }) {
  const editable = canManage(actor, u)
  const idEditable = isSupportRole(actor.role)
  const [open, setOpen] = useState(!!defaultOpen)
  const patch = (k, v) => store.updateAccount(u.id, { [k]: v })
  const manager = store.db.accounts.find(a => a.id === u.teamOf)
  return (
    <div className="card overflow-hidden">
      <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface" onClick={() => setOpen(o => !o)}>
        <div className="w-9 h-9 rounded-full bg-brand/15 text-brand text-xs font-extrabold flex items-center justify-center shrink-0">{initials(u)}</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">{u.pseudo || '—'}{u.developer ? <span className="ml-1 text-[10px] text-muted font-normal">dev</span> : ''}</div>
          <div className="text-xs text-muted truncate">{u.email}</div>
        </div>
        <span className={`chip ${ROLE_STYLE[u.role] || 'bg-surface text-muted'}`}>{u.role}</span>
        {manager && <span className="chip bg-surface text-muted hidden md:inline-flex">Équipe {manager.pseudo}</span>}
        {open ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-line p-3 space-y-3">
          {!editable && <p className="text-xs text-muted italic">Vous n'avez pas les droits pour modifier ce compte.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Mail"><input className="input" disabled={!editable} value={u.email} onChange={e => patch('email', e.target.value)} /></Field>
            <Field label="Pseudo"><input className="input" disabled={!editable} value={u.pseudo} onChange={e => patch('pseudo', e.target.value)} /></Field>
            <Field label="Permissions">
              <select className="input" disabled={!editable} value={u.role} onChange={e => patch('role', e.target.value)}>
                {ROLES.map(r => <option key={r} value={r} disabled={!rolesAssignable(actor).includes(r)}>{r}</option>)}
              </select>
            </Field>
            {u.role === 'Membre' && actor.role !== 'Manager' && (
              <Field label="Équipe (manager)">
                <select className="input" disabled={!editable} value={u.teamOf || ''} onChange={e => patch('teamOf', e.target.value || null)}>
                  <option value="">— Aucune équipe —</option>
                  {store.db.accounts.filter(a => a.role === 'Manager').map(m => <option key={m.id} value={m.id}>Équipe de {m.pseudo}</option>)}
                </select>
              </Field>
            )}
            <Field label="Mot de passe"><PasswordCell u={u} editable={editable} store={store} /></Field>
            <Field label="Service (organigramme)"><ServiceCell u={u} store={store} /></Field>
            {idEditable && <Field label="Identifiant technique"><input className="input" defaultValue={u.id}
              onBlur={e => { if (e.target.value && e.target.value !== u.id) store.changeAccountId(u.id, e.target.value) }} /></Field>}
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-muted select-none">Briques accessibles ({(u.bricks || []).length}/{BRICKS.length})</summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {BRICKS.map(b => (
                <label key={b} className={`flex items-center gap-1.5 text-xs ${editable ? 'cursor-pointer' : 'opacity-50'}`}>
                  <input type="checkbox" disabled={!editable} checked={(u.bricks || []).includes(b)}
                    onChange={e => patch('bricks', e.target.checked ? [...(u.bricks || []), b] : (u.bricks || []).filter(x => x !== b))} />
                  {b}
                </label>
              ))}
            </div>
          </details>
          {editable && (
            <div className="flex justify-end">
              <button className="btn-danger !py-1 text-xs" onClick={() => onDelete(u.id)}><Trash2 size={13} /> Supprimer le compte</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Admin({ mode }) {
  // mode: 'admin' (Gestion Administration) ou 'teams' (Gérez mes équipes)
  const store = useStore()
  const actor = store.account
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ email: '', pseudo: '', password: '', teamOf: '' })
  const [confirmDel, setConfirmDel] = useState(null)
  const [tab, setTab] = useState('users')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const all = store.db.accounts
  const scoped = mode === 'teams' ? all.filter(a => a.teamOf === actor.id || a.id === actor.id) : all

  const stats = [
    { label: 'Utilisateurs', value: scoped.length },
    { label: 'Managers', value: scoped.filter(u => u.role === 'Manager').length },
    { label: 'Membres', value: scoped.filter(u => u.role === 'Membre').length },
    ...(mode === 'admin' ? [{ label: 'Environnements', value: store.db.environments.length }] : []),
  ]

  const ql = q.trim().toLowerCase()
  const filtered = scoped.filter(u =>
    (!roleFilter || u.role === roleFilter) &&
    (!ql || (u.pseudo || '').toLowerCase().includes(ql) || (u.email || '').toLowerCase().includes(ql)))

  const create = () => {
    if (!form.email || !form.password) return
    store.addAccount({
      email: form.email, pseudo: form.pseudo, password: form.password,
      role: 'Membre', teamOf: mode === 'teams' ? actor.id : (form.teamOf || null),
    })
    toast(`Compte créé pour ${form.email}`)
    setCreating(false)
    setForm({ email: '', pseudo: '', password: '', teamOf: '' })
  }
  const allManagers = all.filter(a => a.role === 'Manager')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">{mode === 'teams' ? 'Gérez mes équipes' : 'Gestion Administration'}</h2>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer un utilisateur</button>
      </div>

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="card p-3">
            <div className="text-2xl font-extrabold stat-num">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {mode === 'teams' && <TeamInvite store={store} actor={actor} />}

      {mode === 'admin' && (
        <div className="flex gap-1.5 border-b border-line overflow-x-auto">
          {[['users', 'Utilisateurs', UserCog], ['services', 'Services & organigramme', Network], ['env', 'Accès environnements', Globe]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-surface'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'admin' && tab === 'env' ? <EnvAccess store={store} /> : mode === 'admin' && tab === 'services' ? <ServicesPanel store={store} /> : (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex items-center gap-2 flex-1 min-w-[180px] input !py-1.5">
              <Search size={15} className="text-muted shrink-0" />
              <input className="bg-transparent outline-none w-full text-sm" placeholder="Rechercher par pseudo ou e-mail…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <select className="input !w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">Tous les rôles</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {filtered.length === 0 && <Empty text="Aucun utilisateur ne correspond." />}
          <div className="space-y-2">
            {filtered.map(u => <UserRow key={u.id} u={u} actor={actor} store={store} onDelete={setConfirmDel} defaultOpen={filtered.length === 1} />)}
          </div>
        </div>
      )}

      {creating && (
        <Modal title="Créer un utilisateur" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label="Mail" required><input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Pseudo"><input className="input" value={form.pseudo} onChange={e => setForm(f => ({ ...f, pseudo: e.target.value }))} /></Field>
            <Field label="Mot de passe" required><input className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></Field>
            {mode === 'admin' && (
              <Field label="Manager (pour un organigramme clair)">
                <select className="input" value={form.teamOf} onChange={e => setForm(f => ({ ...f, teamOf: e.target.value }))}>
                  <option value="">— Aucun manager —</option>
                  {allManagers.map(m => <option key={m.id} value={m.id}>Équipe de {m.pseudo}</option>)}
                </select>
              </Field>
            )}
            <p className="text-xs text-muted">L'identifiant est généré automatiquement et l'utilisateur est ajouté à la base de données{mode === 'teams' ? ' dans votre équipe' : ''}.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn-primary" onClick={create}>Créer</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message="Supprimer définitivement ce compte utilisateur ?"
          onYes={() => { store.deleteAccount(confirmDel); setConfirmDel(null) }} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}
