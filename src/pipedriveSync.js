// ---------------------------------------------------------------------------
//  Correspondance BD Report ↔ Pipedrive + orchestration des synchronisations.
//
//  Modèle de correspondance :
//    Entreprise d'un RDV   → organization   (clé d'unicité : nom)
//    Contacts d'un RDV     → person         (clé d'unicité : e-mail)
//    RDV                   → deal           (clé d'unicité : champ perso bdr_rdv_id)
//    RDV (créneau)         → activity type « meeting »
//    Notes du RDV          → note
//    Tâches BD Report      → activity type « task »
//
//  ⚠️ LE PIÈGE DE PIPEDRIVE, ET IL EST STRUCTURANT : un champ personnalisé ne se
//  désigne PAS par son nom mais par une CLÉ HACHÉE de 40 caractères, attribuée à la
//  création et différente dans chaque compte. On ne peut donc rien coder en dur :
//  il faut lire les champs du compte, retrouver les nôtres par leur libellé, et
//  mémoriser la correspondance libellé → clé. C'est toute la raison d'être de
//  `ensureCustomFields`, et la différence la plus visible avec HubSpot, où le nom
//  de la propriété SUFFIT.
//
//  ⚠️ UNE AFFAIRE A DEUX AXES chez Pipedrive : `stage_id` (où elle en est) et
//  `status` (open / won / lost). Ne renseigner que l'étape laisserait une affaire
//  signée « ouverte » dans les rapports du client — donc fausse dans SON outil.
// ---------------------------------------------------------------------------
import { crm, fields, pipelines, PipedriveError } from './pipedrive.js'

// ------------------------------------------------- Champs personnalisés BD Report
// `key` est rempli à l'exécution par ensureCustomFields() — jamais écrit en dur.
export const CUSTOM_FIELDS = {
  deal: [
    { name: 'BD Report — ID du RDV', field_type: 'varchar', ref: 'bdr_rdv_id' },
    { name: 'BD Report — Phase', field_type: 'varchar', ref: 'bdr_phase' },
    { name: 'BD Report — Opportunité', field_type: 'varchar', ref: 'bdr_opportunite' },
    { name: 'BD Report — Source', field_type: 'varchar', ref: 'bdr_source' },
    { name: 'BD Report — Date de prise de RDV', field_type: 'date', ref: 'bdr_date_prise_rdv' },
    { name: 'BD Report — Date de passage SQL', field_type: 'date', ref: 'bdr_date_sql' },
  ],
  person: [
    { name: 'BD Report — ID du contact', field_type: 'varchar', ref: 'bdr_contact_id' },
    // Comité d'achat. En TEXTE et non en liste fermée : le vocabulaire est paramétrable
    // par chaque équipe dans BD Report, et une valeur ajoutée par le client ne doit pas
    // faire rejeter l'envoi par Pipedrive.
    { name: 'BD Report — Rôle dans la décision', field_type: 'varchar', ref: 'bdr_role_achat' },
    { name: 'BD Report — Niveau de relation', field_type: 'varchar', ref: 'bdr_relation' },
  ],
  organization: [
    { name: 'BD Report — Secteur', field_type: 'varchar', ref: 'bdr_secteur' },
  ],
}

// Correspondance ref → clé hachée, découverte à l'exécution.
let KEYS = { deal: {}, person: {}, organization: {} }
export const customFieldKeys = () => JSON.parse(JSON.stringify(KEYS))
export const setCustomFieldKeys = (k) => { KEYS = { deal: {}, person: {}, organization: {}, ...(k || {}) } }
const keyOf = (kind, ref) => KEYS[kind]?.[ref] || ''

/**
 * Crée les champs BD Report manquants et mémorise leur clé. Idempotent : on lit
 * d'abord ce qui existe, on ne crée que le reste, et on retient les clés dans tous
 * les cas — y compris quand tout existait déjà.
 */
