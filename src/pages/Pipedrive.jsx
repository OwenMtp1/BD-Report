// ---------------------------------------------------------------------------
//  Console « Intégration Pipedrive ».
//
//  Trois temps, dans l'ordre où on les vit : CONNECTER → PRÉPARER LE COMPTE →
//  SYNCHRONISER. Le deuxième n'est pas une formalité qu'on pourrait replier : sans
//  les champs personnalisés et la correspondance des étapes, le premier envoi crée
//  des affaires sans identifiant BD Report — donc des doublons au second envoi, et
//  rien pour les rattraper.
//
//  ⚠️ Chaque bouton qui APPELLE Pipedrive le dit, et rend compte de ce qu'il a fait.
//  Un envoi en lot qui échoue à moitié sans dire lequel est pire qu'un envoi refusé.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useState } from 'react'
import { Link2, Check, AlertTriangle, RefreshCw, Download, Upload, Settings2, Trash2 } from 'lucide-react'
import { useStore, PIPEDRIVE_MODES, fmtDate } from '../store.jsx'
import { Empty, Field, Select, toast } from '../ui.jsx'
import { ImportReport } from './CrmImportReport.jsx'
import { testPipedrive, pipedriveCallLog, clearPipedriveCallLog, isPipedriveConfigured } from '../pipedrive.js'
import { ensureCustomFields, loadPipelines, pushAll, pullAll, customFieldKeys } from '../pipedriveSync.js'
import { applyCrmImport, importSummary } from '../crmImport.js'

