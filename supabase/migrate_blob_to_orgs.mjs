// ============================================================================
//  BD Report — Migration one-shot : blob `app_state.main`  →  multi-tenant
//  (auth.users + profiles + orgs + org_members + org_state, isolés par RLS).
//
//  Ce script lit une SAUVEGARDE LOCALE du blob et crée, dans votre projet
//  Supabase, un compte Auth par utilisateur, une organisation par environnement,
//  les appartenances, et l'état découpé par org (réutilise splitDb(), déjà
//  couvert par scripts/mtRoundtrip.mjs).
//
//  Idempotent : ré-exécutable sans doublons (recherche par email / meta.appEnvId).
//  Sûr : DRY-RUN par défaut — n'écrit rien tant que --commit n'est pas passé.
//
//  ⚠️ AUCUNE DÉPENDANCE À INSTALLER. Le script parle à Supabase par son API REST
//  avec le `fetch` de Node — pas via @supabase/supabase-js, qui n'est pas une
//  dépendance du projet (l'application le charge depuis esm.sh, au navigateur).
//  Exiger un `npm i` juste avant de manipuler la clé `service_role` ajoutait une
//  dépendance de plus au moment précis où l'on tient le secret le plus sensible
//  du projet — et c'était de toute façon l'étape sur laquelle le script tombait.
//  Contrepartie assumée : ~80 lignes d'appels REST, couvertes par
//  scripts/migrate-test.mjs (serveur Supabase simulé, joué à chaque `npm run audit`).
//
//  Prérequis (voir supabase/RUNBOOK_SECURITE.md) :
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
const NO_MAIL = !!args['no-mail']
const BLOB_PATH = args.blob
const URL_BASE = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE = process.env.SUPABASE_SERVICE_ROLE

const log = (...a) => console.log(...a)
const die = (m) => { console.error('✖', m); process.exit(1) }
const arr = (x) => Array.isArray(x) ? x : []

if (!BLOB_PATH) die('Passez --blob=chemin/vers/backup.json (export du blob app_state.main).')
if (!fs.existsSync(BLOB_PATH)) die(`Fichier introuvable : ${BLOB_PATH}`)

// ---------------------------------------------------------------- Le blob
// ⚠️ Trois enveloppes possibles, et la plus COURANTE était refusée : l'API REST
// comme le bouton « Download JSON » du tableau de bord rendent une LISTE de
// lignes (`[{ data: {…} }]`), jamais l'objet nu. Le script répondait alors
// « Blob invalide : accounts/environments manquants » — un message qui envoie
// chercher un problème dans les données alors que le fichier est parfait.
async function loadBlob() {
  let raw = JSON.parse(fs.readFileSync(BLOB_PATH, 'utf8'))
  if (Array.isArray(raw)) {
    if (raw.length !== 1) die(`Le fichier contient ${raw.length} lignes ; il en faut exactement une (celle de app_state.main).`)
    raw = raw[0]
  }
  if (raw && raw.data && (isEncrypted(raw.data) || raw.data.accounts)) raw = raw.data
  if (isEncrypted(raw)) {
    const dec = await decryptBlob(raw)
    if (!dec) die('Blob chiffré illisible : la clé applicative ne correspond pas.')
    return dec
  }
  return raw
}

// ---------------------------------------------------------------- REST Supabase
// Un seul point de passage : en-têtes d'auth, erreurs lisibles, réponse vide tolérée.
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${URL_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* réponse non-JSON */ }
  if (!res.ok) {
    const msg = json?.message || json?.error_description || json?.error || json?.msg || text.slice(0, 200) || `HTTP ${res.status}`
    throw new Error(`${method} ${path} → ${res.status} : ${msg}`)
  }
  return json
}

const enc = (v) => encodeURIComponent(String(v))

/** Table PostgREST : insertion-ou-mise-à-jour, avec la ligne en retour. */
const upsert = (table, row, onConflict) =>
  sb(`/rest/v1/${table}${onConflict ? `?on_conflict=${enc(onConflict)}` : ''}`, {
    method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation',
  })

