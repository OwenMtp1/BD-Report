import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LS_KEY = 'bdrflow_db_v1'
const SESSION_KEY = 'bdrflow_session_v1'

// ---------------------------------------------------------------- Helpers dates
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const parseISO = (s) => (s ? new Date(s + 'T00:00:00') : null)
export const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—')
export const uid = () => Math.random().toString(36).slice(2, 10)

// ---------------------------------------------------------------- SHA-256 (synchrone, compact)
// Les mots de passe sont stockés hashés ("sha256:<hex>"), jamais en clair.
export function sha256(ascii) {
  const rrot = (v, c) => (v >>> c) | (v << (32 - c))
  const words = []
  const asciiBitLength = ascii.length * 8
  let result = ''
  const hash = [], k = []
  let primeCounter = 0
  const isComposite = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate
      hash[primeCounter] = (Math.pow(candidate, 0.5) * 4294967296) | 0
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * 4294967296) | 0
    }
  }
  ascii = unescape(encodeURIComponent(ascii)) + '\x80'
  while ((ascii.length % 64) - 56) ascii += '\x00'
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i)
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8))
  }
  words[words.length] = (asciiBitLength / 4294967296) | 0
  words[words.length] = asciiBitLength | 0
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash.slice(0)
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2]
      const a = hash[0], e = hash[4]
      const temp1 = hash[7]
        + (rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = i < 16 ? w[i] : (w[i - 16] + (rrot(w15, 7) ^ rrot(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rrot(w2, 17) ^ rrot(w2, 19) ^ (w2 >>> 10))) | 0)
      const temp2 = (rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))
      hash.unshift((temp1 + temp2) | 0)
      hash.pop()
      hash[4] = (hash[4] + temp1) | 0
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }
  return result
}
export const hashPw = (pw) => 'sha256:' + sha256(String(pw))
export const checkPw = (input, stored) => (stored || '').startsWith('sha256:') ? hashPw(input) === stored : input === stored

// Clé normalisée pour regrouper les entreprises (insensible à la casse et aux espaces)
export const companyKey = (name) => (name || '').trim().toLowerCase()

export function startOfWeek(d) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

// Timeline: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'total' | 'custom'
export function inTimeline(dateStr, timeline, custom = {}) {
  if (timeline === 'total') return true
  if (!dateStr) return false
  const d = parseISO(dateStr)
  if (!d) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (timeline === 'today') return d.getTime() === now.getTime()
  if (timeline === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return d.getTime() === y.getTime()
  }
  if (timeline === 'week') {
    const s = startOfWeek(now)
    const e = new Date(s); e.setDate(e.getDate() + 7)
    return d >= s && d < e
  }
  if (timeline === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (timeline === 'year') return d.getFullYear() === now.getFullYear()
  if (timeline === 'custom') {
    const s = custom.start ? parseISO(custom.start) : null
    const e = custom.end ? parseISO(custom.end) : null
    if (s && d < s) return false
    if (e && d > e) return false
    return !!(s || e)
  }
  return true
}

export const TIMELINES = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'yesterday', label: 'Hier' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois-ci' },
  { id: 'year', label: 'Cette année' },
  { id: 'total', label: 'Total' },
  { id: 'custom', label: 'Date personnalisée' },
]

// Mois de paiement d'une prime : déclenchée par la date de passage en SQL.
// Payée au 15 max du mois en cours ; après le 15, elle passe au mois suivant.
export function primePaymentMonth(dateStr) {
  const d = parseISO(dateStr)
  if (!d) return null
  const m = new Date(d.getFullYear(), d.getMonth(), 1)
  if (d.getDate() > 15) m.setMonth(m.getMonth() + 1)
  return m // Date au 1er du mois de paiement
}

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const monthLabel = (d) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

// ---------------------------------------------------------------- Constantes métier
export const SOURCES = ['Inbound', 'Outbound', 'Event', 'Partner']
export const DEFAULT_PHASES = ['R1', 'R2', 'MQL', 'SQL', 'KO', 'Signée']
export const DEFAULT_OPPS = ['En cours', 'Perdue', 'Gagnée', 'Signée', 'No Show R1', 'No Show MQL']
export const DEFAULT_PROVENANCES = ['Cold Call', 'LinkedIn', 'Site Web', 'Salon', 'Référence client', 'Emailing']

