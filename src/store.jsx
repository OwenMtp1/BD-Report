import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from './supabaseConfig.js'
import { deob } from './obf.js'
import { stripDangerousKeys } from './security.js'
// Import statique : le déploiement inline l'app en un seul fichier, un import
// dynamique local produirait un morceau séparé qui ne serait jamais publié.
import { signOut as signOutSupabase } from './supabaseAuth.js'
import { fetchRemoteState, pushRemoteState, pushRemoteStateDebounced, subscribeRemoteState, fetchContactRequests, subscribeContactRequests, publishOffersDebounced } from './supabaseSync.js'
import { ALL_BRICKS, LEGACY_BRICKS } from './nav.jsx'
import { KB_ARTICLES, KB_CATEGORIES } from './kbContent.js'
import { configureHubspot, HS_API_BASE } from './hubspot.js'
import { DEFAULT_STAGE_MAP, pushRdv } from './hubspotSync.js'

const LS_KEY = 'bdrflow_db_v1'
const SESSION_KEY = 'bdrflow_session_v1'
const REMEMBER_KEY = 'bdrflow_remember_v1' // « rester connecté 30 jours »
const CREDS_KEY = 'bdrflow_creds_v1'       // identifiants enregistrés (pré-remplissage)
// Boîte de réception partagée site ↔ app (même origine owenmtp1.github.io) : le
// formulaire de contact du site y dépose ses messages, l'app les y récupère.
export const CONTACT_INBOX_KEY = 'bdrflow_contact_inbox_v1'
export const APP_VERSION = '1.18.2'

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

// BRICKS = ensemble complet des onglets accordables, dérivé de la définition unique de la
// navigation (src/nav.jsx). Ajouter un onglet là-bas l'ajoute automatiquement ici (et donc
// dans l'éditeur d'offres + la page Souscrire).
export const BRICKS = ALL_BRICKS

// ---------------------------------------------------------------- Offres (plans)
// Les offres sont désormais des DONNÉES (db.offers) que le staff peut créer/modifier/supprimer.
// starter : offre gratuite mono-compte (pas d'équipe / pilotage). beta : accès complet.
// `team` : donne accès aux fonctions manager/pilotage + création de comptes.
// `maxSeats` : nombre de personnes autorisées (1 = solo ; 0 = illimité).
export const STARTER_BRICKS = ['Dashboard', 'Mes Rendez-vous', 'Mes contacts', 'Mes tâches', 'Mes notes']
export function defaultOffers() {
  return [
    { id: 'starter', name: 'Starter', builtin: true, price: 0, priceLabel: 'Gratuit, pour toujours',
      desc: 'Pour un commercial en solo qui veut piloter son activité.', bricks: [...STARTER_BRICKS], team: false, maxSeats: 1 },
    { id: 'beta', name: 'Beta Testing', builtin: true, price: 0, priceLabel: 'Gratuit pendant la bêta',
      desc: 'L\'accès complet à BD Report, équipe et pilotage inclus.', bricks: [...BRICKS], team: true, maxSeats: 0 },
  ]
}
// Rétro-compat : PLANS reste consultable (libellés), dérivé des offres par défaut.
export const PLANS = { starter: { id: 'starter', label: 'Starter', bricks: STARTER_BRICKS }, beta: { id: 'beta', label: 'Beta Testing', bricks: [...BRICKS] } }

export function findOffer(offers, id) { return (offers || []).find(o => o.id === id) || null }
// Briques accessibles selon l'offre du compte (aucune si le compte n'a pas d'offre → support seul).
export function allowedBricks(account, offers) {
  const offer = findOffer(offers, account?.plan)
  if (!offer) {
    // Pas d'offre du tout : aucune brique. (Rétro-compat : si `offers` non fourni, on retombe sur PLANS.)
    if (offers) return []
    const plan = PLANS[account?.plan] || PLANS.beta
    return (account?.bricks || []).filter(b => new Set(plan.bricks).has(b))
  }
  const set = new Set(offer.bricks || [])
  return (account?.bricks || []).filter(b => set.has(b))
}
// Le compte a-t-il accès aux fonctions équipe / pilotage / manager ? (offre `team` ou rôle support)
export function hasTeamAccess(account, offers) {
  if (isSupportRole(account?.role)) return true
  return !!findOffer(offers, account?.plan)?.team
}

export const ROLES = ['Fondateur', 'Support BD Report', 'Administrateur', 'Manager', 'Développeur', 'Membre']
// Rôles portés par les clients : ils existent dans les environnements mais n'appartiennent
// pas à l'équipe BD Report, et n'ont donc rien à faire dans la matrice des droits staff.
export const CLIENT_ROLE_KEYS = ['Manager', 'Membre']
export const isClientRole = (key) => CLIENT_ROLE_KEYS.includes(key)

// Rôles de l'équipe support BD Report : accès au back-office support (Nouvelles demandes,
// Tickets Techniques). « Support BD Report » a exactement les mêmes permissions que « Fondateur ».
export const SUPPORT_ROLES = ['Fondateur', 'Support BD Report']
export const isSupportRole = (role) => SUPPORT_ROLES.includes(role)

// ---------------------------------------------------------------------------
//  Permissions de l'équipe staff (BD Report)
//  Catalogue EXHAUSTIF des droits « côté staff », regroupés par domaine. Chaque
//  rôle (intégré ou personnalisé) porte un jeu de permissions + un rang.
//  Règle de gouvernance : le Fondateur gère tout ; un rôle porteur de
//  `permissions.manage` peut gérer les rôles de rang STRICTEMENT inférieur au
//  sien (jamais le sien ni au-dessus), et ne peut accorder que des permissions
//  qu'il détient lui-même (anti-escalade de privilèges).
// ---------------------------------------------------------------------------
export const STAFF_PERMISSION_GROUPS = [
  {
    id: 'tickets', label: 'Tickets & support technique', perms: [
      { id: 'tickets.view', label: 'Accéder aux tickets' },
      { id: 'tickets.reply', label: 'Répondre / échanger sur un ticket' },
      { id: 'tickets.assign', label: 'Assigner un ticket à un agent' },
      { id: 'tickets.priority', label: 'Modifier priorité & SLA' },
      { id: 'tickets.status', label: 'Clôturer / rouvrir un ticket' },
      { id: 'tickets.delete', label: 'Supprimer un ticket' },
    ],
  },
  {
    id: 'requests', label: 'Demandes entrantes', perms: [
      { id: 'requests.view', label: 'Voir les nouvelles demandes' },
      { id: 'requests.manage', label: 'Traiter / convertir / archiver une demande' },
    ],
  },
  {
    id: 'knowledge', label: 'Base de connaissances', perms: [
      { id: 'kb.manage', label: 'Gérer la base de connaissances' },
      { id: 'canned.manage', label: 'Gérer les réponses types' },
    ],
  },
  {
    id: 'clients', label: 'Clients', perms: [
      { id: 'clients.view', label: 'Voir les fiches clients' },
      { id: 'clients.manage', label: 'Modifier / bloquer / débloquer un client' },
      { id: 'clients.delete', label: 'Supprimer un client' },
    ],
  },
  {
    id: 'projects', label: 'Projets & mise en place', perms: [
      { id: 'projects.view', label: 'Voir les projets d\'implémentation' },
      { id: 'projects.manage', label: 'Créer et piloter la mise en place des projets' },
      { id: 'projects.delete', label: 'Supprimer un projet' },
    ],
  },
  {
    id: 'accounts', label: 'Comptes & accès', perms: [
      { id: 'accounts.view', label: 'Voir les comptes utilisateurs' },
      { id: 'accounts.create', label: 'Créer un utilisateur' },
      { id: 'accounts.role', label: 'Attribuer / changer les rôles' },
      { id: 'accounts.offer', label: 'Attribuer / changer les offres' },
      { id: 'accounts.disable', label: 'Désactiver / réactiver un accès' },
      { id: 'accounts.wipe', label: 'Effacer les données d\'un espace' },
      { id: 'accounts.remove', label: 'Retirer un membre d\'un environnement' },
    ],
  },
  {
    id: 'passwords', label: 'Mots de passe', perms: [
      { id: 'passwords.view', label: 'Afficher les mots de passe en clair' },
      { id: 'passwords.reset', label: 'Réinitialiser un mot de passe' },
    ],
  },
  {
    id: 'offers', label: 'Offres & abonnements', perms: [
      { id: 'offers.manage', label: 'Créer / modifier / supprimer les offres' },
      { id: 'subscriptions.manage', label: 'Gérer souscriptions & résiliations' },
    ],
  },
  {
    id: 'org', label: 'Organisation & services', perms: [
      { id: 'services.manage', label: 'Gérer les services (organigramme staff)' },
      { id: 'orgchart.edit', label: 'Modifier l\'organigramme' },
    ],
  },
  {
    id: 'tools', label: 'Outils, données & visite guidée', perms: [
      { id: 'logs.view', label: 'Consulter les logs support' },
      { id: 'trash.manage', label: 'Gérer la corbeille support' },
      { id: 'stats.view', label: 'Voir les KPI / statistiques support' },
      { id: 'dashboard.view', label: 'Consulter le tableau de bord support' },
      { id: 'manager.view', label: 'Accéder à la console Gestion Manager' },
      { id: 'demo.access', label: 'Lancer la démo commerciale / visite guidée' },
    ],
  },
  {
    id: 'governance', label: 'Gouvernance', perms: [
      { id: 'permissions.manage', label: 'Gérer les permissions de l\'équipe staff' },
    ],
  },
]
export const STAFF_PERMISSIONS = STAFF_PERMISSION_GROUPS.flatMap(g => g.perms.map(p => ({ ...p, group: g.label, groupId: g.id })))
export const STAFF_PERMISSION_IDS = STAFF_PERMISSIONS.map(p => p.id)

// ---------------------------------------------------------------------------
//  Intégration HubSpot — UNE CONNEXION PAR ENTREPRISE CLIENTE.
//
//  • Réglages de l'éditeur (« plateforme ») : `db.integrations.hubspot`. Ne sert
//    qu'à publier l'URL du CONNECTEUR (le relais déployé une fois pour toutes) et
//    les réglages par défaut proposés aux clients.
//  • Réglages du client : `env.hubspot` sur CHAQUE environnement (= une entreprise).
//    Contient le portail relié, la correspondance des phases, les options — mais
//    JAMAIS de jeton HubSpot.
//  • Jetons : détenus par le relais, indexés par entreprise (`tenantId` = id de
//    l'environnement, authentifié par `tenantKey`). Seul le mode « direct »
//    (avancé, mono-poste) garde un jeton en localStorage sur l'appareil.
// ---------------------------------------------------------------------------
export const HUBSPOT_TOKEN_KEY = 'bdrflow_hubspot_token_v1'
export const HUBSPOT_MODES = [
  { id: 'oauth', label: 'Connexion HubSpot du client (recommandé)' },
  { id: 'proxy', label: 'Relais avec jeton unique (éditeur)' },
  { id: 'direct', label: 'API directe + jeton local (avancé)' },
]
export function defaultHubspotConfig() {
  return {
    enabled: false,
    mode: 'oauth',        // 'oauth' = chaque entreprise relie SON portail | 'proxy' = jeton unique côté relais | 'direct' = api.hubapi.com
    proxyUrl: '',         // URL du connecteur (relais) — publiée par l'éditeur
    portalId: '',         // Hub ID du portail relié
    hubDomain: '',        // ex. « macompagnie-4711.hubspot.com »
    tenantKey: '',        // secret partagé app ↔ relais pour CETTE entreprise
    connectedAt: '',
    connectedBy: '',      // qui a autorisé la connexion, côté client
    scopes: '',
    pipelineId: '',
    ownerId: '',
    stageMap: { ...DEFAULT_STAGE_MAP },
    syncMeetings: true,
    syncNotes: true,
    autoPush: false,      // pousser automatiquement chaque RDV enregistré
    lastSyncAt: '',
    lastReport: null,
  }
}
// Config effective d'une entreprise = réglages de l'éditeur (défauts) écrasés par
// ceux de l'environnement. L'URL du connecteur vient de l'éditeur sauf si le client
// en a renseigné une (auto-hébergement).
export function effectiveHubspotConfig(platform, envCfg, envId) {
  const base = { ...defaultHubspotConfig(), ...(platform || {}) }
  const cfg = { ...base, ...(envCfg || {}) }
  cfg.stageMap = { ...DEFAULT_STAGE_MAP, ...(base.stageMap || {}), ...((envCfg || {}).stageMap || {}) }
  cfg.proxyUrl = (envCfg?.proxyUrl || platform?.proxyUrl || '')
  cfg.tenantId = envId || ''
  return cfg
}
// Applique la configuration au client HubSpot (base d'appel, entreprise, jeton local).
export function applyHubspotConfig(cfg) {
  let token = ''
  try { token = localStorage.getItem(HUBSPOT_TOKEN_KEY) || '' } catch (e) { /* ssr / jsdom */ }
  const oauthMode = cfg?.mode === 'oauth'
  const base = cfg?.mode === 'direct' ? HS_API_BASE : (cfg?.proxyUrl || HS_API_BASE)
  configureHubspot({
    base,
    token: oauthMode ? '' : token,   // en mode client, seul le relais détient le jeton
    portalId: cfg?.portalId || '',
    tenantId: oauthMode ? (cfg?.tenantId || '') : '',
    tenantKey: oauthMode ? (cfg?.tenantKey || '') : '',
  })
}

// Rangs par défaut des rôles intégrés (plus élevé = plus de pouvoir).
export const ROLE_RANKS = { 'Fondateur': 100, 'Support BD Report': 90, 'Administrateur': 70, 'Développeur': 50, 'Manager': 40, 'Membre': 10 }

// Jeux de permissions par défaut des rôles intégrés (le Fondateur a TOUT, en dur).
function defaultPermsFor(roleKey) {
  const all = STAFF_PERMISSION_IDS
  if (roleKey === 'Fondateur') return [...all]
  if (roleKey === 'Support BD Report') return all.filter(p => p !== 'permissions.manage')
  if (roleKey === 'Administrateur') return [
    'tickets.view', 'tickets.reply', 'tickets.assign', 'tickets.priority', 'tickets.status',
    'requests.view', 'requests.manage', 'kb.manage', 'canned.manage',
    'clients.view', 'clients.manage', 'projects.view', 'projects.manage',
    'accounts.view', 'accounts.create', 'accounts.role', 'accounts.offer', 'accounts.disable', 'accounts.remove',
    'passwords.view', 'passwords.reset', 'services.manage', 'orgchart.edit', 'logs.view', 'stats.view', 'dashboard.view', 'manager.view', 'demo.access',
  ]
  if (roleKey === 'Développeur') return ['tickets.view', 'tickets.reply', 'tickets.priority', 'tickets.status', 'projects.view', 'logs.view', 'stats.view', 'dashboard.view', 'manager.view', 'demo.access']
  if (roleKey === 'Manager') return ['passwords.view', 'passwords.reset', 'accounts.create', 'stats.view', 'dashboard.view', 'manager.view', 'orgchart.edit', 'demo.access']
  return [] // Membre + rôles personnalisés : aucune permission staff par défaut
}

// Construit / répare la table des rôles staff (idempotent, appelé par migrate).
export function seedStaffRoles(existing) {
  const list = Array.isArray(existing) ? existing.slice() : []
  const byKey = new Map(list.map(r => [r.roleKey || r.name, r]))
  for (const roleKey of ROLES) {
    let r = byKey.get(roleKey)
    if (!r) { r = { id: uid(), name: roleKey, roleKey, rank: ROLE_RANKS[roleKey], builtin: true, permissions: defaultPermsFor(roleKey) }; list.push(r); byKey.set(roleKey, r) }
    else { r.builtin = true; r.roleKey = roleKey; if (typeof r.rank !== 'number') r.rank = ROLE_RANKS[roleKey]; if (!Array.isArray(r.permissions)) r.permissions = defaultPermsFor(roleKey) }
  }
  // Nettoyage des ids de permission obsolètes, puis Fondateur TOUJOURS complet (anti-lockout).
  list.forEach(r => { r.permissions = (r.permissions || []).filter(p => STAFF_PERMISSION_IDS.includes(p)) })
  const founder = byKey.get('Fondateur'); if (founder) founder.permissions = [...STAFF_PERMISSION_IDS]
  return list
}