export async function ensureCustomFields(onProgress = () => {}) {
  const created = []
  for (const [kind, defs] of Object.entries(CUSTOM_FIELDS)) {
    let existing = []
    try { existing = (await fields.list(kind)) || [] } catch (e) { /* on tente quand même la création */ }
    const byName = new Map(existing.map(f => [String(f.name || '').trim(), f]))
    for (const def of defs) {
      const found = byName.get(def.name)
      if (found) { KEYS[kind][def.ref] = found.key; continue }
      try {
        const made = await fields.create(kind, { name: def.name, field_type: def.field_type })
        KEYS[kind][def.ref] = made?.key || ''
        created.push(`${kind} · ${def.name}`)
        onProgress({ kind, name: def.name })
      } catch (e) {
        throw new PipedriveError(`Impossible de créer le champ « ${def.name} » : ${e.message}`, { cause: e })
      }
    }
  }
  return { created, keys: customFieldKeys() }
}

// ------------------------------------------------------- Étapes et issue
/**
 * ⚠️ `stageMap` est une correspondance PHASE BD REPORT → id d'étape Pipedrive, et
 * elle ne peut pas avoir de valeur par défaut utile : les identifiants d'étape sont
 * propres à chaque compte. Sans correspondance, l'affaire part dans l'étape par
 * défaut du pipeline plutôt que nulle part — perdre le rattachement serait pire que
 * de le placer approximativement, puisqu'on peut corriger l'un et pas l'autre.
 */
const WON = new Set(['Signée', 'Gagnée'])
const LOST = new Set(['KO', 'Perdue'])
export function dealStatusFor(rdv) {
  const phase = rdv?.closing?.phase || rdv?.phase || ''
  if (WON.has(phase)) return 'won'
  if (LOST.has(phase)) return 'lost'
  return 'open'
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null))
const dateOnly = (d) => (d ? String(d).slice(0, 10) : undefined)

// ------------------------------------------------------------------- Upserts
async function upsertOrganization(rdv) {
  const name = String(rdv.entreprise || '').trim()
  if (!name) return null
  const found = await crm.search('organizations', name).catch(() => [])
  const body = clean({ name, [keyOf('organization', 'bdr_secteur')]: rdv.secteur })
  if (found[0]?.id) {
    // On ne réécrit que ce qu'on apporte : écraser le nom d'une fiche existante avec
    // notre orthographe ferait perdre au client son propre travail de nettoyage.
    const patch = clean({ [keyOf('organization', 'bdr_secteur')]: rdv.secteur })
    if (Object.keys(patch).length) await crm.update('organizations', found[0].id, patch)
    return found[0]
  }
  return crm.create('organizations', body)
}

async function upsertPerson(contact, { orgId, source } = {}) {
  const email = String(contact.email || '').trim()
  const name = [contact.prenom, contact.nom].filter(Boolean).join(' ').trim() || contact.nom || email
  if (!name) return null
  // L'e-mail est la clé d'unicité : deux personnes peuvent porter le même nom, pas la
  // même adresse. Sans e-mail on retombe sur le nom, faute de mieux.
  const found = email
    ? await crm.search('persons', email, { fields: 'email' }).catch(() => [])
    : await crm.search('persons', name).catch(() => [])
  const body = clean({
    name,
    email: email ? [{ value: email, primary: true }] : undefined,
    phone: contact.tel ? [{ value: contact.tel, primary: true }] : undefined,
    job_title: contact.poste,
    org_id: orgId,
    [keyOf('person', 'bdr_contact_id')]: contact.id,
    [keyOf('person', 'bdr_role_achat')]: contact.role,
    [keyOf('person', 'bdr_relation')]: contact.relation,
  })
  if (found[0]?.id) { await crm.update('persons', found[0].id, body); return found[0] }
  return crm.create('persons', body)
}

/**
 * L'affaire. ⚠️ La recherche se fait sur NOTRE identifiant, jamais sur le titre :
 * deux rendez-vous chez la même société porteraient le même titre, et l'envoi
 * écraserait l'un par l'autre.
 */
