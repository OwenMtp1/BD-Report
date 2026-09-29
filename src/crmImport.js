// ---------------------------------------------------------------------------
//  IMPORT DEPUIS UN CRM — un seul moteur, deux sources (HubSpot, Pipedrive).
//
//  ⚠️ UNE SEULE IMPLÉMENTATION, et c'est la leçon d'OrgChart/ProjectOrgChart puis
//  de PipelineKanban. Ce qui diffère d'un CRM à l'autre, c'est la FORME des données ;
//  ce qui doit être identique, c'est la façon de les faire entrer chez nous —
//  dédoublonnage, refus d'écraser, compte rendu. Dupliquer cette logique aurait
//  condamné chaque correction à être faite deux fois, et oubliée une fois sur deux.
//  Chaque CRM rend donc des lignes NORMALISÉES, et tout le reste se passe ici.
//
//  ⚠️ ON NE REMPLACE JAMAIS CE QU'UN COMMERCIAL A SAISI. Même règle que
//  l'enrichissement groupé : un champ VIDE se remplit, un champ DIFFÉRENT est
//  signalé dans le compte rendu et laissé intact. En import de masse, personne ne
//  décide rien — et une valeur écrasée en silence est irrécupérable, là où un écart
//  signalé se tranche fiche par fiche.
//
//  ⚠️ L'ancien import HubSpot ne faisait qu'AJOUTER l'inconnu : un contact déjà
//  présent était ignoré en entier, même quand le CRM portait le téléphone qui nous
//  manquait. Et un contact sans e-mail disparaissait sans un mot. Les deux cas sont
//  désormais traités et COMPTÉS.
// ---------------------------------------------------------------------------

const norm = (s) => String(s || '').trim()
const low = (s) => norm(s).toLowerCase()
const uid = () => Math.random().toString(36).slice(2, 10)

// Champs d'un contact qu'un import a le droit de compléter.
const CONTACT_FIELDS = ['poste', 'email', 'tel', 'entreprise', 'secteur', 'linkedin']
// Champs d'une fiche entreprise. ⚠️ Exactement ceux d'`ENRICHABLE` (voir enrich.js) :
// l'import et l'enrichissement remplissent la MÊME fiche, et inventer un champ ici
// donnerait une donnée que plus aucun écran ne sait afficher.
const COMPANY_FIELDS = ['site', 'linkedin', 'localisation', 'ca', 'effectif', 'secteur']

/**
 * Fusionne une ligne entrante dans une fiche existante.
 * Rend { changed, filled[], conflicts[] } — jamais la fiche modifiée sur place.
 */
function mergeInto(target, incoming, fields) {
  const filled = []
  const conflicts = []
  const patch = {}
  for (const f of fields) {
    const v = norm(incoming[f])
    if (!v) continue
    const cur = norm(target[f])
    if (!cur) { patch[f] = v; filled.push(f); continue }
    if (low(cur) !== low(v)) conflicts.push({ field: f, mine: cur, theirs: v })
  }
  return { patch, filled, conflicts, changed: filled.length > 0 }
}

/**
 * Applique un import à l'état d'un espace.
 *
 * @param {object} data      l'espace (`db.data[subId]`) — JAMAIS modifié sur place
 * @param {object} rows      { contacts[], companies[] } déjà NORMALISÉS par le CRM
 * @param {string} source    'HubSpot' | 'Pipedrive' — inscrit sur ce qui est créé
 * @returns {{ data, report }}
 */
export function applyCrmImport(data, rows, source) {
  const contacts = [...(data.contacts || [])]
  const companies = { ...(data.companies || {}) }
  const report = {
    source,
    contacts: { created: 0, completed: 0, unchanged: 0, skipped: 0 },
    companies: { created: 0, completed: 0, unchanged: 0, skipped: 0 },
    conflicts: [],
    skipped: [],
  }

  // ------------------------------------------------------------- Contacts
  // ⚠️ La clé est l'E-MAIL : deux personnes peuvent porter le même nom, pas la même
  // adresse. Sans e-mail on ne peut pas dédoublonner de façon sûre — on le DIT plutôt
  // que de créer un doublon silencieux à chaque import.
  const byEmail = new Map()
  contacts.forEach((c, i) => { const e = low(c.email); if (e) byEmail.set(e, i) })

  for (const row of (rows.contacts || [])) {
    const email = low(row.email)
    if (!email) {
      report.contacts.skipped++
      report.skipped.push({ kind: 'contact', label: row.nom || '(sans nom)', why: "pas d'e-mail : impossible de dédoublonner sans risque" })
      continue
    }
    const idx = byEmail.get(email)
    if (idx === undefined) {
      contacts.push({
        id: uid(), nom: row.nom || row.email, poste: row.poste || '', entreprise: row.entreprise || '',
        email: row.email, tel: row.tel || '', secteur: row.secteur || '', linkedin: row.linkedin || '',
        source: source, consent: false, createdAt: row.createdAt || new Date().toISOString().slice(0, 10),
      })
      byEmail.set(email, contacts.length - 1)
      report.contacts.created++
      continue
    }
    const { patch, filled, conflicts, changed } = mergeInto(contacts[idx], row, CONTACT_FIELDS)
    if (changed) { contacts[idx] = { ...contacts[idx], ...patch }; report.contacts.completed++ }
    else report.contacts.unchanged++
    conflicts.forEach(c => report.conflicts.push({ kind: 'contact', label: contacts[idx].nom || email, ...c }))
  }

  // ---------------------------------------------------------- Entreprises
  // ⚠️ La clé est le NOM, parce que c'est ce que `data.companies` prend pour clé
  // partout ailleurs dans l'app. La comparaison est insensible à la casse : « Acme »
  // et « ACME » sont la même société, et créer les deux ferait deux fiches que rien
  // ne réconcilierait ensuite.
  const nameOf = new Map(Object.keys(companies).map(n => [low(n), n]))

  for (const row of (rows.companies || [])) {
    const name = norm(row.nom || row.name)
    if (!name) { report.companies.skipped++; continue }
    const existing = nameOf.get(low(name))
    if (!existing) {
      const fiche = {}
      COMPANY_FIELDS.forEach(f => { if (norm(row[f])) fiche[f] = norm(row[f]) })
      companies[name] = { ...fiche, source }
      nameOf.set(low(name), name)
      report.companies.created++
      continue
    }
    const { patch, filled, conflicts, changed } = mergeInto(companies[existing], row, COMPANY_FIELDS)
    if (changed) { companies[existing] = { ...companies[existing], ...patch }; report.companies.completed++ }
    else report.companies.unchanged++
    conflicts.forEach(c => report.conflicts.push({ kind: 'entreprise', label: existing, ...c }))
  }

  return { data: { ...data, contacts, companies }, report }
}

/** Phrase de compte rendu, pour le bandeau de l'écran. */
export function importSummary(r) {
  const p = (o, mot) => [
    o.created ? `${o.created} ${mot}${o.created > 1 ? 's' : ''} créé${o.created > 1 ? 's' : ''}` : '',
    o.completed ? `${o.completed} complété${o.completed > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ')
  const a = p(r.contacts, 'contact')
  const b = p(r.companies, 'entreprise')
  if (!a && !b) return 'Rien de nouveau : tout était déjà à jour.'
  return [a, b].filter(Boolean).join(' · ')
}
