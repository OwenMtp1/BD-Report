// ---------------------------------------------------------------------------
//  CE QUE LE CLIENT REÇOIT — la fiche d'administration d'un environnement.
//
//  Ce panneau vivait dans une fenêtre ouverte depuis une LIVRAISON, ce qui mêlait
//  deux questions différentes : « qu'est-ce que ce client reçoit ? » (modules, offre,
//  rôles, membres, accès) et « où en est la mise en place ? » (phases, avancement).
//  La première est un travail de composition : sa place est dans l'atelier, à côté de
//  l'aperçu par rôle, là où l'on voit en direct l'effet de ce qu'on coche.
//
//  Il ne prend plus un projet mais un ENVIRONNEMENT : la livraison n'était qu'un
//  chemin d'accès, jamais le sujet.
// ---------------------------------------------------------------------------
import React, { useState } from 'react'
import { ShieldCheck, Ban, Play, KeyRound, Eraser, UserMinus, Unlock, ShieldAlert, Rocket, LogIn, Trash2, Eye } from 'lucide-react'
import { ENV_MODULES, STATEMENT_MODES, statementMode } from '../store.jsx'
import { Field, Empty, Confirm, toast } from '../ui.jsx'
import { ChipEditor } from './Projects.jsx'

export default function EnvAdmin({ envId, store }) {
  // La livraison n'est plus l'entrée : on la RETROUVE, uniquement pour savoir si
  // l'environnement a déjà été déployé.
  const project = (store.db.projects || []).find(p => p.envId === envId || p.sourceEnvId === envId) || {}
  const env = store.db.environments.find(e => e.id === envId)
  const members = store.envMembers(envId)
  const offers = store.offers()
  const [pwFor, setPwFor] = useState(null)
  const [pwVal, setPwVal] = useState('')
  const [confirm, setConfirm] = useState(null) // { kind, member }
  const canView = store.canResetPasswords()

  const doConfirm = () => {
    const { kind, m } = confirm
    if (kind === 'wipe') { store.wipeSpaceData(m.sub.id); toast('Données de l\'espace effacées') }
    if (kind === 'remove') { store.removeEnvMember(envId, m.account.id); toast('Membre retiré de l\'environnement') }
    if (kind === 'block') { store.blockEnv(envId); toast('Accès du client bloqué') }
    if (kind === 'delEnv') { store.deleteClientEnv(envId); toast('Environnement supprimé') }
    setConfirm(null)
  }
  const confirmText = () => {
    const { kind, m } = confirm
    if (kind === 'wipe') return `Effacer TOUTES les données de l'espace de ${m.sub?.prenom} ? Action irréversible.`
    if (kind === 'remove') return `Retirer ${m.account.pseudo} de l'environnement (avec ses espaces et données) ?`
    if (kind === 'block') return `Bloquer l'environnement « ${env?.name} » ? Son accès passera en lecture seule.`
    return `Supprimer définitivement l'environnement « ${env?.name} » et toutes ses données ? Le client sera classé en « Anciens clients ».`
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="rounded-xl border border-line p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold">Offre de l'environnement</span>
          <select className="input !w-auto" value={env?.plan || ''} onChange={e => { store.setEnvOffer(envId, e.target.value || null); toast('Offre appliquée à l\'environnement') }}>
            <option value="">— Aucune offre —</option>
            {offers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <span className="text-xs text-muted">Applique l'offre au créateur et à tous les membres.</span>
        </div>

        {/* Accès de l'environnement entier : bloquer (lecture seule, ex. impayé) ou supprimer.
            Ces deux gestes vivaient sur la fiche Clients ; ils sont ici, avec le reste de
            l'administration du client, plutôt que dans un second endroit à connaître. */}
        {env && (
          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">Accès de l'environnement</span>
              {env.subState === 'blocked'
                ? <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15 flex items-center gap-1"><ShieldAlert size={11} /> Bloqué</span>
                : env.subState === 'cancelling'
                  ? <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15">Résiliation en cours</span>
                  : <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15">Actif</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {env.subState === 'blocked'
                ? <button className="btn-ghost !py-1.5 text-xs !text-emerald-600" onClick={() => { store.unblockEnv(envId); toast('Environnement débloqué') }}><Unlock size={13} /> Réactiver l'accès</button>
                : <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirm({ kind: 'block' })}><Ban size={13} /> Désactiver l'accès</button>}
              <button className="btn-ghost !py-1.5 text-xs !text-red-600" onClick={() => setConfirm({ kind: 'delEnv' })}><Trash2 size={13} /> Supprimer l'environnement</button>
            </div>
            <p className="text-[11px] text-muted">Désactiver met tout l'environnement en lecture seule (ex. impayé) : le client garde ses données et son accès au support. Supprimer efface ses données et le classe en « Anciens clients ».</p>
          </div>
        )}

        {/* Co-construction : le staff entre dans l'environnement, le règle avec le client, et
            DÉCLARE ensuite qu'il est déployé. Deux gestes distincts, parce qu'ils ne disent pas
            la même chose : l'un ouvre l'atelier, l'autre ferme le cadrage. */}
        {env && (
          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="text-sm font-bold">Mise en place</div>
            <p className="text-[11px] text-muted">
              Entrez dans l'environnement pour le paramétrer avec le client, en voyant en direct
              ce que cela donne. Quand il est prêt, déployez-le : le projet passe de Cadrage à Implémentation.
            </p>
            <div className="flex gap-1.5 flex-wrap">
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => { store.enterEnv(envId) }}>
                <LogIn size={13} /> Entrer dans l'environnement
              </button>
              {project.deployedAt
                ? <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center gap-1">
                    <Rocket size={11} /> déployé{project.deployedBy ? ` par ${project.deployedBy}` : ''}
                  </span>
                : <button className="btn-primary !py-1.5 text-xs" onClick={() => { store.deployEnvProject(envId); toast('Environnement déployé — le projet passe en Implémentation') }}>
                    <Rocket size={13} /> Déployer cet environnement
                  </button>}
            </div>
            <p className="text-[11px] text-muted">
              Entrer chez un client fait passer son projet en <b>Maintenance</b> : le reste de l'équipe
              voit qu'une intervention est en cours et n'y touche pas en même temps.
            </p>
          </div>
        )}

        {/* Modules optionnels : le périmètre réellement livré à ce client. Décocher un module
            le retire de la navigation et des écrans de toute l'entreprise sans rien effacer —
            les données restent, elles redeviennent visibles si on le réactive. */}
        {env && (
          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="text-sm font-bold">Modules installés</div>
            <div className="space-y-1.5">
              {ENV_MODULES.map(m => {
                const on = store.envModules(envId)[m.id]
                return (
                  <div key={m.id} className="flex items-start gap-2 text-sm p-1.5 rounded-lg hover:bg-surface">
                    <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                      <input type="checkbox" className="mt-1" checked={on}
                        onChange={e => { store.setEnvModules(envId, { [m.id]: e.target.checked }); toast(e.target.checked ? `« ${m.label} » activé` : `« ${m.label} » retiré`) }} />
                      <span className="min-w-0">
                        <span className="font-semibold">{m.label}</span>
                        <span className="block text-[11px] text-muted">{m.desc}</span>
                        {on && m.where && <span className="block text-[11px] text-muted italic mt-0.5">Se voit dans {m.where.hint}.</span>}
                      </span>
                    </label>
                    {/* Cocher une case et lire une description ne dit pas ce que le client
                        verra. Ce bouton ouvre l'environnement DIRECTEMENT sur l'écran
                        concerné — sans lui, il fallait entrer, choisir un espace, puis
                        retrouver l'écran à la main, c'est-à-dire ne pas vérifier. */}
                    {on && m.where && (
                      <button className="btn-ghost !py-1 !px-2 text-[11px] shrink-0" title="Ouvrir l'environnement sur cet écran"
                        onClick={() => {
                          if (!store.previewFeature(envId, m.id)) toast("Aucun espace dans cet environnement — impossible d'ouvrir l'écran")
                        }}>
                        <Eye size={12} /> Voir en situation
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-muted">Retirer un module masque ses écrans sans supprimer les données déjà saisies.</p>
          </div>
        )}

        {/* Délivrance du relevé de primes : une règle de fonctionnement du client, réglée à
            la création et modifiable ici. Sans ce réglage, le salarié dépendait entièrement
            de l'initiative de son manager. */}
        {env && store.envModules(envId).statements && (
          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="text-sm font-bold">Relevé de primes — comment il est délivré</div>
            <div className="space-y-1.5">
              {STATEMENT_MODES.map(m => (
                <label key={m.id} className="flex items-start gap-2 text-sm p-1.5 rounded-lg hover:bg-surface cursor-pointer">
                  <input type="radio" name={`stmode-${envId}`} className="mt-1"
                    checked={statementMode(env) === m.id}
                    onChange={() => { store.setStatementMode(envId, m.id); toast(`Relevés : ${m.label.toLowerCase()}`) }} />
                  <span className="min-w-0">
                    <span className="font-semibold">{m.label}</span>
                    <span className="block text-[11px] text-muted">{m.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              Dans les deux cas, le manager signe : « automatique » automatise la demande et la
              remise, jamais la signature.
            </p>
          </div>
        )}

        {/* Droit de closer. Le manager (et à défaut le propriétaire) l'a d'office : ce panneau
            ne sert qu'à l'étendre, jamais à le retirer — une entreprise doit toujours avoir
            quelqu'un capable de trancher. */}
        {env && store.envModules(envId).handoff && (
          <div className="rounded-xl border border-line p-3 space-y-2">
            <div>
              <div className="text-sm font-bold">Qui peut closer les deals</div>
              <p className="text-[11px] text-muted">
                Le manager de l'environnement tranche sur tous les dossiers, y compris les siens.
                Sans manager, c'est le propriétaire. Vous pouvez étendre ce droit ci-dessous.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">Services</div>
              <div className="flex flex-wrap gap-1.5">
                {(env.services || []).map(sv => {
                  const on = store.envClosers(envId).serviceIds.includes(sv.id)
                  return (
                    <button key={sv.id} className={`chip cursor-pointer ${on ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}
                      onClick={() => {
                        const cur = store.envClosers(envId).serviceIds
                        store.setEnvClosers(envId, { serviceIds: on ? cur.filter(x => x !== sv.id) : [...cur, sv.id] })
                        toast(on ? `« ${sv.name} » ne close plus` : `« ${sv.name} » peut closer`)
                      }}>{sv.name}</button>
                  )
                })}
                {(env.services || []).length === 0 && <span className="text-[11px] text-muted italic">Aucun service défini.</span>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">Personnes</div>
              <div className="flex flex-wrap gap-1.5">
                {store.db.subenvs.filter(s => s.envId === envId).map(s => {
                  const on = store.envClosers(envId).subIds.includes(s.id)
                  return (
                    <button key={s.id} className={`chip cursor-pointer ${on ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}
                      onClick={() => {
                        const cur = store.envClosers(envId).subIds
                        store.setEnvClosers(envId, { subIds: on ? cur.filter(x => x !== s.id) : [...cur, s.id] })
                        toast(on ? 'Droit de closing retiré' : 'Droit de closing accordé')
                      }}>{s.prenom} {s.nom}</button>
                  )
                })}
                {store.db.subenvs.filter(s => s.envId === envId).length === 0 && <span className="text-[11px] text-muted italic">Aucun espace collaborateur.</span>}
              </div>
            </div>
          </div>
        )}

        {env && store.envModules(envId).committee && (
          <div className="rounded-xl border border-line p-3 space-y-3">
            <div>
              <div className="text-sm font-bold">Comité d'achat — vocabulaire du client</div>
              <p className="text-[11px] text-muted">
                Les rôles et niveaux de relation proposés sur chaque interlocuteur. Ils varient d'un
                secteur à l'autre : on les adapte ici, une fois, pour toute l'entreprise.
              </p>
            </div>
            <ChipEditor label="Rôles dans la décision" values={store.envCommitteeRoles(envId)}
              onChange={v => store.setCommittee(envId, { roles: v })} />
            <ChipEditor label="Niveaux de relation" values={store.envCommitteeRelations(envId)}
              onChange={v => store.setCommittee(envId, { relations: v })} />
            <p className="text-[11px] text-muted">
              Retirer un rôle ne l'efface pas des rendez-vous qui le portent déjà : il n'est simplement plus proposé.
            </p>
          </div>
        )}

        <div className="space-y-2 max-h-[52vh] overflow-y-auto">
          {members.length === 0 && <Empty text="Aucun utilisateur rattaché à cet environnement." />}
          {members.map(m => {
            const a = m.account
            const isMgr = a.role === 'Manager'
            return (
              <div key={a.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-8 h-8 rounded-full bg-brand/15 text-brand text-[11px] font-extrabold flex items-center justify-center shrink-0">{(a.pseudo || a.email || '?').slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{m.sub ? `${m.sub.prenom} ${m.sub.nom}`.trim() : a.pseudo} {m.isOwner && <span className="chip bg-surface text-muted !text-[10px]">créateur</span>}</div>
                    <div className="text-xs text-muted truncate">{a.email} · {a.role}{a.disabled ? ' · désactivé' : ''}</div>
                  </div>
                  {a.disabled && <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15">Accès coupé</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {m.sub && <button className="btn-ghost !py-1 text-xs" onClick={() => { store.setEmployeeRole(m.sub.id, !isMgr); toast(isMgr ? 'Rôle manager retiré' : 'Nommé manager') }}>
                    <ShieldCheck size={13} /> {isMgr ? 'Retirer manager' : 'Nommer manager'}
                  </button>}
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { store.disableAccount(a.id, !a.disabled); toast(a.disabled ? 'Accès réactivé' : 'Accès désactivé') }}>
                    {a.disabled ? <><Play size={13} /> Réactiver</> : <><Ban size={13} /> Désactiver</>}
                  </button>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { setPwFor(pwFor === a.id ? null : a.id); setPwVal('') }}><KeyRound size={13} /> Mot de passe</button>
                  {m.sub && <button className="btn-ghost !py-1 text-xs" onClick={() => setConfirm({ kind: 'wipe', m })}><Eraser size={13} /> Effacer les données</button>}
                  {!m.isOwner && <button className="btn-ghost !py-1 text-xs !text-red-600" onClick={() => setConfirm({ kind: 'remove', m })}><UserMinus size={13} /> Retirer</button>}
                </div>
                {pwFor === a.id && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {/* Le mot de passe n'est plus lisible : seul son hash est conservé. */}
                    {canView && <span className="text-xs text-muted">mot de passe non lisible</span>}
                    <input className="input !py-1 text-xs !w-48" placeholder="Nouveau mot de passe…" value={pwVal} onChange={e => setPwVal(e.target.value)} />
                    <button className="btn-primary !py-1 text-xs" disabled={!pwVal.trim()} onClick={() => { store.setAccountPassword(a.id, pwVal.trim()); setPwVal(''); toast('Mot de passe mis à jour') }}>Changer</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {confirm && (
        <Confirm
          yesLabel={confirm.kind === 'block' ? 'Désactiver' : confirm.kind === 'delEnv' ? 'Supprimer' : undefined}
          message={confirmText()} onYes={doConfirm} onNo={() => setConfirm(null)} />
      )}
    </div>
  )
}
