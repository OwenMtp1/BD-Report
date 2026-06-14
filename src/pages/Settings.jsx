import React, { useRef, useState } from 'react'
import { Palette, Globe, LayoutGrid, Plug, User, Trash2, Check, Download, Upload, ShieldCheck, Ban, Lock, Cloud } from 'lucide-react'
import { useStore, hashPw } from '../store.jsx'
import { THEMES, applyTheme } from '../themes.js'
import { Modal, Field, Confirm, toast, CommitInput } from '../ui.jsx'
import { testConnection } from '../supabaseSync.js'
import { SUPABASE_URL, isSupabaseConfigured } from '../supabaseConfig.js'

// Carte « Synchronisation cloud » : test de connexion Supabase en un clic (depuis le navigateur).
function SupabaseCard() {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const configured = isSupabaseConfigured()
  const run = async () => { setBusy(true); setRes(null); setRes(await testConnection()); setBusy(false) }
  return (
    <div className="card p-4 space-y-3 max-w-2xl">
      <h3 className="font-bold flex items-center gap-2"><Cloud size={17} className="text-brand" /> Synchronisation cloud (Supabase)</h3>
      <p className="text-xs text-muted">{configured
        ? 'Vos données sont synchronisées en temps réel entre tous vos appareils.'
        : "Non configurée — l'app fonctionne en local sur cet appareil uniquement."}</p>
      {configured && <div className="text-[11px] text-muted break-all">Projet : {SUPABASE_URL}</div>}
      <button className="btn-primary !py-1.5 text-sm w-fit" onClick={run} disabled={busy || !configured}>
        {busy ? 'Test en cours…' : 'Tester la connexion'}
      </button>
      {res && (
        <div className={`text-sm rounded-xl p-3 ${res.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {res.msg}
        </div>
      )}
    </div>
  )
}

// Génère une copie autonome de l'app (HTML + scripts inlinés) téléchargeable pour un usage local hors-ligne.
function downloadStandaloneApp() {
  const clone = document.documentElement.cloneNode(true)
  const root = clone.querySelector('#root')
  if (root) root.innerHTML = '' // on repart d'une app vierge qui se remonte toute seule à l'ouverture
  const html = '<!doctype html>\n' + clone.outerHTML
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'BDR-Flow-Pro.html'
  a.click()
  URL.revokeObjectURL(a.href)
}

// Détecte si les scripts de l'app sont inlinés (build autonome) ou externes (serveur de dev).
function isStandaloneCapable() {
  return [...document.querySelectorAll('script')].some(s => !s.src && s.textContent.length > 1000)
}

function ImageInput({ value, onChange, label }) {
  const ref = useRef(null)
  return (
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="" className="w-12 h-12 rounded-xl object-cover border border-line" />
        : <div className="w-12 h-12 rounded-xl bg-surface border border-line" />}
      <input type="file" accept="image/*" ref={ref} className="hidden" onChange={e => {
        const f = e.target.files[0]
        if (!f) return
        const r = new FileReader()
        r.onload = () => onChange(String(r.result))
        r.readAsDataURL(f)
      }} />
      <button className="btn-ghost text-xs" onClick={() => ref.current.click()}>{label}</button>
      {value && <button className="text-xs text-red-500 underline" onClick={() => onChange('')}>Retirer</button>}
    </div>
  )
}

export default function Settings({ onEditWidgets, currentTheme, onThemeSaved }) {
  const store = useStore()
  const [tab, setTab] = useState('ux')
  const [pendingTheme, setPendingTheme] = useState(currentTheme)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const importRef = useRef(null)
  const me = store.account
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const canManageSub = !!env && (env.createdBy === me.id || ['Fondateur', 'Administrateur', 'Support BD Report'].includes(me.role))
  const mySubs = store.db.subenvs.filter(s => s.envId === session.envId)
  const curSub = store.db.subenvs.find(s => s.id === session.subEnvId)
  const hubspot = store.sub?.integrations?.hubspot || {}
  const setIntegration = (key, patch) => store.setSub(d => ({ ...d, integrations: { ...(d.integrations || {}), [key]: { ...((d.integrations || {})[key] || {}), ...patch } } }))

  const tabs = [
    ['ux', 'UX & Thèmes', Palette],
    ['widgets', 'Widgets dashboard', LayoutGrid],
    ['envs', 'Gérer mes environnements', Globe],
    ['integrations', 'Intégrations', Plug],
    ['download', "Télécharger l'app", Download],
    ['profile', 'Mon profil', User],
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Paramètres</h2>
      <div className="flex gap-2 flex-wrap">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={`btn text-xs ${tab === id ? 'bg-brand text-white' : 'bg-card border border-line'}`} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'ux' && (
        <div className="card p-4 space-y-4">
          <h3 className="font-bold">Thèmes de design</h3>
          {['static', 'animated'].map(type => (
            <div key={type}>
              <p className="label">{type === 'static' ? 'Thèmes classiques' : 'Ambiances animées'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {THEMES.filter(t => t.type === type).map(t => (
                  <button key={t.id} onClick={() => setPendingTheme(t.id)}
                    className={`rounded-xl border-2 p-2 text-left transition ${pendingTheme === t.id ? 'border-brand' : 'border-line hover:border-muted'}`}>
                    <div className="h-10 rounded-lg mb-1.5" style={{
                      background: t.type === 'animated' ? t.bg : `linear-gradient(120deg, rgb(${t.vars.brand}), rgb(${t.vars.brand2}))`,
                    }} />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{t.name}</span>
                      {pendingTheme === t.id && <Check size={13} className="text-brand" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="btn-primary" onClick={() => { applyTheme(pendingTheme); onThemeSaved(pendingTheme); store.logAction('Paramètres', 'Thème appliqué', THEMES.find(t => t.id === pendingTheme)?.name || pendingTheme) }}>Sauvegarder le thème</button>
        </div>
      )}

      {tab === 'widgets' && (
        <div className="card p-4 space-y-3">
          <h3 className="font-bold">Modifier les widgets dashboard</h3>
          <p className="text-sm text-muted">Réorganisez, masquez ou redimensionnez les briques du Dashboard, façon écran d'accueil iOS : chaque brique a un petit crayon avec un menu pour la masquer ou changer sa taille.</p>
          <button className="btn-primary" onClick={onEditWidgets}>Ouvrir le mode édition des widgets</button>
        </div>
      )}

      {tab === 'envs' && (
        <div className="space-y-3">
          {env && (
            <div className="card p-4 space-y-3">
              <h3 className="font-bold">Environnement : {env.name}</h3>
              {store.readOnly && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 flex items-start gap-2">
                  <Lock size={16} className="mt-0.5 shrink-0" />
                  <div>
                    {env.subState === 'cancelling'
                      ? "Abonnement en cours de résiliation : l'accès est en lecture seule. Seul le Support reste accessible le temps que l'équipe BD Report traite votre demande."
                      : "Cet environnement est bloqué par le support (par ex. en cas d'impayé) : l'accès est en lecture seule. Contactez le support via un ticket pour le débloquer."}
                  </div>
                </div>
              )}
              <Field label="Nom"><CommitInput className="input !w-72" disabled={store.readOnly} value={env.name} onCommit={v => store.updateEnv(env.id, { name: v })} /></Field>
              <Field label="Logo de l'entreprise"><ImageInput value={env.logo} onChange={v => !store.readOnly && store.updateEnv(env.id, { logo: v })} label="Télécharger un logo" /></Field>
              <Field label="Code d'accès (4 chiffres, vide = aucun)">
                <CommitInput className="input !w-32" maxLength={4} disabled={store.readOnly} value={env.pin || ''} sanitize={v => v.replace(/\D/g, '')} onCommit={v => store.updateEnv(env.id, { pin: v })} />
              </Field>
              {env.subState === 'cancelling'
                ? <p className="text-xs text-muted">Résiliation demandée — en attente du traitement par le support.</p>
                : env.subState === 'blocked'
                  ? <p className="text-xs text-muted">Environnement bloqué par le support.</p>
                  : canManageSub
                    ? <button className="btn-danger !py-1.5 text-xs" onClick={() => setConfirmCancel(true)}><Ban size={13} /> Résilier mon abonnement</button>
                    : <p className="text-xs text-muted">Seul le responsable de l'environnement peut résilier l'abonnement.</p>}
            </div>
          )}
          <div className="card p-4 space-y-3">
            <h3 className="font-bold">Devise des primes (cet espace)</h3>
            <p className="text-xs text-muted">Choisissez la devise utilisée pour afficher toutes les primes et montants.</p>
            <div className="flex gap-2">
              {['EUR', 'USD'].map(c => (
                <button key={c} className={`btn text-sm ${(store.sub?.currency || 'EUR') === c ? 'bg-brand text-white' : 'bg-card border border-line'}`}
                  onClick={() => { store.setCurrency(c); store.logAction('Paramètres', 'Devise modifiée', c) }}>
                  {c === 'EUR' ? '€ Euro' : '$ Dollar US'}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-4 space-y-3">
            <h3 className="font-bold">Sous-environnements de {env?.name}</h3>
            <p className="text-xs text-muted">Les codes d'accès ne sont visibles que pour le manager principal de l'environnement, les administrateurs/fondateurs/développeurs, et les managers pour les membres de leur équipe.</p>
            {mySubs.map(s => {
              const owner = store.db.accounts.find(a => a.id === s.ownerId)
              const isPrincipal = env?.createdBy === me.id
              const elevated = ['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur'].includes(me.role) || isPrincipal
              const managesThem = me.role === 'Manager' && owner?.teamOf === me.id
              const own = s.ownerId === me.id
              const canPin = elevated || managesThem || own
              return (
                <div key={s.id} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border-b border-line pb-3">
                  <Field label="Prénom"><CommitInput className="input" value={s.prenom} onCommit={v => store.updateSubEnv(s.id, { prenom: v })} /></Field>
                  <Field label="Nom"><CommitInput className="input" value={s.nom} onCommit={v => store.updateSubEnv(s.id, { nom: v })} /></Field>
                  <Field label="Poste"><CommitInput className="input" value={s.poste} onCommit={v => store.updateSubEnv(s.id, { poste: v })} /></Field>
                  <Field label="Service"><CommitInput className="input" value={s.service} onCommit={v => store.updateSubEnv(s.id, { service: v })} /></Field>
                  <Field label="Code (4 chiffres)">
                    {canPin
                      ? <CommitInput className="input" maxLength={4} value={s.pin} sanitize={v => v.replace(/\D/g, '')} onCommit={v => store.updateSubEnv(s.id, { pin: v })} />
                      : <input className="input" value="••••" disabled title="Code masqué" />}
                  </Field>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="space-y-3">
        <SupabaseCard />
        <div className="card p-4 space-y-3 max-w-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2"><Plug size={17} className="text-brand" /> HubSpot CRM</h3>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={!!hubspot.enabled} onChange={e => setIntegration('hubspot', { enabled: e.target.checked })} /> Activée
            </label>
          </div>
          <Field label="Clé API privée (Private App Token)">
            <input className="input" type="password" placeholder="pat-eu1-..." value={hubspot.token || ''} onChange={e => setIntegration('hubspot', { token: e.target.value })} />
          </Field>
          <Field label="ID du portail HubSpot (optionnel)">
            <input className="input" placeholder="ex : 12345678" value={hubspot.portalId || ''} onChange={e => setIntegration('hubspot', { portalId: e.target.value })} />
          </Field>
          <Field label="Options de synchronisation">
            <div className="space-y-1 text-sm">
              {[['contacts', 'Synchroniser les contacts'], ['deals', 'Synchroniser les transactions (deals)'], ['notes', 'Synchroniser les notes']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!hubspot[k]} onChange={e => setIntegration('hubspot', { [k]: e.target.checked })} /> {l}
                </label>
              ))}
            </div>
          </Field>
          <div className="rounded-xl bg-surface p-3 text-xs text-muted flex gap-2">
            <ShieldCheck size={16} className="text-brand shrink-0 mt-0.5" />
            <span>La configuration est enregistrée ici. La synchronisation réelle vers HubSpot nécessite que l'app soit déployée en ligne avec un proxy serveur (les navigateurs bloquent les appels directs à l'API HubSpot pour des raisons de sécurité). Une fois déployée, la clé ci-dessus active la synchronisation automatique.</span>
          </div>
          <p className="text-xs text-muted">L'intégration LinkedIn a été retirée : LinkedIn ne propose pas d'API publique permettant de récupérer ou d'enrichir des contacts, elle n'était donc pas réalisable.</p>
        </div>
        </div>
      )}

      {tab === 'download' && (
        <div className="card p-4 space-y-3 max-w-2xl">
          <h3 className="font-bold flex items-center gap-2"><Download size={17} className="text-brand" /> Télécharger l'application en local</h3>
          <p className="text-sm text-muted">Téléchargez une copie autonome de BDR Flow Pro dans un seul fichier HTML. Ouvrez-le ensuite directement dans votre navigateur, sans connexion ni serveur — toutes les fonctionnalités restent disponibles et vos données sont conservées sur votre ordinateur.</p>
          {isStandaloneCapable() ? (
            <button className="btn-primary" onClick={downloadStandaloneApp}><Download size={16} /> Télécharger BDR-Flow-Pro.html</button>
          ) : (
            <div className="rounded-xl bg-surface p-3 text-xs text-muted">
              Vous utilisez actuellement la version « serveur de développement ». Le téléchargement autonome fonctionne sur la version compilée (le fichier <code>BDR-Flow-Pro.html</code> ou l'app déployée en ligne).
              <button className="btn-ghost text-xs mt-2" onClick={downloadStandaloneApp}><Download size={14} /> Tenter le téléchargement quand même</button>
            </div>
          )}
          <p className="text-xs text-muted">Astuce : ce fichier téléchargé contient lui-même le bouton de téléchargement, vous pourrez donc toujours en regénérer une copie à jour.</p>

          <div className="border-t border-line pt-3 space-y-2">
            <h4 className="font-bold text-sm">Sauvegarde & restauration des données</h4>
            <p className="text-xs text-muted">Exportez l'intégralité de vos données (tous les environnements, espaces, RDV, notes, contacts, barèmes…) dans un fichier JSON, et restaurez-les sur n'importe quelle copie de l'app.</p>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-ghost text-xs" onClick={() => {
                const blob = new Blob([JSON.stringify(store.db, null, 2)], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `bdr-flow-pro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(a.href)
              }}><Download size={14} /> Exporter mes données (JSON)</button>
              <input type="file" accept=".json" ref={importRef} className="hidden" onChange={e => {
                const f = e.target.files[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => {
                  try {
                    const data = JSON.parse(String(r.result))
                    if (!data.accounts || !data.environments) throw new Error('format')
                    store.setDb(data)
                    setImportMsg('✅ Données restaurées avec succès.')
                  } catch (err) {
                    setImportMsg('❌ Fichier invalide : ce n\'est pas une sauvegarde BDR Flow Pro.')
                  }
                }
                r.readAsText(f)
                e.target.value = ''
              }} />
              <button className="btn-ghost text-xs" onClick={() => importRef.current.click()}><Upload size={14} /> Restaurer une sauvegarde</button>
            </div>
            {importMsg && <p className="text-xs font-semibold">{importMsg}</p>}
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="card p-4 space-y-3 max-w-md">
          <h3 className="font-bold">Mon profil</h3>
          <Field label="Photo de profil"><ImageInput value={me.photo} onChange={v => store.updateAccount(me.id, { photo: v })} label="Changer ma photo" /></Field>
          <Field label="Pseudo"><input className="input" value={me.pseudo} onChange={e => store.updateAccount(me.id, { pseudo: e.target.value })} /></Field>
          <Field label="Nouveau mot de passe">
            <input className="input" type="password" placeholder="Laisser vide pour ne pas changer" defaultValue=""
              onBlur={e => { if (e.target.value) { store.updateAccount(me.id, { password: hashPw(e.target.value) }); e.target.value = ''; toast('Mot de passe mis à jour') } }} />
          </Field>
          {curSub && <Field label="Photo du sous-environnement (organigramme)">
            <ImageInput value={curSub.photo} onChange={v => store.updateSubEnv(curSub.id, { photo: v })} label="Changer la photo" />
          </Field>}
        </div>
      )}

      {confirmCancel && (
        <Confirm yesLabel="Résilier" message="Résilier votre abonnement BD Report pour cet environnement ? Un ticket de résiliation sera ouvert au support et votre accès passera en lecture seule (seul le Support reste accessible)."
          onYes={() => {
            store.cancelSubscription()
            setConfirmCancel(false)
            toast('Demande de résiliation envoyée au support')
            window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'support' }))
          }}
          onNo={() => setConfirmCancel(false)} />
      )}
    </div>
  )
}
