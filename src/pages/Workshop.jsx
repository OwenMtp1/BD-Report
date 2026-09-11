import React, { useMemo, useState } from 'react'
import {
  Hammer, ChevronRight, ChevronLeft, Check, Plus, Trash2, Eye, LogIn, Layers,
  Users2, ShieldCheck, Rocket, Building2, UserPlus, Sparkles, Wrench,
} from 'lucide-react'
import {
  useStore, uid, ENV_MODULES, defaultEnvModules, CLIENT_PERMISSION_GROUPS, previewTabs,
  DEFAULT_PHASES, fmtMoney, envModuleOn,
  defaultNewsRules,
} from '../store.jsx'
import { Field, Empty, Confirm, toast } from '../ui.jsx'
import NewsRules from './NewsRules.jsx'
import EnvAdmin from './EnvAdmin.jsx'

// ATELIER D'ENVIRONNEMENT — console éditeur.
// Ouvrir un espace client, ce n'est pas remplir un formulaire : c'est composer un produit
// (modules, offre, rôles, équipe, primes) puis vérifier ce que chacun verra. L'atelier tient
// donc en deux temps : un assistant qui construit, et un explorateur qui montre — y compris
// « ce que voit ce rôle », sans avoir à se connecter à sa place.

const STEPS = [
  { id: 'identite', label: 'Identité & modèle' },
  { id: 'modules', label: 'Modules' },
  { id: 'roles', label: 'Rôles & onglets' },
  // Le contexte commercial qui pilote le moteur de signaux. Il vient APRÈS les modules :
  // le régler avant de savoir si la brique est installée n'aurait pas de sens.
  { id: 'signaux', label: 'Règle Actualité IA' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'recap', label: 'Récapitulatif' },
]

