import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LS_KEY = 'bdrflow_db_v1'
const SESSION_KEY = 'bdrflow_session_v1'
// Boîte de réception partagée site ↔ app (même origine owenmtp1.github.io) : le
// formulaire de contact du site y dépose ses messages, l'app les y récupère.
export const CONTACT_INBOX_KEY = 'bdrflow_contact_inbox_v1'
export const APP_VERSION = '1.14.0'

// ---------------------------------------------------------------- Format monétaire
export const CURRENCIES = { EUR: { symbol: '€', code: 'EUR' }, USD: { symbol: '$', code: 'USD' } }
// Devise courante mémorisée pour le formatage global (mise à jour par le store).
let CURRENT_CURRENCY = 'EUR'
export function setCurrentCurrency(c) { CURRENT_CURRENCY = c === 'USD' ? 'USD' : 'EUR' }
export function fmtMoney(n, currency = CURRENT_CURRENCY) {
  const v = Math.round(Number(n) || 0)
  const sep = v.toLocaleString('fr-FR') // séparateur de milliers par espace
  return currency === 'USD' ? `$${sep}` : `${sep} €`
}

// ---------------------------------------------------------------- Helpers dates
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const parseISO = (s) => (s ? new Date(s + 'T00:00:00') : null)
export const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—')
export const uid = () => Math.random().toString(36).slice(2, 10)
// Ajout de jours en UTC (stable quel que soit le fuseau du navigateur)
const addDaysISO = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// Phases d'implémentation par défaut (4 phases hebdomadaires séquentielles à partir d'aujourd'hui).
function defaultProjectPhases() {
  const pick = ['Cadrage', 'Implémentation', 'Formation', 'Go-live']
  const colors = ['#3b5bdb', '#0ea5e9', '#f59e0b', '#10b981']
  let cursor = todayISO()
  return pick.map((name, i) => {
    const start = cursor
    const end = addDaysISO(start, 6)
    cursor = addDaysISO(end, 1)
    return { id: uid(), name, start, end, done: false, color: colors[i] }
  })
}

// Construit un projet d'implémentation par défaut à partir d'une demande entrante.
export function makeProjectFromRequest(req) {
  return {
    id: uid(), name: `Implémentation — ${req.name || 'Client'}`, clientName: req.name || 'Client',
    envId: null, owner: '', status: 'prevu', phases: defaultProjectPhases(), createdAt: new Date().toISOString(),
    sourceRequestId: req.id,
  }
}

// Chaque environnement existant est un client : carte « Clients actifs » du back-office support.
function makeClientFromEnv(env) {
  const now = new Date().toISOString()
  return { id: uid(), key: 'env:' + env.id, name: env.name, envId: env.id, accountId: env.createdBy || null, status: 'actifs', createdAt: now, lastActivity: now, note: '' }
}

// ...et possède son projet d'implémentation dans la Gestion de Projet.
function makeProjectFromEnv(env) {
  return {
    id: uid(), name: `Implémentation — ${env.name}`, clientName: env.name,
    envId: env.id, owner: '', status: 'encours', phases: defaultProjectPhases(), createdAt: new Date().toISOString(),
    sourceEnvId: env.id,
  }
}

// Une demande du formulaire de contact n'est ingérée qu'une seule fois (jamais ré-ingérée même
// si elle a été supprimée ensuite — corrige la « résurrection » au rafraîchissement).
function shouldIngestRequest(d, item) {
  if (!item || !item.id) return false
  if ((d.supportRequests || []).some(r => r.id === item.id)) return false
  if ((d._ingestedRequestIds || []).includes(item.id)) return false
  return true
}
function makeClientFromRequest(item) {
  const now = new Date().toISOString()
  return { id: uid(), key: 'req:' + item.id, name: item.name || 'Prospect', email: item.email || '', envId: null, accountId: null, status: 'demandes', createdAt: now, lastActivity: now, note: item.message || '' }
}
function ingestRequest(d, item) {
  d.supportRequests = d.supportRequests || []
  d._ingestedRequestIds = d._ingestedRequestIds || []
  d._autoSeed = d._autoSeed || { envClients: [], envProjects: [], reqProjects: [], reqClients: [] }
  d._autoSeed.reqClients = d._autoSeed.reqClients || []
  d.projects = d.projects || []
  d.clients = d.clients || []
  d.supportRequests.unshift({
    id: item.id, name: item.name || '', email: item.email || '', message: item.message || '',
    lang: item.lang || 'fr', createdAt: item.createdAt || new Date().toISOString(), status: 'new', archived: false,
  })
  d._ingestedRequestIds.push(item.id)
  // Projet d'implémentation auto, marqué comme déjà créé (ne réapparaît pas s'il est supprimé)
  if (!d._autoSeed.reqProjects.includes(item.id)) { d.projects.unshift(makeProjectFromRequest(item)); d._autoSeed.reqProjects.push(item.id) }
  // Fiche client en « Demandes en cours », créée une seule fois (suppression respectée)
  if (!d._autoSeed.reqClients.includes(item.id)) { d.clients.unshift(makeClientFromRequest(item)); d._autoSeed.reqClients.push(item.id) }
  pushSupportLog(d, { type: 'Demande', action: 'Nouvelle demande reçue', details: `${item.name || ''}${item.email ? ' · ' + item.email : ''}`, actorName: 'Site' })
}

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

