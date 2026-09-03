// ============================================================================
//  BD Report — Migration one-shot : blob `app_state.main`  →  multi-tenant
//  (auth.users + profiles + orgs + org_members + org_state, isolés par RLS).
//
//  Ce script lit une SAUVEGARDE LOCALE du blob (jamais la prod en écriture par
//  défaut) et crée, dans votre projet Supabase, un compte Auth par utilisateur,
//  une organisation par environnement, les appartenances, et l'état découpé par
//  org (réutilise splitDb(), déjà couvert par scripts/mtRoundtrip.mjs).
//
//  Idempotent : ré-exécutable sans doublons (recherche par email / meta.appEnvId).
//  Sûr : DRY-RUN par défaut — n'écrit rien tant que --commit n'est pas passé.
//
//  Prérequis (voir supabase/MIGRATION_MULTITENANT.md) :
//    1. schema_multitenant.sql exécuté   2. Supabase Auth (Email) activé
//    3. une sauvegarde du blob exportée en JSON local
//
//  Usage :
//    export SUPABASE_URL="https://xxxx.supabase.co"
//    export SUPABASE_SERVICE_ROLE="eyJ...service_role..."   # jamais commité
//    node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json            # dry-run
//    node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json --commit   # écrit
//
//  Le blob peut être en clair OU chiffré ({_enc:"..."}) : il est déchiffré au
//  besoin avec la clé applicative (src/blobCrypto.js).
// ============================================================================
import fs from 'node:fs'
import { splitDb, PLATFORM_KEY } from '../src/multiTenantSync.js'
import { decryptBlob, encryptBlob, isEncrypted } from '../src/blobCrypto.js'

const SUPPORT_ROLES = ['Fondateur', 'Support BD Report']
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]
}))
const COMMIT = !!args.commit
const BLOB_PATH = args.blob
const URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE

const log = (...a) => console.log(...a)
const die = (m) => { console.error('✖', m); process.exit(1) }
const arr = (x) => Array.isArray(x) ? x : []

if (!BLOB_PATH) die('Passez --blob=chemin/vers/backup.json (export du blob app_state.main).')
if (!fs.existsSync(BLOB_PATH)) die(`Fichier introuvable : ${BLOB_PATH}`)

async function loadBlob() {
  let raw = JSON.parse(fs.readFileSync(BLOB_PATH, 'utf8'))
  // Un export Supabase peut être { data: {...} } ou directement l'objet / le blob chiffré.
  if (raw && raw.data && (isEncrypted(raw.data) || raw.data.accounts)) raw = raw.data
  if (isEncrypted(raw)) {
    const dec = await decryptBlob(raw)
    if (!dec) die('Blob chiffré illisible : la clé applicative ne correspond pas.')
    return dec
  }
  return raw
}