// Rang d'un rôle (intégré ou personnalisé) d'après db.staffRoles.
export function roleRankOf(role, db) {
  const r = (db?.staffRoles || []).find(x => (x.roleKey || x.name) === role)
  if (r && typeof r.rank === 'number') return r.rank
  return ROLE_RANKS[role] ?? 0
}
// Couleurs attribuables à un rôle staff (surchargent la teinte par défaut).
export const ROLE_COLORS = [
  { id: '', label: 'Par défaut', dot: 'bg-gray-300 dark:bg-gray-600', tint: '' },
  { id: 'purple', label: 'Violet', dot: 'bg-purple-500', tint: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15' },
  { id: 'blue', label: 'Bleu', dot: 'bg-blue-500', tint: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15' },
  { id: 'emerald', label: 'Vert', dot: 'bg-emerald-500', tint: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15' },
  { id: 'amber', label: 'Ambre', dot: 'bg-amber-500', tint: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500', tint: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15' },
  { id: 'slate', label: 'Ardoise', dot: 'bg-slate-500', tint: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20' },
]
export const roleColor = (id) => ROLE_COLORS.find(c => c.id === (id || '')) || ROLE_COLORS[0]

// Le compte détient-il la permission staff ? (Fondateur = toujours vrai)
export function accountHasPerm(account, permId, db) {
  const role = account?.role
  // Le Fondateur passe avant tout contrôle : sans cela, suspendre son rôle
  // verrouillerait la gouvernance sans aucun moyen de revenir en arrière.
  if (role === 'Fondateur') return true
  const r = (db?.staffRoles || []).find(x => (x.roleKey || x.name) === role)
  // Rôle suspendu : ses titulaires perdent leurs droits staff jusqu'à réactivation,
  // sans que la configuration du rôle soit modifiée.
  if (r?.suspended) return false
  if (r) return (r.permissions || []).includes(permId)
  // Repli si la table n'est pas encore initialisée : parité avec l'ancien comportement.
  if (isSupportRole(role)) return permId !== 'permissions.manage'
  return false
}

// Enquête de satisfaction produit : on sollicite l'utilisateur aux moments où son
// jugement change vraiment — la découverte, l'installation dans l'usage — puis on
// s'espace, pour mesurer la fidélisation sans devenir importun.
export const SURVEY_DAYS = [5, 15, 30, 60]
export const SURVEY_PERIOD = 90
export function dueSurveyMilestone(account, now = Date.now()) {
  const start = new Date(account?.createdAt || 0).getTime()
  if (!start || Number.isNaN(start)) return null
  const days = Math.floor((now - start) / 86400000)
  const done = account?.productSurveys || []
  const milestones = [...SURVEY_DAYS]
  for (let m = SURVEY_DAYS[SURVEY_DAYS.length - 1] + SURVEY_PERIOD; m <= days; m += SURVEY_PERIOD) milestones.push(m)
  // On ne rattrape pas les jalons manqués un par un : seul le plus récent est proposé.
  const due = milestones.filter(m => m <= days && !done.includes(m))
  return due.length ? due[due.length - 1] : null
}

// ---------------------------------------------------------------------------
//  Rôles PAR ENVIRONNEMENT CLIENT (distincts des rôles staff).
//  Chaque entreprise dispose de ses propres rôles : Manager et Membre existent
//  partout, le staff peut en créer d'autres et choisir, pour chacun, les onglets
//  visibles et les droits de management accordés.
// ---------------------------------------------------------------------------
export const CLIENT_PERMISSION_GROUPS = [
  {
    id: 'equipe', label: 'Équipe', perms: [
      { id: 'team.view', label: "Voir l'équipe et l'organigramme" },
      { id: 'team.manage', label: 'Créer et modifier des utilisateurs' },
      { id: 'team.orgchart', label: "Modifier l'organigramme" },
      { id: 'team.services', label: 'Gérer les services' },
    ],
  },
  {
    id: 'pilotage', label: 'Pilotage', perms: [
      { id: 'pilot.kpi', label: "Consulter les KPI de l'entreprise" },
      { id: 'pilot.team', label: "Piloter l'activité de l'équipe" },
      { id: 'pilot.pipeline', label: "Voir le pipeline de toute l'équipe" },
      { id: 'pilot.targets', label: 'Définir les objectifs' },
    ],
  },
  {
    id: 'primes', label: 'Primes', perms: [
      { id: 'primes.rules', label: 'Définir les barèmes et les règles' },
      { id: 'primes.all', label: "Voir les primes de toute l'équipe" },
      { id: 'primes.validate', label: 'Valider ou corriger une prime' },
    ],
  },
  {
    id: 'donnees', label: 'Données', perms: [
      { id: 'data.export', label: 'Exporter les données' },
      { id: 'data.import', label: 'Importer des données' },
      { id: 'data.trash', label: 'Vider la corbeille' },
    ],
  },
  {
    id: 'integrations', label: 'Intégrations', perms: [
      { id: 'integrations.manage', label: 'Connecter et configurer un CRM' },
    ],
  },
]
export const CLIENT_PERMISSIONS = CLIENT_PERMISSION_GROUPS.flatMap(g => g.perms)
export const CLIENT_PERMISSION_IDS = CLIENT_PERMISSIONS.map(p => p.id)

// Onglets ouverts au Membre par défaut : son activité, pas le pilotage de l'équipe.
const MEMBER_TABS = ['Dashboard', 'Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches',
  'Mes contacts', 'Mes notes', 'Primes & Commissions', 'Simulateur de primes', 'Conversations',
  'Qualité des données', 'ICP', 'Classement', 'Corbeille']

export function defaultEnvRoles() {
  return [
    { id: 'erole-manager', name: 'Manager', builtin: true, color: 'amber', tabs: [...ALL_BRICKS], perms: [...CLIENT_PERMISSION_IDS] },
    { id: 'erole-membre', name: 'Membre', builtin: true, color: 'emerald', tabs: [...MEMBER_TABS], perms: [] },
  ]
}
// Complète une liste de rôles d'environnement sans écraser ce qui a été personnalisé :
// les deux rôles intégrés doivent toujours exister, le reste appartient au staff.
export function seedEnvRoles(existing) {
  const list = Array.isArray(existing) ? existing.slice() : []
  defaultEnvRoles().forEach(def => {
    const found = list.find(r => r.id === def.id || r.name === def.name)
    if (!found) list.push(def)
    else { found.builtin = true; if (!Array.isArray(found.tabs)) found.tabs = def.tabs; if (!Array.isArray(found.perms)) found.perms = def.perms }
  })
  return list
}

// Statuts de présence (choisis manuellement par l'utilisateur).
export const PRESENCE_META = {
  online: { label: 'En ligne', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  offline: { label: 'Hors ligne', dot: 'bg-slate-400', text: 'text-slate-500' },
  dnd: { label: 'Ne pas déranger', dot: 'bg-red-500', text: 'text-red-600' },
}
export const PRESENCE_ORDER = ['online', 'offline', 'dnd']

// Colonnes du kanban Clients (back-office support).
export const CLIENT_STATUSES = [
  { id: 'demandes', label: 'Demandes en cours', color: 'bg-amber-100 text-amber-700' },
  { id: 'actifs', label: 'Clients actifs', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'attente', label: 'En attente de support', color: 'bg-blue-100 text-blue-700' },
  { id: 'nonaboutis', label: 'Clients non aboutis', color: 'bg-rose-100 text-rose-700' },
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

// ----- SLA : délai de PREMIÈRE réponse cible selon la priorité (en heures)
export const SLA_HOURS = { urgente: 1, haute: 4, normale: 24, basse: 72 }
export function firstResponseMs(ticket) {
  const fs = (ticket?.messages || []).find(m => m.from === 'support')
  return fs ? (new Date(fs.ts) - new Date(ticket.createdAt)) : null
}
export function slaInfo(ticket) {
  const targetMs = (SLA_HOURS[ticket?.priority] || 24) * 3600000
  const fr = firstResponseMs(ticket)
  if (fr != null) return { responded: true, breached: fr > targetMs, ms: fr, targetMs }
  if (ticket?.status === 'closed') return { responded: false, breached: false, ms: 0, targetMs }
  const elapsed = Date.now() - new Date(ticket?.createdAt || Date.now())
  return { responded: false, breached: elapsed > targetMs, ms: elapsed, targetMs }
}
export function fmtDuration(ms) {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`
  if (h >= 1) return `${h} h ${m} min`
  return `${m} min`
}

// Contenus support par défaut (réponses types + base de connaissances).
function defaultCannedReplies() {
  return [
    { id: uid(), title: 'Accusé de réception', text: 'Bonjour, merci pour votre message. Nous prenons votre demande en charge et revenons vers vous au plus vite.' },
    { id: uid(), title: 'Demande de précisions', text: 'Pour diagnostiquer au mieux, pourriez-vous nous préciser : les étapes pour reproduire le problème, une capture d\'écran, et le navigateur/appareil utilisé ? Merci !' },
    { id: uid(), title: 'Correctif appliqué', text: 'Nous avons appliqué un correctif de notre côté. Pouvez-vous rafraîchir l\'application (Ctrl+Maj+R) puis nous confirmer que tout fonctionne ?' },
    { id: uid(), title: 'Avant clôture', text: 'Sans retour de votre part sous 48 h, nous clôturerons ce ticket. Vous pourrez le rouvrir à tout moment si besoin.' },
  ]
}
// Mode d'emploi client de la connexion HubSpot — publié dans la base de connaissances
// (visible depuis l'onglet Support de chaque client). Identifiant fixe : l'article est
// ajouté une seule fois, puis reste modifiable par le support.
export { KB_CATEGORIES }
export const KB_HUBSPOT_ID = 'kb-hubspot-connect'
export const KB_HUBSPOT_ARTICLE = {
  id: KB_HUBSPOT_ID,
  title: 'Connecter votre HubSpot à BD Report',
  category: 'Intégrations',
  content: `BD Report peut répertorier dans VOTRE HubSpot tout ce qui se passe dans votre environnement :
entreprises, contacts, rendez-vous (transactions), créneaux, notes et tâches. Chaque société
relie son propre portail : vos données ne sont jamais mélangées avec celles d'un autre client.

────────────────────────────────────────
1. CE QU'IL VOUS FAUT
────────────────────────────────────────
• Un compte HubSpot avec le droit « Super administrateur » (ou au minimum le droit
  d'installer une application et de modifier les propriétés du CRM).
• 2 minutes. Aucune clé, aucun jeton, aucun fichier à copier.

────────────────────────────────────────
2. RELIER VOTRE PORTAIL (2 MIN)
────────────────────────────────────────
1. Dans BD Report : menu « Administration » → « Intégration HubSpot ».
2. Cliquez sur « Connecter mon HubSpot ». Une fenêtre HubSpot s'ouvre.
   (Si rien ne s'ouvre : autorisez les fenêtres surgissantes pour BD Report, puis réessayez.)
3. Choisissez le compte HubSpot à relier, vérifiez la liste des autorisations demandées,
   puis cliquez sur « Connecter l'application ».
4. La fenêtre se ferme : BD Report affiche le nom de votre portail et « Connecté ✓ ».

À aucun moment BD Report ne voit votre mot de passe HubSpot. L'autorisation est révocable
à tout moment depuis HubSpot (Paramètres → Intégrations → Applications connectées) ou depuis
le bouton « Déconnecter » de BD Report.

────────────────────────────────────────
3. PRÉPARER VOTRE PORTAIL (1 MIN, UNE SEULE FOIS)
────────────────────────────────────────
Toujours sur la page « Intégration HubSpot » :
1. « Créer les propriétés BD Report » : ajoute dans HubSpot les champs de suivi
   (phase BD Report, provenance, source, date de passage SQL, effectif, secteur…).
   L'opération est sans risque et peut être relancée : rien n'est écrasé.
2. « Charger pipelines & propriétaires » puis choisissez :
   • le pipeline de transactions à alimenter ;
   • le propriétaire (commercial HubSpot) attribué par défaut.
3. Faites correspondre chaque phase BD Report à une étape de votre pipeline
   (R1, R2, MQL, SQL, Signée, KO). Une correspondance par défaut est déjà proposée.
4. Cochez « Activer l'intégration ».

────────────────────────────────────────
4. ENVOYER VOS DONNÉES
────────────────────────────────────────
• « Tout envoyer vers HubSpot » : reprend l'historique complet de l'espace courant.
• « Envoyer mes RDV » / « Envoyer mes contacts » : envoi partiel.
• « Envoyer automatiquement à chaque enregistrement » : chaque RDV créé ou modifié
  part vers HubSpot dans la foulée (recommandé une fois le premier envoi vérifié).
• Bouton « HubSpot » sur une fiche RDV : envoi à l'unité.
• « Importer les contacts » / « Importer les transactions » : dans l'autre sens,
  pour récupérer dans BD Report ce qui existe déjà dans votre CRM.

Les envois sont IDEMPOTENTS : un même rendez-vous renvoyé deux fois met à jour la
transaction existante, il n'en crée pas une seconde.

────────────────────────────────────────
5. CE QUI EST CRÉÉ DANS HUBSPOT
────────────────────────────────────────
Entreprise du RDV  → fiche « Entreprise »        (clé : nom)
Contacts du RDV    → fiches « Contact »          (clé : e-mail)
Rendez-vous        → « Transaction » (deal)      (clé : propriété bdr_rdv_id)
Créneau du RDV     → « Rendez-vous » (meeting)
Notes du RDV       → « Note »
Tâches             → « Tâche »
Toutes les associations (transaction ↔ entreprise ↔ contacts ↔ rendez-vous) sont posées
automatiquement.

────────────────────────────────────────
6. EN CAS DE PROBLÈME
────────────────────────────────────────
• « Aucun portail HubSpot relié » → la connexion n'a pas abouti : recliquez sur
  « Connecter mon HubSpot ».
• « Accès refusé (403) » → une autorisation manque côté HubSpot : déconnectez puis
  reconnectez pour réaccorder les autorisations demandées.
• « Fenêtre bloquée » → autorisez les fenêtres surgissantes pour BD Report.
• Le « Journal des appels », en bas de la page, montre le détail des derniers échanges
  avec HubSpot : joignez-en une capture à votre ticket, cela accélère le diagnostic.

Une question ? Ouvrez un ticket depuis l'onglet « Support » : l'équipe BD Report a accès
au même journal et peut vérifier l'état de votre connexion.`,
}

function defaultKbArticles() {
  const now = new Date().toISOString()
  return [
    { ...KB_HUBSPOT_ARTICLE, createdAt: now, updatedAt: now },
    ...KB_ARTICLES.map(a => ({ ...a, createdAt: now, updatedAt: now })),
  ]
}

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
    activityRules: [], // primes d'activité (volume de RDV par période × phases) — voir computeActivityPrimes
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
    notifs: [],   // notifications d'événements : { id, ts, type, title, text, page, read }
    lostReasons: ['Pas de budget', 'Concurrent retenu', 'Mauvais timing', 'Pas décideur', 'Injoignable'],
    noShowReasons: ['Injoignable', 'A annulé', 'A oublié', 'Reporté sans date'],
    currency: 'EUR', // devise des primes (EUR ou USD)
    tasks: [], // Mes tâches : { id, title, description, dueDate, assignee, company, contact, rdvId, done, archived, pinned, createdAt }
    taskTrash: [], // corbeille des tâches : restaurables 30 jours
    icpProfiles: [], // profils ICP enregistrés : { id, name, secteurs[], effMin, effMax, postes[], createdAt }
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
      // Compte de démo pour une instance vierge. Aucun identifiant réel en clair dans le code :
      // sur l'app en ligne, ce compte est remplacé par les données réelles de Supabase.
      // Mot de passe stocké UNIQUEMENT sous forme de hash SHA-256 (aucun mot de passe en clair dans le code).
      id: '01', email: deob('BgEfCjANFgZIHw0UWRxRQkY='), pseudo: deob('LRMXCz0bAg=='), password: 'sha256:0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d',
      role: 'Fondateur', developer: true, plan: 'beta', photo: '', bricks: [...BRICKS], teamOf: null,
    }],
    environments: [{ id: envId, name: deob('MgEdFRwKIQRFChADXg=='), logo: '', pin: '', plan: 'beta', createdBy: '01', departments: ['Marketing', 'Sales', 'Tech', 'Direction'] }],
    subenvs: [{ id: subId, envId, prenom: deob('LRMXCw=='), nom: deob('LxYTCxlPMBtDAQsDXw=='), poste: 'BDR', service: 'Marketing', pin: '1205', photo: '', ownerId: '01' }],
    data: { [subId]: subData },
    supportRequests: [], // « Nouvelles demandes » : formulaires de contact du site
    tickets: [], // « Tickets Techniques » : tickets de support ouverts depuis l'app
    clients: [], // Kanban Clients (back-office support)
    projects: [], // Gestion de projet (back-office support)
    supportTrash: [], // Corbeille du back-office support (demandes / tickets supprimés)
    cannedReplies: defaultCannedReplies(), // réponses types du support
    kbArticles: defaultKbArticles(), // base de connaissances
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
      // Validée d'office ; un manager peut l'invalider (retirée des stats).
      invalidated: !!r.primeInvalidated,
      invalidatedBy: r.primeInvalidated?.by || null,
      invalidatedReason: r.primeInvalidated?.reason || '',
    })
  })
  return primes
}

// ============================================================ Primes d'activité (volume de RDV)
// Deuxième type de barème : au lieu d'une prime par RDV (effectif × source), on récompense
// le VOLUME de rendez-vous sur une période (semaine/mois/trimestre/année), croisé avec une
// sélection de phases, via des paliers « à partir de N RDV → montant ». Pensé comme des règles
// (façon règles de données Excel) : une liste de règles empilables, chacune = période + phases
// + paliers.
export const ACTIVITY_PERIODS = [
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'annee', label: 'Année' },
]
function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = (d.getUTCDay() + 6) % 7 // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // jeudi de la semaine
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return { year: d.getUTCFullYear(), week }
}
export function activityPeriodKey(period, dateStr) {
  const d = parseISO(dateStr); if (!d || isNaN(d)) return null
  const y = d.getFullYear()
  if (period === 'annee') return String(y)
  if (period === 'trimestre') return `${y}-T${Math.floor(d.getMonth() / 3) + 1}`
  if (period === 'semaine') { const { year, week } = isoWeekParts(d); return `${year}-S${String(week).padStart(2, '0')}` }
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}` // mois
}
// Date représentative (fin de période) → sert au mois de paiement et au tri.
function activityPeriodEnd(period, key) {
  if (period === 'annee') return `${key}-12-31`
  if (period === 'trimestre') { const [y, q] = key.split('-T'); const m = Number(q) * 3; return `${y}-${String(m).padStart(2, '0')}-28` }
  if (period === 'semaine') {
    const [y, w] = key.split('-S'); const simple = new Date(Date.UTC(Number(y), 0, 1 + (Number(w) - 1) * 7))
    const day = (simple.getUTCDay() + 6) % 7; simple.setUTCDate(simple.getUTCDate() - day + 6) // dimanche
    return simple.toISOString().slice(0, 10)
  }
  return `${key}-28` // mois
}
export function activityPeriodLabel(period, key) {
  if (period === 'annee') return key
  if (period === 'trimestre') { const [y, q] = key.split('-T'); return `T${q} ${y}` }
  if (period === 'semaine') { const [y, w] = key.split('-S'); return `Semaine ${Number(w)} · ${y}` }
  const d = parseISO(key + '-01'); return d ? monthLabel(d) : key
}
export function activityRuleTitle(rule) {
  if (rule.label && rule.label.trim()) return rule.label.trim()
  const per = ACTIVITY_PERIODS.find(p => p.id === rule.period)?.label || rule.period
  const ph = (rule.phases && rule.phases.length) ? rule.phases.join('/') : 'tous les RDV'
  return `RDV ${ph} · par ${per.toLowerCase()}`
}
// Calcule les primes d'activité : une prime par (règle, période atteignant un palier).
export function computeActivityPrimes(rdvs, rules) {
  const out = []
  ;(rules || []).forEach(rule => {
    const phases = rule.phases || []
    const tiers = [...(rule.tiers || [])].map(t => ({ min: Number(t.min) || 0, montant: Number(t.montant) || 0 })).sort((a, b) => a.min - b.min)
    if (!tiers.length) return
    const buckets = {}
    ;(rdvs || []).forEach(r => {
      if (phases.length && !phases.includes(r.phase)) return
      const d = r.dateRdv || r.datePriseRdv || r.createdAt
      const pk = activityPeriodKey(rule.period, d)
      if (!pk) return
      buckets[pk] = (buckets[pk] || 0) + 1
    })
    Object.entries(buckets).forEach(([pk, count]) => {
      let tier = null
      tiers.forEach(t => { if (count >= t.min) tier = t })
      if (!tier || tier.montant <= 0) return
      const end = activityPeriodEnd(rule.period, pk)
      const endD = parseISO(end)
      out.push({
        id: rule.id + ':' + pk, kind: 'activity', ruleId: rule.id, ruleLabel: activityRuleTitle(rule),
        period: rule.period, periodKey: pk, periodLabel: activityPeriodLabel(rule.period, pk),
        phases, count, tierMin: tier.min, montant: tier.montant,
        triggerDate: end,
        payMonthKey: endD ? monthKey(endD) : null, payMonthLabel: endD ? monthLabel(endD) : '—',
        figee: false, invalidated: false,
      })
    })
  })
  return out
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

// Jeu de données de démonstration (mode formation) : palette variée de RDV
// (SQL, signés, no-show, perdus) pour explorer toutes les pages sans données réelles.
const DEMO_NAMES = [
  ['Acme Corp', 'SaaS RH', 120, 'Marie Durand', 'DRH'],
  ['Globex', 'Industrie', 450, 'Paul Martin', 'Directeur Ops'],
  ['Initech', 'Finance', 80, 'Sophie Bernard', 'CFO'],
  ['Umbrella', 'Santé', 900, 'Luc Petit', 'VP Sales'],
  ['Hooli', 'Tech', 300, 'Emma Roux', 'CTO'],
  ['Soylent', 'Agro', 60, 'Nadia Blanc', 'CEO'],
  ['Wonka Ind.', 'Retail', 220, 'Karim Haddad', 'Head of Sales'],
  ['Stark', 'Énergie', 1500, 'Julie Moreau', 'Directrice'],
]
const DEMO_OPTS = [
  { phase: 'SQL', opp: 'En cours', sql: 8, source: 'Outbound' },
  { phase: 'Signée', opp: 'Gagnée', sql: 22, source: 'Inbound' },
  { phase: 'R2', opp: 'En cours', source: 'Outbound' },
  { phase: 'R1', opp: 'No Show R1', source: 'Outbound', motifNoShow: 'Injoignable' },
  { phase: 'SQL', opp: 'En cours', sql: 12, source: 'Inbound' },
  { phase: 'R1', opp: 'Perdue', motifKo: 'Pas de budget', source: 'Outbound' },
  { phase: 'R2', opp: 'En cours', source: 'Inbound' },
  { phase: 'Signée', opp: 'Gagnée', sql: 26, source: 'Outbound' },
]
export function makeDemoRdvs() { return makeTestRdvs(DEMO_NAMES, DEMO_OPTS) }

// ---------------------------------------------------------------- Démo commerciale (app réelle isolée)
// Base de données FABRIQUÉE de toutes pièces (société fictive « Atlas Revenue »), montée dans un
// StoreProvider isolé (prop `demo`) : aucune persistance, aucun cloud, aucune session écrite, et
// AUCUN lien avec le compte de la personne qui lance la démo. Beaucoup de données (manager + 4 BDR,
// dizaines de RDV, primes, règle d'activité, conversations) pour dérouler toutes les fonctionnalités.
const DEMO_PW = 'sha256:937e8d5fbb48bd4949536cd65b8d35c426b80d2f830c5c308e2cdec422ae2244' // hash factice (login inutile en démo)
// Contenu quotidien d'un espace de démonstration. Sans tâches, notes ni ICP, la démo
// présente un produit vide là où le prospect attend une journée de travail crédible.
function seedDemoWorkspace(d, who = '') {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const noShow = d.rdvs.find(r => String(r.opportunite || '').startsWith('No Show'))
  const enCours = d.rdvs.find(r => r.opportunite === 'En cours')
  const gagne = d.rdvs.find(r => r.opportunite === 'Gagnée' || r.opportunite === 'Signée')

  d.tasks = [
    {
      id: uid(), title: `Replanifier ${noShow?.entreprise || 'le rendez-vous manqué'}`,
      description: 'Le contact ne s\'est pas présenté : reproposer deux créneaux et confirmer par e-mail.',
      dueDate: day(-1), company: noShow?.entreprise || '', done: false, pinned: true, createdAt: nowIso,
    },
    {
      id: uid(), title: `Préparer le R2 ${enCours?.entreprise || ''}`.trim(),
      description: 'Relire le compte rendu du R1 et préparer trois questions de qualification budget.',
      dueDate: day(1), company: enCours?.entreprise || '', done: false, createdAt: nowIso,
    },
    {
      id: uid(), title: 'Mettre à jour les effectifs du portefeuille',
      description: 'Trois fiches ont un effectif estimé : vérifier sur LinkedIn avant le calcul des primes.',
      dueDate: day(4), done: false, createdAt: nowIso,
    },
    {
      id: uid(), title: `Envoyer la proposition à ${gagne?.entreprise || 'la société signée'}`,
      description: 'Devis validé en interne, reste à envoyer.', dueDate: day(-3), done: true, createdAt: nowIso,
    },
  ]

  d.notes = [
    {
      id: uid(), title: `Compte rendu R1 — ${enCours?.entreprise || 'prospect'}`, folder: 'Général', createdAt: nowIso,
      content: `Interlocuteur réceptif, projet identifié pour le trimestre prochain.\n\nBesoin : structurer le suivi des candidatures, aujourd'hui éclaté entre trois outils.\nBudget : évoqué, non chiffré — à qualifier au R2.\nDécideur : notre contact prépare la décision, l'arbitrage revient à la direction.\n\nProchaine étape : R2 avec la direction, démo ciblée sur le reporting.`,
    },
    {
      id: uid(), title: 'Objections récurrentes cette semaine', folder: 'Général', createdAt: nowIso,
      content: `« On a déjà un outil » → demander lequel, puis creuser ce qui manque plutôt que comparer.\n« Pas le budget cette année » → viser une mise en place au prochain exercice, garder le contact tiède.\n« Rappelez-moi dans six mois » → proposer une date précise, sinon la relance se perd.`,
    },
    {
      id: uid(), title: 'À retenir sur le secteur industrie', folder: 'Général', createdAt: nowIso,
      content: `Les DRH industrie décident rarement seuls : le DAF entre presque toujours dans la boucle.\nLes cycles sont longs mais les renouvellements quasi automatiques.\nArgument qui porte : le temps passé à consolider les tableaux de bord.`,
    },
  ]

  d.icpProfiles = [
    {
      id: uid(), name: 'ETI industrie 200-800', secteurs: ['Industrie', 'Énergie', 'Logistique'],
      effMin: 200, effMax: 800, postes: ['DRH', 'DAF', 'DG'], createdAt: nowIso,
    },
    {
      id: uid(), name: 'Scale-up SaaS', secteurs: ['SaaS', 'IT', 'Cybersécurité'],
      effMin: 30, effMax: 250, postes: ['CEO', 'COO', 'Head of People'], createdAt: nowIso,
    },
  ]
  return d
}

export function buildDemoDb() {
  const db = {
    accounts: [], environments: [], subenvs: [], data: {},
    supportRequests: [], tickets: [], clients: [], projects: [],
    supportTrash: [], cannedReplies: [], kbArticles: [],
  }
  const mkAcc = (id, pseudo, role, teamOf) => ({ id, email: `${pseudo.toLowerCase()}@atlas.demo`, pseudo, password: DEMO_PW, role, developer: false, plan: 'beta', photo: '', bricks: [...BRICKS], teamOf, presence: id === 'demo-b1' ? 'online' : (id === 'demo-b3' ? 'dnd' : 'online') })
  db.accounts.push(
    mkAcc('demo-mgr', 'ChloeManager', 'Manager', null),
    mkAcc('demo-b1', 'LucasBDR', 'Membre', 'demo-mgr'),
    mkAcc('demo-b2', 'SaraBDR', 'Membre', 'demo-mgr'),
    mkAcc('demo-b3', 'MehdiBDR', 'Membre', 'demo-mgr'),
    mkAcc('demo-b4', 'JadeBDR', 'Membre', 'demo-mgr'),
  )
  const svcSales = uid(), svcSdr = uid()
  db.environments.push({
    id: 'env-demo', name: 'Atlas Revenue', logo: '', pin: '', plan: 'beta', createdBy: 'demo-mgr', subState: 'active',
    departments: ['Sales', 'SDR'], services: [{ id: svcSales, name: 'Sales' }, { id: svcSdr, name: 'SDR' }],
    members: ['demo-mgr', 'demo-b1', 'demo-b2', 'demo-b3', 'demo-b4'],
    comments: {
      'novacorp industries': [
        { id: uid(), ts: new Date(Date.now() - 2 * 86400000).toISOString(), text: 'Compte stratégique — le DAF pousse fort ce trimestre. @Lucas on cale une démo ?', author: 'Chloé Nguyen', authorSubId: 'dsub-mgr' },
      ],
    },
  })
  const mkSub = (id, prenom, nom, poste, ownerId, serviceId) => ({ id, envId: 'env-demo', prenom, nom, poste, service: serviceId === svcSales ? 'Sales' : 'SDR', serviceId, pin: '0000', photo: '', ownerId })
  db.subenvs.push(
    mkSub('dsub-mgr', 'Chloé', 'Nguyen', 'Head of Sales', 'demo-mgr', svcSales),
    mkSub('dsub-b1', 'Lucas', 'Fabre', 'BDR Senior', 'demo-b1', svcSdr),
    mkSub('dsub-b2', 'Sara', 'Ben Ali', 'BDR', 'demo-b2', svcSdr),
    mkSub('dsub-b3', 'Mehdi', 'Cohen', 'BDR', 'demo-b3', svcSdr),
    mkSub('dsub-b4', 'Jade', 'Moreau', 'SDR', 'demo-b4', svcSales),
  )
  const build = (rows, opts, extra) => {
    const d = emptySubEnvData()
    d.rdvs = makeTestRdvs(rows, opts)
    d.contacts = []; d.rdvs.forEach(r => syncContacts(d, r))
    d.goals = { rdvSemaine: 12, sqlMois: 8, primesMois: 2000 }
    seedDemoWorkspace(d)
    if (extra) extra(d)
    return d
  }
  db.data['dsub-b1'] = build([
    ['NovaCorp Industries', 'Industrie', 450, 'Pierre Vasseur', 'DAF'], ['Hexalog', 'Logistique', 120, 'Amélie Roux', 'DRH'],
    ['Datapulse', 'SaaS', 35, 'Lucas Brun', 'CEO'], ['Verdana Group', 'Retail', 800, 'Chloé Martin', 'VP People'],
    ['CleanTech SE', 'Énergie', 230, 'Inès Dupré', 'Head of HR'], ['Groupe Méridien', 'Banque', 2500, 'François Bayard', 'DRH'],
    ['Solstice Énergie', 'Énergie', 380, 'Laura Pinto', 'Head of Talent'], ['Atelier Mobilier', 'Manufacture', 60, 'Hugo Lefort', 'DG'],
    ['Kairos Santé', 'Santé', 340, 'Nora Belkacem', 'DRH'], ['Vent du Nord', 'Énergie', 150, 'Antoine Lemoine', 'DG'],
    ['Papeterie Auber', 'Industrie', 95, 'Sylvie Marchand', 'Responsable RH'],
  ], [
    { phase: 'SQL', opp: 'Gagnée', sql: 6, source: 'Outbound', prov: 'Cold Call' }, { phase: 'MQL', opp: 'En cours', source: 'Inbound', prov: 'Site Web' },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'A annulé', source: 'Outbound', prov: 'LinkedIn' }, { phase: 'Signée', opp: 'Signée', sql: 20, source: 'Event', prov: 'Salon' },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Pas de budget', source: 'Outbound' }, { phase: 'SQL', opp: 'Gagnée', sql: 3, source: 'Partner', prov: 'Référence client' },
    { phase: 'R2', opp: 'En cours', source: 'Inbound' }, { phase: 'R1', opp: 'En cours', source: 'Outbound', prise: 3, rdv: -2 },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'A oublié', source: 'Inbound', prise: 5, rdv: -4 },
    { phase: 'MQL', opp: 'En cours', source: 'Emailing', prov: 'Séquence email' },
    { phase: 'SQL', opp: 'Gagnée', sql: 9, source: 'Inbound', prov: 'Site Web' },
  ], (d) => {
    // Une règle de prime par activité pour illustrer le simulateur RDV-based.
    d.activityRules = [{ id: uid(), label: 'Cadence R1/R2', period: 'mois', phases: ['R1', 'R2'], tiers: [{ id: uid(), min: 6, montant: 200 }, { id: uid(), min: 12, montant: 500 }, { id: uid(), min: 20, montant: 1000 }] }]
  })
  db.data['dsub-b2'] = build([
    ['BlueWave Conseil', 'Conseil', 25, 'Emma Petit', 'Associée'], ['FerroTrans', 'Transport', 1500, 'Nadia Slimani', 'DRH Groupe'],
    ['Studio Pixel', 'Création', 15, 'Léo Garnier', 'Fondateur'], ['AgriPlus', 'Agroalimentaire', 320, 'Paul Mercier', 'DAF'],
    ['Maison Bélier', 'Luxe', 90, 'Sophie Arnaud', 'DRH'], ['TechSecure', 'Cybersécurité', 200, 'Yann Morel', 'COO'],
    ['Orbis Formation', 'Formation', 70, 'Camille Ferrand', 'Directrice'], ['Halte Gourmande', 'Restauration', 210, 'Marc Ovide', 'DRH'],
    ['Nordic Furniture', 'Retail', 430, 'Elin Persson', 'Head of People'],
  ], [
    { phase: 'MQL', opp: 'En cours', source: 'Inbound' }, { phase: 'SQL', opp: 'Gagnée', sql: 12, source: 'Outbound' },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Concurrent retenu', source: 'Event' }, { phase: 'R1', opp: 'En cours', source: 'Partner', prise: 2, rdv: -3 },
    { phase: 'Signée', opp: 'Signée', sql: 26, source: 'Outbound' }, { phase: 'R2', opp: 'En cours', source: 'Inbound' },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'Reporté sans date', source: 'Outbound', prise: 6, rdv: -5 },
    { phase: 'MQL', opp: 'En cours', source: 'Partner' },
    { phase: 'SQL', opp: 'Gagnée', sql: 14, source: 'Event', prov: 'Salon' },
  ])
  db.data['dsub-b3'] = build([
    ['Urbavert', 'Paysagisme', 45, 'Julien Caron', 'Gérant'], ['Grand Large Hotels', 'Hôtellerie', 600, 'Claire Fontaine', 'VP RH'],
    ['Oreca', 'Sport auto', 400, 'Clémence Boutier', 'DRH'], ['Advans', 'Finance', 1200, 'Rémy Ducret', 'CFO'],
    ['Clinique du Parc', 'Santé', 800, 'Lisa March', 'DRH'],
    ['Atlas Béton', 'BTP', 520, 'Karim Haddad', 'DRH'], ['Studio Lumen', 'Média', 40, 'Alice Robin', 'Fondatrice'],
  ], [
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'Injoignable', source: 'Outbound' }, { phase: 'MQL', opp: 'En cours', source: 'Emailing' },
    { phase: 'SQL', opp: 'Gagnée', sql: 20, source: 'Event' }, { phase: 'R2', opp: 'En cours', source: 'Inbound' },
    { phase: 'SQL', opp: 'En cours', sql: 4, source: 'Outbound' },
    { phase: 'R1', opp: 'En cours', source: 'Inbound', prise: 2, rdv: -1 },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Mauvais timing', source: 'Emailing' },
  ])
  db.data['dsub-b4'] = build([
    ['Stratus', 'SaaS', 500, 'Nassim Benchikh', 'CTO'], ['Thom Group', 'Retail', 6450, 'Florian Forthomme', 'DRH'],
    ['Odalia', 'Immobilier', 255, 'Rémi Rommelard', 'DG'], ['Evernex', 'IT', 1400, 'Nicolas Combemorel', 'VP'],
    ['Mistral Cloud', 'SaaS', 180, 'Théo Vidal', 'CEO'], ['Ateliers Renard', 'Artisanat', 55, 'Manon Girard', 'Gérante'],
  ], [
    { phase: 'R1', opp: 'En cours', source: 'Inbound' }, { phase: 'R1', opp: 'En cours', source: 'Outbound', prise: 40, rdv: 38 },
    { phase: 'MQL', opp: 'En cours', source: 'Inbound' }, { phase: 'SQL', opp: 'Gagnée', sql: 10, source: 'Outbound' },
    { phase: 'R2', opp: 'En cours', source: 'Partner' },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'Injoignable', source: 'Outbound', prise: 4, rdv: -3 },
  ])
  db.data['dsub-mgr'] = build([
    ['Cooperative U', 'Grande distribution', 80000, 'Audrey Hillaert', 'DRH Groupe'], ['Verisure', 'Sécurité', 17000, 'Charles Devresse', 'VP'],
  ], [
    { phase: 'Signée', opp: 'Signée', sql: 28, source: 'Partner', prov: 'Référence client' }, { phase: 'SQL', opp: 'Gagnée', sql: 6, source: 'Inbound' },
  ])

  const out = migrate(db)

  // Conversation d'équipe déjà entamée : un canal vide donne l'impression d'un produit
  // que personne n'utilise, alors que c'est justement ce qu'on veut montrer vivant.
  const general = (out.channels || []).find(c => c.envId === 'env-demo' && !c.personal && !c.reporting)
  if (general) {
    const ago = (h) => new Date(Date.now() - h * 3600000).toISOString()
    const msg = (h, subId, name, text) => ({
      id: uid(), ts: ago(h), authorId: null, authorSubId: subId, authorName: name,
      authorPhoto: '', text, reactions: {},
    })
    out.channelMessages = out.channelMessages || {}
    out.channelMessages[general.id] = [
      msg(26, 'dsub-mgr', 'Chloé Nguyen', 'Point rapide : il nous manque 3 SQL pour tenir l\'objectif du mois. On se concentre sur les dossiers déjà en R2.'),
      msg(25, 'dsub-b1', 'Lucas Fabre', 'De mon côté NovaCorp est signé 🎉 Le DAF a validé hier soir.'),
      msg(24, 'dsub-mgr', 'Chloé Nguyen', 'Bravo Lucas. Tu peux partager ce qui a débloqué ? Ça peut servir sur Groupe Méridien.'),
      msg(23, 'dsub-b1', 'Lucas Fabre', 'Le passage par le DAF plutôt que par la DRH. Sur ce secteur c\'est lui qui arbitre, on perdait du temps ailleurs.'),
      msg(6, 'dsub-b2', 'Sara Ben Ali', 'J\'ai deux no-show cette semaine, je replanifie aujourd\'hui. Quelqu\'un a un modèle de relance qui marche bien ?'),
      msg(5, 'dsub-b3', 'Mehdi Cohen', 'Je t\'envoie le mien, il tourne à ~40 % de reprise de RDV.'),
      msg(2, 'dsub-mgr', 'Chloé Nguyen', 'Pensez à renseigner la provenance sur vos RDV : sans elle la prime ne se calcule pas.'),
    ]
  }

  // On ne garde que la société de démo dédiée (retire l'env de test générique ajouté par migrate).
  out.environments = out.environments.filter(e => e.id !== 'env-test')
  out.accounts = out.accounts.filter(a => !String(a.id).startsWith('test-'))
  out.subenvs = out.subenvs.filter(s => !String(s.id).startsWith('tsub-'))
  Object.keys(out.data).forEach(k => { if (k.startsWith('tsub-')) delete out.data[k] })
  out.channels = (out.channels || []).filter(c => c.envId !== 'env-test')
  return out
}
// Session de démo — société fictive « Atlas Revenue » (aucun lien avec le compte réel).
// 'manager' → Chloé (Head of Sales) · sinon → Lucas (BDR).
// ---------------------------------------------------------------------------
//  ESPACE DE FORMATION DU STAFF — un environnement isolé, vu depuis la console
//  support, rempli de tout ce qu'un membre du staff doit savoir traiter :
//  demandes entrantes, tickets à tous les stades, clients satisfaits et à risque,
//  projets à paramétrer, notes de satisfaction. Aucune donnée réelle n'est touchée.
// ---------------------------------------------------------------------------
export function trainingSession() {
  return { accountId: 'train-sup', envId: 'tenv-interne', subEnvId: 'tsubi-sup', welcomed: true }
}

// `roleKey` : la casquette staff que l'on vient incarner. `realRoles` : les rôles tels
// qu'ils sont configurés en production, pour que la formation reflète les permissions
// réellement en vigueur et non des valeurs par défaut.
export function buildTrainingDb(roleKey, realRoles) {
  const db = {
    accounts: [], environments: [], subenvs: [], data: {},
    supportRequests: [], tickets: [], clients: [], projects: [],
    supportTrash: [], cannedReplies: [], kbArticles: [], productRatings: [],
  }
  const iso = (h) => new Date(Date.now() + h * 3600000).toISOString()

  // --- Équipe BD Report (celle qu'on incarne pendant la formation)
  const mkStaff = (id, pseudo, role, teamOf) => ({
    id, email: `${pseudo.toLowerCase()}@bdreport.training`, pseudo, password: DEMO_PW, role,
    developer: false, plan: 'beta', photo: '', bricks: [...BRICKS], teamOf,
    createdAt: iso(-24 * 400), presence: 'online',
  })
  db.accounts.push(
    mkStaff('train-sup', 'VousSupport', roleKey || 'Support BD Report', null),
    mkStaff('train-mgr', 'CamilleSupport', 'Support BD Report', null),
    mkStaff('train-dev', 'NoahDev', 'Développeur', 'train-mgr'),
  )
  db.environments.push({
    id: 'tenv-interne', name: 'BD Report — interne', logo: '', pin: '', plan: 'beta', createdBy: 'train-sup',
    subState: 'active', departments: ['Support'], services: [], members: ['train-sup', 'train-mgr', 'train-dev'],
  })
  db.subenvs.push({ id: 'tsubi-sup', envId: 'tenv-interne', prenom: 'Vous', nom: '(formation)', poste: 'Support', service: '', pin: '', photo: '', ownerId: 'train-sup' })
  db.data['tsubi-sup'] = emptySubEnvData()

  // --- Entreprises clientes, chacune illustrant une situation différente
  const CLIENTS = [
    { id: 'tenv-vallon', name: 'Vallon Industries', seats: 25, status: 'actifs' },
    { id: 'tenv-hexatel', name: 'Hexatel', seats: 12, status: 'demandes' },
    { id: 'tenv-lamarche', name: 'Groupe Lamarche', seats: 40, status: 'actifs' },
    { id: 'tenv-prisma', name: 'Prisma Group', seats: 22, status: 'attente' },
    { id: 'tenv-aurea', name: 'Aurea Consulting', seats: 8, status: 'actifs' },
    { id: 'tenv-bardin', name: 'Bardin & Fils', seats: 15, status: 'nonaboutis' },
    { id: 'tenv-vent', name: 'Vent Debout', seats: 10, status: 'anciens' },
  ]
  CLIENTS.forEach((c, i) => {
    const accId = `tacc-${i}`
    db.accounts.push({
      id: accId, email: `contact@${c.name.toLowerCase().replace(/[^a-z]/g, '')}.training`,
      pseudo: c.name.split(' ')[0], password: DEMO_PW, role: 'Manager', developer: false,
      plan: 'beta', photo: '', bricks: [...BRICKS], teamOf: null, createdAt: iso(-24 * (30 + i * 25)),
    })
    db.environments.push({
      id: c.id, name: c.name, logo: '', pin: '', plan: 'beta', createdBy: accId,
      subState: 'active', departments: ['Sales'], services: [], members: [accId],
    })
    db.subenvs.push({ id: `tsub-${i}`, envId: c.id, prenom: c.name.split(' ')[0], nom: 'Contact', poste: 'Manager', service: '', pin: '', photo: '', ownerId: accId })
    db.data[`tsub-${i}`] = emptySubEnvData()
  })

  // --- Tickets à tous les stades : non pris en charge, en cours, clôturés, notés bas.
  const T = [
    ['tenv-vallon', 'Connexion & authentification', 'urgente', 'open', null, -3, [
      ['user', "Impossible de me connecter depuis ce matin, ni par mot de passe ni par Google. Toute l'équipe est bloquée."],
    ]],
    ['tenv-hexatel', 'Import / export de données', 'normale', 'in_progress', 'train-mgr', -30, [
      ['user', "Mon import de 400 contacts n'a repris que 120 lignes."],
      ['support', 'Bonjour, chaque ligne comporte-t-elle bien une adresse e-mail ?'],
      ['user', "Non, une partie n'en a pas."],
    ]],
    ['tenv-prisma', 'Bug / anomalie', 'haute', 'open', null, -50, [
      ['user', 'La page Leads reste blanche depuis la mise à jour. Ça marche chez ma collègue.'],
    ]],
    ['tenv-prisma', 'Insatisfaction', 'urgente', 'open', null, -8, [
      ['user', "Troisième ticket en deux semaines. La direction commence à poser des questions sur la fiabilité de l'outil."],
    ]],
    ['tenv-prisma', 'Question produit', 'normale', 'closed', 'train-mgr', -260, [
      ['user', 'Comment corriger un score de qualité des données trop bas ?'],
      ['support', "La page Qualité des données liste chaque anomalie et permet d'ouvrir la fiche concernée."],
    ], 2, 'Réponse correcte mais il a fallu quatre jours pour l\'obtenir.'],
    ['tenv-aurea', 'Primes & commissions', 'haute', 'in_progress', 'train-sup', -20, [
      ['user', "J'ai corrigé un effectif mais la prime n'a pas bougé. C'est un bug ?"],
    ]],
    ['tenv-lamarche', 'Question produit', 'basse', 'open', null, -70, [
      ['user', 'Peut-on avoir des rôles différents selon nos quatre filiales ?'],
    ]],
    ['tenv-vallon', 'Demande d\'évolution', 'basse', 'open', null, -100, [
      ['user', 'Un export automatique vers notre outil de BI tous les lundis serait précieux.'],
    ]],
    ['tenv-bardin', 'Formation & prise en main', 'basse', 'in_progress', 'train-dev', -120, [
      ['user', "Personne chez nous ne comprend la différence entre MQL et SQL."],
    ]],
    ['tenv-aurea', 'Connexion & authentification', 'normale', 'closed', 'train-sup', -300, [
      ['user', "Un collaborateur ne reçoit pas l'écran Google."],
      ['support', "Son adresse Google correspond-elle exactement à celle de son compte ?"],
      ['user', 'Non, il utilise son adresse personnelle. Corrigé, ça marche. Merci !'],
    ], 5, 'Réponse rapide et claire.'],
    ['tenv-hexatel', 'Sécurité & données', 'haute', 'open', null, -14, [
      ['user', 'Un prospect demande la suppression de ses données. Quelle est la procédure ?'],
    ]],
    ['tenv-vent', 'Facturation & abonnement', 'normale', 'closed', 'train-mgr', -700, [
      ['user', 'Nous arrêtons notre activité de prospection, comment résilier ?'],
      ['support', 'Depuis Paramètres → Gérer mes environnements. Vous gardez 30 jours pour exporter.'],
    ], 4, ''],
  ]
  T.forEach(([envId, category, priority, status, assignedTo, hoursAgo, msgs, csat, csatComment], i) => {
    const env = db.environments.find(e => e.id === envId)
    const created = iso(hoursAgo)
    db.tickets.push({
      id: `ttk-${i}`, category, status, priority, assignedTo, csat: csat ? { score: csat, comment: csatComment || '', ts: iso(hoursAgo + 2) } : null,
      userAccountId: env?.createdBy || null, userName: env?.name || 'Client', userPhoto: '',
      clientName: env?.name || '', envId, subEnvId: null,
      createdAt: created, closedAt: status === 'closed' ? iso(hoursAgo + 6) : undefined,
      takenAt: assignedTo ? iso(hoursAgo + 1) : undefined,
      handledBy: null, typing: {}, readUserAt: created, readSupportAt: assignedTo ? iso(hoursAgo + 1) : '',
      messages: msgs.map(([from, text], k) => ({
        id: `ttk-${i}-m${k}`, ts: iso(hoursAgo + k), from,
        authorName: from === 'support' ? 'Support BD Report' : (env?.name || 'Client'), authorPhoto: '', text, photo: '',
      })),
    })
  })

  // --- Demandes entrantes du site, à qualifier
  db.supportRequests = [
    { id: 'trq-1', name: 'Léa Vasseur', email: 'lea@ateliersnord.training', company: 'Ateliers Nord', message: "12 commerciaux, nous cherchons à remplacer nos tableurs. Possible d'avoir une démonstration ?", status: 'new', createdAt: iso(-5) },
    { id: 'trq-2', name: 'Marc Ivanov', email: 'm.ivanov@quadra.training', company: 'Quadra', message: 'Question tarifaire : combien pour 40 sièges avec l\'intégration CRM ?', status: 'new', createdAt: iso(-28) },
    { id: 'trq-3', name: 'Sonia Kadri', email: 'sonia@brevet.training', company: 'Brevet & Co', message: 'Vos données sont-elles hébergées en Europe ? Notre DPO le demande.', status: 'new', createdAt: iso(-60) },
  ]

  // --- Notes de satisfaction produit : de quoi faire vivre le dashboard et le risque client
  db.productRatings = [
    { id: 'tpr-1', accountId: 'tacc-3', accountName: 'Prisma', envId: 'tenv-prisma', milestone: 60, score: 2, comment: 'Trop de bugs ces dernières semaines.', ts: iso(-40) },
    { id: 'tpr-2', accountId: 'tacc-3', accountName: 'Prisma', envId: 'tenv-prisma', milestone: 30, score: 2, comment: '', ts: iso(-800) },
    { id: 'tpr-3', accountId: 'tacc-0', accountName: 'Vallon', envId: 'tenv-vallon', milestone: 30, score: 5, comment: 'Adopté par toute l\'équipe en deux semaines.', ts: iso(-200) },
    { id: 'tpr-4', accountId: 'tacc-2', accountName: 'Lamarche', envId: 'tenv-lamarche', milestone: 15, score: 4, comment: '', ts: iso(-300) },
    { id: 'tpr-5', accountId: 'tacc-5', accountName: 'Bardin', envId: 'tenv-bardin', milestone: 15, score: 2, comment: 'Difficile à prendre en main sans accompagnement.', ts: iso(-120) },
    { id: 'tpr-6', accountId: 'tacc-4', accountName: 'Aurea', envId: 'tenv-aurea', milestone: 60, score: 5, comment: '', ts: iso(-90) },
  ]

  if (Array.isArray(realRoles) && realRoles.length) db.staffRoles = realRoles.map(r => ({ ...r }))
  const out = migrate(db)
  // migrate crée un client et un projet par environnement : on leur donne des situations
  // contrastées, sans quoi le kanban et le dashboard seraient uniformes et sans intérêt.
  CLIENTS.forEach(c => {
    const cl = (out.clients || []).find(x => x.envId === c.id)
    if (cl) cl.status = c.status
  })
  const proj = (envId) => (out.projects || []).find(p => p.envId === envId)
  const setP = (envId, patch) => { const p = proj(envId); if (p) Object.assign(p, patch) }
  setP('tenv-vallon', { status: 'prevu', owner: '', name: 'Déploiement Vallon Industries' })
  setP('tenv-hexatel', { status: 'prevu', owner: '', name: 'Reprise de données Hexatel' })
  setP('tenv-lamarche', { status: 'encours', owner: 'Camille', name: 'Onboarding Groupe Lamarche' })
  setP('tenv-prisma', { status: 'encours', owner: 'Noah', name: 'Audit qualité Prisma' })
  setP('tenv-aurea', { status: 'encours', owner: 'Camille', name: 'Formation équipe Aurea' })
  setP('tenv-bardin', { status: 'pause', owner: 'Noah', name: 'Migration Bardin & Fils' })
  setP('tenv-vent', {
    status: 'termine', owner: 'Camille', name: 'Clôture Vent Debout', closedAt: iso(-700),
    closeReason: "Le client cesse son activité de prospection externalisée. Aucun grief sur le produit, décision stratégique.",
  })

  // L'environnement interne n'est pas un client : il ne doit pas polluer le portefeuille.
  out.clients = (out.clients || []).filter(c => c.envId !== 'tenv-interne')
  out.projects = (out.projects || []).filter(p => p.envId !== 'tenv-interne')
  // migrate injecte un environnement de test générique : ses espaces appartiennent à des
  // comptes qui n'existent pas ici, et l'application réclamait leur code d'accès.
  out.environments = out.environments.filter(e => e.id !== 'env-test')
  out.accounts = out.accounts.filter(a => !String(a.id).startsWith('test-'))
  out.subenvs = out.subenvs.filter(x => !String(x.id).startsWith('tsub-julie') && !String(x.id).startsWith('tsub-sarah') && !String(x.id).startsWith('tsub-thomas'))
  out.subenvs = out.subenvs.filter(x => out.environments.some(e => e.id === x.envId))
  Object.keys(out.data).forEach(k => { if (!out.subenvs.some(x => x.id === k)) delete out.data[k] })
  out.subenvs.forEach(x => { if (!out.data[x.id]) out.data[x.id] = emptySubEnvData() })
  out.channels = (out.channels || []).filter(c => c.envId !== 'env-test')
  ;(out.environments || []).forEach(e => { e.pin = '' }) // aucun verrou dans un espace d'entraînement
  return out
}

export function demoSession(role) {
  const manager = role === 'manager'
  return { accountId: manager ? 'demo-mgr' : 'demo-b1', envId: 'env-demo', subEnvId: manager ? 'dsub-mgr' : 'dsub-b1', welcomed: true }
}

function injectTestEnv(db) {
  if (db.environments.some(e => e.id === 'env-test')) return db
  const mkAcc = (id, prenom, nom, pseudo, role, teamOf) => ({
    // Hash SHA-256 uniquement (aucun mot de passe en clair dans le code) — comptes de démo « Test ».
    id, email: `${prenom.toLowerCase()}@test.fr`, pseudo, password: 'sha256:937e8d5fbb48bd4949536cd65b8d35c426b80d2f830c5c308e2cdec422ae2244',
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

// ---------------------------------------------------------------- Pipeline réel importé
// Données importées d'un fichier fourni. Injecté UNE fois dans l'espace 'sub-owen' (flag _autoSeed.pipelineOwen).
function seedPipelineRdvs() {
  // [entreprise, effectif, contact, stage, date, source, commercial, résultat, suite]
  // Données commerciales réelles : elles ne figurent pas en clair dans le fichier livré au
  // navigateur. C'est un masquage de façade — la valeur est reconstruite côté client et
  // reste donc lisible pour qui la cherche : ce n'est pas un secret, seulement de la pudeur.
  const RAW = JSON.parse(deob('OT9QNj85MzkPQ1BTHR4Sf1dfH14MRD4AEwAbGlkKQEoPYAEQGg9HAU1VQkdcTTEbQQtCBUxeXBAaD1QdQCAbFgEaExhECQulhBAcEGRIBkMLFxdFIV1SRh1dVERwHmsQckgEWAEMFwcfGgATD0NXVh0CHBByRBJYBxZSIRUDUiJMHBYJDx4Sf2dhVB1AVUZKQF5dRh1dVEQBEHNdWklWUgMIHkdcTTQVTwYHCA11X0dCTB9fQEhQNiEjUhhCAQVGXlpfRhQBVGIXDQQMUjJeLw82FwRCEBwDBB1aEyUFBxMRBhxUaQoOB1hcVUsUAVR8MyhQSVJdSlscX0BKD3teUFlYGFVASFAvERgXEA09CwBMWxIeFH4CUAwAEBxSQ1AmSAMDCE5XEAAGH0ATP0gpRzUaABtAChYUQkJfXlMNO1QWHlBJQldCWA8sCgdfXlVcUw07WAEMFwkDTV5WYD4uRAEQAgAZHEYTTkY7CxIABxpJTU5EZ1NHV1INJFgEBRtHXE0xGEIcBwINZV9cFAFUHEA5Xj5SKjwnD0NTVh0CHBB1RRdDDgEBRTQaAgZITU5EYGN8EBoPRAFNVUJHXE09AVkNDRNDVhIeFGwaVBoNAUUgCRsSSwoQCkRcVxAaDzJYERUHBBwGFB3uxkBKDx8Sbxp2VHMDFhsJHAoGVgFWV1YBEH1bVUUTXUIiAAQJHBsTQwoRRAEQfWN6D1oTUVVdVEBNXlZiGhYEQkdeVhQBVHAXFhcJGQocVGAAFwpEXBIeFH4CUAwAEBxSQ1AmSAMDCE5XEAAGH0ATP0gpRzUZHQZECg5EAQECAgYBVHIKBQAJFQEXVGkKCAdfVllcFAFUfDMoUElSXktbHV5NVB0ABhAaDzlEFgYdEB4LUFgPJQMRSFYQYF9LF1hASFAgHk8RG1gdEUQBEHVcFk4ZRBAXUDhcNFA2XwoREg1/VUZEQgZeDgFQSUNaQkQBTTADQ1NFVhZqA1gGAQZHXE0/JWFNTkQfBh8DBwJEAVBRUElSIAcATwAXCEkQHBB8TAFUBkQgDBYOG1YBTTIUQlhVRhYfRgNURl5HMRsGEUMbB0RwHmsQc1sTQwwBCkdcXkZEHUNAKERRX15XXlZyDQkQAB0AABFBTU5EYGN8EBoPRAVNVUNHXE0+HUMEBwJkXBIeFGsXUwsBHEU3AAcATAYMRAEQY2N6DRpeDANSFhgABlYBTTADQVNeUVNfVGxOP1AqBAoAFQ9DUVYdHhJxV18ZXQsKF0UyCh5WAU0vN2EQHBAEHlkBU0ZeRz8aBhZCGgwCDx4Sc1pIDlgRRCIDGQkUEV8DCwhKEBwQekIFRUBIUEhSMl4vDysHAEJcRFNfQxMTTlJHVVxNMRxfBhESQkJYVxZlE0MODRxHXE0/JWFNTkQcAB8CBw9aEycJEwwcTV5WbBoQA0FbVVwWYBlEDg0cR1xNNxoNDA0TX0ESHhR+A1gUDVA4XDRQIkgdCxVYQFUQGhxBAVJUXkczBxMGQQoRRmlXRkBTXgVUQEhQN0FNXlYcW01WHB0CAgQbVB1AKBsLGwoWPUNNTkQPHhJ8WQ0QWBZGXkddTS9Ydk0tAkxeWVMUAUQEV0hQNxUCG1R/AA8LSF5RQFIPWhMvNT5HXE1ARQJfU0QBEHlcVEIDXwZGXkcxGgARQQYHCA1/X0daRBgTTkYhNDxPNxpKDgUDDx4SYUNEAFhAOV4+UiAAEU4OQEoZAgAeFG4aVA8BHAYVTzAbWBsLA18QHBB7fDoTTkZDXF9eQFYBTSsIT11FXFIPWhMkBRAMFQFSM0IaFgdEXBIeFH4nfUIhHAIRCBdWAU1PRHAeaxB3fzx+QEhCSVIrFxhZAA8ESB1zU0RftZhASFAoISNQWA9eWkkdAB8ABh9AE05GOwsSAAcaSU1ORGdTR1dSDSRYBAUbR1xNISVhTzMTTF5ZVE8PWhNPRi9JK00xG0IfBxRMRllEUw0jE05cQlVAX15WbBoGFEhLEHpfQRpQBxYGR1xNPyVhTU5EHwMfAgcPWhMrChAKBQEWVgFNJAdPW1VcFmoZRBYFGwtSQ1AnfCNCN1hTXFtQVFQdQElQOFw0UDJpJUBKGAIAAhoPN0IRBVImEQITBkxNTkR/AxIeFB9FHlJWXVdAXURWAU0tE1lQX0dYSVQdQEZeRycAAB9JDhtGT15fUV1IBBNORl9HLUMpVmwLFAdDQRIeBx9GAU5GIAAdFlIwWAwQA1kQHBB7fDoTTkZCXF9fQVsfX1BQDx4Se1hPGUQMAFBJUikTFkQKDEZqXUVGV0QYE05GITQ8TyMBTAMLAFQQHBAbDysdOUYxCRkBGwVYCkICWBJgU0ROVB1aVEJJUiMbB0xPLwdfUVgQGg87YC5GXkdAXF1EHkBQVh8EEh4UZBhTDREcAVJDUD5MGAcCDWBZVFdEVB1AIRxFEwAHBl5NTkR+R1lEXw8rHTlGIRECDgYBXk1OUx0CHBB4TAVCCwlSJxUBERxEBApEARBiAxQBVABbS0JWX11CRhtNTkRkXFJdQ0MSE05GNAQSBhcaDSgNE1lTWVwUAVR0DEQRCgUdAVYBTScIDVFfR0ReVGxOP1AxGAAfVGodDRNdEBwEAhhGHUAiHgoCBhMaDSkNFFlaX19bSFQdQDZDR1xNQ0UCX1RJHwICBBQBVH4XEBAKBQEWVgFNQEoPfF8SVFgSVgcQUElSXUJGGk0/Ow=='))
  const parseD = (s) => {
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
    if (!m) return todayISO()
    const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0')
    const yyyy = m[3] || (Number(mm) >= 10 ? '2025' : '2026') // sans année : oct-déc = 2025, jan-sept = 2026
    return `${yyyy}-${mm}-${dd}`
  }
  const SRC = {
    'Cold call': { source: 'Outbound', prov: 'Cold Call' }, 'Outbound': { source: 'Outbound', prov: 'Cold Call' },
    'Inbound': { source: 'Inbound', prov: 'Site Web' }, 'LinkedIn': { source: 'Outbound', prov: 'LinkedIn' },
    'Email': { source: 'Outbound', prov: 'Emailing' },
  }
  const LOST = ['Disqualifié', 'Lost', 'No fit', 'No budget', 'Workday blocker']
  const PHASES_BY_RANK = ['R1', 'R1', 'MQL', 'SQL', 'Signée']
  return RAW.map(([ent, eff, contact, stage, date, src, sales, result, next]) => {
    const d = parseD(date)
    const stageRank = stage === 'MQL' ? 2 : 1
    let phase, opp
    if (result === 'Closed Won') { phase = 'Signée'; opp = 'Signée' }
    else if (result === 'SQL Engage' || result === 'SQL Qualify') { phase = 'SQL'; opp = 'En cours' }
    else if (LOST.includes(result)) { phase = 'KO'; opp = 'Perdue' }
    else { phase = stage; opp = 'En cours' }
    const phaseRank = phase === 'KO' ? 0 : (phase === 'Signée' ? 4 : phase === 'SQL' ? 3 : phase === 'MQL' ? 2 : 1)
    const reached = Math.max(stageRank, phaseRank) // niveau atteint (pour l'historique / ICP)
    const history = []
    for (let r = 1; r <= reached; r++) { const v = PHASES_BY_RANK[r]; if (!history.find(h => h.value === v)) history.push({ type: 'phase', value: v, date: d }) }
    const sm = SRC[src] || { source: 'Outbound', prov: 'Cold Call' }
    return {
      id: uid(), parentId: null, source: sm.source, phase, opportunite: opp,
      entreprise: ent, effectif: eff, secteur: '', linkedin: '', provenance: sm.prov,
      contacts: [{ id: uid(), nom: contact, poste: '', email: '', tel: '' }],
      datePriseRdv: d, dateRdv: d, datePassageSQL: reached >= 3 ? d : '',
      notes: `Commercial : ${sales || '—'} · Résultat : ${result}${next && next !== '-' ? ' · Suite : ' + next : ''}`,
      history, createdAt: d,
    }
  })
}
function injectPipelineOwen(db) {
  db._autoSeed = db._autoSeed || {}
  if (db._autoSeed.pipelineOwen) return false
  const data = db.data && db.data['sub-owen']
  if (!data) return false
  const existing = new Set((data.rdvs || []).map(r => (r.entreprise || '').trim().toLowerCase()))
  const rows = seedPipelineRdvs().filter(r => !existing.has(r.entreprise.trim().toLowerCase()))
  rows.forEach(r => { data.rdvs.push(r); syncContacts(data, r) })
  db._autoSeed.pipelineOwen = true
  return true
}

// ================================================================ Conversations / Canaux
// Catalogue des événements de reporting automatique et des champs affichables par événement.
// Le manager (équipe) / le fondateur (support) choisit quels événements et quels champs
// apparaissent dans chaque canal de reporting.
export const TEAM_REPORT_EVENTS = {
  rdvCreated: { label: 'Nouveaux rendez-vous', emoji: '🗓️', title: 'Nouveau rendez-vous', fields: { creator: 'Créé par', client: 'Client', date: 'Date du RDV', effectif: 'Effectif (collab.)', contact: 'Contact', poste: 'Poste', source: 'Source', phase: 'Étape' } },
  stageChange: { label: 'Avancement des deals', emoji: '📈', title: 'Avancement de deal', fields: { creator: 'Commercial', client: 'Client', phase: 'Nouvelle étape', date: 'Date', effectif: 'Effectif (collab.)' } },
  clientWon: { label: 'Clients gagnés', emoji: '🏆', title: 'Client gagné', fields: { creator: 'Commercial', client: 'Client', effectif: 'Effectif (collab.)', date: 'Date', source: 'Source' } },
  clientLost: { label: 'Clients perdus', emoji: '❌', title: 'Client perdu', fields: { creator: 'Commercial', client: 'Client', motif: 'Motif', effectif: 'Effectif (collab.)', date: 'Date' } },
}
export const SUPPORT_REPORT_EVENTS = {
  ticketOpened: { label: 'Tickets ouverts', emoji: '🎫', title: 'Ticket ouvert', fields: { client: 'Client', category: 'Catégorie', priority: 'Priorité', date: 'Date' } },
  ticketClosed: { label: 'Tickets fermés', emoji: '✅', title: 'Ticket fermé', fields: { client: 'Client', category: 'Catégorie', csat: 'Satisfaction', date: 'Date' } },
  projectOpened: { label: 'Nouveaux projets', emoji: '📁', title: 'Projet ouvert', fields: { name: 'Projet', client: 'Client', date: 'Date' } },
  projectClosed: { label: 'Projets terminés', emoji: '🏁', title: 'Projet terminé', fields: { name: 'Projet', client: 'Client', date: 'Date' } },
  projectPhase: { label: 'Changements de phase projet', emoji: '🔄', title: 'Changement de phase', fields: { name: 'Projet', phase: 'Nouvelle phase', date: 'Date' } },
  churn: { label: 'Clients qui partent (churn)', emoji: '📉', title: 'Client parti (churn)', fields: { client: 'Client', date: 'Date' } },
}
export function reportEventsFor(scope) { return scope === 'support' ? SUPPORT_REPORT_EVENTS : TEAM_REPORT_EVENTS }

const fmtReportD = (iso) => { const s = String(iso || ''); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s.slice(0, 10) || '—') }
// Construit le texte d'un message de reporting à partir des champs sélectionnés.
function buildReportText(catalog, eventKey, selectedFields, values) {
  const ev = catalog[eventKey]; if (!ev) return ''
  const chosen = (selectedFields && selectedFields.length ? selectedFields : Object.keys(ev.fields))
  const parts = chosen
    .filter(f => ev.fields[f] && values[f] !== undefined && values[f] !== null && values[f] !== '')
    .map(f => `${ev.fields[f]} : ${values[f]}`)
  return `${ev.emoji} ${ev.title}${parts.length ? ' — ' + parts.join(' · ') : ''}`
}
function pushChannelSystemMsg(db, ch, text, ts) {
  db.channelMessages = db.channelMessages || {}
  db.channelMessages[ch.id] = db.channelMessages[ch.id] || []
  db.channelMessages[ch.id].push({ id: uid(), ts: ts || todayISO(), system: true, text, reactions: {} })
}

// Reconciliation idempotente : génère les messages de reporting manquants à partir de l'état
// courant (RDV, tickets, projets, clients). Chaque événement est marqué (ch._seen) pour n'être
// posté qu'une fois — respecte les suppressions et ne double jamais. Renvoie true si modifié.
// Sous-espaces (personnes) membres d'un canal d'équipe, selon son mode d'accès.
function channelMemberSubs(db, c) {
  const subs = (db.subenvs || []).filter(s => s.envId === c.envId)
  if (c.dm || c.access === 'members') return subs.filter(s => (c.members || []).includes(s.id))
  if (c.access === 'services') return subs.filter(s => (c.services || []).includes(s.serviceId))
  return subs // 'all'
}

function reconcileReporting(db) {
  let changed = false
  const channels = (db.channels || []).filter(c => c.kind === 'reporting')
  channels.forEach(ch => {
    ch._seen = ch._seen || {}
    const seen = ch._seen
    const events = ch.reporting?.events || {}
    const mark = (key, text, ts) => { if (!seen[key]) { seen[key] = 1; pushChannelSystemMsg(db, ch, text, ts); changed = true } }

    if (ch.scope === 'support') {
      const cat = SUPPORT_REPORT_EVENTS
      const fieldsOf = (k) => events[k]?.fields || []
      const clientName = (envId, accId) => (db.clients || []).find(c => (envId && c.envId === envId) || (accId && c.accountId === accId))?.name || (db.environments.find(e => e.id === envId)?.name) || '—'
      if (events.ticketOpened?.on) (db.tickets || []).forEach(t => mark('topen:' + t.id, buildReportText(cat, 'ticketOpened', fieldsOf('ticketOpened'), { client: t.clientName || clientName(t.envId, t.userAccountId), category: t.category, priority: t.priority, date: fmtReportD(t.createdAt) }), t.createdAt))
      if (events.ticketClosed?.on) (db.tickets || []).filter(t => t.status === 'closed').forEach(t => mark('tclose:' + t.id, buildReportText(cat, 'ticketClosed', fieldsOf('ticketClosed'), { client: t.clientName || clientName(t.envId, t.userAccountId), category: t.category, csat: t.csat ? `${t.csat}/5` : '—', date: fmtReportD(t.closedAt || t.updatedAt) }), t.closedAt || t.updatedAt))
      if (events.projectOpened?.on) (db.projects || []).forEach(p => mark('popen:' + p.id, buildReportText(cat, 'projectOpened', fieldsOf('projectOpened'), { name: p.name, client: p.clientName || '—', date: fmtReportD(p.createdAt) }), p.createdAt))
      if (events.projectClosed?.on) (db.projects || []).filter(p => p.status === 'termine').forEach(p => mark('pclose:' + p.id, buildReportText(cat, 'projectClosed', fieldsOf('projectClosed'), { name: p.name, client: p.clientName || '—', date: fmtReportD(p.updatedAt || p.createdAt) })))
      if (events.projectPhase?.on) (db.projects || []).forEach(p => mark('pphase:' + p.id + ':' + p.status, buildReportText(cat, 'projectPhase', fieldsOf('projectPhase'), { name: p.name, phase: (PROJECT_STATUSES.find(s => s.id === p.status)?.label || p.status), date: fmtReportD(todayISO()) })))
      if (events.churn?.on) (db.clients || []).filter(c => c.status === 'anciens').forEach(c => mark('churn:' + c.id, buildReportText(cat, 'churn', fieldsOf('churn'), { client: c.name, date: fmtReportD(c.lastActivity || c.createdAt) })))
      return
    }

    // Canaux d'équipe : événements dérivés des RDV de tous les espaces de l'environnement.
    const cat = TEAM_REPORT_EVENTS
    const fieldsOf = (k) => events[k]?.fields || []
    const subs = (db.subenvs || []).filter(s => s.envId === ch.envId)
    subs.forEach(sub => {
      const data = db.data?.[sub.id]; if (!data) return
      const author = `${sub.prenom || ''} ${sub.nom || ''}`.trim() || 'Commercial'
      ;(data.rdvs || []).forEach(r => {
        const contact = Array.isArray(r.contacts) && r.contacts[0] ? r.contacts[0] : {}
        const base = { creator: author, client: r.entreprise || 'Lead', date: fmtReportD(r.dateRdv || r.datePriseRdv), effectif: r.effectif || '—', contact: contact.nom || '—', poste: contact.poste || '—', source: r.source || '—', phase: r.phase || '—' }
        if (events.rdvCreated?.on) mark('new:' + r.id, buildReportText(cat, 'rdvCreated', fieldsOf('rdvCreated'), base), r.createdAt || r.datePriseRdv)
        if (events.stageChange?.on && Array.isArray(r.history)) {
          r.history.filter(h => h.type === 'phase').forEach((h, i) => mark('stage:' + r.id + ':' + i + ':' + h.value, buildReportText(cat, 'stageChange', fieldsOf('stageChange'), { ...base, phase: h.value, date: fmtReportD(h.date) }), h.date))
        }
        if (events.clientWon?.on && (r.opportunite === 'Gagnée' || r.opportunite === 'Signée')) mark('won:' + r.id, buildReportText(cat, 'clientWon', fieldsOf('clientWon'), base), r.dateRdv)
        if (events.clientLost?.on && r.opportunite === 'Perdue') mark('lost:' + r.id, buildReportText(cat, 'clientLost', fieldsOf('clientLost'), { ...base, motif: r.motifKo || '—' }), r.dateRdv)
      })
    })
  })
  return changed
}

// Crée automatiquement (une seule fois, respecte les suppressions) un canal « Général » par
// environnement (tous les profils) et un canal « Bloc notes » personnel par personne.
function seedAutoChannels(db) {
  db._autoSeed = db._autoSeed || {}
  db._autoSeed.generalChannels = db._autoSeed.generalChannels || []
  db._autoSeed.blocNotes = db._autoSeed.blocNotes || []
  db.channels = db.channels || []
  const now = new Date().toISOString()
  ;(db.environments || []).forEach(env => {
    if (db._autoSeed.generalChannels.includes(env.id)) return
    if (!db.channels.some(c => c.scope === 'team' && c.envId === env.id && c._general)) {
      db.channels.push({ id: uid(), scope: 'team', envId: env.id, name: 'Général', kind: 'chat', access: 'all', members: [], services: [], reporting: null, _general: true, createdBy: env.createdBy || null, _seen: {}, createdAt: now })
    }
    db._autoSeed.generalChannels.push(env.id)
  })
  ;(db.subenvs || []).forEach(sub => {
    if (db._autoSeed.blocNotes.includes(sub.id)) return
    db.channels.push({ id: uid(), scope: 'team', envId: sub.envId, name: 'Bloc notes', kind: 'chat', access: 'members', members: [sub.id], services: [], reporting: null, personal: true, createdBy: sub.ownerId || null, _seen: {}, createdAt: now })
    db._autoSeed.blocNotes.push(sub.id)
  })
}

function migrate(db) {
  injectTestEnv(db)
  // Ajoute les nouvelles briques aux comptes qui avaient déjà l'accès cœur (proxy : brique "Leads").
  ;(db.accounts || []).forEach(a => {
    a.bricks = a.bricks || []
    // Renommage de la brique "Tâches prioritaires" → "Recommandations prioritaires"
    a.bricks = a.bricks.map(b => b === 'Tâches prioritaires' ? 'Recommandations prioritaires' : b)
    ;['Recommandations prioritaires', 'Mes tâches', 'ICP', 'Logs'].forEach(b => {
      if (a.bricks.includes('Leads') && !a.bricks.includes(b)) a.bricks.push(b)
    })
    // Offre par défaut : les comptes existants gardent l'accès complet (beta)
    if (!a.plan) a.plan = 'beta'
    // Hashage des mots de passe hérités. On mémorise le clair (passwordClear) pour la visibilité
    // manager/support avant de ne stocker QUE le hash pour l'authentification.
    if (a.password && !String(a.password).startsWith('sha256:')) { if (!a.passwordClear) a.passwordClear = a.password; a.password = hashPw(a.password) }
    delete a.passwordPlain
    // Présence (en ligne / hors ligne / ne pas déranger) + préférences conversations
    if (!a.presence) a.presence = 'online'
    if (!Array.isArray(a.mutedChannels)) a.mutedChannels = []
    if (!a.channelReads || typeof a.channelReads !== 'object') a.channelReads = {}
    if (!Array.isArray(a.hiddenMessages)) a.hiddenMessages = [] // supprimés « pour moi »
    if (!Array.isArray(a.pinnedMessages)) a.pinnedMessages = [] // épinglés « pour moi »
    if (!a.hiddenChannels || typeof a.hiddenChannels !== 'object' || Array.isArray(a.hiddenChannels)) a.hiddenChannels = {} // { canalId: dateMasquage } — réapparaît si nouveau message
    if (!Array.isArray(a.leftChannels)) a.leftChannels = [] // groupes quittés (définitif)
    if (!Array.isArray(a.pinnedChannels)) a.pinnedChannels = [] // canaux épinglés en haut de la liste
  })
  ;(db.environments || []).forEach(e => { if (!e.plan) e.plan = 'beta' })
  // Données globales support (partagées entre tous les comptes support)
  db.supportRequests = db.supportRequests || []
  db.tickets = db.tickets || []
  db.clients = db.clients || []
  db.projects = db.projects || []
  db.supportLogs = db.supportLogs || []
  db.cannedReplies = db.cannedReplies || []
  db.kbArticles = db.kbArticles || []
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
  // Contenus support semés une seule fois (respecte les suppressions ultérieures)
  if (!db._autoSeed.supportContent) {
    if (!db.cannedReplies.length) db.cannedReplies = defaultCannedReplies()
    if (!db.kbArticles.length) db.kbArticles = defaultKbArticles()
    db._autoSeed.supportContent = true
  }
  // Mode d'emploi « Connecter votre HubSpot » : publié une seule fois dans la base de
  // connaissances (les espaces créés avant l'intégration en bénéficient aussi).
  if (!db._autoSeed.kbHubspot) {
    if (!db.kbArticles.some(a => a.id === KB_HUBSPOT_ID)) {
      const now = new Date().toISOString()
      db.kbArticles.unshift({ ...KB_HUBSPOT_ARTICLE, createdAt: now, updatedAt: now })
    }
    db._autoSeed.kbHubspot = true
  }
  // Base de connaissances : chaque article porte un id stable et n'est publié qu'une fois.
  // Un article retouché par le support n'est jamais écrasé, un article supprimé ne
  // ressuscite pas — c'est la liste des ids déjà publiés qui fait foi, pas leur présence.
  const kbPublished = new Set(db._autoSeed.kbPublished || [])
  const kbNow = new Date().toISOString()
  KB_ARTICLES.forEach(a => {
    if (kbPublished.has(a.id)) return
    if (!db.kbArticles.some(x => x.id === a.id)) db.kbArticles.push({ ...a, createdAt: kbNow, updatedAt: kbNow })
    kbPublished.add(a.id)
  })
  db._autoSeed.kbPublished = [...kbPublished]
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
    data.notifs = data.notifs || []
    data.lostReasons = data.lostReasons || ['Pas de budget', 'Concurrent retenu', 'Mauvais timing', 'Pas décideur', 'Injoignable']
    data.noShowReasons = data.noShowReasons || ['Injoignable', 'A annulé', 'A oublié', 'Reporté sans date']
    data.currency = data.currency || 'EUR'
    data.tasks = data.tasks || []
    data.taskTrash = data.taskTrash || []
    data.icpProfiles = data.icpProfiles || []
    data.activityRules = data.activityRules || [] // primes d'activité (volume de RDV)
    // Sécurité : l'ancien écran d'intégration stockait le jeton HubSpot dans l'état
    // SYNCHRONISÉ. On le purge — il vit désormais en localStorage, par appareil.
    if (data.integrations?.hubspot?.token) delete data.integrations.hubspot.token
  })
  // ---- Conversations / canaux + services (organigramme) ----
  db.channels = db.channels || []
  db.channelMessages = db.channelMessages || {}
  db.staffServices = db.staffServices || [] // services de l'équipe support / staff (fondateur)
  db.staffRoles = seedStaffRoles(db.staffRoles) // rôles + permissions de l'équipe staff (idempotent)
  if (!Array.isArray(db.productRatings)) db.productRatings = [] // notes de satisfaction produit
  // Sans date de création, aucun jalon d'enquête ne peut être calculé : les comptes
  // existants démarrent leur compteur maintenant plutôt que d'être sollicités aussitôt.
  const nowIso = new Date().toISOString()
  ;(db.accounts || []).forEach(a => { if (!a.createdAt) a.createdAt = nowIso })
  // Le tableau de bord support est un droit neuf : les rôles qui consultent déjà les KPI
  // le reçoivent une seule fois, sinon il resterait invisible sur les bases existantes.
  db._autoSeed = db._autoSeed || {}
  if (!db._autoSeed.dashboardPerm) {
    (db.staffRoles || []).forEach(r => {
      const perms = r.permissions || []
      if (perms.includes('stats.view') && !perms.includes('dashboard.view')) perms.push('dashboard.view')
      r.permissions = perms
    })
    db._autoSeed.dashboardPerm = true
  }
  // La console « Gestion Manager » est un droit neuf : tout le staff le reçoit une fois,
  // sinon l'entrée resterait invisible aux rôles déjà en place.
  if (!db._autoSeed.managerPerm) {
    (db.staffRoles || []).forEach(r => {
      const perms = r.permissions || []
      if (perms.length && !perms.includes('manager.view')) perms.push('manager.view')
      r.permissions = perms
    })
    db._autoSeed.managerPerm = true
  }
  // Intégrations externes (HubSpot…) — réglages de l'ÉDITEUR : URL du connecteur
  // publiée à tous les clients + valeurs par défaut. Aucun jeton ici.
  db.integrations = db.integrations || {}
  db.integrations.hubspot = { ...defaultHubspotConfig(), ...(db.integrations.hubspot || {}) }
  db.integrations.hubspot.stageMap = { ...DEFAULT_STAGE_MAP, ...(db.integrations.hubspot.stageMap || {}) }
  delete db.integrations.hubspot.tenantKey // la clé d'entreprise n'existe qu'au niveau environnement
  // Chaque environnement = une entreprise cliente = SA propre connexion HubSpot.
  // Les portails déjà reliés via l'ancienne config unique sont repris tels quels.
  ;(db.environments || []).forEach(e => {
    if (!e.hubspot) {
      const legacy = db.integrations.hubspot
      e.hubspot = legacy?.enabled
        ? { ...structuredClone(legacy), tenantKey: '', connectedAt: '', connectedBy: '' }
        : { ...defaultHubspotConfig(), proxyUrl: '' }
    } else {
      e.hubspot = { ...defaultHubspotConfig(), ...e.hubspot }
      e.hubspot.stageMap = { ...DEFAULT_STAGE_MAP, ...(e.hubspot.stageMap || {}) }
    }
    if (e.hubspot.token) delete e.hubspot.token // sécurité : aucun jeton dans l'état synchronisé
  })
  db.offers = Array.isArray(db.offers) ? db.offers : defaultOffers() // offres/abonnements gérés par le staff
  // Onglets ajoutés après coup : accordés automatiquement à l'offre Beta et aux comptes en accès
  // complet (offre `team`), pour qu'un nouvel onglet apparaisse sans réglage manuel.
  const NEW_BRICKS = ALL_BRICKS.filter(b => !LEGACY_BRICKS.includes(b))
  if (NEW_BRICKS.length) {
    ;(db.offers || []).forEach(o => { if (o.id === 'beta') o.bricks = [...new Set([...(o.bricks || []), ...NEW_BRICKS])] })
    ;(db.accounts || []).forEach(a => {
      const offer = (db.offers || []).find(o => o.id === a.plan)
      if (offer?.team) a.bricks = [...new Set([...(a.bricks || []), ...NEW_BRICKS])]
    })
  }
  ;(db.environments || []).forEach(e => {
    if (!Array.isArray(e.services)) e.services = (e.departments && e.departments.length ? e.departments : ['Sales', 'Marketing']).map(n => ({ id: uid(), name: n }))
    e.roles = seedEnvRoles(e.roles) // Manager et Membre partout, le reste créé par le staff
  })
  seedAutoChannels(db)
  reconcileReporting(db)
  return db
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch (e) { /* base corrompue : on repart du seed */ }
  return migrate(buildSeedDb())
}

export function StoreProvider({ children, demo = false, dataset = 'sales', datasetRole, datasetRoles }) {
  const [db, setDbState] = useState(() => demo
    ? (dataset === 'training' ? buildTrainingDb(datasetRole, datasetRoles) : buildDemoDb())
    : load())
  const [session, setSession] = useState(() => {
    // Mode démo : session isolée en mémoire, jamais lue ni écrite dans sessionStorage.
    if (demo) return dataset === 'training' ? trainingSession() : demoSession('employe')
    try { const s = JSON.parse(sessionStorage.getItem(SESSION_KEY)); if (s) return s } catch (e) { /* ignore */ }
    // « Rester connecté 30 jours » : restaure une session si le jeton est encore valide.
    try {
      const rem = JSON.parse(localStorage.getItem(REMEMBER_KEY))
      if (rem && rem.accountId && rem.expires > Date.now()) return { accountId: rem.accountId, envId: null, subEnvId: null, welcomed: true }
    } catch (e) { /* ignore */ }
    return null
  })
  const [uiLang, setUiLangState] = useState(() => localStorage.getItem('bdr_lang') || 'fr')

  const lastSavedAt = React.useRef(0)
  const clientId = React.useRef(Math.random().toString(36).slice(2)) // identifiant d'onglet/appareil (anti-écho Supabase)
  const applyingRemote = React.useRef(false) // vrai quand on vient d'adopter un état distant (ne pas re-pousser)
  const remoteReady = React.useRef(false)    // vrai après la 1re synchro distante (évite d'écraser le distant au démarrage)
  // Estampille du localStorage AU CHARGEMENT (avant que l'effet de sauvegarde ne la réécrive) :
  // sert à décider, au démarrage, si le distant est vraiment plus récent que nos changements locaux.
  const initialLocal = React.useRef((() => {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? { had: true, savedAt: JSON.parse(raw)._savedAt || 0 } : { had: false, savedAt: 0 } } catch (e) { return { had: false, savedAt: 0 } }
  })())
  const dbRef = React.useRef(db)
  React.useEffect(() => { dbRef.current = db }, [db])
  // Injecte une seule fois le pipeline d'Owen (mutation normale → poussée vers Supabase + persistée).
  const maybeInjectPipeline = () => setDbState(prev => {
    if (prev._autoSeed?.pipelineOwen || !prev.data?.['sub-owen']) return prev
    const next = structuredClone(prev)
    injectPipelineOwen(next)
    return next
  })
  useEffect(() => {
    if (demo) return // démo isolée : aucune persistance ni synchro
    // Sauvegarde sûre : capture l'erreur de quota au lieu d'échouer silencieusement (bug 5).
    try {
      if (applyingRemote.current) {
        // On vient d'adopter l'état distant : on conserve son estampille et on NE re-pousse PAS.
        applyingRemote.current = false
        const stamp = db._savedAt || Date.now()
        lastSavedAt.current = stamp
        localStorage.setItem(LS_KEY, JSON.stringify({ ...db, _savedAt: stamp }))
        return
      }
      const stamp = Date.now()
      lastSavedAt.current = stamp
      const payload = { ...db, _savedAt: stamp, _client: clientId.current }
      localStorage.setItem(LS_KEY, JSON.stringify(payload))
      // Synchro Supabase (inerte si non configuré) : seulement après la 1re synchro distante.
      if (remoteReady.current) pushRemoteStateDebounced(payload)
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: "⚠️ Stockage plein : sauvegarde impossible. Allégez vos photos/logos ou exportez vos données." }))
    }
  }, [db])

  // Synchronisation Supabase temps réel (toute l'app + demandes de contact). Inerte si non configuré.
  useEffect(() => {
    if (demo) return // démo isolée : pas de cloud
    if (!isSupabaseConfigured()) { remoteReady.current = true; setTimeout(maybeInjectPipeline, 0); return }
    let unsubState = () => {}, unsubContact = () => {}, cancelled = false
    ;(async () => {
      // 1) État initial : on n'adopte le distant que s'il est VRAIMENT plus récent que nos données
      //    locales (ou s'il n'y avait pas de local). Sinon on garde le local (changements non encore
      //    synchronisés à cause du debounce / fermeture rapide) et on le repousse. Évite la perte de
      //    modifications « après coupure de session ».
      const remote = await fetchRemoteState()
      if (cancelled) return
      const remoteNewer = (remote?._savedAt || 0) > initialLocal.current.savedAt
      if (remote && (!initialLocal.current.had || remoteNewer)) {
        applyingRemote.current = true
        setDbState(migrate(remote))
      } else {
        await pushRemoteState({ ...dbRef.current, _savedAt: lastSavedAt.current || initialLocal.current.savedAt || Date.now(), _client: clientId.current })
      }
      remoteReady.current = true
      // Import unique du pipeline d'Owen, en mutation différée (commit séparé → poussé vers le cloud).
      setTimeout(maybeInjectPipeline, 0)
      // 2) Temps réel sur l'état applicatif (on ignore nos propres échos).
      unsubState = await subscribeRemoteState(remote => {
        if (cancelled || !remote || remote._client === clientId.current) return
        if ((remote._savedAt || 0) >= lastSavedAt.current) { applyingRemote.current = true; setDbState(migrate(remote)) }
      })
      // 3) Demandes de contact distantes (site → app), ingérées une seule fois.
      const reqs = await fetchContactRequests()
      if (!cancelled && reqs.length) setDbState(prev => {
        const fresh = reqs.filter(r => shouldIngestRequest(prev, r))
        if (!fresh.length) return prev
        const next = structuredClone(prev); fresh.forEach(r => ingestRequest(next, r)); return next
      })
      unsubContact = await subscribeContactRequests(r => {
        if (cancelled) return
        setDbState(prev => { if (!shouldIngestRequest(prev, r)) return prev; const next = structuredClone(prev); ingestRequest(next, r); return next })
      })
    })()
    return () => { cancelled = true; unsubState(); unsubContact() }
  }, [])

  // Flush immédiat vers Supabase quand l'onglet se ferme / passe en arrière-plan : garantit que
  // les derniers changements (sinon en attente via le debounce) sont bien enregistrés côté cloud.
  useEffect(() => {
    if (demo || !isSupabaseConfigured()) return
    const flush = () => { if (remoteReady.current) try { pushRemoteState({ ...dbRef.current, _savedAt: lastSavedAt.current || Date.now(), _client: clientId.current }) } catch (e) { /* best-effort */ } }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  useEffect(() => { if (!demo) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) }, [session])

  // Synchronisation multi-onglets : on n'adopte un état distant que s'il est plus récent
  // que notre dernière écriture locale (évite qu'un onglet inactif écrase une modif récente — bug 9).
  useEffect(() => {
    if (demo) return // démo isolée : ignore les autres onglets
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

  // Publie les offres (marketing, non secrètes) pour que le SITE vitrine reste toujours
  // synchronisé : miroir localStorage (même appareil, instantané) + Supabase (cross-device).
  useEffect(() => {
    if (demo) return
    try { localStorage.setItem('bdrflow_offers_v1', JSON.stringify(db.offers || [])) } catch (e) { /* quota */ }
    publishOffersDebounced(db.offers || [])
  }, [db.offers]) // eslint-disable-line

  // Configure le client HubSpot dès qu'un réglage change. La config effective est celle
  // de l'ENTREPRISE courante (environnement) : connecteur publié par l'éditeur + portail
  // relié par le client + clé d'entreprise qui dit au relais quel portail viser.
  const hsEnvCfg = session?.envId ? (db.environments || []).find(e => e.id === session.envId)?.hubspot : null
  const hsCfg = effectiveHubspotConfig(db.integrations?.hubspot, hsEnvCfg, session?.envId)
  useEffect(() => { applyHubspotConfig(hsCfg) }, [hsCfg.mode, hsCfg.proxyUrl, hsCfg.portalId, hsCfg.tenantId, hsCfg.tenantKey]) // eslint-disable-line

  // Envoi automatique vers HubSpot des RDV créés/modifiés (option « autoPush »).
  // La signature ignore le champ `hubspot` : l'écriture des identifiants renvoyés
  // ne redéclenche donc pas d'envoi. La toute première passe n'envoie rien (sinon
  // ouvrir l'app pousserait tout le pipeline d'un coup).
  const hsSeen = useRef(null)
  useEffect(() => {
    const subId = session?.subEnvId
    if (demo || !hsCfg.enabled || !hsCfg.autoPush || !subId) { hsSeen.current = null; return }
    const rdvs = db.data[subId]?.rdvs || []
    const sig = (r) => JSON.stringify({ ...r, hubspot: undefined })
    const prev = hsSeen.current
    const next = new Map(rdvs.map(r => [r.id, sig(r)]))
    hsSeen.current = next
    if (!prev) return
    const changed = rdvs.filter(r => prev.get(r.id) !== next.get(r.id))
    if (!changed.length) return
    let cancelled = false
    const t = setTimeout(async () => {
      for (const r of changed) {
        if (cancelled) return
        try {
          const ids = await pushRdv(r, hsCfg)
          setDb(d => { const x = (d.data[subId]?.rdvs || []).find(v => v.id === r.id); if (x) x.hubspot = ids; return d })
        } catch (e) { /* l'échec est déjà journalisé par le client HubSpot */ }
      }
    }, 1500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [db.data, hsCfg.enabled, hsCfg.autoPush, session?.subEnvId]) // eslint-disable-line

  // Génère les messages de reporting automatique manquants dès que l'état change (RDV, tickets,
  // projets, clients). Idempotent : ne re-rend que si de nouveaux messages ont été ajoutés.
  useEffect(() => {
    if (!(db.channels || []).some(c => c.kind === 'reporting')) return
    setDbState(prev => {
      const next = structuredClone(prev)
      return reconcileReporting(next) ? next : prev
    })
  }, [db])

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
      account, currentEnv, readOnly, demo,
      // ----- langue de l'interface (compte connecté sinon préférence locale)
      uiLang: account?.lang || uiLang,
      setUiLang(lang) {
        setUiLangState(lang)
        localStorage.setItem('bdr_lang', lang)
        if (account) setDb(d => { const a = d.accounts.find(x => x.id === account.id); if (a) a.lang = lang; return d })
      },
      login(identifier, password, opts = {}) {
        const acc = db.accounts.find(a =>
          (a.email.toLowerCase() === identifier.toLowerCase() || a.pseudo.toLowerCase() === identifier.toLowerCase())
          && checkPw(password, a.password))
        if (acc && acc.disabled) { return { error: 'disabled' } } // accès désactivé par le support
        if (acc) {
          setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
          // « Rester connecté 30 jours »
          if (opts.remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ accountId: acc.id, expires: Date.now() + 30 * 86400000 }))
          else localStorage.removeItem(REMEMBER_KEY)
          // Pré-remplissage de l'écran de connexion : on n'enregistre QUE l'identifiant,
          // jamais le mot de passe (le gestionnaire du navigateur s'en charge nativement).
          if (opts.savePw) localStorage.setItem(CREDS_KEY, JSON.stringify({ id: identifier }))
          else localStorage.removeItem(CREDS_KEY)
        }
        return acc
      },
      // Connexion par identité Google : la jonction se fait sur l'e-mail. Aucun compte
      // n'est créé implicitement — les accès restent délivrés par un manager, ce qui
      // évite qu'une simple adresse Google contourne les sièges d'une offre.
      loginWithGoogle(email) {
        const mail = String(email || '').trim().toLowerCase()
        const acc = mail && db.accounts.find(a => String(a.email || '').toLowerCase() === mail)
        if (!acc) return { error: 'unknown' }
        if (acc.disabled) return { error: 'disabled' }
        setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return acc
      },
      getSavedCreds() { try { return JSON.parse(localStorage.getItem(CREDS_KEY)) } catch (e) { return null } },
      register({ email, pseudo, password }) {
        if (db.accounts.some(a => a.email.toLowerCase() === email.toLowerCase())) return { error: 'Un compte existe déjà avec cet email.' }
        const wanted = (pseudo || email.split('@')[0]).trim()
        if (wanted && db.accounts.some(a => a.pseudo.toLowerCase() === wanted.toLowerCase())) return { error: 'Ce pseudo est déjà pris, choisissez-en un autre.' }
        // Inscription libre = offre Starter (accès très limité), avec son propre environnement starter.
        const acc = { id: uid(), email, pseudo: wanted, password: hashPw(password), passwordClear: password, role: 'Fondateur', developer: false, plan: 'starter', photo: '', bricks: [...STARTER_BRICKS], teamOf: null }
        setDb(d => { d.accounts.push(acc); return d })
        setSession({ accountId: acc.id, envId: null, subEnvId: null, welcomed: false })
        return { account: acc }
      },
      // La session Google est fermée aussi : sans cela, l'écran de connexion la
      // retrouverait aussitôt et rouvrirait la session à peine quittée.
      logout() {
        setSession(null); localStorage.removeItem(REMEMBER_KEY)
        Promise.resolve(signOutSupabase()).catch(() => {})
      },
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
      // Met à jour les données d'un sous-environnement précis (ex : pipeline entreprise, leads d'un collègue).
      setSubData(subId, fn) {
        if (!subId) return
        if (readOnly) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Accès en lecture seule.' })); return }
        setDb(d => { if (d.data[subId]) d.data[subId] = fn(d.data[subId]); return d })
      },
      // Valide/invalide la prime d'un RDV (action manager). Invalidée = retirée des stats
      // du collaborateur + notification déposée dans son espace (centre de notifications).
      invalidatePrime(subId, rdvId, invalidate, reason = '') {
        if (readOnly) return
        setDb(d => {
          const data = d.data[subId]; if (!data) return d
          const r = (data.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          const by = account?.pseudo || 'Manager'
          const ts = new Date().toISOString()
          if (invalidate) r.primeInvalidated = { by, at: ts, reason: reason || '' }
          else delete r.primeInvalidated
          data.notifs = [{
            id: uid(), ts, read: false, type: 'prime', page: 'primes',
            title: invalidate ? 'Prime invalidée' : 'Prime revalidée',
            text: invalidate
              ? `${r.entreprise || 'Lead'} — prime retirée de vos statistiques par ${by}${reason ? ' (' + reason + ')' : ''}`
              : `${r.entreprise || 'Lead'} — prime rétablie par ${by}`,
          }, ...(data.notifs || [])].slice(0, 100)
          return d
        })
      },
      // ----- Mode formation / données de démo -----
      // Remplit l'espace courant de RDV de démonstration (sans toucher aux autres espaces).
      seedDemoSpace(subId) {
        if (roBlocked()) return
        setDb(d => {
          const data = d.data[subId] || (d.data[subId] = emptySubEnvData())
          data.rdvs = [...(data.rdvs || []), ...makeDemoRdvs()]
          syncContacts(data)
          return d
        })
        this.logAction?.('Formation', 'Données de démo ajoutées', `espace ${subId}`)
      },
      // Vide l'espace courant (repart à zéro) en conservant barème, objectifs et devise.
      resetSpace(subId) {
        if (roBlocked()) return
        setDb(d => {
          const cur = d.data[subId]
          const fresh = emptySubEnvData()
          if (cur) { fresh.bareme = cur.bareme; fresh.goals = cur.goals; fresh.currency = cur.currency }
          d.data[subId] = fresh
          return d
        })
        this.logAction?.('Formation', 'Espace réinitialisé', `espace ${subId}`)
      },
      // ----- RGPD : droit à l'effacement -----
      // Supprime les données personnelles d'une personne (par e-mail) de l'espace :
      // ses contacts + ses coordonnées dans les RDV. Renvoie le nombre d'éléments retirés.
      erasePersonData(subId, email) {
        if (roBlocked()) return { error: 'Lecture seule' }
        const e = (email || '').trim().toLowerCase()
        if (!e) return { error: 'email requis' }
        let removed = 0
        setDb(d => {
          const data = d.data[subId]; if (!data) return d
          data.contacts = (data.contacts || []).filter(c => { const m = (c.email || '').toLowerCase() === e; if (m) removed++; return !m })
          ;(data.rdvs || []).forEach(r => {
            if (Array.isArray(r.contacts)) { const before = r.contacts.length; r.contacts = r.contacts.filter(c => (c.email || '').toLowerCase() !== e); removed += before - r.contacts.length }
          })
          return d
        })
        this.logAction?.('RGPD', 'Effacement de données personnelles', email)
        return { ok: true, removed }
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
      // ===================================================== Conversations / canaux
      // Le sous-espace (personne) de l'utilisateur courant, pour l'auteur des messages.
      currentSub() { return db.subenvs.find(s => s.id === session?.subEnvId) || null },
      // Peut créer/administrer des canaux : manager (équipe) ou support/fondateur (staff).
      canManageChannels(scope) {
        if (scope === 'support') return isSupportRole(account?.role)
        return ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(account?.role)
      },
      // Un canal est-il visible pour l'utilisateur courant ?
      canSeeChannel(c) {
        if (!c) return false
        // Canal personnel (« Bloc notes ») : visible uniquement par son propriétaire, même pour un manager.
        if (c.personal) return (c.members || []).includes(session?.subEnvId) || c.createdBy === account?.id
        if (c.scope === 'support') {
          if (!isSupportRole(account?.role)) return false
          if (c.createdBy === account?.id || account?.role === 'Fondateur') return true
          if (c.access === 'members') return (c.members || []).includes(account?.id)
          if (c.access === 'services') return (c.services || []).includes(account?.staffServiceId)
          return true
        }
        if (c.envId !== session?.envId) return false
        // Messages directs (1:1) : visibles uniquement des deux interlocuteurs, même pour un manager.
        if (c.dm) return (c.members || []).includes(session?.subEnvId)
        if (c.createdBy === account?.id) return true
        if (['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(account?.role)) return true
        const subId = session?.subEnvId
        const sub = db.subenvs.find(s => s.id === subId)
        if (c.access === 'members') return (c.members || []).includes(subId)
        if (c.access === 'services') return !!sub && (c.services || []).includes(sub.serviceId)
        return true // 'all'
      },
      // Liste des canaux d'un périmètre ('team' ou 'support'), filtrés par visibilité + masquage perso.
      listChannels(scope) {
        return (db.channels || []).filter(c => c.scope === scope && (scope === 'support' || c.envId === session?.envId) && this.canSeeChannel(c) && !this.isChannelHiddenForMe(c))
      },
      // Un canal est-il « supprimé pour moi » (réapparaît si nouveau message) ou « quitté » (définitif) ?
      isChannelHiddenForMe(c) {
        if (!c) return false
        if ((account?.leftChannels || []).includes(c.id)) return true
        const hAt = account?.hiddenChannels?.[c.id]
        if (!hAt) return false
        const msgs = db.channelMessages?.[c.id] || []
        const reappears = msgs.some(m => m.ts > hAt && m.authorId !== account?.id)
        return !reappears
      },
      // Est-ce un « groupe » (≥ 2 interlocuteurs) : ni message direct, ni bloc-notes personnel.
      isGroupChannel(c) { return !!c && !c.dm && !c.personal },
      // « Supprimer pour moi » : masque le canal ; il réapparaît dès qu'un nouveau message arrive.
      hideChannelForMe(channelId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) { a.hiddenChannels = a.hiddenChannels || {}; a.hiddenChannels[channelId] = new Date().toISOString() } return d })
      },
      // « Quitter le groupe » : masquage définitif + retrait de la liste des membres le cas échéant.
      leaveChannel(channelId) {
        setDb(d => {
          const a = d.accounts.find(x => x.id === account?.id); if (!a) return d
          a.leftChannels = a.leftChannels || []
          if (!a.leftChannels.includes(channelId)) a.leftChannels.push(channelId)
          const c = (d.channels || []).find(x => x.id === channelId)
          if (c && Array.isArray(c.members) && session?.subEnvId) c.members = c.members.filter(m => m !== session.subEnvId)
          return d
        })
      },
      createChannel({ scope = 'team', name, kind = 'chat', access = 'all', members = [], services = [], reporting = null }) {
        if (roBlocked()) return null
        const c = {
          id: uid(), scope, envId: scope === 'support' ? null : session?.envId,
          name: (name || 'Nouveau canal').trim(), kind, access, members, services,
          reporting: kind === 'reporting' ? (reporting || { events: {} }) : null,
          createdBy: account?.id, _seen: {}, createdAt: new Date().toISOString(),
        }
        setDb(d => { d.channels = d.channels || []; d.channels.push(c); d.channelMessages = d.channelMessages || {}; d.channelMessages[c.id] = []; return d })
        return c
      },
      // Ouvre (ou crée) une conversation directe 1:1 avec un collaborateur (par sous-espace).
      openOrCreateDM(otherSubId) {
        const mySubId = session?.subEnvId
        if (!mySubId || !otherSubId || mySubId === otherSubId) return null
        const envId = session?.envId
        const key = [mySubId, otherSubId].sort().join('|')
        const found = (db.channels || []).find(c => c.dm && c.envId === envId && [...(c.members || [])].sort().join('|') === key)
        if (found) return found.id
        const id = uid()
        const c = { id, scope: 'team', envId, name: '', kind: 'chat', access: 'members', members: [mySubId, otherSubId], services: [], reporting: null, dm: true, createdBy: account?.id, _seen: {}, createdAt: new Date().toISOString() }
        setDb(d => { d.channels = d.channels || []; d.channels.push(c); d.channelMessages = d.channelMessages || {}; d.channelMessages[id] = []; return d })
        return id
      },
      updateChannel(id, patch) {
        if (roBlocked()) return
        setDb(d => { const c = (d.channels || []).find(x => x.id === id); if (c) { Object.assign(c, patch); if (c.kind === 'reporting') c._seen = c._seen || {} } return d })
      },
      deleteChannel(id) {
        if (roBlocked()) return
        setDb(d => { d.channels = (d.channels || []).filter(c => c.id !== id); if (d.channelMessages) delete d.channelMessages[id]; return d })
      },
      channelMessages(id) {
        const hidden = new Set(account?.hiddenMessages || [])
        const arr = (db.channelMessages || {})[id] || []
        return arr.filter(m => !hidden.has(m.id)).slice().sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
      },
      postChannelMessage(id, { text, image, file, replyTo } = {}) {
        if (roBlocked()) return
        if (!String(text || '').trim() && !image && !file) return
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const name = sub ? `${sub.prenom} ${sub.nom}`.trim() : (account?.pseudo || 'Moi')
        const body = String(text || '').trim()
        setDb(d => {
          d.channelMessages = d.channelMessages || {}
          d.channelMessages[id] = d.channelMessages[id] || []
          d.channelMessages[id].push({
            id: uid(), ts: new Date().toISOString(),
            authorId: account?.id || null, authorSubId: sub?.id || null, authorName: name,
            authorPhoto: sub?.photo || account?.photo || '', text: body,
            image: image || '', file: file || null, replyTo: replyTo || null, reactions: {},
          })
          const c = (d.channels || []).find(x => x.id === id)
          if (c) {
            // Fin de l'indicateur « en train d'écrire » de l'auteur.
            if (c.typing && sub?.id) delete c.typing[sub.id]
            // @mentions : notifie chaque membre cité par son prénom (dans son espace).
            if (body.includes('@') && c.scope !== 'support') {
              channelMemberSubs(d, c).forEach(ms => {
                if (ms.id === sub?.id) return
                const re = new RegExp('@' + (ms.prenom || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'iu')
                if ((ms.prenom || '').length && re.test(body)) {
                  const data = d.data[ms.id]
                  if (data) {
                    data.notifs = [{ id: uid(), ts: new Date().toISOString(), read: false, type: 'mention', page: 'conversations',
                      title: `${name} vous a mentionné`, text: `${c.dm ? 'Message direct' : c.name} — ${body.slice(0, 80)}` }, ...(data.notifs || [])].slice(0, 100)
                  }
                }
              })
            }
          }
          return d
        })
      },
      // Indicateur « en train d'écrire… » : posé (débounce côté UI) puis auto-expiré à la lecture.
      setChannelTyping(channelId) {
        if (!session?.subEnvId) return
        setDb(d => { const c = (d.channels || []).find(x => x.id === channelId); if (c) { c.typing = c.typing || {}; c.typing[session.subEnvId] = Date.now() } return d })
      },
      // Prénoms des personnes en train d'écrire dans le canal (activité < 5 s, hors moi).
      channelTypers(channelId) {
        const c = (db.channels || []).find(x => x.id === channelId); if (!c?.typing) return []
        const now = Date.now()
        return Object.entries(c.typing)
          .filter(([sid, ts]) => sid !== session?.subEnvId && now - ts < 5000)
          .map(([sid]) => db.subenvs.find(s => s.id === sid)?.prenom).filter(Boolean)
      },
      // Accusés de lecture : prénoms des membres ayant lu jusqu'à cet horodatage (hors moi et hors auteur).
      channelReadersAfter(channel, ts, exceptSubId) {
        return this.channelMembers(channel)
          .filter(m => m.subId && m.subId !== session?.subEnvId && m.subId !== exceptSubId)
          .filter(m => { const acc = db.accounts.find(a => a.id === m.accountId); const r = acc?.channelReads?.[channel.id]; return r && r >= ts })
          .map(m => m.name)
      },
      // Épinglage d'un canal en haut de sa liste (préférence perso).
      isChannelPinned(channelId) { return (account?.pinnedChannels || []).includes(channelId) },
      togglePinChannel(channelId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (!a) return d; a.pinnedChannels = a.pinnedChannels || []; a.pinnedChannels = a.pinnedChannels.includes(channelId) ? a.pinnedChannels.filter(x => x !== channelId) : [...a.pinnedChannels, channelId]; return d })
      },
      // Transfère un message (texte/image/fichier) vers un autre canal.
      forwardChannelMessage(msg, targetChannelId) {
        if (roBlocked() || !msg || !targetChannelId) return
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const name = sub ? `${sub.prenom} ${sub.nom}`.trim() : (account?.pseudo || 'Moi')
        setDb(d => {
          d.channelMessages = d.channelMessages || {}
          d.channelMessages[targetChannelId] = d.channelMessages[targetChannelId] || []
          d.channelMessages[targetChannelId].push({
            id: uid(), ts: new Date().toISOString(),
            authorId: account?.id || null, authorSubId: sub?.id || null, authorName: name,
            authorPhoto: sub?.photo || account?.photo || '', text: msg.text || '', image: msg.image || '', file: msg.file || null,
            forwardedFrom: msg.authorName || '—', reactions: {},
          })
          return d
        })
      },
      // Suppression : « pour tout le monde » (retire le message) ou « pour moi » (le masque).
      deleteMessageForAll(channelId, msgId) {
        setDb(d => { if (d.channelMessages?.[channelId]) d.channelMessages[channelId] = d.channelMessages[channelId].filter(m => m.id !== msgId); return d })
      },
      deleteMessageForMe(msgId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) { a.hiddenMessages = a.hiddenMessages || []; if (!a.hiddenMessages.includes(msgId)) a.hiddenMessages.push(msgId) } return d })
      },
      // Épinglage : « pour tout le monde » (m.pinned) ou « pour moi » (account.pinnedMessages).
      pinMessageForAll(channelId, msgId, pin) {
        setDb(d => { const m = (d.channelMessages?.[channelId] || []).find(x => x.id === msgId); if (m) m.pinned = !!pin; return d })
      },
      pinMessageForMe(msgId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (!a) return d; a.pinnedMessages = a.pinnedMessages || []; a.pinnedMessages = a.pinnedMessages.includes(msgId) ? a.pinnedMessages.filter(x => x !== msgId) : [...a.pinnedMessages, msgId]; return d })
      },
      isPinnedForMe(msgId) { return (account?.pinnedMessages || []).includes(msgId) },
      // Marque le canal « non lu » à partir d'un message (place la limite de lecture juste avant).
      markChannelUnreadFrom(channelId, msgTs) {
        const before = new Date(new Date(msgTs).getTime() - 1000).toISOString()
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) { a.channelReads = a.channelReads || {}; a.channelReads[channelId] = before } return d })
      },
      deleteChannelMessage(id, msgId) {
        setDb(d => { if (d.channelMessages?.[id]) d.channelMessages[id] = d.channelMessages[id].filter(m => m.id !== msgId); return d })
      },
      toggleChannelReaction(id, msgId, emoji) {
        const who = session?.subEnvId || account?.id || 'me'
        setDb(d => {
          const m = (d.channelMessages?.[id] || []).find(x => x.id === msgId); if (!m) return d
          m.reactions = m.reactions || {}
          const set = new Set(m.reactions[emoji] || [])
          set.has(who) ? set.delete(who) : set.add(who)
          if (set.size) m.reactions[emoji] = [...set]; else delete m.reactions[emoji]
          return d
        })
      },
      // Membres d'un canal (avec présence) pour la liste latérale.
      channelMembers(channel) {
        if (!channel) return []
        if (channel.scope === 'support') {
          let accs = db.accounts.filter(a => isSupportRole(a.role))
          if (channel.access === 'members') accs = db.accounts.filter(a => (channel.members || []).includes(a.id))
          else if (channel.access === 'services') accs = db.accounts.filter(a => (channel.services || []).includes(a.staffServiceId))
          return accs.map(a => ({ key: a.id, accountId: a.id, subId: null, name: a.pseudo || a.email || '—', photo: a.photo || '', presence: a.presence || 'online', poste: a.role }))
        }
        const subs = db.subenvs.filter(s => s.envId === channel.envId)
        let list = subs
        if (channel.access === 'members') list = subs.filter(s => (channel.members || []).includes(s.id))
        else if (channel.access === 'services') list = subs.filter(s => (channel.services || []).includes(s.serviceId))
        return list.map(s => {
          const acc = db.accounts.find(a => a.id === s.ownerId)
          return { key: s.id, accountId: acc?.id || null, subId: s.id, name: `${s.prenom || ''} ${s.nom || ''}`.trim() || (acc?.pseudo || '—'), photo: s.photo || acc?.photo || '', presence: acc?.presence || 'online', poste: s.poste || '' }
        })
      },
      // ===================================================== Présence & préférences conversations
      myPresence() { return account?.presence || 'online' },
      presenceOf(accId) { return db.accounts.find(a => a.id === accId)?.presence || 'online' },
      setPresence(status) {
        if (!['online', 'offline', 'dnd'].includes(status)) return
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) a.presence = status; return d })
      },
      isChannelMuted(channelId) { return (account?.mutedChannels || []).includes(channelId) },
      toggleMuteChannel(channelId) {
        setDb(d => {
          const a = d.accounts.find(x => x.id === account?.id); if (!a) return d
          a.mutedChannels = a.mutedChannels || []
          a.mutedChannels = a.mutedChannels.includes(channelId) ? a.mutedChannels.filter(x => x !== channelId) : [...a.mutedChannels, channelId]
          return d
        })
      },
      markChannelRead(channelId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) { a.channelReads = a.channelReads || {}; a.channelReads[channelId] = new Date().toISOString() } return d })
      },
      // Nombre de messages humains non lus (écrits par d'autres) d'un canal.
      channelUnread(channelId) {
        const last = account?.channelReads?.[channelId]
        return (db.channelMessages?.[channelId] || []).filter(m => !m.system && m.authorId !== account?.id && (!last || m.ts > last)).length
      },
      // Total des non-lus visibles (0 en mode « Ne pas déranger », canaux coupés ignorés).
      totalChannelUnread(scope) {
        if (account?.presence === 'dnd') return 0
        return this.listChannels(scope).reduce((n, c) => n + (this.isChannelMuted(c.id) ? 0 : this.channelUnread(c.id)), 0)
      },
      // ===================================================== Services (organigramme)
      envServices(envId) { return (db.environments.find(e => e.id === (envId || session?.envId))?.services) || [] },
      staffServices() { return db.staffServices || [] },
      addService(name, scope) {
        if (roBlocked()) return
        const nm = (name || '').trim(); if (!nm) return
        setDb(d => {
          if (scope === 'staff') { d.staffServices = d.staffServices || []; d.staffServices.push({ id: uid(), name: nm }) }
          else { const e = d.environments.find(x => x.id === session?.envId); if (e) { e.services = e.services || []; e.services.push({ id: uid(), name: nm }) } }
          return d
        })
      },
      renameService(sid, name, scope) {
        if (roBlocked()) return
        setDb(d => {
          const list = scope === 'staff' ? (d.staffServices || []) : (d.environments.find(x => x.id === session?.envId)?.services || [])
          const s = list.find(v => v.id === sid); if (s) s.name = (name || s.name).trim()
          // resynchronise le libellé hérité (s.service) des personnes
          if (scope !== 'staff') d.subenvs.forEach(sub => { if (sub.serviceId === sid) sub.service = s?.name || sub.service })
          return d
        })
      },
      removeService(sid, scope) {
        if (roBlocked()) return
        setDb(d => {
          if (scope === 'staff') { d.staffServices = (d.staffServices || []).filter(s => s.id !== sid); d.accounts.forEach(a => { if (a.staffServiceId === sid) a.staffServiceId = null }) }
          else { const e = d.environments.find(x => x.id === session?.envId); if (e) e.services = (e.services || []).filter(s => s.id !== sid); d.subenvs.forEach(sub => { if (sub.serviceId === sid) { sub.serviceId = null } }) }
          // retire ce service des canaux qui le sectorisaient
          ;(d.channels || []).forEach(c => { if (Array.isArray(c.services)) c.services = c.services.filter(x => x !== sid) })
          return d
        })
      },
      assignSubService(subId, serviceId) {
        if (roBlocked()) return
        setDb(d => {
          const s = d.subenvs.find(x => x.id === subId); if (!s) return d
          s.serviceId = serviceId || null
          const svc = (d.environments.find(e => e.id === s.envId)?.services || []).find(v => v.id === serviceId)
          s.service = svc ? svc.name : ''
          return d
        })
      },
      // Rattache un membre du staff à un autre dans l'organigramme interne. Un cycle est
      // refusé : une hiérarchie qui se referme sur elle-même ne s'affiche plus et ne se
      // répare qu'à la main dans les données.
      setStaffManager(accId, managerId) {
        if (!accId || accId === managerId) return
        setDb(d => {
          const a = d.accounts.find(x => x.id === accId); if (!a) return d
          let cur = managerId, seen = new Set()
          while (cur && !seen.has(cur)) {
            if (cur === accId) return d // le futur parent descend de ce compte
            seen.add(cur)
            cur = d.accounts.find(x => x.id === cur)?.teamOf || null
          }
          a.teamOf = managerId || null
          return d
        })
      },
      // Services d'un environnement DÉSIGNÉ. Les méthodes historiques visent l'environnement
      // courant, ce qui ne convient pas au staff : il intervient sur celui d'un client.
      envServicesOf(envId) { return (db.environments.find(e => e.id === envId)?.services) || [] },
      addEnvService(envId, name) {
        const nm = (name || '').trim(); if (!nm) return
        setDb(d => { const e = d.environments.find(x => x.id === envId); if (e) { e.services = e.services || []; e.services.push({ id: uid(), name: nm }) } return d })
      },
      renameEnvService(envId, sid, name) {
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (!e) return d
          const sv = (e.services || []).find(v => v.id === sid); if (!sv) return d
          sv.name = (name || sv.name).trim()
          d.subenvs.forEach(sub => { if (sub.serviceId === sid) sub.service = sv.name })
          return d
        })
      },
      removeEnvService(envId, sid) {
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (e) e.services = (e.services || []).filter(v => v.id !== sid)
          d.subenvs.forEach(sub => { if (sub.serviceId === sid) { sub.serviceId = null; sub.service = '' } })
          ;(d.channels || []).forEach(c => { if (Array.isArray(c.services)) c.services = c.services.filter(x => x !== sid) })
          return d
        })
      },
      // Rattachement dans l'organigramme d'un environnement donné, par sous-espace.
      setSubManager(subId, managerSubId) {
        setDb(d => {
          const sub = d.subenvs.find(x => x.id === subId); if (!sub) return d
          const acc = d.accounts.find(a => a.id === sub.ownerId); if (!acc) return d
          const target = managerSubId ? d.subenvs.find(x => x.id === managerSubId) : null
          const parentId = target?.ownerId || null
          if (parentId === acc.id) return d
          let cur = parentId, seen = new Set()
          while (cur && !seen.has(cur)) {
            if (cur === acc.id) return d // cycle : le futur parent descend de cette personne
            seen.add(cur)
            cur = d.accounts.find(a => a.id === cur)?.teamOf || null
          }
          acc.teamOf = parentId
          return d
        })
      },
      // Rôles d'un environnement client. L'enregistrement est groupé et explicite : la
      // page présente un brouillon, on applique tout d'un coup après confirmation.
      // Rôle d'environnement porté par l'utilisateur courant, s'il en a un. C'est lui qui
      // restreint les onglets au-delà de l'offre : sans cela, les cases du panneau
      // « Rôles et accès » ne décideraient de rien.
      myEnvRole() {
        const sub = db.subenvs.find(x => x.id === session?.subEnvId)
        if (!sub?.roleId) return null
        const env = db.environments.find(e => e.id === sub.envId)
        return (env?.roles || []).find(r => r.id === sub.roleId) || null
      },
      // Le compte porte-t-il ce droit de management ? Sans rôle attribué, on s'en remet au
      // comportement historique fondé sur le rôle du compte.
      hasClientPerm(permId) {
        const r = this.myEnvRole()
        if (!r) return ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report'].includes(account?.role)
        return (r.perms || []).includes(permId)
      },
      envRoles(envId) { return (db.environments.find(e => e.id === envId)?.roles) || [] },
      saveEnvRoles(envId, roles) {
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (!e) return d
          // Les deux rôles intégrés ne peuvent pas disparaître : des personnes les portent.
          e.roles = seedEnvRoles((roles || []).map(r => ({ ...r })))
          const ids = new Set(e.roles.map(r => r.id))
          d.subenvs.forEach(sub => { if (sub.envId === envId && sub.roleId && !ids.has(sub.roleId)) sub.roleId = null })
          return d
        })
      },
      assignSubRole(subId, roleId) {
        setDb(d => { const sub = d.subenvs.find(x => x.id === subId); if (sub) sub.roleId = roleId || null; return d })
      },
      assignStaffService(accId, serviceId) {
        setDb(d => { const a = d.accounts.find(x => x.id === accId); if (a) a.staffServiceId = serviceId || null; return d })
      },
      // Rattache une personne (via son compte) à un manager choisi (par sous-espace), ou à la racine
      // (managerSubId null). Permet au manager de placer librement chacun dans l'organigramme.
      setManagerOf(subId, managerSubId) {
        if (roBlocked()) return
        if (subId === managerSubId) return
        setDb(d => {
          const sub = d.subenvs.find(s => s.id === subId); if (!sub) return d
          const acc = d.accounts.find(a => a.id === sub.ownerId); if (!acc) return d
          const mgrSub = managerSubId ? d.subenvs.find(s => s.id === managerSubId) : null
          const newParent = mgrSub ? mgrSub.ownerId : null
          if (newParent === acc.id) return d // pas d'auto-rattachement
          // Anti-cycle : si le nouveau manager remonte déjà (via teamOf) jusqu'à cette personne, on refuse.
          let cur = newParent, guard = 0
          while (cur && guard++ < 100) { if (cur === acc.id) return d; cur = d.accounts.find(a => a.id === cur)?.teamOf }
          acc.teamOf = newParent
          return d
        })
      },
      // Staff/fondateur/admin : attribue ou retire le rôle Manager à une personne.
      setEmployeeRole(subId, makeManager) {
        if (!['Fondateur', 'Support BD Report', 'Administrateur'].includes(account?.role)) return
        if (roBlocked()) return
        setDb(d => {
          const sub = d.subenvs.find(s => s.id === subId); if (!sub) return d
          const acc = d.accounts.find(a => a.id === sub.ownerId); if (acc) acc.role = makeManager ? 'Manager' : 'Membre'
          return d
        })
      },
      // ===================================================== Intégration HubSpot
      // Config effective de l'ENTREPRISE courante (connecteur de l'éditeur + portail relié).
      hubspot() { return hsCfg },
      // Réglages « éditeur » : l'URL du connecteur publiée à tous les clients.
      hubspotPlatform() { return { ...defaultHubspotConfig(), ...(db.integrations?.hubspot || {}) } },
      setHubspotPlatformConfig(patch) {
        if (!isSupportRole(account?.role)) return
        setDb(d => {
          d.integrations = d.integrations || {}
          d.integrations.hubspot = { ...defaultHubspotConfig(), ...(d.integrations.hubspot || {}), ...patch }
          delete d.integrations.hubspot.tenantKey
          return d
        })
      },
      // Réglages de l'entreprise courante (portail relié, correspondances, options).
      setHubspotConfig(patch) {
        if (roBlocked()) return
        const envId = session?.envId
        setDb(d => {
          if (envId) {
            const e = d.environments.find(x => x.id === envId)
            if (e) e.hubspot = { ...defaultHubspotConfig(), ...(e.hubspot || {}), ...patch }
          } else {
            d.integrations = d.integrations || {}
            d.integrations.hubspot = { ...defaultHubspotConfig(), ...(d.integrations.hubspot || {}), ...patch }
          }
          return d
        })
      },
      // Enregistre le portail relié après l'autorisation HubSpot du client.
      connectHubspotPortal({ tenantKey, portalId, hubDomain, user, scopes }) {
        this.setHubspotConfig({
          mode: 'oauth', enabled: true, tenantKey: tenantKey || '',
          portalId: String(portalId || ''), hubDomain: hubDomain || '',
          scopes: Array.isArray(scopes) ? scopes.join(' ') : (scopes || ''),
          connectedAt: new Date().toISOString(),
          connectedBy: user || actorName || '',
        })
      },
      // Oublie le portail côté app (le relais a déjà supprimé les jetons).
      disconnectHubspotPortal() {
        this.setHubspotConfig({ enabled: false, portalId: '', hubDomain: '', scopes: '', tenantKey: '', connectedAt: '', connectedBy: '' })
      },
      // Le token HubSpot ne quitte JAMAIS l'appareil : localStorage uniquement,
      // jamais dans le blob synchronisé (et donc jamais chez un autre utilisateur).
      // Il ne sert qu'au mode « direct » (avancé) : en mode client, c'est le relais
      // qui détient les jetons, par entreprise.
      hubspotToken() { try { return localStorage.getItem(HUBSPOT_TOKEN_KEY) || '' } catch (e) { return '' } },
      setHubspotToken(token) {
        try { token ? localStorage.setItem(HUBSPOT_TOKEN_KEY, token) : localStorage.removeItem(HUBSPOT_TOKEN_KEY) } catch (e) { /* stockage indisponible */ }
        applyHubspotConfig(this.hubspot())
      },
      // Mémorise les identifiants HubSpot renvoyés pour un RDV (envoi idempotent).
      setRdvHubspotIds(rdvId, ids) {
        this.setSub(s => ({ ...s, rdvs: (s.rdvs || []).map(r => r.id === rdvId ? { ...r, hubspot: ids } : r) }))
      },
      setContactHubspotId(contactId, hubspotId) {
        this.setSub(s => ({ ...s, contacts: (s.contacts || []).map(c => c.id === contactId ? { ...c, hubspotId } : c) }))
      },

      // ===================================================== Permissions de l'équipe staff
      staffRoles() { return db.staffRoles || [] },
      // Tous les noms de rôles (intégrés + personnalisés) — pour les listes déroulantes.
      allRoles() { const extra = (db.staffRoles || []).filter(r => !r.builtin).map(r => r.roleKey || r.name); return [...ROLES, ...extra] },
      roleRank(role) { return roleRankOf(role, db) },
      // Le compte courant (ou un compte donné) détient-il la permission ?
      hasPerm(permId, acc) { return accountHasPerm(acc || account, permId, db) },
      // L'acteur courant peut-il gérer (créer/éditer/attribuer) ce rôle ?
      canManageRole(targetRole) {
        if (account?.role === 'Fondateur') return true
        if (!accountHasPerm(account, 'permissions.manage', db)) return false
        if (targetRole === 'Fondateur') return false
        return roleRankOf(account?.role, db) > roleRankOf(targetRole, db)
      },
      createStaffRole(data) {
        if (!accountHasPerm(account, 'permissions.manage', db)) return null
        const name = (data?.name || '').trim(); if (!name) return null
        if (this.allRoles().includes(name)) { window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Ce nom de rôle existe déjà.' })); return null }
        const myRank = roleRankOf(account?.role, db)
        let rank = Number(data?.rank)
        if (!Number.isFinite(rank)) rank = Math.max(10, myRank - 10)
        if (account?.role !== 'Fondateur') rank = Math.min(rank, myRank - 1) // jamais ≥ à soi
        // Anti-escalade : on ne peut créer un rôle qu'avec des permissions qu'on détient soi-même.
        const perms = (data?.permissions || []).filter(p => STAFF_PERMISSION_IDS.includes(p) && (account?.role === 'Fondateur' || accountHasPerm(account, p, db)))
        const role = { id: uid(), name, roleKey: name, rank, builtin: false, permissions: perms }
        setDb(d => { d.staffRoles = d.staffRoles || []; d.staffRoles.push(role); return d })
        return role
      },
      updateStaffRole(roleKey, patch) {
        if (!this.canManageRole(roleKey)) return
        const isFounderActor = account?.role === 'Fondateur'
        setDb(d => {
          const r = (d.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey); if (!r) return d
          const p = { ...patch }
          if (typeof p.rank === 'number' && !isFounderActor) p.rank = Math.min(p.rank, roleRankOf(account?.role, d) - 1)
          if (p.name != null) { // renommage : rôles personnalisés uniquement
            const nn = String(p.name).trim()
            const old = r.roleKey || r.name
            if (!r.builtin && nn && nn !== old && ![...ROLES, ...(d.staffRoles || []).filter(x => !x.builtin).map(x => x.roleKey || x.name)].includes(nn)) {
              d.accounts.forEach(a => { if (a.role === old) a.role = nn })
              r.name = nn; r.roleKey = nn
            }
            delete p.name
          }
          if (Array.isArray(p.permissions)) {
            const allowed = isFounderActor ? STAFF_PERMISSION_IDS : STAFF_PERMISSION_IDS.filter(x => accountHasPerm(account, x, d))
            p.permissions = p.permissions.filter(x => STAFF_PERMISSION_IDS.includes(x) && allowed.includes(x))
          }
          Object.assign(r, p)
          if ((r.roleKey || r.name) === 'Fondateur') { r.permissions = [...STAFF_PERMISSION_IDS]; delete r.suspended } // Fondateur toujours complet et jamais suspendu
          return d
        })
      },
      toggleRolePerm(roleKey, permId, on) {
        if (!this.canManageRole(roleKey)) return
        if (account?.role !== 'Fondateur' && !accountHasPerm(account, permId, db)) return // pas d'octroi d'un droit non détenu
        const r = (db.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey); if (!r || (r.roleKey || r.name) === 'Fondateur') return
        const cur = new Set(r.permissions || [])
        on ? cur.add(permId) : cur.delete(permId)
        this.updateStaffRole(roleKey, { permissions: [...cur] })
      },
      // Applique en une fois le jeu de droits d'un rôle (enregistrement explicite).
      // L'acteur ne peut ni accorder ni retirer un droit qu'il ne détient pas lui-même :
      // ceux-là sont repris inchangés, sans quoi un enregistrement global contournerait
      // la garde qui protège l'octroi unitaire.
      setRolePermissions(roleKey, permIds) {
        if (!this.canManageRole(roleKey)) return
        const r = (db.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey)
        if (!r || (r.roleKey || r.name) === 'Fondateur') return
        const mine = (p) => account?.role === 'Fondateur' || accountHasPerm(account, p, db)
        const outOfReach = (r.permissions || []).filter(p => !mine(p))
        this.updateStaffRole(roleKey, { permissions: [...new Set([...outOfReach, ...(permIds || []).filter(mine)])] })
      },
      // Coche ou décoche un groupe entier de droits pour un rôle. Même garde que l'octroi
      // unitaire : on ne distribue que les droits qu'on détient soi-même (anti-escalade),
      // les autres sont ignorés au lieu de faire échouer l'opération entière.
      toggleRolePermGroup(roleKey, permIds, on) {
        if (!this.canManageRole(roleKey)) return
        const r = (db.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey)
        if (!r || (r.roleKey || r.name) === 'Fondateur') return
        const cur = new Set(r.permissions || [])
        ;(permIds || [])
          .filter(p => account?.role === 'Fondateur' || accountHasPerm(account, p, db))
          .forEach(p => (on ? cur.add(p) : cur.delete(p)))
        this.updateStaffRole(roleKey, { permissions: [...cur] })
      },
      // Couleur de repérage d'un rôle dans la matrice et les listes.
      setRoleColor(roleKey, color) { this.updateStaffRole(roleKey, { color: color || '' }) },
      // Suspension d'un rôle : ses titulaires perdent leurs droits staff sans que le rôle
      // ni sa configuration ne soient touchés. Le Fondateur en est exclu (anti-lockout),
      // et un rôle intégré se suspend alors qu'il ne peut pas se supprimer.
      setRoleSuspended(roleKey, suspended) {
        if (roleKey === 'Fondateur') return
        if (!this.canManageRole(roleKey)) return
        this.updateStaffRole(roleKey, {
          suspended: !!suspended,
          suspendedAt: suspended ? new Date().toISOString() : '',
          suspendedBy: suspended ? (account?.pseudo || account?.email || '') : '',
        })
      },
      deleteStaffRole(roleKey) {
        if (!this.canManageRole(roleKey)) return
        const r = (db.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey); if (!r || r.builtin) return
        setDb(d => {
          d.staffRoles = (d.staffRoles || []).filter(x => (x.roleKey || x.name) !== roleKey)
          d.accounts.forEach(a => { if (a.role === roleKey) a.role = 'Membre' })
          return d
        })
      },
      // Attribue un rôle à un compte (respect strict de la hiérarchie).
      setAccountRole(accId, role) {
        const target = db.accounts.find(a => a.id === accId)
        if (account?.role !== 'Fondateur') {
          if (!accountHasPerm(account, 'accounts.role', db) && !accountHasPerm(account, 'permissions.manage', db)) return
          if (!this.canManageRole(role)) return // rôle cible gérable ?
          // ne pas toucher quelqu'un de rang ≥ au sien (sauf soi-même)
          if (target && target.id !== account?.id && roleRankOf(target.role, db) >= roleRankOf(account?.role, db)) return
        }
        setDb(d => { const a = d.accounts.find(x => x.id === accId); if (a) a.role = role; return d })
      },

      // ===================================================== Offres / abonnements
      offers() { return db.offers || [] },
      myOffer() { return findOffer(db.offers, account?.plan) },
      hasTeam() { return hasTeamAccess(account, db.offers) },
      // Gestion des offres (staff uniquement) : créer / modifier / supprimer.
      createOffer(data) {
        if (!accountHasPerm(account, 'offers.manage', db)) return null
        const o = { id: uid(), name: (data?.name || 'Nouvelle offre').trim(), price: Number(data?.price) || 0, priceLabel: data?.priceLabel || '', desc: data?.desc || '', bricks: Array.isArray(data?.bricks) ? data.bricks : [], team: !!data?.team, maxSeats: Number(data?.maxSeats) || 0, builtin: false, createdAt: new Date().toISOString() }
        setDb(d => { d.offers = d.offers || []; d.offers.push(o); return d })
        return o
      },
      updateOffer(id, patch) {
        if (!accountHasPerm(account, 'offers.manage', db)) return
        setDb(d => { const o = (d.offers || []).find(x => x.id === id); if (o) Object.assign(o, patch); return d })
      },
      deleteOffer(id) {
        if (!accountHasPerm(account, 'offers.manage', db)) return
        setDb(d => { d.offers = (d.offers || []).filter(o => o.id !== id); return d })
      },
      // Attribue une offre à un compte (met à jour plan + briques accessibles).
      setAccountOffer(accId, offerId) {
        if (!accountHasPerm(account, 'accounts.offer', db)) return
        setDb(d => {
          const a = d.accounts.find(x => x.id === accId); if (!a) return d
          a.plan = offerId || null
          const offer = findOffer(d.offers, offerId)
          if (offer) a.bricks = [...offer.bricks]
          return d
        })
      },
      // Attribue une offre à tout un environnement (le créateur + ses membres).
      setEnvOffer(envId, offerId) {
        if (!accountHasPerm(account, 'accounts.offer', db)) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (!env) return d
          env.plan = offerId || null
          const offer = findOffer(d.offers, offerId)
          const memberIds = new Set([env.createdBy, ...(env.members || [])].filter(Boolean))
          d.accounts.forEach(a => { if (memberIds.has(a.id)) { a.plan = offerId || null; if (offer) a.bricks = [...offer.bricks] } })
          return d
        })
      },
      // Souscription client : ouvre un ticket au support pour l'offre choisie.
      subscribeToOffer(offerId) {
        const offer = findOffer(db.offers, offerId); if (!offer) return null
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const env = db.environments.find(e => e.id === session?.envId)
        const prenom = sub?.prenom || account?.pseudo || 'Utilisateur'
        const ticket = makeTicket({
          accountId: account?.id, prenom, photo: sub?.photo || account?.photo || '', clientName: env?.name || prenom,
          envId: session?.envId, subEnvId: session?.subEnvId, category: `Souscription — ${offer.name}`, priority: 'haute',
          message: `Bonjour, je souhaite souscrire à l'offre « ${offer.name} » (${offer.priceLabel || (offer.price + ' €')}).`,
          botText: `Bonjour ${prenom}, votre demande de souscription à l'offre « ${offer.name} » est bien enregistrée. Un membre de l'équipe BD Report va l'activer et revenir vers vous ici.`,
        })
        setDb(d => {
          d.tickets = d.tickets || []; d.tickets.unshift(ticket)
          enrichClientFromTicket(d, ticket); syncClientStatusFromTickets(d, ticket)
          pushSupportLog(d, { type: 'Abonnement', action: 'Demande de souscription', details: `${offer.name} · ${prenom}`, actorId: account?.id || null, actorName: prenom })
          return d
        })
        return ticket
      },
      // ===================================================== Staff : gestion des membres d'un projet/env
      // Désactive temporairement (ou réactive) l'accès d'un compte (bloque la connexion).
      disableAccount(accId, disabled) {
        if (!accountHasPerm(account, 'accounts.disable', db)) return
        setDb(d => { const a = d.accounts.find(x => x.id === accId); if (a) a.disabled = !!disabled; return d })
      },
      // Efface toutes les données d'un espace (remise à zéro complète).
      wipeSpaceData(subId) {
        if (!accountHasPerm(account, 'accounts.wipe', db)) return
        setDb(d => { if (d.data[subId]) d.data[subId] = emptySubEnvData(); return d })
      },
      // Retire un membre d'un environnement (accès + espaces + données de cet env).
      removeEnvMember(envId, accId) {
        if (!accountHasPerm(account, 'accounts.remove', db)) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (env) env.members = (env.members || []).filter(m => m !== accId)
          d.subenvs.filter(s => s.envId === envId && s.ownerId === accId).forEach(s => { delete d.data[s.id] })
          d.subenvs = d.subenvs.filter(s => !(s.envId === envId && s.ownerId === accId))
          return d
        })
      },
      // Membres (comptes) d'un environnement, pour le menu utilisateurs d'un projet.
      envMembers(envId) {
        const env = db.environments.find(e => e.id === envId); if (!env) return []
        const ids = new Set([env.createdBy, ...(env.members || [])].filter(Boolean))
        db.subenvs.filter(s => s.envId === envId).forEach(s => ids.add(s.ownerId))
        return [...ids].map(id => db.accounts.find(a => a.id === id)).filter(Boolean).map(a => ({
          account: a, sub: db.subenvs.find(s => s.envId === envId && s.ownerId === a.id) || null, isOwner: env.createdBy === a.id,
        }))
      },
      // ===================================================== Mots de passe (visibilité manager/support)
      canViewPasswords() { return accountHasPerm(account, 'passwords.view', db) },
      // Renvoie le mot de passe en clair si connu (comptes créés/réinitialisés depuis l'app),
      // sinon null (les anciens mots de passe purgés ne sont pas récupérables).
      revealPassword(id) {
        if (!this.canViewPasswords()) return null
        return db.accounts.find(a => a.id === id)?.passwordClear || null
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
      updateAccount(id, patch) {
        if (roBlocked()) return
        // Palliatif d'autorisation : seuls Fondateur/Support/Administrateur peuvent modifier
        // rôle, offre, briques ou statut développeur d'un compte (le reste = self-edit permis).
        const elevated = ['Fondateur', 'Support BD Report', 'Administrateur'].includes(account?.role)
        const safe = stripDangerousKeys({ ...patch })
        if (!elevated) { delete safe.role; delete safe.plan; delete safe.bricks; delete safe.developer }
        setDb(d => { const a = d.accounts.find(x => x.id === id); if (a) Object.assign(a, safe); return d })
      },
      deleteAccount(id) { if (roBlocked()) return; setDb(d => { d.accounts = d.accounts.filter(a => a.id !== id); return d }) },
      // Restauration d'une sauvegarde importée : neutralise les clés dangereuses
      // (pollution de prototype), valide la structure et passe par migrate avant d'appliquer.
      restoreBackup(raw) {
        if (roBlocked()) return { error: 'Lecture seule' }
        const clean = stripDangerousKeys(raw)
        if (!clean || typeof clean !== 'object' || !Array.isArray(clean.accounts) || !Array.isArray(clean.environments)) {
          return { error: 'format' }
        }
        setDb(() => migrate(clean))
        return { ok: true }
      },
      addAccount(acc) {
        if (roBlocked()) return null
        // Offre solo (Starter) : impossible de créer d'autres comptes / de piloter une équipe.
        if (!hasTeamAccess(account, db.offers)) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Votre offre ne permet pas de créer d\'autres comptes. Passez à une offre équipe.' })); return null }
        // Compte créé par un manager/admin = briques de l'offre de l'environnement courant (Beta par défaut).
        const env = db.environments.find(e => e.id === session?.envId)
        const plan = acc.plan || env?.plan || 'beta'
        const offerBricks = findOffer(db.offers, plan)?.bricks || PLANS[plan]?.bricks || BRICKS
        const a = { id: uid(), role: 'Membre', developer: false, photo: '', bricks: [...offerBricks], teamOf: null, ...acc, plan }
        // Conserve le mot de passe en clair (visible manager/support) puis stocke le hash pour l'auth.
        if (a.password && !String(a.password).startsWith('sha256:')) { a.passwordClear = a.password; a.password = hashPw(a.password) }
        delete a.passwordPlain
        setDb(d => { d.accounts.push(a); return d })
        return a
      },
      // Définit un nouveau mot de passe (stocke uniquement le hash — jamais le clair).
      setAccountPassword(id, plain) {
        if (roBlocked()) return
        setDb(d => { const a = d.accounts.find(x => x.id === id); if (a) { a.password = hashPw(plain); a.passwordClear = plain; delete a.passwordPlain } return d })
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
            if (status === 'closed') t.closedAt = new Date().toISOString()
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
      // Prise en charge : l'agent s'attribue le ticket et son nom s'affiche dans le fil.
      // Les autres membres du support peuvent toujours répondre — c'est une responsabilité
      // rendue visible, pas un verrou d'accès.
      takeTicket(ticketId) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.assignedTo = account?.id || null
          t.takenAt = new Date().toISOString()
          if (t.status === 'open') t.status = 'in_progress'
          pushSupportLog(d, { type: 'Ticket', action: 'Ticket pris en charge', details: `${t.category} · ${t.userName}`, actorId: account?.id || null, actorName })
          return d
        })
      },
      // Clôture demandée par le client : le motif qu'il indique est restitué au support,
      // qui saurait sinon qu'un ticket s'est fermé sans savoir pourquoi.
      closeTicketByClient(ticketId, { reason, comment }) {
        setDb(d => {
          const t = (d.tickets || []).find(x => x.id === ticketId)
          if (!t) return d
          t.status = 'closed'
          t.closedAt = new Date().toISOString()
          t.closure = {
            by: 'client', reason: reason || 'other', comment: (comment || '').trim(),
            name: account?.pseudo || t.userName || '', ts: t.closedAt,
          }
          syncClientStatusFromTickets(d, t)
          pushSupportLog(d, {
            type: 'Ticket', action: 'Ticket clôturé par le client',
            details: `${t.category} · ${reason === 'resolved' ? 'problème résolu' : 'autre motif'}`,
            actorId: account?.id || null, actorName,
          })
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
      // Note de satisfaction produit, rattachée au jalon qui l'a déclenchée. Un report
      // marque le jalon comme traité : on ne harcèle pas quelqu'un qui a dit non.
      rateProduct(milestone, score, comment = '') {
        setDb(d => {
          const a = (d.accounts || []).find(x => x.id === account?.id)
          if (a) a.productSurveys = [...new Set([...(a.productSurveys || []), milestone])]
          if (score) {
            d.productRatings = d.productRatings || []
            d.productRatings.unshift({
              id: uid(), accountId: account?.id || null, accountName: account?.pseudo || '',
              envId: session?.envId || null, milestone, score, comment: (comment || '').trim(),
              ts: new Date().toISOString(),
            })
          }
          return d
        })
      },
      dueSurvey() { return dueSurveyMilestone(account) },
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
        // La clôture est horodatée pour le suivi du churn ; rouvrir un projet efface
        // son motif, qui ne décrirait plus rien.
        if (locked.status === 'termine') locked.closedAt = locked.closedAt || new Date().toISOString()
        else { delete locked.closedAt; delete locked.closeReason }
        setDb(d => {
          d.projects = d.projects || []
          const i = d.projects.findIndex(p => p.id === locked.id)
          if (i >= 0) d.projects[i] = locked
          else d.projects.unshift({ ...locked, id: locked.id || uid(), createdAt: new Date().toISOString() })
          return d
        })
      },
      deleteProject(id) { setDb(d => { d.projects = (d.projects || []).filter(p => p.id !== id); return d }) },
      // ----- Réponses types (support)
      addCannedReply(r) { setDb(d => { d.cannedReplies = d.cannedReplies || []; d.cannedReplies.unshift({ id: uid(), title: r.title || 'Sans titre', text: r.text || '' }); return d }) },
      updateCannedReply(id, patch) { setDb(d => { const x = (d.cannedReplies || []).find(c => c.id === id); if (x) Object.assign(x, patch); return d }) },
      deleteCannedReply(id) { setDb(d => { d.cannedReplies = (d.cannedReplies || []).filter(c => c.id !== id); return d }) },
      // ----- Base de connaissances (support)
      saveKbArticle(art) {
        setDb(d => {
          d.kbArticles = d.kbArticles || []
          const now = new Date().toISOString()
          const i = d.kbArticles.findIndex(x => x.id === art.id)
          if (i >= 0) d.kbArticles[i] = { ...art, updatedAt: now }
          else d.kbArticles.unshift({ ...art, id: art.id || uid(), createdAt: now, updatedAt: now })
          return d
        })
      },
      deleteKbArticle(id) { setDb(d => { d.kbArticles = (d.kbArticles || []).filter(x => x.id !== id); return d }) },
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
