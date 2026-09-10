import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from './supabaseConfig.js'
import { deob } from './obf.js'
import { isKnownTheme } from './themes.js'
import { stripDangerousKeys } from './security.js'
// Import statique : le déploiement inline l'app en un seul fichier, un import
// dynamique local produirait un morceau séparé qui ne serait jamais publié.
import { signOut as signOutSupabase } from './supabaseAuth.js'
import { fetchRemoteState, pushRemoteState, pushRemoteStateDebounced, subscribeRemoteState, fetchContactRequests, subscribeContactRequests, publishOffersDebounced } from './supabaseSync.js'
import { ALL_BRICKS, LEGACY_BRICKS, GRANTABLE_TABS, NAV } from './nav.jsx'
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
// Accepte aussi bien 'AAAA-MM-JJ' qu'un horodatage ISO complet : concaténer 'T00:00:00'
// à un horodatage donnait une date invalide, affichée telle quelle à l'écran
// (« Invalid Date » sur la fiche entreprise). Le midi local reste imposé pour que la
// date affichée soit celle saisie, quel que soit le fuseau du navigateur.
export const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}
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
/**
 * Ouvre le client et le projet d'implémentation d'un environnement — UNE SEULE FOIS.
 *
 * ⚠️ Créer et MARQUER doivent rester ensemble. Tant que les deux gestes vivaient à deux
 * endroits, l'un a fini par oublier l'autre : `createEnv` posait le projet sans l'inscrire
 * dans `_autoSeed`, si bien qu'au rechargement suivant la migration croyait n'avoir jamais
 * rien semé — et recréait le projet que l'utilisateur venait de supprimer. Un projet
 * ressuscité est pire qu'un projet manquant : on le resupprime, il revient, et on cesse de
 * faire confiance à la corbeille.
 *
 * Le repère est posé MÊME quand rien n'est créé : c'est le fait d'avoir semé qu'on retient,
 * pas le résultat.
 */
export function seedEnvClientAndProject(db, env) {
  db._autoSeed = db._autoSeed || {}
  db._autoSeed.envClients = db._autoSeed.envClients || []
  db._autoSeed.envProjects = db._autoSeed.envProjects || []
  db.clients = db.clients || []
  db.projects = db.projects || []
  if (!db._autoSeed.envClients.includes(env.id)) {
    if (!db.clients.some(c => c.key === 'env:' + env.id)) db.clients.unshift(makeClientFromEnv(env))
    db._autoSeed.envClients.push(env.id)
  }
  if (!db._autoSeed.envProjects.includes(env.id)) {
    if (!db.projects.some(p => p.sourceEnvId === env.id)) db.projects.unshift(makeProjectFromEnv(env))
    db._autoSeed.envProjects.push(env.id)
  }
}

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

// Mois de paiement d'une prime, déclenchée par la date de passage en phase qualifiante.
// Le jour de bascule est un RÉGLAGE (`data.primeCutoffDay`, 15 par défaut) : toutes les
// entreprises n'arrêtent pas leur mois de paie au même jour.
export const DEFAULT_PRIME_CUTOFF = 15
export function primePaymentMonth(dateStr, cutoffDay = DEFAULT_PRIME_CUTOFF) {
  const d = parseISO(dateStr)
  if (!d) return null
  const cut = Math.min(28, Math.max(1, Number(cutoffDay) || DEFAULT_PRIME_CUTOFF))
  const m = new Date(d.getFullYear(), d.getMonth(), 1)
  if (d.getDate() > cut) m.setMonth(m.getMonth() + 1)
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
  { key: 'montant', label: "Montant de l'affaire" },
  { key: 'notes', label: 'Notes' },
]

// BRICKS = ensemble complet des onglets accordables, dérivé de la définition unique de la
// navigation (src/nav.jsx). Ajouter un onglet là-bas l'ajoute automatiquement ici (et donc
// dans l'éditeur d'offres + la page Souscrire).
export const BRICKS = ALL_BRICKS

// Ce qu'un titulaire de rôle voit RÉELLEMENT dans un environnement, sans y entrer.
// Trois filtres se superposent et c'est justement ce qui rend la réponse difficile à deviner :
// le module installé, l'offre souscrite, puis le rôle. Les donner à voir évite de livrer un
// espace dont personne ne comprend pourquoi il est vide.
export function previewTabs(env, offers, role) {
  const offer = (offers || []).find(o => o.id === env?.plan)
  const offerBricks = new Set(offer?.bricks || [])
  return GRANTABLE_TABS.filter(t => {
    const item = NAV.find(i => i.id === t.id)
    if (item?.module && !envModuleOn(env, item.module)) return false
    if (!offerBricks.has(t.brick)) return false
    if (role && !(role.tabs || []).includes(t.brick)) return false
    return true
  })
}

// ---------------------------------------------------------------- Modules optionnels
// Toutes les organisations ne travaillent pas pareil : une équipe sans closer n'a que faire
// d'une passation, une PME de trois personnes n'a pas d'entretien 1:1 formalisé. Ces briques
// métier s'installent donc à la carte — le staff coche ce qu'il livre à la création de
// l'environnement, et peut y revenir depuis la fiche du projet.
// ⚠️ L'absence de réglage vaut « tout activé » : un environnement créé avant ces modules ne
// doit rien perdre au premier chargement de la nouvelle version.
export const ENV_MODULES = [
  { id: 'handoff', where: { page: 'handoff', hub: null, hint: "l'onglet « Passation au closer »" }, label: 'Passation au closer', tab: 'Passation au closer',
    desc: "Le lead qualifié part en attente d'acceptation chez le closer, qui l'accepte ou le refuse avec un motif. Mesure la qualité réelle des leads." },
  { id: 'committee', where: { page: 'rdv', hub: null, hint: "le formulaire d'un rendez-vous (rôle et relation de chaque interlocuteur)" }, label: "Comité d'achat",
    desc: "Rôle (décideur, prescripteur, opposant…) et niveau de relation sur chaque interlocuteur d'un rendez-vous." },
  { id: 'quotas', where: { page: 'manager', hub: 'quotas', hint: "l'onglet « Objectifs & quotas » de la console Manager" }, label: 'Objectifs & montée en charge',
    desc: 'Quotas par personne et par période, avec un plan de montée en charge pour les arrivées récentes.' },
  { id: 'oneToOne', where: { page: 'conversations', hub: null, hint: "le dossier « 1:1 » des conversations" }, label: 'Entretiens 1:1',
    desc: "Un fil de discussion dédié entre chaque membre et son manager, rangé dans un dossier « 1:1 » des Conversations." },
  { id: 'challenges', where: { page: 'dashboard', hub: null, hint: "le bandeau de challenge en tête du tableau de bord" }, label: "Challenges d'équipe",
    desc: "Concours à durée limitée annoncés sur le tableau de bord de chaque commercial pendant l'événement." },
  { id: 'closing', where: { page: 'closing', hub: null, hint: "l'onglet « Closing »" }, label: 'Closer & pipeline de closing', tab: 'Closing',
    desc: "Un rôle Closer avec son propre pipeline en aval de la passation : proposition, négociation, signature. Sans ce module, l'affaire s'arrête au lead qualifié." },
  { id: 'dealValue', where: { page: 'rdv', hub: null, hint: "le champ « Montant de l'affaire » d'un rendez-vous" }, label: "Montant des affaires",
    desc: "Le montant du contrat sur chaque affaire (ponctuel ou récurrent) : valeur du pipeline, chiffre d'affaires signé, et ce que rapporte réellement chaque provenance." },
  { id: 'statements', where: { page: 'primes', hub: null, hint: "le relevé mensuel, sur la page Primes" }, label: 'Relevés de primes',
    desc: 'Relevé mensuel par personne, signé par le manager avant de devenir téléchargeable par le collaborateur.' },
  // ---- Deuxième série. Voir MODULES_V2 : ceux-là n'arrivent PAS allumés chez l'existant.
  { id: 'rdvHistory', where: { page: 'rdv', hub: null, hint: "l'historique replié au bas de chaque fiche de rendez-vous" }, label: 'Historique des modifications',
    desc: "Qui a changé quoi, et quand, sur chaque affaire. Les primes se calculent sur les passages d'étape : sans trace, une prime contestée ne peut pas être tranchée." },
  { id: 'forecast', where: { page: 'dashboard', hub: null, hint: "le bloc « Atterrissage de la période » du tableau de bord" }, label: 'Atterrissage du mois',
    desc: "Où l'équipe arrive en fin de période si elle continue à ce rythme — à partir de la cadence réelle et du pipeline ouvert, pas d'une cible saisie à la main." },
  { id: 'recycling', where: { page: 'tasks', hub: null, hint: "la section « À reprendre aujourd'hui » des recommandations" }, label: 'Recyclage des leads perdus',
    desc: "Un refus fixe une date de re-tentative selon son motif ; le lead revient de lui-même dans les recommandations le jour venu." },
  { id: 'cadence', where: { page: 'rdv', hub: null, hint: "le menu d'un rendez-vous : « Appliquer un plan de relance »" }, label: 'Plans de relance',
    desc: "Une séquence de touches définie par le manager (J+0, J+3, J+7…), appliquée à une affaire, qui crée les tâches datées. Aucun envoi automatique : le produit dit quoi faire et quand." },
  { id: 'territories', where: { page: 'teamlead', hub: null, hint: "la carte des territoires, dans Pilotage équipe" }, label: 'Territoires & attribution',
    desc: "Attribution explicite de comptes ou de secteurs par personne, et alerte quand deux commerciaux travaillent la même entreprise — avant le doublon, pas après." },
  { id: 'weeklyDigest', where: { page: 'conversations', hub: null, hint: "le canal de reporting, chaque lundi" }, label: 'Récapitulatif hebdomadaire',
    desc: "Chaque lundi dans le canal de reporting : ce qui a bougé, ce qui stagne, qui est sous quota." },
]
export const ENV_MODULE_IDS = ENV_MODULES.map(m => m.id)
// ⚠️ EXCEPTION ASSUMÉE à la règle « absent = actif ». Ces six briques sont arrivées après
// que des équipes travaillaient déjà : les allumer d'office aurait fait apparaître six
// onglets du jour au lendemain, sans que personne ne l'ait demandé. `migrate` les inscrit
// donc explicitement à `false` sur les environnements EXISTANTS (une seule fois, via
// `_autoSeed.modulesV2`). Les environnements créés ensuite les reçoivent actives, comme
// le reste. Le staff les allume quand le client le décide.
export const MODULES_V2 = ['rdvHistory', 'forecast', 'recycling', 'cadence', 'territories', 'weeklyDigest']

// ---------------------------------------------------------------- Historique d'une affaire
// Les primes se calculent sur des passages d'étape et des dates. Tant que personne ne peut
// dire QUI a passé une affaire en SQL ni QUAND, une prime contestée se règle de mémoire.
//
// Liste volontairement COURTE : on trace ce qui change une rémunération ou un engagement,
// pas chaque frappe. Un commentaire retouché n'a pas à laisser de trace ; une date de
// passage SQL, si.
export const AUDIT_FIELDS = [
  ['phase', 'Étape'],
  ['opportunite', 'Statut'],
  ['datePassageSQL', 'Date de passage SQL'],
  ['dateRdv', 'Date du rendez-vous'],
  ['montant', "Montant de l'affaire"],
  ['recurrence', 'Récurrence'],
  ['source', 'Provenance'],
  ['effectif', 'Effectif'],
  ['motifKo', 'Motif de perte'],
  ['entreprise', 'Entreprise'],
  ['primeInvalid', 'Prime invalidée'],
]
// Au-delà, on coupe par le début : l'état entier est sérialisé à chaque sauvegarde, et un
// historique sans bornes finirait par peser sur toute l'application, pas seulement sur lui.
const AUDIT_MAX = 200
const auditPick = (r) => { const o = {}; AUDIT_FIELDS.forEach(([f]) => { o[f] = r[f] }); return o }

// Photographie d'avant l'écriture. Prise AVANT car les écritures mutent les RDV en place :
// sans copie des champs suivis, la comparaison d'après porterait sur l'objet déjà modifié.
export function auditSnapshot(data) {
  const m = new Map()
  ;(data?.rdvs || []).forEach(r => m.set(r.id, auditPick(r)))
  return m
}

// Compare l'après à l'avant et inscrit les écarts. Appelé depuis `setSub`/`setSubData`,
// c'est-à-dire le passage OBLIGÉ de toute écriture : aucun écran n'a à y penser, et un
// nouvel écran qui déplacerait une affaire serait tracé sans rien avoir à ajouter.
export function applyRdvAudit(data, before, actor) {
  if (!before) return
  const at = new Date().toISOString()
  ;(data?.rdvs || []).forEach(r => {
    const prev = before.get(r.id)
    if (!prev) return // création : la frise `history` porte déjà l'origine de l'affaire
    const lines = []
    AUDIT_FIELDS.forEach(([f, label]) => {
      const a = prev[f] ?? '', b = r[f] ?? ''
      if (String(a) !== String(b)) lines.push({ at, by: actor?.name || '—', bySub: actor?.subId || '', field: f, label, from: String(a), to: String(b) })
    })
    if (!lines.length) return
    const next = [...(r.audit || []), ...lines]
    r.audit = next.length > AUDIT_MAX ? next.slice(next.length - AUDIT_MAX) : next
  })
}
// Un module absent du réglage est actif : voir l'avertissement ci-dessus.
export const envModuleOn = (env, id) => (env?.modules?.[id] !== false)
export const defaultEnvModules = () => Object.fromEntries(ENV_MODULE_IDS.map(id => [id, true]))

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
// Rôles qui encadrent côté client TANT QU'AUCUN rôle d'environnement n'est attribué.
// Cette liste était recopiée dans neuf écrans, si bien qu'un rôle créé sur mesure n'y
// figurait jamais : la personne avait tous les droits et voyait quand même le bouton
// disparaître, sans explication. Un seul endroit la définit désormais, et partout où un
// droit existe, c'est le droit qui est interrogé — pas le nom du rôle.
export const CLIENT_MANAGER_ROLES = ['Manager', 'Administrateur', 'Fondateur', 'Support BD Report']
export const isClientManagerRole = (role) => CLIENT_MANAGER_ROLES.includes(role)
// Rôles de l'éditeur qui passent au-dessus des cloisons d'un environnement client.
export const ELEVATED_ROLES = ['Fondateur', 'Support BD Report', 'Administrateur', 'Développeur']
export const isElevatedRole = (role) => ELEVATED_ROLES.includes(role)

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
      // Composer un environnement, c'est décider de ce qu'un client reçoit : modules, offre,
      // rôles, accès. Ce n'est pas la même chose que modifier une fiche client.
      { id: 'env.build', label: "Composer et livrer un environnement (atelier)" },
      { id: 'env.modules', label: "Installer ou retirer les modules d'un environnement" },
      // ENTRER chez un client est le droit le plus intrusif du back-office : on voit son
      // pipeline, ses contacts, ses primes. Il était jusqu'ici déduit du rôle (Fondateur /
      // Support) et d'un vieux drapeau de compte, donc ni visible ni retirable. Il se donne
      // maintenant comme les autres — et il commande TOUT le chemin : la liste des
      // environnements, l'exemption de code, et la trace laissée en entrant.
      { id: 'env.access', label: 'Entrer dans tous les environnements clients' },
    ],
  },
  {
    id: 'projects', label: 'Projets & mise en place', perms: [
      { id: 'projects.view', label: 'Voir les projets d\'implémentation' },
      { id: 'projects.manage', label: 'Créer et piloter la mise en place des projets' },
      { id: 'projects.delete', label: 'Supprimer un projet' },
      // Un projet pris en charge appartient à quelqu'un. Intervenir dessus sans le lui dire
      // est un geste d'encadrement ou de dépannage : il se donne, il ne se suppose pas.
      { id: 'projects.others', label: "Travailler sur les projets pris en charge par quelqu'un d'autre" },
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
      { id: 'channels.manage', label: 'Créer et administrer les canaux du staff' },
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
    // `env.access` n'y est PAS : composer un environnement et entrer chez le client sont
    // deux gestes différents. Il s'accorde, il ne se déduit pas d'un rôle voisin.
    'clients.view', 'clients.manage', 'clients.delete', 'env.build', 'env.modules', 'projects.view', 'projects.manage', 'projects.others',
    'accounts.view', 'accounts.create', 'accounts.role', 'accounts.offer', 'accounts.disable', 'accounts.remove',
    'passwords.reset', 'services.manage', 'channels.manage', 'orgchart.edit', 'logs.view', 'stats.view', 'dashboard.view', 'manager.view', 'demo.access',
  ]
  if (roleKey === 'Développeur') return ['tickets.view', 'tickets.reply', 'tickets.priority', 'tickets.status', 'projects.view', 'logs.view', 'stats.view', 'dashboard.view', 'manager.view', 'demo.access']
  if (roleKey === 'Manager') return ['passwords.reset', 'accounts.create', 'stats.view', 'dashboard.view', 'manager.view', 'orgchart.edit', 'demo.access']
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
      { id: 'team.channels', label: 'Créer et administrer les canaux de conversation' },
    ],
  },
  {
    id: 'pilotage', label: 'Pilotage', perms: [
      { id: 'pilot.kpi', label: "Consulter les KPI de l'entreprise" },
      { id: 'pilot.team', label: "Piloter l'activité de l'équipe" },
      { id: 'pilot.pipeline', label: "Voir le pipeline de toute l'équipe" },
      { id: 'pilot.targets', label: 'Définir les objectifs et les quotas' },
      { id: 'pilot.challenges', label: "Lancer des challenges d'équipe" },
      // Trancher une passation engage la rémunération de quelqu'un : c'est un droit à part,
      // pas un effet de bord du droit d'encadrer.
      { id: 'deals.close', label: 'Accepter ou refuser les leads transmis' },
    ],
  },
  {
    id: 'primes', label: 'Primes', perms: [
      { id: 'primes.rules', label: 'Définir les barèmes et les règles' },
      { id: 'primes.all', label: "Voir les primes de toute l'équipe" },
      { id: 'primes.validate', label: 'Valider ou corriger une prime' },
      { id: 'primes.sign', label: 'Signer les relevés de primes' },
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
  'Qualité des données', 'ICP', 'Classement', 'Corbeille', 'Passation au closer', 'Closing']

// Onglets d'un closer : son pipeline, la file qu'il tranche, et de quoi préparer un rendez-vous.
// Volontairement court — un closer n'a que faire du barème de prospection ni du classement BDR.
const CLOSER_TABS = ['Dashboard', 'Closing', 'Passation au closer', 'Mes Rendez-vous',
  'Mes contacts', 'Mes notes', 'Mes tâches', 'Conversations', 'ICP']

export function defaultEnvRoles() {
  return [
    { id: 'erole-manager', name: 'Manager', builtin: true, color: 'amber', tabs: [...ALL_BRICKS], perms: [...CLIENT_PERMISSION_IDS] },
    { id: 'erole-membre', name: 'Membre', builtin: true, color: 'emerald', tabs: [...MEMBER_TABS], perms: [] },
    // Le closer porte `deals.close` : c'est son métier, pas une faveur d'encadrement.
    { id: CLOSING_ROLE_ID, name: 'Closer', builtin: true, color: 'sky', tabs: [...CLOSER_TABS], perms: ['deals.close'] },
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
// « Maintenance » n'est pas une étape du déroulé : c'est un ÉTAT, celui d'un environnement sur
// lequel un membre de l'équipe est en train d'intervenir. Elle est en fin de liste pour cette
// raison — le projet y passe et en revient, il ne la traverse pas une fois pour toutes.
export const PROJECT_PHASES = ['Cadrage', 'Implémentation', 'Paramétrage', 'Formation', 'Recette', 'Go-live', 'Suivi', 'Maintenance']
export const PROJECT_PHASE_COLORS = ['#3b5bdb', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#64748b', '#e11d48']
export const MAINTENANCE_PHASE = 'Maintenance'
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
// ---------------------------------------------------------------- Objectifs & quotas (module `quotas`)
// Jusqu'ici l'objectif était une cible que chacun se fixait sur son tableau de bord : utile
// pour se situer, sans valeur pour piloter une équipe. Le quota, lui, est posé par le manager,
// par personne et par période.
// La montée en charge n'est pas un détail de confort : sans elle, un arrivant est rouge partout
// pendant son premier trimestre, le classement l'enfonce, et le quota devient un objet de
// découragement au lieu d'un repère.
export const QUOTA_METRICS = [
  { id: 'rdvPris', label: 'RDV pris', hint: 'Rendez-vous décrochés sur la période' },
  { id: 'rdvTenus', label: 'RDV tenus', hint: 'Rendez-vous réellement réalisés (no-shows exclus)' },
  { id: 'sql', label: 'Leads qualifiés', hint: 'Passages au jalon commercial' },
  { id: 'signatures', label: 'Signatures', hint: 'Affaires gagnées' },
  { id: 'primes', label: 'Primes', hint: 'Montant de primes rattaché à la période' },
]
export const QUOTA_METRIC_IDS = QUOTA_METRICS.map(m => m.id)

// Réunion des repères de semis de deux versions. Les listes s'additionnent (sans doublon),
// les drapeaux vrais l'emportent : dans les deux cas, « déjà semé » gagne sur « pas encore ».
// L'asymétrie est voulue — oublier un semis fait réapparaître des suppressions, tandis que
// s'en souvenir à tort ne fait, au pire, que ne pas créer un élément qu'on peut créer à la main.
export function unionAutoSeed(a, b) {
  const out = { ...(b || {}) }
  Object.entries(a || {}).forEach(([k, v]) => {
    const other = out[k]
    if (Array.isArray(v) || Array.isArray(other)) {
      out[k] = [...new Set([...(Array.isArray(other) ? other : []), ...(Array.isArray(v) ? v : [])])]
    } else if (typeof v === 'boolean' || typeof other === 'boolean') {
      out[k] = !!v || !!other
    } else if (out[k] === undefined) {
      out[k] = v
    }
  })
  return out
}

// ---------------------------------------------------------------- Fusion des états distants
// Tout l'état vit dans un seul document partagé. À l'arrivée d'une version distante, on la
// substituait ENTIÈREMENT à la version locale — dernier écrit gagné, y compris sur des
// espaces que l'expéditeur n'avait pas touchés.
//
// Le scénario, banal : A et B travaillent en même temps. B enregistre ; sa version contient
// une copie PÉRIMÉE de l'espace de A, celle qu'il avait au chargement. À la réception, A
// voyait son propre travail des dernières minutes disparaître sans un mot.
//
// Chaque espace porte donc son horodatage (`_rev`, posé à l'écriture). On garde, espace par
// espace, la version la plus récente — quelle que soit la personne qui a poussé le document.
//
// ⚠️ Ce n'est PAS de la fusion de contenu : deux personnes qui modifient le MÊME espace en
// même temps se départagent toujours à la plus récente. C'est le cas rare (un espace a un
// propriétaire) ; celui qu'on corrige est le cas courant.
export function mergeRemoteDb(local, remote) {
  if (!local) return remote
  if (!remote) return local
  const merged = { ...remote, data: { ...(remote.data || {}) } }
  // ⚠️ Les repères de semis (`_autoSeed`) se RÉUNISSENT, ils ne se remplacent jamais.
  // Un repère dit « ceci a déjà été créé une fois » : c'est un FAIT, et le perdre ne peut
  // produire qu'une chose — recréer ce que quelqu'un avait supprimé. C'est ce qui faisait
  // revenir des projets en boucle : la photo d'un collègue, prise avant le semis, ramenait
  // des repères vides, la migration se croyait devant un environnement neuf, et
  // ressuscitait le projet. À chaque synchronisation.
  merged._autoSeed = unionAutoSeed(local._autoSeed, remote._autoSeed)
  const localData = local.data || {}
  Object.keys(localData).forEach(subId => {
    const mine = localData[subId], theirs = remote.data?.[subId]
    // Un espace que le distant ne connaît pas est un espace créé ici : le perdre reviendrait
    // à annuler sa création parce qu'un collègue a enregistré entre-temps.
    if (!theirs) { merged.data[subId] = mine; return }
    if ((mine?._rev || 0) > (theirs?._rev || 0)) merged.data[subId] = mine
  })
  // ⚠️ Les suppressions d'environnement voyagent, elles aussi. Les tableaux de tête
  // (`environments`, `projects`, `subenvs`) viennent du distant : la photo d'un collègue
  // prise AVANT une suppression la ramenait donc intégralement — l'environnement supprimé
  // « se rebaladait » à la synchronisation suivante. La pierre tombale tranche, et une
  // restauration plus récente la lève.
  merged._envTombstones = mergeEnvTombstones(local._envTombstones, remote._envTombstones)
  // a) Ce que le distant ignore encore mais qui vit ici (créé ou restauré) revient.
  ;(local.environments || []).forEach(env => {
    if (envIsDeleted(merged._envTombstones[env.id])) return
    if ((merged.environments || []).some(e => e.id === env.id)) return
    merged.environments = [...(merged.environments || []), env]
    const subs = (local.subenvs || []).filter(s => s.envId === env.id)
    merged.subenvs = [...(merged.subenvs || []), ...subs.filter(s => !(merged.subenvs || []).some(x => x.id === s.id))]
    subs.forEach(s => { if (!merged.data[s.id] && local.data?.[s.id]) merged.data[s.id] = local.data[s.id] })
    const projs = (local.projects || []).filter(p => p.envId === env.id || p.sourceEnvId === env.id)
    merged.projects = [...(merged.projects || []), ...projs.filter(p => !(merged.projects || []).some(x => x.id === p.id))]
  })
  // b) Et ce qui a été supprimé s'en va, même si l'autre côté l'ignore encore.
  Object.keys(merged._envTombstones).forEach(id => {
    if (!envIsDeleted(merged._envTombstones[id])) return
    merged.environments = (merged.environments || []).filter(e => e.id !== id)
    ;(merged.subenvs || []).filter(s => s.envId === id).forEach(s => { delete merged.data[s.id] })
    merged.subenvs = (merged.subenvs || []).filter(s => s.envId !== id)
    merged.projects = (merged.projects || []).filter(p => p.envId !== id && p.sourceEnvId !== id)
  })
  return merged
}

// ---------------------------------------------------------------- Territoires & attribution
// `envContacts` sait dire qu'un collègue travaille déjà une entreprise — mais APRÈS coup,
// quand les deux ont déjà appelé. L'attribution règle la question avant : ce compte, ce
// secteur, c'est à cette personne.
//
// Porté par l'ENVIRONNEMENT et non par un espace : une carte de territoires que chacun
// verrait différemment ne serait pas une carte.
export const envTerritories = (env) => (Array.isArray(env?.territories) ? env.territories : [])
const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
/**
 * À qui revient cette affaire, d'après la carte. Le NOM d'entreprise l'emporte sur le
 * secteur : une exception nominative existe précisément pour déroger à la règle générale.
 * Rend `null` si rien ne s'applique — un territoire non couvert reste ouvert à tous.
 */
export function territoryOwner(env, { entreprise, secteur } = {}) {
  const list = envTerritories(env)
  const c = normName(entreprise), s = normName(secteur)
  const byCompany = list.find(t => (t.companies || []).some(x => normName(x) === c && c))
  if (byCompany) return byCompany
  return list.find(t => (t.sectors || []).some(x => normName(x) === s && s)) || null
}

// ---------------------------------------------------------------- Plans de relance (cadences)
// Un BDR junior ne manque pas d'outils, il manque de méthode : quand relancer, combien de
// fois, et à quel moment s'arrêter. Le manager décrit la séquence une fois ; l'appliquer à
// une affaire pose les tâches datées.
//
// ⚠️ AUCUN ENVOI AUTOMATIQUE, volontairement. Le produit dit quoi faire et quand ; c'est
// une personne qui écrit et qui envoie. Automatiser l'envoi transformerait un outil de
// méthode en machine à spam, et ferait entrer le produit dans un tout autre métier —
// délivrabilité, désinscription, réputation d'expéditeur — qu'il ne sait pas tenir.
export function defaultCadences() {
  return [{
    id: 'cad-standard', name: 'Relance standard', builtin: true,
    steps: [
      { id: 's1', offset: 0, title: 'Premier contact', note: "Message d'accroche : le problème qu'on résout, pas le produit." },
      { id: 's2', offset: 3, title: 'Relance courte', note: 'Trois lignes maximum, une seule question fermée.' },
      { id: 's3', offset: 7, title: 'Angle différent', note: 'Autre entrée : un cas client comparable, ou un autre interlocuteur.' },
      { id: 's4', offset: 14, title: 'Dernier message', note: "Annoncer qu'on arrête. C'est celui qui obtient le plus de réponses." },
    ],
  }]
}
export const cadenceList = (data) => (Array.isArray(data?.cadences) ? data.cadences : [])
export const cadenceById = (data, id) => cadenceList(data).find(c => c.id === id) || null
/**
 * Les tâches que poserait un plan, sans les écrire. Sert à l'aperçu comme à l'application :
 * ce que l'écran montre est exactement ce qui sera créé.
 */
export function cadenceTasks(cadence, rdv, fromISO) {
  const start = fromISO || todayISO()
  return (cadence?.steps || []).slice().sort((a, b) => a.offset - b.offset).map(s => ({
    id: uid(),
    title: `${s.title} — ${rdv?.entreprise || 'affaire'}`,
    description: s.note || '',
    dueDate: addDaysISO(start, Math.max(0, Number(s.offset) || 0)),
    company: rdv?.entreprise || '',
    rdvId: rdv?.id || '',
    cadenceId: cadence?.id || '',
    stepId: s.id,
    done: false, createdAt: new Date().toISOString(),
  }))
}

// ---------------------------------------------------------------- Recyclage des leads perdus
// Le stock de leads perdus est la ressource la moins exploitée d'une équipe : elle l'a déjà
// travaillé, qualifié, et connaît l'interlocuteur. Un « non » de janvier n'est pas un « non »
// de juin — sauf quand il l'est vraiment, et le délai le dit.
//
// Les délais sont attachés au MOTIF : « pas de budget » se retente à l'exercice suivant,
// « mauvais timing » dans un trimestre, « concurrent retenu » à l'échéance du contrat.
// Zéro = on ne retente pas (l'entreprise a fermé, l'interlocuteur a refusé tout contact).
export const DEFAULT_RECYCLE_DELAYS = {
  'Pas de budget': 180,
  'Mauvais timing': 90,
  'Concurrent retenu': 365,
  'Pas décideur': 60,
  'Injoignable': 45,
}
// Motif inconnu du réglage (ajouté par le client) : on retente à six mois plutôt que jamais.
// Ne rien faire d'un motif qu'on ne connaît pas revient à perdre le lead une seconde fois.
export const RECYCLE_FALLBACK_DAYS = 180
export const recycleDelays = (data) => ({ ...DEFAULT_RECYCLE_DELAYS, ...(data?.recycleDelays || {}) })
export function recycleDelay(data, motif) {
  const m = recycleDelays(data)
  const v = m[motif]
  return v === undefined ? RECYCLE_FALLBACK_DAYS : Math.max(0, Number(v) || 0)
}
/** Les affaires perdues dont la date de re-tentative est arrivée. */
export function recyclables(data, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  return (data?.rdvs || [])
    .filter(r => r.opportunite === 'Perdue' && r.recycleAt && r.recycleAt <= today)
    .sort((a, b) => (a.recycleAt || '').localeCompare(b.recycleAt || ''))
}
/** Celles qui reviendront plus tard — utile pour montrer que rien n'est abandonné. */
export function recycleUpcoming(data, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  return (data?.rdvs || [])
    .filter(r => r.opportunite === 'Perdue' && r.recycleAt && r.recycleAt > today)
    .sort((a, b) => (a.recycleAt || '').localeCompare(b.recycleAt || ''))
}

// ---------------------------------------------------------------- Atterrissage de période
// Le Simulateur répond « combien si je fais X ». Personne ne répondait « où j'arrive si je
// continue comme ça » — la question qu'un manager se pose le 12 du mois.
//
// ⚠️ Deux estimations EXPLICABLES plutôt qu'une prévision savante : le rythme depuis le
// début de période, et celui des 7 derniers jours. La fourchette, c'est l'écart entre les
// deux, et l'écran dit laquelle est laquelle. Un intervalle de confiance calculé sur
// quinze jours de données donnerait un faux air de science à une devinette — et personne
// ne saurait dire d'où sort le chiffre le jour où il se trompe.
const DAY = 86400000
// Bornes calendaires de la période en cours (mêmes découpages que les quotas).
export function periodBounds(period, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  if (period === 'annee') return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
  if (period === 'trimestre') { const q = Math.floor(m / 3); return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0) } }
  if (period === 'semaine') {
    const day = (now.getDay() + 6) % 7 // lundi = 0
    const start = new Date(y, m, now.getDate() - day)
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) }
  }
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
}

