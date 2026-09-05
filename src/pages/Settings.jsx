import React, { useRef, useState, useEffect } from 'react'
import { Palette, Globe, LayoutGrid, Plug, User, Trash2, Check, Download, Upload, ShieldCheck, Ban, Lock, Cloud, GraduationCap } from 'lucide-react'
import { useStore, hashPw } from '../store.jsx'
import { THEMES, applyTheme } from '../themes.js'
import { Modal, Field, Confirm, toast, CommitInput } from '../ui.jsx'
import { testConnection } from '../supabaseSync.js'
import { SUPABASE_URL, isSupabaseConfigured } from '../supabaseConfig.js'

// Gestion des services d'un environnement (organigramme) : création, renommage, suppression.
// Sert aussi à sectoriser l'accès aux conversations.
function EnvServicesCard({ store, env, me }) {
  const [name, setName] = useState('')
  const services = store.envServices(env.id)
  const subs = store.db.subenvs.filter(s => s.envId === env.id)
  const canManage = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(me.role) || env.createdBy === me.id
  const add = () => { if (name.trim()) { store.addService(name.trim()); setName('') } }
  if (!canManage) return null
  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-bold">Services de l'organigramme</h3>
      <p className="text-xs text-muted">Créez les services de « {env.name} » puis affectez chaque personne ci-dessous. Ils permettent aussi de sectoriser l'accès aux conversations.</p>
      <div className="flex gap-2 max-w-md">
        <input className="input flex-1" placeholder="Nom du service (ex : Sales, SDR, CSM…)" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn-primary whitespace-nowrap" onClick={add}><Check size={15} /> Ajouter</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {services.map(v => (
          <span key={v.id} className="chip bg-brand/10 text-brand">
            {v.name} <span className="opacity-60">· {subs.filter(s => s.serviceId === v.id).length}</span>
            <button className="ml-1 text-red-500" onClick={() => store.removeService(v.id)}>✕</button>
          </span>
        ))}
        {services.length === 0 && <span className="text-xs text-muted italic">Aucun service pour l'instant.</span>}
      </div>
    </div>
  )
}

