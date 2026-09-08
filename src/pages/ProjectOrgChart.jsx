import React, { useState } from 'react'
import { ArrowLeft, Plus, Trash2, ShieldCheck, Save, LogIn, User, KeyRound } from 'lucide-react'
import { useStore, uid, CLIENT_PERMISSION_GROUPS, ROLE_COLORS, roleColor } from '../store.jsx'
import { GRANTABLE_TABS } from '../nav.jsx'
import { Confirm, Modal, Field, toast } from '../ui.jsx'
import OrgChart from './OrgChart.jsx'

// Organigramme d'un projet client, vu depuis le back-office. Deux volets : l'organisation
// des personnes, et les rôles de l'environnement — qui voit quels onglets, et qui a quels
// droits de management. Les modifications de rôles restent en brouillon jusqu'à un
// enregistrement explicite : elles changent ce que des gens voient au quotidien.

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

// Fiche d'un collaborateur du client, ouverte depuis l'organigramme. Elle permet au
// staff de corriger ce qui relève de l'organisation, et surtout d'entrer dans l'espace
// pour constater un problème là où il se produit plutôt que sur description.
function ProfilePanel({ sub, envId, store, onClose }) {
  const acc = store.db.accounts.find(a => a.id === sub.ownerId)
  const roles = store.envRoles(envId)
  const services = store.envServicesOf(envId)
  const env = store.db.environments.find(e => e.id === envId)
  const [confirmEnter, setConfirmEnter] = useState(false)

  return (
    <Modal title={`${sub.prenom} ${sub.nom}`.trim() || 'Profil'} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center">
            {`${sub.prenom?.[0] || ''}${sub.nom?.[0] || ''}`.toUpperCase() || '??'}
          </div>
          <div className="min-w-0">
            <div className="font-bold">{sub.prenom} {sub.nom}</div>
            <div className="text-xs text-muted truncate">
              {acc?.email || 'aucun compte lié'}{acc?.disabled ? ' · accès désactivé' : ''}
            </div>
            <div className="text-xs text-muted">{env?.name}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Poste">
            <input className="input" defaultValue={sub.poste || ''}
              onBlur={e => { store.updateSubEnv(sub.id, { poste: e.target.value }); toast('Poste mis à jour') }} />
          </Field>
          <Field label="Service">
            <select className="input" value={sub.serviceId || ''}
              onChange={e => { store.assignSubService(sub.id, e.target.value); toast('Service mis à jour') }}>
              <option value="">Sans service</option>
              {services.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Rôle dans l'entreprise">
            <select className="input" value={sub.roleId || ''}
              onChange={e => { store.assignSubRole(sub.id, e.target.value); toast('Rôle attribué') }}>
              <option value="">Sans rôle</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Code d'accès à l'espace">
            <div className="flex items-center gap-1.5">
              <KeyRound size={14} className="text-muted shrink-0" />
              <input className="input font-mono" maxLength={4} defaultValue={sub.pin || ''}
                onBlur={e => { store.updateSubEnv(sub.id, { pin: e.target.value.replace(/\D/g, '') }); toast('Code mis à jour') }} />
            </div>
          </Field>
        </div>

        <div className="rounded-xl bg-surface p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><LogIn size={15} className="text-brand" /> Entrer dans cet espace</div>
          <p className="text-xs text-muted mt-1">
            Vous verrez l'application telle que cette personne l'utilise, avec vos propres droits.
            Utile pour reproduire un problème plutôt que de se le faire décrire. L'accès est tracé dans les logs.
          </p>
          <button className="btn-primary !py-1.5 text-sm mt-2" onClick={() => setConfirmEnter(true)}>
            <LogIn size={15} /> Ouvrir l'espace de {sub.prenom}
          </button>
        </div>
      </div>

      {confirmEnter && (
        <Confirm
          message={`Entrer dans l'espace de ${sub.prenom} ${sub.nom} ? Vous quitterez la console support et cet accès sera consigné.`}
          yesLabel="Entrer"
          onYes={() => { store.enterClientSpace(envId, sub.id); setConfirmEnter(false); onClose(); toast('Vous êtes dans l\'espace client') }}
          onNo={() => setConfirmEnter(false)} />
      )}
    </Modal>
  )
}

export default function ProjectOrgChart({ envId, title, onBack }) {
  const store = useStore()
  const [rolesOpen, setRolesOpen] = useState(false)
  const [profileFor, setProfileFor] = useState(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-ghost text-xs" onClick={onBack}><ArrowLeft size={14} /> Retour aux projets</button>
        <button className="btn-primary !py-1.5 text-sm ml-auto" onClick={() => setRolesOpen(true)}>
          <ShieldCheck size={15} /> Rôles et accès
        </button>
      </div>

      <p className="text-xs text-muted">
        Organisation de <b>{title}</b>. Le bouton « Rôles et accès » ouvre les rôles de cette entreprise :
        qui voit quels onglets, et qui dispose de quels droits.
      </p>

      {/* Même composant que l'organigramme vu par le client : une correction de l'arbre
          vaut aussitôt pour les deux, il n'y a plus qu'une implémentation à maintenir. */}
      <OrgChart envId={envId} onOpenProfile={setProfileFor} />

      {rolesOpen && <RolesPanel envId={envId} store={store} onClose={() => setRolesOpen(false)} />}
      {profileFor && <ProfilePanel sub={profileFor} envId={envId} store={store} onClose={() => setProfileFor(null)} />}
    </div>
  )
}
