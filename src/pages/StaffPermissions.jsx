import React, { useState } from 'react'
import { ShieldCheck, KeyRound, Plus, Trash2, Crown, Lock, Users, Search, Pencil, Check, X, Info } from 'lucide-react'
import { useStore, STAFF_PERMISSION_GROUPS, STAFF_PERMISSION_IDS, ROLES } from '../store.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

const ROLE_TINT = {
  'Fondateur': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Support BD Report': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15',
  'Administrateur': 'bg-blue-100 text-blue-700 dark:bg-blue-500/15',
  'Développeur': 'bg-slate-200 text-slate-700 dark:bg-slate-500/20',
  'Manager': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15',
  'Membre': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15',
}
const tintOf = (key) => ROLE_TINT[key] || 'bg-brand/10 text-brand'

// En-tête de colonne : nom du rôle + rang + effectif + actions (rang / renommer / supprimer).
function RoleHead({ role, store, memberCount, canManage }) {
  const key = role.roleKey || role.name
  const isFounder = key === 'Fondateur'
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(role.name)
  const [confirmDel, setConfirmDel] = useState(false)
  const permCount = isFounder ? STAFF_PERMISSION_IDS.length : (role.permissions || []).length
  return (
    <th className="px-2 py-2 align-bottom text-center min-w-[124px]">
      <div className="flex flex-col items-center gap-1">
        {editing && !role.builtin ? (
          <span className="flex items-center gap-1">
            <input className="input !py-1 !px-2 text-xs w-24 text-center" value={name} autoFocus
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { store.updateStaffRole(key, { name }); setEditing(false); toast('Rôle renommé') } }} />
            <button className="text-emerald-600" onClick={() => { store.updateStaffRole(key, { name }); setEditing(false); toast('Rôle renommé') }}><Check size={13} /></button>
            <button className="text-muted" onClick={() => { setName(role.name); setEditing(false) }}><X size={13} /></button>
          </span>
        ) : (
          <span className={`chip ${tintOf(key)} !text-[11px] font-bold gap-1`}>
            {isFounder && <Crown size={11} />}{role.name}
            {!role.builtin && canManage && (
              <button className="ml-0.5 opacity-70 hover:opacity-100" title="Renommer" onClick={() => setEditing(true)}><Pencil size={10} /></button>
            )}
          </span>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted">
          <span title="Rang hiérarchique">rang</span>
          {canManage && !isFounder ? (
            <input type="number" className="input !py-0.5 !px-1 !w-12 text-[10px] text-center" value={role.rank}
              onChange={e => store.updateStaffRole(key, { rank: Number(e.target.value) })} />
          ) : <span className="font-bold">{role.rank}</span>}
        </div>
        <div className="text-[10px] text-muted flex items-center gap-1"><Users size={10} /> {memberCount} · {permCount} droits</div>
        {!role.builtin && canManage && (
          <button className="text-red-500 opacity-70 hover:opacity-100" title="Supprimer ce rôle" onClick={() => setConfirmDel(true)}><Trash2 size={12} /></button>
        )}
        {isFounder && <span className="text-[9px] text-muted flex items-center gap-0.5"><Lock size={9} /> tous droits</span>}
      </div>
      {confirmDel && (
        <Confirm message={`Supprimer le rôle « ${role.name} » ? Les comptes qui le portent repasseront « Membre ».`}
          onYes={() => { store.deleteStaffRole(key); setConfirmDel(false); toast('Rôle supprimé') }} onNo={() => setConfirmDel(false)} />
      )}
    </th>
  )
}