// Ce qui a été réalisé entre deux dates, pour la même métrique qu'un quota. Sert à mesurer
// le rythme RÉCENT, qu'aucune clé de période ne sait donner (une semaine à cheval sur deux mois).
export function achievedBetween(data, metricId, fromISO, toISO) {
  const rdvs = data?.rdvs || []
  const inRange = (s) => !!s && s >= fromISO && s <= toISO
  switch (metricId) {
    case 'rdvPris': return rdvs.filter(r => inRange(r.datePriseRdv)).length
    case 'rdvTenus': return rdvs.filter(r => inRange(r.dateRdv) && !String(r.opportunite || '').startsWith('No Show')).length
    case 'sql': return rdvs.filter(r => inRange(r.datePassageSQL)).length
    case 'signatures': return rdvs.filter(r => isWonPhase(data, r.phase) && inRange(r.datePassageSQL || r.dateRdv)).length
    case 'primes':
      return computePrimes(rdvs, data?.bareme || [], primeOpts(data))
        .filter(p => !p.invalidated && inRange(p.triggerDate)).reduce((a, p) => a + p.montant, 0)
    default: return 0
  }
}

/**
 * Où l'on arrive en fin de période si le rythme se maintient.
 * `done` = le réalisé (même définition que le quota, donc le même chiffre à l'écran).
 * `sinceStart` / `last7` = les deux projections ; `low`/`high` = leur encadrement.
 * `target` = le quota s'il existe — sinon null, on ne fabrique pas d'objectif.
 */
export function landingForecast(data, metricId, opts = {}) {
  const now = opts.now || new Date()
  const period = opts.period || 'mois'
  const { start, end } = periodBounds(period, now)
  const iso = (d) => d.toISOString().slice(0, 10)
  const totalDays = Math.max(1, Math.round((end - start) / DAY) + 1)
  const elapsed = Math.min(totalDays, Math.max(1, Math.round((now - start) / DAY) + 1))
  const remaining = Math.max(0, totalDays - elapsed)
  const done = quotaAchieved(data, metricId, period, now, opts)

  // Rythme depuis le début de période.
  const sinceStart = Math.round((done / elapsed) * totalDays)
  // Rythme des 7 derniers jours, projeté sur ce qu'il reste. Fenêtre bornée au début de
  // période : un lundi 1er, « les 7 derniers jours » n'existent pas encore.
  const windowDays = Math.min(7, elapsed)
  const from = new Date(Math.max(start.getTime(), now.getTime() - (windowDays - 1) * DAY))
  const recent = achievedBetween(data, metricId, iso(from), iso(now))
  const last7 = Math.round(done + (recent / windowDays) * remaining)

  // `memberQuota` rend le DÉTAIL du quota (base, montée en charge, cible) : c'est la cible
  // pondérée qui nous intéresse ici, pas l'objet.
  const target = opts.env && opts.subId ? (memberQuota(opts.env, opts.subId, metricId).target || 0) : 0
  return {
    metricId, period, done, elapsed, totalDays, remaining,
    sinceStart, last7, recent, windowDays,
    low: Math.min(sinceStart, last7), high: Math.max(sinceStart, last7),
    target: target || null,
    // Sur la trajectoire actuelle, le quota est-il tenu ? Null s'il n'y a pas de quota :
    // annoncer « en retard » sans cible, c'est juger quelqu'un sur un objectif inventé.
    onTrack: target ? Math.min(sinceStart, last7) >= target : null,
  }
}
export function defaultQuotas() {
  return {
    period: 'mois',                                   // période de référence (voir ACTIVITY_PERIODS)
    metrics: ['rdvPris', 'sql', 'primes'],            // ce que l'on suit — le reste n'est pas affiché
    ramp: [40, 70, 100],                              // % du quota aux 1er, 2e, 3e mois d'ancienneté
    defaults: { rdvPris: 40, rdvTenus: 30, sql: 8, signatures: 3, primes: 2000 },
    byMember: {},                                     // { subId: { targets{}, startDate, period } }
  }
}
export const envQuotas = (env) => ({ ...defaultQuotas(), ...(env?.quotas || {}) })
// Part du quota attendue d'une personne selon son ancienneté. Une liste de paliers vide (ou
// aucune date d'arrivée) vaut « plein quota » : on n'invente pas une indulgence non demandée.
export function rampFactor(quotas, startDate, now = new Date()) {
  const ramp = (quotas?.ramp || []).filter(v => v !== '' && v != null)
  if (!ramp.length || !startDate) return 1
  const d = parseISO(startDate)
  if (!d || isNaN(d.getTime())) return 1
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (months < 0) return Math.min(1, (Number(ramp[0]) || 100) / 100)
  if (months >= ramp.length) return 1
  return Math.min(1, (Number(ramp[months]) || 100) / 100)
}
// Quota effectif d'une personne sur une métrique : la cible qui lui est propre, à défaut celle
// de l'équipe, pondérée par sa montée en charge.
export function memberQuota(env, subId, metricId, now = new Date()) {
  const q = envQuotas(env)
  const m = q.byMember?.[subId] || {}
  const raw = m.targets?.[metricId]
  const base = Number(raw === '' || raw == null ? (q.defaults?.[metricId] ?? 0) : raw) || 0
  const factor = rampFactor(q, m.startDate, now)
  return {
    base, factor, target: Math.round(base * factor), ramping: factor < 1 && base > 0,
    period: m.period || q.period, custom: raw !== '' && raw != null, startDate: m.startDate || '',
  }
}
// Réalisé d'une personne sur une métrique, dans la période EN COURS. On réutilise le découpage
// des primes d'activité (semaine/mois/trimestre/année) plutôt que d'en inventer un second.
export function quotaAchieved(data, metricId, period = 'mois', now = new Date(), opts = {}) {
  const here = activityPeriodKey(period, now.toISOString().slice(0, 10))
  const on = (dateStr) => !!dateStr && activityPeriodKey(period, dateStr) === here
  const rdvs = data?.rdvs || []
  switch (metricId) {
    case 'rdvPris': return rdvs.filter(r => on(r.datePriseRdv)).length
    case 'rdvTenus': return rdvs.filter(r => on(r.dateRdv) && !String(r.opportunite || '').startsWith('No Show')).length
    case 'sql': return rdvs.filter(r => on(r.datePassageSQL)).length
    // Une signature n'a pas de date propre : on retient celle de la qualification, sinon
    // celle du rendez-vous. Inventer une troisième date serait pire qu'approximer.
    case 'signatures': return rdvs.filter(r => isWonPhase(data, r.phase) && on(r.datePassageSQL || r.dateRdv)).length
    // ⚠️ Les primes se comptent au MOIS DE VERSEMENT, pas à la date de déclenchement — c'est
    // la règle de bascule de l'écosystème qui fait foi, et c'est ce montant que le relevé
    // signé annonce. Compter à la date de déclenchement donnait un quota en septembre pour
    // une prime versée en octobre : deux chiffres pour la même chose, donc un litige.
    // Les modulateurs (seuil, accélérateur, plafond) sont appliqués : le quota porte sur ce
    // qui est réellement perçu.
    case 'primes': {
      const key = activityPeriodKey('mois', now.toISOString().slice(0, 10))
      if (period !== 'mois') {
        // Hors maille mensuelle, le mois de versement n'a pas de sens : on retombe sur la
        // date de déclenchement, faute de mieux, et sans modulation.
        return computePrimes(rdvs, data?.bareme || [], primeOpts(data))
          .filter(p => !p.invalidated && on(p.triggerDate)).reduce((a, p) => a + p.montant, 0)
      }
      return monthlyPaidPrimes(data, opts.env, opts.subId, key)
    }
    default: return 0
  }
}

// ---------------------------------------------------------------- Closing (module `closing`)
// BD Report s'arrêtait là où le closer commence : une fois le lead accepté, l'affaire n'avait
// plus de vie. Le closer disposait d'une file d'attente, pas d'un métier. Le module lui donne
// un PIPELINE AVAL — proposition, négociation, signature — et un rôle qui ne voit que cela.
// ⚠️ Un axe SÉPARÉ, pas une extension du pipeline BDR. Fusionner les deux obligerait chaque
// équipe à faire vivre les étapes de l'autre métier, et fausserait tous les entonnoirs
// existants. `rdv.closing.phase` est indépendante de `rdv.phase` ; seules l'issue gagnée et
// l'issue perdue sont reportées sur `rdv.phase`, pour que les écrans déjà en place suivent.
export const DEFAULT_CLOSING_PHASES = ['Découverte', 'Proposition', 'Négociation']
export const CLOSING_ROLE_ID = 'erole-closer'
export const closingPhases = (data) => (data?.closingPhases?.length ? data.closingPhases : DEFAULT_CLOSING_PHASES)
export const DEFAULT_CLOSING_LOST_REASONS = ['Prix', 'Concurrent retenu', 'Pas de décision', 'Budget annulé', 'Besoin disparu']

// Une affaire entre en closing quand le closer l'a ACCEPTÉE : avant, elle ne lui appartient pas.
export const inClosing = (rdv) => rdv?.handoff?.state === 'accepted'
export const closingState = (rdv, data) => {
  if (!inClosing(rdv)) return null
  if (isWonPhase(data, rdv.phase)) return 'won'
  if (isLostPhase(data, rdv.phase) || rdv.opportunite === 'Perdue') return 'lost'
  return rdv.closing?.phase || closingPhases(data)[0]
}
export function closingStats(rdvs, data) {
  let open = 0, won = 0, lost = 0, openValue = 0, wonValue2 = 0
  ;(rdvs || []).forEach(r => {
    const st = closingState(r, data)
    if (!st) return
    if (st === 'won') { won++; wonValue2 += dealAnnualValue(r) }
    else if (st === 'lost') lost++
    else { open++; openValue += dealAnnualValue(r) }
  })
  const decided = won + lost
  return { open, won, lost, decided, openValue, wonValue: wonValue2, rate: decided ? Math.round((won / decided) * 100) : null }
}

// ---------------------------------------------------------------- Montant des affaires (module `dealValue`)
// Le produit savait tout d'une affaire sauf ce qu'elle rapporte : effectif, secteur, source,
// prime — jamais le montant du contrat. Sans lui, pas de valeur de pipeline, pas de chiffre
// d'affaires, et impossible de dire quelle provenance rapporte plutôt que quelle provenance
// occupe. C'est un champ, et il ouvre trois lectures.
// ⚠️ Module RETIRABLE : tout ce qui suit renvoie 0 ou une liste vide sur une affaire sans
// montant. Aucun calcul existant n'en dépend — retirer le module ne peut donc rien casser,
// il ne fait que cesser d'afficher.
export const DEAL_RECURRENCE = [
  { id: 'oneshot', label: 'Montant ponctuel', short: 'ponctuel' },
  { id: 'mensuel', label: 'Récurrent mensuel', short: '/mois' },
]
// Valeur ANNUELLE d'une affaire : c'est la seule maille qui permet de comparer un contrat
// ponctuel à un abonnement mensuel sans mentir sur l'un des deux.
export function dealAnnualValue(rdv) {
  const v = Number(rdv?.montant) || 0
  if (!v) return 0
  return rdv?.recurrence === 'mensuel' ? v * 12 : v
}
export const dealValueLabel = (rdv) => (rdv?.recurrence === 'mensuel' ? '/mois' : '')
// Valeur du pipeline OUVERT : ce qui reste à jouer, hors affaires perdues ou déjà gagnées.
export function pipelineValue(rdvs, data) {
  return (rdvs || [])
    .filter(r => !isLostPhase(data, r.phase) && !isWonPhase(data, r.phase) && r.opportunite !== 'Perdue')
    .reduce((a, r) => a + dealAnnualValue(r), 0)
}
export function wonValue(rdvs, data) {
  return (rdvs || []).filter(r => isWonPhase(data, r.phase)).reduce((a, r) => a + dealAnnualValue(r), 0)
}
// Ce que rapporte chaque provenance, à côté de ce qu'elle occupe : « l'outbound fait 60 % du
// volume et 25 % du chiffre » est un arbitrage, pas un tableau.
export function valueBySource(rdvs, data) {
  const m = {}
  ;(rdvs || []).forEach(r => {
    const k = r.provenance || r.source || '—'
    m[k] = m[k] || { source: k, count: 0, value: 0, won: 0 }
    m[k].count++
    m[k].value += dealAnnualValue(r)
    if (isWonPhase(data, r.phase)) m[k].won += dealAnnualValue(r)
  })
  return Object.values(m).sort((a, b) => b.value - a.value)
}

// ---------------------------------------------------------------- Challenges (module `challenges`)
// Un concours n'a de valeur que s'il a une fin : « le plus de SQL » sans date ne motive
// personne, c'est le classement permanent. Un challenge porte donc toujours des bornes, et
// disparaît de lui-même quand elles sont passées.
export const CHALLENGE_MODES = [
  { id: 'course', label: 'Le meilleur score gagne' },
  { id: 'objectif', label: 'Premier à atteindre la cible' },
]
export const envChallenges = (env) => (env?.challenges || [])
export const challengeIsActive = (ch, day = todayISO()) => !!ch && ch.start <= day && day <= ch.end
// Score d'une personne sur la fenêtre du challenge. Les mêmes définitions que les quotas —
// deux façons de compter un SQL dans la même app, et plus personne ne fait confiance au chiffre.
export function challengeScore(data, metric, start, end) {
  const on = (d) => !!d && d >= start && d <= end
  const rdvs = data?.rdvs || []
  switch (metric) {
    case 'rdvPris': return rdvs.filter(r => on(r.datePriseRdv)).length
    case 'rdvTenus': return rdvs.filter(r => on(r.dateRdv) && !String(r.opportunite || '').startsWith('No Show')).length
    case 'sql': return rdvs.filter(r => on(r.datePassageSQL)).length
    case 'signatures': return rdvs.filter(r => isWonPhase(data, r.phase) && on(r.datePassageSQL || r.dateRdv)).length
    case 'primes': return computePrimes(rdvs, data?.bareme || [], primeOpts(data))
      .filter(p => !p.invalidated && on(p.triggerDate)).reduce((a, p) => a + p.montant, 0)
    default: return 0
  }
}

// ---------------------------------------------------------------- Modulation des primes
// Le barème était strictement linéaire : tant de leads, tant d'euros. Les vraies politiques de
// variable ont trois leviers de plus — un seuil de déclenchement, un accélérateur au-delà du
// quota, un plafond — et parfois une pondération par la qualité des leads.
// ⚠️ RIEN N'EST IMPOSÉ. L'ensemble est désactivé par défaut et le reste tant qu'un manager ne
// l'active pas : ces règles changent des montants versés, ce n'est pas au produit d'en décider.
export const DEFAULT_PRIME_RULES = () => ({
  on: false,
  refMetric: 'sql',                                   // sur quoi se mesure l'atteinte du quota
  threshold: { on: false, pct: 70 },                  // rien avant N % du quota
  accelerator: { on: false, fromPct: 100, factor: 1.5 }, // au-delà de N %, × facteur
  cap: { on: false, amount: 0 },                      // plafond mensuel
  quality: { on: false, minRate: 70, factor: 0.8 },   // sous N % d'acceptation, × facteur
})
export const primeRules = (data) => ({ ...DEFAULT_PRIME_RULES(), ...(data?.primeRules || {}) })

// Bornes d'un mois de paiement (« 2026-09 » → 1er au 30 septembre).
export function monthBounds(mKey) {
  const [y, m] = String(mKey || '').split('-').map(Number)
  if (!y || !m) return null
  const last = new Date(y, m, 0).getDate()
  return { start: `${mKey}-01`, end: `${mKey}-${String(last).padStart(2, '0')}`, mid: new Date(y, m - 1, 15) }
}

// Applique les modulateurs au total brut d'un mois. Renvoie le total ajusté ET le détail des
// étapes : un montant modifié sans explication est un litige qui arrive.
export function applyPrimeRules(rawTotal, { data, env, subId, monthKey }) {
  const rules = primeRules(data)
  if (!rules.on) return { total: rawTotal, steps: [], reference: null }
  const b = monthBounds(monthKey)
  const steps = []
  let total = rawTotal

  // Atteinte du quota sur le mois considéré. Sans quota posé, seuil et accélérateur n'ont
  // aucune assise : on les laisse de côté plutôt que d'inventer une base de calcul.
  let reference = null
  if (b && env) {
    const q = memberQuota(env, subId, rules.refMetric, b.mid)
    if (q.target > 0) {
      const done = challengeScore(data, rules.refMetric, b.start, b.end)
      reference = { done, target: q.target, pct: Math.round((done / q.target) * 100), metric: rules.refMetric }
    }
  }

  if (rules.threshold?.on && reference && reference.pct < Number(rules.threshold.pct || 0)) {
    steps.push({ label: `Seuil non atteint (${reference.pct} % < ${rules.threshold.pct} % du quota)`, from: total, to: 0 })
    total = 0
  }
  if (total > 0 && rules.accelerator?.on && reference && reference.pct >= Number(rules.accelerator.fromPct || 100)) {
    const f = Number(rules.accelerator.factor) || 1
    steps.push({ label: `Accélérateur × ${f} (${reference.pct} % du quota)`, from: total, to: total * f })
    total *= f
  }
  if (total > 0 && rules.quality?.on && b) {
    const rdvs = (data?.rdvs || []).filter(r => {
      const d = r.datePassageSQL || r.datePriseRdv
      return d && d >= b.start && d <= b.end
    })
    const st = handoffStats(rdvs, data)
    // Sans dossier tranché, aucune qualité mesurée : on ne pénalise pas une absence de donnée.
    if (st.rate !== null && st.rate < Number(rules.quality.minRate || 0)) {
      const f = Number(rules.quality.factor) || 1
      steps.push({ label: `Qualité des leads ${st.rate} % (< ${rules.quality.minRate} %) → × ${f}`, from: total, to: total * f })
      total *= f
    }
  }
  if (rules.cap?.on && Number(rules.cap.amount) > 0 && total > Number(rules.cap.amount)) {
    steps.push({ label: `Plafond mensuel ${Number(rules.cap.amount)}`, from: total, to: Number(rules.cap.amount) })
    total = Number(rules.cap.amount)
  }
  return { total: Math.round(total), steps, reference }
}

// Primes RÉELLEMENT VERSÉES sur un mois : le barème, puis les modulateurs. C'est ce montant
// que le collaborateur touche, donc celui qu'affichent son tableau de bord, son quota, le
// classement et son relevé. Le brut du barème ne vaut que comme étape de calcul — l'afficher
// à côté du net, sans le dire, revient à annoncer deux salaires différents.
// ---------------------------------------------------------------- À qui revient une prime
// Par défaut, la prime d'une affaire revient à l'espace qui la porte — c'est-à-dire au compte
// qui a demandé la passation. C'est la règle, et elle reste la règle : `rdv.primeTo` est vide
// dans l'immense majorité des cas.
//
// Elle ne suffit pourtant pas toujours : un lead sourcé par un collègue, une affaire reprise
// en cours de route, un binôme convenu à l'avance. Sans moyen de le dire, la seule issue était
// de corriger à la main, hors de l'outil — donc sans trace.
//
// ⚠️ RIEN NE SE CRÉE ET RIEN NE SE PERD : une prime réattribuée QUITTE le total de son espace
// d'origine et ENTRE dans celui du bénéficiaire. Le total de l'environnement est inchangé.
// C'est l'invariant que vérifie `npm run audit` — sans lui, réattribuer reviendrait à payer
// deux fois, ou à ne payer personne.
export function effectivePrimeRdvs(allData, subenvs, subId) {
  const own = (allData?.[subId]?.rdvs) || []
  const envId = (subenvs || []).find(s => s.id === subId)?.envId
  const kept = own.filter(r => !r.primeTo || r.primeTo === subId)
  if (!envId) return kept
  const incoming = []
  ;(subenvs || []).forEach(s => {
    if (s.id === subId || s.envId !== envId) return
    ;((allData?.[s.id]?.rdvs) || []).forEach(r => { if (r.primeTo === subId) incoming.push(r) })
  })
  return incoming.length ? [...kept, ...incoming] : kept
}