async function upsertDeal(rdv, cfg, { orgId, personId } = {}) {
  const idKey = keyOf('deal', 'bdr_rdv_id')
  if (!idKey) throw new PipedriveError("Les champs BD Report ne sont pas encore créés dans Pipedrive : lancez « Préparer le compte » avant la première synchronisation.")

  const title = [rdv.entreprise, rdv.opportunite].filter(Boolean).join(' — ') || rdv.entreprise || 'Affaire BD Report'
  const status = dealStatusFor(rdv)
  const body = clean({
    title,
    org_id: orgId,
    person_id: personId,
    value: rdv.montant ? Number(rdv.montant) : undefined,
    currency: rdv.montant ? (cfg.currency || 'EUR') : undefined,
    pipeline_id: cfg.pipelineId || undefined,
    stage_id: (cfg.stageMap || {})[rdv.phase] || undefined,
    status,
    // Pipedrive exige la date de clôture pour une affaire gagnée ou perdue ; sans
    // elle, l'affaire est bien marquée mais n'apparaît dans aucun rapport de période.
    won_time: status === 'won' ? dateOnly(rdv.closing?.wonAt || rdv.dateRdv) : undefined,
    lost_time: status === 'lost' ? dateOnly(rdv.closing?.lostAt || rdv.dateRdv) : undefined,
    lost_reason: status === 'lost' ? (rdv.closing?.lostReason || undefined) : undefined,
    [idKey]: rdv.id,
    [keyOf('deal', 'bdr_phase')]: rdv.phase,
    [keyOf('deal', 'bdr_opportunite')]: rdv.opportunite,
    [keyOf('deal', 'bdr_source')]: rdv.source,
    [keyOf('deal', 'bdr_date_prise_rdv')]: dateOnly(rdv.datePriseRdv),
    [keyOf('deal', 'bdr_date_sql')]: dateOnly(rdv.datePassageSQL),
  })

  const found = await crm.search('deals', rdv.id, { fields: 'custom_fields' }).catch(() => [])
  const mine = found.find(d => String(d[idKey] || '') === String(rdv.id)) || null
  if (mine?.id) { await crm.update('deals', mine.id, body); return { ...mine, ...body, id: mine.id } }
  return crm.create('deals', body)
}

// ------------------------------------------------------------------- Envois
export async function pushRdv(rdv, cfg = {}) {
  const out = { rdvId: rdv.id, personIds: [] }

  const org = await upsertOrganization(rdv)
  out.orgId = org?.id

  for (const contact of (rdv.contacts || [])) {
    if (!contact.email && !contact.nom) continue
    const p = await upsertPerson(contact, { orgId: out.orgId, source: rdv.source })
    if (p?.id) out.personIds.push(p.id)
  }

  const deal = await upsertDeal(rdv, cfg, { orgId: out.orgId, personId: out.personIds[0] })
  out.dealId = deal?.id

  if (cfg.syncMeetings !== false && rdv.dateRdv) {
    await crm.create('activities', clean({
      subject: `RDV — ${rdv.entreprise || ''}`.trim(),
      type: 'meeting',
      due_date: dateOnly(rdv.dateRdv),
      due_time: rdv.heureRdv || undefined,
      deal_id: out.dealId,
      org_id: out.orgId,
      person_id: out.personIds[0],
      // Un rendez-vous passé est marqué fait : sinon il s'empile dans les tâches en
      // retard du client, et son agenda Pipedrive devient inutilisable.
      done: dateOnly(rdv.dateRdv) < new Date().toISOString().slice(0, 10),
    }))
  }

  if (cfg.syncNotes !== false && rdv.notes) {
    await crm.create('notes', clean({ content: rdv.notes, deal_id: out.dealId, org_id: out.orgId }))
  }

  return out
}

export async function pushContact(contact, cfg = {}) {
  let orgId
  if (contact.entreprise) {
    const org = await upsertOrganization({ entreprise: contact.entreprise, secteur: contact.secteur })
    orgId = org?.id
  }
  const p = await upsertPerson(contact, { orgId })
  return { personId: p?.id, orgId }
}