// Palette pour les valeurs personnalisées (phases / statuts créés par l'utilisateur — micro 5)
const CUSTOM_PALETTE = [
  'bg-teal-100 text-teal-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700', 'bg-lime-100 text-lime-700', 'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700', 'bg-fuchsia-100 text-fuchsia-700',
]
function hashIndex(str, mod) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % mod
}
// Renvoie une classe de couleur stable pour une phase (couleur dédiée connue, sinon couleur dérivée du nom)
export function phaseColor(phase) {
  return PHASE_COLORS[phase] || (phase ? CUSTOM_PALETTE[hashIndex(phase, CUSTOM_PALETTE.length)] : 'bg-surface text-ink')
}
export function oppColor(opp) {
  return OPP_COLORS[opp] || (opp ? CUSTOM_PALETTE[hashIndex(opp, CUSTOM_PALETTE.length)] : 'bg-surface text-ink')
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
  'Dashboard', 'Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches', 'Mes contacts', 'Mes notes',
  'Primes & Commissions', 'KPI Entreprise', 'Dashboard personnalisé', 'Logs',
]

// ---------------------------------------------------------------- Offres (plans)
// starter : compte gratuit auto-créé, accès très limité.
// beta : accès complet, attribué quand un manager crée un compte dans un environnement Beta.
export const STARTER_BRICKS = ['Dashboard', 'Mes Rendez-vous', 'Mes contacts', 'Mes tâches']
export const PLANS = {
  starter: { id: 'starter', label: 'Starter', bricks: STARTER_BRICKS },
  beta: { id: 'beta', label: 'Beta Testing', bricks: [...BRICKS] },
}
// Briques réellement accessibles à un compte selon son offre
export function allowedBricks(account) {
  const plan = PLANS[account?.plan] || PLANS.beta
  const planSet = new Set(plan.bricks)
  return (account?.bricks || []).filter(b => planSet.has(b))
}

export const ROLES = ['Fondateur', 'Support BD Report', 'Administrateur', 'Manager', 'Développeur', 'Membre']

// Rôles de l'équipe support BD Report : accès au back-office support (Nouvelles demandes,
// Tickets Techniques). « Support BD Report » a exactement les mêmes permissions que « Fondateur ».
export const SUPPORT_ROLES = ['Fondateur', 'Support BD Report']
export const isSupportRole = (role) => SUPPORT_ROLES.includes(role)

// Colonnes du kanban Clients (back-office support).
export const CLIENT_STATUSES = [
  { id: 'demandes', label: 'Demandes en cours', color: 'bg-amber-100 text-amber-700' },
  { id: 'actifs', label: 'Clients actifs', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'attente', label: 'En attente de support', color: 'bg-blue-100 text-blue-700' },
  { id: 'anciens', label: 'Anciens clients', color: 'bg-gray-200 text-gray-600' },
]