/**
 * L'espace tel que les CALCULS DE PRIME doivent le voir : ses données, mais avec la liste
 * d'affaires corrigée des réattributions. Tous les écrans qui annoncent un montant passent
 * par ici — sinon deux d'entre eux annonceraient des chiffres différents pour la même paie.
 */
export const primeView = (db, subId) => ({
  ...(db?.data?.[subId] || {}),
  rdvs: effectivePrimeRdvs(db?.data, db?.subenvs, subId),
})

export function monthlyPaidPrimes(data, env, subId, mKey) {
  const raw = computePrimes(data?.rdvs || [], data?.bareme || [], primeOpts(data))
    .filter(p => !p.invalidated && p.payMonthKey === mKey)
    .reduce((a, p) => a + p.montant, 0)
  return applyPrimeRules(raw, { data, env, subId, monthKey: mKey }).total
}

// ---------------------------------------------------------------- Relevés de primes (module `statements`)
// Les litiges sur la variable coûtent des heures de management chaque mois, faute d'un document
// que les deux parties reconnaissent. Le relevé en est un : figé à la signature, opposable.
// ⚠️ Le contenu est GELÉ au moment de la signature. Si le relevé se recalculait après coup, un
// document signé pourrait changer sans que personne ne s'en aperçoive — c'est exactement ce
// qu'un relevé est censé empêcher.
// ---------------------------------------------------------------- Délivrance du relevé
// Deux façons d'obtenir son relevé, réglées par environnement :
//  · `onRequest` : le salarié le demande. Convient aux équipes où tout le monde ne le veut pas.
//  · `automatic` : la demande est ouverte pour tout le monde, chaque mois, sans rien réclamer.
//
// ⚠️ Dans les DEUX cas, le manager SIGNE. « Automatique » automatise la demande et la
// remise, jamais la signature : celle-ci s'accompagne d'une confirmation explicite de la
// véracité des montants, et la signer sans la lire ferait de cette confirmation un mensonge
// — c'est-à-dire retirerait au document la seule chose qui en fait une preuve.
export const STATEMENT_MODES = [
  { id: 'onRequest', label: 'À la demande du salarié', desc: "Le collaborateur demande son relevé ; le manager est prévenu et le signe." },
  { id: 'automatic', label: 'Automatique chaque mois', desc: "La demande est ouverte pour tout le monde au début de chaque mois. Le manager signe, le relevé part." },
]
export const statementMode = (env) => (env?.statementMode === 'automatic' ? 'automatic' : 'onRequest')
export const envStatementRequests = (env) => (env?.statementRequests || {})

export const statementKey = (subId, monthKey) => `${subId}|${monthKey}`
export const envStatements = (env) => (env?.statements || {})

export function buildStatement(data, env, subId, mKey) {
  const perLead = computePrimes(data?.rdvs || [], data?.bareme || [], primeOpts(data))
    .filter(p => !p.invalidated && p.payMonthKey === mKey)
    .map(p => ({ label: p.entreprise || 'Lead', detail: [p.source, p.effectif ? `${p.effectif} salariés` : ''].filter(Boolean).join(' · '), montant: p.montant, date: p.triggerDate }))
  const perActivity = computeActivityPrimes(data?.rdvs || [], data?.activityRules || [])
    .filter(p => !p.invalidated && p.payMonthKey === mKey)
    // `ruleLabel` et non `label` : c'est le nom que porte une prime d'activité. Une ligne
    // intitulée « Prime d'activité » sur un relevé signé n'apprend rien à qui le relit.
    .map(p => ({ label: p.ruleLabel || "Prime d'activité", detail: p.periodLabel || '', montant: p.montant, date: p.triggerDate }))
  const lines = [...perLead, ...perActivity].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const raw = lines.reduce((a, l) => a + l.montant, 0)
  const mod = applyPrimeRules(raw, { data, env, subId, monthKey: mKey })
  return { subId, monthKey: mKey, lines, raw, steps: mod.steps, total: mod.total, currency: data?.currency || 'EUR' }
}

// ---------------------------------------------------------------- Comité d'achat (module `committee`)
// En B2B, l'affaire ne se perd presque jamais faute d'arguments : elle se perd parce qu'une
// seule personne portait le sujet en interne. On qualifie donc chaque interlocuteur — son rôle
// dans la décision, et où en est la relation avec lui.
// Le vocabulaire appartient au STAFF, pas au commercial : il varie d'un secteur à l'autre et
// doit rester cohérent dans toute l'entreprise cliente. Il vit donc sur l'environnement.
export const DEFAULT_COMMITTEE_ROLES = ['Décideur', 'Prescripteur', 'Utilisateur', 'Acheteur', 'Sponsor', 'Opposant']
export const DEFAULT_COMMITTEE_RELATIONS = ['Jamais parlé', 'Contacté', 'En relation', 'Allié']
// Rôles qui, à eux seuls, permettent de signer. Sans l'un d'eux identifié, l'affaire repose
// sur une supposition.
export const DECIDING_ROLES = ['Décideur', 'Acheteur']
export const committeeRoles = (env) => (env?.committee?.roles?.length ? env.committee.roles : DEFAULT_COMMITTEE_ROLES)
export const committeeRelations = (env) => (env?.committee?.relations?.length ? env.committee.relations : DEFAULT_COMMITTEE_RELATIONS)
// Ce qui manque à la cartographie d'un rendez-vous, ou null si elle tient debout.
// Volontairement silencieux tant que l'affaire n'a pas atteint la qualification : exiger un
// comité complet dès le premier appel n'apprendrait rien à personne.
export function committeeGaps(rdv, data, roles = DEFAULT_COMMITTEE_ROLES) {
  if (!rdv || !phaseAtLeast(data, rdv.phase, qualifyPhase(data))) return null
  const contacts = (rdv.contacts || []).filter(c => c.nom || c.email)
  const gaps = []
  if (contacts.length < 2) gaps.push('un seul interlocuteur engagé')
  const deciders = roles.filter(r => DECIDING_ROLES.includes(r))
  if (deciders.length && !contacts.some(c => deciders.includes(c.role))) gaps.push('aucun décideur identifié')
  return gaps.length ? gaps : null
}

// ---------------------------------------------------------------- Modèles de messages
// Les BDR réécrivent chaque jour les mêmes quatre messages, un peu moins bien à chaque fois.
// La bibliothèque les range avec leurs variables ; l'envoi reste manuel — on donne le texte,
// pas un automate, et rien ne dépend d'un connecteur externe.
export const MESSAGE_VARS = [
  { key: 'prenom', label: 'Prénom du contact' },
  { key: 'nom', label: 'Nom du contact' },
  { key: 'entreprise', label: "Nom de l'entreprise" },
  { key: 'poste', label: 'Poste du contact' },
  { key: 'secteur', label: "Secteur d'activité" },
  { key: 'moi', label: 'Votre nom' },
]
// Remplace {prenom}, {entreprise}… par les valeurs du contexte. Une variable sans valeur est
// laissée EN ÉVIDENCE plutôt que vidée : mieux vaut un trou visible qu'un message qui commence
// par « Bonjour , ».
export function fillTemplate(text, ctx = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => {
    const v = ctx[k]
    return v === undefined || v === null || v === '' ? `[${k}]` : String(v)
  })
}
export function defaultMessageTemplates() {
  const mk = (name, family, content) => ({ id: uid(), name, family, content, used: 0, lastUsed: '', createdAt: todayISO() })
  return [
    mk('Premier contact — froid', 'Prise de contact',
      "Bonjour {prenom},\n\nJe travaille avec des équipes {secteur} qui perdent un temps fou à recalculer les primes de leurs commerciaux à la main.\n\nChez {entreprise}, c'est un sujet ou c'est déjà réglé ?\n\n{moi}"),
    mk('Relance après silence', 'Relance',
      "Bonjour {prenom},\n\nJe reviens vers vous une dernière fois : si le sujet n'est pas d'actualité chez {entreprise}, dites-le moi simplement, je cesserai de vous solliciter.\n\nSinon, une conversation de quinze minutes suffit à voir si ça vaut le coup.\n\n{moi}"),
    mk('Après un no-show', 'Relance',
      "Bonjour {prenom},\n\nOn devait se parler aujourd'hui — je suppose que la journée a été plus chargée que prévu.\n\nJe vous propose deux créneaux : … ou … . Dites-moi ce qui vous arrange.\n\n{moi}"),
    mk('Confirmation la veille', 'Organisation',
      "Bonjour {prenom},\n\nJe confirme notre échange de demain. Vingt minutes, pour comprendre comment {entreprise} pilote le sujet aujourd'hui.\n\nÀ demain,\n{moi}"),
    mk('Réveil d\'un compte en sommeil', 'Réactivation',
      "Bonjour {prenom},\n\nOn s'était parlé il y a quelques mois : le timing n'était pas le bon chez {entreprise}. Je me permets de revenir maintenant que l'exercice a changé.\n\nToujours d'actualité de votre côté ?\n\n{moi}"),
  ]
}

// ---------------------------------------------------------------- Objections (onglet de « Mes notes »)
// Les objections d'un marché se répètent : une équipe qui les affronte pour la première fois
// à chaque appel réinvente une réponse moyenne. On les range donc par famille, avec la réponse
// que le manager valide. L'espace démarre avec les six objections que tout le monde entend —
// mieux vaut un socle discutable qu'une page vide que personne ne remplira.
export const OBJECTION_FAMILIES = ['Prix', 'Timing', 'Concurrent', 'Statu quo', 'Besoin', 'Autorité']
export function defaultObjections() {
  const mk = (family, objection, response, example) => ({
    id: uid(), family, objection, response, example, validated: false, used: 0, lastUsed: '', createdAt: todayISO(),
  })
  return [
    mk('Concurrent', 'On a déjà un outil',
      "Demander lequel, puis creuser ce qui manque plutôt que de comparer les fonctionnalités. Un outil en place ne veut pas dire un besoin couvert.",
      "« Vous êtes sur quoi aujourd'hui ? … Et sur la partie primes, comment vous faites ? »"),
    mk('Timing', 'Pas le budget cette année',
      "Viser une mise en place au prochain exercice et garder le contact tiède. Un budget refusé n'est pas un besoin refusé.",
      "« Le budget se cale quand chez vous ? On peut préparer maintenant pour démarrer en janvier. »"),
    mk('Timing', 'Rappelez-moi dans six mois',
      "Proposer une date précise, sinon la relance se perd. Et demander ce qui aura changé d'ici là : la réponse dit si l'affaire existe.",
      "« Le 12 mars, 9 h ? Et qu'est-ce qui sera différent à ce moment-là ? »"),
    mk('Prix', "C'est trop cher",
      "Ramener le prix à ce qu'il remplace ou à ce qu'il fait gagner, jamais au tarif d'un concurrent. Chercher d'abord ce que « cher » compare.",
      "« Cher par rapport à quoi ? … Un litige de prime par mois coûte combien en temps de management ? »"),
    mk('Statu quo', 'On fonctionne bien comme ça',
      "Ne pas attaquer l'existant. Faire décrire une journée type et laisser la friction apparaître d'elle-même.",
      "« Concrètement, le calcul des primes du mois, ça vous prend combien de temps ? »"),
    mk('Autorité', 'Je ne décide pas seul',
      "Bonne nouvelle : identifier qui décide et proposer de préparer l'argumentaire avec l'interlocuteur, plutôt que de le contourner.",
      "« Qui d'autre est concerné ? On peut préparer ensemble ce que vous lui présenterez. »"),
  ]
}

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
    primeCutoffDay: DEFAULT_PRIME_CUTOFF, // jour de bascule du mois de paiement
    primePhases: [...DEFAULT_PRIME_PHASES], // phases qui déclenchent une prime
    wonPhases: [...DEFAULT_WON_PHASES],     // phases signifiant « affaire gagnée »
    lostPhases: [...DEFAULT_LOST_PHASES],   // phases signifiant « affaire perdue »
    icpProfiles: [], // profils ICP enregistrés : { id, name, secteurs[], effMin, effMax, postes[], createdAt }
    primeRules: DEFAULT_PRIME_RULES(), // seuils / accélérateurs / plafonds — désactivés par défaut
    objections: defaultObjections(), // bibliothèque d'objections (onglet de « Mes notes »)
    messageTemplates: defaultMessageTemplates(), // modèles de messages (onglet de « Mes notes »)
    objectionFamilies: [...OBJECTION_FAMILIES],
    closingPhases: [...DEFAULT_CLOSING_PHASES],           // pipeline aval du closer (module `closing`)
    closingLostReasons: [...DEFAULT_CLOSING_LOST_REASONS], // pourquoi une affaire se perd APRÈS acceptation
    handoffPhases: [],       // étapes déclenchant une passation ([] = le jalon de l'espace)
    handoffReasons: [...DEFAULT_HANDOFF_REASONS], // motifs de refus proposés au closer
    primeOnAccept: false,    // ne payer la prime qu'une fois le dossier accepté (facultatif)
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

// Le ticket de fermeture d'un projet. Il ne ressemble à aucun autre : il n'est pas ouvert
// PAR le client, il lui est ADRESSÉ, et il ne nomme jamais le membre du staff qui a fermé
// l'accès — la décision est celle de BD Report, pas d'une personne qu'on prendrait à partie.
// Un seul message, du côté support : un message « bot » disparaîtrait de la conversation
// dès la première réponse d'un technicien, et le client perdrait le contexte de sa fermeture.
function makeClosureTicket({ accountId, prenom, photo, clientName, envId, envName, projectName }) {
  const now = new Date().toISOString()
  // DE QUOI PARLE-T-ON : le client et le projet, nommés en tête. Une équipe peut avoir
  // plusieurs projets chez nous, et un fil qui annonce une fermeture sans dire LAQUELLE
  // oblige à deviner — au moment précis où l'on a le moins envie de deviner.
  const head = [envName && `Client : ${envName}`, projectName && `Projet : ${projectName}`]
    .filter(Boolean).join('\n')
  return {
    id: uid(), category: PROJECT_CLOSURE_CATEGORY, status: 'open',
    priority: 'haute', assignedTo: null, csat: null,
    userAccountId: accountId || null, userName: prenom, userPhoto: photo || '',
    clientName: clientName || prenom, projectName: projectName || '', envId: envId || null, subEnvId: null,
    // Non lu POUR LE CLIENT (il ne l'a pas demandé, il doit le voir) ; déjà lu côté support,
    // qui vient précisément de le provoquer.
    createdAt: now, handledBy: null, typing: {}, readUserAt: '', readSupportAt: now,
    messages: [{
      id: uid(), ts: now, from: 'support', authorAccountId: null, authorName: 'Équipe BD Report', authorPhoto: '',
      text: (head ? head + '\n\n' : '')
        + `L'accès au logiciel BD Report a été fermé par l'équipe BD Report. Plus personne ne peut s'y connecter, et les données sont mises de côté.\n\n`
        + `Cette discussion sert à décider de la suite : remettre le projet en place, ou le supprimer définitivement. Répondez ici pour en parler avec l'équipe BD Report.`,
      photo: '',
    }],
  }
}

// Un compte a-t-il encore un environnement après ce retrait ? Quelqu'un qui travaille pour
// deux sociétés clientes ne doit pas perdre sa seconde parce que la première a été fermée.
function hasAnotherEnv(d, accId) {
  return (d.environments || []).some(e => e.createdBy === accId || (e.members || []).includes(accId))
    || (d.subenvs || []).some(s => s.ownerId === accId)
}

// ---------------------------------------------------------------- Archive d'une livraison
// UN PROJET EST LA LIVRAISON D'UN ENVIRONNEMENT : les deux partent ensemble.
// Supprimer la livraison seule laissait l'environnement derrière — vivant, accessible à
// son équipe, facturé, mais invisible depuis la console : personne ne le voyait plus,
// donc personne ne s'en occupait. Ce sont les « environnements qui se baladent ».
//
// Et le geste ne peut pas être définitif au premier clic : effacer les espaces de toute
// une équipe est l'action la plus destructrice de l'application. Tout part donc d'abord
// dans la CORBEILLE SUPPORT (30 jours), d'où l'ensemble se restaure tel quel.
export const PROJECT_CLOSURE_CATEGORY = 'Fermeture de projet'

// Suppression et restauration se départagent à la date. Deux gestes tombés dans la même
// milliseconde ne doivent pas se départager au hasard : le dernier est daté strictement
// après le précédent, pour que « la dernière action l'emporte » reste vrai à la seconde près.
const afterStamp = (iso, other) => ((other || '') >= iso ? new Date(new Date(other).getTime() + 1).toISOString() : iso)

// Retire la livraison ET son environnement de la base, en déposant tout dans la corbeille.
// Rien n'est cloné : ce qui est retiré des tableaux est justement ce qu'on range.
export function archiveDelivery(d, { envId, projectId, reason, actorId, actorName }) {
  d.supportTrash = d.supportTrash || []
  const project = projectId
    ? (d.projects || []).find(p => p.id === projectId)
    : (d.projects || []).find(p => p.sourceEnvId === envId || p.envId === envId)
  const eid = envId || project?.envId || project?.sourceEnvId || null
  const env = eid ? (d.environments || []).find(e => e.id === eid) : null
  if (!project && !env) return null
  const subenvs = eid ? (d.subenvs || []).filter(s => s.envId === eid) : []
  const spaces = {}
  subenvs.forEach(s => { if (d.data?.[s.id]) { spaces[s.id] = d.data[s.id]; delete d.data[s.id] } })
  const client = eid ? (d.clients || []).find(c => c.envId === eid || c.key === 'env:' + eid) : null
  const entry = {
    id: uid(), kind: 'project', deletedAt: new Date().toISOString(),
    deletedBy: actorName || '', deletedById: actorId || null, reason: String(reason || '').trim(),
    label: project?.name || env?.name || 'Livraison',
    data: {
      project: project || null, env: env || null, subenvs, spaces,
      clientId: client?.id || null, clientStatus: client?.status || null, ticketId: null,
    },
  }
  if (project) d.projects = (d.projects || []).filter(p => p.id !== project.id)
  if (eid) {
    d.subenvs = (d.subenvs || []).filter(s => s.envId !== eid)
    d.environments = (d.environments || []).filter(e => e.id !== eid)
    // PIERRE TOMBALE. Une suppression est un FAIT, comme un repère de semis : elle doit
    // voyager avec l'état. Sans elle, la photo périmée d'un collègue — qui contient encore
    // l'environnement — le ramenait à la synchronisation suivante, et on recommençait.
    d._envTombstones = d._envTombstones || {}
    const wasRestored = d._envTombstones[eid]?.restoredAt || ''
    d._envTombstones[eid] = { deletedAt: afterStamp(entry.deletedAt, wasRestored), restoredAt: wasRestored }
    // La FICHE CLIENT reste, devenue « ancien client » : elle porte l'histoire (tickets,
    // motifs de churn, satisfaction) qui est précisément ce qu'on veut garder d'un client
    // parti. L'effacer reviendrait à effacer la raison du départ.
    if (client) { client.status = 'anciens'; client.blocked = false }
  }
  // FERMER L'ACCÈS. Un environnement archivé dont les comptes resteraient ouverts n'est pas
  // fermé : ses membres se connecteraient dans le vide. Tous les comptes CLIENTS de cet
  // environnement sont donc désactivés — sauf ceux qui travaillent encore ailleurs, qui n'ont
  // rien à voir avec cette fermeture — et sauf LE PROPRIÉTAIRE, qui garde une porte d'entrée :
  // il ne verra plus que la discussion de fermeture. Sans lui, la décision se prendrait entre
  // BD Report et un mur.
  const memberIds = eid
    ? [...new Set([env?.createdBy, ...(env?.members || []), ...subenvs.map(s => s.ownerId)].filter(Boolean))]
    : []
  // À QUI s'adresse la fermeture. Le créateur de l'environnement fait foi — sauf quand
  // c'est un membre du staff, ce qui arrive dès qu'un environnement est monté depuis
  // l'atelier : on s'adresse alors au manager du client, à défaut au premier membre.
  // Sans interlocuteur client (environnement encore vide), le ticket reste au support seul.
  const clientMembers = memberIds
    .map(id => (d.accounts || []).find(a => a.id === id))
    .filter(a => a && isClientRole(a.role))
  const owner = clientMembers.find(a => a.id === env?.createdBy)
    || clientMembers.find(a => a.role === 'Manager')
    || clientMembers[0] || null
  const disabled = []
  memberIds.forEach(id => {
    const a = (d.accounts || []).find(x => x.id === id)
    if (!a || !isClientRole(a.role)) return          // le staff ne se ferme pas avec un client
    if (a.id === owner?.id) return
    if (hasAnotherEnv(d, id)) return                 // il lui reste une autre société
    if (a.disabled) return                           // déjà désactivé : ne pas le réactiver au retour
    a.disabled = true
    disabled.push(id)
  })
  const ticket = makeClosureTicket({
    accountId: owner?.id || null, prenom: owner?.pseudo || env?.name || 'Client',
    photo: owner?.photo || '', clientName: env?.name || project?.clientName || '',
    envId: eid, envName: env?.name || '', projectName: project?.name || '',
  })
  // Le sort du projet se décide DANS ce ticket. Ce bloc est lu par la console support
  // seulement : le nom de qui a fermé et le motif interne ne s'affichent jamais côté client.
  ticket.projectClosure = {
    envId: eid, envName: env?.name || '', trashId: entry.id,
    deletedBy: actorName || '', reason: entry.reason, decided: '',
  }
  if (owner) {
    // Sa session ne mène plus à aucun environnement : ce marqueur dit à l'application de
    // n'ouvrir QUE cette discussion. S'il travaille encore pour une autre société cliente,
    // on ne l'enferme évidemment pas — il retrouvera le fil dans son onglet Support.
    if (!hasAnotherEnv(d, owner.id)) owner.closureTicketId = ticket.id
    owner.disabled = false
  }
  entry.data.ticketId = ticket.id
  entry.data.disabledAccounts = disabled
  entry.data.ownerAccountId = owner?.id || null
  entry.data.memberAccounts = memberIds
  d.tickets = d.tickets || []
  d.tickets.unshift(ticket)
  d.supportTrash.unshift(entry)
  return entry
}

// Remet en place ce qui a été archivé. Chaque élément est reposé seulement s'il manque :
// un environnement recréé entre-temps sous le même identifiant ne doit pas être écrasé.
export function restoreDelivery(d, entry) {
  const { project, env, subenvs, spaces, clientId, clientStatus, disabledAccounts, ownerAccountId, ticketId } = entry?.data || {}
  if (env && !(d.environments || []).some(e => e.id === env.id)) d.environments.push(env)
  ;(subenvs || []).forEach(s => { if (!(d.subenvs || []).some(x => x.id === s.id)) d.subenvs.push(s) })
  Object.entries(spaces || {}).forEach(([k, v]) => { if (!d.data[k]) d.data[k] = v })
  if (project && !(d.projects || []).some(p => p.id === project.id)) { d.projects = d.projects || []; d.projects.unshift(project) }
  const c = (d.clients || []).find(x => x.id === clientId)
  if (c && clientStatus) { c.status = clientStatus; c.blocked = false }
  // La restauration est un fait aussi récent que la suppression : elle l'annule, et se
  // départage d'elle à la date — sinon la pierre tombale reviendrait effacer ce retour.
  if (env) {
    d._envTombstones = d._envTombstones || {}
    const wasDeleted = d._envTombstones[env.id]?.deletedAt || ''
    d._envTombstones[env.id] = { deletedAt: wasDeleted, restoredAt: afterStamp(new Date().toISOString(), wasDeleted) }
  }
  // « Tel quel » : chacun retrouve son accès exactement comme avant la fermeture. On ne
  // réactive QUE ce qu'on a désactivé — un compte suspendu pour une autre raison le reste.
  ;(disabledAccounts || []).forEach(id => {
    const a = (d.accounts || []).find(x => x.id === id); if (a) a.disabled = false
  })
  const owner = (d.accounts || []).find(x => x.id === ownerAccountId)
  if (owner) { delete owner.closureTicketId; owner.disabled = false }
  // La question posée par le ticket a reçu sa réponse : il se ferme avec elle.
  const tk = (d.tickets || []).find(t => t.id === ticketId)
  if (tk) {
    tk.projectClosure = { ...(tk.projectClosure || {}), decided: 'restored', decidedAt: new Date().toISOString() }
    tk.status = 'closed'
    tk.closedAt = tk.closedAt || new Date().toISOString()
  }
}

// SUPPRESSION DÉFINITIVE. L'autre issue du ticket de fermeture : il n'y a plus rien à
// restaurer. Les comptes clients qui ne vivaient QUE dans cet environnement partent avec
// lui — les laisser derrière, désactivés à jamais, garderait leurs adresses e-mail prises
// et le propriétaire devant une porte qui ne s'ouvre plus sur rien.
export function purgeDelivery(d, entry) {
  const { ownerAccountId, disabledAccounts, memberAccounts, ticketId } = entry?.data || {}
  const ids = [...new Set([...(memberAccounts || []), ...(disabledAccounts || []), ownerAccountId].filter(Boolean))]
  const removed = []
  ids.forEach(id => {
    const a = (d.accounts || []).find(x => x.id === id)
    if (!a || !isClientRole(a.role)) return
    if (hasAnotherEnv(d, id)) { delete a.closureTicketId; return } // il travaille ailleurs : il reste
    removed.push(id)
  })
  d.accounts = (d.accounts || []).filter(a => !removed.includes(a.id))
  d.supportTrash = (d.supportTrash || []).filter(t => t.id !== entry.id)
  const tk = (d.tickets || []).find(t => t.id === ticketId)
  if (tk) {
    tk.projectClosure = { ...(tk.projectClosure || {}), decided: 'purged', decidedAt: new Date().toISOString() }
    tk.status = 'closed'
    tk.closedAt = tk.closedAt || new Date().toISOString()
  }
  return removed
}