export async function pushTask(task, cfg = {}) {
  const t = await crm.create('activities', clean({
    subject: task.titre || task.title || 'Tâche BD Report',
    type: 'task',
    due_date: dateOnly(task.echeance || task.due),
    note: task.details || undefined,
    done: !!task.done,
  }))
  return { activityId: t?.id }
}

/**
 * Envoi en lot, tolérant aux erreurs : un rendez-vous qui échoue ne doit pas
 * interrompre les 200 suivants. Chaque échec repart avec SA raison — c'est ce qui
 * permet de corriger, au lieu de relancer à l'aveugle.
 */
export async function pushAll({ rdvs = [], contacts = [], tasks = [] }, cfg = {}, onProgress = () => {}) {
  const total = rdvs.length + contacts.length + tasks.length
  let done = 0
  const errors = []
  const step = async (label, fn) => {
    try { await fn() } catch (e) { errors.push({ label, message: e.message }) }
    done++
    onProgress({ done, total, label })
  }
  for (const r of rdvs) await step(r.entreprise || r.id, () => pushRdv(r, cfg))
  for (const c of contacts) await step(c.nom || c.email, () => pushContact(c, cfg))
  for (const t of tasks) await step(t.titre || t.id, () => pushTask(t, cfg))
  return { total, done, errors }
}

// ------------------------------------------------------------------ Imports
export async function pullPersons({ max = 200 } = {}) {
  const rows = (await crm.list('persons', { limit: Math.min(max, 500) })) || []
  return rows.map(p => ({
    id: p.id,
    nom: p.name,
    email: p.primary_email || p.email?.[0]?.value || '',
    tel: p.phone?.[0]?.value || '',
    poste: p.job_title || '',
    entreprise: p.org_name || p.org_id?.name || '',
  }))
}

export async function pullDeals({ max = 200 } = {}) {
  const rows = (await crm.list('deals', { limit: Math.min(max, 500), status: 'all_not_deleted' })) || []
  return rows.map(d => ({
    id: d.id,
    titre: d.title,
    entreprise: d.org_name || d.org_id?.name || '',
    montant: d.value || 0,
    devise: d.currency || '',
    statut: d.status,
    etape: d.stage_id,
  }))
}

/** Organisations Pipedrive → fiches BD Report (mêmes champs que la fiche). */
export async function pullOrganizations({ max = 200 } = {}) {
  const rows = (await crm.list('organizations', { limit: Math.min(max, 500) })) || []
  const k = (ref) => keyOf('organization', ref)
  return rows.map(o => ({
    pipedriveId: o.id,
    nom: o.name || '',
    localisation: o.address || '',
    effectif: o.people_count || '',
    secteur: (k('bdr_secteur') && o[k('bdr_secteur')]) || '',
    site: '', linkedin: '', ca: '',
  }))
}

/** Tout ce qui s'importe, sous la forme que `crmImport.js` attend. */
export async function pullAll({ max = 300 } = {}) {
  const out = { contacts: [], companies: [], errors: [] }
  try {
    const persons = await pullPersons({ max })
    // `pullPersons` rend déjà nos noms de champs ; on ajoute seulement la provenance.
    out.contacts = persons.map(p => ({ ...p, source: 'Pipedrive' }))
  } catch (e) { out.errors.push({ kind: 'contacts', message: e.message }) }
  try { out.companies = await pullOrganizations({ max }) } catch (e) { out.errors.push({ kind: 'entreprises', message: e.message }) }
  return out
}

export async function loadPipelines() {
  const list = (await pipelines.list()) || []
  const out = []
  for (const p of list) {
    const stages = (await pipelines.stages(p.id).catch(() => [])) || []
    out.push({ id: p.id, name: p.name, stages: stages.map(s => ({ id: s.id, name: s.name, order: s.order_nr })) })
  }
  return out
}