export default function Pipedrive() {
  const store = useStore()
  const cfg = store.pipedrive()
  const sub = store.sub
  const [state, setState] = useState(null)     // résultat du test de connexion
  const [busy, setBusy] = useState('')
  const [pipes, setPipes] = useState([])
  const [report, setReport] = useState(null)
  const [log, setLog] = useState(pipedriveCallLog())

  // Le journal se remplit au fil des appels : on l'écoute plutôt que de l'interroger.
  useEffect(() => {
    const on = () => setLog(pipedriveCallLog())
    window.addEventListener('pipedrive-log', on)
    return () => window.removeEventListener('pipedrive-log', on)
  }, [])

  const stages = useMemo(() => {
    const p = pipes.find(x => String(x.id) === String(cfg.pipelineId))
    return p?.stages || []
  }, [pipes, cfg.pipelineId])

  const phases = (sub?.phases || [])
  const run = async (name, fn) => {
    setBusy(name)
    try { return await fn() } catch (e) { toast(`Pipedrive : ${e.message}`); return null } finally { setBusy('') }
  }

  const test = () => run('test', async () => {
    const r = await testPipedrive()
    setState(r)
    toast(`Connecté à ${r.company || r.email || 'Pipedrive'}`)
  })

  const prepare = () => run('prepare', async () => {
    const { created, keys } = await ensureCustomFields()
    // ⚠️ Les clés sont ENREGISTRÉES : elles sont propres à ce compte Pipedrive, et
    // les redécouvrir à chaque envoi coûterait un appel par lot pour rien.
    store.setPipedriveConfig({ fieldKeys: keys })
    const list = await loadPipelines()
    setPipes(list)
    toast(created.length ? `${created.length} champ(s) créé(s)` : 'Champs déjà en place')
  })

  const sync = () => run('sync', async () => {
    const rdvs = sub?.rdvs || []
    const r = await pushAll({ rdvs }, cfg, ({ done, total, label }) => setBusy(`sync:${done}/${total} — ${label}`))
    setReport(r)
    toast(r.errors.length ? `${r.done - r.errors.length}/${r.total} envoyés, ${r.errors.length} en erreur` : `${r.total} affaire(s) envoyée(s)`)
  })

  // ⚠️ L'import ÉCRIT désormais chez nous. Il ne faisait que compter, ce qui n'a
  // d'intérêt pour personne — et le moteur est partagé avec HubSpot (`crmImport.js`) :
  // dédoublonnage, refus d'écraser une saisie, compte rendu, tout est au même endroit.
  const pull = () => run('pull', async () => {
    const rows = await pullAll({ max: 300 })
    let rep = null
    // UNE SEULE écriture à la fin : une par contact sérialiserait tout l'état autant
    // de fois, et l'interface se figerait le temps de l'import.
    store.setSub(d => { const r = applyCrmImport(d, rows, 'Pipedrive'); rep = r.report; return r.data })
    if (rows.errors.length) rep.errors = rows.errors
    setReport(rep)
    toast(importSummary(rep))
  })

  if (!sub) return null
  const ready = isPipedriveConfigured()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Link2 size={20} className="text-brand" /> Intégration Pipedrive</h2>
        {state?.ok && <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check size={12} /> {state.company || state.email}</span>}
      </div>

      {/* 1 — CONNEXION */}
      <div className="card p-4 space-y-3">
        <div className="font-bold text-sm">1. Connexion</div>
        <div className="flex gap-3 flex-wrap items-end">
          <Field label="Mode">
            <select className="input !w-auto" value={cfg.mode} onChange={e => store.setPipedriveConfig({ mode: e.target.value })}>
              {PIPEDRIVE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          {/* ⚠️ Deux champs de même forme au même endroit : sans `key` distincte, React
              réutilise le même nœud et le fait passer de non contrôlé (le jeton, en
              `defaultValue`) à contrôlé (l'URL, en `value`) — d'où un avertissement, et
              surtout une valeur qui peut survivre d'un mode à l'autre. */}
          {cfg.mode === 'relay' ? (
            <Field key="relay" label={cfg.relayInherited ? 'URL du relais (héritée)' : 'URL du relais'}>
              {/* ⚠️ HÉRITÉE DU RELAIS DES SIGNAUX : c'est le même worker Cloudflare, les
                  routes /pipedrive/* y vivent. Rien à saisir ici tant que l'éditeur a
                  publié son URL — la remplir n'a de sens que pour viser un AUTRE relais. */}
              <input className="input !w-80" placeholder="https://mon-relais.workers.dev" value={cfg.relayUrl || ''}
                onChange={e => store.setPipedriveConfig({ relayUrl: e.target.value.trim() })} />
            </Field>
          ) : (
            <Field key="direct" label="Jeton d'API (ce navigateur uniquement)">
              <input className="input !w-80" type="password" defaultValue={store.pipedriveToken()}
                onBlur={e => { store.setPipedriveToken(e.target.value.trim()); toast('Jeton enregistré localement') }} />
            </Field>
          )}
          <button className="btn-ghost" disabled={!!busy} onClick={test}><RefreshCw size={14} /> Tester la connexion</button>
        </div>
        {cfg.mode === 'relay' && cfg.relayInherited && (
          <p className="text-xs text-muted">Relais hérité de celui publié par l'équipe BD Report — rien à saisir. Ne le remplacez que pour viser un autre relais.</p>
        )}
        {cfg.mode === 'relay' && !cfg.relayUrl && (
          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Aucun relais publié : l'équipe BD Report doit renseigner son URL dans Paramètres → Intégrations.</span>
          </p>
        )}
        {cfg.mode === 'direct' && (
          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Un jeton d'API ouvre tout le compte Pipedrive. En mode direct il reste dans ce navigateur — il n'est pas synchronisé, mais il est lisible par qui y a accès. Le relais est le mode recommandé.</span>
          </p>
        )}
      </div>

      {/* 2 — PRÉPARATION */}
      <div className="card p-4 space-y-3">
        <div className="font-bold text-sm">2. Préparer le compte</div>
        <p className="text-xs text-muted">
          Crée dans Pipedrive les champs BD Report manquants et charge vos pipelines. À faire une fois, avant la première synchronisation.
        </p>
        <button className="btn-primary !py-1.5 text-sm" disabled={!ready || !!busy} onClick={prepare}>
          <Settings2 size={14} /> {busy === 'prepare' ? 'Préparation…' : 'Préparer le compte'}
        </button>

        {pipes.length > 0 && (
          <div className="space-y-3 pt-2">
            <Field label="Pipeline visé">
              <select className="input !w-auto" value={cfg.pipelineId || ''} onChange={e => store.setPipedriveConfig({ pipelineId: e.target.value })}>
                <option value="">—</option>
                {pipes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {stages.length > 0 && (
              <div>
                <div className="label">Correspondance de vos étapes</div>
                <div className="space-y-1.5">
                  {phases.map(ph => (
                    <div key={ph} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 truncate">{ph}</span>
                      <span className="text-muted">→</span>
                      <select className="input !w-auto !py-1 text-sm"
                        value={(cfg.stageMap || {})[ph] || ''}
                        onChange={e => store.setPipedriveConfig({ stageMap: { ...(cfg.stageMap || {}), [ph]: e.target.value } })}>
                        <option value="">— étape par défaut —</option>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted mt-2">
                  Une étape non renseignée envoie l'affaire dans l'étape par défaut du pipeline. Les phases gagnées et perdues marquent aussi l'affaire comme telle dans Pipedrive.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3 — SYNCHRONISATION */}
      <div className="card p-4 space-y-3">
        <div className="font-bold text-sm">3. Synchroniser</div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary !py-1.5 text-sm" disabled={!ready || !!busy} onClick={sync}>
            <Upload size={14} /> {busy.startsWith('sync') ? busy.replace('sync:', 'Envoi ') : `Envoyer mes ${(sub.rdvs || []).length} affaire(s)`}
          </button>
          <button className="btn-ghost !py-1.5 text-sm" disabled={!ready || !!busy} onClick={pull}>
            <Download size={14} /> Lire ce qu'il y a dans Pipedrive
          </button>
        </div>
        {!customFieldKeys().deal?.bdr_rdv_id && (
          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Lancez d'abord « Préparer le compte » : sans l'identifiant BD Report, un second envoi créerait des doublons au lieu de mettre à jour.</span>
          </p>
        )}
      </div>

      {/* Compte rendu du dernier geste */}
      {report && (
        <div className="card p-3 space-y-1.5">
          <div className="text-sm font-bold">Dernier échange</div>
          {report.contacts && <ImportReport r={report} />}
          {report.total !== undefined && <p className="text-xs">{report.done - report.errors.length} envoyé(s) sur {report.total}.</p>}
          {(report.errors || []).map((e, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <span className="shrink-0">⚠️</span><span className="font-semibold shrink-0">{e.label}</span><span className="text-muted">{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Journal des appels */}
      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold">Journal des appels</span>
          <button className="btn-ghost !p-1 ml-auto" title="Vider le journal" aria-label="Vider le journal"
            onClick={() => { clearPipedriveCallLog(); setLog([]) }}><Trash2 size={13} /></button>
        </div>
        {log.length === 0
          ? <Empty text="Aucun appel pour l'instant." hint="Les échanges avec Pipedrive s'inscrivent ici, avec leur durée et leur résultat." />
          : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className={l.ok ? 'text-emerald-600' : 'text-red-500'}>{l.ok ? '✓' : '✖'}</span>
                  <span className="font-mono shrink-0">{l.method}</span>
                  <span className="truncate flex-1">{l.path}</span>
                  <span className="text-muted shrink-0">{l.ms} ms</span>
                  {!l.ok && <span className="text-red-500 truncate max-w-[40%]">{l.message}</span>}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