// Une pierre tombale par environnement : la plus récente des deux dates l'emporte, comme
// `_rev` départage deux versions d'un espace.
export function mergeEnvTombstones(a, b) {
  const out = {}
  const latest = (x, y) => ((x || '') > (y || '') ? (x || '') : (y || ''))
  new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(k => {
    const x = (a || {})[k] || {}, y = (b || {})[k] || {}
    out[k] = { deletedAt: latest(x.deletedAt, y.deletedAt), restoredAt: latest(x.restoredAt, y.restoredAt) }
  })
  return out
}
export const envIsDeleted = (t) => !!t && (t.deletedAt || '') > (t.restoredAt || '')

// Journal d'audit du back-office support (visible dans « Logs Support »).
// ---------------------------------------------------------------- Journal de l'équipe BD Report
// Le journal ne servait qu'à retrouver « qui a répondu à ce ticket ». Une revue de conformité
// pose d'autres questions : sur quel client cette personne travaillait-elle, à qui a-t-elle
// donné un accès, quel utilisateur a été touché. Chaque entrée porte donc désormais une
// CATÉGORIE, le client concerné et la personne concernée — sans quoi rien n'est filtrable.
export const STAFF_LOG_CATEGORIES = [
  { id: 'navigation', label: 'Navigation', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { id: 'acces', label: 'Accès & permissions', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  { id: 'client', label: 'Clients & environnements', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { id: 'support', label: 'Support & tickets', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { id: 'projet', label: 'Projets', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  { id: 'contenu', label: 'Contenu & base de connaissances', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  { id: 'donnees', label: 'Données', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
]
export const STAFF_LOG_CATEGORY_IDS = STAFF_LOG_CATEGORIES.map(c => c.id)
// Rattachement par défaut d'un ancien `type` à une catégorie : les entrées déjà écrites
// restent classables sans migration destructive.
const LOG_TYPE_CAT = {
  Ticket: 'support', Demande: 'support', Client: 'client', Abonnement: 'client',
  Projet: 'projet', Permission: 'acces', Compte: 'acces', Navigation: 'navigation',
  KB: 'contenu', Données: 'donnees', Module: 'client',
}
export const logCategoryOf = (l) => l?.cat || LOG_TYPE_CAT[l?.type] || 'support'

function pushSupportLog(d, { type, action, details = '', actorId = null, actorName = 'Système', cat, envId = null, envName = '', targetId = null, targetName = '' }) {
  d.supportLogs = d.supportLogs || []
  const category = cat || LOG_TYPE_CAT[type] || 'support'
  d.supportLogs.unshift({
    id: uid(), ts: new Date().toISOString(), type, action, details, actorId, actorName,
    cat: category, envId, envName, targetId, targetName,
  })
  // Deux plafonds, et c'est délibéré. La navigation produit beaucoup plus de lignes que les
  // actions ; un plafond unique la laisserait chasser du journal les modifications d'accès,
  // c'est-à-dire exactement ce qu'une revue vient y chercher. Elle est donc bornée à part.
  const NAV_MAX = 800
  const navs = d.supportLogs.filter(l => l.cat === 'navigation')
  if (navs.length > NAV_MAX) {
    const drop = new Set(navs.slice(NAV_MAX).map(l => l.id))
    d.supportLogs = d.supportLogs.filter(l => !drop.has(l.id))
  }
  if (d.supportLogs.length > 4000) d.supportLogs.length = 4000
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

export const DEFAULT_PRIME_PHASES = ['SQL', 'Signée']
// ---------------------------------------------------------------------------
//  Profil client idéal (ICP) — lecture partagée
//  Le calcul vivait dans la page ICP, donc il ne servait qu'à l'analyse après coup.
//  Exporté ici, il sert aussi AU MOMENT DE LA SAISIE, quand le commercial peut encore
//  décider d'investir son temps ailleurs.
// ---------------------------------------------------------------------------
export function icpMatches(deal, p, { ignoreDates = false } = {}) {
  if (p.secteurs?.length && !p.secteurs.includes(deal.secteur)) return false
  const eff = Number(deal.effectif) || 0
  if (p.effMin != null && eff < p.effMin) return false
  if (p.effMax != null && eff > p.effMax) return false
  if (p.postes?.length) {
    const postes = (deal.contacts || []).map(c => c.poste).filter(Boolean)
    if (!postes.some(po => p.postes.includes(po))) return false
  }
  if (!ignoreDates && (p.dateStart || p.dateEnd)) {
    const dd = deal.datePriseRdv || deal.dateRdv || deal.createdAt || ''
    if (!dd) return false
    if (p.dateStart && dd < p.dateStart) return false
    if (p.dateEnd && dd > p.dateEnd) return false
  }
  return true
}

// Verdict affichable pendant la saisie d'un rendez-vous. Renvoie null quand il n'y a
// rien d'utile à dire — aucun profil enregistré, ou pas encore assez de champs remplis
// pour que l'avis veuille dire quelque chose.
export function icpVerdict(deal, data) {
  const profiles = (data?.icpProfiles || []).filter(p => p.secteurs?.length || p.effMin != null || p.effMax != null || p.postes?.length)
  if (!profiles.length) return null
  const eff = Number(deal.effectif) || 0
  const postes = (deal.contacts || []).map(c => c.poste).filter(Boolean)
  if (!deal.secteur && !eff && !postes.length) return null // rien à comparer encore

  const hit = profiles.find(p => icpMatches(deal, p, { ignoreDates: true }))
  if (hit) return { level: 'match', name: hit.name || 'votre profil idéal', gaps: [] }

  // Profil le plus proche : celui dont le moins de critères s'écartent.
  let best = null
  profiles.forEach(p => {
    const gaps = []
    if (p.secteurs?.length && deal.secteur && !p.secteurs.includes(deal.secteur)) gaps.push(`secteur ${deal.secteur}`)
    if (p.effMin != null && eff && eff < p.effMin) gaps.push(`effectif sous ${p.effMin}`)
    if (p.effMax != null && eff && eff > p.effMax) gaps.push(`effectif au-dessus de ${p.effMax}`)
    if (p.postes?.length && postes.length && !postes.some(po => p.postes.includes(po))) gaps.push(`interlocuteur ${postes[0]}`)
    if (!best || gaps.length < best.gaps.length) best = { p, gaps }
  })
  if (!best || !best.gaps.length) return null // l'écart ne vient que de champs encore vides
  return { level: 'off', name: best.p.name || 'votre profil idéal', gaps: best.gaps }
}

export const DEFAULT_WON_PHASES = ['Signée']
export const DEFAULT_LOST_PHASES = ['KO']

// ---------------------------------------------------------------------------
//  Lecture SÉMANTIQUE du pipeline
//  Les écrans ont besoin de raisonner en « affaire gagnée », « lead qualifié »,
//  « étape suivante » — pas en noms d'étapes. Tant qu'ils comparaient à « SQL » ou
//  « Signée » écrits en dur, renommer une étape dans « Créer votre écosystème »
//  vidait les tableaux de bord et faisait écrire aux tâches une phase inexistante.
//  Tout passe désormais par ces fonctions, qui lisent les réglages de l'espace.
// ---------------------------------------------------------------------------
export const phaseList = (data) => (data?.phases?.length ? data.phases : DEFAULT_PHASES)
export const wonPhases = (data) => (data?.wonPhases?.length ? data.wonPhases : DEFAULT_WON_PHASES)
export const lostPhases = (data) => (data?.lostPhases?.length ? data.lostPhases : DEFAULT_LOST_PHASES)
export const primeTriggerPhases = (data) => (data?.primePhases?.length ? data.primePhases : DEFAULT_PRIME_PHASES)
export const isWonPhase = (data, p) => wonPhases(data).includes(p)
export const isLostPhase = (data, p) => lostPhases(data).includes(p)
// Rang d'une étape dans le parcours. Les étapes d'échec sortent du classement (-1) :
// elles ne sont pas « plus avancées », elles sont hors course.
export const phaseRank = (data, p) => (isLostPhase(data, p) ? -1 : phaseList(data).indexOf(p))
// « Au moins aussi avancé que » — le comparateur dont vivent tous les entonnoirs.
export const phaseAtLeast = (data, p, ref) => {
  const r = phaseRank(data, ref)
  const v = phaseRank(data, p)
  return r >= 0 && v >= r
}
// Première étape déclenchant une prime : le jalon commercial de l'espace (« SQL » par défaut).
export const milestonePhase = (data) => {
  const order = phaseList(data)
  const triggers = primeTriggerPhases(data).filter(p => order.includes(p))
  if (!triggers.length) return order[order.length - 1] || ''
  return triggers.reduce((best, p) => (order.indexOf(p) < order.indexOf(best) ? p : best), triggers[0])
}
// Étape de qualification : celle qui précède le jalon, faute de quoi l'entonnoir n'aurait
// qu'une marche entre le premier rendez-vous et la prime.
export const qualifyPhase = (data) => {
  const order = phaseList(data).filter(p => !isLostPhase(data, p))
  const i = order.indexOf(milestonePhase(data))
  return i > 0 ? order[i - 1] : order[0] || ''
}
// Probabilité qu'une affaire à cette étape atteigne le jalon. Elle était écrite en dur
// ({ R1: .25, R2: .4, MQL: .6 }) : un pipeline renommé retombait à zéro, et le
// prévisionnel comme le simulateur annonçaient 0 € sans rien expliquer. Elle se déduit
// désormais du chemin restant à parcourir — une affaire à mi-parcours vaut la moitié.
export const phaseProbability = (data, phase) => {
  const order = phaseList(data).filter(p => !isLostPhase(data, p))
  const m = order.indexOf(milestonePhase(data))
  const r = order.indexOf(phase)
  if (r < 0 || m < 0) return 0        // étape inconnue ou perdue : rien à espérer
  if (r >= m) return 1                // déjà au jalon : ce n'est plus une prévision
  return (r + 1) / (m + 1)
}

export const firstPhase = (data) => phaseList(data).filter(p => !isLostPhase(data, p))[0] || ''
// Étape suivante dans le parcours (bouton « Faire avancer »), sans jamais franchir le jalon
// tout seul : passer une affaire en prime est une décision, pas un enchaînement.
export const nextPhase = (data, p) => {
  const order = phaseList(data).filter(x => !isLostPhase(data, x))
  const i = order.indexOf(p)
  if (i < 0 || i >= order.length - 1) return null
  return order[i + 1]
}
// ============================================================ Passation au closer (module `handoff`)
// Le passage au jalon commercial (SQL par défaut) ne prouve rien à lui seul : c'est le closer
// qui sait si le lead était réellement travaillable. On matérialise donc la remise du dossier —
// en attente, accepté, ou refusé avec un motif. Le taux d'acceptation devient la mesure de
// qualité d'un BDR, et les motifs de refus alimentent le coaching.
export const DEFAULT_HANDOFF_REASONS = [
  'Hors cible', 'Pas de budget', 'Mauvais interlocuteur', 'Doublon', 'Trop tôt', 'Informations insuffisantes',
]
// Étapes qui déclenchent une passation. Par défaut le jalon de l'espace : c'est là que le
// dossier change de mains, et c'est aussi ce qui déclenche la prime.
export const handoffPhases = (data) => {
  const list = (data?.handoffPhases || []).filter(p => phaseList(data).includes(p))
  return list.length ? list : [milestonePhase(data)].filter(Boolean)
}
// Un dossier est concerné dès qu'il ATTEINT l'étape de passation — et le reste ensuite :
// une affaire signée est passée par le closer, elle ne doit pas disparaître du suivi sous
// prétexte qu'elle a avancé depuis.
export const rdvNeedsHandoff = (rdv, data) => {
  if (!rdv) return false
  // Un dossier DÉJÀ remis le reste, quoi qu'il devienne ensuite. Sans cette ligne, une affaire
  // acceptée puis perdue disparaissait de la file et du taux d'acceptation : le BDR voyait son
  // taux baisser parce qu'une affaire était morte APRÈS que le closer l'ait acceptée, ce qui
  // n'a aucun rapport avec la qualité du lead qu'il avait transmis.
  if (rdv.handoff) return true
  if (!rdv.phase) return false
  return handoffPhases(data).some(p => rdv.phase === p || phaseAtLeast(data, rdv.phase, p))
}
// État de la passation d'un rendez-vous, ou null s'il n'est pas encore concerné.
// Un dossier arrivé au jalon sans enregistrement de passation est « en attente » : c'est
// bien ce qu'il est, et cela peuple la file dès l'activation du module.
export const handoffState = (rdv, data) => (rdvNeedsHandoff(rdv, data) ? (rdv?.handoff?.state || 'pending') : null)
// Qui a le droit de trancher. L'ordre compte, il décrit une chaîne de responsabilité :
//   1. le manager de l'environnement — sur tous les dossiers, Y COMPRIS LES SIENS. Refuser
//      qu'il close ses propres affaires bloquerait une équipe où il vend aussi ;
//   2. faute de manager, le propriétaire de l'environnement : quelqu'un doit pouvoir trancher ;
//   3. à défaut, les personnes ou les services à qui le staff a délégué ce droit.
export const envClosers = (env) => ({
  subIds: [...(env?.closers?.subIds || [])],
  serviceIds: [...(env?.closers?.serviceIds || [])],
})
export function envHasManager(db, envId) {
  return db.subenvs.filter(s => s.envId === envId).some(s => {
    const a = db.accounts.find(x => x.id === s.ownerId)
    return a && (a.role === 'Manager' || a.role === 'Administrateur')
  })
}
export const HANDOFF_STATES = {
  pending: { label: 'En attente', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  accepted: { label: 'Accepté', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  refused: { label: 'Refusé', chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
}
// Taux d'acceptation d'un jeu de rendez-vous — les dossiers encore en attente ne comptent
// dans aucun des deux camps : un lead non traité n'est ni bon ni mauvais.
export function handoffStats(rdvs, data) {
  let pending = 0, accepted = 0, refused = 0
  ;(rdvs || []).forEach(r => {
    const s = handoffState(r, data)
    if (s === 'pending') pending++
    else if (s === 'accepted') accepted++
    else if (s === 'refused') refused++
  })
  const decided = accepted + refused
  return { pending, accepted, refused, decided, rate: decided ? Math.round((accepted / decided) * 100) : null }
}

// Options de calcul des primes d'un espace, en un seul endroit. Elles étaient recopiées à la
// main sur chaque appel — et deux écrans les avaient oubliées, ignorant en silence le
// paramétrage de « Créer votre écosystème ».
export const primeOpts = (data) => ({
  triggerPhases: data?.primePhases,
  cutoffDay: data?.primeCutoffDay,
  requireAccepted: !!data?.primeOnAccept,
  data,
})

export function computePrimes(rdvs, bareme, opts = {}) {
  const triggers = opts.triggerPhases?.length ? opts.triggerPhases : DEFAULT_PRIME_PHASES
  const cutoff = opts.cutoffDay || DEFAULT_PRIME_CUTOFF
  // Une prime par RDV (racine ou sous-RDV) dont la phase déclenche le calcul,
  // déclenchée à la date de passage en SQL (fallback : date de prise de RDV).
  // Si une prime a été figée au passage en SQL (snapshot), c'est elle qui fait foi.
  const primes = []
  rdvs.forEach(r => {
    if (!triggers.includes(r.phase)) return
    // Option « prime à l'acceptation » : tant que le closer n'a pas pris le dossier, la prime
    // n'est pas due. Volontairement désactivée par défaut — c'est un choix de rémunération,
    // pas une règle du produit.
    if (opts.requireAccepted && r.handoff?.state !== 'accepted') return
    const trigger = r.datePassageSQL || r.datePriseRdv || r.dateRdv || r.createdAt
    const snap = r.primeSnapshot
    const row = snap ? null : baremeMatch(bareme, r.effectif, r.source)
    if (!snap && !row) return
    const payMonth = primePaymentMonth(trigger, cutoff)
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

// `brand.company` remplace le nom de l'environnement fictif : en rendez-vous, la démo
// porte le nom de l'entreprise du prospect, qui se voit chez lui plutôt que chez « Atlas
// Revenue ». Rien d'autre n'est touché — les données restent entièrement inventées.
// Montants de démonstration. Un mélange de contrats ponctuels et d'abonnements mensuels, et
// quelques affaires sans montant : le champ est facultatif, l'écran doit le montrer.
// Affaires en closing : le pipeline aval doit être peuplé, avec des signées et des perdues,
// sinon l'écran ne montre qu'un kanban vide.
function seedDemoClosing(d) {
  const phases = DEFAULT_CLOSING_PHASES
  const reasons = ['Prix', 'Concurrent retenu', 'Pas de décision']
  let i = 0
  ;(d.rdvs || []).forEach(r => {
    if (r.handoff?.state !== 'accepted') return
    const n = i++
    if (isWonPhase(d, r.phase)) { r.closing = { phase: phases[phases.length - 1], wonAt: new Date(Date.now() - n * 86400000).toISOString(), by: 'Chloé Nguyen' }; return }
    if (isLostPhase(d, r.phase)) { r.closing = { phase: phases[1], lostAt: new Date(Date.now() - n * 86400000).toISOString(), lostReason: reasons[n % reasons.length], by: 'Chloé Nguyen' }; return }
    r.closing = { phase: phases[n % phases.length], by: 'Chloé Nguyen', at: new Date(Date.now() - n * 86400000).toISOString() }
  })
  // Une affaire perdue APRÈS acceptation : le lead était bon, l'affaire s'est jouée au closing.
  // Ce cas ne peut pas naître tout seul du semis — un KO n'atteint jamais le closer — et c'est
  // pourtant celui qui distingue un mauvais lead d'une négociation ratée.
  const open = (d.rdvs || []).find(r => r.handoff?.state === 'accepted' && !isWonPhase(d, r.phase) && !isLostPhase(d, r.phase))
  if (open) {
    const lostPhase = lostPhases(d)[0]
    if (lostPhase) {
      open.phase = lostPhase
      open.opportunite = 'Perdue'
      open.motifKo = 'Concurrent retenu'
      open.closing = { phase: phases[1], lostAt: new Date(Date.now() - 6 * 86400000).toISOString(), lostReason: 'Concurrent retenu', by: 'Chloé Nguyen' }
    }
  }
}

function seedDemoValues(d) {
  const grid = [12000, 4500, 28000, 900, 36000, 7500, 15000, 2400]
  let i = 0
  ;(d.rdvs || []).forEach(r => {
    const n = i++
    if (n % 6 === 5) return // une affaire sur six reste sans montant chiffré
    const monthly = n % 3 === 1
    r.montant = monthly ? Math.round(grid[n % grid.length] / 12 / 50) * 50 : grid[n % grid.length]
    r.recurrence = monthly ? 'mensuel' : 'oneshot'
  })
}

// Comités d'achat de démonstration. Les affaires avancées sont cartographiées à plusieurs
// personnes ; deux dossiers restent volontairement mono-interlocuteur pour que l'alerte de
// multithreading soit visible — c'est elle qu'on veut montrer, pas un tableau parfait.
function seedDemoCommittee(d) {
  const roles = ['Décideur', 'Prescripteur', 'Utilisateur', 'Sponsor']
  const relations = ['Allié', 'En relation', 'Contacté']
  const seconds = [
    ['Nathalie Vidal', 'Responsable des opérations'], ['Olivier Rey', 'Directeur financier'],
    ['Karim Aziz', 'Responsable SI'], ['Julie Renard', 'Responsable formation'],
  ]
  let n = 0
  ;(d.rdvs || []).forEach(r => {
    if (!phaseAtLeast(d, r.phase, qualifyPhase(d))) return
    const i = n++
    if (i % 5 === 4) return // un dossier sur cinq reste seul : l'alerte doit exister
    r.contacts = r.contacts || []
    if (r.contacts[0]) { r.contacts[0].role = roles[i % 2]; r.contacts[0].relation = relations[i % relations.length] }
    if (r.contacts.length < 2) {
      const [nom, poste] = seconds[i % seconds.length]
      r.contacts.push({ id: uid(), nom, poste, email: '', tel: '', role: roles[(i % 2) ? 0 : 2], relation: relations[(i + 1) % relations.length] })
    }
  })
}

// Passations de démonstration. Une file uniformément verte ne montrerait rien : on veut les
// trois états, avec des motifs de refus qui ressemblent à ceux qu'un closer écrit vraiment.
function seedDemoHandoffs(d) {
  const closers = ['Chloé Nguyen', 'Lucas Fabre']
  const reasons = ['Hors cible', 'Pas de budget', 'Mauvais interlocuteur']
  let i = 0
  ;(d.rdvs || []).forEach(r => {
    if (!rdvNeedsHandoff(r, d)) return
    const n = i++
    const at = new Date(Date.now() - (3 + n) * 86400000).toISOString()
    if (n % 4 === 3) { r.handoff = { state: 'pending', to: '', at, decidedAt: '', decidedBy: '', reason: '' }; return }
    const refused = n % 5 === 1
    r.handoff = {
      state: refused ? 'refused' : 'accepted', to: '', at,
      decidedAt: new Date(Date.now() - (2 + n) * 86400000).toISOString(),
      decidedBy: closers[n % closers.length],
      reason: refused ? reasons[n % reasons.length] : '',
    }
  })
}

export function buildDemoDb(brand) {
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
    id: 'env-demo', name: String(brand?.company || '').trim() || 'Atlas Revenue', logo: '', pin: '', plan: 'beta', createdBy: 'demo-mgr', subState: 'active',
    departments: ['Sales', 'SDR'], services: [{ id: svcSales, name: 'Sales' }, { id: svcSdr, name: 'SDR' }],
    // La démo montre le produit ENTIER : toutes les briques allumées, explicitement — sans
    // quoi la migration éteindrait chez elle la deuxième série, qui est justement la nouveauté.
    modules: defaultEnvModules(),
    // Quotas de démonstration : une équipe au régime commun, et une arrivée récente en
    // montée en charge — c'est ce cas-là qu'il faut montrer, pas un tableau uniforme.
    quotas: {
      period: 'mois', metrics: ['rdvPris', 'sql', 'primes'], ramp: [40, 70, 100],
      defaults: { rdvPris: 40, rdvTenus: 30, sql: 8, signatures: 3, primes: 2000 },
      byMember: {
        'dsub-b1': { targets: { sql: 12, primes: 3000 }, startDate: '' },
        'dsub-b4': { targets: {}, startDate: new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10) },
      },
    },
    // Un challenge en cours (visible sur le tableau de bord de chacun) et un terminé, pour
    // que le palmarès et le bandeau soient tous les deux montrables.
    challenges: [
      { id: 'chal-demo-1', title: 'Sprint qualification', metric: 'sql', mode: 'course', target: 5,
        reward: 'Déjeuner offert par la direction',
        start: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10),
        end: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
      { id: 'chal-demo-2', title: 'Course aux RDV du mois dernier', metric: 'rdvPris', mode: 'objectif', target: 15,
        reward: 'Une demi-journée de congé',
        start: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
        end: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10),
        createdAt: new Date(Date.now() - 45 * 86400000).toISOString() },
    ],
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
    seedDemoValues(d)
    seedDemoCommittee(d)
    seedDemoHandoffs(d)
    seedDemoClosing(d)
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
    ['Orbe Digital', 'SaaS', 180, 'Marc Villard', 'COO'], ['Fonderie Berthin', 'Industrie', 640, 'Claire Nogent', 'DRH'],
    ['Aubrac Distribution', 'Retail', 410, 'Yann Ferrand', 'Directeur régional'], ['Lumen Santé', 'Santé', 260, 'Sofia Ranieri', 'DRH'],
    ['Cap Horizon', 'Conseil', 75, 'Bruno Kessler', 'Associé'],
  ], [
    { phase: 'SQL', opp: 'Gagnée', sql: 6, source: 'Outbound', prov: 'Cold Call' }, { phase: 'MQL', opp: 'En cours', source: 'Inbound', prov: 'Site Web' },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'A annulé', source: 'Outbound', prov: 'LinkedIn' }, { phase: 'Signée', opp: 'Signée', sql: 20, source: 'Event', prov: 'Salon' },
    { phase: 'KO', opp: 'Perdue', motifKo: 'Pas de budget', source: 'Outbound' }, { phase: 'SQL', opp: 'Gagnée', sql: 3, source: 'Partner', prov: 'Référence client' },
    { phase: 'R2', opp: 'En cours', source: 'Inbound' }, { phase: 'R1', opp: 'En cours', source: 'Outbound', prise: 3, rdv: -2 },
    { phase: 'R1', opp: 'No Show R1', motifNoShow: 'A oublié', source: 'Inbound', prise: 5, rdv: -4 },
    { phase: 'MQL', opp: 'En cours', source: 'Emailing', prov: 'Séquence email' },
    { phase: 'SQL', opp: 'Gagnée', sql: 9, source: 'Inbound', prov: 'Site Web' },
    // Trois mois d'antériorité : un commercial en poste depuis un trimestre a un
    // historique de primes, et le graphique de suivi doit le montrer.
    { phase: 'Signée', opp: 'Signée', sql: 38, prise: 62, rdv: 44, source: 'Outbound', prov: 'Cold Call' },
    { phase: 'SQL', opp: 'Gagnée', sql: 52, prise: 74, rdv: 58, source: 'Inbound', prov: 'Site Web' },
    { phase: 'SQL', opp: 'Gagnée', sql: 66, prise: 88, rdv: 72, source: 'Event', prov: 'Salon' },
    { phase: 'Signée', opp: 'Signée', sql: 81, prise: 104, rdv: 87, source: 'Outbound', prov: 'LinkedIn' },
    { phase: 'SQL', opp: 'Gagnée', sql: 95, prise: 118, rdv: 101, source: 'Partner', prov: 'Référence client' },
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

  // Un 1:1 déjà entamé : un dossier vide ne montrerait ni le fil, ni le compte rendu, ni le
  // suivi des engagements — c'est-à-dire rien de ce qui fait l'intérêt de la brique.
  const o2o = (out.channels || []).find(c => c.oneToOne?.memberSubId === 'dsub-b2')
  if (o2o) {
    const ago = (h) => new Date(Date.now() - h * 3600000).toISOString()
    out.channelMessages = out.channelMessages || {}
    out.channelMessages[o2o.id] = [
      { id: uid(), ts: ago(30 * 24), authorId: null, authorSubId: 'dsub-mgr', authorName: 'Chloé Nguyen', authorPhoto: '', text: '', reactions: {},
        report: {
          date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          points: "Deux no-show cette semaine, tous les deux sur des RDV pris plus de trois semaines à l'avance. Bonne dynamique sur l'inbound.",
          axis: 'Confirmer chaque RDV la veille, par écrit.',
          engagements: [
            { id: uid(), text: 'Mettre en place une relance de confirmation J-1', done: true },
            { id: uid(), text: 'Reprendre les 4 comptes recyclés de juin', done: false },
          ],
          snapshot: { period: 'mois', metrics: { rdvPris: { done: 31, target: 40 }, sql: { done: 6, target: 8 }, primes: { done: 1400, target: 2000 } } },
        } },
      { id: uid(), ts: ago(29 * 24), authorId: null, authorSubId: 'dsub-b2', authorName: 'Sara Ben Ali', authorPhoto: '', reactions: {},
        text: "C'est en place depuis lundi, je confirme la veille par message. Un no-show évité déjà cette semaine." },
      { id: uid(), ts: ago(5 * 24), authorId: null, authorSubId: 'dsub-mgr', authorName: 'Chloé Nguyen', authorPhoto: '', reactions: {},
        text: 'Très bien. On refait le point vendredi, avec les chiffres du mois.' },
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

    // Récapitulatif hebdomadaire. Les événements ci-dessus disent ce qui s'est passé, un à
    // un ; le récapitulatif dit ce que la semaine a donné — et surtout ce qui n'a PAS bougé,
    // qu'aucun événement ne peut signaler puisque, justement, il ne s'est rien passé.
    if (envModuleOn(db.environments.find(e => e.id === ch.envId), 'weeklyDigest')) {
      // Bornées aux quatre dernières semaines : allumer la brique ne doit pas déverser un
      // an de récapitulatifs dans le canal.
      weeklyDigestWeeks(4).forEach(({ key, start, end }) => {
        const text = buildWeeklyDigest(db, ch.envId, start, end)
        if (text) mark('digest:' + key, text, end)
      })
    }
  })
  return changed
}

// Les quatre dernières semaines ACHEVÉES, la plus ancienne d'abord. On ne récapitule pas la
// semaine en cours : un bilan à mi-parcours n'est pas un bilan.
function weeklyDigestWeeks(n) {
  const out = []
  const monday = startOfWeek(new Date())
  for (let i = n; i >= 1; i--) {
    const start = new Date(monday); start.setDate(start.getDate() - 7 * i)
    const end = new Date(start); end.setDate(end.getDate() + 6)
    const { year, week } = isoWeekParts(start)
    out.push({ key: `${year}-S${String(week).padStart(2, '0')}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) })
  }
  return out
}

/**
 * Le bilan d'une semaine pour un environnement. Rend `null` quand il n'y a rien à dire :
 * un canal qui poste « 0 partout » toutes les semaines finit par ne plus être lu.
 */
export function buildWeeklyDigest(db, envId, startISO, endISO) {
  const env = (db.environments || []).find(e => e.id === envId)
  const subs = (db.subenvs || []).filter(s => s.envId === envId)
  const inWeek = (d) => !!d && d >= startISO && d <= endISO
  const lines = []
  let totalPris = 0, totalSql = 0, totalWon = 0
  const behind = [], silent = []

  subs.forEach(sub => {
    const data = db.data?.[sub.id]; if (!data) return
    const name = `${sub.prenom || ''} ${sub.nom || ''}`.trim() || 'Membre'
    const rdvs = data.rdvs || []
    const pris = rdvs.filter(r => inWeek(r.datePriseRdv)).length
    const sql = rdvs.filter(r => inWeek(r.datePassageSQL)).length
    const won = rdvs.filter(r => isWonPhase(data, r.phase) && inWeek(r.datePassageSQL || r.dateRdv)).length
    totalPris += pris; totalSql += sql; totalWon += won
    if (pris === 0 && sql === 0) silent.push(name)
    else lines.push(`• ${name} : ${pris} RDV pris, ${sql} qualifié(s)${won ? `, ${won} signature(s)` : ''}`)
    // Sous quota : on ne le dit que si un quota EXISTE. Reprocher un retard sur une cible
    // que personne n'a fixée serait une accusation sans objet.
    const q = memberQuota(env, sub.id, 'rdvPris')
    if (q.target > 0 && quotaAchieved(data, 'rdvPris', envQuotas(env).period, new Date(endISO), { env, subId: sub.id }) < q.target) {
      behind.push(name)
    }
  })

  // Ce qui stagne : des affaires ouvertes sans le moindre mouvement depuis trois semaines.
  const stale = []
  subs.forEach(sub => {
    const data = db.data?.[sub.id]; if (!data) return
    ;(data.rdvs || []).filter(r => r.opportunite === 'En cours').forEach(r => {
      const h = r.history || []
      const last = (h.length ? h[h.length - 1].date : '') || r.datePriseRdv || ''
      if (last && last < addDaysISO(startISO, -14)) stale.push(r.entreprise || 'Affaire')
    })
  })

  if (!totalPris && !totalSql && !totalWon && !stale.length) return null
  const parts = [
    `📅 Semaine du ${fmtReportD(startISO)} au ${fmtReportD(endISO)}`,
    `${totalPris} RDV pris · ${totalSql} qualifié(s) · ${totalWon} signature(s)`,
  ]
  if (lines.length) parts.push(lines.join('\n'))
  if (silent.length) parts.push(`⚪ Sans activité cette semaine : ${silent.join(', ')}`)
  if (behind.length) parts.push(`⚠️ Sous quota : ${behind.join(', ')}`)
  if (stale.length) parts.push(`💤 Sans mouvement depuis 3 semaines : ${[...new Set(stale)].slice(0, 8).join(', ')}${stale.length > 8 ? '…' : ''}`)
  return parts.join('\n')
}

// Crée automatiquement (une seule fois, respecte les suppressions) un canal « Général » par
// environnement (tous les profils) et un canal « Bloc notes » personnel par personne.
// ---------------------------------------------------------------- Entretiens 1:1 (module `oneToOne`)
// Un 1:1 sans historique se répète ; avec historique, il progresse. Le fil vit dans les
// Conversations — c'est là qu'on écrit à quelqu'un — mais il porte en plus des comptes rendus
// structurés : ce qui a été dit, ce qui a été promis, et les chiffres de la personne CE JOUR-LÀ.
// Sans les chiffres figés, relire un 1:1 d'il y a trois mois ne dit plus rien.
export function managerSubOf(db, sub) {
  const acc = (db.accounts || []).find(a => a.id === sub?.ownerId)
  if (!acc?.teamOf) return null
  return (db.subenvs || []).find(s => s.envId === sub.envId && s.ownerId === acc.teamOf) || null
}
function seedOneToOneChannels(db) {
  db._autoSeed = db._autoSeed || {}
  // Suivi par paire : un 1:1 supprimé ne doit pas repousser au chargement suivant.
  db._autoSeed.oneToOne = db._autoSeed.oneToOne || []
  db.channels = db.channels || []
  const now = new Date().toISOString()
  ;(db.subenvs || []).forEach(sub => {
    const env = (db.environments || []).find(e => e.id === sub.envId)
    if (!env || !envModuleOn(env, 'oneToOne')) return
    const mgr = managerSubOf(db, sub)
    if (!mgr || mgr.id === sub.id) return
    const key = `${env.id}:${mgr.id}>${sub.id}`
    if (db._autoSeed.oneToOne.includes(key)) return
    // Changement de manager : l'ancien fil est ARCHIVÉ, jamais supprimé. Effacer détruirait
    // l'historique des entretiens — engagements pris, axes de progrès — qui est précisément
    // ce qui fait la valeur d'un 1:1. Le laisser passer pour un fil actif tromperait les deux
    // interlocuteurs sur qui encadre qui aujourd'hui.
    db.channels.forEach(c => {
      if (c.oneToOne?.memberSubId === sub.id && c.oneToOne.managerSubId !== mgr.id && !c.archived) {
        c.archived = true
        if (!/ancien binôme/.test(c.name || '')) c.name = `${c.name} — ancien binôme`
      }
    })
    db.channels.push({
      id: uid(), scope: 'team', envId: env.id,
      name: `1:1 · ${`${sub.prenom} ${sub.nom}`.trim()}`,
      kind: 'chat', access: 'members', members: [mgr.id, sub.id], services: [], reporting: null,
      oneToOne: { memberSubId: sub.id, managerSubId: mgr.id },
      createdBy: mgr.ownerId || null, _seen: {}, createdAt: now,
    })
    db._autoSeed.oneToOne.push(key)
  })
}

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

// Exportée pour l'audit : c'est elle qui doit purger les mots de passe en clair des bases
// héritées, et cette garantie mérite d'être vérifiée sur une vraie base, pas sur parole.
export function migrate(db) {
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
    // ⚠️ SEUL le hash est conservé. Un mot de passe hérité en clair est hashé puis effacé.
    if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
    // Purge des clairs déjà stockés. Irréversible, et c'est le but : tant qu'ils existaient,
    // ils voyageaient dans l'état synchronisé, dans chaque sauvegarde et dans chaque export
    // — un seul accès à la base rendait tous les comptes réutilisables ailleurs, y compris
    // là où les gens ont réemployé le même mot de passe. Un manager qui doit rendre l'accès
    // à quelqu'un le RÉINITIALISE ; il n'a jamais eu besoin de le lire.
    delete a.passwordClear
    delete a.passwordPlain
    // Présence (en ligne / hors ligne / ne pas déranger) + préférences conversations
    if (!a.presence) a.presence = 'online'
    // Canaux mis en sourdine : { canalId: 'forever' | date ISO de fin }. L'ancien format
    // (simple liste d'ids) valait « jusqu'à réactivation » et se convertit tel quel.
    if (Array.isArray(a.mutedChannels)) a.mutedChannels = Object.fromEntries(a.mutedChannels.map(id => [id, 'forever']))
    if (!a.mutedChannels || typeof a.mutedChannels !== 'object') a.mutedChannels = {}
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
  // Deuxième série de modules : éteinte sur les environnements qui existaient avant elle.
  // On l'inscrit noir sur blanc (plutôt que de compter sur une absence) et une seule fois :
  // le staff qui allume une brique ne doit pas la voir s'éteindre au rechargement suivant.
  if (!db._autoSeed.modulesV2) {
    ;(db.environments || []).forEach(e => {
      e.modules = { ...(e.modules || {}) }
      MODULES_V2.forEach(id => { if (e.modules[id] === undefined) e.modules[id] = false })
    })
    db._autoSeed.modulesV2 = true
  }
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
  // Relevés en mode automatique : la demande s'ouvre d'elle-même, chaque mois, pour chaque
  // personne — le salarié n'a rien à réclamer. Une seule fois par personne et par mois
  // (la clé du relevé suffit à le garantir), et seulement pour le mois ÉCOULÉ : un relevé de
  // mois en cours porterait sur une paie qui n'est pas encore arrêtée.
  ;(db.environments || []).forEach(env => {
    if (statementMode(env) !== 'automatic') return
    const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1)
    const mKey = monthKey(prev)
    env.statementRequests = env.statementRequests || {}
    ;(db.subenvs || []).filter(s => s.envId === env.id).forEach(s => {
      const k = statementKey(s.id, mKey)
      if (!env.statementRequests[k]) env.statementRequests[k] = { at: new Date().toISOString(), by: 'Règle mensuelle', auto: true }
    })
  })
  // Rattrapage, une seule fois, pour les bases déjà en service. Un environnement créé avant
  // la correction n'avait pas de repère de semis : au prochain chargement, la migration
  // l'aurait pris pour un environnement neuf et aurait recréé le projet supprimé — une
  // dernière résurrection, celle de trop. Dans une base DÉJÀ UTILISÉE (des repères existent),
  // tout environnement présent a forcément eu son projet à un moment : son absence
  // aujourd'hui est une suppression, pas un oubli. On le déclare donc semé sans rien créer.
  if (!db._autoSeed.envSeedBackfill) {
    const used = ['envClients', 'envProjects', 'reqProjects', 'reqClients']
      .some(k => (db._autoSeed[k] || []).length > 0)
    if (used) {
      ;(db.environments || []).forEach(env => {
        if (!db._autoSeed.envClients.includes(env.id)) db._autoSeed.envClients.push(env.id)
        if (!db._autoSeed.envProjects.includes(env.id)) db._autoSeed.envProjects.push(env.id)
      })
    }
    db._autoSeed.envSeedBackfill = true
  }
  // Chaque environnement existant est forcément un client (Clients actifs) avec son projet d'implémentation.
  ;(db.environments || []).forEach(env => {
    seedEnvClientAndProject(db, env)
  })
  // Corbeille support : purge des éléments supprimés depuis plus de 30 jours
  const supCutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  db.supportTrash = (db.supportTrash || []).filter(t => t.deletedAt > supCutoff)
  // Pierres tombales des environnements : un environnement supprimé ne revient par AUCUN
  // chemin — ni par une sauvegarde locale, ni par une importation, ni par une synchro.
  // Elles s'effacent au bout de 90 jours : passé ce délai, plus aucune photo périmée
  // plausible ne le contient encore, et la liste cesserait de faire autre chose que grossir.
  db._envTombstones = db._envTombstones || {}
  const tombCutoff = new Date(Date.now() - 90 * 86400000).toISOString()
  Object.entries(db._envTombstones).forEach(([id, t]) => {
    if ((t?.deletedAt || '') < tombCutoff && (t?.restoredAt || '') < tombCutoff) { delete db._envTombstones[id]; return }
    if (!envIsDeleted(t)) return
    ;(db.subenvs || []).filter(s => s.envId === id).forEach(s => { delete db.data[s.id] })
    db.subenvs = (db.subenvs || []).filter(s => s.envId !== id)
    db.environments = (db.environments || []).filter(e => e.id !== id)
    db.projects = (db.projects || []).filter(p => p.envId !== id && p.sourceEnvId !== id)
  })
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
    // Bibliothèque d'objections. Semée une seule fois : une équipe qui l'a vidée ne doit pas
    // la voir repousser au rechargement suivant.
    if (!Array.isArray(data.objections)) { data.objections = defaultObjections(); data._objectionsSeeded = true }
    if (!Array.isArray(data.objectionFamilies) || !data.objectionFamilies.length) data.objectionFamilies = [...OBJECTION_FAMILIES]
    // Modèles de messages : semés une seule fois, comme les objections.
    if (!Array.isArray(data.messageTemplates)) data.messageTemplates = defaultMessageTemplates()
    // Plans de relance : semés une seule fois. Un plan supprimé ne doit pas repousser, et une
    // équipe qui a écrit les siens ne doit pas retrouver le nôtre par-dessus.
    if (!Array.isArray(data.cadences)) data.cadences = defaultCadences()
    // Modulateurs de prime : toujours neutres tant qu'un manager ne les active pas.
    data.primeRules = { ...DEFAULT_PRIME_RULES(), ...(data.primeRules || {}) }
    // Pipeline de closing (module `closing`)
    if (!Array.isArray(data.closingPhases) || !data.closingPhases.length) data.closingPhases = [...DEFAULT_CLOSING_PHASES]
    if (!Array.isArray(data.closingLostReasons)) data.closingLostReasons = [...DEFAULT_CLOSING_LOST_REASONS]
    // Passation au closer (module `handoff`)
    if (!Array.isArray(data.handoffPhases)) data.handoffPhases = []
    if (!Array.isArray(data.handoffReasons)) data.handoffReasons = [...DEFAULT_HANDOFF_REASONS]
    if (typeof data.primeOnAccept !== 'boolean') data.primeOnAccept = false
    // Sens commercial des étapes. Les espaces créés avant ce réglage héritent des valeurs
    // d'origine, mais uniquement si l'étape existe encore chez eux : réintroduire « KO »
    // dans un pipeline qui ne l'a plus ferait réapparaître une étape supprimée.
    if (!Array.isArray(data.wonPhases)) data.wonPhases = DEFAULT_WON_PHASES.filter(p => phaseList(data).includes(p))
    if (!Array.isArray(data.lostPhases)) data.lostPhases = DEFAULT_LOST_PHASES.filter(p => phaseList(data).includes(p))
    // Sécurité : l'ancien écran d'intégration stockait le jeton HubSpot dans l'état
    // SYNCHRONISÉ. On le purge — il vit désormais en localStorage, par appareil.
    if (data.integrations?.hubspot?.token) delete data.integrations.hubspot.token
  })
  // ---- Conversations / canaux + services (organigramme) ----
  db.channels = db.channels || []
  db.channelMessages = db.channelMessages || {}
  db.staffServices = db.staffServices || [] // services de l'équipe support / staff (fondateur)
  db.staffRoles = seedStaffRoles(db.staffRoles) // rôles + permissions de l'équipe staff (idempotent)
  // `env.access` était jusqu'ici DÉDUIT du rôle (Fondateur / Support BD Report). En devenant
  // une permission, il ne figure dans aucun rôle déjà enregistré : sans ce rattrapage, une
  // base en service verrait son équipe support perdre du jour au lendemain l'accès aux
  // environnements clients. On le pose UNE FOIS, sur les rôles qui l'avaient de fait — et
  // le repère fait que le retirer ensuite est un choix, pas un oubli à corriger.
  if (!db._autoSeed.envAccessPerm) {
    db.staffRoles.forEach(r => {
      const key = r.roleKey || r.name
      if (SUPPORT_ROLES.includes(key) && !(r.permissions || []).includes('env.access')) {
        r.permissions = [...(r.permissions || []), 'env.access']
      }
    })
    db._autoSeed.envAccessPerm = true
  }
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
  // Thèmes retirés : une préférence pointant vers un thème disparu doit revenir au design
  // par défaut, faute de quoi elle serait ignorée en silence à chaque chargement.
  Object.values(db.data || {}).forEach(d => { if (d && d.theme && !isKnownTheme(d.theme)) d.theme = 'ocean-pro' })
  ;(db.environments || []).forEach(e => {
    if (!Array.isArray(e.services)) e.services = (e.departments && e.departments.length ? e.departments : ['Sales', 'Marketing']).map(n => ({ id: uid(), name: n }))
    e.roles = seedEnvRoles(e.roles) // Manager, Membre et Closer partout, le reste créé par le staff
    // Le rôle Closer n'a de sens qu'avec son pipeline : sans le module, il est retiré — mais
    // seulement s'il est resté INTACT. Un rôle retouché par le client est un choix, pas un
    // résidu : on ne supprime pas le travail de quelqu'un parce qu'un module est décoché.
    if (!envModuleOn(e, 'closing')) {
      const closer = (e.roles || []).find(r => r.id === CLOSING_ROLE_ID)
      const pristine = closer && closer.builtin && !db.subenvs.some(s => s.envId === e.id && s.roleId === CLOSING_ROLE_ID)
      if (pristine) e.roles = e.roles.filter(r => r.id !== CLOSING_ROLE_ID)
    }
  })
  // Onglets livrés après coup : les rôles d'environnement INTÉGRÉS les reçoivent une seule fois
  // (suivi par brique dans `_autoSeed.envRoleTabs`), sinon un nouveau module resterait invisible
  // chez les clients déjà installés — le rôle décide en plus de l'offre. Un rôle créé sur mesure
  // n'est jamais touché : son périmètre est une décision, pas un oubli.
  db._autoSeed.envRoleTabs = Array.isArray(db._autoSeed.envRoleTabs) ? db._autoSeed.envRoleTabs : []
  const ungranted = ALL_BRICKS.filter(b => !db._autoSeed.envRoleTabs.includes(b))
  if (ungranted.length) {
    ;(db.environments || []).forEach(e => {
      ;(e.roles || []).forEach(r => {
        if (r.id === 'erole-manager') r.tabs = [...new Set([...(r.tabs || []), ...ungranted])]
        if (r.id === 'erole-membre') r.tabs = [...new Set([...(r.tabs || []), ...ungranted.filter(b => MEMBER_TABS.includes(b))])]
      })
    })
    db._autoSeed.envRoleTabs = [...db._autoSeed.envRoleTabs, ...ungranted]
  }
  // Même principe pour les DROITS de management ajoutés après coup : le rôle Manager intégré
  // les reçoit une fois. Sans cela, un manager déjà installé perdrait l'accès à une brique
  // neuve sans que personne comprenne pourquoi — et ne pourrait pas se le rendre lui-même.
  db._autoSeed.envRolePerms = Array.isArray(db._autoSeed.envRolePerms) ? db._autoSeed.envRolePerms : []
  const newPerms = CLIENT_PERMISSION_IDS.filter(p => !db._autoSeed.envRolePerms.includes(p))
  if (newPerms.length) {
    ;(db.environments || []).forEach(e => {
      ;(e.roles || []).forEach(r => {
        if (r.id === 'erole-manager') r.perms = [...new Set([...(r.perms || []), ...newPerms])]
      })
    })
    db._autoSeed.envRolePerms = [...db._autoSeed.envRolePerms, ...newPerms]
  }
  // Idem côté staff : un droit neuf va aux rôles intégrés qui portent déjà le droit voisin,
  // sinon l'écran correspondant resterait invisible sur les bases existantes.
  db._autoSeed.staffPerms = Array.isArray(db._autoSeed.staffPerms) ? db._autoSeed.staffPerms : []
  const newStaffPerms = STAFF_PERMISSION_IDS.filter(p => !db._autoSeed.staffPerms.includes(p))
  if (newStaffPerms.length) {
    // Chaque droit neuf hérite du droit dont il est le prolongement naturel.
    const PARENT = { 'env.build': 'clients.manage', 'env.modules': 'clients.manage', 'projects.others': 'projects.manage' }
    ;(db.staffRoles || []).forEach(r => {
      const perms = r.permissions || []
      if (!perms.length) return // rôle sans droit : on ne lui en invente pas
      newStaffPerms.forEach(p => {
        const parent = PARENT[p]
        if (parent && perms.includes(parent) && !perms.includes(p)) perms.push(p)
      })
      r.permissions = perms
    })
    db._autoSeed.staffPerms = [...db._autoSeed.staffPerms, ...newStaffPerms]
  }
  seedAutoChannels(db)
  seedOneToOneChannels(db)
  reconcileReporting(db)
  // Les canaux de reporting se sont mis à notifier : sans repère de lecture, tout leur
  // historique compterait d'un coup comme non lu. On pose donc une fois la barre à
  // maintenant — on prévient à partir des PROCHAINS événements, pas du passé.
  db._autoSeed = db._autoSeed || {}
  if (!db._autoSeed.reportingReadBaseline) {
    const now = new Date().toISOString()
    const reportingIds = (db.channels || []).filter(c => c.kind === 'reporting').map(c => c.id)
    ;(db.accounts || []).forEach(a => {
      a.channelReads = a.channelReads || {}
      reportingIds.forEach(id => { if (!a.channelReads[id]) a.channelReads[id] = now })
    })
    db._autoSeed.reportingReadBaseline = true
  }
  return db
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch (e) { /* base corrompue : on repart du seed */ }
  return migrate(buildSeedDb())
}

export function StoreProvider({ children, demo = false, dataset = 'sales', datasetRole, datasetRoles, datasetBrand }) {
  const [db, setDbState] = useState(() => demo
    ? (dataset === 'training' ? buildTrainingDb(datasetRole, datasetRoles) : buildDemoDb(datasetBrand))
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
  // Sauvegarde DIFFÉRÉE. `JSON.stringify` de tout l'état coûte cher dès qu'une équipe a
  // de l'historique, et davantage encore quand des images ou des fichiers circulent dans
  // les conversations. L'écrire à chaque changement figeait l'interface le temps de la
  // sérialisation : les clics tombés pendant ce gel étaient purement perdus, ce qui
  // donnait des boutons « qui ne font rien » et des déplacements de cartes hachés.
  // Les changements rapprochés sont donc regroupés en une seule écriture.
  const pendingSave = React.useRef(null)
  const flushSave = React.useCallback(() => {
    const p = pendingSave.current
    if (!p) return
    pendingSave.current = null
    // Sauvegarde sûre : capture l'erreur de quota au lieu d'échouer silencieusement (bug 5).
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p.payload))
      // Synchro Supabase (inerte si non configuré) : seulement après la 1re synchro distante.
      if (p.push && remoteReady.current) pushRemoteStateDebounced(p.payload)
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: "⚠️ Stockage plein : sauvegarde impossible. Allégez vos photos/logos ou exportez vos données." }))
    }
  }, [])

  useEffect(() => {
    if (demo) return // démo isolée : aucune persistance ni synchro
    // L'état vient-il d'être adopté depuis le distant ? Le drapeau se consomme tout de
    // suite : différer sa lecture ferait passer pour « distante » la modification locale
    // suivante, qui ne serait alors jamais repoussée.
    const fromRemote = applyingRemote.current
    if (fromRemote) applyingRemote.current = false
    // Venant du distant, on conserve son estampille et on NE re-pousse PAS.
    const stamp = fromRemote ? (db._savedAt || Date.now()) : Date.now()
    lastSavedAt.current = stamp
    pendingSave.current = {
      payload: fromRemote ? { ...db, _savedAt: stamp } : { ...db, _savedAt: stamp, _client: clientId.current },
      push: !fromRemote,
    }
    const t = setTimeout(flushSave, 400)
    return () => clearTimeout(t)
  }, [db, demo, flushSave])

  // Rien ne doit se perdre si l'onglet est fermé ou masqué pendant le délai d'écriture.
  useEffect(() => {
    if (demo) return
    const onHide = () => { if (document.visibilityState === 'hidden') flushSave() }
    // Point d'entrée pour forcer l'écriture (test de fumée, diagnostic en console).
    window.__bdrFlushSave = flushSave
    window.addEventListener('pagehide', flushSave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      document.removeEventListener('visibilitychange', onHide)
      flushSave() // démontage du provider (déconnexion, rechargement) : on écrit avant de partir
    }
  }, [demo, flushSave])

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
        // Même règle qu'en temps réel : le distant fait foi, SAUF pour les espaces dont la
        // copie locale est plus fraîche. Un travail fait hors ligne ne disparaît pas parce
        // qu'un collègue a enregistré entre-temps.
        setDbState(prev => migrate(mergeRemoteDb(prev, remote)))
      } else if (remote) {
        // ⚠️ LE LOCAL PLUS RÉCENT NE DOIT PAS EFFACER LE DISTANT. On poussait ici la base
        // locale TELLE QUELLE : un environnement créé sur un autre poste — jamais vu par
        // celui-ci — disparaissait de la base commune au simple démarrage de l'application,
        // parce que ce poste avait enregistré une seconde plus tard. C'est ce qui faisait
        // qu'un client n'était « pas accessible partout » : il existait chez l'un, effacé
        // chez l'autre. On fusionne donc dans CE sens aussi (le local fait foi, le distant
        // complète), et c'est le résultat fusionné qui repart.
        applyingRemote.current = true
        const merged = migrate(mergeRemoteDb(remote, dbRef.current))
        setDbState(merged)
        await pushRemoteState({ ...merged, _savedAt: lastSavedAt.current || initialLocal.current.savedAt || Date.now(), _client: clientId.current })
      } else {
        await pushRemoteState({ ...dbRef.current, _savedAt: lastSavedAt.current || initialLocal.current.savedAt || Date.now(), _client: clientId.current })
      }
      remoteReady.current = true
      // Import unique du pipeline d'Owen, en mutation différée (commit séparé → poussé vers le cloud).
      setTimeout(maybeInjectPipeline, 0)
      // 2) Temps réel sur l'état applicatif (on ignore nos propres échos).
      unsubState = await subscribeRemoteState(remote => {
        if (cancelled || !remote || remote._client === clientId.current) return
        if ((remote._savedAt || 0) >= lastSavedAt.current) {
          applyingRemote.current = true
          // Fusion espace par espace plutôt que remplacement : la version distante porte une
          // copie possiblement PÉRIMÉE des espaces que son auteur n'a pas touchés.
          setDbState(prev => migrate(mergeRemoteDb(prev, remote)))
        }
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
  // Dernière consultation journalisée, pour ne pas réécrire la même ligne à chaque rendu.
  const lastNavLog = useRef({ sig: '', at: 0 })
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
    // Écriture dans un espace, avec la trace de ce qui a changé. Passer par ici plutôt que
    // par chaque écran garantit qu'AUCUNE modification n'échappe à l'historique — y compris
    // celles d'un écran qui n'existe pas encore.
    // L'espace visé peut relever d'un AUTRE environnement (pipeline entreprise, vue manager) :
    // c'est le réglage de CET environnement-là qui décide, pas celui de qui écrit.
    const writeSubData = (d, subId, fn) => {
      const ownerEnvId = d.subenvs.find(s => s.id === subId)?.envId || session?.envId
      const tracked = demo || envModuleOn(d.environments.find(e => e.id === ownerEnvId), 'rdvHistory')
      const before = tracked ? auditSnapshot(d.data[subId]) : null
      const next = fn(d.data[subId])
      if (tracked) applyRdvAudit(next, before, { name: actorName, subId: session?.subEnvId || '' })
      // Horodatage de l'espace : c'est lui qui permet à `mergeRemoteDb` de savoir, espace par
      // espace, quelle version est la plus fraîche. Sans lui, la version distante d'un
      // collègue écrasait le travail en cours de tout le monde (voir le commentaire là-bas).
      if (next && typeof next === 'object') next._rev = Date.now()
      return next
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
      // Base de contacts COMMUNE à l'environnement. Chaque commercial garde la sienne, mais
      // la recherche porte sur celle de toute l'équipe : sans cela deux personnes recréent
      // le même interlocuteur, et nul ne voit qu'il a déjà été appelé la semaine passée.
      envContacts() {
        const subs = db.subenvs.filter(s => s.envId === session?.envId)
        const byKey = new Map()
        subs.forEach(s => {
          const owner = `${s.prenom || ''} ${s.nom || ''}`.trim()
          ;(db.data[s.id]?.contacts || []).forEach(c => {
            const key = (c.email || '').trim().toLowerCase() || (c.nom || '').trim().toLowerCase()
            if (!key) return
            const prev = byKey.get(key)
            if (!prev) byKey.set(key, { ...c, owners: owner ? [owner] : [], mine: s.id === session?.subEnvId })
            else {
              if (owner && !prev.owners.includes(owner)) prev.owners.push(owner)
              prev.mine = prev.mine || s.id === session?.subEnvId
              // On complète sans écraser : la fiche la plus renseignée gagne.
              ;['poste', 'email', 'tel', 'entreprise'].forEach(k => { if (!prev[k] && c[k]) prev[k] = c[k] })
            }
          })
        })
        return [...byKey.values()]
      },
      // Reprend dans MON espace les contacts de l'équipe que je n'ai pas encore.
      importEnvContacts() {
        const mine = new Set((this.sub?.contacts || []).map(c => (c.email || c.nom || '').trim().toLowerCase()))
        const add = this.envContacts().filter(c => {
          const key = (c.email || c.nom || '').trim().toLowerCase()
          return key && !mine.has(key)
        })
        if (!add.length) return 0
        this.setSub(d => ({
          ...d,
          contacts: [...(d.contacts || []), ...add.map(c => {
            const { owners, mine: _m, ...rest } = c
            return { ...rest, id: uid(), importedFrom: (owners || []).join(', ') }
          })],
        }))
        return add.length
      },
      // Écosystème de l'espace : phases du pipeline, phases qui déclenchent une prime et
      // jour de bascule du mois de paiement. Renommer une phase reporte le nouveau nom sur
      // les rendez-vous qui la portent ET sur les phases déclencheuses, faute de quoi les
      // primes cesseraient d'être calculées sans que personne ne comprenne pourquoi.
      setEcosystem(patch) { this.setSub(d => ({ ...d, ...patch })) },
      renamePhase(oldName, newName) {
        const to = (newName || '').trim(); if (!to || to === oldName) return
        this.setSub(d => {
          // Trace du renommage : les automatisations (Perdue → KO, Gagnée → SQL, Signée)
          // visent des noms par défaut. Sans cet alias, renommer « SQL » ferait poser aux
          // RDV gagnés une étiquette qui n'existe plus dans le pipeline.
          const aliases = { ...(d.phaseAliases || {}) }
          const origin = Object.keys(aliases).find(k => aliases[k] === oldName)
            || (DEFAULT_PHASES.includes(oldName) ? oldName : null)
          if (origin) aliases[origin] = to
          return {
            ...d,
            phaseAliases: aliases,
            phases: (d.phases || []).map(p => (p === oldName ? to : p)),
            primePhases: (d.primePhases || []).map(p => (p === oldName ? to : p)),
            wonPhases: (d.wonPhases || []).map(p => (p === oldName ? to : p)),
            lostPhases: (d.lostPhases || []).map(p => (p === oldName ? to : p)),
            rdvs: (d.rdvs || []).map(r => (r.phase === oldName ? { ...r, phase: to } : r)),
          }
        })
      },
      getSavedCreds() { try { return JSON.parse(localStorage.getItem(CREDS_KEY)) } catch (e) { return null } },
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
      // La session Google est fermée aussi : sans cela, l'écran de connexion la
      // retrouverait aussitôt et rouvrirait la session à peine quittée.
      logout() {
        setSession(null); localStorage.removeItem(REMEMBER_KEY)
        Promise.resolve(signOutSupabase()).catch(() => {})
      },
      /**
       * Le code d'accès est-il demandé à cette personne ?
       *
       * Non pour l'équipe BD Report intervenant chez un client. Le PIN protège du REGARD
       * d'un collègue à l'intérieur d'une équipe ; il n'a jamais été une autorisation, et il
       * ne défend rien contre quelqu'un qui peut déjà réinitialiser les mots de passe,
       * effacer un espace ou supprimer l'environnement entier. Le demander ne protégeait
       * personne — cela rendait seulement « entrer dans l'environnement », depuis l'atelier,
       * impossible à qui n'a pas un code qu'il n'a aucune raison de connaître.
       *
       * L'entrée reste TRACÉE : c'est le journal, pas un chiffre à quatre chiffres, qui rend
       * une intervention chez un client vérifiable.
       */
      /**
       * Les environnements que CE compte peut ouvrir depuis le sélecteur.
       *
       * ⚠️ Le sélecteur décidait seul, sur un ancien drapeau de compte (`account.developer`)
       * qui n'a rien à voir avec le rôle : un Fondateur sans ce drapeau ne voyait que les
       * environnements qu'il avait créés ou rejoints. Il voyait pourtant les autres partout
       * ailleurs — fiche client, livraisons, atelier, « voir en situation » — et tout le
       * reste du store le laisse déjà y entrer (`skipsPin`, `enterEnv` qui journalise
       * l'intervention). Un client visible dans la console et introuvable au moment d'y
       * entrer : la même question répondue à deux endroits, forcément de deux façons.
       * Elle se décide donc ICI, une fois, avec le MÊME critère que ces deux méthodes :
       * la permission staff `env.access`, qui s'accorde et se retire dans « Permissions
       * staff » au lieu d'être déduite d'un rôle ou d'un drapeau.
       */
      canEnterClientEnvs() { return accountHasPerm(account, 'env.access', db) },
      selectableEnvs() {
        if (this.canEnterClientEnvs()) return db.environments
        return db.environments.filter(e => e.createdBy === account?.id || (e.members || []).includes(account?.id))
      },
      skipsPin(envId) {
        // Même clé que la liste : accorder l'accès et laisser une porte verrouillée derrière
        // reviendrait à ne rien accorder du tout.
        if (!this.canEnterClientEnvs()) return false
        const env = db.environments.find(e => e.id === (envId || session?.envId))
        // Chez lui, un membre du staff est un utilisateur comme un autre : son propre code
        // le protège de ses propres collègues, et il le connaît.
        return !!env && env.createdBy !== account?.id
      },
      /**
       * Ouvrir l'environnement d'un client DIRECTEMENT sur l'écran où vit une brique.
       *
       * Cocher une case et lire une description ne dit pas ce que le client verra. Le seul
       * moyen de le savoir était d'entrer, de choisir un espace, puis de retrouver l'écran
       * à la main — trois gestes qui font qu'on ne vérifie pas.
       *
       * On entre donc dans le premier espace disponible : sans espace ouvert, l'application
       * n'affiche aucun écran métier, et le bouton retomberait sur le sélecteur.
       */
      previewFeature(envId, moduleId) {
        const mod = ENV_MODULES.find(m => m.id === moduleId)
        if (!mod?.where) return false
        return this.previewPage(envId, mod.where.page, mod.where.hub)
      },
      /**
       * Ouvrir un environnement DIRECTEMENT sur un écran donné. Sert aussi bien aux briques
       * qu'aux onglets : dans les deux cas la question est la même — « à quoi cela ressemble
       * chez le client ? » — et elle ne se répond pas en lisant un libellé.
       *
       * Un onglet de la console Manager n'est pas une page : il faut d'abord ouvrir la
       * console, puis y désigner l'onglet. Sans ce second temps, la moitié des onglets
       * accordables resteraient injoignables.
       */
      previewPage(envId, pageId, hubTab) {
        if (!pageId) return false
        const sub = db.subenvs.find(s => s.envId === envId)
        // Sans espace ouvert, l'application n'affiche aucun écran métier : le bouton
        // retomberait sur le sélecteur d'espaces, ce qui n'est pas ce qu'il promet.
        if (!sub) return false
        const item = NAV.find(i => i.id === pageId)
        const page = item?.inManagerHub ? 'manager' : pageId
        const inner = hubTab || (item?.inManagerHub ? pageId : null)
        this.enterEnv(envId)
        this.enterSubEnv(sub.id)
        // Après le changement d'espace : le rendu doit avoir eu lieu pour que la navigation
        // trouve sa cible.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('app-navigate', { detail: page }))
          if (inner) setTimeout(() => {
            window.dispatchEvent(new CustomEvent(page === 'manager' ? 'manager-tab' : 'hub-tab', { detail: inner }))
          }, 260)
        }, 260)
        return true
      },
      enterEnv(envId) {
        setSession(s => ({ ...s, envId, subEnvId: null }))
        // Un membre de l'équipe BD Report qui entre chez un client y intervient : le projet
        // passe en Maintenance pour que le reste de l'équipe le sache. Le créateur d'un
        // environnement n'est pas concerné — c'est chez lui.
        const env = db.environments.find(e => e.id === envId)
        if (this.canEnterClientEnvs() && env && env.createdBy !== account?.id) {
          this.markProjectMaintenance(envId)
          this.logStaff({ type: 'Navigation', cat: 'navigation', action: "Entrée dans l'environnement d'un client", envId })
        }
      },
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
      // Environnements dont la configuration peut servir de modèle : ceux que l'on gère.
      templateEnvs() {
        return db.environments
          .filter(e => e.createdBy === account?.id || isSupportRole(account?.role))
          .map(e => ({ id: e.id, name: e.name }))
      },
      // `templateOf` : reprend la CONFIGURATION d'un environnement existant — étapes du
      // pipeline, issues, barèmes, règles de prime, services et rôles. Jamais les données
      // du client d'origine : ouvrir un espace ne doit pas y recopier les rendez-vous,
      // contacts ou notes de quelqu'un d'autre.
      /**
       * Créer une livraison ET l'environnement qu'elle livre, d'un seul geste.
       *
       * Le lien n'existait que dans un sens : créer un environnement produisait sa
       * livraison, jamais l'inverse. Un projet créé à la main restait donc ORPHELIN — pas
       * d'environnement, donc pas de modules, pas de rôles, pas de passerelle vers
       * l'atelier, pas de bouton « Utilisateurs ». Une coquille portant un nom.
       *
       * ⚠️ UN SEUL projet à l'arrivée. `createEnv` sème déjà sa livraison : on la REPREND et
       * on y applique la saisie, au lieu d'en créer une seconde qui ferait doublon.
       */
      createProjectWithEnv(data) {
        const env = this.createEnv({ name: (data.clientName || data.name || 'Nouveau client').trim() })
        if (!env) return null
        let out = null
        setDb(d => {
          const seeded = (d.projects || []).find(p => p.sourceEnvId === env.id)
          const merged = {
            ...(seeded || { id: uid(), createdAt: new Date().toISOString(), sourceEnvId: env.id }),
            ...data,
            // Ces deux-là viennent de l'environnement, pas du formulaire : c'est le lien qui
            // fait la différence entre une livraison et une simple fiche.
            envId: env.id,
            clientName: (data.clientName || env.name),
          }
          d.projects = seeded
            ? d.projects.map(p => (p.id === seeded.id ? merged : p))
            : [merged, ...(d.projects || [])]
          out = merged
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projets', action: 'Projet et environnement créés', envId: env.id })
        return out
      },
      createEnv({ name, logo, templateOf, modules, closerServices, statementMode: stMode }) {
        // L'environnement hérite de l'offre de son créateur (Starter reste limité).
        const plan = account?.plan || 'starter'
        const src = templateOf ? db.environments.find(e => e.id === templateOf) : null
        const env = {
          id: uid(), name, logo: logo || '', pin: '', plan, createdBy: session.accountId,
          // Modules optionnels retenus à l'installation. Repris du modèle quand il y en a un :
          // dupliquer une configuration sans ses modules livrerait un espace différent.
          modules: { ...defaultEnvModules(), ...(src?.modules || {}), ...(modules || {}) },
          // Délivrance du relevé : réglée à la création, reprise d'un modèle sinon.
          statementMode: stMode || src?.statementMode || 'onRequest',
          departments: src ? [...(src.departments || [])] : ['Marketing', 'Sales'],
          services: src ? (src.services || []).map(sv => ({ ...sv, id: uid() })) : undefined,
          roles: src ? (src.roles || []).map(r => ({ ...r, id: uid() })) : undefined,
        }
        // Droit de closer délégué à des services. On le reçoit en NOMS de service : les
        // identifiants ne sont créés qu'ici, l'appelant ne peut pas les connaître.
        if (closerServices?.length) {
          const svcs = env.services || (env.departments || []).map(n => ({ id: uid(), name: n }))
          env.services = svcs
          env.closers = { subIds: [], serviceIds: svcs.filter(s => closerServices.includes(s.name)).map(s => s.id) }
        } else if (src?.closers) {
          env.closers = { subIds: [], serviceIds: [] } // un modèle ne transmet pas des personnes nommées
        }
        // La configuration de pipeline et de primes vit dans les ESPACES, pas dans
        // l'environnement : on la reprend de l'espace du créateur du modèle.
        const srcData = src ? db.data[db.subenvs.find(x => x.envId === src.id && x.ownerId === src.createdBy)?.id] : null
        env._template = srcData ? {
          phases: [...(srcData.phases || [])],
          primePhases: [...(srcData.primePhases || [])],
          wonPhases: [...(srcData.wonPhases || [])],
          lostPhases: [...(srcData.lostPhases || [])],
          primeCutoffDay: srcData.primeCutoffDay,
          bareme: (srcData.bareme || []).map(b => ({ ...b, id: uid() })),
          activityRules: (srcData.activityRules || []).map(r => ({ ...r, id: uid(), tiers: (r.tiers || []).map(t => ({ ...t, id: uid() })) })),
          goals: { ...(srcData.goals || {}) },
        } : null
        setDb(d => {
          d.environments.push(env)
          // Tout nouvel environnement devient un client avec son projet d'implémentation.
          // Par le MÊME chemin que la migration, qui pose aussi le repère de semis : sans lui,
          // le prochain rechargement recréait le projet qu'on venait de supprimer.
          seedEnvClientAndProject(d, env)
          return d
        })
        return env
      },
      createSubEnv(envId, { prenom, nom, poste, service, pin }) {
        if (roBlocked()) return null
        const sub = { id: uid(), envId, prenom, nom, poste, service, pin: pin || '0000', photo: '', ownerId: session.accountId }
        setDb(d => {
          d.subenvs.push(sub)
          // Un espace ouvert dans un environnement issu d'un modèle démarre avec la
          // configuration de ce modèle — sinon le modèle ne servirait qu'une fois.
          const tpl = d.environments.find(e => e.id === envId)?._template
          d.data[sub.id] = tpl ? { ...emptySubEnvData(), ...structuredClone(tpl) } : emptySubEnvData()
          return d
        })
        return sub
      },
      updateEnv(envId, patch) { if (roBlocked()) return; setDb(d => { Object.assign(d.environments.find(e => e.id === envId), patch); return d }) },
      // ----- Modules optionnels de l'environnement
      // `hasModule` répond pour l'environnement COURANT : c'est ce que consultent la
      // navigation et les écrans. La démo montre le produit complet, tout y est actif.
      hasModule(id) {
        if (demo) return true
        return envModuleOn(db.environments.find(e => e.id === session?.envId), id)
      },
      // ----- Objectifs & quotas (posés par le manager, portés par l'environnement)
      quotas() { return envQuotas(db.environments.find(e => e.id === session?.envId)) },
      canSetQuotas() { return this.hasClientPerm('pilot.targets') || this.hasClientPerm('team.manage') || isSupportRole(account?.role) },
      setQuotas(patch) {
        if (readOnly || !this.canSetQuotas()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          env.quotas = { ...envQuotas(env), ...patch }
          return d
        })
      },
      setMemberQuota(subId, patch) {
        if (readOnly || !this.canSetQuotas()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const q = envQuotas(env)
          env.quotas = { ...q, byMember: { ...q.byMember, [subId]: { ...(q.byMember?.[subId] || {}), ...patch } } }
          return d
        })
      },
      // Quota effectif de la personne connectée : ce que le tableau de bord affiche en regard
      // du réalisé. Renvoie null si aucun quota n'est posé — mieux vaut ne rien montrer qu'un zéro.
      myQuota(metricId) {
        const env = db.environments.find(e => e.id === session?.envId)
        const q = memberQuota(env, session?.subEnvId, metricId)
        return q.target > 0 ? q : null
      },
      // ----- Relevés de primes
      // Le relevé signé est LU depuis l'environnement (gelé) ; tant qu'il n'existe pas, on
      // le calcule à la volée pour que le manager voie ce qu'il s'apprête à signer.
      statementFor(subId, mKey) {
        const env = db.environments.find(e => e.id === session?.envId)
        const saved = envStatements(env)[statementKey(subId, mKey)]
        if (saved) return saved
        return { ...buildStatement(db.data[subId] || {}, env, subId, mKey), signature: null }
      },
      canSignStatements() { return this.hasClientPerm('primes.sign') || this.hasClientPerm('team.manage') || isSupportRole(account?.role) },
      signStatement(subId, mKey) {
        if (readOnly || !this.canSignStatements()) return
        const who = db.subenvs.find(s => s.id === session?.subEnvId)
        // La signature porte un NOM, pas un pseudo : c'est ce qui figure sur le document.
        const name = who ? `${who.prenom} ${who.nom}`.trim() : (account?.pseudo || '')
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const snap = buildStatement(d.data[subId] || {}, env, subId, mKey)
          env.statements = { ...envStatements(env), [statementKey(subId, mKey)]: {
            ...snap, signature: { by: name, accountId: account?.id || null, at: new Date().toISOString() },
          } }
          // Le collaborateur doit savoir que son relevé est disponible.
          const data = d.data[subId]
          if (data) {
            data.notifs = [{
              id: uid(), ts: new Date().toISOString(), read: false, type: 'prime', page: 'primes',
              title: 'Relevé de primes validé', text: `${name} a signé votre relevé — il est téléchargeable.`,
            }, ...(data.notifs || [])].slice(0, 100)
          }
          return d
        })
      },
      // Retirer une signature efface le document figé : le relevé redevient un brouillon
      // recalculé, et non un document signé dont le contenu aurait changé en douce.
      unsignStatement(subId, mKey) {
        if (readOnly || !this.canSignStatements()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const next = { ...envStatements(env) }
          delete next[statementKey(subId, mKey)]
          env.statements = next
          return d
        })
      },
      // ----- Challenges d'équipe
      challenges() { return envChallenges(db.environments.find(e => e.id === session?.envId)) },
      activeChallenges() { return this.challenges().filter(c => challengeIsActive(c)) },
      canRunChallenges() { return this.hasClientPerm('pilot.challenges') || this.hasClientPerm('team.manage') || isSupportRole(account?.role) },
      saveChallenge(ch) {
        if (readOnly || !this.canRunChallenges()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const list = envChallenges(env)
          const i = list.findIndex(x => x.id === ch.id)
          env.challenges = i >= 0 ? list.map(x => x.id === ch.id ? ch : x) : [...list, ch]
          return d
        })
      },
      deleteChallenge(id) {
        if (readOnly || !this.canRunChallenges()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          env.challenges = envChallenges(env).filter(x => x.id !== id)
          return d
        })
      },
      // Classement d'un challenge. Les espaces sans donnée sont conservés à 0 : disparaître
      // du tableau parce qu'on n'a rien fait est la pire façon de l'apprendre.
      challengeStandings(ch) {
        return db.subenvs
          .filter(s => s.envId === session?.envId)
          .map(s => ({ sub: s, score: challengeScore(db.data[s.id] || {}, ch.metric, ch.start, ch.end) }))
          .sort((a, b) => b.score - a.score)
      },
      // ----- Territoires (portés par l'environnement : une seule carte pour tout le monde)
      territories() { return envTerritories(db.environments.find(e => e.id === session?.envId)) },
      saveTerritory(t) {
        if (roBlocked()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const list = envTerritories(env)
          const i = list.findIndex(x => x.id === t.id)
          env.territories = i >= 0 ? list.map(x => (x.id === t.id ? t : x)) : [...list, { ...t, id: t.id || uid() }]
          return d
        })
      },
      deleteTerritory(id) {
        if (roBlocked()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          env.territories = envTerritories(env).filter(t => t.id !== id)
          return d
        })
      },
      /** Le territoire qui couvre cette affaire, et s'il appartient à quelqu'un d'autre. */
      territoryFor(rdvLike) {
        const env = db.environments.find(e => e.id === session?.envId)
        const t = territoryOwner(env, rdvLike)
        if (!t) return null
        const owner = db.subenvs.find(s => s.id === t.ownerSubId)
        return { territory: t, owner, mine: t.ownerSubId === session?.subEnvId }
      },
      // ----- Plans de relance
      cadences() { return cadenceList(this.sub) },
      saveCadence(c) {
        this.setSub(d => {
          const list = cadenceList(d)
          const i = list.findIndex(x => x.id === c.id)
          const next = i >= 0 ? list.map(x => (x.id === c.id ? c : x)) : [...list, { ...c, id: c.id || uid() }]
          return { ...d, cadences: next }
        })
      },
      deleteCadence(id) { this.setSub(d => ({ ...d, cadences: cadenceList(d).filter(c => c.id !== id) })) },
      /**
       * Pose les tâches d'un plan sur une affaire. Les tâches d'un plan déjà appliqué à
       * cette affaire sont REMPLACÉES : réappliquer un plan après avoir décalé une date
       * doit repartir de la séquence, pas empiler deux relances le même jour.
       */
      applyCadence(rdvId, cadenceId) {
        const cad = cadenceById(this.sub, cadenceId)
        const rdv = (this.sub?.rdvs || []).find(x => x.id === rdvId)
        if (!cad || !rdv) return 0
        // ⚠️ Les tâches sont fabriquées AVANT l'écriture. Un `setSub` passe par une mise à
        // jour d'état React : son contenu ne s'exécute pas tout de suite, et compter à
        // l'intérieur renvoyait toujours zéro à l'appelant.
        const tasks = cadenceTasks(cad, rdv, todayISO())
        this.setSub(d => {
          const r = (d.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          // On ne retire QUE les tâches non faites de ce plan sur cette affaire : ce qui a
          // été fait appartient à l'historique de la personne, pas au plan.
          const kept = (d.tasks || []).filter(t => !(t.rdvId === rdvId && t.cadenceId === cadenceId && !t.done))
          r.cadence = { id: cadenceId, appliedAt: todayISO() }
          return { ...d, tasks: [...kept, ...tasks] }
        })
        this.logAction('Lead', 'Plan de relance appliqué', cad.name)
        return tasks.length
      },
      /** Retire les tâches non faites d'un plan : arrêter une séquence ne réécrit pas le passé. */
      stopCadence(rdvId) {
        this.setSub(d => {
          const r = (d.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          const cid = r.cadence?.id
          r.cadence = null
          return { ...d, tasks: (d.tasks || []).filter(t => !(t.rdvId === rdvId && t.cadenceId === cid && !t.done)) }
        })
      },
      // ----- Recyclage des leads perdus
      // Reprendre une affaire, c'est la remettre au DÉBUT du pipeline : la reprendre là où
      // elle s'était arrêtée ferait entrer dans les statistiques une étape franchie il y a
      // six mois, dans un contexte qui n'existe plus.
      recycleRdv(rdvId) {
        this.setSub(d => {
          const r = (d.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          r.opportunite = 'En cours'
          r.phase = firstPhase(d)
          r.recycleAt = ''
          r.recycledAt = todayISO()
          r.recycleCount = (r.recycleCount || 0) + 1
          // On garde le motif d'origine : savoir POURQUOI c'était non la dernière fois est
          // le seul avantage qu'on ait sur un lead neuf.
          r.history = [...(r.history || []), { type: 'phase', value: r.phase, date: todayISO() }]
          return d
        })
        this.logAction('Lead', 'Lead repris', '')
      },
      // Repousser sans reprendre : ce n'est toujours pas le moment, mais ce n'est pas non plus fini.
      snoozeRecycle(rdvId, days) {
        this.setSub(d => {
          const r = (d.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          r.recycleAt = addDaysISO(todayISO(), Math.max(1, Number(days) || 30))
          return d
        })
      },
      // Abandonner pour de bon. Volontairement explicite : rien ne disparaît tout seul.
      dropRecycle(rdvId) {
        this.setSub(d => {
          const r = (d.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          r.recycleAt = ''
          return d
        })
      },
      recycleDelays() { return recycleDelays(this.sub) },
      setRecycleDelay(motif, days) {
        this.setSub(d => ({ ...d, recycleDelays: { ...recycleDelays(d), [motif]: Math.max(0, Number(days) || 0) } }))
      },
      // ----- Comité d'achat : vocabulaire de l'environnement (staff)
      committeeRoles() { return committeeRoles(db.environments.find(e => e.id === session?.envId)) },
      committeeRelations() { return committeeRelations(db.environments.find(e => e.id === session?.envId)) },
      // Variantes visant un environnement précis : le staff règle le vocabulaire d'un client
      // depuis sa propre session, sans y entrer.
      envCommitteeRoles(envId) { return committeeRoles(db.environments.find(e => e.id === envId)) },
      envCommitteeRelations(envId) { return committeeRelations(db.environments.find(e => e.id === envId)) },
      setCommittee(envId, patch) {
        if (!accountHasPerm(account, 'clients.manage', db)) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (!env) return d
          env.committee = { roles: committeeRoles(env), relations: committeeRelations(env), ...patch }
          return d
        })
      },
      envModules(envId) {
        const env = db.environments.find(e => e.id === envId)
        return Object.fromEntries(ENV_MODULE_IDS.map(id => [id, envModuleOn(env, id)]))
      },
      setEnvModules(envId, patch) {
        if (!accountHasPerm(account, 'env.modules', db) && !accountHasPerm(account, 'clients.manage', db)) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (!env) return d
          env.modules = { ...defaultEnvModules(), ...(env.modules || {}), ...patch }
          return d
        })
        const changed = Object.entries(patch || {})
          .map(([k, v]) => `${(ENV_MODULES.find(m => m.id === k) || {}).label || k} ${v ? 'activé' : 'retiré'}`).join(', ')
        this.logStaff({ type: 'Module', cat: 'client', action: 'Modules modifiés', details: changed, envId })
      },
      // ===================================================== Passation au closer
      // Renvoie toutes les passations de l'environnement, espace par espace. Le filtrage
      // (les miennes, celles que j'ai à traiter) se fait chez l'appelant : un membre ne voit
      // que son espace, un encadrant voit l'équipe.
      envHandoffs(envId = session?.envId) {
        const out = []
        db.subenvs.filter(s => s.envId === envId).forEach(s => {
          const data = db.data[s.id]; if (!data) return
          ;(data.rdvs || []).forEach(r => {
            const state = handoffState(r, data)
            if (!state) return
            out.push({ subId: s.id, sub: s, rdv: r, state, handoff: r.handoff || null })
          })
        })
        return out.sort((a, b) => (b.rdv.datePassageSQL || b.rdv.datePriseRdv || '').localeCompare(a.rdv.datePassageSQL || a.rdv.datePriseRdv || ''))
      },
      // Le droit de trancher une passation. Sans argument : « puis-je closer, en général ».
      // Voir la chaîne de responsabilité commentée près de `envClosers`.
      canClose() {
        const env = db.environments.find(e => e.id === session?.envId)
        if (!env) return false
        if (isSupportRole(account?.role)) return true
        if (this.hasClientPerm('deals.close') || this.hasClientPerm('team.manage') || isClientManagerRole(account?.role)) return true
        if (!envHasManager(db, env.id) && env.createdBy === account?.id) return true
        const c = envClosers(env)
        if (c.subIds.includes(session?.subEnvId)) return true
        const mySub = db.subenvs.find(s => s.id === session?.subEnvId)
        return !!(mySub?.serviceId && c.serviceIds.includes(mySub.serviceId))
      },
      envClosers(envId) { return envClosers(db.environments.find(e => e.id === envId)) },
      setEnvClosers(envId, patch) {
        if (!accountHasPerm(account, 'clients.manage', db)) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (!env) return d
          env.closers = { ...envClosers(env), ...patch }
          return d
        })
        this.logStaff({ type: 'Permission', cat: 'acces', action: 'Droit de closing modifié', envId })
      },
      // Décision du closer : accepter ou refuser, avec un motif quand c'est un refus.
      decideHandoff(subId, rdvId, state, reason = '') {
        if (readOnly || !this.canClose()) return
        const who = session?.subEnvId ? db.subenvs.find(s => s.id === session.subEnvId) : null
        const by = who ? `${who.prenom} ${who.nom}`.trim() : (account?.pseudo || 'Inconnu')
        setDb(d => {
          const data = d.data[subId]; if (!data) return d
          const r = (data.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          const ts = new Date().toISOString()
          r.handoff = {
            ...(r.handoff || { to: '', at: ts }),
            state, reason: state === 'refused' ? reason : '',
            decidedAt: ts, decidedBy: by,
          }
          // Le commercial doit l'apprendre sans surveiller un écran : un refus se corrige.
          if (subId !== session?.subEnvId) {
            data.notifs = [{
              id: uid(), ts, read: false, type: 'handoff', page: 'handoff',
              title: state === 'accepted' ? 'Lead accepté' : 'Lead refusé',
              text: state === 'accepted'
                ? `${r.entreprise || 'Votre lead'} — accepté par ${by}`
                : `${r.entreprise || 'Votre lead'} — refusé par ${by}${reason ? ' (' + reason + ')' : ''}`,
            }, ...(data.notifs || [])].slice(0, 100)
          }
          return d
        })
      },
      // ----- Pipeline de closing
      // Toutes les affaires acceptées de l'environnement, quel que soit l'espace d'origine :
      // un closer travaille les leads des AUTRES, il ne verrait rien dans le sien.
      envClosingDeals(envId = session?.envId) {
        const out = []
        db.subenvs.filter(s => s.envId === envId).forEach(s => {
          const data = db.data[s.id]; if (!data) return
          ;(data.rdvs || []).forEach(r => {
            const state = closingState(r, data)
            if (!state) return
            out.push({ subId: s.id, sub: s, rdv: r, state, data })
          })
        })
        return out.sort((a, b) => dealAnnualValue(b.rdv) - dealAnnualValue(a.rdv))
      },
      setClosingPhase(subId, rdvId, phase) {
        if (readOnly || !this.canClose()) return
        const who = db.subenvs.find(s => s.id === session?.subEnvId)
        setDb(d => {
          const r = (d.data[subId]?.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          r.closing = { ...(r.closing || {}), phase, by: who ? `${who.prenom} ${who.nom}`.trim() : (account?.pseudo || ''), at: new Date().toISOString() }
          return d
        })
      },
      // Gagner ou perdre reporte l'issue sur `rdv.phase` : les entonnoirs, les primes et les
      // tableaux de bord déjà en place lisent cette phase-là. Sans ce report, une affaire
      // signée par le closer resterait invisible partout ailleurs.
      settleClosing(subId, rdvId, outcome, reason = '') {
        if (readOnly || !this.canClose()) return
        const who = db.subenvs.find(s => s.id === session?.subEnvId)
        const by = who ? `${who.prenom} ${who.nom}`.trim() : (account?.pseudo || '')
        setDb(d => {
          const data = d.data[subId]; if (!data) return d
          const r = (data.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          const ts = new Date().toISOString()
          const target = outcome === 'won' ? wonPhases(data)[0] : lostPhases(data)[0]
          if (target) {
            r.phase = target
            r.history = [...(r.history || []), { type: 'phase', value: target, date: todayISO() }]
          }
          if (outcome === 'won') { r.opportunite = 'Signée'; r.closing = { ...(r.closing || {}), wonAt: ts, by } }
          else { r.opportunite = 'Perdue'; r.motifKo = reason || r.motifKo || ''; r.closing = { ...(r.closing || {}), lostAt: ts, lostReason: reason, by } }
          ensurePrimeSnapshot(data, r)
          // Le commercial qui a transmis l'affaire doit apprendre son sort : c'est SA prime.
          if (subId !== session?.subEnvId) {
            data.notifs = [{
              id: uid(), ts, read: false, type: 'closing', page: 'leads',
              title: outcome === 'won' ? 'Affaire signée' : 'Affaire perdue',
              text: `${r.entreprise || 'Votre lead'} — ${outcome === 'won' ? 'signée' : 'perdue'} par ${by}${reason ? ' (' + reason + ')' : ''}`,
            }, ...(data.notifs || [])].slice(0, 100)
          }
          return d
        })
      },
      // À qui revient la prime de cette affaire. Vide = à l'espace qui la porte, c'est-à-dire
      // au compte qui a demandé la passation — la règle par défaut, qui couvre presque tout.
      setPrimeBeneficiary(subId, rdvId, toSubId) {
        if (readOnly) return
        setDb(d => {
          const r = (d.data[subId]?.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          // On n'inscrit rien quand le bénéficiaire est le propriétaire : une valeur vide se
          // lit « la règle s'applique », ce qui reste vrai si l'affaire change de mains.
          r.primeTo = (!toSubId || toSubId === subId) ? '' : toSubId
          return d
        })
      },
      // ----- Relevé de primes : demande et délivrance
      statementMode() { return statementMode(db.environments.find(e => e.id === session?.envId)) },
      setStatementMode(envId, mode) {
        if (!accountHasPerm(account, 'env.modules', db) && !accountHasPerm(account, 'clients.manage', db)
          && !this.hasClientPerm?.('primes.sign')) return
        setDb(d => {
          const env = d.environments.find(e => e.id === envId); if (!env) return d
          env.statementMode = mode === 'automatic' ? 'automatic' : 'onRequest'
          return d
        })
      },
      statementRequested(subId, mKey) {
        const env = db.environments.find(e => e.id === session?.envId)
        return !!envStatementRequests(env)[statementKey(subId, mKey)]
      },
      /** Le salarié demande son relevé : le manager en est prévenu, et la demande est datée. */
      requestStatement(subId, mKey) {
        if (roBlocked()) return
        setDb(d => {
          const env = d.environments.find(e => e.id === session?.envId); if (!env) return d
          const k = statementKey(subId, mKey)
          if (env.statementRequests?.[k]) return d      // déjà demandé : on ne réveille personne deux fois
          env.statementRequests = { ...(env.statementRequests || {}), [k]: { at: new Date().toISOString(), by: actorName } }
          // Le manager doit l'apprendre sans avoir à surveiller un écran.
          const meSub = d.subenvs.find(s => s.id === subId)
          // Le manager du binôme, à défaut le propriétaire de l'environnement : une demande
          // qui n'atteint personne équivaut à ne pas l'avoir faite.
          const mgrSub = meSub ? managerSubOf(d, meSub) : null
          const owner = d.subenvs.find(s => s.envId === env.id && s.ownerId === env.createdBy)
          const target = mgrSub?.id || owner?.id
          if (target && d.data[target]) {
            d.data[target].notifs = [{
              id: uid(), ts: new Date().toISOString(), read: false, type: 'statement', page: 'teamlead',
              title: 'Relevé de primes demandé',
              text: `${actorName} demande son relevé — il attend votre signature.`,
            }, ...(d.data[target].notifs || [])].slice(0, 100)
          }
          return d
        })
      },
      /** L'espace tel que les calculs de prime doivent le voir (réattributions comprises). */
      primeView(subId) { return primeView(db, subId) },
      // Désigne le closer chargé du dossier (facultatif : sans destinataire, la file est commune).
      assignHandoff(subId, rdvId, toSubId) {
        if (readOnly) return
        setDb(d => {
          const r = (d.data[subId]?.rdvs || []).find(x => x.id === rdvId); if (!r) return d
          r.handoff = { ...(r.handoff || { state: 'pending', at: new Date().toISOString() }), to: toSubId || '' }
          return d
        })
      },
      updateSubEnv(subId, patch) { if (roBlocked()) return; setDb(d => { Object.assign(d.subenvs.find(s => s.id === subId), patch); return d }) },
      deleteSubEnv(subId) { if (roBlocked()) return; setDb(d => { d.subenvs = d.subenvs.filter(s => s.id !== subId); delete d.data[subId]; return d }) },
      // ----- données du sous-environnement courant
      sub: session?.subEnvId ? db.data[session.subEnvId] : null,
      setSub(fn) {
        const subId = session?.subEnvId
        if (!subId) return
        if (readOnly) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Accès en lecture seule : abonnement résilié ou bloqué. Seul le support reste accessible.' })); return }
        setDb(d => { d.data[subId] = writeSubData(d, subId, fn); return d })
      },
      // Met à jour les données d'un sous-environnement précis (ex : pipeline entreprise, leads d'un collègue).
      setSubData(subId, fn) {
        if (!subId) return
        if (readOnly) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '🔒 Accès en lecture seule.' })); return }
        setDb(d => { if (d.data[subId]) d.data[subId] = writeSubData(d, subId, fn); return d })
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
      // Journal de l'équipe BD Report. Une seule porte d'entrée : l'acteur, l'horodatage et
      // le client concerné sont remplis ici, pour qu'aucun appelant ne puisse les oublier.
      logStaff({ type, action, details = '', cat, envId = null, targetId = null, targetName = '' }) {
        const env = db.environments.find(e => e.id === (envId || session?.envId))
        const target = targetId ? db.accounts.find(a => a.id === targetId) : null
        setDb(d => {
          pushSupportLog(d, {
            type, action, details, cat,
            actorId: account?.id || null, actorName: account?.pseudo || 'Système',
            envId: env?.id || null, envName: env?.name || '',
            targetId: targetId || null, targetName: targetName || target?.pseudo || '',
          })
          return d
        })
      },
      // Consultation d'un écran par un membre du staff. Dédupliquée : sans cela, chaque
      // rendu de React remplirait le journal d'une même ligne et le rendrait illisible.
      logStaffNav(page, envId = null) {
        if (!isSupportRole(account?.role)) return
        const env = db.environments.find(e => e.id === (envId || session?.envId))
        const sig = `${account?.id}|${page}|${env?.id || ''}`
        const now = Date.now()
        if (lastNavLog.current.sig === sig && now - lastNavLog.current.at < 60000) return
        lastNavLog.current = { sig, at: now }
        setDb(d => {
          pushSupportLog(d, {
            type: 'Navigation', cat: 'navigation', action: `Écran consulté — ${page}`,
            details: env ? `chez ${env.name}` : '',
            actorId: account?.id || null, actorName: account?.pseudo || 'Système',
            envId: env?.id || null, envName: env?.name || '',
          })
          return d
        })
      },
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
      addCompanyComment(company, text, mentionIds = []) {
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
          // @mentions. Deux sources, dans cet ordre :
          //   · les personnes CHOISIES dans l'autocomplétion — identifiant exact, donc aucune
          //     ambiguïté même quand deux collègues portent le même prénom ;
          //   · à défaut, le texte : on reconnaît « @Prénom Nom » puis « @Prénom » seul, en
          //     mot entier (sans quoi @Luc notifierait Lucas).
          const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const chosen = new Set(mentionIds || [])
          d.subenvs.filter(s => s.envId === env.id && s.id !== sub?.id).forEach(s => {
            const full = `${s.prenom} ${s.nom}`.trim()
            const byText = new RegExp(`@(?:${esc(full)}|${esc(s.prenom)})(?![\\p{L}\\p{N}])`, 'iu').test(text)
            if (!chosen.has(s.id) && !byText) return
            const data = d.data[s.id]
            if (!data) return
            const ts = new Date().toISOString()
            data.mentions = data.mentions || []
            data.mentions.unshift({ id: uid(), ts, company: company.trim(), from: author, text: text.trim(), read: false })
            // Doublée d'une notification d'événement : la mention doit remonter dans la
            // cloche même si le fil des mentions a déjà été parcouru.
            data.notifs = [{
              id: uid(), ts, read: false, type: 'mention', page: 'leads',
              title: `${author} vous a cité sur ${company.trim()}`,
              text: text.trim().slice(0, 120),
            }, ...(data.notifs || [])].slice(0, 100)
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
        if (scope === 'support') return accountHasPerm(account, 'channels.manage', db)
        return this.hasClientPerm('team.channels')
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
        // Entretien 1:1 : aussi privé qu'un message direct. Le droit d'administrer les canaux
        // ne doit pas ouvrir les entretiens des AUTRES binômes — on y parle de rémunération,
        // de difficultés, parfois de la hiérarchie elle-même.
        if (c.oneToOne) return (c.members || []).includes(session?.subEnvId)
        if (c.createdBy === account?.id) return true
        if (this.hasClientPerm('team.channels')) return true // qui administre les canaux les voit
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
      // ----- Entretiens 1:1
      // Le compte rendu est un MESSAGE du fil, pas une table à part : il hérite ainsi des
      // non-lus, de la recherche et de la suppression, et les deux interlocuteurs le voient
      // arriver là où ils se parlent déjà.
      oneToOneChannelFor(memberSubId) {
        return (db.channels || []).find(c => c.oneToOne?.memberSubId === memberSubId && c.envId === session?.envId) || null
      },
      // Chiffres de la personne AU MOMENT du compte rendu. Figés : sans eux, relire un 1:1
      // d'il y a trois mois ne dit plus rien de la situation dont on a parlé.
      oneToOneSnapshot(memberSubId) {
        const data = db.data[memberSubId]
        if (!data) return {}
        const env = db.environments.find(e => e.id === session?.envId)
        const q = envQuotas(env)
        const period = q.byMember?.[memberSubId]?.period || q.period
        const out = { period, metrics: {} }
        ;(q.metrics || []).forEach(mid => {
          const mq = memberQuota(env, memberSubId, mid)
          out.metrics[mid] = { done: quotaAchieved(data, mid, period, new Date(), { env, subId: memberSubId }), target: mq.target }
        })
        return out
      },
      postOneToOneReport(channelId, report) {
        if (roBlocked()) return
        const sub = db.subenvs.find(s => s.id === session?.subEnvId)
        const name = sub ? `${sub.prenom} ${sub.nom}`.trim() : (account?.pseudo || 'Moi')
        setDb(d => {
          d.channelMessages = d.channelMessages || {}
          d.channelMessages[channelId] = d.channelMessages[channelId] || []
          d.channelMessages[channelId].push({
            id: uid(), ts: new Date().toISOString(),
            authorId: account?.id || null, authorSubId: sub?.id || null, authorName: name,
            authorPhoto: sub?.photo || '', text: '', reactions: {}, report,
          })
          return d
        })
      },
      // Un engagement se coche des DEUX côtés : c'est un contrat, pas une consigne.
      toggleOneToOneEngagement(channelId, msgId, engId) {
        if (roBlocked()) return
        setDb(d => {
          const m = (d.channelMessages?.[channelId] || []).find(x => x.id === msgId)
          if (!m?.report?.engagements) return d
          m.report.engagements = m.report.engagements.map(e => e.id === engId ? { ...e, done: !e.done } : e)
          return d
        })
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
      // Sourdine d'un canal : 'forever' (jusqu'à réactivation) ou une date de fin.
      // Une échéance passée ne coupe plus rien — inutile de la nettoyer pour que le canal
      // se remette à notifier tout seul.
      channelMuteUntil(channelId) {
        const v = account?.mutedChannels?.[channelId]
        if (!v) return null
        if (v === 'forever') return 'forever'
        return new Date(v) > new Date() ? v : null
      },
      isChannelMuted(channelId) { return !!this.channelMuteUntil(channelId) },
      // `until` : 'forever', une durée en millisecondes, ou null pour réactiver.
      muteChannel(channelId, until) {
        setDb(d => {
          const a = d.accounts.find(x => x.id === account?.id); if (!a) return d
          if (!a.mutedChannels || typeof a.mutedChannels !== 'object' || Array.isArray(a.mutedChannels)) a.mutedChannels = {}
          if (until == null) delete a.mutedChannels[channelId]
          else a.mutedChannels[channelId] = until === 'forever' ? 'forever' : new Date(Date.now() + Number(until)).toISOString()
          return d
        })
      },
      toggleMuteChannel(channelId) { this.muteChannel(channelId, this.isChannelMuted(channelId) ? null : 'forever') },
      markChannelRead(channelId) {
        setDb(d => { const a = d.accounts.find(x => x.id === account?.id); if (a) { a.channelReads = a.channelReads || {}; a.channelReads[channelId] = new Date().toISOString() } return d })
      },
      // Non-lus d'un canal : messages des autres ET messages postés par BD Report dans les
      // canaux de reporting. Ces derniers étaient exclus, si bien qu'un canal de reporting
      // ne prévenait jamais de rien — il fallait penser à aller le consulter.
      channelUnread(channelId) {
        const last = account?.channelReads?.[channelId]
        return (db.channelMessages?.[channelId] || [])
          .filter(m => m.authorId !== account?.id && (!last || m.ts > last)).length
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
      // Le staff entre dans l'espace d'un client pour y vérifier ou corriger quelque chose.
      // Il garde SON compte et donc ses droits : ce n'est pas une usurpation d'identité,
      // seulement un changement de point de vue — et l'action est tracée, car voir les
      // données d'un client ne doit jamais passer inaperçu.
      enterClientSpace(envId, subId) {
        const sub = db.subenvs.find(x => x.id === subId)
        const env = db.environments.find(e => e.id === envId)
        if (!sub || !env) return false
        setDb(d => {
          pushSupportLog(d, {
            type: 'Accès', action: 'Entrée dans un espace client',
            details: `${env.name} · ${sub.prenom} ${sub.nom}`.trim(),
            actorId: account?.id || null, actorName,
          })
          return d
        })
        setSession(s => ({ ...s, envId, subEnvId: subId }))
        return true
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
        if (!r) return isClientManagerRole(account?.role)
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
        if (!accountHasPerm(account, 'accounts.role', db) && !this.hasClientPerm('team.manage')) return
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
        const before = (db.staffRoles || []).find(x => (x.roleKey || x.name) === roleKey)
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
        // Journal : ce qui compte en revue, ce n'est pas « un rôle a changé », c'est QUEL
        // droit a été accordé ou retiré, et par qui.
        const prev = new Set(before?.permissions || [])
        const next = new Set(Array.isArray(patch?.permissions) ? patch.permissions : (before?.permissions || []))
        const added = [...next].filter(x => !prev.has(x))
        const removed = [...prev].filter(x => !next.has(x))
        const label = (id) => (STAFF_PERMISSIONS.find(x => x.id === id) || {}).label || id
        const bits = []
        if (added.length) bits.push('+ ' + added.map(label).join(', '))
        if (removed.length) bits.push('− ' + removed.map(label).join(', '))
        if (patch?.suspended !== undefined) bits.push(patch.suspended ? 'rôle suspendu' : 'rôle réactivé')
        if (typeof patch?.rank === 'number') bits.push(`rang → ${patch.rank}`)
        if (bits.length) this.logStaff({ type: 'Permission', cat: 'acces', action: `Rôle « ${roleKey} »`, details: bits.join(' · ') })
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
        const before = target?.role
        setDb(d => { const a = d.accounts.find(x => x.id === accId); if (a) a.role = role; return d })
        this.logStaff({ type: 'Compte', cat: 'acces', action: 'Rôle modifié', details: `${before || '—'} → ${role}`, targetId: accId })
      },
      // Rôles attribuables côté staff : tout ce qui n'est pas un rôle client
      // (Manager et Membre appartiennent aux environnements, pas à l'équipe BD Report).
      staffRoleKeys() { return this.allRoles().filter(r => !isClientRole(r)) },
      // Comptes clients regroupés par environnement, pour aller chercher quelqu'un
      // dans une entreprise cliente et le faire entrer dans l'équipe BD Report.
      clientAccountsByEnv() {
        return db.environments.map(env => {
          const people = this.envMembers(env.id)
            .filter(m => isClientRole(m.account.role))
            .map(m => ({
              account: m.account,
              name: m.sub ? `${m.sub.prenom} ${m.sub.nom}`.trim() : (m.account.pseudo || m.account.email),
            }))
          return { env, people }
        }).filter(g => g.people.length)
      },
      // Fait entrer un compte existant dans l'équipe BD Report. Le compte garde son
      // accès client (ses espaces ne sont pas touchés) : seul son rôle change, ce qui
      // le fait apparaître dans l'organigramme et la matrice des droits staff.
      joinStaff(accId, role = 'Développeur', teamOf = null) {
        const target = db.accounts.find(a => a.id === accId)
        if (!target || !isClientRole(target.role)) return null
        if (isClientRole(role)) return null
        this.setAccountRole(accId, role)
        // setAccountRole refuse silencieusement si l'acteur n'a pas la main : le rattachement
        // ne suit que si le rôle a effectivement basculé, sinon on laisserait un lien orphelin
        // vers un responsable staff sur un compte resté client.
        setDb(d => {
          const a = d.accounts.find(x => x.id === accId)
          if (a && !isClientRole(a.role) && teamOf) a.teamOf = teamOf
          return d
        })
        return accId
      },
      // Crée un compte de l'équipe BD Report de toutes pièces. Ne passe pas par
      // `addAccount` : celui-ci consomme un siège de l'offre du client courant, ce qui
      // n'a pas de sens pour un collègue de l'éditeur.
      createStaffAccount(data) {
        if (roBlocked()) return { error: 'Lecture seule' }
        if (!accountHasPerm(account, 'accounts.create', db)) return { error: 'Droit « Créer un utilisateur » requis.' }
        const email = String(data?.email || '').trim().toLowerCase()
        const pseudo = String(data?.pseudo || '').trim()
        const password = String(data?.password || '')
        const role = data?.role || 'Développeur'
        if (!email || !pseudo || !password) return { error: 'E-mail, pseudo et mot de passe sont obligatoires.' }
        if (isClientRole(role)) return { error: 'Ce rôle appartient aux environnements clients.' }
        if (!this.canManageRole(role)) return { error: `Vous ne pouvez pas attribuer le rôle « ${role} ».` }
        if (db.accounts.some(a => (a.email || '').toLowerCase() === email)) return { error: 'Un compte utilise déjà cet e-mail.' }
        if (db.accounts.some(a => (a.pseudo || '').toLowerCase() === pseudo.toLowerCase())) return { error: 'Ce pseudo est déjà pris.' }
        const acc = {
          id: uid(), email, pseudo, password: hashPw(password),
          role, developer: role === 'Développeur', plan: 'beta', photo: '', bricks: [...BRICKS],
          teamOf: data?.teamOf || null, staffServiceId: data?.staffServiceId || '',
        }
        setDb(d => { d.accounts.push(acc); return d })
        return { account: acc }
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
        this.logStaff({ type: 'Compte', cat: 'acces', action: disabled ? 'Accès désactivé' : 'Accès réactivé', targetId: accId })
      },
      // Efface toutes les données d'un espace (remise à zéro complète).
      wipeSpaceData(subId) {
        if (!accountHasPerm(account, 'accounts.wipe', db)) return
        const sub = db.subenvs.find(s => s.id === subId)
        setDb(d => { if (d.data[subId]) d.data[subId] = emptySubEnvData(); return d })
        this.logStaff({ type: 'Données', cat: 'donnees', action: "Données d'un espace effacées",
          envId: sub?.envId, targetId: sub?.ownerId, targetName: sub ? `${sub.prenom} ${sub.nom}`.trim() : '' })
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
        this.logStaff({ type: 'Compte', cat: 'acces', action: "Membre retiré de l'environnement", envId, targetId: accId })
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
      // ===================================================== Mots de passe
      // ⚠️ PLUS AUCUN MOT DE PASSE EN CLAIR, nulle part. Un manager ne peut plus AFFICHER
      // le mot de passe d'un collaborateur : il peut le RÉINITIALISER, ce qui couvre le
      // besoin réel (« il ne peut plus entrer ») sans conserver un secret réutilisable
      // ailleurs — dans l'état synchronisé, dans une sauvegarde, chez un tiers.
      // Ce que le manager conserve, et qui était la vraie demande : l'accès à l'ESPACE de
      // ses collaborateurs (droit `team.view` / `team.manage`), qui n'a jamais eu besoin de
      // leur mot de passe.
      canResetPasswords() { return accountHasPerm(account, 'passwords.reset', db) },
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
        const elevated = isElevatedRole(account?.role) || accountHasPerm(account, 'accounts.role', db)
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
        if (a.password && !String(a.password).startsWith('sha256:')) a.password = hashPw(a.password)
        delete a.passwordPlain
        setDb(d => { d.accounts.push(a); return d })
        return a
      },
      // Définit un nouveau mot de passe (stocke uniquement le hash — jamais le clair).
      setAccountPassword(id, plain) {
        if (roBlocked()) return
        setDb(d => { const a = d.accounts.find(x => x.id === id); if (a) { a.password = hashPw(plain); delete a.passwordClear; delete a.passwordPlain } return d })
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
          // Une livraison archivée revient ENTIÈRE : projet, environnement, espaces et
          // données. Restaurer la fiche seule recréerait exactement le désordre qu'on corrige.
          else if (item.kind === 'project') restoreDelivery(d, item)
          d.supportTrash = d.supportTrash.filter(x => x.id !== trashId)
          return d
        })
      },
      purgeSupportItem(trashId) {
        // Une livraison ne se purge pas comme une ligne : elle emporte les comptes qui ne
        // vivaient que là. Un seul chemin, sinon vider la corbeille et décider depuis le
        // ticket ne feraient pas la même chose.
        const item = (db.supportTrash || []).find(x => x.id === trashId)
        if (item?.kind === 'project') return this.purgeClosedProject(trashId)
        setDb(d => { d.supportTrash = (d.supportTrash || []).filter(x => x.id !== trashId); return d })
        return []
      },
      // ----- Le sort d'un projet fermé, décidé depuis son ticket de fermeture
      // Deux issues, et deux seulement : on remet tout en place, ou on efface pour de bon.
      // Laisser un projet fermé « en attente » indéfiniment est ce qui produit des comptes
      // désactivés dont plus personne ne sait s'ils doivent revivre.
      closureTrashEntry(ticketId) {
        const t = (db.tickets || []).find(x => x.id === ticketId)
        const id = t?.projectClosure?.trashId
        return id ? (db.supportTrash || []).find(x => x.id === id) || null : null
      },
      restoreClosedProject(trashId) {
        if (!accountHasPerm(account, 'projects.manage', db)) return false
        const item = (db.supportTrash || []).find(x => x.id === trashId)
        if (!item || item.kind !== 'project') return false
        setDb(d => {
          const it = (d.supportTrash || []).find(x => x.id === trashId); if (!it) return d
          restoreDelivery(d, it)
          d.supportTrash = d.supportTrash.filter(x => x.id !== trashId)
          return d
        })
        this.logStaff({
          type: 'Projet', cat: 'projet', action: 'Projet rétabli après fermeture',
          details: item.label || '', envId: item.data?.env?.id || null,
        })
        return true
      },
      purgeClosedProject(trashId) {
        if (!accountHasPerm(account, 'projects.manage', db)) return false
        const item = (db.supportTrash || []).find(x => x.id === trashId)
        if (!item || item.kind !== 'project') return false
        let removed = []
        setDb(d => {
          const it = (d.supportTrash || []).find(x => x.id === trashId); if (!it) return d
          removed = purgeDelivery(d, it)
          return d
        })
        this.logStaff({
          type: 'Projet', cat: 'projet', action: 'Projet supprimé définitivement',
          details: `${item.label || ''} · ${removed.length} compte${removed.length > 1 ? 's' : ''} supprimé${removed.length > 1 ? 's' : ''}`,
          envId: item.data?.env?.id || null,
        })
        return removed
      },
      // Ce que ce compte perdrait à la purge : à montrer avant de trancher.
      closureImpact(trashId) {
        const item = (db.supportTrash || []).find(x => x.id === trashId)
        const ids = [...new Set([...(item?.data?.memberAccounts || []), item?.data?.ownerAccountId].filter(Boolean))]
        const accounts = ids.map(id => db.accounts.find(a => a.id === id)).filter(a => a && isClientRole(a.role))
        return {
          entry: item || null,
          spaces: (item?.data?.subenvs || []).length,
          accounts: accounts.length,
          owner: db.accounts.find(a => a.id === item?.data?.ownerAccountId) || null,
        }
      },
      // Le compte courant est-il celui d'un propriétaire dont le projet a été fermé ?
      // Il peut se connecter, mais l'application ne lui ouvre que cette discussion.
      closureTicket() {
        const id = account?.closureTicketId
        if (!id) return null
        const t = (db.tickets || []).find(x => x.id === id)
        // Un ticket disparu (purgé par le support) ne doit pas enfermer quelqu'un dans un
        // écran vide : sans lui, le compte reprend son cours normal.
        return t || null
      },
      emptySupportTrash() {
        // Vider la corbeille passe par le MÊME chemin que purger une ligne : sans quoi les
        // livraisons partiraient sans emporter les comptes qu'elles ont fermés, et une
        // équipe entière resterait désactivée sans plus rien à quoi la rattacher.
        const projects = (db.supportTrash || []).filter(t => t.kind === 'project')
        if (projects.length && !accountHasPerm(account, 'projects.manage', db)) return false
        setDb(d => {
          ;(d.supportTrash || []).filter(t => t.kind === 'project').forEach(t => purgeDelivery(d, t))
          d.supportTrash = []
          return d
        })
        if (projects.length) {
          this.logStaff({ type: 'Projet', cat: 'projet', action: 'Corbeille vidée', details: `${projects.length} livraison${projects.length > 1 ? 's' : ''} supprimée${projects.length > 1 ? 's' : ''} définitivement` })
        }
        return true
      },
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
      // Supprimer l'environnement, c'est le MÊME geste que supprimer sa livraison, vu de
      // l'autre côté : il passe donc par le même chemin — archive, ticket de fermeture,
      // client classé « ancien ». Deux suppressions aux effets différents pour un même
      // objet finissent toujours par en laisser une moitié derrière.
      deleteClientEnv(envId, { reason = '' } = {}) {
        const env = db.environments.find(e => e.id === envId)
        let entry = null
        setDb(d => {
          entry = archiveDelivery(d, { envId, reason, actorId: account?.id || null, actorName })
          return d
        })
        this.logStaff({
          type: 'Client', cat: 'client', action: 'Environnement client archivé',
          details: `${env?.name || ''}${reason ? ` · ${reason}` : ''}`, envId,
        })
        return entry
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
      // Supprimer une livraison, c'est supprimer le CLIENT LIVRÉ : l'environnement, ses
      // espaces et leurs données partent avec — en archive, et avec un ticket de fermeture.
      // Retirer la fiche seule laissait l'environnement tourner sans que personne ne le voie.
      deleteProject(id, { reason = '' } = {}) {
        const p = (db.projects || []).find(x => x.id === id)
        if (!p || !this.canEditProject(p)) return null
        let entry = null
        setDb(d => {
          entry = archiveDelivery(d, { projectId: id, reason, actorId: account?.id || null, actorName })
          return d
        })
        this.logStaff({
          type: 'Projet', cat: 'projet', action: 'Projet et environnement archivés',
          details: `${p.name || p.clientName || ''}${reason ? ` · ${reason}` : ''}`,
          envId: p.envId || p.sourceEnvId || null,
        })
        return entry
      },
      // Ce que la suppression emportera : à montrer AVANT de la demander. Personne ne peut
      // consentir à effacer « 3 espaces et 4 membres » sans qu'on le lui ait dit.
      deliveryImpact({ projectId, envId } = {}) {
        const project = projectId
          ? (db.projects || []).find(p => p.id === projectId)
          : (db.projects || []).find(p => p.sourceEnvId === envId || p.envId === envId)
        const eid = envId || project?.envId || project?.sourceEnvId || null
        const env = eid ? db.environments.find(e => e.id === eid) : null
        const subenvs = eid ? db.subenvs.filter(s => s.envId === eid) : []
        return { project: project || null, env, spaces: subenvs.length, members: eid ? this.envMembers(eid).length : 0 }
      },
      // Environnements sans livraison : ceux qui « se baladent ». On ne les supprime JAMAIS
      // tout seul — une migration qui efface des données client est pire que le désordre
      // qu'elle corrige. On les montre, et le staff tranche : archiver ou rouvrir la livraison.
      orphanEnvs() {
        return db.environments.filter(e => e.id !== 'env-demo'
          && !(db.projects || []).some(p => p.envId === e.id || p.sourceEnvId === e.id))
      },
      // Rouvre une livraison pour un environnement qui n'en a plus : l'autre issue, quand
      // l'environnement doit vivre.
      recreateDelivery(envId) {
        if (!accountHasPerm(account, 'projects.manage', db)) return null
        const env = db.environments.find(e => e.id === envId); if (!env) return null
        let made = null
        setDb(d => {
          const e = d.environments.find(x => x.id === envId); if (!e) return d
          if ((d.projects || []).some(p => p.envId === envId || p.sourceEnvId === envId)) return d
          made = makeProjectFromEnv(e)
          d.projects = [made, ...(d.projects || [])]
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projet', action: 'Livraison rouverte', details: env.name, envId })
        return made
      },
      // ----- Prise en charge d'un projet
      // Un projet sans preneur est à tout le monde, c'est-à-dire à personne : les demandes
      // s'accumulent et chacun suppose que le voisin s'en occupe. Le prendre en charge, c'est
      // dire « je m'en occupe », et l'inscrire à son agenda.
      takeProject(id) {
        if (!accountHasPerm(account, 'projects.manage', db)) return
        const p = (db.projects || []).find(x => x.id === id)
        if (p?.ownerId && p.ownerId !== account?.id && !accountHasPerm(account, 'projects.others', db)) return
        setDb(d => {
          const pr = (d.projects || []).find(x => x.id === id); if (!pr) return d
          pr.ownerId = account?.id || null
          pr.owner = account?.pseudo || pr.owner || ''
          pr.takenAt = new Date().toISOString()
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projet', action: 'Projet pris en charge', details: p?.name || p?.clientName || '', envId: p?.envId || null })
      },
      releaseProject(id) {
        const p = (db.projects || []).find(x => x.id === id)
        if (!p) return
        if (p.ownerId && p.ownerId !== account?.id && !accountHasPerm(account, 'projects.others', db)) return
        setDb(d => {
          const pr = (d.projects || []).find(x => x.id === id); if (!pr) return d
          pr.ownerId = null; pr.takenAt = ''
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projet', action: 'Prise en charge relâchée', details: p.name || p.clientName || '', envId: p.envId || null })
      },
      // ----- Atelier : ouvrir un accès chez un client depuis la console éditeur
      // `addAccount` consomme un siège de l'offre de l'environnement COURANT et refuse en
      // Starter : inadapté quand le staff équipe l'environnement d'un client depuis chez lui.
      provisionEnvMember({ envId, email, pseudo, password, prenom, nom, poste, service, roleId, isManager, isOwner }) {
        if (!accountHasPerm(account, 'accounts.create', db)) return { error: "Vous n'avez pas le droit de créer des comptes." }
        const env = db.environments.find(e => e.id === envId)
        if (!env) return { error: 'Environnement introuvable.' }
        const mail = String(email || '').trim().toLowerCase()
        const nick = String(pseudo || '').trim()
        if (!mail || !nick || !password) return { error: 'E-mail, pseudo et mot de passe sont requis.' }
        if (db.accounts.some(a => (a.email || '').toLowerCase() === mail)) return { error: 'Cette adresse e-mail est déjà utilisée.' }
        if (db.accounts.some(a => (a.pseudo || '') === nick)) return { error: 'Ce pseudo est déjà utilisé.' }
        const plan = env.plan || 'beta'
        const bricks = findOffer(db.offers, plan)?.bricks || BRICKS
        const acc = {
          id: uid(), email: mail, pseudo: nick, password: hashPw(password),
          role: isManager ? 'Manager' : 'Membre', developer: false, plan, photo: '',
          bricks: [...bricks], teamOf: null, createdAt: new Date().toISOString(),
        }
        const sub = {
          id: uid(), envId, prenom: prenom || nick, nom: nom || '', poste: poste || '',
          service: service || '', pin: '0000', photo: '', ownerId: acc.id, roleId: roleId || null,
        }
        setDb(d => {
          d.accounts.push(acc)
          const e = d.environments.find(x => x.id === envId)
          e.members = [...new Set([...(e.members || []), acc.id])]
          if (isOwner) e.createdBy = acc.id
          d.subenvs.push(sub)
          const tpl = e._template
          d.data[sub.id] = tpl ? { ...emptySubEnvData(), ...structuredClone(tpl) } : emptySubEnvData()
          return d
        })
        this.logStaff({ type: 'Compte', cat: 'acces', action: 'Accès ouvert chez un client', details: `${nick} · ${isManager ? 'Manager' : 'Membre'}`, envId, targetId: acc.id, targetName: nick })
        return { account: acc, sub }
      },
      setEnvOwner(envId, accId) {
        if (!accountHasPerm(account, 'accounts.role', db)) return
        setDb(d => { const e = d.environments.find(x => x.id === envId); if (e) e.createdBy = accId; return d })
        this.logStaff({ type: 'Compte', cat: 'acces', action: "Propriétaire de l'environnement modifié", envId, targetId: accId })
      },
      // Ce que verrait un titulaire de rôle, sans entrer dans l'environnement.
      previewRole(envId, roleId) {
        const env = db.environments.find(e => e.id === envId)
        const role = (env?.roles || []).find(r => r.id === roleId) || null
        return { role, tabs: previewTabs(env, db.offers, role) }
      },
      // ----- Cycle de vie d'un projet d'implémentation
      // Déployer, c'est déclarer que la phase de cadrage est finie et que l'environnement part
      // entre les mains du client. Le geste est explicite : il ferme une étape et en ouvre une
      // autre, plutôt que de laisser chacun deviner où en est la mise en place.
      deployEnvProject(envId) {
        if (!accountHasPerm(account, 'projects.manage', db)) return
        const env = db.environments.find(e => e.id === envId)
        setDb(d => {
          const p = (d.projects || []).find(x => x.sourceEnvId === envId || x.envId === envId)
          if (!p) return d
          p.phases = p.phases || []
          const cadrage = p.phases.find(ph => ph.name === 'Cadrage')
          if (cadrage) cadrage.done = true
          let impl = p.phases.find(ph => ph.name === 'Implémentation')
          if (!impl) {
            const start = todayISO()
            impl = { id: uid(), name: 'Implémentation', start, end: addDaysISO(start, 13), done: false, color: PROJECT_PHASE_COLORS[1] }
            p.phases.splice(Math.max(0, p.phases.findIndex(ph => ph.name === 'Cadrage') + 1), 0, impl)
          }
          p.currentPhase = 'Implémentation'
          p.deployedAt = new Date().toISOString()
          p.deployedBy = account?.pseudo || ''
          if (p.status === 'prevu') { p.status = 'encours'; p.statusLocked = true }
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projet', action: 'Environnement déployé', details: env?.name || '', envId })
      },
      // Un membre du staff vient d'entrer chez un client : le projet passe en Maintenance, le
      // temps de l'intervention. Ce n'est pas de la surveillance — c'est ce qui évite que deux
      // techniciens travaillent au même moment sur la même configuration sans le savoir.
      markProjectMaintenance(envId) {
        // Même clé que l'entrée : qui peut entrer chez un client y intervient, et la trace
        // doit suivre. Un critère plus étroit ici laisserait des interventions sans trace.
        if (!this.canEnterClientEnvs() || !envId) return
        setDb(d => {
          const p = (d.projects || []).find(x => x.sourceEnvId === envId || x.envId === envId)
          if (!p) return d
          p.phases = p.phases || []
          if (!p.phases.some(ph => ph.name === MAINTENANCE_PHASE)) {
            const start = todayISO()
            p.phases.push({ id: uid(), name: MAINTENANCE_PHASE, start, end: start, done: false, color: PROJECT_PHASE_COLORS[7] })
          }
          p.currentPhase = MAINTENANCE_PHASE
          p.maintenanceBy = account?.pseudo || ''
          p.maintenanceAt = new Date().toISOString()
          return d
        })
      },
      // Fin d'intervention : le projet retrouve l'étape où il en était.
      endProjectMaintenance(envId, backTo = '') {
        if (!this.canEnterClientEnvs() || !envId) return
        const env = db.environments.find(e => e.id === envId)
        setDb(d => {
          const p = (d.projects || []).find(x => x.sourceEnvId === envId || x.envId === envId)
          if (!p || p.currentPhase !== MAINTENANCE_PHASE) return d
          const open = (p.phases || []).filter(ph => ph.name !== MAINTENANCE_PHASE && !ph.done)
          p.currentPhase = backTo || open[0]?.name || ''
          // La phase disparaît du projet : Maintenance est un ÉTAT, pas une étape du déroulé.
          // La laisser derrière encombrerait le planning et l'agenda d'une bande qui ne
          // correspond plus à rien. Elle sera reposée telle quelle à la prochaine intervention.
          p.phases = (p.phases || []).filter(ph => ph.name !== MAINTENANCE_PHASE)
          p.maintenanceBy = ''; p.maintenanceAt = ''
          return d
        })
        this.logStaff({ type: 'Projet', cat: 'projet', action: 'Intervention terminée', details: env?.name || '', envId })
      },
      // Qui peut modifier ce projet : personne ne l'a pris, c'est le mien, ou j'ai le droit
      // d'intervenir sur celui d'un autre.
      canEditProject(p) {
        if (!accountHasPerm(account, 'projects.manage', db)) return false
        if (!p?.ownerId || p.ownerId === account?.id) return true
        return accountHasPerm(account, 'projects.others', db)
      },
      myProjects() { return (db.projects || []).filter(p => p.ownerId === account?.id) },
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

  // Même rôle que __bdrFlushSave : une porte d'entrée pour le test de fumée et le
  // diagnostic en console. La démo et la formation ne l'exposent pas, pour qu'un test
  // ne puisse pas viser par erreur un provider isolé au lieu du provider réel.
  if (!demo && typeof window !== 'undefined') window.__bdrStore = api
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

// ---------------------------------------------------------------- Mutations RDV avec automatisations
// Résout une phase « par défaut » (KO / SQL / Signée) dans le vocabulaire de l'équipe :
// une phase renommée dans « Créer votre écosystème » laisse un alias, et une phase
// supprimée ne doit surtout pas être réécrite sur le RDV — c'est ce qui faisait qu'un
// changement de statut posait une étiquette absente du pipeline, donc invisible au kanban.
export function resolvePhase(name, data) {
  const phases = data?.phases?.length ? data.phases : DEFAULT_PHASES
  if (phases.includes(name)) return name
  const alias = data?.phaseAliases?.[name]
  return alias && phases.includes(alias) ? alias : null
}

export function applyRdvAutomations(rdv, patch, data) {
  // Retourne le patch enrichi par les règles d'automatisation + entrées d'historique.
  const out = { ...patch }
  const hist = []
  const day = todayISO()
  if ('opportunite' in patch && patch.opportunite !== rdv.opportunite) {
    hist.push({ type: 'opportunite', value: patch.opportunite, date: day })
    const auto = { Perdue: 'KO', 'Gagnée': 'SQL', 'Signée': 'Signée' }[patch.opportunite]
    // `data` absent = ancien appelant : on garde le comportement historique.
    const target = auto ? (data === undefined ? auto : resolvePhase(auto, data)) : null
    if (target) out.phase = target
  }
  if ('phase' in out && out.phase !== rdv.phase) {
    hist.push({ type: 'phase', value: out.phase, date: day })
    // Passation au closer : franchir le jalon remet le dossier entre d'autres mains. On
    // ouvre la demande ici plutôt que dans l'écran, pour que le glisser-déposer du kanban
    // et le tableau la déclenchent aussi. L'enregistrement est inerte tant que le module
    // n'est pas activé sur l'environnement — c'est l'affichage qui décide, pas la donnée.
    if (data && rdvNeedsHandoff({ phase: out.phase }, data) && !rdv.handoff) {
      out.handoff = { state: 'pending', to: '', at: new Date().toISOString(), decidedAt: '', decidedBy: '', reason: '' }
    }
  }
  // Recyclage : un refus n'est presque jamais définitif, il est prématuré. Le motif fixe
  // lui-même la date de re-tentative — posée ICI, au moment du refus, plutôt que réclamée
  // à quelqu'un qui vient de perdre une affaire et n'a aucune envie d'y penser.
  // Inerte tant que la brique n'est pas installée : c'est l'affichage qui décide, pas la donnée.
  const nextOpp = out.opportunite ?? rdv.opportunite
  const nextKo = out.motifKo ?? rdv.motifKo
  if (data && nextOpp === 'Perdue' && nextKo) {
    const days = recycleDelay(data, nextKo)
    // Une date déjà posée n'est pas réécrite : sinon, corriger un motif deux jours plus tard
    // repousserait la relance sans que personne ne l'ait demandé.
    if (days > 0 && !rdv.recycleAt) out.recycleAt = addDaysISO(day, days)
    if (days === 0 && !rdv.recycleAt) out.recycleAt = '' // motif sans retour possible
  }
  if (hist.length) out.history = [...(rdv.history || []), ...hist]
  return out
}

export function rdvNeedsSqlDate(rdv, patch, data) {
  const newPhase = patch.phase ?? rdv.phase
  const newOpp = patch.opportunite ?? rdv.opportunite
  // Les phases qui déclenchent une prime sont celles choisies dans « Créer votre
  // écosystème » : sans ça, renommer « SQL » faisait disparaître la demande de date
  // de passage, et donc la prime avec elle.
  const triggers = data?.primePhases?.length ? data.primePhases : ['SQL', 'Signée']
  const becomesSQL = triggers.includes(newPhase) || newOpp === 'Gagnée' || newOpp === 'Signée'
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
