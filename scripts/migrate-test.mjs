// ============================================================================
//  Banc d'essai de la MIGRATION vers le multi-tenant (supabase/migrate_blob_to_orgs.mjs).
//
//  Pourquoi ce fichier existe : la migration est un geste qui ne se joue qu'une
//  fois, sur les VRAIES données, avec la clé `service_role` en main. C'est le
//  pire moment pour découvrir qu'un appel est mal formé. On monte donc un faux
//  Supabase (REST + API admin d'Auth) en mémoire et on fait tourner le script
//  pour de bon contre lui — création des comptes, des orgs, des appartenances
//  et des états chiffrés.
//
//  Ce que le banc vérifie, et que seule une exécution réelle montrait avant :
//   · les trois enveloppes de sauvegarde acceptées (objet nu, {data}, [{data}])
//     — la liste est ce que rendent l'API REST et le bouton « Download » ;
//   · un compte support devient admin plateforme, un membre ne l'est pas ;
//   · l'état de chaque org est chiffré au repos ET relisible à l'identique ;
//   · REJOUER le script ne crée aucun doublon (c'est la promesse de l'étape 5
//     du runbook : re-migrer pour rattraper les écritures de dernière minute).
// ============================================================================
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decryptBlob } from '../src/blobCrypto.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'supabase', 'migrate_blob_to_orgs.mjs')

let failures = 0
const ok = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`)
  else { failures++; console.log(`  ✖ ${label}`) }
}

// --------------------------------------------------------------- Le blob d'essai
const BLOB = {
  version: 1,
  _autoSeed: { kbPublished: ['a'] },
  accounts: [
    { id: '01', email: 'fondateur@bd.fr', pseudo: 'Owen', role: 'Fondateur' },
    { id: '02', email: 'manager@acme.fr', pseudo: 'Bob', role: 'Manager' },
    { id: '03', email: 'membre@globex.fr', pseudo: 'Ana', role: 'Membre' },
    { id: '04', pseudo: 'SansMail', role: 'Membre' },
  ],
  environments: [
    { id: 'e1', name: 'Acme', createdBy: '02', members: ['02'], plan: 'beta' },
    { id: 'e2', name: 'Globex', createdBy: '03', members: ['03'], plan: 'starter' },
  ],
  subenvs: [{ id: 's1', envId: 'e1', name: 'Bob' }, { id: 's2', envId: 'e2', name: 'Ana' }],
  data: { s1: { rdvs: [{ id: 'r1', entreprise: 'Zeta' }] }, s2: { rdvs: [] } },
  tickets: [{ id: 't1', envId: 'e1' }, { id: 't2' }],
  clients: [{ id: 'c1', envId: 'e1' }],
  projects: [{ id: 'p1', envId: 'e2' }],
  supportRequests: [], supportLogs: [], supportTrash: [], cannedReplies: [], kbArticles: [],
}

// --------------------------------------------------------------- Faux Supabase
function makeServer() {
  const state = { users: [], profiles: [], orgs: [], members: [], orgState: [], recovered: [], calls: [] }
  let seq = 0
  const uid = (p) => `${p}-${++seq}`

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const body = raw ? JSON.parse(raw) : null
      const send = (code, val) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(val ?? null)) }
      state.calls.push(`${req.method} ${url.pathname}`)

      // ⚠️ Sans clé de service, Supabase refuse : le banc l'exige aussi, sinon un
      // script qui oublie l'en-tête passerait ici et échouerait seulement en vrai.
      if (req.headers.apikey !== 'service-key-de-test') return send(401, { message: 'clé absente' })

      if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') {
        return send(200, { users: state.users })
      }
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
        if (state.users.some(u => u.email === body.email)) return send(422, { message: 'déjà pris' })
        const u = { id: uid('user'), email: body.email }
        state.users.push(u); return send(200, u)
      }
      if (url.pathname === '/auth/v1/recover') { state.recovered.push(body.email); return send(200, {}) }

      const table = url.pathname.replace('/rest/v1/', '')
      const bag = { profiles: state.profiles, orgs: state.orgs, org_members: state.members, org_state: state.orgState }[table]
      if (!bag) return send(404, { message: `table inconnue : ${table}` })

      if (req.method === 'GET') {
        // Seul filtre utilisé par la migration : meta->>appEnvId=eq.<valeur>
        const want = url.searchParams.get('meta->>appEnvId')
        const hits = want ? bag.filter(r => `eq.${r.meta?.appEnvId}` === want) : bag
        return send(200, hits.map(r => ({ id: r.id, ...r })))
      }
      if (req.method === 'POST') {
        const keys = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean)
        const merge = (req.headers.prefer || '').includes('merge-duplicates')
        const found = keys.length && merge ? bag.find(r => keys.every(k => r[k] === body[k])) : null
        if (found) { Object.assign(found, body); return send(200, [found]) }
        const row = { id: body.id || uid(table), ...body }
        bag.push(row); return send(201, [row])
      }
      return send(405, { message: 'méthode non gérée' })
    })
  })
  return { server, state }
}

// --------------------------------------------------------------- Exécution
// ⚠️ Lancement ASYNCHRONE, et ce n'est pas un détail de style : le faux Supabase
// tourne dans CE processus. Avec spawnSync, le parent gèle le temps de l'enfant —
// donc le serveur ne répond jamais à la requête que l'enfant lui adresse, et les
// deux s'attendent indéfiniment. Le banc se bloquait lui-même.
function run(blobPath, url, extra = [], key = 'service-key-de-test') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, `--blob=${blobPath}`, ...extra], {
      env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE: key },
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

console.log('\n=== MIGRATION VERS LE MULTI-TENANT ===')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdr-mig-'))
const plain = path.join(tmp, 'plain.json')
const wrapped = path.join(tmp, 'wrapped.json')
const listed = path.join(tmp, 'listed.json')
fs.writeFileSync(plain, JSON.stringify(BLOB))
fs.writeFileSync(wrapped, JSON.stringify({ data: BLOB }))
fs.writeFileSync(listed, JSON.stringify([{ id: 'main', data: BLOB }]))

const { server, state } = makeServer()
await new Promise(r => server.listen(0, '127.0.0.1', r))
const URL_BASE = `http://127.0.0.1:${server.address().port}`