export const PHASE_COLORS = {
  R1: 'bg-sky-100 text-sky-700', R2: 'bg-indigo-100 text-indigo-700',
  MQL: 'bg-blue-100 text-blue-700', SQL: 'bg-red-100 text-red-700',
  KO: 'bg-gray-200 text-gray-600', 'Signée': 'bg-emerald-100 text-emerald-700',
}
export const OPP_COLORS = {
  'En cours': 'bg-amber-100 text-amber-700', Perdue: 'bg-gray-200 text-gray-600',
  'Gagnée': 'bg-emerald-100 text-emerald-700', 'Signée': 'bg-emerald-200 text-emerald-800',
  'No Show R1': 'bg-orange-100 text-orange-700', 'No Show MQL': 'bg-orange-100 text-orange-700',
}

export const RDV_FIELDS = [
  { key: 'source', label: 'Source' },
  { key: 'phase', label: 'Phase de transaction' },
  { key: 'opportunite', label: 'Opportunité' },
  { key: 'entreprise', label: "Nom de l'entreprise" },
  { key: 'effectif', label: 'Nombre de collaborateurs' },
  { key: 'secteur', label: "Secteur d'activité" },
  { key: 'contact', label: 'Nom & Prénom du contact' },
  { key: 'poste', label: 'Poste du contact' },
  { key: 'email', label: 'Mail du contact' },
  { key: 'tel', label: 'Téléphone du contact' },
  { key: 'linkedin', label: 'Profil LinkedIn' },
  { key: 'datePriseRdv', label: 'Date de prise de RDV' },
  { key: 'dateRdv', label: 'Date du RDV' },
  { key: 'provenance', label: 'Provenance du lead' },
  { key: 'notes', label: 'Notes' },
]

export const BRICKS = [
  'Dashboard', 'Mes Rendez-vous', 'Leads', 'Tâches prioritaires', 'Mes contacts', 'Mes notes',
  'Primes & Commissions', 'KPI Entreprise', 'Dashboard personnalisé', 'Logs',
]

export const ROLES = ['Fondateur', 'Administrateur', 'Manager', 'Membre']

// ---------------------------------------------------------------- Seed
function emptySubEnvData() {
  return {
    rdvs: [],
    contacts: [],
    notes: [],
    noteFolders: ['Général'],
    noteTemplates: [
      { id: uid(), name: 'Compte-rendu R1', content: "## Compte-rendu R1\n\nEntreprise :\nContact :\nBesoins identifiés :\nBudget :\nProchaine étape :" },
      { id: uid(), name: 'Qualification BANT', content: "## Qualification BANT\n\nBudget :\nAuthority (décideur) :\nNeed (besoin) :\nTiming :" },
    ],
    bareme: [
      { id: uid(), min: 1, max: 50, montant: 100, leadSource: 'Outbound' },
      { id: uid(), min: 51, max: 200, montant: 200, leadSource: 'Outbound' },
      { id: uid(), min: 201, max: 500, montant: 350, leadSource: 'Outbound' },
      { id: uid(), min: 501, max: 99999, montant: 500, leadSource: 'Outbound' },
      { id: uid(), min: 1, max: 200, montant: 150, leadSource: 'Inbound' },
      { id: uid(), min: 201, max: 99999, montant: 300, leadSource: 'Inbound' },
    ],
    provenances: [...DEFAULT_PROVENANCES],
    phases: [...DEFAULT_PHASES],
    opportunites: [...DEFAULT_OPPS],
    fieldsConfig: RDV_FIELDS.map(f => ({ key: f.key, visible: true })),
    widgets: null, // null = layout par défaut
    customDashboards: [],
    companies: {}, // infos société enrichies manuellement (CA, site, LinkedIn, localisation)
    logs: [], // journal d'audit : { id, ts, type, action, details }
    rdvTrash: [], // corbeille : éléments restaurables 30 jours
    noteTrash: [],
    goals: { rdvSemaine: 10, sqlMois: 5, primesMois: 1000 }, // objectifs & quotas
    mentions: [], // notifications @mention reçues : { id, ts, company, from, text, read }
    lostReasons: ['Pas de budget', 'Concurrent retenu', 'Mauvais timing', 'Pas décideur', 'Injoignable'],
    noShowReasons: ['Injoignable', 'A annulé', 'A oublié', 'Reporté sans date'],
  }
}

