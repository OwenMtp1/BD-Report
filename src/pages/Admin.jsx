import React, { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Globe, UserPlus } from 'lucide-react'
import { useStore, ROLES, BRICKS, uid, hashPw } from '../store.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

// ---- Accès aux environnements (administrateurs) : ajouter n'importe quel utilisateur à n'importe quel environnement
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

// canManage(actor, target) : règles de hiérarchie des permissions
function canManage(actor, target) {
  if (actor.role === 'Fondateur') return true
  if (actor.role === 'Administrateur') return target.role !== 'Fondateur'
  if (actor.role === 'Manager') return target.teamOf === actor.id && !['Fondateur', 'Administrateur'].includes(target.role)
  return false
}

function rolesAssignable(actor) {
  if (actor.role === 'Fondateur') return ROLES
  if (actor.role === 'Administrateur') return ROLES.filter(r => r !== 'Fondateur')
  if (actor.role === 'Manager') return ['Membre']
  return []
}

function UserRow({ u, actor, store, onDelete }) {
  const editable = canManage(actor, u)
  const idEditable = actor.role === 'Fondateur'
  const patch = (k, v) => store.updateAccount(u.id, { [k]: v })
  return (
    <div className="card p-3 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Field label="Mail"><input className="input" disabled={!editable} value={u.email} onChange={e => patch('email', e.target.value)} /></Field>
        <Field label="Pseudo"><input className="input" disabled={!editable} value={u.pseudo} onChange={e => patch('pseudo', e.target.value)} /></Field>
        <Field label="Mot de passe (hashé)">
          <input className="input" type="password" disabled={!editable} placeholder="Définir un nouveau..." defaultValue=""
            onBlur={e => { if (e.target.value) { patch('password', hashPw(e.target.value)); e.target.value = ''; toast('Mot de passe mis à jour') } }} />
        </Field>
        <Field label="Id"><input className="input" disabled={!idEditable} defaultValue={u.id}
          onBlur={e => { if (e.target.value && e.target.value !== u.id) store.changeAccountId(u.id, e.target.value) }} /></Field>
        <Field label="Permissions">
          <select className="input" disabled={!editable} value={u.role} onChange={e => patch('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r} disabled={!rolesAssignable(actor).includes(r)}>{r}</option>)}
          </select>
        </Field>
      </div>
      {u.role === 'Membre' && actor.role !== 'Manager' && (
        <Field label="Équipe (manager)">
          <select className="input !w-auto" disabled={!editable} value={u.teamOf || ''} onChange={e => patch('teamOf', e.target.value || null)}>
            <option value="">— Aucune équipe —</option>
            {store.db.accounts.filter(a => a.role === 'Manager').map(m => <option key={m.id} value={m.id}>Équipe de {m.pseudo}</option>)}
          </select>
        </Field>
      )}
      <div>
        <span className="label">Briques accessibles</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {BRICKS.map(b => (
            <label key={b} className={`flex items-center gap-1.5 text-xs ${editable ? 'cursor-pointer' : 'opacity-50'}`}>
              <input type="checkbox" disabled={!editable} checked={(u.bricks || []).includes(b)}
                onChange={e => patch('bricks', e.target.checked ? [...(u.bricks || []), b] : (u.bricks || []).filter(x => x !== b))} />
              {b}
            </label>
          ))}
        </div>
      </div>
      {editable && (
        <div className="flex justify-end">
          <button className="btn-danger !py-1 text-xs" onClick={() => onDelete(u.id)}><Trash2 size={13} /> Supprimer le compte</button>
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
  const [openTeams, setOpenTeams] = useState({})

  const all = store.db.accounts
  const users = mode === 'teams'
    ? all.filter(a => a.teamOf === actor.id || a.id === actor.id)
    : all

  const managers = users.filter(u => u.role === 'Manager')
  const standalone = users.filter(u => u.role !== 'Manager' && !u.teamOf)

  const create = () => {
    if (!form.email || !form.password) return
    const acc = store.addAccount({
      email: form.email, pseudo: form.pseudo, password: form.password,
      role: 'Membre', teamOf: mode === 'teams' ? actor.id : (form.teamOf || null),
    })
    toast(`Compte créé pour ${form.email}`)
    setCreating(false)
    setForm({ email: '', pseudo: '', password: '', teamOf: '' })
    return acc
  }
  const allManagers = all.filter(a => a.role === 'Manager')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold">{mode === 'teams' ? 'Gérez mes équipes' : 'Gestion Administration'}</h2>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer un utilisateur</button>
      </div>

      {mode === 'admin' && <EnvAccess store={store} />}
      {mode === 'teams' && <TeamInvite store={store} actor={actor} />}

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3"><Users size={18} className="text-brand" /><h3 className="font-bold">Gestion des utilisateurs</h3></div>
        {users.length === 0 && <Empty text="Aucun utilisateur." />}
        <div className="space-y-3">
          {standalone.map(u => <UserRow key={u.id} u={u} actor={actor} store={store} onDelete={setConfirmDel} />)}
          {managers.map(m => {
            const team = all.filter(a => a.teamOf === m.id)
            return (
              <div key={m.id} className="space-y-2">
                <UserRow u={m} actor={actor} store={store} onDelete={setConfirmDel} />
                <button className="flex items-center gap-1.5 text-sm font-bold text-brand ml-3"
                  onClick={() => setOpenTeams(t => ({ ...t, [m.id]: !t[m.id] }))}>
                  {openTeams[m.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  Équipe de {m.pseudo} ({team.length})
                </button>
                {openTeams[m.id] && (
                  <div className="ml-6 space-y-2">
                    {team.length === 0 && <p className="text-xs text-muted">Aucun membre dans cette équipe.</p>}
                    {team.map(u => <UserRow key={u.id} u={u} actor={actor} store={store} onDelete={setConfirmDel} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
            <p className="text-xs text-muted">L'Id est généré automatiquement et l'utilisateur est ajouté à la base de données{mode === 'teams' ? ' dans votre équipe' : ''}.</p>
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