// Section d'attribution : chaque compte staff ↔ un rôle (respect de la hiérarchie).
function Assignment({ store }) {
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const roles = store.staffRoles()
  const staffKeys = new Set(roles.filter(r => r.builtin ? !['Manager', 'Membre'].includes(r.roleKey) : true).map(r => r.roleKey || r.name))
  const ql = q.trim().toLowerCase()
  const accounts = store.db.accounts.filter(a =>
    (showAll || staffKeys.has(a.role)) &&
    (!ql || (a.pseudo || '').toLowerCase().includes(ql) || (a.email || '').toLowerCase().includes(ql)))
  const options = store.allRoles()
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2"><Users size={17} className="text-brand" /><h3 className="font-bold">Attribution des rôles</h3></div>
      <p className="text-xs text-muted -mt-1">Attribuez un rôle à chaque membre de l'équipe. Vous ne pouvez attribuer que les rôles de rang inférieur au vôtre.</p>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] input !py-1.5">
          <Search size={15} className="text-muted shrink-0" />
          <input className="bg-transparent outline-none w-full text-sm" placeholder="Rechercher un membre…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Afficher tous les comptes
        </label>
      </div>
      {accounts.length === 0 && <Empty text="Aucun compte à afficher." />}
      <div className="space-y-1.5">
        {accounts.map(a => {
          const manageable = store.canManageRole(a.role) || a.id === store.account?.id
          return (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <div className="w-7 h-7 rounded-full bg-brand/15 text-brand text-[10px] font-extrabold flex items-center justify-center shrink-0">{(a.pseudo || a.email || '?').slice(0, 2).toUpperCase()}</div>
              <span className="flex-1 truncate">{a.pseudo || '—'} <span className="text-muted text-xs">· {a.email}</span></span>
              <span className={`chip ${tintOf(a.role)} !text-[10px]`}>{a.role}</span>
              <select className="input !w-auto !py-1 text-xs" value={a.role} disabled={!manageable}
                onChange={e => { store.setAccountRole(a.id, e.target.value); toast('Rôle mis à jour') }}>
                {options.map(r => (
                  <option key={r} value={r} disabled={r !== a.role && !store.canManageRole(r)}>{r}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StaffPermissions() {
  const store = useStore()
  const actor = store.account
  const canGovern = actor?.role === 'Fondateur' || store.hasPerm('permissions.manage')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', rank: '' })

  if (!canGovern) {
    return (
      <div className="card p-6 text-center space-y-2">
        <Lock size={28} className="mx-auto text-muted" />
        <h3 className="font-bold">Accès réservé</h3>
        <p className="text-sm text-muted">Seul le Fondateur (ou un rôle disposant de la permission « Gérer les permissions ») peut ouvrir cette console.</p>
      </div>
    )
  }

  const roles = store.staffRoles().slice().sort((a, b) => b.rank - a.rank)
  const memberCount = (key) => store.db.accounts.filter(a => a.role === key).length

  const create = () => {
    const r = store.createStaffRole({ name: form.name, rank: form.rank === '' ? undefined : Number(form.rank) })
    if (r) { toast(`Rôle « ${r.name} » créé`); setCreating(false); setForm({ name: '', rank: '' }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2"><ShieldCheck size={20} className="text-brand" /> Permissions de l'équipe staff</h2>
          <p className="text-xs text-muted -mt-0.5">Chaque droit possible côté staff, rôle par rôle. {actor?.role === 'Fondateur' ? 'Vous gérez tout.' : 'Vous gérez les rôles de rang inférieur au vôtre.'}</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer un rôle</button>
      </div>

      <div className="card p-3 flex items-start gap-2 text-xs text-muted bg-brand/5 border-brand/20">
        <Info size={15} className="text-brand shrink-0 mt-0.5" />
        <span>Le <b>Fondateur</b> détient toujours l'intégralité des droits (verrouillé). Un rôle porteur de « <b>Gérer les permissions</b> » peut modifier les rôles situés <b>en dessous</b> de lui et n'accorder que des droits qu'il possède lui-même. Les rôles intégrés ({ROLES.join(', ')}) ne sont pas supprimables.</span>
      </div>

      {/* ---- Matrice des permissions : lignes = droits (groupés), colonnes = rôles ---- */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface/60">
              <th className="text-left px-3 py-2 sticky left-0 bg-surface/60 z-10 min-w-[240px]">
                <span className="flex items-center gap-1.5 font-bold"><KeyRound size={15} className="text-brand" /> Permission</span>
              </th>
              {roles.map(r => (
                <RoleHead key={r.id} role={r} store={store} memberCount={memberCount(r.roleKey || r.name)} canManage={store.canManageRole(r.roleKey || r.name)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFF_PERMISSION_GROUPS.map(g => (
              <React.Fragment key={g.id}>
                <tr className="bg-surface/40">
                  <td className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted sticky left-0 bg-surface/40 z-10" colSpan={1 + roles.length}>{g.label}</td>
                </tr>
                {g.perms.map(p => (
                  <tr key={p.id} className="border-b border-line/60 hover:bg-surface/40">
                    <td className="px-3 py-1.5 sticky left-0 bg-card z-10">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[10px] text-muted font-mono">{p.id}</div>
                    </td>
                    {roles.map(r => {
                      const key = r.roleKey || r.name
                      const isFounder = key === 'Fondateur'
                      const checked = isFounder || (r.permissions || []).includes(p.id)
                      // Éditable si l'acteur gère ce rôle ET (fondateur OU détient lui-même ce droit).
                      const editable = !isFounder && store.canManageRole(key) && (actor?.role === 'Fondateur' || store.hasPerm(p.id))
                      return (
                        <td key={r.id} className="text-center px-2 py-1.5">
                          <input type="checkbox" checked={checked} disabled={!editable}
                            className={editable ? 'cursor-pointer' : 'opacity-50'}
                            title={isFounder ? 'Fondateur : tous les droits' : editable ? '' : 'Non modifiable par vous'}
                            onChange={e => store.toggleRolePerm(key, p.id, e.target.checked)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Assignment store={store} />

      {creating && (
        <Modal title="Créer un rôle staff" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label="Nom du rôle" required>
              <input className="input" placeholder="ex : Agent support N1, Chef de projet…" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Rang hiérarchique (plus élevé = plus de pouvoir)">
              <input className="input" type="number" placeholder="ex : 30" value={form.rank}
                onChange={e => setForm(f => ({ ...f, rank: e.target.value }))} />
            </Field>
            <p className="text-xs text-muted">Le rôle est créé sans aucune permission. Cochez ensuite ses droits dans la matrice. {actor?.role !== 'Fondateur' && 'Son rang sera plafonné juste en dessous du vôtre.'}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn-primary" disabled={!form.name.trim()} onClick={create}>Créer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
