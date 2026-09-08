import React, { useState } from 'react'
import { ArrowLeft, Plus, Trash2, ShieldCheck, Save } from 'lucide-react'
import { useStore, uid, CLIENT_PERMISSION_GROUPS, ROLE_COLORS, roleColor } from '../store.jsx'
import { GRANTABLE_TABS } from '../nav.jsx'
import { Confirm, Modal, toast } from '../ui.jsx'
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

export default function ProjectOrgChart({ envId, title, onBack }) {
  const store = useStore()
  const [rolesOpen, setRolesOpen] = useState(false)

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
      <OrgChart envId={envId} />

      {rolesOpen && <RolesPanel envId={envId} store={store} onClose={() => setRolesOpen(false)} />}
    </div>
  )
}
