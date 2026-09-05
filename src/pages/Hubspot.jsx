import React, { useState, useEffect, useMemo } from 'react'
import {
  Plug, KeyRound, Link2, Upload, Download, RefreshCw, CheckCircle2, XCircle, Play, Unplug,
  ListTree, Wrench, ScrollText, Eye, EyeOff, ExternalLink, AlertTriangle, Users2, Building2, Handshake, ShieldCheck,
} from 'lucide-react'
import { useStore, DEFAULT_PHASES, HUBSPOT_MODES, isSupportRole } from '../store.jsx'
import {
  testHubspotConnection, hubspotCallLog, clearHubspotCallLog, HS_ENDPOINTS, owners as hsOwners,
  openHubspotConnect, newTenantKey, connect as hsConnect,
} from '../hubspot.js'
import {
  DEFAULT_STAGE_MAP, ensureCustomProperties, loadPipelines, pushAll, pushRdv, pushContact,
  pullContacts, pullDeals,
} from '../hubspotSync.js'
import { Field, Empty, toast } from '../ui.jsx'

const Card = ({ icon: Icon, title, desc, children, className = '' }) => (
  <div className={`card p-4 space-y-3 ${className}`}>
    <div>
      <h3 className="font-bold flex items-center gap-2"><Icon size={17} className="text-brand" /> {title}</h3>
      {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
    </div>
    {children}
  </div>
)

// ------------------------------------------------------- 1. Connexion
// Une connexion PAR ENTREPRISE : le client autorise BD Report dans SON portail
// HubSpot. Les jetons restent chez le connecteur (relais), jamais dans l'app.
function ConnectionCard({ store, cfg }) {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const patch = (p) => store.setHubspotConfig(p)
  const staff = isSupportRole(store.account?.role)
  const connected = cfg.mode === 'oauth' ? !!(cfg.portalId && cfg.tenantKey) : !!cfg.portalId
  const companyName = store.currentEnv?.name || ''

  const doConnect = async () => {
    setBusy(true); setRes(null)
    try {
      // La clé d'entreprise est générée une fois puis conservée : c'est elle qui
      // prouve au connecteur que cet espace est bien propriétaire du portail relié.
      const tenantKey = cfg.tenantKey || newTenantKey()
      const out = await openHubspotConnect({
        base: cfg.proxyUrl, tenantId: cfg.tenantId, tenantKey, label: companyName,
      })
      store.connectHubspotPortal({ tenantKey, ...out })
      setRes({ ok: true, msg: `Portail ${out.portalId}${out.hubDomain ? ' (' + out.hubDomain + ')' : ''} relié ✓` })
      toast('HubSpot connecté ✓')
    } catch (e) { setRes({ ok: false, msg: e.message }) }
    setBusy(false)
  }

  const doDisconnect = async () => {
    setBusy(true); setRes(null)
    try { await hsConnect.disconnect() } catch (e) { /* le relais avait peut-être déjà oublié cette entreprise */ }
    store.disconnectHubspotPortal()
    setRes({ ok: true, msg: 'Portail HubSpot déconnecté. Vos données BD Report sont intactes.' })
    setBusy(false)
  }

  const test = async () => {
    setBusy(true); setRes(null)
    setRes(await testHubspotConnection())
    setBusy(false)
  }

  return (
    <Card icon={Plug} title="Connexion à HubSpot"
      desc={`Reliez ${companyName || 'votre entreprise'} à votre propre portail HubSpot. Chaque société relie le sien : les données ne sont jamais mélangées.`}>

      {cfg.mode === 'oauth' && (
        connected ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 space-y-1">
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 size={15} /> Portail HubSpot relié
            </div>
            <div className="text-xs text-emerald-800 dark:text-emerald-300/90 space-y-0.5">
              <div>Portail <b>{cfg.portalId}</b>{cfg.hubDomain ? ` — ${cfg.hubDomain}` : ''}</div>
              {cfg.connectedAt && <div>Autorisé le {new Date(cfg.connectedAt).toLocaleString('fr-FR')}{cfg.connectedBy ? ` par ${cfg.connectedBy}` : ''}</div>}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-surface border border-line p-3 space-y-2">
            <p className="text-sm">
              Cliquez ci-dessous, choisissez votre compte HubSpot et validez les autorisations demandées.
              <b> Aucun jeton à copier</b> : BD Report ne voit jamais votre mot de passe HubSpot.
            </p>
            <p className="text-[11px] text-muted flex items-start gap-1.5">
              <ShieldCheck size={13} className="shrink-0 mt-0.5 text-brand" />
              L'autorisation est révocable à tout moment, ici ou depuis HubSpot (Paramètres → Intégrations → Applications connectées).
            </p>
          </div>
        )
      )}

      {cfg.mode === 'oauth' && !cfg.proxyUrl && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 flex gap-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Aucun connecteur HubSpot n'est publié pour l'instant. {staff
              ? <>Renseignez l'URL du connecteur dans « Réglages avancés » ci-dessous (déploiement : <code>hubspot/SETUP.md</code>).</>
              : <>Ouvrez un ticket auprès du support BD Report pour activer l'intégration.</>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {cfg.mode === 'oauth' && !connected && (
          <button className="btn-primary !py-1.5 text-sm" onClick={doConnect} disabled={busy || !cfg.proxyUrl}>
            {busy ? <RefreshCw size={15} className="animate-spin" /> : <Plug size={15} />} Connecter mon HubSpot
          </button>
        )}
        <button className="btn-ghost !py-1.5 text-sm" onClick={test} disabled={busy}>
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <Plug size={15} />} Tester la connexion
        </button>
        {cfg.mode === 'oauth' && connected && (
          <button className="btn-ghost !py-1.5 text-sm text-red-600" onClick={doDisconnect} disabled={busy}>
            <Unplug size={15} /> Déconnecter
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => patch({ enabled: e.target.checked })} />
          Activer l'intégration HubSpot
        </label>
      </div>

      {res && (
        <div className={`text-sm rounded-xl p-3 flex items-start gap-2 ${res.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {res.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
          <span>{res.msg}</span>
        </div>
      )}

      <button className="text-[11px] text-muted underline w-fit" onClick={() => setAdvanced(a => !a)}>
        {advanced ? 'Masquer' : 'Afficher'} les réglages avancés
      </button>
      {advanced && <AdvancedConnection store={store} cfg={cfg} staff={staff} />}
    </Card>
  )
}

// Réglages avancés : mode de connexion, URL du connecteur, replis par jeton.
// Le client n'a normalement rien à y toucher.
function AdvancedConnection({ store, cfg, staff }) {
  const [token, setToken] = useState(store.hubspotToken())
  const [pat, setPat] = useState('')
  const [shown, setShown] = useState(false)
  const [msg, setMsg] = useState('')
  const patch = (p) => store.setHubspotConfig(p)

  // Mode « application privée » : le jeton part au connecteur, qui le garde côté
  // serveur pour cette entreprise. Il ne reste jamais dans l'état de l'app.
  const savePat = async () => {
    const value = pat.trim(); if (!value) return
    try {
      const tenantKey = cfg.tenantKey || newTenantKey()
      if (!cfg.tenantKey) patch({ tenantKey })
      const out = await hsConnect.saveToken(value)
      store.connectHubspotPortal({ tenantKey, portalId: out.portalId, hubDomain: out.hubDomain })
      setPat(''); setMsg('Jeton enregistré côté connecteur ✓')
      toast('Jeton HubSpot enregistré')
    } catch (e) { setMsg('Erreur : ' + e.message) }
  }

  return (
    <div className="rounded-xl bg-surface p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Mode de connexion">
          <select className="input" value={cfg.mode} onChange={e => patch({ mode: e.target.value })}>
            {HUBSPOT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Identifiant du portail (Hub ID)">
          <input className="input" placeholder="ex : 24123456" value={cfg.portalId} onChange={e => patch({ portalId: e.target.value })} />
        </Field>
        {cfg.mode !== 'direct' && (
          <Field label={staff ? 'URL du connecteur (publiée à tous les clients)' : 'URL du connecteur'}>
            <input className="input" placeholder="https://bdr-hubspot-connector.workers.dev"
              value={cfg.proxyUrl}
              onChange={e => (staff ? store.setHubspotPlatformConfig({ proxyUrl: e.target.value }) : patch({ proxyUrl: e.target.value }))} />
          </Field>
        )}
        {cfg.mode === 'oauth' && (
          <Field label="Jeton d'application privée (gardé par le connecteur)">
            <div className="flex items-center gap-1.5">
              <input className="input font-mono text-xs" type="password" placeholder="pat-eu1-… (facultatif)" value={pat} onChange={e => setPat(e.target.value)} />
              <button type="button" className="btn-ghost !py-1 !px-2 text-xs shrink-0" onClick={savePat} disabled={!pat.trim()}>
                <KeyRound size={13} /> Enregistrer
              </button>
            </div>
          </Field>
        )}
        {cfg.mode !== 'oauth' && (
          <Field label="Jeton d'application privée (cet appareil uniquement)">
            <div className="flex items-center gap-1.5">
              <input className="input font-mono text-xs" type={shown ? 'text' : 'password'} placeholder="pat-eu1-…"
                value={token} onChange={e => setToken(e.target.value)} onBlur={() => store.setHubspotToken(token.trim())} />
              <button type="button" className="btn-ghost !p-2" title={shown ? 'Masquer' : 'Afficher'} onClick={() => setShown(s => !s)}>
                {shown ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
        )}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
      <p className="text-[11px] text-muted">
        Le mode recommandé est « Connexion HubSpot du client » : chaque entreprise relie son portail en un clic et le connecteur
        garde ses jetons côté serveur. Les autres modes n'existent que pour des cas particuliers (portail unique de l'éditeur,
        poste isolé). <a className="text-brand inline-flex items-center gap-0.5" href="https://app.hubspot.com/private-apps" target="_blank" rel="noreferrer">Applications privées HubSpot <ExternalLink size={10} /></a>
      </p>
    </div>
  )
}

// ------------------------------------------------- 2. Préparation du portail
function SetupCard({ store, cfg }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pipes, setPipes] = useState([])
  const [people, setPeople] = useState([])
  const patch = (p) => store.setHubspotConfig(p)

  const createProps = async () => {
    setBusy(true); setMsg('')
    try {
      const created = await ensureCustomProperties(m => setMsg(m))
      setMsg(created.length ? `${created.length} propriété(s) créée(s) : ${created.join(', ')}` : 'Toutes les propriétés BD Report existent déjà dans HubSpot ✓')
      toast('Propriétés HubSpot à jour')
    } catch (e) { setMsg('Erreur : ' + e.message) }
    setBusy(false)
  }
  const loadRefs = async () => {
    setBusy(true); setMsg('')
    try {
      const [p, o] = await Promise.all([loadPipelines(), hsOwners.list().catch(() => ({ results: [] }))])
      setPipes(p); setPeople(o.results || [])
      if (!cfg.pipelineId && p[0]) patch({ pipelineId: p[0].id })
      setMsg(`${p.length} pipeline(s) et ${(o.results || []).length} propriétaire(s) chargés.`)
    } catch (e) { setMsg('Erreur : ' + e.message) }
    setBusy(false)
  }

  const stages = pipes.find(p => p.id === cfg.pipelineId)?.stages || []

  return (
    <Card icon={Wrench} title="Préparation du portail & correspondances"
      desc="Crée les champs BD Report dans HubSpot, puis fait correspondre vos phases à vos étapes de pipeline.">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost !py-1.5 text-sm" onClick={createProps} disabled={busy}>
          <Wrench size={15} /> Créer les propriétés BD Report
        </button>
        <button className="btn-ghost !py-1.5 text-sm" onClick={loadRefs} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Charger pipelines & propriétaires
        </button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Pipeline de transactions">
          <select className="input" value={cfg.pipelineId} onChange={e => patch({ pipelineId: e.target.value })}>
            <option value="">— Pipeline par défaut —</option>
            {pipes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Propriétaire par défaut (commercial)">
          <select className="input" value={cfg.ownerId} onChange={e => patch({ ownerId: e.target.value })}>
            <option value="">— Aucun —</option>
            {people.map(o => <option key={o.id} value={o.id}>{[o.firstName, o.lastName].filter(Boolean).join(' ') || o.email}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">Correspondance des phases BD Report → étapes HubSpot</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEFAULT_PHASES.map(ph => (
            <div key={ph} className="flex items-center gap-2">
              <span className="chip bg-surface text-xs w-20 justify-center shrink-0">{ph}</span>
              <span className="text-muted text-xs">→</span>
              {stages.length ? (
                <select className="input !py-1 text-xs" value={(cfg.stageMap || {})[ph] || ''}
                  onChange={e => patch({ stageMap: { ...(cfg.stageMap || {}), [ph]: e.target.value } })}>
                  <option value="">— Non mappée —</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              ) : (
                <input className="input !py-1 text-xs font-mono" placeholder={DEFAULT_STAGE_MAP[ph] || 'identifiant d\'étape'}
                  value={(cfg.stageMap || {})[ph] || ''}
                  onChange={e => patch({ stageMap: { ...(cfg.stageMap || {}), [ph]: e.target.value } })} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-1">
        {[['syncMeetings', 'Créer aussi un rendez-vous (meeting)'], ['syncNotes', 'Créer aussi une note'], ['autoPush', 'Envoyer automatiquement à chaque enregistrement']].map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={!!cfg[k]} onChange={e => patch({ [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
    </Card>
  )
}

// --------------------------------------------------- 3. Synchronisation
function SyncCard({ store, cfg }) {
  const sub = store.sub || {}
  const rdvs = sub.rdvs || []
  const contacts = sub.contacts || []
  const [prog, setProg] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async (label, fn) => {
    setBusy(true); setReport(null); setProg({ total: 0, done: 0, current: label })
    try {
      const r = await fn()
      setReport(r)
      store.setHubspotConfig({ lastSyncAt: new Date().toISOString(), lastReport: r && r.total != null ? { total: r.total, ok: r.ok, failed: r.failed } : null })
      toast(`${label} terminé`)
    } catch (e) { setReport({ fatal: e.message }) }
    setBusy(false); setProg(null)
  }

  const push = (payload, label) => run(label, async () => {
    const rep = await pushAll(payload, cfg, p => setProg(p))
    // Mémorise les identifiants HubSpot pour que le prochain envoi mette à jour au lieu de dupliquer.
    Object.entries(rep.ids || {}).forEach(([k, ids]) => {
      if (k.startsWith('rdv:')) store.setRdvHubspotIds(k.slice(4), ids)
      if (k.startsWith('contact:') && ids?.contactId) store.setContactHubspotId(k.slice(8), ids.contactId)
    })
    return rep
  })

  const importContacts = () => run('Import des contacts', async () => {
    const rows = await pullContacts({ max: 300 })
    let added = 0
    store.setSub(s => {
      const known = new Set((s.contacts || []).map(c => (c.email || '').toLowerCase()).filter(Boolean))
      const fresh = rows.filter(r => r.email && !known.has(r.email.toLowerCase()))
      added = fresh.length
      return { ...s, contacts: [...(s.contacts || []), ...fresh.map(r => ({ ...r, id: Math.random().toString(36).slice(2, 10) }))] }
    })
    return { imported: rows.length, added }
  })

  const importDeals = () => run('Import des transactions', async () => {
    const rows = await pullDeals({ max: 300, stageMap: cfg.stageMap })
    let added = 0
    store.setSub(s => {
      const known = new Set((s.rdvs || []).map(r => r.hubspot?.dealId || r.hubspotId).filter(Boolean))
      const fresh = rows.filter(r => !known.has(r.hubspotId))
      added = fresh.length
      return {
        ...s,
        rdvs: [...(s.rdvs || []), ...fresh.map(r => ({
          ...r, id: Math.random().toString(36).slice(2, 10), parentId: null,
          history: [], createdAt: new Date().toISOString().slice(0, 10),
        }))],
      }
    })
    return { imported: rows.length, added }
  })

  const stats = [
    { icon: Handshake, label: 'RDV à envoyer', value: rdvs.length },
    { icon: Users2, label: 'Contacts à envoyer', value: contacts.length },
    { icon: Building2, label: 'Entreprises distinctes', value: new Set(rdvs.map(r => r.entreprise).filter(Boolean)).size },
  ]

  return (
    <Card icon={RefreshCw} title="Synchronisation" desc="Envoyez vos données vers HubSpot ou récupérez celles de votre portail.">
      <div className="grid grid-cols-3 gap-2">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl bg-surface p-2.5">
            <div className="text-xl font-extrabold stat-num">{s.value}</div>
            <div className="text-[11px] text-muted flex items-center gap-1"><s.icon size={11} /> {s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => push({ rdvs, contacts }, 'Envoi complet')}>
          <Upload size={15} /> Tout envoyer vers HubSpot
        </button>
        <button className="btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => push({ rdvs }, 'Envoi des RDV')}>
          <Upload size={15} /> Envoyer mes RDV
        </button>
        <button className="btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => push({ contacts }, 'Envoi des contacts')}>
          <Upload size={15} /> Envoyer mes contacts
        </button>
        <button className="btn-ghost !py-1.5 text-sm" disabled={busy} onClick={importContacts}>
          <Download size={15} /> Importer les contacts
        </button>
        <button className="btn-ghost !py-1.5 text-sm" disabled={busy} onClick={importDeals}>
          <Download size={15} /> Importer les transactions
        </button>
      </div>

      {prog && prog.total > 0 && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-surface overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} />
          </div>
          <div className="text-[11px] text-muted">{prog.done}/{prog.total} — {prog.current}</div>
        </div>
      )}

      {report && (
        <div className={`text-sm rounded-xl p-3 ${report.fatal || report.failed ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {report.fatal ? <>Échec : {report.fatal}</>
            : report.imported != null ? <>{report.imported} enregistrement(s) lus, {report.added} ajouté(s) à votre espace.</>
              : <>{report.ok}/{report.total} envoyé(s){report.failed ? `, ${report.failed} en échec` : ''}.</>}
          {report.errors?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {report.errors.slice(0, 8).map((e, i) => <li key={i}>• {e.item} — {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
      {cfg.lastSyncAt && <p className="text-[11px] text-muted">Dernière synchronisation : {new Date(cfg.lastSyncAt).toLocaleString('fr-FR')}</p>}
    </Card>
  )
}

// ------------------------------------------- 4. Explorateur d'appels API
function ExplorerCard() {
  const [out, setOut] = useState(null)
  const [running, setRunning] = useState('')
  const groups = useMemo(() => {
    const m = new Map()
    HS_ENDPOINTS.forEach(e => { if (!m.has(e.group)) m.set(e.group, []); m.get(e.group).push(e) })
    return [...m.entries()]
  }, [])
  const exec = async (e) => {
    setRunning(e.id); setOut(null)
    try { setOut({ id: e.id, ok: true, data: await e.run() }) }
    catch (err) { setOut({ id: e.id, ok: false, data: { erreur: err.message, status: err.status } }) }
    setRunning('')
  }
  return (
    <Card icon={ListTree} title="Explorateur d'appels API"
      desc="Tous les appels disponibles vers HubSpot, exécutables en un clic pour vérifier vos accès et vos scopes.">
      <div className="space-y-3">
        {groups.map(([g, items]) => (
          <div key={g}>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted mb-1">{g}</div>
            <div className="space-y-1">
              {items.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={`chip !text-[10px] ${e.method === 'GET' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{e.method}</span>
                  <span className="flex-1 truncate">{e.label} <span className="text-muted text-[11px] font-mono">{e.path}</span></span>
                  <button className="btn-ghost !py-1 !px-2 text-xs shrink-0" disabled={!!running} onClick={() => exec(e)}>
                    {running === e.id ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />} Exécuter
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {out && (
        <pre className={`text-[11px] rounded-xl p-3 overflow-auto max-h-64 ${out.ok ? 'bg-surface' : 'bg-red-50 text-red-700'}`}>
          {JSON.stringify(out.data, null, 2).slice(0, 4000)}
        </pre>
      )}
    </Card>
  )
}

// ------------------------------------------------------- 5. Journal
function LogCard() {
  const [log, setLog] = useState(hubspotCallLog())
  useEffect(() => {
    const h = () => setLog(hubspotCallLog())
    window.addEventListener('hubspot-log', h)
    return () => window.removeEventListener('hubspot-log', h)
  }, [])
  return (
    <Card icon={ScrollText} title="Journal des appels" desc="Les 200 derniers appels envoyés à HubSpot depuis cet appareil.">
      {log.length === 0 && <Empty text="Aucun appel pour l'instant." />}
      <div className="space-y-1 max-h-64 overflow-auto">
        {log.map((l, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {l.ok ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> : <XCircle size={12} className="text-red-500 shrink-0" />}
            <span className="font-mono text-[10px] text-muted w-12 shrink-0">{l.method}</span>
            <span className="flex-1 truncate font-mono text-[10px]">{l.path}</span>
            <span className="text-muted shrink-0">{l.status} · {l.ms} ms</span>
          </div>
        ))}
      </div>
      {log.length > 0 && <button className="btn-ghost !py-1 text-xs w-fit" onClick={() => { clearHubspotCallLog(); setLog([]) }}>Vider le journal</button>}
    </Card>
  )
}

export default function Hubspot() {
  const store = useStore()
  const cfg = store.hubspot()
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Link2 size={20} className="text-brand" /> Intégration HubSpot</h2>
        <p className="text-xs text-muted -mt-0.5">
          Portail HubSpot de {store.currentEnv?.name || 'votre entreprise'} : connexion, correspondances, synchronisation et catalogue des appels API.
        </p>
      </div>
      <ConnectionCard store={store} cfg={cfg} />
      <SetupCard store={store} cfg={cfg} />
      <SyncCard store={store} cfg={cfg} />
      <ExplorerCard />
      <LogCard />
    </div>
  )
}

// Bouton réutilisable « Envoyer vers HubSpot » pour un enregistrement isolé
// (fiche RDV, fiche contact…). Ne s'affiche que si l'intégration est activée.
export function HubspotPushButton({ entity, type = 'rdv', className = '' }) {
  const store = useStore()
  const cfg = store.hubspot()
  const [busy, setBusy] = useState(false)
  if (!cfg.enabled) return null
  const send = async () => {
    setBusy(true)
    try {
      if (type === 'rdv') { const ids = await pushRdv(entity, cfg); store.setRdvHubspotIds(entity.id, ids); toast('RDV envoyé vers HubSpot ✓') }
      else { const ids = await pushContact(entity, cfg); store.setContactHubspotId(entity.id, ids.contactId); toast('Contact envoyé vers HubSpot ✓') }
    } catch (e) { toast('HubSpot : ' + e.message) }
    setBusy(false)
  }
  return (
    <button type="button" className={`btn-ghost !py-1 text-xs ${className}`} disabled={busy} onClick={send} title="Envoyer vers HubSpot">
      {busy ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} HubSpot
    </button>
  )
}
