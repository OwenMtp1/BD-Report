// ---------------------------------------------------------------------------
//  Correspondance BD Report ↔ HubSpot + orchestration des synchronisations.
//
//  Modèle de correspondance :
//    Entreprise d'un RDV   → company
//    Contacts d'un RDV     → contact  (clé d'unicité : e-mail)
//    RDV                   → deal     (clé d'unicité : propriété bdr_rdv_id)
//    RDV (créneau)         → meeting  (engagement daté)
//    Notes du RDV          → note
//    Tâches BD Report      → task
//  Les associations HubSpot (deal ↔ company ↔ contacts ↔ meeting) sont posées
//  automatiquement à chaque envoi.
// ---------------------------------------------------------------------------
import { crm, associations, properties, pipelines, HubspotError } from './hubspot.js'

// --------------------------------------------------------- Étapes du pipeline
// Correspondance par défaut phases BD Report → étapes du pipeline « Sales » standard.
export const DEFAULT_STAGE_MAP = {
  R1: 'appointmentscheduled',
  R2: 'qualifiedtobuy',
  MQL: 'presentationscheduled',
  SQL: 'decisionmakerboughtin',
  'Signée': 'closedwon',
  KO: 'closedlost',
}
// L'issue commerciale prime sur la phase quand elle est tranchée.
const OPP_STAGE = { 'Gagnée': 'closedwon', 'Signée': 'closedwon', 'Perdue': 'closedlost' }

// --------------------------------------------------- Propriétés personnalisées
// Champs BD Report à créer dans HubSpot pour ne rien perdre à l'export.
export const CUSTOM_PROPERTIES = {
  deals: [
    { name: 'bdr_rdv_id', label: 'BD Report — ID du RDV', type: 'string', fieldType: 'text', description: 'Identifiant unique du rendez-vous BD Report (clé de synchronisation).' },
    { name: 'bdr_phase', label: 'BD Report — Phase', type: 'string', fieldType: 'text' },
    { name: 'bdr_opportunite', label: 'BD Report — Opportunité', type: 'string', fieldType: 'text' },
    { name: 'bdr_source', label: 'BD Report — Source', type: 'string', fieldType: 'text' },
    { name: 'bdr_provenance', label: 'BD Report — Provenance du lead', type: 'string', fieldType: 'text' },
    { name: 'bdr_date_sql', label: 'BD Report — Date de passage SQL', type: 'date', fieldType: 'date' },
    { name: 'bdr_date_prise_rdv', label: 'BD Report — Date de prise de RDV', type: 'date', fieldType: 'date' },
    { name: 'bdr_effectif', label: 'BD Report — Effectif', type: 'number', fieldType: 'number' },
    { name: 'bdr_secteur', label: 'BD Report — Secteur', type: 'string', fieldType: 'text' },
  ],
  contacts: [
    { name: 'bdr_contact_id', label: 'BD Report — ID du contact', type: 'string', fieldType: 'text' },
    { name: 'bdr_source', label: 'BD Report — Source', type: 'string', fieldType: 'text' },
  ],
  companies: [
    { name: 'bdr_secteur', label: 'BD Report — Secteur', type: 'string', fieldType: 'text' },
  ],
}
const PROPERTY_GROUP = { deals: 'dealinformation', contacts: 'contactinformation', companies: 'companyinformation' }

// Crée dans HubSpot les propriétés BD Report manquantes (idempotent).
export async function ensureCustomProperties(onProgress) {
  const created = []
  for (const [objectType, defs] of Object.entries(CUSTOM_PROPERTIES)) {
    let existing = new Set()
    try { existing = new Set(((await properties.list(objectType))?.results || []).map(p => p.name)) } catch (e) { /* on tente quand même */ }
    for (const def of defs) {
      if (existing.has(def.name)) continue
      try {
        await properties.create(objectType, { ...def, groupName: PROPERTY_GROUP[objectType] })
        created.push(`${objectType}.${def.name}`)
        if (onProgress) onProgress(`Propriété créée : ${objectType}.${def.name}`)
      } catch (e) {
        // 409 = déjà créée entre-temps : ce n'est pas une erreur.
        if (e.status !== 409) throw e
      }
    }
  }
  return created
}