// Outil RGPD : droit d'accès (export JSON) et droit à l'effacement des données
// personnelles d'une personne (recherchée par e-mail) dans l'espace courant.
function RgpdTool({ store }) {
  const [email, setEmail] = useState('')
  const sub = store.sub
  const e = email.trim().toLowerCase()
  const matches = e ? {
    contacts: (sub.contacts || []).filter(c => (c.email || '').toLowerCase() === e),
    coordonneesRdv: (sub.rdvs || []).flatMap(r => (r.contacts || []).filter(c => (c.email || '').toLowerCase() === e).map(c => ({ entreprise: r.entreprise, ...c }))),
    notes: (sub.notes || []).filter(n => (n.content || '').toLowerCase().includes(e) || (n.title || '').toLowerCase().includes(e)),
  } : null
  const count = matches ? matches.contacts.length + matches.coordonneesRdv.length + matches.notes.length : 0
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ email, exportedAt: new Date().toISOString(), matches }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `rgpd-${e.replace(/[^a-z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  const erase = () => {
    if (!e) return
    if (window.confirm(`Supprimer définitivement les données personnelles de ${email} de cet espace (contacts + coordonnées dans les RDV) ? Action irréversible.`)) {
      const r = store.erasePersonData(store.session.subEnvId, e)
      toast(r?.error ? `Erreur : ${r.error}` : `${r.removed || 0} élément(s) personnel(s) supprimé(s)`)
      if (!r?.error) setEmail('')
    }
  }
  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-bold flex items-center gap-2"><ShieldCheck size={17} className="text-brand" /> Conformité RGPD</h3>
      <p className="text-sm text-muted">Droit d'accès et droit à l'effacement : recherchez une personne par e‑mail pour exporter ou supprimer ses données personnelles de cet espace.</p>
      <div className="flex gap-2 flex-wrap items-center">
        <input className="input !w-64 text-sm" type="email" placeholder="email de la personne" value={email} onChange={ev => setEmail(ev.target.value)} />
        {e && <span className="text-xs text-muted">{count} enregistrement(s) trouvé(s)</span>}
      </div>
      {e && (
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost text-xs" disabled={!count} onClick={exportJson}><Download size={14} /> Exporter ses données (JSON)</button>
          <button className="btn-danger text-xs" disabled={!count} onClick={erase}><Trash2 size={14} /> Supprimer ses données</button>
        </div>
      )}
    </div>
  )
}

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

// Carte HubSpot : résumé + accès à la console d'intégration complète.
// (La configuration réelle vit dans « Administration → Intégration HubSpot » ; le jeton
// n'est jamais stocké dans l'état synchronisé, uniquement en local sur l'appareil.)
function HubspotSummaryCard({ store }) {
  const cfg = store.hubspot()
  const ready = cfg.mode === 'direct' ? !!store.hubspotToken() : !!cfg.proxyUrl
  return (
    <div className="card p-4 space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2"><Plug size={17} className="text-brand" /> HubSpot CRM</h3>
        <span className={`chip !text-[10px] ${cfg.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-surface text-muted'}`}>
          {cfg.enabled ? 'Activée' : 'Désactivée'}
        </span>
      </div>
      <p className="text-sm text-muted">
        Envoyez vos RDV, contacts, entreprises et notes vers HubSpot (transactions, rendez-vous et
        associations comprises) et réimportez vos données du portail.
      </p>
      <div className="rounded-xl bg-surface p-3 text-xs space-y-0.5">
        <div>Mode : <b>{cfg.mode === 'direct' ? 'API directe' : 'Relais CORS'}</b></div>
        {cfg.mode === 'proxy' && <div className="truncate">Relais : {cfg.proxyUrl || <span className="text-muted italic">non renseigné</span>}</div>}
        <div>Portail : {cfg.portalId || <span className="text-muted italic">non renseigné</span>}</div>
        <div>Connexion : {ready ? 'prête ✓' : <span className="text-amber-600">à configurer</span>}</div>
        {cfg.lastSyncAt && <div>Dernière synchro : {new Date(cfg.lastSyncAt).toLocaleString('fr-FR')}</div>}
      </div>
      <button className="btn-primary !py-1.5 text-sm w-fit"
        onClick={() => window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'hubspot' }))}>
        <Plug size={15} /> Ouvrir la console HubSpot
      </button>
      <p className="text-xs text-muted">
        L'API HubSpot bloquant les appels directs depuis un navigateur, la connexion passe par un relais
        que vous hébergez (modèle fourni : <code>hubspot/proxy-worker.js</code>). Le jeton reste sur cet appareil.
      </p>
    </div>
  )
}