// Phases standard d'un projet d'implémentation (gestion de projet support).
export const PROJECT_PHASES = ['Cadrage', 'Implémentation', 'Paramétrage', 'Formation', 'Recette', 'Go-live', 'Suivi']
export const PROJECT_PHASE_COLORS = ['#3b5bdb', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b']
export const PROJECT_STATUSES = [
  { id: 'prevu', label: 'Prévu', color: 'bg-gray-200 text-gray-600' },
  { id: 'encours', label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  { id: 'pause', label: 'En pause', color: 'bg-amber-100 text-amber-700' },
  { id: 'termine', label: 'Terminé', color: 'bg-emerald-100 text-emerald-700' },
]

// Vrai s'il existe des messages non lus pour le côté donné ('user' = client, 'support' = équipe technique).
export function ticketHasUnread(ticket, side) {
  if (!ticket) return false
  const readAt = side === 'user' ? (ticket.readUserAt || '') : (ticket.readSupportAt || '')
  return (ticket.messages || []).some(m => {
    const incoming = side === 'user' ? (m.from === 'support' || m.from === 'bot') : (m.from === 'user')
    return incoming && (m.ts || '') > readAt
  })
}

// Les 10 catégories de tickets les plus fréquentes sur un SaaS de ce type.
export const TICKET_CATEGORIES = [
  'Connexion & authentification',
  'Bug ou erreur d\'affichage',
  'Données manquantes ou incorrectes',
  'Import / export de données',
  'Paramètres & personnalisation',
  'Performance / lenteur',
  'Facturation & abonnement',
  'Comptes & permissions',
  'Demande de fonctionnalité',
  'Autre / question générale',
]

// Niveaux de priorité d'un ticket de support.
export const TICKET_PRIORITIES = [
  { id: 'basse', label: 'Basse', color: 'bg-gray-200 text-gray-600', rank: 0 },
  { id: 'normale', label: 'Normale', color: 'bg-blue-100 text-blue-700', rank: 1 },
  { id: 'haute', label: 'Haute', color: 'bg-amber-100 text-amber-700', rank: 2 },
  { id: 'urgente', label: 'Urgente', color: 'bg-red-100 text-red-700', rank: 3 },
]
export const priorityRank = (id) => (TICKET_PRIORITIES.find(p => p.id === id) || TICKET_PRIORITIES[1]).rank

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
    currency: 'EUR', // devise des primes (EUR ou USD)
    tasks: [], // Mes tâches : { id, title, description, dueDate, assignee, company, contact, rdvId, done, archived, pinned, createdAt }
    taskTrash: [], // corbeille des tâches : restaurables 30 jours
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

// Enrichit le kanban Clients du back-office support dès qu'un ticket arrive au service technique.
function enrichClientFromTicket(d, ticket) {
  d.clients = d.clients || []
  const key = ticket.envId ? 'env:' + ticket.envId : 'acc:' + (ticket.userAccountId || ticket.userName)
  const now = new Date().toISOString()
  let client = d.clients.find(c => c.key === key)
  if (!client) {
    client = {
      id: uid(), key, name: ticket.clientName || ticket.userName,
      envId: ticket.envId || null, accountId: ticket.userAccountId || null,
      status: 'attente', createdAt: now, lastActivity: now, note: '',
    }
    d.clients.unshift(client)
  } else {
    client.lastActivity = now
  }
  return client
}

// Le statut du projet d'implémentation suit le statut du client (clients & gestion de projet liés).
const CLIENT_TO_PROJECT_STATUS = { demandes: 'prevu', actifs: 'encours', attente: 'pause', anciens: 'termine' }
function syncProjectToClientStatus(d, client) {
  if (!client || !client.envId) return
  const ps = CLIENT_TO_PROJECT_STATUS[client.status]
  if (!ps) return
  // On ne touche pas au statut d'un projet édité manuellement par le support (statusLocked).
  ;(d.projects || []).forEach(p => { if (p.sourceEnvId === client.envId && !p.statusLocked) p.status = ps })
}

// Aligne le statut du client sur ses tickets : en attente de support s'il a un ticket
// ouvert, sinon il repasse en clients actifs (déclenché à l'ouverture/clôture d'un ticket).
function syncClientStatusFromTickets(d, ticket) {
  if (!ticket) return
  const client = (d.clients || []).find(c => c.envId ? c.envId === ticket.envId : c.accountId === ticket.userAccountId)
  if (!client) return
  // Un client « ancien » (environnement supprimé/résilié) le reste : pas de réactivation par un ticket.
  if (client.status === 'anciens') return
  const related = (d.tickets || []).filter(t => client.envId ? t.envId === client.envId : t.userAccountId === client.accountId)
  const hasOpen = related.some(t => t.status !== 'closed')
  client.status = hasOpen ? 'attente' : 'actifs'
  syncProjectToClientStatus(d, client)
}

// Construit un ticket (utilisé pour les tickets techniques ET les demandes de résiliation).
function makeTicket({ accountId, prenom, photo, clientName, envId, subEnvId, category, message, botText, priority }) {
  const now = new Date().toISOString()
  const botTs = new Date(Date.now() + 1000).toISOString()
  return {
    id: uid(), category: category || 'Autre / question générale', status: 'open',
    priority: priority || 'normale', assignedTo: null, csat: null,
    userAccountId: accountId || null, userName: prenom, userPhoto: photo || '',
    clientName: clientName || prenom, envId: envId || null, subEnvId: subEnvId || null,
    createdAt: now, handledBy: null, typing: {}, readUserAt: botTs, readSupportAt: '',
    messages: [
      { id: uid(), ts: now, from: 'user', authorAccountId: accountId || null, authorName: prenom, authorPhoto: photo || '', text: message || '', photo: '' },
      { id: uid(), ts: botTs, from: 'bot', authorName: 'BD Report', authorPhoto: '', text: botText || `Bonjour ${prenom}, merci pour votre message. Un membre de l'équipe technique BD Report va très prochainement prendre en charge votre demande. Vous recevrez la réponse directement dans cette conversation.`, photo: '' },
    ],
  }
}

// Journal d'audit du back-office support (visible dans « Logs Support »).
function pushSupportLog(d, { type, action, details = '', actorId = null, actorName = 'Système' }) {
  d.supportLogs = d.supportLogs || []
  d.supportLogs.unshift({ id: uid(), ts: new Date().toISOString(), type, action, details, actorId, actorName })
  if (d.supportLogs.length > 2000) d.supportLogs.length = 2000
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
      role: 'Fondateur', developer: true, plan: 'beta', photo: '', bricks: [...BRICKS], teamOf: null,
    }],
    environments: [{ id: envId, name: 'PeopleSpheres', logo: '', pin: '', plan: 'beta', createdBy: '01', departments: ['Marketing', 'Sales', 'Tech', 'Direction'] }],
    subenvs: [{ id: subId, envId, prenom: 'Owen', nom: 'Mrani Bonnier', poste: 'BDR', service: 'Marketing', pin: '1205', photo: '', ownerId: '01' }],
    data: { [subId]: subData },
    supportRequests: [], // « Nouvelles demandes » : formulaires de contact du site
    tickets: [], // « Tickets Techniques » : tickets de support ouverts depuis l'app
    clients: [], // Kanban Clients (back-office support)
    projects: [], // Gestion de projet (back-office support)
    supportTrash: [], // Corbeille du back-office support (demandes / tickets supprimés)
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
    role, developer: false, plan: 'beta', photo: '', bricks: [...BRICKS], teamOf,
  })
  db.accounts.push(
    mkAcc('test-julie', 'Julie', 'Lambert', 'JulieL', 'Manager', null),
    mkAcc('test-sarah', 'Sarah', 'Cohen', 'SarahC', 'Membre', 'test-julie'),
    mkAcc('test-thomas', 'Thomas', 'Moreau', 'ThomasM', 'Membre', 'test-julie'),
    mkAcc('test-karim', 'Karim', 'Benali', 'KarimB', 'Membre', 'test-julie'),
  )
  db.environments.push({
    id: 'env-test', name: 'Test', logo: '', pin: '', plan: 'beta', createdBy: 'test-julie',
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
    // Renommage de la brique "Tâches prioritaires" → "Recommandations prioritaires"
    a.bricks = a.bricks.map(b => b === 'Tâches prioritaires' ? 'Recommandations prioritaires' : b)
    ;['Recommandations prioritaires', 'Mes tâches', 'Logs'].forEach(b => {
      if (a.bricks.includes('Leads') && !a.bricks.includes(b)) a.bricks.push(b)
    })
    // Offre par défaut : les comptes existants gardent l'accès complet (beta)
    if (!a.plan) a.plan = 'beta'
    // Hashage des mots de passe hérités stockés en clair
    if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
  })
  ;(db.environments || []).forEach(e => { if (!e.plan) e.plan = 'beta' })
  // Données globales support (partagées entre tous les comptes support)
  db.supportRequests = db.supportRequests || []
  db.tickets = db.tickets || []
  db.clients = db.clients || []
  db.projects = db.projects || []
  db.supportLogs = db.supportLogs || []
  // Champs ajoutés aux tickets existants (priorité, assignation, satisfaction)
  ;(db.tickets || []).forEach(t => {
    if (!t.priority) t.priority = 'normale'
    if (t.assignedTo === undefined) t.assignedTo = null
    if (t.csat === undefined) t.csat = null
  })
  // État d'abonnement de chaque environnement : 'active' | 'cancelling' (résilié) | 'blocked' (bloqué support)
  ;(db.environments || []).forEach(e => { if (!e.subState) e.subState = 'active' })
  // Suivi des éléments déjà créés automatiquement : on ne (re)crée chaque entité qu'UNE fois.
  // Ainsi, ce que l'utilisateur supprime ne réapparaît pas au rechargement (bug de résurrection).
  db._autoSeed = db._autoSeed || { envClients: [], envProjects: [], reqProjects: [], reqClients: [] }
  db._autoSeed.reqClients = db._autoSeed.reqClients || []
  // Initialise l'historique des demandes déjà ingérées (demandes actuelles + supprimées) pour
  // ne jamais les ré-ingérer depuis la boîte partagée du site.
  const ingested = new Set(db._ingestedRequestIds || [])
  ;(db.supportRequests || []).forEach(r => ingested.add(r.id))
  ;(db.supportTrash || []).forEach(t => { if (t.kind === 'request' && t.data?.id) ingested.add(t.data.id) })
  db._ingestedRequestIds = [...ingested]

  // Chaque demande reçue donne lieu à UN projet d'implémentation + UNE fiche client « Demandes en cours » (une seule fois).
  ;(db.supportRequests || []).forEach(req => {
    if (req && req.id && !db._autoSeed.reqProjects.includes(req.id)) {
      if (!db.projects.some(p => p.sourceRequestId === req.id)) db.projects.unshift(makeProjectFromRequest(req))
      db._autoSeed.reqProjects.push(req.id)
    }
    if (req && req.id && !db._autoSeed.reqClients.includes(req.id)) {
      if (!db.clients.some(c => c.key === 'req:' + req.id)) db.clients.unshift(makeClientFromRequest(req))
      db._autoSeed.reqClients.push(req.id)
    }
  })
  // Chaque environnement existant est forcément un client (Clients actifs) avec son projet d'implémentation.
  ;(db.environments || []).forEach(env => {
    if (!db._autoSeed.envClients.includes(env.id)) {
      if (!db.clients.some(c => c.key === 'env:' + env.id)) db.clients.unshift(makeClientFromEnv(env))
      db._autoSeed.envClients.push(env.id)
    }
    if (!db._autoSeed.envProjects.includes(env.id)) {
      if (!db.projects.some(p => p.sourceEnvId === env.id)) db.projects.unshift(makeProjectFromEnv(env))
      db._autoSeed.envProjects.push(env.id)
    }
  })
  // Corbeille support : purge des éléments supprimés depuis plus de 30 jours
  const supCutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  db.supportTrash = (db.supportTrash || []).filter(t => t.deletedAt > supCutoff)
  // Valeurs par défaut des nouveaux champs + purge de la corbeille (> 30 jours)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  Object.values(db.data || {}).forEach(data => {
    data.logs = data.logs || []
    data.companies = data.companies || {}
    data.rdvTrash = (data.rdvTrash || []).filter(t => t.deletedAt > cutoff)
    data.noteTrash = (data.noteTrash || []).filter(t => t.deletedAt > cutoff)
    data.taskTrash = (data.taskTrash || []).filter(t => t.deletedAt > cutoff)
    data.goals = data.goals || { rdvSemaine: 10, sqlMois: 5, primesMois: 1000 }
    data.mentions = data.mentions || []
    data.lostReasons = data.lostReasons || ['Pas de budget', 'Concurrent retenu', 'Mauvais timing', 'Pas décideur', 'Injoignable']
    data.noShowReasons = data.noShowReasons || ['Injoignable', 'A annulé', 'A oublié', 'Reporté sans date']
    data.currency = data.currency || 'EUR'
    data.tasks = data.tasks || []
    data.taskTrash = data.taskTrash || []
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
  const [uiLang, setUiLangState] = useState(() => localStorage.getItem('bdr_lang') || 'fr')

  const lastSavedAt = React.useRef(0)
  useEffect(() => {
    // Sauvegarde sûre : capture l'erreur de quota au lieu d'échouer silencieusement (bug 5).
    try {
      const stamp = Date.now()
      lastSavedAt.current = stamp
      localStorage.setItem(LS_KEY, JSON.stringify({ ...db, _savedAt: stamp }))
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: "⚠️ Stockage plein : sauvegarde impossible. Allégez vos photos/logos ou exportez vos données." }))
    }
  }, [db])
  useEffect(() => { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) }, [session])

  // Synchronisation multi-onglets : on n'adopte un état distant que s'il est plus récent
  // que notre dernière écriture locale (évite qu'un onglet inactif écrase une modif récente — bug 9).
  useEffect(() => {
    const h = (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          const incoming = JSON.parse(e.newValue)
          if ((incoming._savedAt || 0) >= lastSavedAt.current) setDbState(incoming)
        } catch (err) { /* contenu invalide : on ignore */ }
      }
    }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  // Récupération des messages du formulaire de contact du site (même origine, clé partagée).
  // S'exécute au montage et dès qu'un nouveau message est déposé dans la boîte partagée.
  useEffect(() => {
    const pull = () => {
      try {
        const raw = localStorage.getItem(CONTACT_INBOX_KEY)
        if (!raw) return
        const inbox = JSON.parse(raw)
        if (!Array.isArray(inbox) || !inbox.length) return
        setDbState(prev => {
          const fresh = inbox.filter(i => shouldIngestRequest(prev, i))
          if (!fresh.length) return prev
          const next = structuredClone(prev)
          fresh.forEach(item => ingestRequest(next, item))
          return next
        })
      } catch (e) { /* inbox illisible : on ignore */ }
    }
    pull()
    const onStorage = (e) => { if (e.key === CONTACT_INBOX_KEY) pull() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const api = useMemo(() => {
    const setDb = (fn) => setDbState(prev => {
      const next = typeof fn === 'function' ? fn(structuredClone(prev)) : fn
      return next
    })
    const account = session ? db.accounts.find(a => a.id === session.accountId) : null
    const currentEnv = session?.envId ? db.environments.find(e => e.id === session.envId) : null
    // Accès en lecture seule : abonnement résilié ('cancelling') ou bloqué par le support ('blocked').
    const readOnly = !!(currentEnv && currentEnv.subState && currentEnv.subState !== 'active')
    const actorName = (db.subenvs.find(s => s.id === session?.subEnvId)?.prenom) || account?.pseudo || 'Support'
    // Garde lecture seule : bloque toute écriture sur l'environnement courant quand il est résilié/bloqué.
    const roBlocked = () => {
      if (!readOnly) return false
      window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Accès en lecture seule : abonnement résilié ou bloqué. Seul le support reste accessible.' }))
      return true
    }
    return {
      db, setDb, session, setSession,
      account, currentEnv, readOnly,
      // ----- langue de l'interface (compte connecté sinon préférence locale)
      uiLang: account?.lang || uiLang,
      setUiLang(lang) {
        setUiLangState(lang)
        localStorage.setItem('bdr_lang', lang)
        if (account) setDb(d => { const a = d.accounts.find(x => x.id === account.id); if (a) a.lang = lang; return d })
      },
      login(identifier, password) {
        const acc = db.accounts.find(a =>
          (a.email.toLowerCase() === identifier.toLowerCase() || a.pseudo.toLowerCase() === identifier.toLowerCase())
          && checkPw(password, a.password))
        if (acc) setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return acc
      },
      register({ email, pseudo, password }) {
        if (db.accounts.some(a => a.email.toLowerCase() === email.toLowerCase())) return { error: 'Un compte existe déjà avec cet email.' }
        const wanted = (pseudo || email.split('@')[0]).trim()
        if (wanted && db.accounts.some(a => a.pseudo.toLowerCase() === wanted.toLowerCase())) return { error: 'Ce pseudo est déjà pris, choisissez-en un autre.' }
        // Inscription libre = offre Starter (accès très limité), avec son propre environnement starter.
        const acc = { id: uid(), email, pseudo: wanted, password: hashPw(password), role: 'Fondateur', developer: false, plan: 'starter', photo: '', bricks: [...STARTER_BRICKS], teamOf: null }
        setDb(d => { d.accounts.push(acc); return d })
        setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return { account: acc }
      },
      logout() { setSession(null) },
      enterEnv(envId) { setSession(s => ({ ...s, envId, subEnvId: null })) },
      setCurrency(c) { if (roBlocked()) return; setDb(d => { if (session?.subEnvId && d.data[session.subEnvId]) d.data[session.subEnvId].currency = c; return d }); setCurrentCurrency(c) },
      enterSubEnv(subEnvId) {
        setSession(s => ({ ...s, subEnvId }))
        setCurrentCurrency(db.data[subEnvId]?.currency || 'EUR')
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
        // L'environnement hérite de l'offre de son créateur (Starter reste limité).
        const plan = account?.plan || 'starter'
        const env = { id: uid(), name, logo: logo || '', pin: '', plan, createdBy: session.accountId, departments: ['Marketing', 'Sales'] }
        setDb(d => {
          d.environments.push(env)
          // Tout nouvel environnement devient un client avec son projet d'implémentation.
          d.clients = d.clients || []
          if (!d.clients.some(c => c.key === 'env:' + env.id)) d.clients.unshift(makeClientFromEnv(env))
          d.projects = d.projects || []
          if (!d.projects.some(p => p.sourceEnvId === env.id)) d.projects.unshift(makeProjectFromEnv(env))
          return d
        })
        return env
      },
      createSubEnv(envId, { prenom, nom, poste, service, pin }) {
        if (roBlocked()) return null
        const sub = { id: uid(), envId, prenom, nom, poste, service, pin: pin || '0000', photo: '', ownerId: session.accountId }
        setDb(d => { d.subenvs.push(sub); d.data[sub.id] = emptySubEnvData(); return d })
        return sub
      },
      updateEnv(envId, patch) { if (roBlocked()) return; setDb(d => { Object.assign(d.environments.find(e => e.id === envId), patch); return d }) },
      updateSubEnv(subId, patch) { if (roBlocked()) return; setDb(d => { Object.assign(d.subenvs.find(s => s.id === subId), patch); return d }) },
      deleteSubEnv(subId) { if (roBlocked()) return; setDb(d => { d.subenvs = d.subenvs.filter(s => s.id !== subId); delete d.data[subId]; return d }) },
      // ----- données du sous-environnement courant
      sub: session?.subEnvId ? db.data[session.subEnvId] : null,
      setSub(fn) {
        const subId = session?.subEnvId
        if (!subId) return
        if (readOnly) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Accès en lecture seule : abonnement résilié ou bloqué. Seul le support reste accessible.' })); return }
        setDb(d => { d.data[subId] = fn(d.data[subId]); return d })
      },
      // ----- journal d'audit (traçabilité)
      logAction(type, action, details = '') {
        const subId = session?.subEnvId
        if (!subId || readOnly) return // en lecture seule aucune action n'est journalisée
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
        if (roBlocked()) return
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
          // @mentions : notifie chaque membre cité par son prénom (mot entier, pas un préfixe — bug 6)
          d.subenvs.filter(s => s.envId === env.id && s.id !== sub?.id).forEach(s => {
            const re = new RegExp('@' + s.prenom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'iu')
            if (re.test(text)) {
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
        if (roBlocked()) return
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
      updateAccount(id, patch) { if (roBlocked()) return; setDb(d => { Object.assign(d.accounts.find(a => a.id === id), patch); return d }) },
      deleteAccount(id) { if (roBlocked()) return; setDb(d => { d.accounts = d.accounts.filter(a => a.id !== id); return d }) },
      addAccount(acc) {
        if (roBlocked()) return null
        // Compte créé par un manager/admin = accès complet de l'offre de l'environnement courant (Beta par défaut).
        const env = db.environments.find(e => e.id === session?.envId)
        const plan = acc.plan || env?.plan || 'beta'
        const a = { id: uid(), role: 'Membre', developer: false, plan, photo: '', bricks: [...(PLANS[plan]?.bricks || BRICKS)], teamOf: null, ...acc, plan }
        if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
        setDb(d => { d.accounts.push(a); return d })
        return a
      },
      // ----- Identité de l'utilisateur courant pour le support (prénom + photo, sinon logo BD Report)
      currentIdentity() {
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        const nom = sub?.nom || ''
        const photo = sub?.photo || account?.photo || ''
        return { accountId: account?.id || null, prenom, name: `${prenom}${nom ? ' ' + nom : ''}`.trim(), photo }
      },
      // ----- Support : « Nouvelles demandes » (formulaires de contact du site)
      // Récupère les messages déposés par le formulaire de contact du site (même origine).
      pullContactInbox() {
        try {
          const raw = localStorage.getItem(CONTACT_INBOX_KEY)
          if (!raw) return
          const inbox = JSON.parse(raw)
          if (!Array.isArray(inbox) || !inbox.length) return
          setDb(d => {
            inbox.forEach(item => { if (shouldIngestRequest(d, item)) ingestRequest(d, item) })
            return d
          })
        } catch (e) { /* inbox illisible : on ignore */ }
      },
      updateSupportRequest(id, patch) {
        setDb(d => { const r = (d.supportRequests || []).find(x => x.id === id); if (r) Object.assign(r, patch); return d })
      },
      deleteSupportRequest(id) {
        // Suppression douce : la demande part dans la corbeille du back-office support.
        setDb(d => {
          const r = (d.supportRequests || []).find(x => x.id === id)
          if (r) { d.supportTrash = d.supportTrash || []; d.supportTrash.unshift({ id: uid(), kind: 'request', deletedAt: new Date().toISOString(), data: r }) }
          d.supportRequests = (d.supportRequests || []).filter(x => x.id !== id)
          return d
        })
      },
      // ----- Abonnement : résiliation (côté client)
      // Ouvre un ticket « résiliation » au support et bascule l'environnement en lecture seule.
      cancelSubscription() {
        const env = currentEnv
        if (!env) return null
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        const photo = sub?.photo || account?.photo || ''
        const ticket = makeTicket({
          accountId: account?.id, prenom, photo, clientName: env.name, envId: env.id, subEnvId: session?.subEnvId,
          category: 'Facturation & abonnement', priority: 'haute',
          message: `Bonjour, je souhaite résilier mon abonnement BD Report pour l'environnement « ${env.name} ».`,
          botText: `Bonjour ${prenom}, votre demande de résiliation est bien enregistrée. Votre accès passe en lecture seule en attendant qu'un membre de l'équipe BD Report la traite. Échangeons directement ici si besoin.`,
        })
        setDb(d => {
          const e = d.environments.find(x => x.id === env.id)
          if (e) e.subState = 'cancelling'
          d.tickets = d.tickets || []
          d.tickets.unshift(ticket)
          enrichClientFromTicket(d, ticket)
          syncClientStatusFromTickets(d, ticket)
          pushSupportLog(d, { type: 'Abonnement', action: 'Demande de résiliation', details: env.name, actorId: account?.id || null, actorName: prenom })
          return d
        })
        return ticket
      },
      // ----- Support : tickets techniques (conversation utilisateur ↔ équipe technique)
      createTicket({ category, message, priority }) {
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const env = db.environments.find(e => e.id === session?.envId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        const photo = sub?.photo || account?.photo || ''
        const ticket = makeTicket({
          accountId: account?.id, prenom, photo, clientName: env?.name || prenom,
          envId: session?.envId, subEnvId: session?.subEnvId, category, message, priority,
        })
        setDb(d => {
          d.tickets = d.tickets || []
          d.tickets.unshift(ticket)
          enrichClientFromTicket(d, ticket)
          syncClientStatusFromTickets(d, ticket)
          pushSupportLog(d, { type: 'Ticket', action: 'Ticket créé', details: `${ticket.category} · ${prenom}`, actorId: account?.id || null, actorName: prenom })
          return d
        })
        return ticket
      },
      postTicketMessage(ticketId, { text, photo, from }) {
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        const authorPhoto = sub?.photo || account?.photo || ''
        const msgTs = new Date().toISOString()
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.messages.push({
            id: uid(), ts: msgTs, from,
            authorAccountId: account?.id || null, authorName: prenom, authorPhoto,
            text: text || '', photo: photo || '',
          })
          if (from === 'support') {
            if (!t.handledBy) t.handledBy = account?.id || null
            if (t.status === 'open') t.status = 'in_progress'
            t.readSupportAt = msgTs // en répondant, le support a tout lu
          } else if (from === 'user') {
            t.readUserAt = msgTs
          }
          // Le message envoyé arrête l'indicateur de saisie de son auteur
          t.typing = { ...(t.typing || {}), [from + 'At']: 0 }
          // Met à jour l'activité du client correspondant
          const c = (d.clients || []).find(x => x.envId ? x.envId === t.envId : x.accountId === t.userAccountId)
          if (c) c.lastActivity = msgTs
          if (from === 'support') pushSupportLog(d, { type: 'Ticket', action: 'Réponse du support', details: `${t.category} · ${t.userName}`, actorId: account?.id || null, actorName: prenom })
          return d
        })
      },
      // Marque les messages d'un ticket comme lus pour le côté concerné ('user' | 'support').
      markTicketRead(ticketId, side) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          const last = t.messages.length ? t.messages[t.messages.length - 1].ts : new Date().toISOString()
          if (side === 'user') t.readUserAt = last
          else t.readSupportAt = last
          return d
        })
      },
      setTicketTyping(ticketId, side, isTyping) {
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.typing = { ...(t.typing || {}), [side + 'At']: isTyping ? Date.now() : 0, [side + 'Name']: prenom }
          return d
        })
      },
      setTicketStatus(ticketId, status) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (t) {
            t.status = status
            syncClientStatusFromTickets(d, t)
            const label = status === 'closed' ? 'Ticket clôturé' : status === 'in_progress' ? 'Ticket rouvert / en cours' : 'Statut du ticket modifié'
            pushSupportLog(d, { type: 'Ticket', action: label, details: `${t.category} · ${t.userName}`, actorId: account?.id || null, actorName })
          }
          return d
        })
      },
      setTicketPriority(ticketId, priority) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (t) { t.priority = priority; pushSupportLog(d, { type: 'Ticket', action: 'Priorité modifiée', details: `${t.category} → ${priority}`, actorId: account?.id || null, actorName }) }
          return d
        })
      },
      assignTicket(ticketId, assigneeId) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.assignedTo = assigneeId || null
          const who = d.accounts.find(a => a.id === assigneeId)
          pushSupportLog(d, { type: 'Ticket', action: assigneeId ? 'Ticket assigné' : 'Ticket désassigné', details: `${t.category}${who ? ' → ' + who.pseudo : ''}`, actorId: account?.id || null, actorName })
          return d
        })
      },
      // Note de satisfaction laissée par le client à la clôture (CSAT).
      rateTicket(ticketId, score, comment = '') {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.csat = { score, comment, ts: new Date().toISOString() }
          pushSupportLog(d, { type: 'Ticket', action: `Satisfaction ${score}/5`, details: t.category, actorId: account?.id || null, actorName: t.userName })
          return d
        })
      },
      deleteTicket(ticketId) {
        // Suppression douce : le ticket part dans la corbeille du back-office support.
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (t) { d.supportTrash = d.supportTrash || []; d.supportTrash.unshift({ id: uid(), kind: 'ticket', deletedAt: new Date().toISOString(), data: t }) }
          d.tickets = (d.tickets || []).filter(x => x.id !== ticketId)
          if (t) syncClientStatusFromTickets(d, t)
          return d
        })
      },
      // ----- Corbeille du back-office support
      restoreSupportItem(trashId) {
        setDb(d => {
          const item = (d.supportTrash || []).find(x => x.id === trashId)
          if (!item) return d
          if (item.kind === 'request') { d.supportRequests = d.supportRequests || []; d.supportRequests.unshift(item.data) }
          else if (item.kind === 'ticket') { d.tickets = d.tickets || []; d.tickets.unshift(item.data) }
          d.supportTrash = d.supportTrash.filter(x => x.id !== trashId)
          return d
        })
      },
      purgeSupportItem(trashId) {
        setDb(d => { d.supportTrash = (d.supportTrash || []).filter(x => x.id !== trashId); return d })
      },
      emptySupportTrash() { setDb(d => { d.supportTrash = []; return d }) },
      // ----- Kanban Clients (back-office support)
      setClientStatus(id, status) {
        setDb(d => {
          const c = (d.clients || []).find(x => x.id === id)
          if (c) { c.status = status; syncProjectToClientStatus(d, c) } // la gestion de projet suit le client
          return d
        })
      },
      updateClient(id, patch) {
        setDb(d => { const c = (d.clients || []).find(x => x.id === id); if (c) Object.assign(c, patch); return d })
      },
      deleteClient(id) { setDb(d => { d.clients = (d.clients || []).filter(x => x.id !== id); return d }) },
      // ----- Support : gestion des environnements clients (bloquer / débloquer / supprimer)
      blockEnv(envId) {
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (!e) return d
          e.subState = 'blocked'
          const c = (d.clients || []).find(x => x.envId === envId); if (c) c.blocked = true
          ;(d.projects || []).forEach(p => { if (p.sourceEnvId === envId) p.status = 'pause' })
          pushSupportLog(d, { type: 'Client', action: 'Environnement bloqué', details: e.name, actorId: account?.id || null, actorName })
          return d
        })
      },
      unblockEnv(envId) {
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (!e) return d
          e.subState = 'active'
          const c = (d.clients || []).find(x => x.envId === envId); if (c) c.blocked = false
          ;(d.projects || []).forEach(p => { if (p.sourceEnvId === envId && p.status === 'pause') p.status = 'encours' })
          pushSupportLog(d, { type: 'Client', action: 'Environnement débloqué', details: e.name, actorId: account?.id || null, actorName })
          return d
        })
      },
      deleteClientEnv(envId) {
        // Le support supprime l'environnement client : le client devient « ancien », son projet est retiré.
        setDb(d => {
          const e = d.environments.find(x => x.id === envId)
          const name = e?.name || ''
          d.subenvs.filter(s => s.envId === envId).forEach(s => delete d.data[s.id])
          d.subenvs = d.subenvs.filter(s => s.envId !== envId)
          d.environments = d.environments.filter(x => x.id !== envId)
          const c = (d.clients || []).find(x => x.envId === envId); if (c) { c.status = 'anciens'; c.blocked = false }
          d.projects = (d.projects || []).filter(p => p.sourceEnvId !== envId)
          pushSupportLog(d, { type: 'Client', action: 'Environnement client supprimé', details: name, actorId: account?.id || null, actorName })
          return d
        })
      },
      // ----- Gestion de projet (back-office support)
      saveProject(project) {
        // Un projet enregistré manuellement verrouille son statut (la synchro auto ne l'écrase plus).
        const locked = { ...project, statusLocked: true }
        setDb(d => {
          d.projects = d.projects || []
          const i = d.projects.findIndex(p => p.id === locked.id)
          if (i >= 0) d.projects[i] = locked
          else d.projects.unshift({ ...locked, id: locked.id || uid(), createdAt: new Date().toISOString() })
          return d
        })
      },
      deleteProject(id) { setDb(d => { d.projects = (d.projects || []).filter(p => p.id !== id); return d }) },
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
  // Upsert : met à jour la fiche existante (par email ou par nom) au lieu de créer un doublon (bug 3).
  ;(rdv.contacts || []).forEach(c => {
    const email = (c.email || '').trim().toLowerCase()
    const nom = (c.nom || '').trim().toLowerCase()
    if (!email && !nom) return
    const found = data.contacts.find(x =>
      (email && (x.email || '').toLowerCase() === email) ||
      (!email && nom && (x.nom || '').toLowerCase() === nom))
    if (found) {
      // On complète sans écraser par du vide
      if (c.nom) found.nom = c.nom
      if (c.poste) found.poste = c.poste
      if (c.email) found.email = c.email
      if (c.tel) found.tel = c.tel
      if (rdv.entreprise) found.entreprise = rdv.entreprise
      if (rdv.secteur) found.secteur = rdv.secteur
      if (rdv.linkedin) found.linkedin = rdv.linkedin
      if (rdv.source) found.source = rdv.source
    } else {
      data.contacts.push({
        id: uid(), nom: c.nom || '', poste: c.poste || '', email: c.email || '', tel: c.tel || '',
        entreprise: rdv.entreprise || '', secteur: rdv.secteur || '', linkedin: rdv.linkedin || '',
        source: rdv.source || '', createdAt: todayISO(),
      })
    }
  })
  return data
}

// Détecte les contacts d'un RDV déjà présents dans le répertoire (pour validation anti-doublon).
export function findContactDuplicates(data, rdv) {
  const dups = []
  ;(rdv.contacts || []).forEach(c => {
    const email = (c.email || '').trim().toLowerCase()
    const nom = (c.nom || '').trim().toLowerCase()
    if (!email && !nom) return
    const found = data.contacts.find(x =>
      (email && (x.email || '').toLowerCase() === email) ||
      (!email && nom && (x.nom || '').toLowerCase() === nom))
    if (found) dups.push({ incoming: c, existing: found })
  })
  return dups
}