// ---------------------------------------------------------------- Aperçu d'un rôle
function RolePreview({ store, env, role }) {
  const tabs = useMemo(() => previewTabs(env, store.db.offers, role), [env, role, store.db.offers])
  // Chaque onglet s'ouvre EN SITUATION, comme une brique installée. Lire « Closing » dans une
  // liste ne dit pas ce que le client verra en cliquant dessus — et c'est précisément ce
  // qu'on vient vérifier ici.
  const open = (t) => {
    if (!store.previewPage(env.id, t.id)) toast("Aucun espace dans cet environnement — impossible d'ouvrir l'écran")
  }
  const groups = [...new Set(tabs.map(t => t.group))]
  const perms = role?.perms || []
  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <div className="text-xs font-semibold text-muted">
        Ce que voit « {role?.name || 'ce rôle'} » — {tabs.length} onglet{tabs.length > 1 ? 's' : ''}
      </div>
      {tabs.length === 0
        ? <p className="text-[11px] text-amber-600">Aucun onglet : l'offre, les modules ou le rôle referment tout. L'espace paraîtrait vide.</p>
        : groups.map(g => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wide text-muted">{g}</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {tabs.filter(t => t.group === g).map(t => (
                <button key={t.id} className="chip bg-surface text-muted hover:bg-brand hover:text-white transition"
                  title={`Ouvrir « ${t.label} » dans l'environnement`} onClick={() => open(t)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted">Droits de management</div>
        {perms.length === 0
          ? <p className="text-[11px] text-muted">Aucun — ce rôle ne peut rien administrer.</p>
          : (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {CLIENT_PERMISSION_GROUPS.flatMap(g => g.perms).filter(p => perms.includes(p.id))
                .map(p => <span key={p.id} className="chip bg-brand/10 text-brand">{p.label}</span>)}
            </div>
          )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Éditeur de rôles (onglets + droits)
function RoleEditor({ store, env, roles, setRoles }) {
  const [sel, setSel] = useState(roles[0]?.id || null)
  const role = roles.find(r => r.id === sel) || roles[0]
  const allTabs = useMemo(() => previewTabs(env, store.db.offers, null), [env, store.db.offers])
  const patch = (p) => setRoles(roles.map(r => (r.id === role.id ? { ...r, ...p } : r)))
  const toggleTab = (brick) => patch({ tabs: (role.tabs || []).includes(brick) ? role.tabs.filter(x => x !== brick) : [...(role.tabs || []), brick] })
  const togglePerm = (id) => patch({ perms: (role.perms || []).includes(id) ? role.perms.filter(x => x !== id) : [...(role.perms || []), id] })

  if (!role) return <Empty text="Aucun rôle." />
  return (
    <div className="grid md:grid-cols-[180px_minmax(0,1fr)] gap-3 items-start">
      <div className="card p-2 space-y-1">
        {roles.map(r => (
          <button key={r.id} onClick={() => setSel(r.id)}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-sm ${role.id === r.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-surface'}`}>
            {r.name}{r.builtin ? '' : ' ·'}
          </button>
        ))}
        <button className="btn-ghost !py-1.5 text-xs w-full" onClick={() => {
          const r = { id: uid(), name: `Rôle ${roles.length + 1}`, color: 'sky', builtin: false, tabs: [], perms: [] }
          setRoles([...roles, r]); setSel(r.id)
        }}><Plus size={13} /> Ajouter un rôle</button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input className="input !py-1.5 text-sm !w-56" value={role.name} disabled={role.builtin}
            onChange={e => patch({ name: e.target.value })} />
          {role.builtin
            ? <span className="chip bg-surface text-muted">rôle intégré</span>
            : <button className="btn-ghost !p-1.5 !text-red-500" title="Supprimer ce rôle"
                onClick={() => { setRoles(roles.filter(r => r.id !== role.id)); setSel(roles[0]?.id) }}><Trash2 size={14} /></button>}
        </div>

        <div>
          <div className="text-xs font-semibold text-muted mb-1.5">Onglets ouverts à ce rôle</div>
          <div className="flex flex-wrap gap-1.5">
            {allTabs.map(t => {
              const on = (role.tabs || []).includes(t.brick)
              return (
                <span key={t.brick} className={`chip inline-flex items-center gap-1 ${on ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}>
                  <button className="cursor-pointer" onClick={() => toggleTab(t.brick)}>{t.label}</button>
                  {/* Voir l'onglet en situation, sans quitter le réglage : accorder un onglet
                      sans savoir ce qu'il montre, c'est composer à l'aveugle. Réservé aux
                      environnements DÉJÀ créés — pendant l'assistant, il n'y a rien à ouvrir. */}
                  {env?.id && (
                    <button title={`Ouvrir « ${t.label} » dans l'environnement`} className="opacity-70 hover:opacity-100"
                      onClick={() => { if (!store.previewPage(env.id, t.id)) toast("Aucun espace dans cet environnement — impossible d'ouvrir l'écran") }}>
                      <Eye size={11} />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
          <p className="text-[11px] text-muted mt-1.5">Seuls les onglets permis par l'offre et les modules installés sont proposés.</p>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted mb-1.5">Droits de management</div>
          {CLIENT_PERMISSION_GROUPS.map(g => (
            <div key={g.label} className="mb-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted">{g.label}</div>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {g.perms.map(p => {
                  const on = (role.perms || []).includes(p.id)
                  return (
                    <button key={p.id} onClick={() => togglePerm(p.id)}
                      className={`chip cursor-pointer ${on ? 'bg-emerald-500 text-white' : 'bg-card border border-line text-muted'}`}>{p.label}</button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <RolePreview store={store} env={env} role={role} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Assistant de création
function Wizard({ store, onDone, onCancel }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '', logo: '', templateOf: '', plan: 'beta',
    modules: defaultEnvModules(),
    services: ['Sales', 'Marketing'],
    people: [],
    newsRules: defaultNewsRules(),
  })
  const [roles, setRoles] = useState([
    { id: 'erole-manager', name: 'Manager', builtin: true, color: 'amber', tabs: [], perms: [] },
    { id: 'erole-membre', name: 'Membre', builtin: true, color: 'emerald', tabs: [], perms: [] },
  ])
  const [rolesInit, setRolesInit] = useState(false)
  const templates = store.templateEnvs()
  const offers = store.offers()

  // Environnement « virtuel » : il n'existe pas encore, mais l'aperçu des rôles a besoin de
  // son offre et de ses modules pour dire la vérité.
  const draftEnv = { plan: form.plan, modules: form.modules, roles }

  // Les rôles intégrés partent du périmètre complet permis par l'offre : c'est le point de
  // départ que le staff restreint, jamais l'inverse — un espace vide ne se remplit jamais seul.
  if (!rolesInit) {
    const all = previewTabs(draftEnv, offers, null).map(t => t.brick)
    setRoles(rs => rs.map(r => (r.id === 'erole-manager'
      ? { ...r, tabs: [...all], perms: CLIENT_PERMISSION_GROUPS.flatMap(g => g.perms).map(p => p.id) }
      : { ...r, tabs: all.filter(b => !['Gestion Manager', 'Gestion Administration', 'Gérez mes équipes', 'Organigramme', 'Écosystème', 'KPI Entreprise', 'Pilotage équipe', 'Intégration HubSpot', 'Objectifs & quotas'].includes(b)) })))
    setRolesInit(true)
  }

  const addPerson = () => setForm(f => ({
    ...f,
    people: [...f.people, { id: uid(), prenom: '', nom: '', email: '', pseudo: '', password: '', poste: '', service: f.services[0] || '', roleId: 'erole-membre', isManager: false, isOwner: f.people.length === 0 }],
  }))
  const setPerson = (id, p) => setForm(f => ({ ...f, people: f.people.map(x => (x.id === id ? { ...x, ...p } : x)) }))

  const canNext = step !== 0 || form.name.trim().length > 0
  const tplSrc = templates.find(t => t.id === form.templateOf)

  const create = () => {
    const env = store.createEnv({ name: form.name.trim(), logo: form.logo, templateOf: form.templateOf || null, modules: form.modules })
    if (!env) { toast('Création impossible.'); return }
    store.updateEnv(env.id, {
      plan: form.plan,
      services: form.services.map(n => ({ id: uid(), name: n })),
      departments: [...form.services],
    })
    store.saveEnvRoles(env.id, roles)
    store.saveEnvNewsRules(env.id, form.newsRules)
    let created = 0
    form.people.forEach(p => {
      if (!p.email.trim() || !p.pseudo.trim() || !p.password) return
      const r = store.provisionEnvMember({ envId: env.id, ...p })
      if (r.error) toast(`${p.pseudo || p.email} : ${r.error}`)
      else created++
    })
    toast(`Environnement « ${env.name} » créé${created ? ` avec ${created} accès` : ''}`)
    onDone(env.id)
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setStep(i)}
            className={`chip cursor-pointer ${i === step ? 'bg-brand text-white' : i < step ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-card border border-line text-muted'}`}>
            {i < step && <Check size={11} />} {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nom de l'entreprise cliente" required>
              <input className="input" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Offre">
              <select className="input" value={form.plan} onChange={e => { setForm(f => ({ ...f, plan: e.target.value })); setRolesInit(false) }}>
                {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1.5"><Layers size={13} /> Partir d'un modèle</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <button onClick={() => setForm(f => ({ ...f, templateOf: '' }))}
                className={`rounded-xl border p-3 text-left ${!form.templateOf ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface'}`}>
                <div className="font-bold text-sm flex items-center gap-1.5"><Sparkles size={14} className="text-brand" /> Configuration par défaut</div>
                <div className="text-[11px] text-muted mt-0.5">Pipeline R1 → Signée, barème standard, deux rôles.</div>
              </button>
              {templates.map(t => {
                const src = store.db.environments.find(e => e.id === t.id)
                const tpl = src?._template
                const mods = ENV_MODULES.filter(m => envModuleOn(src, m.id)).length
                return (
                  <button key={t.id} onClick={() => setForm(f => ({ ...f, templateOf: t.id }))}
                    className={`rounded-xl border p-3 text-left ${form.templateOf === t.id ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface'}`}>
                    <div className="font-bold text-sm truncate">{t.name}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {(tpl?.phases || DEFAULT_PHASES).join(' → ')}
                    </div>
                    <div className="text-[11px] text-muted">
                      {(tpl?.bareme || []).length} ligne(s) de barème · {(src?.roles || []).length} rôle(s) · {mods} module(s)
                    </div>
                  </button>
                )
              })}
            </div>
            {tplSrc && <p className="text-[11px] text-muted mt-1.5">La configuration est reprise ; aucune donnée du client d'origine n'est copiée.</p>}
          </div>

          <div>
            <div className="text-xs font-semibold text-muted mb-1.5">Services</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.services.map(sv => (
                <span key={sv} className="chip bg-surface text-muted flex items-center gap-1">
                  {sv}
                  <button className="text-red-400" onClick={() => setForm(f => ({ ...f, services: f.services.filter(x => x !== sv) }))}>×</button>
                </span>
              ))}
            </div>
            <input className="input !py-1.5 text-sm !w-56" placeholder="Ajouter un service…"
              onKeyDown={e => {
                const v = e.currentTarget.value.trim()
                if (e.key === 'Enter' && v && !form.services.includes(v)) { setForm(f => ({ ...f, services: [...f.services, v] })); e.currentTarget.value = '' }
              }} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Ce que vous installez chez ce client. Tout est activé par défaut ; ce qui n'est pas coché n'apparaîtra nulle part chez lui.</p>
          {ENV_MODULES.map(m => (
            <label key={m.id} className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-surface cursor-pointer">
              <input type="checkbox" className="mt-1" checked={form.modules[m.id] !== false}
                onChange={e => { setForm(f => ({ ...f, modules: { ...f.modules, [m.id]: e.target.checked } })); setRolesInit(false) }} />
              <span className="min-w-0">
                <span className="font-semibold">{m.label}</span>
                <span className="block text-[11px] text-muted">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {step === 2 && <RoleEditor store={store} env={draftEnv} roles={roles} setRoles={setRoles} />}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Le contexte commercial de ce client : c'est lui qui décide qu'une actualité est un signal ici, et du bruit ailleurs. Modifiable ensuite depuis la fiche de l'environnement.
          </p>
          {form.modules?.aiInsights === false && (
            <p className="text-xs text-amber-600">La brique « Analyse IA des entreprises » n'est pas cochée à l'étape Modules : la règle sera enregistrée, mais le moteur restera éteint.</p>
          )}
          <NewsRules store={store} value={form.newsRules} onChange={v => setForm(f => ({ ...f, newsRules: v }))} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted">
              Les accès ouverts à la livraison. Le propriétaire est celui qui répond de l'espace :
              sans manager, c'est lui qui tranche les passations.
            </p>
            <button className="btn-primary !py-1.5 text-xs" onClick={addPerson}><UserPlus size={14} /> Ajouter une personne</button>
          </div>
          {form.people.length === 0 && <Empty text="Aucun accès. Vous pourrez aussi en ouvrir plus tard depuis la fiche du projet." />}
          {form.people.map(p => (
            <div key={p.id} className="rounded-xl border border-line p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input className="input !py-1.5 text-sm" placeholder="Prénom" value={p.prenom} onChange={e => setPerson(p.id, { prenom: e.target.value })} />
                <input className="input !py-1.5 text-sm" placeholder="Nom" value={p.nom} onChange={e => setPerson(p.id, { nom: e.target.value })} />
                <input className="input !py-1.5 text-sm" placeholder="Poste" value={p.poste} onChange={e => setPerson(p.id, { poste: e.target.value })} />
                <select className="input !py-1.5 text-sm" value={p.service} onChange={e => setPerson(p.id, { service: e.target.value })}>
                  {form.services.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                </select>
                <input className="input !py-1.5 text-sm" placeholder="E-mail" value={p.email} onChange={e => setPerson(p.id, { email: e.target.value })} />
                <input className="input !py-1.5 text-sm" placeholder="Pseudo" value={p.pseudo} onChange={e => setPerson(p.id, { pseudo: e.target.value })} />
                <input className="input !py-1.5 text-sm" placeholder="Mot de passe" value={p.password} onChange={e => setPerson(p.id, { password: e.target.value })} />
                <select className="input !py-1.5 text-sm" value={p.roleId} onChange={e => setPerson(p.id, { roleId: e.target.value })}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 flex-wrap text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={p.isManager} onChange={e => setPerson(p.id, { isManager: e.target.checked })} /> Manager
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="owner" checked={p.isOwner}
                    onChange={() => setForm(f => ({ ...f, people: f.people.map(x => ({ ...x, isOwner: x.id === p.id })) }))} /> Propriétaire de l'espace
                </label>
                <button className="btn-ghost !py-0.5 !text-red-500 ml-auto" onClick={() => setForm(f => ({ ...f, people: f.people.filter(x => x.id !== p.id) }))}>
                  <Trash2 size={13} /> Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-line p-3 text-sm space-y-1">
            <div><b>{form.name || '— sans nom —'}</b> · offre {offers.find(o => o.id === form.plan)?.name || form.plan}</div>
            <div className="text-muted text-xs">
              {form.templateOf ? `Repris du modèle « ${tplSrc?.name} »` : 'Configuration par défaut'} ·
              {' '}{ENV_MODULES.filter(m => form.modules[m.id] !== false).length} module(s) ·
              {' '}{roles.length} rôle(s) · {form.people.length} accès · {form.services.length} service(s)
            </div>
          </div>
          {roles.map(r => <RolePreview key={r.id} store={store} env={draftEnv} role={r} />)}
          {form.people.some(p => !p.email.trim() || !p.pseudo.trim() || !p.password) && (
            <p className="text-xs text-amber-600">Les personnes sans e-mail, pseudo ou mot de passe ne seront pas créées.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-line">
        <button className="btn-ghost text-sm" onClick={onCancel}>Annuler</button>
        <div className="flex gap-2">
          {step > 0 && <button className="btn-ghost text-sm" onClick={() => setStep(s => s - 1)}><ChevronLeft size={15} /> Précédent</button>}
          {step < STEPS.length - 1
            ? <button className="btn-primary text-sm" disabled={!canNext} onClick={() => setStep(s => s + 1)}>Suivant <ChevronRight size={15} /></button>
            : <button className="btn-primary text-sm" disabled={!form.name.trim()} onClick={create}><Rocket size={15} /> Créer l'environnement</button>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Explorateur d'environnements
function Explorer({ store, initialEnvId }) {
  const envs = store.db.environments.filter(e => e.id !== 'env-demo')
  // `initialEnvId` : on arrive depuis une livraison, sur CET environnement-là. Sans quoi il
  // faudrait le retrouver dans la liste, ce qui est exactement le va-et-vient qu'on supprime.
  const [selId, setSelId] = useState(initialEnvId || envs[0]?.id || null)
  const env = envs.find(e => e.id === selId)
  const [asRole, setAsRole] = useState('')
  const [asService, setAsService] = useState('')
  const [editRoles, setEditRoles] = useState(null)

  if (!envs.length) return <Empty text="Aucun environnement. Créez-en un avec l'assistant." />

  const subs = env ? store.db.subenvs.filter(s => s.envId === env.id) : []
  const role = (env?.roles || []).find(r => r.id === asRole) || null
  const inService = asService ? subs.filter(s => s.service === asService || s.serviceId === asService) : subs

  return (
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
      <div className="card p-2 space-y-1 max-h-[70vh] overflow-y-auto">
        {envs.map(e => (
          <button key={e.id} onClick={() => { setSelId(e.id); setAsRole(''); setAsService('') }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm ${selId === e.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-surface'}`}>
            <Building2 size={14} className="shrink-0 opacity-70" />
            <span className="truncate flex-1">{e.name}</span>
          </button>
        ))}
      </div>

      {!env ? <Empty text="Choisissez un environnement." /> : (
        <div className="space-y-3">
          <div className="card p-3 flex items-center gap-2 flex-wrap">
            <span className="font-bold">{env.name}</span>
            <span className="chip bg-surface text-muted">{store.offers().find(o => o.id === env.plan)?.name || env.plan}</span>
            {ENV_MODULES.filter(m => envModuleOn(env, m.id)).map(m => (
              <span key={m.id} className="chip bg-brand/10 text-brand !text-[10px]">{m.label}</span>
            ))}
            <button className="btn-ghost !py-1 text-xs ml-auto" onClick={() => store.enterEnv(env.id)}>
              <LogIn size={13} /> Entrer dans l'environnement
            </button>
          </div>

          {/* Voir comme… Trois entrées, parce qu'on ne cherche pas toujours la même chose :
              un rôle (ce qu'il ouvre), un service (qui le compose), une personne (son cas réel). */}
          <div className="card p-3 space-y-2">
            <div className="text-sm font-bold flex items-center gap-2"><Eye size={15} className="text-brand" /> Voir comme…</div>
            <div className="flex gap-2 flex-wrap text-xs">
              <select className="input !w-auto !py-1.5" value={asRole} onChange={e => setAsRole(e.target.value)}>
                <option value="">Choisir un rôle</option>
                {(env.roles || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="input !w-auto !py-1.5" value={asService} onChange={e => setAsService(e.target.value)}>
                <option value="">Tous les services</option>
                {(env.services || []).map(sv => <option key={sv.id} value={sv.name}>{sv.name}</option>)}
              </select>
            </div>
            {role
              ? <RolePreview store={store} env={env} role={role} />
              : <p className="text-[11px] text-muted">Choisissez un rôle pour voir les onglets et les droits qu'il ouvre, sans vous connecter à sa place.</p>}
          </div>

          <div className="card p-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="text-sm font-bold flex items-center gap-2"><Users2 size={15} className="text-brand" /> Profils ({inService.length})</div>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setEditRoles(env.id)}><ShieldCheck size={13} /> Rôles & onglets</button>
            </div>
            {inService.length === 0 ? <Empty text="Aucun profil dans cet environnement." /> : (
              <div className="space-y-1.5">
                {inService.map(s => {
                  const r = (env.roles || []).find(x => x.id === s.roleId)
                  const acc = store.db.accounts.find(a => a.id === s.ownerId)
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-surface flex-wrap">
                      <span className="font-semibold truncate">{s.prenom} {s.nom}</span>
                      <span className="text-[11px] text-muted">{[s.poste, s.service].filter(Boolean).join(' · ')}</span>
                      {r && <span className="chip bg-card border border-line text-muted !text-[10px]">{r.name}</span>}
                      {env.createdBy === s.ownerId && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 !text-[10px]">propriétaire</span>}
                      <button className="btn-ghost !py-1 text-xs ml-auto" title="Ouvrir cet espace"
                        onClick={() => { store.enterEnv(env.id); store.enterSubEnv(s.id) }}>
                        <LogIn size={12} /> Entrer
                      </button>
                      {acc && env.createdBy !== acc.id && (
                        <button className="btn-ghost !py-1 text-xs" title="Désigner comme propriétaire"
                          onClick={() => { store.setEnvOwner(env.id, acc.id); toast('Propriétaire mis à jour') }}>propriétaire</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {editRoles === env.id && (
            <div className="card p-3 space-y-2">
              <div className="text-sm font-bold">Rôles & onglets — {env.name}</div>
              <LiveRoleEditor store={store} env={env} onClose={() => setEditRoles(null)} />
            </div>
          )}

          {/* Ce que ce client reçoit : modules, offre, membres, accès, déploiement. Ces
              réglages vivaient dans une fenêtre ouverte depuis une livraison — donc loin de
              l'aperçu par rôle, alors que c'est justement lui qui montre l'effet de ce qu'on
              coche. Repliés par défaut : on vient souvent ici pour REGARDER, pas pour changer. */}
          <details className="card p-3">
            <summary className="cursor-pointer text-sm font-bold">
              Ce que ce client reçoit — modules, offre, membres et accès
            </summary>
            <div className="mt-3"><EnvAdmin envId={env.id} store={store} /></div>
          </details>
        </div>
      )}
    </div>
  )
}

// Édition des rôles d'un environnement EXISTANT : brouillon, puis application en une fois.
// Les droits d'accès ne se modifient pas à chaque frappe — on veut pouvoir se raviser.
function LiveRoleEditor({ store, env, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(env.roles || []))
  const dirty = JSON.stringify(draft) !== JSON.stringify(env.roles || [])
  return (
    <div className="space-y-3">
      <RoleEditor store={store} env={env} roles={draft} setRoles={setDraft} />
      <div className="flex justify-end gap-2">
        <button className="btn-ghost text-sm" onClick={onClose}>Fermer</button>
        <button className="btn-primary text-sm" disabled={!dirty}
          onClick={() => { store.saveEnvRoles(env.id, draft); toast('Rôles enregistrés'); onClose() }}>
          Appliquer les rôles
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Page
/**
 * `embedded` : rendu comme vue de « Projets & atelier » plutôt que comme page.
 * `initialEnvId` : ouvert sur un environnement précis, quand on arrive depuis sa livraison.
 * `startInWizard` : ouvert directement sur l'assistant de création.
 * `onCreated` : prévient l'écran parent qu'un environnement vient d'être composé — c'est lui
 *   qui ramène alors vers la livraison correspondante, sans quoi il faudrait aller la chercher.
 */
export default function Workshop({ embedded, initialEnvId, startInWizard, onCreated }) {
  const store = useStore()
  const [mode, setMode] = useState(startInWizard ? 'create' : 'explore')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {!embedded && <h2 className="text-xl font-extrabold flex items-center gap-2"><Hammer size={20} className="text-brand" /> Atelier d'environnement</h2>}
          <p className="text-xs text-muted -mt-0.5">
            Composer un espace client — modules, offre, rôles, équipe — puis vérifier ce que chacun verra.
          </p>
        </div>
        {mode === 'explore' && (
          <button className="btn-primary" onClick={() => setMode('create')}><Plus size={16} /> Nouvel environnement</button>
        )}
      </div>

      {mode === 'create'
        ? <Wizard store={store} onCancel={() => setMode('explore')} onDone={(envId) => { setMode('explore'); onCreated?.(envId) }} />
        : <Explorer store={store} initialEnvId={initialEnvId} />}
    </div>
  )
}