async function getSupabase() {
  if (!COMMIT) return null
  if (!URL || !SERVICE) die('En mode --commit, exportez SUPABASE_URL et SUPABASE_SERVICE_ROLE.')
  let createClient
  try { ({ createClient } = await import('@supabase/supabase-js')) }
  catch { die('Installez la dépendance : npm i @supabase/supabase-js') }
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Trouve un utilisateur Auth par email (pagination) — pour l'idempotence.
async function findUserByEmail(sb, email) {
  const target = (email || '').toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) return null
    const hit = data.users.find(u => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  const db = await loadBlob()
  if (!arr(db.accounts).length || !arr(db.environments).length) die('Blob invalide : accounts/environments manquants.')

  const accounts = arr(db.accounts)
  const envs = arr(db.environments)
  const split = splitDb(db) // { [envId]: slice, platform: slice }

  log(`\n=== Plan de migration ${COMMIT ? '(COMMIT — écriture réelle)' : '(DRY-RUN — aucune écriture)'} ===`)
  log(`• Comptes  : ${accounts.length}  → auth.users + profiles`)
  log(`• Orgs     : ${envs.length}      → orgs (+ 1 org « plateforme »)`)
  log(`• Admins plateforme : ${accounts.filter(a => SUPPORT_ROLES.includes(a.role)).map(a => a.pseudo || a.email).join(', ') || '—'}`)
  for (const e of envs) {
    const members = accounts.filter(a => e.createdBy === a.id || arr(e.members).includes(a.id))
    log(`   – ${e.name} : ${members.length} membre(s), ${arr(split[e.id]?.subenvs).length} espace(s)`)
  }

  const sb = await getSupabase()
  if (!COMMIT) {
    log('\nℹ️  Dry-run terminé. Relancez avec --commit (et le service_role) pour appliquer.')
    log('    ⚠️  Chaque compte recevra un e-mail de réinitialisation de mot de passe (aucun mot de passe en clair n\'est migré).')
    return
  }

  // 1) Comptes → auth.users + profiles ------------------------------------
  const uidByAccount = {}
  for (const a of accounts) {
    if (!a.email) { log(`  (compte ${a.id} sans email — ignoré)`); continue }
    let user = await findUserByEmail(sb, a.email)
    if (!user) {
      const pw = 'Tmp-' + Math.random().toString(36).slice(2) + '!A9'
      const { data, error } = await sb.auth.admin.createUser({ email: a.email, password: pw, email_confirm: true })
      if (error) { log(`  ✖ création ${a.email} : ${error.message}`); continue }
      user = data.user
      // Aucun mot de passe en clair migré : l'utilisateur définit le sien via reset.
      await sb.auth.resetPasswordForEmail?.(a.email).catch(() => {})
    }
    uidByAccount[a.id] = user.id
    await sb.from('profiles').upsert({
      id: user.id, email: a.email, pseudo: a.pseudo || (a.email.split('@')[0]),
      photo: a.photo || null, is_platform_admin: SUPPORT_ROLES.includes(a.role),
    })
    log(`  ✓ ${a.email}`)
  }

  // 2) Environnements → orgs (idempotent via meta.appEnvId) -----------------
  const orgIdByEnv = {}
  for (const e of envs) {
    const { data: existing } = await sb.from('orgs').select('id').eq('meta->>appEnvId', e.id).maybeSingle()
    let orgId = existing?.id
    if (!orgId) {
      const { data, error } = await sb.from('orgs').insert({ name: e.name, plan: e.plan || 'beta', meta: { appEnvId: e.id, logo: e.logo || '' } }).select('id').single()
      if (error) { log(`  ✖ org ${e.name} : ${error.message}`); continue }
      orgId = data.id
    }
    orgIdByEnv[e.id] = orgId
    // 3) Appartenances
    const members = accounts.filter(a => e.createdBy === a.id || arr(e.members).includes(a.id))
    for (const a of members) {
      const uid = uidByAccount[a.id]; if (!uid) continue
      await sb.from('org_members').upsert({ org_id: orgId, user_id: uid, role: a.role || 'Membre' })
    }
    log(`  ✓ org « ${e.name} » (${members.length} membre(s))`)
  }

  // 4) Org « plateforme » (support BD Report, données non rattachées) -------
  let platformOrgId
  {
    const { data: ex } = await sb.from('orgs').select('id').eq('meta->>appEnvId', 'platform').maybeSingle()
    platformOrgId = ex?.id
    if (!platformOrgId) {
      const { data } = await sb.from('orgs').insert({ name: 'BD Report — Plateforme', plan: 'beta', meta: { appEnvId: 'platform' } }).select('id').single()
      platformOrgId = data?.id
    }
    for (const a of accounts.filter(x => SUPPORT_ROLES.includes(x.role))) {
      const uid = uidByAccount[a.id]; if (uid && platformOrgId) await sb.from('org_members').upsert({ org_id: platformOrgId, user_id: uid, role: a.role })
    }
  }

  // 5) État par org (chiffré au repos), même découpage que le sync runtime --
  for (const [key, slice] of Object.entries(split)) {
    const orgId = key === PLATFORM_KEY ? platformOrgId : orgIdByEnv[key]
    if (!orgId) continue
    const payload = await encryptBlob({ ...slice, __key: key })
    const { error } = await sb.from('org_state').upsert({ org_id: orgId, data: payload, updated_at: new Date().toISOString() })
    log(error ? `  ✖ org_state ${key} : ${error.message}` : `  ✓ org_state ${key === PLATFORM_KEY ? 'plateforme' : key}`)
  }

  log('\n✅ Migration terminée. Vérifiez dans Supabase (orgs / org_members / org_state),')
  log('   testez une session utilisateur, PUIS suivez l\'étape 6 du runbook (verrouillage')
  log('   de app_state + rotation de la clé anon) pour rendre l\'isolation effective.')
}

main().catch(e => die(e.stack || e.message))