function seedRdvs() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const prevM = new Date(y, now.getMonth() - 1, 10)
  const pm = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}`
  const mk = (d, mm = m, yy = y) => `${yy}-${mm}-${String(d).padStart(2, '0')}`
  const base = (o) => ({
    id: uid(), parentId: null, source: 'Outbound', phase: 'R1', opportunite: 'En cours',
    entreprise: '', effectif: '', secteur: '', linkedin: '', provenance: 'Cold Call',
    contacts: [], dateRdv: '', datePriseRdv: '', datePassageSQL: '', notes: '',
    history: [], createdAt: todayISO(), ...o,
  })
  const r1 = base({
    entreprise: 'NovaTech Solutions', effectif: 320, secteur: 'SaaS RH', source: 'Outbound',
    phase: 'SQL', opportunite: 'Gagnée', provenance: 'Cold Call',
    contacts: [{ id: uid(), nom: 'Claire Dubois', poste: 'DRH', email: 'c.dubois@novatech.fr', tel: '06 12 34 56 78' }],
    datePriseRdv: mk(2), dateRdv: mk(9), datePassageSQL: mk(11),
    notes: 'Très intéressés par le module onboarding.',
    history: [
      { type: 'phase', value: 'R1', date: mk(2) },
      { type: 'phase', value: 'MQL', date: mk(9) },
      { type: 'phase', value: 'SQL', date: mk(11) },
    ],
  })
  const r2 = base({
    entreprise: 'Alpine Industries', effectif: 85, secteur: 'Industrie', source: 'Inbound',
    phase: 'MQL', opportunite: 'En cours', provenance: 'Site Web',
    contacts: [{ id: uid(), nom: 'Marc Lefèvre', poste: 'Directeur des Opérations', email: 'm.lefevre@alpine-ind.com', tel: '07 98 76 54 32' }],
    datePriseRdv: mk(4), dateRdv: mk(10),
    history: [{ type: 'phase', value: 'R1', date: mk(4) }, { type: 'phase', value: 'MQL', date: mk(10) }],
  })
  const r3 = base({
    entreprise: 'Lumea Santé', effectif: 1200, secteur: 'Santé', source: 'Event',
    phase: 'Signée', opportunite: 'Signée', provenance: 'Salon',
    contacts: [{ id: uid(), nom: 'Sophie Marchand', poste: 'VP People', email: 's.marchand@lumea.fr', tel: '06 45 67 89 01' }],
    datePriseRdv: `${pm}-08`, dateRdv: `${pm}-18`, datePassageSQL: `${pm}-20`,
    notes: 'Signature après POC de 2 semaines.',
    history: [
      { type: 'phase', value: 'R1', date: `${pm}-08` },
      { type: 'phase', value: 'SQL', date: `${pm}-20` },
      { type: 'phase', value: 'Signée', date: mk(3) },
    ],
  })
  const r4 = base({
    entreprise: 'Brio Conseil', effectif: 25, secteur: 'Conseil', source: 'Partner',
    phase: 'KO', opportunite: 'Perdue', provenance: 'Référence client',
    contacts: [{ id: uid(), nom: 'Julien Petit', poste: 'CEO', email: 'j.petit@brio.fr', tel: '06 22 33 44 55' }],
    datePriseRdv: `${pm}-15`, dateRdv: `${pm}-25`,
    history: [{ type: 'phase', value: 'R1', date: `${pm}-15` }, { type: 'phase', value: 'KO', date: mk(1) }],
  })
  const r5 = base({
    entreprise: 'NovaTech Solutions', parentId: r1.id, effectif: 320, secteur: 'SaaS RH', source: 'Outbound',
    phase: 'R2', opportunite: 'En cours', provenance: 'Cold Call',
    contacts: [{ id: uid(), nom: 'Claire Dubois', poste: 'DRH', email: 'c.dubois@novatech.fr', tel: '06 12 34 56 78' }],
    datePriseRdv: mk(11), dateRdv: mk(18),
    history: [{ type: 'phase', value: 'R2', date: mk(11) }],
  })
  return [r1, r2, r3, r4, r5]
}

function contactsFromRdvs(rdvs) {
  const out = []
  const seen = new Set()
  rdvs.forEach(r => (r.contacts || []).forEach(c => {
    const k = (c.email || c.nom || '').toLowerCase()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push({
      id: uid(), nom: c.nom, poste: c.poste, email: c.email, tel: c.tel,
      entreprise: r.entreprise, secteur: r.secteur, linkedin: r.linkedin,
      source: r.source, createdAt: r.datePriseRdv || r.createdAt,
    })
  }))
  return out
}

function buildSeedDb() {
  const envId = 'env-peoplespheres'
  const subId = 'sub-owen'
  const subData = emptySubEnvData()
  subData.rdvs = seedRdvs()
  subData.contacts = contactsFromRdvs(subData.rdvs)
  return {
    accounts: [{
      id: '01', email: 'owen.mb.pro@gmail.com', pseudo: 'OwenMtp', password: 'Elisaowen2003.',
      role: 'Fondateur', developer: true, photo: '', bricks: [...BRICKS], teamOf: null,
    }],
    environments: [{ id: envId, name: 'PeopleSpheres', logo: '', pin: '', createdBy: '01', departments: ['Marketing', 'Sales', 'Tech', 'Direction'] }],
    subenvs: [{ id: subId, envId, prenom: 'Owen', nom: 'Mrani Bonnier', poste: 'BDR', service: 'Marketing', pin: '1205', photo: '', ownerId: '01' }],
    data: { [subId]: subData },
  }
}

// ---------------------------------------------------------------- Calcul des primes
export function baremeMatch(bareme, effectif, source) {
  const eff = Number(effectif) || 0
  return bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max) && (!b.leadSource || b.leadSource === source))
    || bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max))
}

// Fige la prime d'un RDV au moment de son passage en SQL (barème versionné : un
// changement de barème ultérieur ne réécrit pas les primes déjà acquises).
export function ensurePrimeSnapshot(data, rdv) {
  if (!rdv || rdv.primeSnapshot) return
  if (!(rdv.phase === 'SQL' || rdv.phase === 'Signée') || !rdv.datePassageSQL) return
  const row = baremeMatch(data.bareme, rdv.effectif, rdv.source)
  if (!row) return
  rdv.primeSnapshot = {
    montant: Number(row.montant) || 0,
    bareme: { min: row.min, max: row.max, leadSource: row.leadSource || '' },
    effectif: Number(rdv.effectif) || 0, source: rdv.source || '',
    figeeLe: todayISO(),
  }
}

export function computePrimes(rdvs, bareme) {
  // Une prime par RDV (racine ou sous-RDV) dont la phase est SQL ou Signée,
  // déclenchée à la date de passage en SQL (fallback : date de prise de RDV).
  // Si une prime a été figée au passage en SQL (snapshot), c'est elle qui fait foi.
  const primes = []
  rdvs.forEach(r => {
    if (!(r.phase === 'SQL' || r.phase === 'Signée')) return
    const trigger = r.datePassageSQL || r.datePriseRdv || r.dateRdv || r.createdAt
    const snap = r.primeSnapshot
    const row = snap ? null : baremeMatch(bareme, r.effectif, r.source)
    if (!snap && !row) return
    const payMonth = primePaymentMonth(trigger)
    primes.push({
      rdvId: r.id, entreprise: r.entreprise, effectif: Number(r.effectif) || 0, source: r.source,
      montant: snap ? snap.montant : (Number(row.montant) || 0),
      figee: !!snap, figeeLe: snap?.figeeLe,
      triggerDate: trigger,
      payMonth, payMonthKey: payMonth ? monthKey(payMonth) : null,
      payMonthLabel: payMonth ? monthLabel(payMonth) : '—',
    })
  })
  return primes
}

// ---------------------------------------------------------------- Store React
const Ctx = createContext(null)

// ---------------------------------------------------------------- Environnement de démonstration « Test »
function makeTestRdvs(names, opts) {
  // Génère des RDV fictifs répartis sur les 3 derniers mois pour un BDR.
  const now = new Date()
  const day = (offset) => {
    const d = new Date(now); d.setDate(d.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }
  return names.map(([entreprise, secteur, effectif, contact, poste], i) => {
    const spec = opts[i] || {}
    const prise = day(spec.prise ?? (10 + i * 7))
    const rdv = day(spec.rdv ?? (5 + i * 7))
    const r = {
      id: uid(), parentId: null, entreprise, secteur, effectif,
      source: spec.source || 'Outbound', provenance: spec.prov || 'Cold Call',
      phase: spec.phase || 'R1', opportunite: spec.opp || 'En cours',
      contacts: [{ id: uid(), nom: contact, poste, email: `${contact.toLowerCase().replace(/[^a-z]/g, '.')}@${entreprise.toLowerCase().replace(/[^a-z]/g, '')}.fr`, tel: `06 ${String(10 + i)} ${String(20 + i)} ${String(30 + i)} ${String(40 + i)}` }],
      datePriseRdv: prise, dateRdv: rdv,
      datePassageSQL: spec.sql ? day(spec.sql) : '',
      linkedin: '', notes: spec.notes || '', motifKo: spec.motifKo || '', motifNoShow: spec.motifNoShow || '',
      history: [{ type: 'phase', value: 'R1', date: prise }, ...(spec.phase && spec.phase !== 'R1' ? [{ type: 'phase', value: spec.phase, date: rdv }] : [])],
      createdAt: prise,
    }
    return r
  })
}

function injectTestEnv(db) {
  if (db.environments.some(e => e.id === 'env-test')) return db
  const mkAcc = (id, prenom, nom, pseudo, role, teamOf) => ({
    id, email: `${prenom.toLowerCase()}@test.fr`, pseudo, password: 'test1234',
    role, developer: false, photo: '', bricks: [...BRICKS], teamOf,
  })
  db.accounts.push(
    mkAcc('test-julie', 'Julie', 'Lambert', 'JulieL', 'Manager', null),
    mkAcc('test-sarah', 'Sarah', 'Cohen', 'SarahC', 'Membre', 'test-julie'),
    mkAcc('test-thomas', 'Thomas', 'Moreau', 'ThomasM', 'Membre', 'test-julie'),
    mkAcc('test-karim', 'Karim', 'Benali', 'KarimB', 'Membre', 'test-julie'),
  )
  db.environments.push({
    id: 'env-test', name: 'Test', logo: '', pin: '', createdBy: 'test-julie',
    departments: ['Sales', 'Marketing'], members: ['test-julie', 'test-sarah', 'test-thomas', 'test-karim'],
    comments: {
      'novacorp industries': [
        { id: uid(), ts: new Date(Date.now() - 3 * 86400000).toISOString(), text: 'Compte stratégique — le DAF est très réceptif, on pousse fort ce mois-ci.', author: 'Julie Lambert', authorSubId: 'tsub-julie' },
        { id: uid(), ts: new Date(Date.now() - 86400000).toISOString(), text: '@Sarah ils ont aussi un site à Lyon, ça recoupe ton territoire — on s\'aligne ?', author: 'Thomas Moreau', authorSubId: 'tsub-thomas' },
      ],
    },
  })
  const mkSub = (id, prenom, nom, poste, ownerId) => ({ id, envId: 'env-test', prenom, nom, poste, service: 'Sales', pin: '0000', photo: '', ownerId })
  db.subenvs.push(
    mkSub('tsub-julie', 'Julie', 'Lambert', 'Team Lead BDR', 'test-julie'),
    mkSub('tsub-sarah', 'Sarah', 'Cohen', 'BDR', 'test-sarah'),
    mkSub('tsub-thomas', 'Thomas', 'Moreau', 'BDR', 'test-thomas'),
    mkSub('tsub-karim', 'Karim', 'Benali', 'BDR', 'test-karim'),
  )
  const base = () => emptySubEnvData()
  const sarah = base()
  sarah.rdvs = makeTestRdvs([
    ['NovaCorp Industries', 'Industrie', 450, 'Pierre Vasseur', 'DAF'],
    ['Hexalog', 'Logistique', 120, 'Amélie Roux', 'DRH'],
    ['Datapulse', 'SaaS', 35, 'Lucas Brun', 'CEO'],
    ['Verdana Group', 'Retail', 800, 'Chloé Martin', 'VP People'],
    ['Atelier Mobilier', 'Manufacture', 60, 'Hugo Lefort', 'DG'],
    ['CleanTech SE', 'Énergie', 230, 'Inès Dupré', 'Head of HR'],
  ], [
    { phase: 'SQL', opp: 'Gagnée', sql: 8, source: 'Outbound', prov: 'Cold Call', notes: 'POC validé, négociation en cours.' },
    { phase: 'MQL', opp: 'En cours', source: 'Inbound', prov: 'Site Web' },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'A annulé', source: 'Outbound', prov: 'LinkedIn' },
    { phase: 'Signée', opp: 'Signée', sql: 35, source: 'Event', prov: 'Salon', notes: 'Signé après démo sur le salon.' },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Pas de budget', source: 'Outbound', prov: 'Cold Call' },
    { phase: 'R2', opp: 'En cours', source: 'Partner', prov: 'Référence client' },
  ])
  const thomas = base()
  thomas.rdvs = makeTestRdvs([
    ['NovaCorp Industries', 'Industrie', 450, 'Marc Olivier', 'Directeur Site Lyon'],
    ['BlueWave Conseil', 'Conseil', 25, 'Emma Petit', 'Associée'],
    ['FerroTrans', 'Transport', 1500, 'Nadia Slimani', 'DRH Groupe'],
    ['Studio Pixel', 'Création', 15, 'Léo Garnier', 'Fondateur'],
    ['AgriPlus', 'Agroalimentaire', 320, 'Paul Mercier', 'DAF'],
  ], [
    { phase: 'R2', opp: 'En cours', source: 'Outbound', prov: 'Cold Call', notes: 'Recoupe le compte de Sarah — coordination en cours.' },
    { phase: 'MQL', opp: 'En cours', source: 'Inbound', prov: 'Site Web' },
    { phase: 'SQL', opp: 'Gagnée', sql: 12, source: 'Outbound', prov: 'LinkedIn' },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Concurrent retenu', source: 'Event', prov: 'Salon' },
    { phase: 'R1', opp: 'En cours', source: 'Partner', prov: 'Référence client', prise: 2, rdv: -3 },
  ])
  const karim = base()
  karim.rdvs = makeTestRdvs([
    ['Maison Bélier', 'Luxe', 90, 'Sophie Arnaud', 'DRH'],
    ['TechSecure', 'Cybersécurité', 200, 'Yann Morel', 'COO'],
    ['Urbavert', 'Paysagisme', 45, 'Julien Caron', 'Gérant'],
    ['Grand Large Hotels', 'Hôtellerie', 600, 'Claire Fontaine', 'VP RH'],
  ], [
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'Injoignable', source: 'Outbound', prov: 'Cold Call' },
    { phase: 'MQL', opp: 'En cours', source: 'Inbound', prov: 'Emailing' },
    { phase: 'R1', opp: 'En cours', source: 'Outbound', prov: 'Cold Call', prise: 40, rdv: 38 },
    { phase: 'SQL', opp: 'Gagnée', sql: 20, source: 'Event', prov: 'Salon' },
  ])
  const julie = base()
  julie.rdvs = makeTestRdvs([
    ['Groupe Méridien', 'Banque', 2500, 'François Bayard', 'DRH Groupe'],
    ['Solstice Énergie', 'Énergie', 380, 'Laura Pinto', 'Head of Talent'],
  ], [
    { phase: 'Signée', opp: 'Signée', sql: 28, source: 'Partner', prov: 'Référence client', notes: 'Compte stratégique signé en direct.' },
    { phase: 'SQL', opp: 'Gagnée', sql: 6, source: 'Inbound', prov: 'Site Web' },
  ])
  ;[sarah, thomas, karim, julie].forEach(d => { d.contacts = []; d.rdvs.forEach(r => syncContacts(d, r)) })
  db.data['tsub-sarah'] = sarah
  db.data['tsub-thomas'] = thomas
  db.data['tsub-karim'] = karim
  db.data['tsub-julie'] = julie
  return db
}

function migrate(db) {
  injectTestEnv(db)
  // Ajoute les nouvelles briques aux comptes qui avaient déjà l'accès cœur (proxy : brique "Leads").
  ;(db.accounts || []).forEach(a => {
    a.bricks = a.bricks || []
    ;['Tâches prioritaires', 'Logs'].forEach(b => {
      if (a.bricks.includes('Leads') && !a.bricks.includes(b)) a.bricks.push(b)
    })
    // Hashage des mots de passe hérités stockés en clair
    if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
  })
  // Valeurs par défaut des nouveaux champs + purge de la corbeille (> 30 jours)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  Object.values(db.data || {}).forEach(data => {
    data.logs = data.logs || []
    data.companies = data.companies || {}
    data.rdvTrash = (data.rdvTrash || []).filter(t => t.deletedAt > cutoff)
    data.noteTrash = (data.noteTrash || []).filter(t => t.deletedAt > cutoff)
    data.goals = data.goals || { rdvSemaine: 10, sqlMois: 5, primesMois: 1000 }
    data.mentions = data.mentions || []
    data.lostReasons = data.lostReasons || ['Pas de budget', 'Concurrent retenu', 'Mauvais timing', 'Pas décideur', 'Injoignable']
    data.noShowReasons = data.noShowReasons || ['Injoignable', 'A annulé', 'A oublié', 'Reporté sans date']
  })
  return db
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch (e) { /* base corrompue : on repart du seed */ }
  return migrate(buildSeedDb())
}

export function StoreProvider({ children }) {
  const [db, setDbState] = useState(load)
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch (e) { return null }
  })

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(db)) }, [db])
  useEffect(() => { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) }, [session])

  // Synchronisation multi-onglets : un changement dans un autre onglet est rechargé ici.
  useEffect(() => {
    const h = (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try { setDbState(JSON.parse(e.newValue)) } catch (err) { /* contenu invalide : on ignore */ }
      }
    }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  const api = useMemo(() => {
    const setDb = (fn) => setDbState(prev => {
      const next = typeof fn === 'function' ? fn(structuredClone(prev)) : fn
      return next
    })
    return {
      db, setDb, session, setSession,
      account: session ? db.accounts.find(a => a.id === session.accountId) : null,
      login(identifier, password) {
        const acc = db.accounts.find(a =>
          (a.email.toLowerCase() === identifier.toLowerCase() || a.pseudo.toLowerCase() === identifier.toLowerCase())
          && checkPw(password, a.password))
        if (acc) setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return acc
      },
      register({ email, pseudo, password }) {
        if (db.accounts.some(a => a.email.toLowerCase() === email.toLowerCase())) return { error: 'Un compte existe déjà avec cet email.' }
        const acc = { id: uid(), email, pseudo: pseudo || email.split('@')[0], password: hashPw(password), role: 'Membre', developer: false, photo: '', bricks: [...BRICKS], teamOf: null }
        setDb(d => { d.accounts.push(acc); return d })
        setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return { account: acc }
      },
      logout() { setSession(null) },
      enterEnv(envId) { setSession(s => ({ ...s, envId, subEnvId: null })) },
      enterSubEnv(subEnvId) {
        setSession(s => ({ ...s, subEnvId }))
        setDb(d => {
          const data = d.data[subEnvId]
          if (data) {
            data.logs = data.logs || []
            data.logs.unshift({ id: uid(), ts: new Date().toISOString(), type: 'Connexion', action: 'Entrée dans l\'espace', details: '' })
            if (data.logs.length > 1000) data.logs.length = 1000
          }
          return d
        })
      },
      createEnv({ name, logo }) {
        const env = { id: uid(), name, logo: logo || '', pin: '', createdBy: session.accountId, departments: ['Marketing', 'Sales'] }
        setDb(d => { d.environments.push(env); return d })
        return env
      },
      createSubEnv(envId, { prenom, nom, poste, service, pin }) {
        const sub = { id: uid(), envId, prenom, nom, poste, service, pin: pin || '0000', photo: '', ownerId: session.accountId }
        setDb(d => { d.subenvs.push(sub); d.data[sub.id] = emptySubEnvData(); return d })
        return sub
      },
      updateEnv(envId, patch) { setDb(d => { Object.assign(d.environments.find(e => e.id === envId), patch); return d }) },
      deleteEnv(envId) {
        setDb(d => {
          d.subenvs.filter(s => s.envId === envId).forEach(s => delete d.data[s.id])
          d.subenvs = d.subenvs.filter(s => s.envId !== envId)
          d.environments = d.environments.filter(e => e.id !== envId)
          return d
        })
      },
      updateSubEnv(subId, patch) { setDb(d => { Object.assign(d.subenvs.find(s => s.id === subId), patch); return d }) },
      deleteSubEnv(subId) { setDb(d => { d.subenvs = d.subenvs.filter(s => s.id !== subId); delete d.data[subId]; return d }) },
      // ----- données du sous-environnement courant
      sub: session?.subEnvId ? db.data[session.subEnvId] : null,
      setSub(fn) {
        const subId = session?.subEnvId
        if (!subId) return
        setDb(d => { d.data[subId] = fn(d.data[subId]); return d })
      },
      // ----- journal d'audit (traçabilité)
      logAction(type, action, details = '') {
        const subId = session?.subEnvId
        if (!subId) return
        setDb(d => {
          const data = d.data[subId]
          if (!data) return d
          data.logs = data.logs || []
          data.logs.unshift({ id: uid(), ts: new Date().toISOString(), type, action, details })
          if (data.logs.length > 1000) data.logs.length = 1000
          return d
        })
      },
      // ----- commentaires d'entreprise partagés au niveau de l'environnement
      addCompanyComment(company, text) {
        const env = db.environments.find(e => e.id === session?.envId)
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        if (!env || !text.trim()) return
        setDb(d => {
          const e = d.environments.find(x => x.id === env.id)
          e.comments = e.comments || {}
          const key = companyKey(company)
          e.comments[key] = e.comments[key] || []
          const author = sub ? `${sub.prenom} ${sub.nom}` : 'Inconnu'
          e.comments[key].push({
            id: uid(), ts: new Date().toISOString(), text: text.trim(),
            author, authorSubId: sub?.id,
          })
          // @mentions : notifie chaque membre de l'environnement cité par son prénom
          d.subenvs.filter(s => s.envId === env.id && s.id !== sub?.id).forEach(s => {
            if (text.toLowerCase().includes('@' + s.prenom.toLowerCase())) {
              const data = d.data[s.id]
              if (data) {
                data.mentions = data.mentions || []
                data.mentions.unshift({ id: uid(), ts: new Date().toISOString(), company: company.trim(), from: author, text: text.trim(), read: false })
              }
            }
          })
          return d
        })
      },
      deleteCompanyComment(company, commentId) {
        setDb(d => {
          const e = d.environments.find(x => x.id === session?.envId)
          const key = companyKey(company)
          if (e?.comments?.[key]) {
            e.comments[key] = e.comments[key].filter(c => c.id !== commentId)
          }
          return d
        })
      },
      companyComments(company) {
        const env = db.environments.find(e => e.id === session?.envId)
        return (env?.comments || {})[companyKey(company)] || []
      },
      // ----- changement d'Id sûr : met à jour toutes les références + la session courante
      changeAccountId(oldId, newId) {
        if (!newId || newId === oldId) return
        setDb(d => {
          const acc = d.accounts.find(a => a.id === oldId)
          if (!acc) return d
          acc.id = newId
          d.accounts.forEach(a => { if (a.teamOf === oldId) a.teamOf = newId })
          d.environments.forEach(e => {
            if (e.createdBy === oldId) e.createdBy = newId
            if (e.members) e.members = e.members.map(m => m === oldId ? newId : m)
          })
          d.subenvs.forEach(s => { if (s.ownerId === oldId) s.ownerId = newId })
          return d
        })
        setSession(s => (s && s.accountId === oldId ? { ...s, accountId: newId } : s))
      },
      // ----- comptes (administration)
      updateAccount(id, patch) { setDb(d => { Object.assign(d.accounts.find(a => a.id === id), patch); return d }) },
      deleteAccount(id) { setDb(d => { d.accounts = d.accounts.filter(a => a.id !== id); return d }) },
      addAccount(acc) {
        const a = { id: uid(), role: 'Membre', developer: false, photo: '', bricks: [...BRICKS], teamOf: null, ...acc }
        if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
        setDb(d => { d.accounts.push(a); return d })
        return a
      },
    }
  }, [db, session])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

// ---------------------------------------------------------------- Mutations RDV avec automatisations
export function applyRdvAutomations(rdv, patch) {
  // Retourne le patch enrichi par les règles d'automatisation + entrées d'historique.
  const out = { ...patch }
  const hist = []
  const day = todayISO()
  if ('opportunite' in patch && patch.opportunite !== rdv.opportunite) {
    hist.push({ type: 'opportunite', value: patch.opportunite, date: day })
    if (patch.opportunite === 'Perdue') { out.phase = 'KO' }
    if (patch.opportunite === 'Gagnée') { out.phase = 'SQL' }
    if (patch.opportunite === 'Signée') { out.phase = 'Signée' }
  }
  if ('phase' in out && out.phase !== rdv.phase) {
    hist.push({ type: 'phase', value: out.phase, date: day })
  }
  if (hist.length) out.history = [...(rdv.history || []), ...hist]
  return out
}

export function rdvNeedsSqlDate(rdv, patch) {
  const newPhase = patch.phase ?? rdv.phase
  const newOpp = patch.opportunite ?? rdv.opportunite
  const becomesSQL = (newPhase === 'SQL' || newPhase === 'Signée' || newOpp === 'Gagnée' || newOpp === 'Signée')
  return becomesSQL && !rdv.datePassageSQL && !patch.datePassageSQL
}

// Synchronise les contacts d'un RDV vers le répertoire "Mes contacts"
export function syncContacts(data, rdv) {
  const existing = new Set(data.contacts.map(c => (c.email || c.nom || '').toLowerCase()))
  ;(rdv.contacts || []).forEach(c => {
    const k = (c.email || c.nom || '').toLowerCase()
    if (!k || existing.has(k)) return
    existing.add(k)
    data.contacts.push({
      id: uid(), nom: c.nom || '', poste: c.poste || '', email: c.email || '', tel: c.tel || '',
      entreprise: rdv.entreprise || '', secteur: rdv.secteur || '', linkedin: rdv.linkedin || '',
      source: rdv.source || '', createdAt: todayISO(),
    })
  })
  return data
}
