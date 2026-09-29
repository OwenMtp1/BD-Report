// ============================================================================
//  Banc d'essai du MOTEUR D'IMPORT CRM (src/crmImport.js).
//
//  ⚠️ Pourquoi ce fichier : un import écrit dans les données d'une équipe, et c'est
//  irréversible. La règle du produit — « rien n'est écrasé sans décision » — ne vaut
//  que si elle est vérifiée : une ligne de trop dans un `mergeInto` et le numéro de
//  téléphone qu'un commercial a corrigé à la main repart à la valeur du CRM, sans
//  que personne ne s'en aperçoive avant d'appeler dans le vide.
//
//  Le moteur est partagé par HubSpot et Pipedrive : ce banc les couvre tous les deux.
// ============================================================================
import { applyCrmImport, importSummary } from '../src/crmImport.js'

let failures = 0
const ok = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`)
  else { failures++; console.log(`  ✖ ${label}`) }
}

const base = () => ({
  contacts: [
    // ⚠️ Ce contact a été CORRIGÉ à la main : son téléphone ne doit jamais bouger.
    { id: 'c1', nom: 'Léa Martin', email: 'lea@acme.fr', tel: '06 11 22 33 44', poste: '', entreprise: 'Acme' },
  ],
  companies: {
    Acme: { localisation: 'Lyon', secteur: '' },
  },
})

console.log('\n=== MOTEUR D\'IMPORT CRM ===')

// --- 1. Création ------------------------------------------------------------
console.log('\n· Ce qui n\'existe pas est créé')
{
  const { data, report } = applyCrmImport(base(), {
    contacts: [{ nom: 'Paul Dubois', email: 'paul@globex.fr', tel: '0600000000', poste: 'DAF' }],
    companies: [{ nom: 'Globex', site: 'https://globex.fr' }],
  }, 'HubSpot')
  ok(report.contacts.created === 1, 'un contact inconnu est créé')
  ok(report.companies.created === 1, 'une entreprise inconnue est créée')
  ok(data.contacts.find(c => c.email === 'paul@globex.fr')?.source === 'HubSpot', 'la provenance est inscrite')
  ok(!!data.companies.Globex, "l'entreprise entre dans data.companies, sous son nom")
}

// --- 2. LA RÈGLE : on complète, on n'écrase JAMAIS --------------------------
console.log('\n· Une saisie humaine n\'est jamais remplacée')
{
  const { data, report } = applyCrmImport(base(), {
    contacts: [{
      nom: 'Léa Martin', email: 'lea@acme.fr',
      tel: '01 99 99 99 99',      // ⚠️ DIFFÉRENT de ce qu'elle a saisi
      poste: 'Directrice achats',  // vide chez nous → doit entrer
    }],
    companies: [{ nom: 'Acme', localisation: 'Paris', secteur: 'Industrie' }],
  }, 'Pipedrive')

  const lea = data.contacts.find(c => c.email === 'lea@acme.fr')
  ok(lea.tel === '06 11 22 33 44', 'le téléphone SAISI survit à l\'import')
  ok(lea.poste === 'Directrice achats', 'le champ VIDE est complété')
  ok(data.companies.Acme.localisation === 'Lyon', "l'implantation saisie survit")
  ok(data.companies.Acme.secteur === 'Industrie', 'le secteur vide est complété')
  ok(report.contacts.completed === 1 && report.companies.completed === 1, 'les deux sont comptés « complétés »')

  // ⚠️ Un écart TU est pire qu'un écart écrasé : personne ne peut le corriger.
  const c = report.conflicts.find(x => x.field === 'tel')
  ok(!!c, "l'écart de téléphone est SIGNALÉ")
  ok(c?.mine === '06 11 22 33 44' && c?.theirs === '01 99 99 99 99', "le compte rendu montre les deux valeurs")
  ok(report.conflicts.some(x => x.field === 'localisation'), "l'écart d'implantation est signalé aussi")
}

// --- 3. Idempotence ---------------------------------------------------------
console.log('\n· Réimporter ne duplique rien')
{
  const rows = {
    contacts: [{ nom: 'Paul Dubois', email: 'paul@globex.fr', tel: '0600000000' }],
    companies: [{ nom: 'Globex', site: 'https://globex.fr' }],
  }
  const a = applyCrmImport(base(), rows, 'HubSpot')
  const b = applyCrmImport(a.data, rows, 'HubSpot')
  ok(b.data.contacts.length === a.data.contacts.length, 'aucun contact en double au second import')
  ok(Object.keys(b.data.companies).length === Object.keys(a.data.companies).length, 'aucune entreprise en double')
  ok(b.report.contacts.unchanged === 1 && b.report.companies.unchanged === 1, 'le second passage est compté « inchangé »')
}

// --- 4. La casse ne crée pas de doublon -------------------------------------
console.log('\n· « ACME » et « Acme » sont la même société')
{
  const { data, report } = applyCrmImport(base(), {
    contacts: [{ nom: 'Léa', email: 'LEA@ACME.FR', poste: 'DA' }],
    companies: [{ nom: 'ACME', secteur: 'Industrie' }],
  }, 'HubSpot')
  ok(data.contacts.length === 1, "l'e-mail en majuscules ne crée pas un second contact")
  ok(Object.keys(data.companies).length === 1, 'le nom en majuscules ne crée pas une seconde fiche')
  ok(data.companies.Acme.secteur === 'Industrie', "c'est la fiche EXISTANTE qui est complétée")
  ok(report.contacts.created === 0 && report.companies.created === 0, 'rien n\'est compté comme créé')
}

// --- 5. Ce qui est écarté est DIT -------------------------------------------
console.log('\n· Une ligne écartée repart avec sa raison')
{
  const { data, report } = applyCrmImport(base(), {
    contacts: [{ nom: 'Sans adresse', email: '', tel: '0700000000' }],
    companies: [{ nom: '' }],
  }, 'Pipedrive')
  ok(data.contacts.length === 1, 'un contact sans e-mail n\'entre pas (impossible à dédoublonner)')
  ok(report.contacts.skipped === 1, 'il est COMPTÉ comme écarté, pas avalé')
  ok(/e-mail/.test(report.skipped[0]?.why || ''), 'la raison est écrite, pas à deviner')
  ok(report.companies.skipped === 1, 'une entreprise sans nom est écartée')
}

// --- 6. Aucun champ inventé --------------------------------------------------
console.log('\n· L\'import ne crée aucun champ que les écrans ne sauraient afficher')
{
  const { data } = applyCrmImport(base(), {
    contacts: [{ nom: 'X', email: 'x@y.fr', inventé: 'valeur', hubspotId: '42' }],
    companies: [{ nom: 'Zeta', inventé: 'valeur', pipedriveId: 7 }],
  }, 'HubSpot')
  ok(data.companies.Zeta.inventé === undefined, "un champ hors fiche n'entre pas dans l'entreprise")
  ok(data.contacts.find(c => c.email === 'x@y.fr')?.inventé === undefined, "ni dans le contact")
}

// --- 7. L'état d'origine n'est jamais modifié sur place ----------------------
console.log('\n· L\'espace d\'origine n\'est pas muté')
{
  const avant = base()
  const copie = JSON.parse(JSON.stringify(avant))
  applyCrmImport(avant, { contacts: [{ nom: 'N', email: 'n@n.fr' }], companies: [{ nom: 'Neuf' }] }, 'HubSpot')
  ok(JSON.stringify(avant) === JSON.stringify(copie), "l'objet reçu est intact (React compare les références)")
}

// --- 8. Le résumé dit quelque chose -----------------------------------------
console.log('\n· Le résumé')
{
  const vide = applyCrmImport(base(), { contacts: [], companies: [] }, 'HubSpot')
  ok(/déjà à jour/.test(importSummary(vide.report)), 'un import sans changement le dit clairement')
}

if (failures) { console.error(`\n✖ import CRM : ${failures} contrôle(s) en échec`); process.exit(1) }
console.log('\nimport CRM OK ✓ — création, non-écrasement, écarts signalés, idempotence, casse, champs bornés')