/** Compte Auth existant pour cet e-mail — c'est ce qui rend le script rejouable. */
async function findUserByEmail(email) {
  const target = (email || '').toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const data = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`)
    const users = arr(data?.users)
    if (!users.length) return null
    const hit = users.find(u => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (users.length < 200) return null
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
  const sansEmail = accounts.filter(a => !a.email)
  if (sansEmail.length) log(`• ⚠️ ${sansEmail.length} compte(s) sans e-mail : ils ne pourront pas se connecter (ajoutez-leur une adresse avant de migrer).`)

  if (!COMMIT) {
    log('\nℹ️  Dry-run terminé. Relancez avec --commit (et le service_role) pour appliquer.')
    log('    ⚠️  Chaque compte recevra un e-mail de réinitialisation de mot de passe (aucun mot de passe en clair n\'est migré).')
    return
  }
  if (!URL_BASE || !SERVICE) die('En mode --commit, exportez SUPABASE_URL et SUPABASE_SERVICE_ROLE.')

  // 1) Comptes → auth.users + profiles ------------------------------------
  const uidByAccount = {}
  for (const a of accounts) {
    if (!a.email) { log(`  (compte ${a.id} sans email — ignoré)`); continue }
    let user
    try { user = await findUserByEmail(a.email) } catch (e) { die(e.message) }
    if (!user) {
      // Mot de passe temporaire jamais communiqué : chacun définit le sien par
      // le lien de réinitialisation. Aucun clair n'est migré, c'est délibéré.
      const pw = 'Tmp-' + Math.random().toString(36).slice(2) + '!A9'
      try {
        user = await sb('/auth/v1/admin/users', { method: 'POST', body: { email: a.email, password: pw, email_confirm: true } })
      } catch (e) { log(`  ✖ création ${a.email} : ${e.message}`); continue }
      if (!NO_MAIL) {
        try { await sb('/auth/v1/recover', { method: 'POST', body: { email: a.email } }) } catch { /* l'envoi peut être désactivé */ }
      }
    }
    if (!user?.id) { log(`  ✖ ${a.email} : identifiant Auth absent de la réponse`); continue }
    uidByAccount[a.id] = user.id
    try {
      await upsert('profiles', {
        id: user.id, email: a.email, pseudo: a.pseudo || a.email.split('@')[0],
        photo: a.photo || null, is_platform_admin: SUPPORT_ROLES.includes(a.role),
      }, 'id')
    } catch (e) { log(`  ✖ profil ${a.email} : ${e.message}`); continue }
    log(`  ✓ ${a.email}`)
  }

  // 2) Environnements → orgs (idempotent via meta.appEnvId) -----------------
  const orgIdByEnv = {}
  for (const e of envs) {
    let orgId
    try {
      const found = await sb(`/rest/v1/orgs?select=id&meta->>appEnvId=eq.${enc(e.id)}&limit=1`)
      orgId = arr(found)[0]?.id
      if (!orgId) {
        const made = await sb('/rest/v1/orgs', {
          method: 'POST', prefer: 'return=representation',
          body: { name: e.name, plan: e.plan || 'beta', meta: { appEnvId: e.id, logo: e.logo || '' } },
        })
        orgId = arr(made)[0]?.id
      }
    } catch (err) { log(`  ✖ org ${e.name} : ${err.message}`); continue }
    if (!orgId) { log(`  ✖ org ${e.name} : identifiant absent de la réponse`); continue }
    orgIdByEnv[e.id] = orgId
    // 3) Appartenances
    const members = accounts.filter(a => e.createdBy === a.id || arr(e.members).includes(a.id))
    for (const a of members) {
      const uid = uidByAccount[a.id]; if (!uid) continue
      try { await upsert('org_members', { org_id: orgId, user_id: uid, role: a.role || 'Membre' }, 'org_id,user_id') }
      catch (err) { log(`  ✖ appartenance ${a.email} → ${e.name} : ${err.message}`) }
    }
    log(`  ✓ org « ${e.name} » (${members.length} membre(s))`)
  }

  // 4) Org « plateforme » (support BD Report, données non rattachées) -------
  let platformOrgId
  try {
    const found = await sb(`/rest/v1/orgs?select=id&meta->>appEnvId=eq.platform&limit=1`)
    platformOrgId = arr(found)[0]?.id
    if (!platformOrgId) {
      const made = await sb('/rest/v1/orgs', {
        method: 'POST', prefer: 'return=representation',
        body: { name: 'BD Report — Plateforme', plan: 'beta', meta: { appEnvId: 'platform' } },
      })
      platformOrgId = arr(made)[0]?.id
    }
    for (const a of accounts.filter(x => SUPPORT_ROLES.includes(x.role))) {
      const uid = uidByAccount[a.id]
      if (uid && platformOrgId) await upsert('org_members', { org_id: platformOrgId, user_id: uid, role: a.role }, 'org_id,user_id')
    }
  } catch (err) { log(`  ✖ org plateforme : ${err.message}`) }

  // 5) État par org (chiffré au repos), même découpage que le sync runtime --
  for (const [key, slice] of Object.entries(split)) {
    const orgId = key === PLATFORM_KEY ? platformOrgId : orgIdByEnv[key]
    if (!orgId) continue
    const payload = await encryptBlob({ ...slice, __key: key })
    try {
      await upsert('org_state', { org_id: orgId, data: payload, updated_at: new Date().toISOString() }, 'org_id')
      log(`  ✓ org_state ${key === PLATFORM_KEY ? 'plateforme' : key}`)
    } catch (err) { log(`  ✖ org_state ${key} : ${err.message}`) }
  }

  log('\n✅ Migration terminée. Vérifiez dans Supabase (orgs / org_members / org_state),')
  log('   testez une session utilisateur, PUIS suivez l\'étape 5 du runbook (verrouillage')
  log('   de app_state + rotation de la clé anon) pour rendre l\'isolation effective.')
}

main().catch(e => die(e.stack || e.message))