// --- 1. Les trois enveloppes de sauvegarde sont lues -------------------------
console.log('\n· Enveloppes de sauvegarde acceptées')
for (const [label, file] of [['objet nu', plain], ['{ data: … }', wrapped], ['[ { data: … } ] (export REST)', listed]]) {
  const r = await run(file, URL_BASE)
  ok(r.status === 0 && /Comptes  : 4/.test(r.stdout), `${label} → dry-run lit le blob`)
}
{
  const bad = path.join(tmp, 'deux.json')
  fs.writeFileSync(bad, JSON.stringify([{ data: BLOB }, { data: BLOB }]))
  const r = await run(bad, URL_BASE)
  ok(r.status !== 0 && /exactement une/.test(r.stderr), 'deux lignes → refus explicite plutôt que migration partielle')
}

// --- 2. Le dry-run n'écrit rien ---------------------------------------------
console.log('\n· Dry-run')
ok(state.users.length === 0 && state.orgs.length === 0, 'aucune écriture (ni compte, ni org)')

// --- 3. Migration réelle -----------------------------------------------------
console.log('\n· Migration (--commit)')
const first = await run(plain, URL_BASE, ['--commit', '--no-mail'])
ok(first.status === 0, 'le script se termine sans erreur')
ok(state.users.length === 3, `3 comptes Auth créés, le compte sans e-mail écarté (${state.users.length})`)
ok(/sans e-mail/.test(first.stdout), 'le compte sans e-mail est SIGNALÉ, pas avalé en silence')
ok(state.profiles.find(p => p.email === 'fondateur@bd.fr')?.is_platform_admin === true, 'le Fondateur est admin plateforme')
ok(state.profiles.find(p => p.email === 'manager@acme.fr')?.is_platform_admin === false, 'un Manager client ne l\'est PAS')
ok(state.orgs.length === 3, `2 orgs clientes + 1 plateforme (${state.orgs.length})`)

const orgOf = (envId) => state.orgs.find(o => o.meta?.appEnvId === envId)
const membersOf = (envId) => state.members.filter(m => m.org_id === orgOf(envId)?.id)
ok(membersOf('e1').length === 1 && membersOf('e2').length === 1, 'chaque org cliente a son membre')
ok(membersOf('platform').length === 1, 'le support est membre de l\'org plateforme')
{
  // 🔒 Le cœur de la tâche : personne ne doit se retrouver membre des deux clients.
  const uidBob = state.users.find(u => u.email === 'manager@acme.fr').id
  ok(!state.members.some(m => m.user_id === uidBob && m.org_id === orgOf('e2')?.id),
    'le manager d\'Acme n\'est membre d\'aucune autre org')
}

// --- 4. L'état par org est chiffré, et relisible -----------------------------
console.log('\n· État par org')
ok(state.orgState.length === 3, `un org_state par org (${state.orgState.length})`)
{
  const row = state.orgState.find(r => r.org_id === orgOf('e1').id)
  ok(typeof row?.data?._enc === 'string', 'écrit CHIFFRÉ au repos (pas de JSON lisible en base)')
  const back = await decryptBlob(row.data)
  ok(back?.env?.name === 'Acme', 'déchiffré : la bonne société')
  ok(back?.spaces?.s1?.rdvs?.[0]?.entreprise === 'Zeta', 'déchiffré : les données de l\'espace sont là')
  ok(!JSON.stringify(back).includes('Globex'), 'aucune trace de l\'autre client dans cette ligne')
}

// --- 5. Rejouer ne duplique rien --------------------------------------------
console.log('\n· Deuxième exécution (idempotence)')
const before = { users: state.users.length, orgs: state.orgs.length, members: state.members.length, st: state.orgState.length }
const second = await run(plain, URL_BASE, ['--commit', '--no-mail'])
ok(second.status === 0, 'le script se termine sans erreur')
ok(state.users.length === before.users, `aucun compte en double (${state.users.length})`)
ok(state.orgs.length === before.orgs, `aucune org en double (${state.orgs.length})`)
ok(state.members.length === before.members, `aucune appartenance en double (${state.members.length})`)
ok(state.orgState.length === before.st, `aucun org_state en double (${state.orgState.length})`)

// --- 6. La clé de service est bien exigée ------------------------------------
console.log('\n· Garde-fous')
{
  const r = await run(plain, URL_BASE, ['--commit'], '')
  ok(r.status !== 0 && /SUPABASE_SERVICE_ROLE/.test(r.stderr), 'sans clé de service, le script refuse au lieu d\'écrire à moitié')
}
ok(!/service-key-de-test/.test(first.stdout + first.stderr), 'la clé de service n\'apparaît JAMAIS dans la sortie')

server.close()
fs.rmSync(tmp, { recursive: true, force: true })

if (failures) { console.error(`\n✖ migration : ${failures} contrôle(s) en échec`); process.exit(1) }
console.log('\nmigration OK ✓ — enveloppes, comptes, orgs, cloisonnement, chiffrement, idempotence')