// ------------------------------------------------------------- Utilitaires
const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length <= 1) return { firstname: parts[0] || '', lastname: '' }
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') }
}
const domainFromEmail = (email) => {
  const at = String(email || '').split('@')[1]
  if (!at) return ''
  return ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.fr', 'yahoo.com', 'free.fr', 'orange.fr', 'icloud.com'].includes(at.toLowerCase()) ? '' : at.toLowerCase()
}
// HubSpot attend un timestamp (ms) minuit UTC pour les propriétés de type date.
const toHsDate = (iso) => {
  if (!iso) return undefined
  const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00Z' : ''))
  return Number.isNaN(d.getTime()) ? undefined : String(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const toHsTimestamp = (iso) => {
  if (!iso) return undefined
  const d = new Date(iso + (String(iso).length === 10 ? 'T09:00:00Z' : ''))
  return Number.isNaN(d.getTime()) ? undefined : String(d.getTime())
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))

// ------------------------------------------------------ Conversion BD → HubSpot
export function stageFor(rdv, stageMap = DEFAULT_STAGE_MAP) {
  return OPP_STAGE[rdv?.opportunite] || stageMap[rdv?.phase] || stageMap.R1 || 'appointmentscheduled'
}

export function rdvToDeal(rdv, cfg = {}) {
  const stageMap = cfg.stageMap || DEFAULT_STAGE_MAP
  return clean({
    dealname: rdv.entreprise ? `${rdv.entreprise} — ${rdv.phase || 'RDV'}` : `RDV ${rdv.id}`,
    dealstage: stageFor(rdv, stageMap),
    pipeline: cfg.pipelineId || undefined,
    closedate: toHsDate(rdv.datePassageSQL || rdv.dateRdv),
    hubspot_owner_id: cfg.ownerId || undefined,
    amount: rdv.montant != null && rdv.montant !== '' ? String(rdv.montant) : undefined,
    bdr_rdv_id: rdv.id,
    bdr_phase: rdv.phase,
    bdr_opportunite: rdv.opportunite,
    bdr_source: rdv.source,
    bdr_provenance: rdv.provenance,
    bdr_date_sql: toHsDate(rdv.datePassageSQL),
    bdr_date_prise_rdv: toHsDate(rdv.datePriseRdv),
    bdr_effectif: rdv.effectif !== '' && rdv.effectif != null ? String(Number(rdv.effectif) || 0) : undefined,
    bdr_secteur: rdv.secteur,
  })
}

export function rdvToCompany(rdv) {
  const domain = domainFromEmail((rdv.contacts || [])[0]?.email)
  return clean({
    name: rdv.entreprise,
    domain,
    industry: undefined, // `industry` est une énumération HubSpot : on garde le secteur en champ libre
    bdr_secteur: rdv.secteur,
    numberofemployees: rdv.effectif !== '' && rdv.effectif != null ? String(Number(rdv.effectif) || 0) : undefined,
    linkedin_company_page: rdv.linkedin,
  })
}

export function contactToHs(c, extra = {}) {
  const { firstname, lastname } = splitName(c.nom)
  return clean({
    email: c.email, firstname, lastname,
    jobtitle: c.poste, phone: c.tel,
    company: c.entreprise || extra.entreprise,
    bdr_contact_id: c.id,
    bdr_source: c.source || extra.source,
    hubspot_owner_id: extra.ownerId || undefined,
  })
}

export function rdvToMeeting(rdv) {
  const start = toHsTimestamp(rdv.dateRdv)
  if (!start) return null
  return clean({
    hs_timestamp: start,
    hs_meeting_title: `${rdv.phase || 'RDV'} — ${rdv.entreprise || ''}`.trim(),
    hs_meeting_body: rdv.notes,
    hs_meeting_start_time: start,
    hs_meeting_end_time: String(Number(start) + 3600000),
    hs_meeting_outcome: rdv.opportunite === 'Perdue' ? 'CANCELED'
      : String(rdv.opportunite || '').startsWith('No Show') ? 'NO_SHOW' : 'COMPLETED',
  })
}

export const noteToHs = (n) => clean({
  hs_timestamp: toHsTimestamp(n.date || n.createdAt) || String(Date.now()),
  hs_note_body: n.contenu || n.content || n.text || '',
})

export const taskToHs = (t) => clean({
  hs_timestamp: toHsTimestamp(t.echeance || t.date || t.createdAt) || String(Date.now()),
  hs_task_subject: t.titre || t.title || 'Tâche BD Report',
  hs_task_body: t.description || t.notes || '',
  hs_task_status: t.done || t.fait ? 'COMPLETED' : 'NOT_STARTED',
  hs_task_priority: t.priorite === 'haute' ? 'HIGH' : t.priorite === 'basse' ? 'LOW' : 'MEDIUM',
})

// ------------------------------------------------------------ Upserts unitaires
// Crée ou met à jour, en cherchant d'abord l'enregistrement par sa clé d'unicité.
async function upsert(objectType, searchProp, searchValue, props) {
  if (searchValue) {
    let found = null
    try { found = await crm.findByProperty(objectType, searchProp, searchValue, ['hs_object_id']) } catch (e) {
      // La propriété de recherche n'existe pas encore côté HubSpot : on crée.
      if (e.status !== 400) throw e
    }
    if (found?.id) { await crm.update(objectType, found.id, props); return { id: found.id, created: false } }
  }
  const r = await crm.create(objectType, props)
  return { id: r.id, created: true }
}

export const upsertCompany = (rdv) => upsert('companies', 'name', rdv.entreprise, rdvToCompany(rdv))
export const upsertContact = (c, extra) => upsert('contacts', 'email', c.email, contactToHs(c, extra))
export const upsertDeal = async (rdv, cfg) => {
  const props = rdvToDeal(rdv, cfg)
  // Clé de synchro : bdr_rdv_id (repli sur le nom du deal si la propriété n'existe pas).
  try { return await upsert('deals', 'bdr_rdv_id', rdv.id, props) } catch (e) {
    if (e.status === 400) return upsert('deals', 'dealname', props.dealname, props)
    throw e
  }
}

// Associe sans faire échouer l'envoi si le lien existe déjà.
async function link(fromType, fromId, toType, toId) {
  if (!fromId || !toId) return
  try { await associations.createDefault(fromType, fromId, toType, toId) } catch (e) { /* déjà associé */ }
}

// ------------------------------------------------------------ Envoi d'un RDV
// Pousse un rendez-vous complet : entreprise + contacts + transaction + créneau
// + note, puis pose toutes les associations. Renvoie les ids HubSpot créés.
export async function pushRdv(rdv, cfg = {}) {
  const out = { rdvId: rdv.id, contactIds: [] }

  if (rdv.entreprise) { const c = await upsertCompany(rdv); out.companyId = c.id }

  for (const contact of (rdv.contacts || [])) {
    if (!contact.email && !contact.nom) continue
    const r = await upsertContact(contact, { entreprise: rdv.entreprise, source: rdv.source, ownerId: cfg.ownerId })
    out.contactIds.push(r.id)
    await link('contacts', r.id, 'companies', out.companyId)
  }

  const deal = await upsertDeal(rdv, cfg)
  out.dealId = deal.id
  await link('deals', out.dealId, 'companies', out.companyId)
  for (const cid of out.contactIds) await link('deals', out.dealId, 'contacts', cid)

  if (cfg.syncMeetings !== false) {
    const m = rdvToMeeting(rdv)
    if (m) {
      const created = await crm.create('meetings', m)
      out.meetingId = created.id
      await link('meetings', out.meetingId, 'deals', out.dealId)
      await link('meetings', out.meetingId, 'companies', out.companyId)
      for (const cid of out.contactIds) await link('meetings', out.meetingId, 'contacts', cid)
    }
  }

  if (cfg.syncNotes !== false && rdv.notes) {
    const n = await crm.create('notes', { hs_timestamp: String(Date.now()), hs_note_body: rdv.notes })
    out.noteId = n.id
    await link('notes', out.noteId, 'deals', out.dealId)
  }

  return out
}

// Envoi d'un contact seul (carnet d'adresses BD Report).
export async function pushContact(contact, cfg = {}) {
  const r = await upsertContact(contact, { ownerId: cfg.ownerId })
  const out = { contactId: r.id }
  if (contact.entreprise) {
    const c = await upsert('companies', 'name', contact.entreprise, clean({ name: contact.entreprise, bdr_secteur: contact.secteur, linkedin_company_page: contact.linkedin }))
    out.companyId = c.id
    await link('contacts', out.contactId, 'companies', out.companyId)
  }
  return out
}

export async function pushNote(note, cfg = {}) {
  const n = await crm.create('notes', noteToHs(note))
  return { noteId: n.id }
}
export async function pushTask(task, cfg = {}) {
  const t = await crm.create('tasks', { ...taskToHs(task), ...(cfg.ownerId ? { hubspot_owner_id: cfg.ownerId } : {}) })
  return { taskId: t.id }
}

// --------------------------------------------------------- Envoi en masse
// Parcourt les lots avec un rapport de progression et une tolérance aux erreurs :
// un enregistrement en échec n'interrompt pas le reste de l'envoi.
export async function pushAll({ rdvs = [], contacts = [], notes = [], tasks = [] }, cfg = {}, onProgress = () => {}) {
  const total = rdvs.length + contacts.length + notes.length + tasks.length
  const report = { total, done: 0, ok: 0, failed: 0, errors: [], ids: {} }
  const step = async (label, key, fn) => {
    try { report.ids[key] = await fn(); report.ok++ }
    catch (e) { report.failed++; report.errors.push({ item: label, message: e.message, status: e.status }) }
    report.done++
    onProgress({ ...report, current: label })
  }
  for (const r of rdvs) await step(r.entreprise || r.id, 'rdv:' + r.id, () => pushRdv(r, cfg))
  for (const c of contacts) await step(c.nom || c.email || c.id, 'contact:' + c.id, () => pushContact(c, cfg))
  for (const n of notes) await step(n.titre || 'Note', 'note:' + n.id, () => pushNote(n, cfg))
  for (const t of tasks) await step(t.titre || 'Tâche', 'task:' + t.id, () => pushTask(t, cfg))
  return report
}

// ----------------------------------------------------- Import HubSpot → BD Report
// Ramène les contacts HubSpot au format du carnet d'adresses BD Report.
export async function pullContacts({ max = 200 } = {}) {
  const props = ['email', 'firstname', 'lastname', 'jobtitle', 'phone', 'company', 'hs_object_id', 'createdate']
  const rows = await crm.listAll('contacts', { limit: 100, properties: props }, { max })
  return rows.map(r => {
    const p = r.properties || {}
    return {
      hubspotId: r.id,
      nom: [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || p.email || 'Sans nom',
      poste: p.jobtitle || '', email: p.email || '', tel: p.phone || '',
      entreprise: p.company || '', secteur: '', linkedin: '', source: 'HubSpot',
      createdAt: (p.createdate || '').slice(0, 10),
    }
  })
}

// Ramène les transactions HubSpot au format « rendez-vous » BD Report.
export async function pullDeals({ max = 200, stageMap = DEFAULT_STAGE_MAP } = {}) {
  const reverse = Object.fromEntries(Object.entries(stageMap).map(([phase, stage]) => [stage, phase]))
  const props = ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'bdr_rdv_id', 'bdr_phase', 'bdr_provenance', 'bdr_source', 'bdr_secteur', 'bdr_effectif']
  let rows = []
  try { rows = await crm.listAll('deals', { limit: 100, properties: props }, { max }) } catch (e) {
    if (e.status !== 400) throw e
    rows = await crm.listAll('deals', { limit: 100, properties: ['dealname', 'dealstage', 'amount', 'closedate', 'createdate'] }, { max })
  }
  return rows.map(r => {
    const p = r.properties || {}
    return {
      hubspotId: r.id,
      entreprise: (p.dealname || '').split('—')[0].trim() || p.dealname || 'Sans nom',
      phase: p.bdr_phase || reverse[p.dealstage] || 'R1',
      opportunite: p.dealstage === 'closedwon' ? 'Gagnée' : p.dealstage === 'closedlost' ? 'Perdue' : 'En cours',
      source: p.bdr_source || 'Inbound',
      provenance: p.bdr_provenance || 'Site Web',
      secteur: p.bdr_secteur || '',
      effectif: p.bdr_effectif ? Number(p.bdr_effectif) : '',
      dateRdv: (p.closedate || p.createdate || '').slice(0, 10),
      datePriseRdv: (p.createdate || '').slice(0, 10),
      notes: '', contacts: [],
    }
  })
}

// Charge les pipelines + étapes pour l'écran de correspondance des phases.
export async function loadPipelines() {
  const r = await pipelines.list('deals')
  return (r?.results || []).map(p => ({
    id: p.id, label: p.label,
    stages: (p.stages || []).sort((a, b) => a.displayOrder - b.displayOrder).map(s => ({ id: s.id, label: s.label })),
  }))
}

export { HubspotError }