const RELEASES_URL = 'https://github.com/OwenMtp1/Claude/releases/latest'

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
  // Résout les liens de téléchargement directs (par OS) depuis la dernière release GitHub.
  const [dlUrls, setDlUrls] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('https://api.github.com/repos/OwenMtp1/Claude/releases/latest')
      .then(r => (r.ok ? r.json() : null))
      .then(rel => {
        if (cancelled || !rel || !Array.isArray(rel.assets)) return
        const pick = (...tests) => {
          for (const t of tests) { const a = rel.assets.find(x => t(x.name.toLowerCase())); if (a) return a.browser_download_url }
          return null
        }
        setDlUrls({
          win: pick(n => n.endsWith('-setup.exe'), n => n.endsWith('.msi'), n => n.endsWith('.exe')),
          mac: pick(n => n.endsWith('.dmg')),
          linux: pick(n => n.endsWith('.appimage'), n => n.endsWith('.deb')),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const importRef = useRef(null)
  const me = store.account
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const canManageSub = !!env && (env.createdBy === me.id || ['Fondateur', 'Administrateur', 'Support BD Report'].includes(me.role))
  const mySubs = store.db.subenvs.filter(s => s.envId === session.envId)
  const curSub = store.db.subenvs.find(s => s.id === session.subEnvId)

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
          <div>
            <p className="label">Automatique</p>
            <button onClick={() => setPendingTheme('auto')}
              className={`rounded-xl border-2 p-2 text-left transition w-full sm:w-56 ${pendingTheme === 'auto' ? 'border-brand' : 'border-line hover:border-muted'}`}>
              <div className="h-10 rounded-lg mb-1.5" style={{ background: 'linear-gradient(120deg, #f4f6fa 0 50%, #11141b 50% 100%)' }} />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Auto (système)</span>
                {pendingTheme === 'auto' && <Check size={13} className="text-brand" />}
              </div>
            </button>
            <p className="text-[11px] text-muted mt-1">Suit le mode clair/sombre de votre appareil.</p>
          </div>
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
          {env && <EnvServicesCard store={store} env={env} me={me} />}
          <div className="card p-4 space-y-3">
            <h3 className="font-bold">Sous-environnements de {env?.name}</h3>
            <p className="text-xs text-muted">Les codes d'accès ne sont visibles que pour le manager principal de l'environnement, les administrateurs/fondateurs/développeurs, et les managers pour les membres de leur équipe.</p>
            {mySubs.map(s => {
              const envServices = store.envServices(env?.id)
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
                  <Field label="Service">
                    {envServices.length > 0
                      ? <select className="input" value={s.serviceId || ''} onChange={e => store.assignSubService(s.id, e.target.value || null)}>
                          <option value="">— Sans service —</option>
                          {envServices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      : <CommitInput className="input" value={s.service} onCommit={v => store.updateSubEnv(s.id, { service: v })} />}
                  </Field>
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
        <HubspotSummaryCard store={store} />
        </div>
      )}

      {tab === 'download' && (
        <div className="space-y-3 max-w-2xl">
        <div className="card p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2"><Download size={17} className="text-brand" /> Application de bureau (Windows / macOS)</h3>
          <p className="text-sm text-muted">Installez BD Report en application native sur votre ordinateur. Même expérience, synchronisée dans le cloud.</p>
          <div className="flex gap-2 flex-wrap">
            <a className="btn-primary" href={dlUrls?.win || RELEASES_URL} target="_blank" rel="noopener"><Download size={15} /> Windows</a>
            <a className="btn-primary" href={dlUrls?.mac || RELEASES_URL} target="_blank" rel="noopener"><Download size={15} /> macOS</a>
            <a className="btn-ghost text-xs" href={dlUrls?.linux || RELEASES_URL} target="_blank" rel="noopener">Linux & autres versions</a>
          </div>
          <p className="text-xs text-muted">Téléchargement direct du bon installeur. Build non signée au premier lancement : autorisez l'app (macOS : clic droit → Ouvrir ; Windows : Informations complémentaires → Exécuter quand même).</p>
        </div>
        <div className="card p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2"><GraduationCap size={17} className="text-brand" /> Mode formation / données de démo</h3>
          <p className="text-sm text-muted">Remplissez cet espace de données fictives pour explorer l'app ou former un nouveau BDR, puis videz-le — sans jamais toucher à vos autres espaces.</p>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-primary text-xs" onClick={() => { store.seedDemoSpace(store.session.subEnvId); toast('Données de démo ajoutées à cet espace ✓') }}><GraduationCap size={14} /> Remplir de données de démo</button>
            <button className="btn-danger text-xs" onClick={() => { if (window.confirm('Vider cet espace ? Tous les RDV, contacts et notes de CET espace seront supprimés (barème et objectifs conservés). Vos autres espaces ne sont pas touchés.')) { store.resetSpace(store.session.subEnvId); toast('Espace réinitialisé') } }}><Trash2 size={14} /> Réinitialiser cet espace (vider)</button>
          </div>
        </div>
        <RgpdTool store={store} />
        <div className="card p-4 space-y-3">
          <div className="space-y-2">
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
                    const res = store.restoreBackup(data)
                    if (res?.error) throw new Error(res.error)
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
