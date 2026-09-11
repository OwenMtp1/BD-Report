// Test de fumée : rend l'app dans jsdom et traverse les écrans principaux.
// Les imports React sont dynamiques pour que react-dom s'initialise APRÈS la mise en place du DOM.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const win = dom.window
globalThis.window = win
globalThis.document = win.document
globalThis.localStorage = win.localStorage
globalThis.sessionStorage = win.sessionStorage
globalThis.HTMLInputElement = win.HTMLInputElement
globalThis.HTMLElement = win.HTMLElement
globalThis.Element = win.Element
globalThis.Node = win.Node
globalThis.Event = win.Event
globalThis.CustomEvent = win.CustomEvent
globalThis.MouseEvent = win.MouseEvent
globalThis.FileReader = win.FileReader
globalThis.Blob = win.Blob
globalThis.getComputedStyle = win.getComputedStyle.bind(win)
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = clearTimeout
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
win.ResizeObserver = globalThis.ResizeObserver
globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function main() {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { Simulate } = await import('react-dom/test-utils')
  const { StoreProvider, buildDemoDb, demoSession, applyRdvAutomations, rdvNeedsSqlDate, fmtDate,
          phaseAtLeast, qualifyPhase, milestonePhase, isWonPhase, isLostPhase, phaseRank, firstPhase, nextPhase, icpVerdict, phaseProbability, CLIENT_PERMISSION_IDS, STAFF_PERMISSION_IDS, isClientManagerRole, isElevatedRole, challengeScore, applyPrimeRules, fillTemplate, defaultEnvRoles, ENV_MODULES,
          handoffState, handoffStats, quotaAchieved, buildStatement, monthlyPaidPrimes,
          dealAnnualValue, pipelineValue, wonValue, valueBySource,
          closingState, closingStats, closingPhases } = await import('../src/store.jsx')

  // Pipeline personnalisé : renommer ou réordonner les étapes ne doit rien casser. Les
  // écrans comparaient aux noms d'origine écrits en dur — tableaux de bord à zéro, ICP
  // faussé, boutons de tâches écrivant une étape inexistante.
  {
    const def = { phases: ['R1', 'R2', 'MQL', 'SQL', 'KO', 'Signée'], primePhases: ['SQL', 'Signée'], wonPhases: ['Signée'], lostPhases: ['KO'] }
    if (milestonePhase(def) !== 'SQL') throw new Error('Le jalon par défaut doit être SQL')
    if (qualifyPhase(def) !== 'MQL') throw new Error('L\'étape de qualification par défaut doit être MQL')
    // Comportement identique à l'ancien code figé, sur le pipeline d'origine.
    if (!phaseAtLeast(def, 'Signée', 'MQL') || !phaseAtLeast(def, 'SQL', 'MQL') || !phaseAtLeast(def, 'MQL', 'MQL')) throw new Error('Entonnoir MQL faussé')
    if (phaseAtLeast(def, 'R2', 'MQL')) throw new Error('Un R2 ne doit pas compter comme qualifié')
    if (phaseAtLeast(def, 'KO', 'MQL')) throw new Error('Une étape perdue ne doit jamais compter comme avancée')
    if (phaseRank(def, 'KO') !== -1) throw new Error('Une étape perdue est hors classement')

    // Le même pipeline, entièrement renommé : tout doit suivre.
    const perso = { phases: ['Découverte', 'Cadrage', 'Qualifié', 'Gagné', 'Perdu'], primePhases: ['Qualifié'], wonPhases: ['Gagné'], lostPhases: ['Perdu'] }
    if (milestonePhase(perso) !== 'Qualifié') throw new Error('Le jalon doit suivre le pipeline personnalisé')
    if (qualifyPhase(perso) !== 'Cadrage') throw new Error('La qualification doit précéder le jalon')
    if (!phaseAtLeast(perso, 'Gagné', 'Qualifié')) throw new Error('Gagné doit compter comme ayant atteint le jalon')
    if (phaseAtLeast(perso, 'Perdu', 'Cadrage')) throw new Error('Perdu ne doit jamais compter comme avancé')
    if (!isWonPhase(perso, 'Gagné') || !isLostPhase(perso, 'Perdu')) throw new Error('Issue commerciale non reconnue')
    if (firstPhase(perso) !== 'Découverte') throw new Error('« Replanifier » doit ramener à la première étape')
    if (nextPhase(perso, 'Découverte') !== 'Cadrage') throw new Error('« Faire avancer » doit passer à l\'étape suivante')
    if (nextPhase(perso, 'Gagné') !== null) throw new Error('La dernière étape n\'a pas de suivante')
    // Pondération du prévisionnel : déduite du chemin restant, pas d'une table figée.
    if (phaseProbability(def, 'R1') !== 0.25) throw new Error('R1 doit valoir 25 % sur le pipeline par défaut')
    if (phaseProbability(def, 'SQL') !== 1) throw new Error('Au jalon, ce n\'est plus une prévision')
    if (phaseProbability(def, 'KO') !== 0) throw new Error('Une étape perdue ne pèse rien')
    if (!(phaseProbability(perso, 'Découverte') < phaseProbability(perso, 'Cadrage'))) throw new Error('La probabilité doit croître le long du pipeline')
    if (phaseProbability(perso, 'Inconnue') !== 0) throw new Error('Une étape absente du pipeline ne pèse rien')

    // Un pipeline sans issue déclarée ne doit pas planter : repli sur les valeurs d'origine.
    if (milestonePhase({}) !== 'SQL' || firstPhase({}) !== 'R1') throw new Error('Repli par défaut cassé')
  }

  // Un rôle créé sur mesure doit ouvrir ce que ses droits accordent. Neuf écrans
  // comparaient le NOM du rôle à une liste figée : la personne avait tous les droits et
  // voyait quand même le bouton disparaître, sans explication.
  {
    if (!CLIENT_PERMISSION_IDS.includes('team.channels')) throw new Error('Le droit sur les canaux manque au catalogue client')
    if (!STAFF_PERMISSION_IDS.includes('channels.manage')) throw new Error('Le droit sur les canaux manque au catalogue staff')
    if (!isClientManagerRole('Manager') || isClientManagerRole('Membre')) throw new Error('Repli historique fauss\u00e9')
    if (!isElevatedRole('Fondateur') || isElevatedRole('Manager')) throw new Error('Rôles élevés faussés')

    // Chaque brique livrée doit être représentée dans un panneau de droits. Sans ce test, une
    // feature ajoutée plus tard resterait invisible pour qui administre les accès — et
    // s'appliquerait à tout le monde par défaut, ce qui est exactement l'inverse du but.
    for (const p of ['pilot.targets', 'pilot.challenges', 'deals.close', 'primes.sign']) {
      if (!CLIENT_PERMISSION_IDS.includes(p)) throw new Error('Droit client manquant au catalogue : ' + p)
    }
    for (const p of ['env.build', 'env.modules', 'projects.others']) {
      if (!STAFF_PERMISSION_IDS.includes(p)) throw new Error('Droit staff manquant au catalogue : ' + p)
    }
    // Le rôle Manager intégré doit porter TOUS les droits client : c'est lui qui administre.
    const mgr = defaultEnvRoles().find(r => r.id === 'erole-manager')
    const missing = CLIENT_PERMISSION_IDS.filter(p => !(mgr.perms || []).includes(p))
    if (missing.length) throw new Error("Le rôle Manager n'a pas les droits : " + missing.join(', '))
    // Chaque module optionnel doit être décidable par le staff, sinon il s'impose au client.
    const modules = ENV_MODULES.map(m => m.id)
    for (const m of ['handoff', 'committee', 'quotas', 'oneToOne', 'challenges', 'statements']) {
      if (!modules.includes(m)) throw new Error('Module absent du catalogue : ' + m)
    }
  }

  // Entretiens 1:1 : un canal par binôme, créé automatiquement, et aussi privé qu'un message
  // direct — un manager qui administre les canaux ne doit pas lire ceux des autres binômes.
  {
    const d = buildDemoDb({})
    const o2o = (d.channels || []).filter(c => c.oneToOne)
    if (!o2o.length) throw new Error('Aucun canal 1:1 créé automatiquement')
    const sara = o2o.find(c => c.oneToOne.memberSubId === 'dsub-b2')
    if (!sara) throw new Error('Le 1:1 de Sara avec son manager est absent')
    if (sara.members.length !== 2) throw new Error('Un 1:1 ne réunit que le membre et son manager')
    if (!sara.members.includes('dsub-mgr') || !sara.members.includes('dsub-b2')) throw new Error('Mauvais binôme sur le 1:1')
    // Le manager n'a pas de 1:1 avec lui-même, et personne n'est dans le 1:1 d'un tiers.
    if (o2o.some(c => c.oneToOne.memberSubId === c.oneToOne.managerSubId)) throw new Error('Un 1:1 avec soi-même a été créé')
    if (o2o.some(c => c.members.includes('dsub-b1') && c.oneToOne.memberSubId !== 'dsub-b1')) {
      throw new Error("Un membre ne doit pas figurer dans le 1:1 d'un collègue")
    }
    const msgs = (d.channelMessages || {})[sara.id] || []
    if (!msgs.some(m => m.report?.engagements?.length)) throw new Error('Le 1:1 de démonstration doit porter un compte rendu avec engagements')
    if (!msgs.some(m => m.report?.snapshot?.metrics)) throw new Error('Un compte rendu doit figer les chiffres du jour')
  }

  // Challenges : bornés dans le temps, et comptés comme les quotas — deux façons de compter
  // un SQL dans la même app, et plus personne ne fait confiance au chiffre.
  {
    const d = buildDemoDb({})
    const env = d.environments.find(e => e.id === 'env-demo')
    const chals = env.challenges || []
    if (chals.length < 2) throw new Error('La démo doit porter un challenge en cours et un terminé')
    const today = new Date().toISOString().slice(0, 10)
    if (!chals.some(c => c.start <= today && today <= c.end)) throw new Error('Aucun challenge en cours dans la démo')
    if (!chals.some(c => c.end < today)) throw new Error('Aucun challenge terminé dans la démo')
    const live = chals.find(c => c.start <= today && today <= c.end)
    const scored = challengeScore(d.data['dsub-b1'] || {}, live.metric, live.start, live.end)
    if (typeof scored !== 'number') throw new Error('Le score de challenge doit être un nombre')
    if (challengeScore(d.data['dsub-b1'] || {}, 'sql', '2000-01-01', '2000-01-02') !== 0) {
      throw new Error('Un challenge hors fenêtre ne doit rien compter')
    }
  }

  // Modulateurs de prime : rien n'est imposé. Désactivés, ils ne touchent à aucun montant ;
  // activés, chaque étape du calcul doit être nommée.
  {
    const base = { rdvs: [], bareme: [], primePhases: ['SQL'] }
    if (applyPrimeRules(1000, { data: base, env: null, subId: 'x', monthKey: '2026-09' }).total !== 1000) {
      throw new Error('Sans règle activée, le total du barème ne doit pas bouger')
    }
    // Plafond seul : il s'applique même sans quota posé (il n'en dépend pas).
    const capped = applyPrimeRules(1000, {
      data: { ...base, primeRules: { on: true, refMetric: 'sql', threshold: { on: false }, accelerator: { on: false }, quality: { on: false }, cap: { on: true, amount: 600 } } },
      env: null, subId: 'x', monthKey: '2026-09',
    })
    if (capped.total !== 600) throw new Error('Le plafond mensuel ne s\'applique pas')
    if (!capped.steps.length) throw new Error('Un montant modifié doit être expliqué étape par étape')
    // Seuil et accélérateur sans quota : sans base de calcul, ils restent sans effet.
    const noQuota = applyPrimeRules(1000, {
      data: { ...base, primeRules: { on: true, refMetric: 'sql', threshold: { on: true, pct: 90 }, accelerator: { on: false }, quality: { on: false }, cap: { on: false } } },
      env: null, subId: 'x', monthKey: '2026-09',
    })
    if (noQuota.total !== 1000) throw new Error('Sans quota posé, le seuil ne doit rien retirer')
  }

  // Variables d'un modèle : une valeur manquante reste VISIBLE. Un message qui commence par
  // « Bonjour , » est pire que pas de message du tout.
  {
    if (fillTemplate('Bonjour {prenom} de {entreprise}', { prenom: 'Claire', entreprise: 'NovaTech' }) !== 'Bonjour Claire de NovaTech') {
      throw new Error('Le remplissage des variables est cassé')
    }
    if (fillTemplate('Bonjour {prenom},', {}) !== 'Bonjour [prenom],') throw new Error('Une variable sans valeur doit rester visible')
    if (fillTemplate('Bonjour {prenom},', { prenom: '' }) !== 'Bonjour [prenom],') throw new Error('Une valeur vide ne doit pas produire un trou silencieux')
  }

  // Passation : un verdict rendu ne s'efface JAMAIS, quoi que devienne le dossier ensuite.
  // Et « primes du mois » n'a qu'une seule définition : le mois de VERSEMENT.
  {
    const base = {
      phases: ['R1', 'SQL', 'KO', 'Signée'], primePhases: ['SQL'], wonPhases: ['Signée'], lostPhases: ['KO'],
      primeCutoffDay: 15, bareme: [{ id: 'b', min: 1, max: 99999, montant: 300, leadSource: '' }], rdvs: [],
    }
    const accepte = { id: 'r', phase: 'SQL', entreprise: 'A', effectif: 50, source: 'Outbound', handoff: { state: 'accepted' } }
    if (handoffState(accepte, base) !== 'accepted') throw new Error('Un lead accepté doit rester accepté')
    const perdu = { ...accepte, phase: 'KO' }
    if (handoffState(perdu, base) !== 'accepted') {
      throw new Error("Une affaire perdue APRÈS acceptation ne doit pas effacer le verdict du closer")
    }
    if (handoffStats([perdu], base).accepted !== 1) throw new Error("Le taux d'acceptation ne doit pas retomber sur une perte ultérieure")

    // Prime déclenchée le 20 (après la bascule du 15) → versée le mois SUIVANT. Le quota doit
    // dire la même chose que le relevé, sinon les deux chiffres se contredisent.
    const d = { ...base, rdvs: [{ id: 'p', phase: 'SQL', entreprise: 'B', effectif: 50, source: 'Outbound', datePassageSQL: '2026-09-20' }] }
    const sept = quotaAchieved(d, 'primes', 'mois', new Date('2026-09-10T12:00:00Z'))
    const octo = quotaAchieved(d, 'primes', 'mois', new Date('2026-10-10T12:00:00Z'))
    if (sept !== 0) throw new Error('Une prime versée en octobre ne doit pas compter dans le quota de septembre')
    if (octo !== 300) throw new Error('Le quota doit compter la prime sur son mois de versement')
    if (buildStatement(d, null, 'x', '2026-10').total !== octo) throw new Error('Relevé et quota doivent annoncer le même montant')

    // Le quota porte sur ce qui est PERÇU : les modulateurs s'appliquent.
    const plafonne = { ...d, primeRules: { on: true, refMetric: 'sql', threshold: { on: false }, accelerator: { on: false }, quality: { on: false }, cap: { on: true, amount: 100 } } }
    if (quotaAchieved(plafonne, 'primes', 'mois', new Date('2026-10-10T12:00:00Z')) !== 100) {
      throw new Error('Un plafond doit se voir dans le quota comme sur le relevé')
    }
  }

  // Un seul montant : ce qui est VERSÉ. Le tableau de bord, le quota, le classement et le
  // relevé doivent tous annoncer le même chiffre, modulateurs compris.
  {
    const d = {
      phases: ['R1', 'SQL', 'KO', 'Signée'], primePhases: ['SQL'], wonPhases: ['Signée'], lostPhases: ['KO'],
      primeCutoffDay: 15, bareme: [{ id: 'b', min: 1, max: 99999, montant: 500, leadSource: '' }],
      rdvs: [{ id: 'a', phase: 'SQL', entreprise: 'A', effectif: 50, source: 'Outbound', datePassageSQL: '2026-09-02' },
             { id: 'b', phase: 'SQL', entreprise: 'B', effectif: 50, source: 'Outbound', datePassageSQL: '2026-09-03' }],
      primeRules: { on: true, refMetric: 'sql', threshold: { on: false }, accelerator: { on: false }, quality: { on: false }, cap: { on: true, amount: 600 } },
    }
    const paid = monthlyPaidPrimes(d, null, 'x', '2026-09')
    if (paid !== 600) throw new Error('Le plafond doit s\'appliquer au montant annoncé partout')
    if (quotaAchieved(d, 'primes', 'mois', new Date('2026-09-10T12:00:00Z')) !== paid) {
      throw new Error('Le quota doit annoncer le montant versé, pas le brut du barème')
    }
    if (buildStatement(d, null, 'x', '2026-09').total !== paid) {
      throw new Error('Le relevé doit annoncer le même montant que le tableau de bord')
    }
  }

  // 1:1 : un changement de manager ARCHIVE l'ancien binôme, il ne le supprime pas —
  // l'historique des entretiens est précisément ce qui fait la valeur de la brique.
  {
    const d = buildDemoDb({})
    const sara = (d.channels || []).find(c => c.oneToOne?.memberSubId === 'dsub-b2')
    if (!sara || sara.archived) throw new Error('Le 1:1 en cours ne doit pas être archivé')
    if ((d.channels || []).filter(c => c.oneToOne?.memberSubId === 'dsub-b2').length !== 1) {
      throw new Error("Un membre ne doit avoir qu'un seul 1:1 actif")
    }
  }

  // Montant de l'affaire : la valeur annuelle compare un contrat ponctuel à un abonnement
  // sans mentir sur l'un des deux. Et surtout, RETIRER le module ne doit rien casser.
  {
    const data = { phases: ['R1', 'SQL', 'KO', 'Signée'], wonPhases: ['Signée'], lostPhases: ['KO'] }
    if (dealAnnualValue({ montant: 1000, recurrence: 'oneshot' }) !== 1000) throw new Error('Un contrat ponctuel vaut son montant')
    if (dealAnnualValue({ montant: 1000, recurrence: 'mensuel' }) !== 12000) throw new Error('Un abonnement mensuel vaut douze mois')
    if (dealAnnualValue({}) !== 0) throw new Error('Une affaire sans montant ne doit rien valoir, pas planter')
    const rdvs = [
      { id: '1', phase: 'R1', provenance: 'Cold Call', montant: 1000, recurrence: 'oneshot' },
      { id: '2', phase: 'Signée', provenance: 'Cold Call', montant: 500, recurrence: 'mensuel' },
      { id: '3', phase: 'KO', provenance: 'Salon', montant: 9999 },
      { id: '4', phase: 'R1', provenance: 'Salon' }, // sans montant : le champ est facultatif
    ]
    if (pipelineValue(rdvs, data) !== 1000) throw new Error('Le pipeline ne compte ni le perdu ni le gagné')
    if (wonValue(rdvs, data) !== 6000) throw new Error('Le signé se compte en valeur annuelle')
    const bySrc = valueBySource(rdvs, data)
    if (bySrc[0].source !== 'Salon' || bySrc[0].value !== 9999) throw new Error('La valeur par provenance est faussée')
    if (!bySrc.some(v => v.source === 'Cold Call' && v.won === 6000)) throw new Error('Le signé par provenance est faussé')
    // Sans le moindre montant saisi — c'est-à-dire module retiré — tout vaut zéro, rien ne casse.
    const naked = rdvs.map(({ montant, recurrence, ...r }) => r)
    if (pipelineValue(naked, data) !== 0 || wonValue(naked, data) !== 0) throw new Error('Sans montant, les valeurs doivent être nulles')
    if (valueBySource(naked, data).some(v => v.value !== 0)) throw new Error('Sans montant, aucune provenance ne doit valoir quoi que ce soit')
  }

  // Closing : un pipeline SÉPARÉ de celui de la prospection, et une issue qui se reporte sur
  // la phase principale — sans ce report, une affaire signée par le closer resterait invisible
  // dans les entonnoirs et les primes.
  {
    const data = { phases: ['R1', 'SQL', 'KO', 'Signée'], primePhases: ['SQL'], wonPhases: ['Signée'], lostPhases: ['KO'] }
    const attente = { id: 'a', phase: 'SQL', handoff: { state: 'pending' } }
    if (closingState(attente, data) !== null) throw new Error("Une affaire non acceptée n'entre pas en closing")
    const accepte = { id: 'b', phase: 'SQL', handoff: { state: 'accepted' } }
    if (closingState(accepte, data) !== closingPhases(data)[0]) throw new Error('Une affaire acceptée démarre à la première étape de closing')
    const avancee = { ...accepte, closing: { phase: 'Négociation' } }
    if (closingState(avancee, data) !== 'Négociation') throw new Error("L'étape de closing doit être indépendante de la phase du pipeline")
    if (closingState({ ...avancee, phase: 'Signée' }, data) !== 'won') throw new Error("L'issue gagnée prime sur l'étape de closing")
    if (closingState({ ...avancee, phase: 'KO' }, data) !== 'lost') throw new Error("L'issue perdue prime sur l'étape de closing")
    const st = closingStats([attente, accepte, { ...avancee, phase: 'Signée' }, { ...avancee, phase: 'KO' }], data)
    if (st.open !== 1 || st.won !== 1 || st.lost !== 1) throw new Error('Le décompte du closing est faussé : ' + JSON.stringify(st))
    if (st.rate !== 50) throw new Error("Le taux de closing ignore les affaires encore en cours")

    // Le rôle Closer existe par défaut, avec le droit qui va avec — pas une faveur d'encadrement.
    const closer = defaultEnvRoles().find(r => r.name === 'Closer')
    if (!closer) throw new Error('Le rôle Closer manque aux rôles intégrés')
    if (!(closer.perms || []).includes('deals.close')) throw new Error('Le rôle Closer doit porter le droit de trancher')
    if (!(closer.tabs || []).includes('Closing')) throw new Error('Le rôle Closer doit ouvrir son pipeline')
    if ((closer.tabs || []).includes('Primes & Commissions')) throw new Error("Le closer n'a que faire du barème de prospection")
  }

  // Verdict ICP à la saisie : il ne parle que s'il a de quoi le faire, et il distingue
  // le lead qui ressemble aux comptes qui signent de celui qui s'en écarte.
  {
    const profils = { icpProfiles: [{ id: 'p1', name: 'Scale-up SaaS', secteurs: ['SaaS'], effMin: 50, effMax: 500, postes: ['DRH'] }] }
    if (icpVerdict({ secteur: 'SaaS', effectif: 120, contacts: [{ poste: 'DRH' }] }, profils)?.level !== 'match') throw new Error('Un lead conforme doit être reconnu')
    const off = icpVerdict({ secteur: 'BTP', effectif: 120, contacts: [{ poste: 'DRH' }] }, profils)
    if (off?.level !== 'off' || !off.gaps.some(g => g.includes('BTP'))) throw new Error("L'écart de secteur doit être nommé")
    if (icpVerdict({ secteur: '', effectif: '', contacts: [] }, profils)) throw new Error('Sans donnée saisie, aucun verdict ne doit s\'afficher')
    if (icpVerdict({ secteur: 'SaaS' }, { icpProfiles: [] })) throw new Error('Sans profil ICP, aucun verdict')
  }

  // fmtDate reçoit tantôt une date seule, tantôt un horodatage ISO complet (createdAt).
  // Concaténer l'heure à un horodatage donnait « Invalid Date », affiché tel quel sur la
  // fiche entreprise — et publié sur une capture du site.
  if (fmtDate('2026-09-09') !== '09/09/2026') throw new Error('fmtDate broke on a plain date')
  if (fmtDate('2026-09-09T08:30:00.000Z') !== '09/09/2026') throw new Error('fmtDate must accept a full ISO timestamp')
  if (fmtDate('') !== '—' || fmtDate('n\'importe quoi') !== '—') throw new Error('fmtDate must never render "Invalid Date"')

  // Automatisations de statut vs pipeline personnalisé : une phase renommée dans
  // « Créer votre écosystème » doit suivre, et une phase supprimée ne doit jamais être
  // réécrite sur le RDV (l'étiquette posée n'existerait plus dans le kanban).
  {
    const rdv = { id: 'r', phase: 'R1', opportunite: 'En cours', history: [] }
    const std = applyRdvAutomations(rdv, { opportunite: 'Gagnée' }, { phases: ['R1', 'R2', 'MQL', 'SQL', 'KO', 'Signée'] })
    if (std.phase !== 'SQL') throw new Error('Default pipeline: Gagnée should move the RDV to SQL')
    const renamed = { phases: ['R1', 'Qualifié', 'Perdu'], phaseAliases: { SQL: 'Qualifié', KO: 'Perdu' } }
    if (applyRdvAutomations(rdv, { opportunite: 'Gagnée' }, renamed).phase !== 'Qualifié') throw new Error('Renamed phase not followed by the automation')
    if (applyRdvAutomations(rdv, { opportunite: 'Perdue' }, renamed).phase !== 'Perdu') throw new Error('Renamed KO phase not followed')
    const dropped = { phases: ['R1', 'R2'] }
    if ('phase' in applyRdvAutomations(rdv, { opportunite: 'Gagnée' }, dropped)) throw new Error('A phase absent from the pipeline must never be written back')
    // La date de passage SQL suit les phases qui déclenchent une prime, pas le mot « SQL ».
    if (!rdvNeedsSqlDate(rdv, { phase: 'Qualifié' }, { primePhases: ['Qualifié'] })) throw new Error('SQL date prompt lost after renaming the prime phase')
  }
  const { I18nProvider } = await import('../src/i18n.jsx')

  // Démo commerciale : base fabriquée de toutes pièces (société Atlas Revenue), sans lien
  // avec un compte réel, et remplie de données.
  const demoDb = buildDemoDb()
  if (!demoDb.environments.some(e => e.id === 'env-demo')) throw new Error('Demo db missing env-demo')
  if (demoDb.environments.some(e => e.id === 'env-peoplespheres' || e.id === 'env-test')) throw new Error('Demo db must not include real/seed envs')
  if (!demoDb.accounts.some(a => a.id === 'demo-mgr') || (demoDb.data['dsub-b1']?.rdvs || []).length < 5) throw new Error('Demo db not richly populated')
  if (demoSession('manager').subEnvId !== 'dsub-mgr') throw new Error('demoSession(manager) wrong')
  // Le nom saisi au formulaire de démo devient celui de l'espace : en rendez-vous, le
  // prospect se voit chez lui. Sans saisie, la société fictive reprend la main.
  if (demoDb.environments.find(e => e.id === 'env-demo').name !== 'Atlas Revenue') throw new Error('Demo env should default to the fictional company')
  if (buildDemoDb({ company: 'Vertigo Studio' }).environments.find(e => e.id === 'env-demo').name !== 'Vertigo Studio') throw new Error('Prospect company did not become the demo space name')
  if (buildDemoDb({ company: '   ' }).environments.find(e => e.id === 'env-demo').name !== 'Atlas Revenue') throw new Error('Blank company should fall back to the fictional name')
  const { default: App } = await import('../src/App.jsx')
  const Root = (children) => React.createElement(StoreProvider, null, React.createElement(I18nProvider, null, children))

  const errors = []
  const origError = console.error
  console.error = (...a) => { errors.push(a.join(' ')); origError(...a) }

  // Une demande de contact déposée par le site (clé partagée) doit être ingérée et générer un projet.
  win.localStorage.setItem('bdrflow_contact_inbox_v1', JSON.stringify([
    { id: 'req-smoke', name: 'ACME Corp', email: 'a@acme.com', message: 'Bonjour, on veut une démo.', createdAt: new Date().toISOString() },
  ]))

  const container = win.document.createElement('div')
  win.document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(React.StrictMode, null, Root(React.createElement(App))))
  })

  const text = () => container.textContent || ''
  const find = (sel, label) => [...container.querySelectorAll(sel)].find(el => el.textContent.trim().includes(label))
  const findExact = (label) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === label)
  const click = async (el) => act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  const type = async (el, value) => act(async () => { Simulate.change(el, { target: { value } }) })

  // 0. Splash screen BD Report puis écran de connexion
  await act(async () => { await new Promise(r => setTimeout(r, 1700)) })
  if (!text().includes('BD Report')) throw new Error('Login screen missing: ' + text().slice(0, 200))
  // Connexion Google : le bouton est proposé et actif. La jonction avec un compte
  // BD Report se fait par e-mail au retour de Google, et refuse les inconnus.
  const gBtn = find('button', 'Continuer avec Google')
  if (!gBtn) throw new Error('Google sign-in button missing')
  if (gBtn.disabled) throw new Error('Google sign-in button must be enabled')
  const inputs = container.querySelectorAll('input')
  await type(inputs[0], 'OwenMtp')
  await type(inputs[1], 'demo1234')
  await click(find('button', 'Se connecter'))

  // 2. Écran de bienvenue
  if (!text().includes('Bienvenue Owen')) throw new Error('Welcome screen missing: ' + text().slice(0, 300))
  await act(async () => { await new Promise(r => setTimeout(r, 2800)) })

  // 3. Choix de l'environnement (PeopleSpheres + environnement de démo Test)
  if (!text().includes('PeopleSpheres')) throw new Error('Env picker missing: ' + text().slice(0, 300))
  if (!text().includes('Test')) throw new Error('Env Test missing from picker')
  await click(find('button', 'PeopleSpheres'))

  // 4. Sous-environnement protégé par PIN
  if (!text().includes('Owen Mrani Bonnier')) throw new Error('SubEnv picker missing: ' + text().slice(0, 300))
  await click(find('button', 'Owen Mrani Bonnier'))
  // Le compte de test encadre : aucun espace ne doit lui être verrouillé.
  if (text().includes('espace privé')) throw new Error('Manager should not see colleagues\' spaces locked')
  if (!text().includes('4 chiffres')) throw new Error('PIN gate missing: ' + text().slice(0, 300))
  await type(container.querySelector('input'), '1205')
  await act(async () => { await new Promise(r => setTimeout(r, 600)) }) // laisse passer le squelette de chargement

  // 5. App principale : Dashboard
  if (!text().includes('RDV réalisés')) throw new Error('Main app / Dashboard missing: ' + text().slice(0, 400))

  // 6. Navigation sur chaque page
  for (const label of ['Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches', 'Mes contacts', 'Mes notes', 'Conversations', 'Logs', 'Passation au closer', 'Closing', 'Primes & Commissions', 'ICP', 'Support', 'Souscrire à une offre', 'Gestion Manager', 'Équipe support']) {
    // .replace(/\d+$/,'') : certains onglets portent une pastille de messages/demandes non lus
    const btn = [...container.querySelectorAll('nav button')].find(b => b.textContent.trim().replace(/\d+$/, '').trim() === label)
    if (!btn) throw new Error('Nav button missing: ' + label)
    await click(btn)
    if (!text().includes(label)) throw new Error(`Page ${label} did not render`)
  }

  // Journal d'audit : recherche plein texte + export. C'est ce qu'on demande en revue
  // de conformité — « qui a touché à quoi, entre telle et telle date ».
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Logs'))
  if (!find('button', 'Exporter en CSV')) throw new Error('Audit log export button missing')
  {
    const search = [...container.querySelectorAll('input')].find(i => (i.getAttribute('placeholder') || '').includes('Rechercher dans les actions'))
    if (!search) throw new Error('Audit log search missing')
    const before = text()
    await type(search, 'zzzaucunechance')
    if (text() === before) throw new Error('Audit log search did not filter')
    await type(search, '')
  }

  // Classement : le challenge borné dans le temps vit à côté du classement permanent.
  // Le Classement a été absorbé par le tableau de bord : il n'a plus d'onglet, mais rien
  // de son contenu ne doit avoir disparu au passage.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Dashboard'))
  if (!text().includes('Challenges')) throw new Error('La section Challenges a disparu avec la fusion du Classement')
  if (!find('button', 'Lancer un challenge')) throw new Error('Un manager doit pouvoir lancer un challenge depuis le tableau de bord')

  // Historique d'une affaire. La brique arrive ÉTEINTE chez les clients existants : on
  // vérifie d'abord ce silence, puis qu'une fois allumée elle trace le changement d'étape
  // — c'est sur ces passages-là que se calculent les primes.
  {
    const st = () => win.__bdrStore
    const envId = st().session.envId
    const subId = st().session.subEnvId
    const rdvOf = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')).data[subId].rdvs[0] }
    const target = rdvOf()
    if (!target) throw new Error('Aucun RDV pour éprouver l\'historique')

    // Éteinte : rien ne doit être écrit.
    await act(async () => { st().setEnvModules(envId, { rdvHistory: false }) })
    await act(async () => { st().setSub(d => { const r = d.rdvs.find(x => x.id === target.id); if (r) r.effectif = '111'; return d }) })
    if ((rdvOf().audit || []).length) throw new Error("L'historique écrit alors que la brique est éteinte")

    // Allumée : le changement laisse une trace nommée, datée et signée.
    await act(async () => { st().setEnvModules(envId, { rdvHistory: true }) })
    await act(async () => { st().setSub(d => { const r = d.rdvs.find(x => x.id === target.id); if (r) r.effectif = '222'; return d }) })
    const trace = (rdvOf().audit || [])
    if (trace.length !== 1) throw new Error(`L'historique devrait porter une ligne, il en porte ${trace.length}`)
    const l = trace[0]
    if (l.from !== '111' || l.to !== '222') throw new Error(`L'historique retient la mauvaise valeur : ${l.from} → ${l.to}`)
    if (!l.by || !l.at || !l.label) throw new Error("Une ligne d'historique sans auteur, date ou intitulé ne sert à rien")

    // Un champ NON suivi (une note) ne doit pas encombrer l'historique.
    await act(async () => { st().setSub(d => { const r = d.rdvs.find(x => x.id === target.id); if (r) r.notes = 'bla'; return d }) })
    if ((rdvOf().audit || []).length !== 1) throw new Error('Un champ non suivi a été inscrit dans l\'historique')

    // Atterrissage : absent tant que la brique est éteinte, présent une fois allumée — et
    // il doit DIRE d'où sortent ses deux bornes, sinon le chiffre n'est pas discutable.
    await act(async () => { st().setEnvModules(envId, { forecast: false }) })
    await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Dashboard'))
    if (text().includes('Atterrissage')) throw new Error("L'atterrissage s'affiche alors que la brique est éteinte")
    await act(async () => { st().setEnvModules(envId, { forecast: true }) })
    await act(async () => {})
    if (!text().includes('Atterrissage')) throw new Error("L'atterrissage manque au tableau de bord une fois la brique allumée")
    if (!text().includes('au rythme depuis le début')) throw new Error("L'atterrissage doit expliquer d'où viennent ses bornes")

    // Recyclage : perdre une affaire avec un motif doit poser la date de re-tentative TOUT
    // SEUL — la réclamer à quelqu'un qui vient de perdre une affaire ne marcherait jamais.
    await act(async () => { st().setEnvModules(envId, { recycling: true }) })
    await act(async () => {
      st().setSub(d => {
        const r = d.rdvs.find(x => x.id === target.id)
        Object.assign(r, applyRdvAutomations(r, { opportunite: 'Perdue', motifKo: 'Mauvais timing' }, d))
        return d
      })
    })
    const lost = rdvOf()
    if (!lost.recycleAt) throw new Error("Perdre une affaire avec un motif doit poser une date de re-tentative")
    // « Mauvais timing » = 90 jours : la date doit tomber dans le futur, pas aujourd'hui.
    if (lost.recycleAt <= new Date().toISOString().slice(0, 10)) throw new Error(`Date de re-tentative non future : ${lost.recycleAt}`)

    // Une affaire dont le jour est venu revient dans les recommandations, et la reprendre
    // la replace au DÉBUT du pipeline.
    await act(async () => { st().setSub(d => { const r = d.rdvs.find(x => x.id === target.id); r.recycleAt = '2020-01-01'; return d }) })
    await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Recommandations prioritaires'))
    if (!text().includes('À reprendre aujourd\'hui')) throw new Error('La section de recyclage manque aux recommandations')
    const reprendre = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reprendre')
    if (!reprendre) throw new Error('Aucun bouton « Reprendre » sur une affaire dont le jour est venu')
    await click(reprendre)
    const back = rdvOf()
    if (back.opportunite !== 'En cours') throw new Error('Une affaire reprise doit redevenir en cours')
    if (back.recycleAt) throw new Error('Une affaire reprise ne doit plus être en attente de reprise')
    if (back.recycleCount !== 1) throw new Error('Le nombre de reprises doit être compté')
    if (!back.motifKo) throw new Error("Le motif d'origine doit être conservé : c'est le seul avantage sur un lead neuf")

    // Plans de relance : appliquer une séquence pose les tâches AUX BONNES DATES, et
    // l'arrêter retire celles qui restent sans toucher à ce qui a déjà été fait.
    await act(async () => { st().setEnvModules(envId, { cadence: true }) })
    const dbNow2 = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')) }
    const plans = st().cadences()
    if (!plans.length) throw new Error('Aucun plan de relance semé par défaut')
    const before2 = (dbNow2().data[subId].tasks || []).length
    let n = 0
    await act(async () => { n = st().applyCadence(target.id, plans[0].id) })
    if (n !== plans[0].steps.length) throw new Error(`Le plan devait créer ${plans[0].steps.length} tâches, il en annonce ${n}`)
    const made = (dbNow2().data[subId].tasks || []).filter(t => t.rdvId === target.id && t.cadenceId === plans[0].id)
    if (made.length !== plans[0].steps.length) throw new Error(`Tâches réellement créées : ${made.length}`)
    // Les échéances doivent être ÉCHELONNÉES : un plan qui pose tout le même jour ne relance rien.
    const dates = [...new Set(made.map(t => t.dueDate))]
    if (dates.length < 2) throw new Error('Les tâches d\'un plan doivent être échelonnées dans le temps')
    // Réappliquer ne double pas les tâches non faites.
    await act(async () => { st().applyCadence(target.id, plans[0].id) })
    const again = (dbNow2().data[subId].tasks || []).filter(t => t.rdvId === target.id && t.cadenceId === plans[0].id)
    if (again.length !== plans[0].steps.length) throw new Error(`Réappliquer un plan a empilé les tâches (${again.length})`)
    // Arrêter retire les tâches non faites, et seulement celles-là.
    await act(async () => { st().setSub(d => { const t = (d.tasks || []).find(x => x.rdvId === target.id && x.cadenceId === plans[0].id); if (t) t.done = true; return d }) })
    await act(async () => { st().stopCadence(target.id) })
    const left = (dbNow2().data[subId].tasks || []).filter(t => t.rdvId === target.id && t.cadenceId === plans[0].id)
    if (left.length !== 1 || !left[0].done) throw new Error("Arrêter un plan doit garder ce qui a été fait et retirer le reste")
    if ((dbNow2().data[subId].tasks || []).length < before2) throw new Error('Des tâches étrangères au plan ont été supprimées')
  }

  // Fusion des écrans « où j'en suis » : quatre onglets en moins, mais AUCUNE fonction
  // perdue. On vérifie que chaque contenu est bien joignable dans son nouveau logement —
  // sans quoi la consolidation serait une suppression déguisée.
  {
    const gone = ['Simulateur de primes', 'Qualité des données', 'Classement', 'KPI Entreprise']
    gone.forEach(l => {
      if ([...container.querySelectorAll('nav button')].some(b => b.textContent.trim().replace(/\d+$/, '').trim() === l)) {
        throw new Error(`L'onglet « ${l} » aurait dû être absorbé par un autre écran`)
      }
    })
    // Le Simulateur vit maintenant dans « Primes & Commissions ».
    await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Primes & Commissions'))
    const simBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Simulateur')
    if (!simBtn) throw new Error('Le Simulateur n\'est pas accessible depuis Primes & Commissions')
    await click(simBtn)
    if (!text().includes('Combien') && !text().includes('Prime acquise') && !text().includes('acquise')) {
      throw new Error('La vue Simulateur ne rend pas son contenu')
    }
    // La Qualité des données vit maintenant dans « Leads ».
    await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Leads'))
    const qBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Qualité')
    if (!qBtn) throw new Error("Le panneau Qualité des données n'est pas accessible depuis Leads")
    await click(qBtn)
    if (!text().includes('/100') && !text().includes('Contacts sans e-mail')) {
      throw new Error('Le panneau Qualité des données ne rend pas son contenu')
    }
  }

  // 5. Comité d'achat : le formulaire de RDV qualifie chaque interlocuteur, et alerte quand
  // l'affaire ne tient qu'à une personne.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Mes Rendez-vous'))

  // Changement de langue : TOUT l'écran suit, pas seulement les libellés de navigation.
  // C'est le contrat de la fonctionnalité — une page à moitié traduite est pire que rien.
  {
    const frText = text()
    if (!frText.includes('Créer un RDV')) throw new Error('Point de départ français introuvable')
    win.__bdrI18nResetMissing?.()
    await act(async () => { win.__bdrStore.setUiLang('en') })
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    const enText = text()
    if (enText.includes('Créer un RDV')) throw new Error("Le bouton principal n'a pas été traduit en anglais")
    if (!enText.includes('Create a meeting')) throw new Error('La traduction anglaise ne s\'applique pas au rendu')
    // L'espagnol suit le même chemin : une seule langue branchée cacherait une clé
    // de dictionnaire à deux colonnes au lieu de trois.
    await act(async () => { win.__bdrStore.setUiLang('es') })
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    if (!text().includes('Crear una cita')) throw new Error("La traduction espagnole ne s'applique pas au rendu")

    // Rien de français ne doit subsister dans une phrase de l'INTERFACE. Le contenu SAISI
    // (notes, noms d'entreprise, messages) reste dans sa langue, c'est une donnée : on le
    // reconnaît en le retrouvant tel quel dans l'espace de travail, et on l'écarte.
    const stop = / (de|des|du|le|la|les|un|une|vous|votre|pour|dans|avec|sur|par|est|aux) /
    const stored = JSON.stringify(win.__bdrStore?.sub || {})
    const untranslated = (win.__bdrI18nMissing?.() || [])
      .filter(s => s.length > 25 && stop.test(` ${s} `))
      .filter(s => !stored.includes(s))
    if (untranslated.length) {
      throw new Error(`Phrases restées en français hors dictionnaire (${untranslated.length}) : ${untranslated.slice(0, 5).join(' | ')}`)
    }

    // Retour au français : les originaux doivent être restitués, pas retraduits.
    await act(async () => { win.__bdrStore.setUiLang('fr') })
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    if (!text().includes('Créer un RDV')) throw new Error('Le retour au français ne restitue pas le texte d\'origine')
  }

  {
    const create = find('button', 'Créer un RDV')
    if (!create) throw new Error('Create RDV button missing')
    await click(create)
    if (!text().includes('Rôle dans la décision')) throw new Error('Buying committee fields missing from the RDV form')
    if (!text().includes("Montant de l'affaire")) throw new Error("Le montant de l'affaire manque au formulaire")
    const roleSel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Prescripteur'))
    if (!roleSel) throw new Error('Buying committee roles not offered')
    await click(find('button', 'Annuler'))
  }

  // 5a. Mes notes : la bibliothèque d'objections vit dans une catégorie de la même page.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Mes notes'))
  {
    const objTab = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Objections')
    if (!objTab) throw new Error('Objections category missing from Mes notes')
    await click(objTab)
    if (!text().includes('On a déjà un outil')) throw new Error('Objection library should ship with a starter set: ' + text().slice(0, 300))
    const copyBtn = find('button', 'Copier la réponse')
    if (!copyBtn) throw new Error('Objection copy button missing')
    await click(copyBtn)
    win.__bdrFlushSave?.()
    const state = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    if (!Object.values(state.data).some(d => (d.objections || []).some(o => (o.used || 0) > 0))) {
      throw new Error('Objection usage counter was not persisted')
    }
    // Modèles de messages : la troisième catégorie de « Mes notes ».
    const tplTab = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Modèles de messages')
    if (!tplTab) throw new Error('Message templates category missing from Mes notes')
    await click(tplTab)
    if (!text().includes('Relance après silence')) throw new Error('Le socle de modèles doit être livré: ' + text().slice(0, 300))
    if (!find('button', 'Personnaliser')) throw new Error('Un modèle doit pouvoir être personnalisé')
    await click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Notes'))
  }

  // 5a ter. Closing : le pipeline aval du closer.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Closing'))
  for (const k of ['Affaires en cours', 'Taux de closing']) {
    if (!text().includes(k)) throw new Error('Closing page section missing: ' + k)
  }

  // 5a bis. Passation au closer : le lead qualifié attend un verdict, et le verdict se pose.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Passation au closer'))
  for (const k of ['Mon taux d\'acceptation', 'Mes leads']) {
    if (!text().includes(k)) throw new Error('Handoff page section missing: ' + k)
  }
  {
    const mineTab = [...container.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Mes leads'))
    if (!mineTab) throw new Error('Handoff « Mes leads » tab missing')
    await click(mineTab)
    if (!text().includes('En attente')) throw new Error('Handoff should list qualified leads awaiting a verdict: ' + text().slice(0, 300))
  }
  {
    // Un lead qualifié par quelqu'un d'autre se traite depuis « À traiter ». On en accepte un
    // et on vérifie que le taux d'acceptation cesse d'être vide : sans décision, il n'existe pas.
    const todoTab = [...container.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('À traiter'))
    await click(todoTab)
    const accept = find('button', 'Accepter')
    if (accept) {
      await click(accept)
      // Lecture APRÈS vidage de la sauvegarde différée, sinon on relirait l'état d'avant le clic.
      win.__bdrFlushSave?.()
      const state = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
      const decided = Object.values(state.data).some(d => (d.rdvs || []).some(r => r.handoff?.state === 'accepted'))
      if (!decided) throw new Error('Handoff acceptance was not persisted')
    }
  }

  // 5b. Primes : ajout d'une règle de barème par activité (volume de RDV).
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Primes & Commissions'))
  // Les règles ne se règlent plus ici : la page suit, rapporte et prévoit.
  if (find('button', 'Ajouter une règle')) throw new Error('Rule editor should have left the Primes page')
  if (!text().includes('Créer votre écosystème')) throw new Error('Primes should point to where rules are set')

  // 5b bis. Console « Gestion Manager » : tout le réservé manager tient en un seul écran.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Gestion Manager'))
  for (const t of ['Utilisateurs', 'Organigramme', 'Créer votre écosystème', 'Objectifs & quotas', 'Pilotage équipe', 'Intégration HubSpot']) {
    if (!find('button', t)) throw new Error('Manager hub tab missing: ' + t)
  }
  // Objectifs & quotas : règles communes, montée en charge, cible par personne.
  await click(find('button', 'Objectifs & quotas'))
  for (const k of ['Règles communes', 'Montée en charge', 'Quota par défaut', 'Où en est l\'équipe']) {
    if (!text().includes(k)) throw new Error('Quota section missing: ' + k)
  }
  // Pilotage équipe : la fourchette de primes, telle qu'on la présente en comité.
  await click(find('button', 'Pilotage équipe'))
  for (const k of ['Primes du mois — fourchette', 'Acquis', 'Attendu', 'Haut']) {
    if (!text().includes(k)) throw new Error('Forecast range missing: ' + k)
  }
  // Relevés de primes : un relevé non signé n'est pas téléchargeable — c'est tout le sujet.
  if (!text().includes('Relevés de primes')) throw new Error('La section Relevés de primes manque au pilotage')
  if (!find('button', 'Valider et signer')) throw new Error('Le manager doit pouvoir signer un relevé')
  {
    await click(find('button', 'Valider et signer'))
    if (!text().includes("Je certifie l'exactitude")) throw new Error("L'attestation de signature ne s'affiche pas")
    const signBtn = find('button', 'Signer le relevé')
    if (!signBtn || !signBtn.disabled) throw new Error('Signer doit rester impossible tant que la case n\'est pas cochée')
    const box = [...container.querySelectorAll('.fixed.z-50 input[type=checkbox]')].pop()
    if (!box) throw new Error('Case d\'attestation introuvable')
    await act(async () => { box.checked = true; Simulate.change(box) })
    await click(find('button', 'Signer le relevé'))
    win.__bdrFlushSave?.()
    const st = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    const env = st.environments.find(e => e.id === 'env-peoplespheres')
    const signed = Object.values(env.statements || {}).find(x => x.signature)
    if (!signed) throw new Error('Le relevé signé doit être figé sur l\'environnement')
    if (!signed.signature.by) throw new Error('La signature doit porter un nom')
    if (!('total' in signed) || !Array.isArray(signed.lines)) throw new Error('Un relevé signé doit figer son contenu')
  }

  // Écosystème : étapes du pipeline, règle de rattachement et barème au même endroit.
  await click(find('button', 'Créer votre écosystème'))
  for (const k of ['Étapes de votre pipeline', 'Règle de rattachement au mois', 'Barème des primes', 'déclenche une prime']) {
    if (!text().includes(k)) throw new Error('Ecosystem section missing: ' + k)
  }
  // L'éditeur de règles par activité a rejoint l'écosystème.
  const addRule = find('button', 'Ajouter une règle')
  if (!addRule) throw new Error('Activity rule editor missing from ecosystem')
  await click(addRule)
  if (!text().includes('Paliers de prime')) throw new Error('Activity rule editor did not render in ecosystem')
  // Les onglets regroupés ne doivent plus encombrer la barre latérale.
  if ([...container.querySelectorAll('nav button')].some(b => b.textContent.trim() === 'Intégration HubSpot')) {
    throw new Error('Manager tabs should be grouped, not left in the sidebar')
  }

  // 5c. Intégration HubSpot : console de connexion, correspondances, synchro et catalogue d'appels.
  await click(find('button', 'Intégration HubSpot'))
  if (!text().includes('Connexion à HubSpot') || !text().includes('Tester la connexion')) throw new Error('HubSpot connection card missing')
  // Connexion PAR ENTREPRISE : le client relie son propre portail en un clic.
  if (!text().includes('Connecter mon HubSpot')) throw new Error('HubSpot per-company connect button missing')
  if (!text().includes('Explorateur d\'appels API') || !text().includes('/crm/v3/objects/contacts')) throw new Error('HubSpot API explorer missing')
  if (!text().includes('Tout envoyer vers HubSpot')) throw new Error('HubSpot sync buttons missing')
  // La correspondance des phases couvre bien toutes les phases BD Report.
  for (const ph of ['R1', 'R2', 'MQL', 'SQL', 'KO']) { if (!text().includes(ph)) throw new Error('HubSpot stage mapping missing phase ' + ph) }
  // Les réglages avancés exposent bien les trois modes de connexion.
  await click(find('button', 'Afficher les réglages avancés'))
  if (!text().includes('Mode de connexion')) throw new Error('HubSpot advanced settings missing')
  const savedDb = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
  // Aucun jeton HubSpot ne doit vivre dans l'état synchronisé — ni côté éditeur, ni côté entreprise.
  const hsCfg = savedDb.integrations?.hubspot
  if (!hsCfg) throw new Error('HubSpot platform config not seeded in db')
  if ('token' in hsCfg) throw new Error('HubSpot token must never live in the synced state')
  // Chaque environnement (= une entreprise) porte sa propre config HubSpot.
  const hsEnv = (savedDb.environments || []).find(e => e.hubspot)
  if (!hsEnv) throw new Error('Per-company HubSpot config missing on environments')
  if ('token' in hsEnv.hubspot) throw new Error('HubSpot token must never live in the environment config')
  if (!hsEnv.hubspot.stageMap?.R1) throw new Error('Per-company HubSpot stage map not seeded')
  // Le mode d'emploi client est publié dans la base de connaissances du support.
  if (!(savedDb.kbArticles || []).some(a => a.id === 'kb-hubspot-connect')) throw new Error('HubSpot how-to article missing from knowledge base')

  // 6a. Conversations : canaux auto (Général + Bloc notes), création d'un canal, envoi d'un message.
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Conversations'))
  if (!text().includes('Général') || !text().includes('Bloc notes')) throw new Error('Auto channels (Général / Bloc notes) missing')
  await click(find('button', 'Nouveau canal'))
  const chanName = container.querySelector('input[placeholder^="ex :"]')
  if (!chanName) throw new Error('Channel editor did not open')
  await type(chanName, 'Canal Smoke')
  await click(find('button', 'Créer le canal'))
  if (!text().includes('Canal Smoke')) throw new Error('Channel not created')
  if (!text().includes('Membres')) throw new Error('Channel member list not rendered')
  const composer = container.querySelector('textarea')
  await type(composer, 'Bonjour equipe smoke')
  await act(async () => { Simulate.keyDown(composer, { key: 'Enter' }) })
  if (!text().includes('Bonjour equipe smoke')) throw new Error('Channel message not posted')
  // Sourdine à durée : couper 1 heure pose une échéance, « Réactiver » l'efface.
  {
    const bell = container.querySelector('button[title^="Couper les notifications"]')
    if (!bell) throw new Error('Mute button missing from the conversation header')
    await click(bell)
    if (!text().includes("Jusqu'à réactivation") || !text().includes('1 semaine')) throw new Error('Mute durations menu missing')
    await click(find('button', '1 heure'))
    const acct = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')).accounts.find(a => a.id === '01') }
    const chanId = Object.keys(acct().mutedChannels || {})[0]
    if (!chanId) throw new Error('Muting for 1 hour did not record an expiry')
    const until = acct().mutedChannels[chanId]
    if (until === 'forever' || !(new Date(until) > new Date())) throw new Error('1 hour mute should store a future expiry, not a permanent one')
    await click(container.querySelector('button[title^="Notifications coupées"]'))
    await click(find('button', 'Réactiver les notifications'))
    if (Object.keys(acct().mutedChannels || {}).length) throw new Error('Unmute did not clear the entry')
  }

  // Recherche dans les messages : filtre le fil.
  await click(container.querySelector('button[title="Rechercher dans les messages"]'))
  const msgSearch = container.querySelector('input[placeholder^="Rechercher dans cette"]')
  if (!msgSearch) throw new Error('Message search did not open')
  await type(msgSearch, 'zzznomatch')
  if (text().includes('Bonjour equipe smoke')) throw new Error('Message search did not filter out non-matches')
  await type(msgSearch, 'Bonjour')
  if (!text().includes('Bonjour equipe smoke')) throw new Error('Message search did not surface the match')
  await click(container.querySelector('button[title="Rechercher dans les messages"]')) // referme
  // Options de conversation : « Supprimer pour moi » masque le canal (réapparaît au prochain message).
  await click(container.querySelector('button[title="Options de la conversation"]'))
  await click(find('button', 'Supprimer pour moi'))
  if ([...container.querySelectorAll('button')].some(b => b.textContent.trim() === 'Canal Smoke')) throw new Error('Channel not hidden after delete-for-me')

  // 6a bis. TRAME DE 1:1 composée par le manager. Ses rubriques s'ajoutent aux blocs
  // communs et sont redemandées à chaque entretien : c'est ce qui rend deux comptes
  // rendus comparables d'un mois sur l'autre.
  {
    const st = () => win.__bdrStore
    if (!st().canEditOneToOneTemplate()) throw new Error('Le manager ne peut pas composer la trame de 1:1')
    await act(async () => {
      st().saveOneToOneTemplate([
        { label: 'Moral', type: 'rating', hint: '' },
        { label: 'Sujet à traiter', type: 'long', hint: 'Ce qui bloque' },
        { label: '', type: 'text' },                       // sans intitulé : doit être écarté
        { label: 'Formation demandée', type: 'zzz' },      // type inconnu : ramené au texte
      ])
    })
    const tpl = st().oneToOneTemplate()
    if (tpl.length !== 3) throw new Error(`Trame : ${tpl.length} rubriques au lieu de 3 (une rubrique sans intitulé ne doit pas être retenue)`)
    if (tpl[0].type !== 'rating' || tpl[2].type !== 'text') throw new Error('Trame : type de rubrique non normalisé')
    if (!tpl.every(f => f.id)) throw new Error('Trame : une rubrique sans identifiant ne peut pas porter de réponse')
    // La trame vit sur l'ENVIRONNEMENT : une trame que chacun verrait autrement n'en est pas une.
    win.__bdrFlushSave?.()
    const envNow = JSON.parse(win.localStorage.getItem('bdrflow_db_v1')).environments.find(e => e.id === 'env-peoplespheres')
    if ((envNow.oneToOneTemplate || []).length !== 3) throw new Error("La trame n'est pas enregistrée sur l'environnement")
  }

  // 6a ter. ACTUALITÉS dans la fiche entreprise. Le relais est simulé : ce qu'on teste ici,
  // c'est le parcours réel — dépêches, puis analyse À LA DEMANDE, jamais automatique.
  {
    const st = () => win.__bdrStore
    const db0 = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')) }
    const realFetch = globalThis.fetch
    let calls = []
    globalThis.fetch = async (url, opts) => {
      calls.push(String(url))
      if (String(url).includes('/enrich')) {
        return { ok: true, status: 200, json: async () => ({ model: 'gemini-test', inputTokens: 10, outputTokens: 5, found: {
          site: { value: 'https://zephyr.example', publisher: 'Site officiel', url: 'https://zephyr.example', confidence: 'high' },
          localisation: { value: 'Lyon, France', publisher: 'Registre', url: 'https://reg.example/z', confidence: 'medium' },
          linkedin: null,
          ca: null,
        } }) }
      }
      if (String(url).includes('/news')) {
        return { ok: true, status: 200, json: async () => ({ articles: [
          { title: 'Nouveau directeur RH chez Zephyr', url: 'https://ex.fr/a1', source: 'Les Échos', date: new Date().toISOString(), summary: 'Nomination.' },
          { title: 'Zephyr lève 12 M€', url: 'https://ex.fr/a2', source: 'BFM', date: new Date().toISOString(), summary: 'Série A.' },
        ] }) }
      }
      return { ok: true, status: 200, json: async () => ({ signals: [{
        type: 'recrutement', title: 'Nouveau directeur RH', summary: 'Nomination récente.', score: 87,
        urgency: 'HIGH', why_now: 'Remise à plat probable des outils RH.', targets: ['DRH', 'Head of People'],
        angle: "J'ai vu que vous veniez de renforcer votre direction RH.", source: 'Les Échos',
        date: new Date().toISOString(), url: 'https://ex.fr/a1',
      }] }) }
    }
    try {
      await act(async () => { st().setNewsRelay('https://relais.test') })
      // L'analyse IA est une brique optionnelle : chez un client qui ne l'a pas prise,
      // les deux actions n'existent pas. On l'installe donc avant de la tester.
      await act(async () => { st().setEnvModules('env-peoplespheres', { aiInsights: true }) })
      win.localStorage.removeItem('bdrflow_news_v1')
      await act(async () => { win.dispatchEvent(new win.CustomEvent('open-company', { detail: 'Zephyr' })) })
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })
      if (!text().includes('Zephyr')) throw new Error("La fiche entreprise ne s'ouvre pas")
      const newsBtn = find('button', 'Actualités')
      if (!newsBtn) throw new Error("L'action « Actualités » est absente de la fiche entreprise")
      if (!find('button', 'Enrichir')) throw new Error("L'action « Enrichir » est absente de la fiche entreprise")
      await click(newsBtn)
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      if (!text().includes('Nouveau directeur RH chez Zephyr')) { console.error('DEBUG calls', calls); console.error('DEBUG panel', text().slice(Math.max(0, text().indexOf('Actualités') - 50), text().indexOf('Actualités') + 500)); throw new Error('Les dépêches ne sont pas affichées') }
      if (!text().includes('2 actualités trouvées')) throw new Error('Le compte des actualités est faux ou absent')
      // ⚠️ L'IA ne part JAMAIS toute seule : elle coûte un appel et une attente.
      if (calls.some(u => u.includes('/analyze'))) throw new Error("L'analyse IA est lancée sans qu'on l'ait demandée")
      const aiBtn = find('button', "Analyser avec l'IA")
      if (!aiBtn) throw new Error("Le bouton « Analyser avec l'IA » est absent")
      await click(aiBtn)
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      if (!calls.some(u => u.includes('/analyze'))) throw new Error("« Analyser avec l'IA » n'appelle pas le relais")
      for (const k of ['Signal commercial', 'Pertinence', 'HIGH', 'Pourquoi maintenant', 'DRH', 'Les Échos']) {
        if (!text().includes(k)) throw new Error('Analyse : « ' + k + ' » manquant à l\'écran')
      }
      // Les dépêches restent sous l'analyse : on doit pouvoir vérifier sur quoi elle s'appuie.
      if (!text().includes('Zephyr lève 12 M€')) throw new Error('Les articles disparaissent une fois analysés')
      // Cache : rouvrir la fiche ne relance aucun appel.
      const before = calls.length
      await act(async () => { win.dispatchEvent(new win.CustomEvent('open-company', { detail: 'Zephyr' })) })
      const again = find('button', 'Actualités')
      if (!again) throw new Error("L'action « Actualités » a disparu à la réouverture")
      await click(again)
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      if (calls.length !== before) throw new Error('Le cache de 24 h ne sert à rien : le relais est rappelé à chaque ouverture')
      // ---- ENRICHIR. Deux règles absolues : aucun champ créé, et rien d'écrasé sans
      // que l'utilisateur l'ait décidé.
      // On pose une localisation à la main : c'est le cas qui compte — une donnée saisie
      // par un commercial, que l'enrichissement propose de remplacer par une autre.
      await act(async () => {
        st().setSub(d => ({ ...d, companies: { ...(d.companies || {}), Zephyr: { localisation: 'Paris, France' } } }))
      })
      const enrichBtn = find('button', 'Enrichir')
      if (!enrichBtn) throw new Error("L'action « Enrichir » est absente de la fiche entreprise")
      await click(enrichBtn)
      await act(async () => { await new Promise(r => setTimeout(r, 60)) })
      if (!calls.some(u => u.includes('/enrich'))) throw new Error("« Enrichir » n'appelle pas le relais")
      // Le champ VIDE est proposé et coché d'avance ; le champ en conflit est proposé, décoché.
      if (!text().includes('https://zephyr.example')) throw new Error('La valeur trouvée pour un champ vide n\'est pas proposée')
      if (!text().includes('Lyon, France')) throw new Error('La valeur en conflit n\'est pas montrée')
      if (!text().includes('Paris, France')) throw new Error("La valeur ACTUELLE n'est pas montrée face à celle trouvée")
      // Un champ introuvable reste vide et le dit — il n'est jamais deviné.
      if (!text().includes("rien trouvé")) throw new Error("Un champ sans information publique doit le dire, pas être inventé")
      const boxes = [...container.querySelectorAll('.fixed.z-50 input[type="checkbox"]')]
      if (boxes.length !== 2) throw new Error(`Enrichissement : ${boxes.length} champs proposés au lieu de 2`)
      if (!boxes[0].checked) throw new Error('Un champ vide doit être coché d\'avance')
      if (boxes[1].checked) throw new Error("Un champ DÉJÀ REMPLI ne doit jamais être coché d'avance : ce serait l'écraser sans le dire")
      await click(find('button', 'Appliquer'))
      await act(async () => { await new Promise(r => setTimeout(r, 60)) })
      {
        const mySub = win.__bdrStore.session.subEnvId
        const comp = (db0().data[mySub].companies || {})['Zephyr'] || {}
        if (comp.site !== 'https://zephyr.example') throw new Error("Le champ vide n'a pas été rempli")
        if (comp.localisation !== 'Paris, France') throw new Error("Un champ décoché a été écrasé quand même")
        // ⚠️ AUCUN CHAMP CRÉÉ : la fiche ne connaît que ses quatre champs.
        const extra = Object.keys(comp).filter(k => !['ca', 'site', 'linkedin', 'localisation'].includes(k))
        if (extra.length) throw new Error('Champs inventés par l\'enrichissement : ' + extra.join(', '))
      }
      // Le compteur d'IA a vu passer les deux appels réels, et pas un de plus.
      {
        const usage = db0().aiUsage || []
        const feats = usage.filter(c => c.status === 'ok').map(c => c.feature)
        if (!feats.includes('company_enrichment')) throw new Error("L'enrichissement n'est pas décompté dans l'utilisation IA")
        if (!feats.includes('news_analysis')) throw new Error("L'analyse d'actualités n'est pas décomptée dans l'utilisation IA")
        if (usage.some(c => !c.date || !c.ts || !c.userName)) throw new Error('Un appel IA est enregistré sans date ni auteur')
      }

      // Brique RETIRÉE : les deux actions disparaissent ensemble. Une fonctionnalité
      // facturée au client ne doit pas rester visible quand il ne l'a pas prise.
      await act(async () => { st().setEnvModules('env-peoplespheres', { aiInsights: false }) })
      await act(async () => { await new Promise(r => setTimeout(r, 40)) })
      if (find('button', 'Enrichir') || [...container.querySelectorAll('.fixed.z-50 button')].some(b => b.textContent.trim() === 'Actualités')) {
        throw new Error("Sans la brique « Analyse IA », les actions de la fiche restent visibles")
      }
      await act(async () => { st().setEnvModules('env-peoplespheres', { aiInsights: true }) })

      // On referme la fiche : une fenêtre laissée ouverte capterait les clics des tests suivants.
      const closeBtn = [...container.querySelectorAll('.fixed.z-50 .rounded-t-2xl button')].pop()
      if (!closeBtn) throw new Error('Bouton de fermeture de la fiche entreprise introuvable')
      await click(closeBtn)
      await act(async () => { await new Promise(r => setTimeout(r, 60)) })
      if (text().includes('Infos société')) throw new Error("La fiche entreprise ne se referme pas")
      await act(async () => { st().setNewsRelay('') })
      win.localStorage.removeItem('bdrflow_news_v1')
    } finally { globalThis.fetch = realFetch }
  }

  // 6b. Support : créer un ticket, vérifier la conversation, le côté support et l'enrichissement client
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Support'))
  await click(find('button', 'Nouveau ticket'))
  if (!text().includes('Décrivez votre problème')) throw new Error('Ticket form did not open')
  await type(container.querySelector('textarea'), 'Test smoke : impossible de me connecter')
  await click(find('button', 'Créer le ticket'))
  if (!text().includes('équipe technique')) throw new Error('Bot auto-message missing in ticket conversation')
  // L'écriture dans localStorage est différée (regroupement des changements rapprochés) :
  // on la force avant de lire, sinon on relirait l'état d'avant la dernière action.
  const dbNow = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')) }
  const psClient = () => dbNow().clients.find(c => c.envId === 'env-peoplespheres')
  if (psClient()?.status !== 'attente') throw new Error('Client not set to "en attente" on ticket open: ' + psClient()?.status)
  // Console Support unifiée : navBtn ouvre le hub, hubTab change d'onglet interne.
  const navBtn = (label) => [...container.querySelectorAll('nav button')].find(b => b.textContent.trim().replace(/\d+$/, '').trim() === label)
  // .replace(/\d+$/,'') : les onglets portent une pastille de non-lus, comme la barre de nav.
  const hubTab = (label) => [...container.querySelectorAll('main button')].find(b => b.textContent.trim().replace(/\d+$/, '').trim() === label)
  await click(navBtn('Équipe support'))
  if (!text().includes('Console Support')) throw new Error('Support hub did not render')
  await click(hubTab('Tickets'))
  if (!text().includes('Connexion & authentification')) throw new Error('Ticket not visible in support Tickets tab')
  // Prise en charge : le ticket n'appartient à personne tant qu'un agent ne s'en saisit pas.
  await click(find('button', 'Connexion & authentification'))
  if (!text().includes("Ce ticket n'est pris en charge par personne")) throw new Error('Take-over banner missing on unassigned ticket')
  await click(find('button', 'Prendre en charge'))
  if (!text().includes('Pris en charge par')) throw new Error('Ticket take-over did not register')
  if (!dbNow().tickets.find(t => t.category === 'Connexion & authentification')?.assignedTo) throw new Error('Take-over should assign the ticket')

  // Clôture du ticket → le client repasse en « Clients actifs »
  await click(find('button', 'Clôturer'))
  if (psClient()?.status !== 'actifs') throw new Error('Client not restored to "actifs" on ticket close: ' + psClient()?.status)
  // Helpdesk : priorité par défaut + notation de satisfaction (CSAT) après clôture.
  const myTicket = () => dbNow().tickets.find(t => t.category === 'Connexion & authentification')
  if (myTicket()?.priority !== 'normale') throw new Error('Default ticket priority should be "normale"')
  await click(navBtn('Support'))
  // Base de connaissances : on entre par une catégorie, la recherche couvre les mots-clés.
  if (!text().includes('Base de connaissances')) throw new Error('Knowledge base missing from Support tab')
  for (const c of ['Prise en main', 'Primes & commissions', 'Dépannage']) {
    if (!find('button', c)) throw new Error('KB category missing: ' + c)
  }
  await click(find('button', 'Prise en main'))
  if (!find('button', 'Première connexion : par où commencer')) throw new Error('KB category did not open its articles')
  const kbSearch = [...container.querySelectorAll('input')].find(i => (i.placeholder || '').startsWith('Rechercher par mot'))
  if (!kbSearch) throw new Error('KB keyword search missing')
  // « onboarding » n'apparaît que dans les mots-clés, jamais dans le texte de l'article.
  await type(kbSearch, 'onboarding')
  if (!text().includes('Première connexion')) throw new Error('KB search should match on keywords')
  await type(kbSearch, '')

  await click(find('button', 'Connexion & authentification'))
  if (!text().includes('comment évaluez-vous')) throw new Error('CSAT prompt not shown on closed ticket')
  await click(container.querySelector('button[title="4/5"]'))
  await click(find('button', 'Envoyer mon avis'))
  if (myTicket()?.csat?.score !== 4) throw new Error('CSAT rating not saved: ' + JSON.stringify(myTicket()?.csat))
  // Retour à la Console Support pour les vérifications back-office.
  await click(navBtn('Équipe support'))
  await click(hubTab('Tickets'))
  if (!text().includes('Satisfaction (CSAT)')) throw new Error('CSAT dashboard not shown')
  // Onglet Offres (staff) : gestion des offres/abonnements.
  await click(hubTab('Offres'))
  if (!text().includes('Offres & abonnements')) throw new Error('Offers admin tab did not render')
  // L'éditeur d'offres liste automatiquement TOUS les onglets (dont les récents).
  await click(find('button', 'Nouvelle offre'))
  // L'éditeur liste les onglets RÉELS : on vérifie sur deux briques récentes, pas sur
  // celles qui ont été fusionnées ailleurs.
  if (!text().includes('Onglets inclus') || !text().includes('Closing') || !text().includes('Passation au closer')) throw new Error('Offer editor did not list all tabs')
  await click(find('button', 'Annuler'))
  // Onglet Permissions staff : matrice exhaustive des droits + création d'un rôle + attribution.
  await click(hubTab('Permissions staff'))
  if (!text().includes("Permissions de l'équipe staff") || !text().includes('Accéder aux tickets')) throw new Error('Staff permissions matrix did not render')
  if (!text().includes('Attribution des rôles')) throw new Error('Role assignment section missing')
  await click(find('button', 'Créer un rôle'))
  const roleNameInput = container.querySelector('input[placeholder^="ex : Agent support"]')
  if (!roleNameInput) throw new Error('Role creation modal did not open')
  await type(roleNameInput, 'Agent Smoke N1')
  await click(findExact('Créer'))
  if (!text().includes('Agent Smoke N1')) throw new Error('Custom staff role not created')
  const staffRoles = dbNow().staffRoles || []
  if (!staffRoles.some(r => (r.roleKey || r.name) === 'Agent Smoke N1')) throw new Error('Custom role not persisted in staffRoles')
  if (!['Fondateur', 'Support BD Report', 'Administrateur', 'Manager', 'Développeur', 'Membre'].every(k => staffRoles.some(r => (r.roleKey || r.name) === k))) throw new Error('Built-in staff roles missing from table')
  const founderRole = staffRoles.find(r => (r.roleKey || r.name) === 'Fondateur')
  if (!founderRole || (founderRole.permissions || []).length < 30) throw new Error('Founder role should hold every permission')
  if (!(founderRole.permissions || []).includes('dashboard.view')) throw new Error('dashboard.view permission missing from catalogue')

  // Permissions staff : les modifications restent en brouillon jusqu'à un enregistrement.
  await click(hubTab('Permissions staff'))
  if (!text().includes('Attribution des rôles')) throw new Error('Staff permissions tab did not render')
  if (text().includes('Enregistrer vos modifications')) throw new Error('Save bar should stay hidden until something changes')
  if (text().includes('Membre') && [...container.querySelectorAll('main th')].some(th => th.textContent.trim().startsWith('Membre'))) {
    throw new Error('Client roles must not appear as staff permission columns')
  }
  const permBox = [...container.querySelectorAll('main input[type="checkbox"]')].find(i => !i.disabled)
  if (!permBox) throw new Error('No editable permission checkbox found')
  await act(async () => { Simulate.change(permBox, { target: { checked: !permBox.checked } }) })
  if (!text().includes('Enregistrer vos modifications')) throw new Error('Save bar should appear once a permission changes')
  if (!text().includes("rien n'est encore appliqué")) throw new Error('Draft state should be stated explicitly')

  // Formation staff : cas fictifs, sans effet sur les données réelles.
  await click(hubTab('Formation staff'))
  if (!text().includes('Rien n\'est enregistré')) throw new Error('Staff training space did not render')
  if (!find('button', "Ouvrir l'espace de formation")) throw new Error('Isolated training environment launcher missing')
  // La formation vit désormais sur sa propre page (#/formation) : le bouton se contente
  // de l'ouvrir, l'application n'est plus montée derrière. Son parcours se vérifie à part.
  await click(find('button', 'Cas de support'))
  if (!text().includes('Insatisfaction')) throw new Error('Training tickets missing')
  await click(find('button', 'Discussion de projet'))
  if (!text().includes('Onboarding Groupe Lamarche')) throw new Error('Training thread missing')

  // Organigramme du staff : rattachements et services, sans droits (gérés ailleurs).
  await click(hubTab('Organigramme staff'))
  if (!text().includes('Services du staff')) throw new Error('Staff org chart did not render')
  if (!text().includes('Permissions staff')) throw new Error('Org chart should point permissions elsewhere')
  // Recruter : reprendre quelqu'un chez un client, ou créer un profil de toutes pièces.
  {
    if (!text().includes("Ajouter quelqu'un à l'équipe")) throw new Error('Recruit panel missing from staff org chart')
    const pick = async (el, v) => act(async () => { el.value = v; Simulate.change(el) })
    // a) reprendre un utilisateur d'un environnement client : son rôle bascule côté staff.
    await click(find('button', 'Depuis un environnement'))
    const envSel = [...container.querySelectorAll('main select')].find(s => [...s.options].some(o => o.textContent.includes('Test')))
    if (!envSel) throw new Error('Environment picker missing from staff recruit')
    await pick(envSel, 'env-test')
    const who = [...container.querySelectorAll('main select')].find(s => [...s.options].some(o => o.textContent.includes('Sarah')))
    if (!who) throw new Error('Member picker did not follow the environment')
    await pick(who, 'test-sarah')
    await click(find('button', "Intégrer à l'équipe staff"))
    if (dbNow().accounts.find(a => a.id === 'test-sarah').role !== 'Développeur') throw new Error('Client member not promoted to staff')
    if (!text().includes('SarahC')) throw new Error('Promoted member absent from the staff org chart')
    const before = dbNow().accounts.filter(a => a.role === 'Développeur').length
    // b) créer un profil staff de toutes pièces.
    await click(find('button', 'Créer un profil'))
    const byPlaceholder = (p) => [...container.querySelectorAll('main input')].find(i => (i.getAttribute('placeholder') || '').includes(p))
    await type(byPlaceholder('ex : camille'), 'camille')
    await type(byPlaceholder('camille@'), 'camille@bdreport.fr')
    await type(byPlaceholder('Mot de passe provisoire'), 'motdepasse1')
    await click(find('button', 'Créer le profil'))
    const made = dbNow().accounts.find(a => a.email === 'camille@bdreport.fr')
    if (!made) throw new Error('Staff profile not created')
    // Le compte est créé avec un hash, et RIEN d'autre : plus aucun clair n'est conservé,
    // pas même à la création.
    if (!String(made.password).startsWith('sha256:')) throw new Error('Le mot de passe du profil staff n\'est pas hashé')
    if (made.passwordClear !== undefined || made.passwordPlain !== undefined) throw new Error('Un mot de passe en clair a été conservé à la création')
    if (dbNow().accounts.filter(a => a.role === 'Développeur').length !== before + 1) throw new Error('New staff did not take the chosen role')
    if (!text().includes('camille')) throw new Error('New staff member absent from the org chart')
  }

  // Tableau de bord support : portefeuille, churn et traitement des tickets.
  await click(hubTab('Tableau de bord'))
  for (const k of ['Taux de churn', 'Tickets ouverts', 'Portefeuille client', 'Raisons principales de churn',
                   'Satisfaction support', 'Fidélisation produit', 'Clients à risque']) {
    if (!text().includes(k)) throw new Error('Support dashboard missing: ' + k)
  }

  await click(hubTab('Clients'))
  // Chaque environnement existant est forcément un client (PeopleSpheres + Test).
  if (!text().includes('PeopleSpheres') || !text().includes('Test')) throw new Error('Environments not turned into clients')
  if (!text().includes('Clients non aboutis')) throw new Error('« Clients non aboutis » column missing from client kanban')
  // La demande du site a produit une carte sur le tableau Clients...
  if (!text().includes('ACME Corp')) throw new Error("La demande du site n'apparaît pas sur le tableau Clients")
  // La demande du site est arrivée dans « Demandes »...
  await click(hubTab('Demandes'))
  if (!text().includes('ACME Corp')) throw new Error('Contact request not ingested into Demandes')

  // ...et la CLORE la retire du tableau : une demande traitée n'est plus « en cours ».
  // Sans cela le tableau cessait de dire ce qu'il reste à faire, pour ne raconter que
  // ce qui est arrivé un jour.
  {
    const card = [...container.querySelectorAll('main .card')].find(c => c.textContent.includes('ACME Corp'))
    const done = card && [...card.querySelectorAll('button')].find(b => b.textContent.includes('Marquer traitée'))
    if (!done) throw new Error('Bouton « Marquer traitée » introuvable sur la demande')
    await click(done)
    if (!dbNow().clients.some(c => c.key.startsWith('req:') && c.archived)) {
      throw new Error("Clore une demande ne range pas sa carte du tableau Clients")
    }
    await click(hubTab('Clients'))
    if (text().includes('ACME Corp')) throw new Error('La demande close reste sur le tableau Clients')
    // Rien n'est perdu : l'interrupteur rend l'historique.
    const box = [...container.querySelectorAll('main input[type="checkbox"]')][0]
    if (!box) throw new Error("L'accès aux demandes closes n'est pas proposé")
    await click(box)
    if (!text().includes('ACME Corp')) throw new Error('Les demandes closes sont introuvables, donc perdues')
    await click(box)
    // Rouvrir la demande la remet sur le tableau : le rangement se défait.
    await click(hubTab('Demandes'))
    const card2 = [...container.querySelectorAll('main .card')].find(c => c.textContent.includes('ACME Corp'))
    const reopen = card2 && [...card2.querySelectorAll('button')].find(b => b.textContent.includes('Rouvrir'))
    if (!reopen) throw new Error('Impossible de rouvrir une demande traitée')
    await click(reopen)
    if (dbNow().clients.some(c => c.key.startsWith('req:') && c.archived)) {
      throw new Error('Rouvrir une demande ne la remet pas sur le tableau')
    }
  }
  // ...et a généré automatiquement un projet ; chaque environnement a aussi son projet d'implémentation.
  await click(hubTab('Projets & atelier'))
  // Organigramme d'un projet : organisation des personnes et rôles de l'entreprise.
  {
    const orgBtn = [...container.querySelectorAll('main button[title="Organigramme du projet"]')][0]
    if (!orgBtn) throw new Error('Project org chart button missing')
    await click(orgBtn)
    if (!text().includes('Organigramme —')) throw new Error('Project org chart did not open')
    await click(find('button', 'Rôles et accès'))
    for (const k of ['Onglets visibles', 'Droits de management', 'Enregistrer vos modifications']) {
      if (!text().includes(k)) throw new Error('Roles panel missing: ' + k)
    }
    if (!text().includes('Manager') || !text().includes('Membre')) throw new Error('Default env roles missing')
    await click(find('button', 'Annuler'))
    // Fiche d'un collaborateur : elle plantait, aucun gestionnaire n'étant transmis.
    const profBtn = find('button', 'Afficher le profil')
    if (!profBtn) throw new Error('Profile button missing from project org chart')
    await click(profBtn)
    if (!text().includes('Entrer dans cet espace')) throw new Error('Profile panel did not open')
    await click(find('button', 'Retour aux projets'))
  }
  // Prise en charge : un projet sans preneur est à tout le monde, donc à personne.
  if (!text().includes('non pris en charge')) throw new Error('Un projet sans preneur doit être signalé')
  {
    const take = find('button', 'Prendre en charge')
    if (!take) throw new Error('Bouton de prise en charge absent')
    await click(take)
    win.__bdrFlushSave?.()
    const st = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    if (!(st.projects || []).some(p => p.ownerId)) throw new Error("La prise en charge n'a pas été enregistrée")
    if (!(st.supportLogs || []).some(l => l.action === 'Projet pris en charge')) throw new Error('La prise en charge doit être journalisée')
  }

  if (!text().includes('ACME Corp')) throw new Error('Auto-project from request not created')
  if (!text().includes('PeopleSpheres')) throw new Error('Environment project not created')
  // Création manuelle d'un projet : le formulaire + le planning Gantt doivent fonctionner.
  await click(find('button', 'Nouveau projet'))
  if (!text().includes('Phases du projet')) throw new Error('Project form did not open')
  await type([...container.querySelectorAll('input')].find(i => (i.getAttribute('placeholder') || '').includes('Déploiement')), 'Projet manuel')
  await click(find('button', 'Enregistrer'))
  if (!text().includes('Avancement')) throw new Error('Project not created / Gantt did not render')

  // « Nouveau projet » doit créer la livraison ET son environnement : une livraison sans
  // environnement est une coquille — ni modules, ni rôles, ni utilisateurs, ni passerelle.
  {
    const envsBefore = dbNow().environments.length
    const projBefore = dbNow().projects.length
    await click(find('button', 'Nouveau projet'))
    const nameF = [...container.querySelectorAll('main input')].find(i => (i.placeholder || '').includes('Déploiement'))
    const clientF = [...container.querySelectorAll('main input')].find(i => (i.placeholder || '').includes('Nom du client'))
    if (!nameF || !clientF) throw new Error('Champs du formulaire de projet introuvables')
    await type(nameF, 'Chantier Aurora')
    await type(clientF, 'Aurora SAS')
    await click(find('button', 'Enregistrer') || find('button', 'Créer'))
    const st2 = dbNow()
    if (st2.environments.length !== envsBefore + 1) throw new Error("« Nouveau projet » n'a pas créé l'environnement associé")
    // UN SEUL projet : `createEnv` sème déjà une livraison, on la reprend au lieu d'en ajouter une.
    if (st2.projects.length !== projBefore + 1) {
      throw new Error(`« Nouveau projet » a créé ${st2.projects.length - projBefore} projets au lieu d'un seul`)
    }
    const made = st2.projects.find(p => p.name === 'Chantier Aurora')
    if (!made) throw new Error('Le projet créé ne porte pas le nom saisi')
    if (!made.envId) throw new Error("Le projet créé n'est pas rattaché à son environnement")
    const env2 = st2.environments.find(e => e.id === made.envId)
    if (!env2 || env2.name !== 'Aurora SAS') throw new Error("L'environnement doit porter le nom du client")
    if (!(st2._autoSeed?.envProjects || []).includes(env2.id)) {
      throw new Error('Repère de semis manquant : le projet reviendrait après suppression')
    }
  }

  // Supprimer une livraison doit emporter SON ENVIRONNEMENT : sans cela il se balade —
  // invisible depuis la console, bien vivant pour son équipe. Et rien n'est définitif :
  // tout passe par l'archive, avec un ticket de fermeture pour en discuter.
  {
    const made = dbNow().projects.find(p => p.name === 'Chantier Aurora')
    const envId = made.envId
    // La fiche du projet — pas le planning, qui contient le même nom sans les actions.
    const card = [...container.querySelectorAll('main .card')].find(c => c.textContent.includes('Chantier Aurora')
      && c.querySelector('button[title="Supprimer le projet et son environnement"]'))
    const del = card && card.querySelector('button[title="Supprimer le projet et son environnement"]')
    if (!del) throw new Error('Bouton de suppression du projet introuvable')
    await click(del)
    if (!text().includes('Supprimer la livraison et son environnement')) {
      throw new Error("La suppression ne dit pas ce qu'elle emporte")
    }
    const reason = [...container.querySelectorAll('main textarea')].find(t => (t.placeholder || '').includes('Fin de contrat'))
    if (!reason) throw new Error('Le motif de fermeture n\'est pas demandé')
    await type(reason, 'Environnement de test')
    await click(find('button', 'Supprimer et archiver'))
    const st = dbNow()
    if (st.projects.some(p => p.id === made.id)) throw new Error('Le projet supprimé est toujours là')
    if (st.environments.some(e => e.id === envId)) throw new Error("L'environnement du projet supprimé se balade encore")
    if (st.subenvs.some(x => x.envId === envId)) throw new Error('Des espaces orphelins subsistent après la suppression')
    const entry = (st.supportTrash || []).find(t => t.kind === 'project' && t.data?.env?.id === envId)
    if (!entry) throw new Error("La livraison supprimée n'est pas dans la corbeille : la suppression est irréversible")
    const tk = (st.tickets || []).find(t => t.id === entry.data.ticketId)
    if (!tk || tk.category !== 'Fermeture de projet') throw new Error('Aucun ticket de fermeture n\'a été ouvert')
    // Le ticket est ADRESSÉ au client, et ne lui montre ni le nom du collègue qui a fermé
    // l'accès, ni le motif interne : la décision est celle de BD Report, pas d'une personne.
    if (tk.messages[0].from !== 'support') throw new Error('Le message de contexte doit venir de BD Report, pas du client')
    const seen = tk.messages.map(m => `${m.text} ${m.authorName || ''}`).join(' ')
    if (entry.deletedBy && seen.includes(entry.deletedBy)) throw new Error('Le nom du staff qui ferme est visible du client')
    if (seen.includes('Environnement de test')) throw new Error('Le motif interne est visible du client')
    if (!seen.includes('L\'accès au logiciel BD Report')) throw new Error('Le message ne dit pas que l\'accès a été fermé')
    // DE QUOI on parle : un client peut avoir plusieurs projets chez nous.
    if (!seen.includes('Aurora SAS')) throw new Error('Le ticket de fermeture ne nomme pas le client')
    if (!seen.includes('Chantier Aurora')) throw new Error('Le ticket de fermeture ne nomme pas le projet')
    if (tk.projectName !== 'Chantier Aurora') throw new Error('Le ticket ne porte pas le nom du projet fermé')
    if (!seen.includes('supprimer définitivement')) throw new Error('Le message ne dit pas à quoi sert la discussion')
    // …mais le support, lui, garde tout ce qu'il faut pour trancher.
    if (tk.projectClosure?.reason !== 'Environnement de test') throw new Error("Le motif interne n'est pas conservé pour le support")
    if (!tk.projectClosure?.deletedBy) throw new Error("Le ticket ne dit pas au support qui a fermé l'accès")
    // Aurora n'a encore aucun compte client : le fil reste rattaché à l'environnement, et
    // à personne — s'adresser à quelqu'un qui n'existe pas serait pire que le silence.
    if (tk.envId !== envId) throw new Error("Le ticket de fermeture n'est pas rattaché à l'environnement")

    // La CLÔTURE de ce ticket est un choix : rétablir, ou supprimer pour de bon.
    await click(hubTab('Tickets'))
    await click(find('button', 'Fermeture de projet'))
    if (!text().includes('Projet fermé — décision attendue')) throw new Error('Le ticket de fermeture ne propose pas de décision')
    if (!text().includes('Environnement de test')) throw new Error('Le motif interne doit être lisible côté support')
    if (find('button', 'Clôturer')) throw new Error('Un ticket de fermeture ne doit pas se clôturer sans décision')
    await click(find('button', 'Rétablir le projet'))
    await click(findExact('Rétablir'))
    const back = dbNow()
    if (!back.environments.some(e => e.id === envId)) throw new Error('Rétablir ne rend pas l\'environnement')
    if (back.projects.filter(p => p.id === made.id).length !== 1) throw new Error('Rétablir ne rend pas la livraison (ou la duplique)')
    if ((back.supportTrash || []).some(t => t.id === entry.id)) throw new Error('L\'archive rétablie reste dans la corbeille')
    const done = back.tickets.find(t => t.id === tk.id)
    if (done.status !== 'closed' || done.projectClosure.decided !== 'restored') {
      throw new Error('Le ticket de fermeture n\'est pas clôturé par la décision')
    }
    await click(hubTab('Projets & atelier'))
  }

  // MENU DE L'ENVIRONNEMENT : le staff range les rubriques pour CE client. ⚠️ Ranger
  // n'accorde rien — la disposition s'applique après le filtrage par offre, rôle et module.
  {
    const st2 = () => win.__bdrStore
    const nav = await import('../src/nav.jsx')
    const visible = [{ id: 'a', label: 'A', items: [{ id: 'dashboard' }, { id: 'rdv' }] },
      { id: 'b', label: 'B', items: [{ id: 'leads' }] }]
    // Une disposition qui déplace un onglet ne crée ni ne supprime rien.
    const moved = nav.applyNavLayout(visible, [{ id: 'z', label: 'Z', items: ['leads', 'dashboard'] }])
    const ids = moved.flatMap(g => g.items.map(i => i.id))
    if (ids.length !== 3) throw new Error(`Disposition : ${ids.length} onglets au lieu de 3 — un onglet a été perdu ou dupliqué`)
    if (moved[0].label !== 'Z' || moved[0].items[0].id !== 'leads') throw new Error("La disposition n'ordonne pas les onglets")
    // ⚠️ Un onglet que la disposition ne nomme PAS reste visible, dans sa rubrique d'origine :
    // sinon une brique livrée après la composition du menu disparaîtrait sans prévenir.
    if (!ids.includes('rdv')) throw new Error("Un onglet absent de la disposition disparaît du menu")
    // Et une disposition ne peut pas faire apparaître un onglet auquel on n'a pas droit.
    const ghost = nav.applyNavLayout(visible, [{ id: 'z', label: 'Z', items: ['primes', 'kpi'] }])
    if (ghost.flatMap(g => g.items.map(i => i.id)).some(x => ['primes', 'kpi'].includes(x))) {
      throw new Error('La disposition fait apparaître un onglet non autorisé — ranger accorderait un droit')
    }
    // Le store enregistre bien la disposition sur l'environnement.
    await act(async () => { st2().saveEnvNavLayout('env-peoplespheres', [{ id: 'z', label: 'Zone test', items: ['leads'] }]) })
    if (!(st2().envNavLayout('env-peoplespheres') || []).some(g => g.label === 'Zone test')) {
      throw new Error("La disposition du menu n'est pas enregistrée sur l'environnement")
    }
    await act(async () => { st2().resetEnvNavLayout('env-peoplespheres') })
    if (st2().envNavLayout('env-peoplespheres')) throw new Error('Remettre par défaut ne vide pas la disposition')
  }

  // Atelier : désormais une VUE de « Projets & atelier », pas un onglet à part. On y accède
  // par le sélecteur de vue, et l'assistant doit s'y comporter comme avant.
  await click(hubTab('Projets & atelier'))
  // Les deux anciens onglets ont disparu de la barre du hub.
  {
    const hubBtns = [...container.querySelectorAll('main button')].map(b => b.textContent.trim())
    if (hubBtns.includes('Projets') && !hubBtns.includes('Projets & atelier')) throw new Error("L'ancien onglet Projets subsiste")
  }
  // Passerelle : depuis une livraison, on ouvre l'atelier SUR son environnement.
  {
    const bridge = [...container.querySelectorAll('main button[title="Ouvrir dans l\'atelier"]')][0]
    if (!bridge) throw new Error("La passerelle vers l'atelier manque sur les livraisons")
    await click(bridge)
    if (!text().includes('Voir comme')) throw new Error("La passerelle n'ouvre pas l'explorateur de l'atelier")
    await click([...container.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Livraisons'))
  }
  await click([...container.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Atelier'))
  if (!text().includes('Composer un espace client')) throw new Error("L'atelier ne s'affiche pas dans la vue fusionnée")
  if (!text().includes('Voir comme')) throw new Error("L'aperçu par rôle manque à l'explorateur")
  {
    await click(find('button', 'Nouvel environnement'))
    for (const k of ['Identité & modèle', 'Modules', 'Rôles & onglets', 'Équipe', 'Récapitulatif']) {
      if (!text().includes(k)) throw new Error("Étape manquante dans l'assistant : " + k)
    }
    if (!text().includes('Configuration par défaut')) throw new Error('La bibliothèque de modèles ne montre rien')
    // Un rôle doit afficher ce qu'il ouvre AVANT toute création.
    await click([...container.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('3.')))
    if (!text().includes('Ce que voit')) throw new Error("L'aperçu du rôle doit être visible dès la composition")
    await click(find('button', 'Annuler'))
  }

  // CRÉATION RÉELLE d'un environnement par l'assistant. Le test s'arrêtait jusqu'ici à
  // « Annuler » : il éprouvait la composition, jamais la livraison. Or c'est précisément le
  // geste final — créer — qui compte, et personne ne le vérifiait.
  {
    await click(find('button', 'Nouvel environnement'))
    const nameInput = [...container.querySelectorAll('main input')].find(i => !i.placeholder && i.type !== 'checkbox' && i.type !== 'radio')
    if (!nameInput) throw new Error("Le champ du nom manque à la première étape de l'assistant")
    await type(nameInput, 'Client Atelier')
    for (let i = 0; i < 4; i++) {
      const next = find('button', 'Suivant')
      if (!next) throw new Error(`Étape ${i + 1} : bouton « Suivant » introuvable`)
      await click(next)
    }
    const createBtn = find('button', "Créer l'environnement")
    if (!createBtn) throw new Error("Le bouton « Créer l'environnement » manque à la dernière étape")
    await click(createBtn)
    const st = dbNow()
    const made = (st.environments || []).find(e => e.name === 'Client Atelier')
    if (!made) throw new Error("L'assistant n'a PAS créé l'environnement")
    // Un environnement créé est une livraison : sans son projet, il n'apparaît nulle part.
    if (!(st.projects || []).some(p => p.sourceEnvId === made.id)) {
      throw new Error("L'environnement créé n'a pas de livraison — il serait invisible dans « Projets & atelier »")
    }
    // Et son repère de semis est posé, sinon le projet ressusciterait après suppression.
    if (!(st._autoSeed?.envProjects || []).includes(made.id)) {
      throw new Error('Le repère de semis manque : le projet supprimé reviendrait au rechargement')
    }
    // Présent dans la base ne veut pas dire VISIBLE : après l'assistant, on doit atterrir sur
    // la livraison qui vient de naître et la voir. C'est ce que l'utilisateur constate, lui.
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    if (!text().includes('Client Atelier')) {
      throw new Error("L'environnement créé n'apparaît pas à l'écran après la création")
    }
    // Il doit aussi figurer dans l'explorateur de l'atelier.
    await click([...container.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Atelier'))
    if (!text().includes('Client Atelier')) {
      throw new Error("L'environnement créé n'apparaît pas dans l'explorateur de l'atelier")
    }
    await click([...container.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Livraisons'))
  }

  // Agenda staff : mon agenda ne montre que ce dont je réponds, l'agenda d'équipe montre tout.
  await click(hubTab('Agenda'))
  if (!text().includes('Mon agenda')) throw new Error("L'agenda staff ne s'affiche pas")
  await click(find('button', "Agenda de l'équipe"))
  if (!text().includes('À prendre en charge') && !text().includes('Aucune phase de projet')) {
    throw new Error("L'agenda d'équipe doit montrer les projets à prendre ou dire qu'il n'y en a pas")
  }

  // 6c. Logs Support : la création de ticket a bien été journalisée.
  await click(hubTab('Logs'))
  if (!text().includes('Ticket créé')) throw new Error('Support log for ticket creation missing')
  // Le journal doit être filtrable : c'est ce qu'on demande en revue de conformité.
  for (const k of ['Accès & permissions', 'Clients & environnements', 'Navigation', 'Exporter en CSV']) {
    if (!text().includes(k)) throw new Error('Log filter missing: ' + k)
  }
  {
    // La navigation du staff est tracée : on vient de traverser la console, la ligne existe.
    if (!text().includes('Écran consulté')) throw new Error("La navigation du staff doit être journalisée")
    const search = [...container.querySelectorAll('input')].find(i => (i.getAttribute('placeholder') || '').includes("Mot-clé dans l'action"))
    if (!search) throw new Error('Recherche plein texte absente du journal')
    await type(search, 'zzzaucunechance')
    if (!text().includes('Aucune entrée ne correspond')) throw new Error('La recherche du journal ne filtre pas')
    await click(find('button', 'Réinitialiser'))
  }

  // 6d. Désactiver / réactiver / supprimer l'accès d'un environnement client se fait
  // désormais dans Projets → Utilisateurs, et NON plus sur la fiche Clients.
  await click(hubTab('Clients'))
  await click(find('button', 'PeopleSpheres'))
  if (find('button', "Bloquer le client") || find('button', "Supprimer l'environnement")) {
    throw new Error('Env controls should have left the client card')
  }
  await click(find('button', 'Fermer'))
  await click(hubTab('Projets & atelier'))
  {
    // Ce que le client reçoit (modules, offre, membres, accès, déploiement) vit désormais
    // dans l'ATELIER, à côté de l'aperçu par rôle — plus dans une fenêtre ouverte depuis
    // une livraison. On y arrive par la passerelle de la livraison concernée.
    const bridge = [...container.querySelectorAll('main .card')]
      .find(c => c.textContent.includes('PeopleSpheres') && c.querySelector('button[title="Ouvrir dans l\'atelier"]'))
      ?.querySelector('button[title="Ouvrir dans l\'atelier"]')
    if (!bridge) throw new Error("La passerelle vers l'atelier manque sur la livraison PeopleSpheres")
    await click(bridge)
    // `<details>` s'ouvre par son attribut, pas par un gestionnaire React : le simuler
    // par un clic ne déclencherait rien.
    const panel = [...container.querySelectorAll('main details')].find(d => d.textContent.includes('Ce que ce client reçoit'))
    if (!panel) throw new Error("Le panneau « Ce que ce client reçoit » manque à l'atelier")
    await act(async () => { panel.open = true })
    if (!text().includes("Accès de l'environnement")) throw new Error('Env access panel missing from project users')
    if (!find('button', "Supprimer l'environnement")) throw new Error("Delete-env button missing from project users")
    // Déploiement : le geste ferme le cadrage et ouvre l'implémentation.
    if (!find('button', 'Déployer cet environnement')) throw new Error('Deploy button missing from project users')
    await click(find('button', 'Déployer cet environnement'))
    win.__bdrFlushSave?.()
    {
      const st = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
      const proj = (st.projects || []).find(p => p.sourceEnvId === 'env-peoplespheres' || p.envId === 'env-peoplespheres')
      if (!proj) throw new Error('Projet de l\'environnement introuvable')
      if (proj.currentPhase !== 'Implémentation') throw new Error('Le déploiement doit faire passer le projet en Implémentation')
      if (!proj.phases.find(ph => ph.name === 'Cadrage')?.done) throw new Error('Le déploiement doit clore le cadrage')
      if (!(st.supportLogs || []).some(l => l.action === 'Environnement déployé')) throw new Error('Le déploiement doit être journalisé')
    }
    // Maintenance : la phase est posée à l'entrée chez un client et RETIRÉE quand
    // l'intervention est terminée — c'est un état, pas une étape du déroulé.
    {
      const api = () => win.__bdrStore
      api().markProjectMaintenance('env-peoplespheres')
      await act(async () => {})
      win.__bdrFlushSave?.()
      let st = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
      let proj = (st.projects || []).find(p => p.sourceEnvId === 'env-peoplespheres' || p.envId === 'env-peoplespheres')
      if (proj.currentPhase !== 'Maintenance') throw new Error("L'entrée chez un client doit passer le projet en Maintenance")
      if (!proj.phases.some(ph => ph.name === 'Maintenance')) throw new Error('La phase Maintenance doit être posée')
      api().endProjectMaintenance('env-peoplespheres')
      await act(async () => {})
      win.__bdrFlushSave?.()
      st = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
      proj = (st.projects || []).find(p => p.sourceEnvId === 'env-peoplespheres' || p.envId === 'env-peoplespheres')
      if (proj.phases.some(ph => ph.name === 'Maintenance')) throw new Error("Terminer l'intervention doit retirer la phase Maintenance")
      if (proj.currentPhase === 'Maintenance') throw new Error('Le projet doit retrouver son étape en cours')
      if (proj.maintenanceBy) throw new Error("Le nom de l'intervenant doit être effacé")
    }
    await click(find('button', "Désactiver l'accès"))
    // La confirmation est imbriquée dans la fenêtre Utilisateurs, qui porte elle aussi des
    // boutons « Désactiver » (un par membre) : viser le dernier calque, pas le premier libellé.
    const confirmBtn = () => [...container.querySelectorAll('.fixed.z-50')].pop()?.querySelector('.btn-danger')
    await click(confirmBtn())
    if (dbNow().environments.find(e => e.id === 'env-peoplespheres').subState !== 'blocked') throw new Error('Env not blocked')
    await click(find('button', "Réactiver l'accès"))
    if (dbNow().environments.find(e => e.id === 'env-peoplespheres').subState !== 'active') throw new Error('Env not unblocked')
    // Plus rien à fermer : le panneau fait partie de l'atelier, il n'ouvre plus de fenêtre.
  }

  // 7. Créer un RDV via le formulaire : validation des champs obligatoires puis création réelle
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Mes Rendez-vous'))
  await click(find('button', 'Créer un RDV'))
  if (!text().includes('Phase de transaction')) throw new Error('RDV form did not open')
  await click(find('button', 'Enregistrer le rendez-vous'))
  if (!text().includes('Champs obligatoires')) throw new Error('Required-field validation did not trigger')
  // remplit entreprise + phase + provenance via les menus custom
  const labelOf = (txt) => [...container.querySelectorAll('label')].find(l => l.textContent.includes(txt))
  await type(labelOf("Nom de l'entreprise").parentElement.querySelector('input'), 'TestCorp')
  await click(labelOf('Phase de transaction').parentElement.querySelector('button')) // ouvre le menu
  await click(find('.absolute button', 'R1'))
  await click(labelOf('Provenance du lead').parentElement.querySelector('button'))
  await click(find('.absolute button', 'Cold Call'))
  await click(find('button', 'Enregistrer le rendez-vous'))
  if (!text().includes('TestCorp')) throw new Error('Created RDV not visible in table')

  // 8. Le contact / l'entreprise alimente bien les données ; vérifie le kanban Leads
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Leads'))
  if (!text().includes('TestCorp')) throw new Error('New RDV not visible in Leads kanban')
  // Le pipeline du fichier importé est bien injecté dans l'espace d'Owen (une seule fois).
  if (!dbNow().data['sub-owen'].rdvs.some(r => r.entreprise === 'Derichebourg')) throw new Error('Pipeline xlsx not imported into Owen space')

  // 8b. Mes contacts : création manuelle d'un contact
  await click(navBtn('Mes contacts'))
  // Base de contacts commune : reprise du pipeline de l'équipe.
  if (!find('button', "Importer depuis l'équipe")) throw new Error('Team contact import missing')
  await click(find('button', 'Nouveau contact'))
  await type(labelOf('Nom & Prénom').parentElement.querySelector('input'), 'Jean Test Manuel')
  await click(find('button', 'Créer le contact'))
  if (!text().includes('Jean Test Manuel')) throw new Error('Manual contact not created')

  // 8c. Gestion Manager : la page rend, et AUCUN mot de passe en clair n'est exposé (sécurité)
  await click(navBtn('Gestion Manager'))
  if ([...container.querySelectorAll('input')].some(i => i.value === 'demo1234')) throw new Error('Admin must not expose plaintext password')

  // 8d. ICP : page rendue + création d'un profil sur mesure
  await click(navBtn('ICP'))
  if (!text().includes('Moyenne globale')) throw new Error('ICP page did not render')
  await click(find('button', 'Créer un profil'))
  await click(find('button', 'Créer le profil'))
  if (!text().includes('Mes profils ICP')) throw new Error('ICP custom profile not created')

  // 9. Organigramme + paramètres
  await click(container.querySelector('button[title="Organigramme"]'))
  if (!text().includes('Organigramme')) throw new Error('OrgChart did not render')
  await click(find('button', "Modifier l'organigramme"))
  if (!text().includes('Réorganisation libre')) throw new Error('OrgChart edit mode did not open')
  await click(find('button', 'Terminer'))
  await click(container.querySelector('button[title="Paramètres"]'))
  if (!text().includes('Thèmes de design')) throw new Error('Settings did not render')
  // Catalogue réduit à quatre thèmes, dont le nouveau design « Studio ».
  for (const th of ['BD Report', 'Sombre', 'Nuit profonde', 'BD Report Studio']) {
    if (!text().includes(th)) throw new Error('Theme missing from picker: ' + th)
  }
  if (text().includes('Ambiances animées')) throw new Error('Animated themes should be gone')
  if (text().includes('Rose Punch') || text().includes('Sakura')) throw new Error('Removed themes still offered')
  // Le skin pose une classe sur <html> : c'est elle qui change les formes.
  await click(find('button', 'BD Report Studio'))
  await click(find('button', 'Sauvegarder le thème'))
  if (!win.document.documentElement.classList.contains('skin-studio')) throw new Error('Studio skin class not applied')

  // 9a. Profil + statut de présence : la fiche récap s'ouvre et le statut est modifiable.
  await click(container.querySelector('button[title="Mon profil et statut"]'))
  if (!text().includes('Mon statut') || !text().includes('Manager direct')) throw new Error('Profile modal missing')
  await click(find('button', 'Hors ligne'))
  if (dbNow().accounts.find(a => a.id === '01').presence !== 'offline') throw new Error('Presence not updated')
  await click(find('button', 'En ligne')) // remet en ligne pour la suite

  // 9b. Recherche globale d'un collaborateur : la personne apparaît comme résultat « Collaborateur ».
  await act(async () => { win.dispatchEvent(new win.CustomEvent('open-global-search')) })
  const gsInput = container.querySelector('input[placeholder^="Rechercher"]')
  if (!gsInput) throw new Error('Global search did not open')
  await type(gsInput, 'Owen')
  if (!text().includes('Collaborateur')) throw new Error('Collaborator not surfaced in global search')
  await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' })) })

  // 9b. Résiliation d'abonnement : ouvre un ticket support + bascule l'environnement en lecture seule.
  await click(find('button', 'Gérer mes environnements'))
  await click(find('button', 'Résilier mon abonnement'))
  await click(findExact('Résilier')) // confirmation
  const dbR = dbNow()
  if (dbR.environments.find(e => e.id === 'env-peoplespheres').subState !== 'cancelling') throw new Error('Résiliation did not set env to cancelling')
  if (!dbR.tickets.some(t => t.category === 'Facturation & abonnement')) throw new Error('Résiliation ticket not created')

  // 10. Migration : un ancien stockage SANS l'environnement Test doit le récupérer au rechargement
  const raw = dbNow()
  raw.environments = raw.environments.filter(x => x.id !== 'env-test')
  raw.accounts = raw.accounts.filter(a => !String(a.id).startsWith('test-'))
  raw.subenvs = raw.subenvs.filter(s => !String(s.id).startsWith('tsub-'))
  Object.keys(raw.data).forEach(k => { if (k.startsWith('tsub-')) delete raw.data[k] })
  // Persistance des suppressions : un projet auto-créé supprimé ne doit pas réapparaître au rechargement.
  if (!raw.projects.some(p => p.sourceEnvId === 'env-peoplespheres')) throw new Error('Env project missing before deletion test')
  raw.projects = raw.projects.filter(p => p.sourceEnvId !== 'env-peoplespheres')
  win.localStorage.setItem('bdrflow_db_v1', JSON.stringify(raw))
  win.sessionStorage.clear()
  // ---- LE SÉLECTEUR D'ENVIRONNEMENTS DOIT MONTRER LES MÊMES QUE LA CONSOLE.
  //      Il tranchait sur `account.developer`, un drapeau que seul le compte d'origine
  //      porte : tout autre compte Fondateur ou Support voyait ses clients partout — fiche
  //      client, livraisons, atelier — et ne pouvait entrer chez aucun. On monte donc un
  //      compte staff SANS ce drapeau, le seul cas où le défaut se voit.
  {
    const raw3 = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    raw3.accounts.push({
      id: 'staff-sansdev', email: 'sylvie@bdreport.fr', pseudo: 'Sylvie',
      role: 'Support BD Report', plan: 'beta', bricks: [], // pas de `developer`
    })
    win.localStorage.setItem('bdrflow_db_v1', JSON.stringify(raw3))
    win.sessionStorage.setItem('bdrflow_session_v1', JSON.stringify({ accountId: 'staff-sansdev', envId: null, subEnvId: null, welcomed: true }))
    win.sessionStorage.setItem('bdr_splashed', '1')
    const ce = win.document.createElement('div')
    win.document.body.appendChild(ce)
    const roote = createRoot(ce)
    await act(async () => { roote.render(Root(React.createElement(App))) })
    const te = () => ce.textContent || ''
    const envsNow = JSON.parse(win.localStorage.getItem('bdrflow_db_v1')).environments
    const hidden = envsNow.filter(e => !te().includes(e.name))
    if (hidden.length) {
      throw new Error(`Environnements invisibles au sélecteur pour un compte staff : ${hidden.map(e => e.name).join(', ')}`)
    }
    await act(async () => { roote.unmount() })

    // …et c'est bien la PERMISSION qui décide, pas le rôle : on la retire au rôle Support,
    // et le même compte ne doit plus voir que les siens. Tester un rôle qui ne l'a jamais eue
    // ne prouverait rien — le rôle seul suffirait à expliquer le résultat.
    const raw4 = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    const supRole = raw4.staffRoles.find(r => (r.roleKey || r.name) === 'Support BD Report')
    if (!supRole || !supRole.permissions.includes('env.access')) throw new Error('Le rôle Support ne porte pas « env.access »')
    supRole.permissions = supRole.permissions.filter(p => p !== 'env.access')
    win.localStorage.setItem('bdrflow_db_v1', JSON.stringify(raw4))
    win.sessionStorage.setItem('bdrflow_session_v1', JSON.stringify({ accountId: 'staff-sansdev', envId: null, subEnvId: null, welcomed: true }))
    const cg = win.document.createElement('div')
    win.document.body.appendChild(cg)
    const rootg = createRoot(cg)
    await act(async () => { rootg.render(Root(React.createElement(App))) })
    const tg = () => cg.textContent || ''
    const leaked = envsNow.filter(e => tg().includes(e.name))
    if (leaked.length) {
      throw new Error(`Sans la permission « env.access », des environnements clients restent visibles : ${leaked.map(e => e.name).join(', ')}`)
    }
    await act(async () => { rootg.unmount() })
    win.sessionStorage.removeItem('bdrflow_session_v1')
  }

  // ---- L'ÉCRAN DU PROPRIÉTAIRE D'UN PROJET FERMÉ. Il peut encore se connecter, mais
  //      l'application ne lui ouvre QUE la discussion de fermeture — et cette discussion
  //      ne lui montre ni le nom du collègue qui a fermé l'accès, ni le motif interne.
  {
    const raw2 = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
    const now = new Date().toISOString()
    raw2.accounts.push({
      id: 'closed-own', email: 'own@closed.fr', pseudo: 'Patronne', role: 'Manager',
      plan: 'beta', bricks: [], closureTicketId: 'tk-closed',
    })
    raw2.tickets.unshift({
      id: 'tk-closed', category: 'Fermeture de projet', status: 'open', priority: 'haute',
      assignedTo: null, csat: null, userAccountId: 'closed-own', userName: 'Patronne', userPhoto: '',
      clientName: 'Ancien client', envId: null, subEnvId: null, createdAt: now, handledBy: null,
      typing: {}, readUserAt: '', readSupportAt: now,
      projectClosure: { envId: 'env-clos', envName: 'Ancien client', trashId: 'tr-x', deletedBy: 'Nadia', reason: 'Impayé', decided: '' },
      messages: [{
        id: 'm1', ts: now, from: 'support', authorAccountId: null, authorName: 'Équipe BD Report',
        authorPhoto: '', text: "L'accès au logiciel BD Report a été fermé par l'équipe BD Report.", photo: '',
      }],
    })
    win.localStorage.setItem('bdrflow_db_v1', JSON.stringify(raw2))
    win.sessionStorage.setItem('bdrflow_session_v1', JSON.stringify({ accountId: 'closed-own', envId: null, subEnvId: null, welcomed: true }))
    win.sessionStorage.setItem('bdr_splashed', '1')
    const cc = win.document.createElement('div')
    win.document.body.appendChild(cc)
    const rootc = createRoot(cc)
    await act(async () => { rootc.render(Root(React.createElement(App))) })
    const tc = () => cc.textContent || ''
    if (!tc().includes('Accès fermé')) throw new Error("Le propriétaire d'un projet fermé n'atterrit pas sur sa discussion de fermeture")
    if (tc().includes('Choisissez votre espace') || tc().includes('Tableau de bord')) {
      throw new Error("Le propriétaire d'un projet fermé accède encore à l'application")
    }
    if (tc().includes('Nadia') || tc().includes('Impayé')) throw new Error('Le client voit le nom du staff ou le motif interne de la fermeture')
    if (!tc().includes("L'accès au logiciel BD Report a été fermé")) throw new Error('Le message de contexte de fermeture est absent')
    // Il peut répondre : sans quoi la discussion n'en serait pas une.
    const zone = [...cc.querySelectorAll('textarea')][0]
    if (!zone) throw new Error('Le propriétaire ne peut pas répondre dans la discussion de fermeture')
    await act(async () => { Simulate.change(zone, { target: { value: 'Je conteste cette fermeture.' } }) })
    const send = [...cc.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').includes('Envoyer')) || [...cc.querySelectorAll('form button')].at(-1)
    if (send) await act(async () => { send.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })) })
    await act(async () => { rootc.unmount() })
    win.sessionStorage.removeItem('bdrflow_session_v1')
  }

  // ---- Page de démo commerciale : montée seule elle aussi (#/demo), visite comprise.
  {
    const { default: DemoJourney } = await import('../src/pages/DemoJourney.jsx')
    const cd = win.document.createElement('div')
    win.document.body.appendChild(cd)
    const rootd = createRoot(cd)
    await act(async () => { rootd.render(Root(React.createElement(DemoJourney, { onClose: () => {} }))) })
    const td = () => cd.textContent || ''
    const btnd = (label) => [...cd.querySelectorAll('button')].find(b => b.textContent.trim().includes(label))
    const clickd = async (el) => act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })) })

    // Parcours d'achat : formulaire VIDE au départ, et rien n'est vérifié — la démo
    // s'ouvre quelle que soit la saisie, y compris aucune.
    if ([...cd.querySelectorAll('input')].some(i => i.value)) throw new Error('Demo signup fields should start empty')
    const create = btnd('Créer mon espace')
    if (!create) throw new Error('Demo signup step missing')
    await clickd(create)
    await act(async () => { await new Promise(r => setTimeout(r, 1500)) })
    if (!btnd('Visite guidée')) throw new Error('Demo did not reach the isolated app with empty credentials')

    // « Nouveau prospect » ramène au formulaire, vide, pour enchaîner un autre rendez-vous.
    await clickd(btnd('Nouveau prospect'))
    const compField = [...cd.querySelectorAll('input')].find(i => (i.getAttribute('placeholder') || '').includes('nom de votre entreprise'))
    if (!compField) throw new Error('Demo signup company field missing')
    if ([...cd.querySelectorAll('input')].some(i => i.value)) throw new Error('Restarted demo signup should be empty again')
    await type(compField, 'Vertigo Studio')
    await type([...cd.querySelectorAll('input[type="password"]')][0], 'nimporte-quoi')
    await clickd(btnd('Créer mon espace'))
    await act(async () => { await new Promise(r => setTimeout(r, 1500)) })
    if (!btnd('Visite guidée')) throw new Error('Demo did not reach the isolated app after signup')

    await clickd(btnd('Visite guidée'))
    await act(async () => { await new Promise(r => setTimeout(r, 500)) })
    if (!td().includes('Étape 1 /')) throw new Error('Guided demo did not start')
    for (let i = 0; i < 25; i++) {
      const next = btnd('Suivant')
      if (!next) break
      await clickd(next)
      await act(async () => { await new Promise(r => setTimeout(r, 380)) })
    }
    if (!btnd('Terminer')) throw new Error('Guided demo never reached its last step')
    rootd.unmount()
  }

  // ---- Page de formation : montée seule, comme en production (#/formation).
  // C'est le seul endroit où le parcours guidé est exercé de bout en bout : il navigue
  // d'un écran à l'autre, et une étape qui plante doit faire tomber le test.
  {
    const { default: TrainingJourney } = await import('../src/pages/TrainingJourney.jsx')
    const c3 = win.document.createElement('div')
    win.document.body.appendChild(c3)
    const root3 = createRoot(c3)
    await act(async () => { root3.render(Root(React.createElement(TrainingJourney, { onClose: () => {} }))) })
    const t3 = () => c3.textContent || ''
    const btn3 = (label) => [...c3.querySelectorAll('button')].find(b => b.textContent.trim().includes(label))
    const click3 = async (el) => act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })) })

    if (!t3().includes('Quelle casquette voulez-vous prendre')) throw new Error('Training role picker missing on its own page')
    await click3(btn3('Support BD Report'))
    await act(async () => { await new Promise(r => setTimeout(r, 600)) })
    if (t3().includes('Choisissez votre espace')) throw new Error('Training stopped on the workspace picker')
    if (t3().includes('Choisissez un environnement')) throw new Error('Training stopped on the environment picker')

    // Parcours guidé : on le déroule entièrement, chaque étape naviguant réellement.
    await click3(btn3('Formation guidée'))
    await act(async () => { await new Promise(r => setTimeout(r, 500)) })
    if (!t3().includes('Étape 1 /')) throw new Error('Guided training did not start')
    for (let i = 0; i < 20; i++) {
      const next = btn3('Suivant')
      if (!next) break
      await click3(next)
      await act(async () => { await new Promise(r => setTimeout(r, 420)) })
    }
    if (!btn3('Terminer')) throw new Error('Guided training never reached its last step')
    await click3(btn3('Terminer'))
    root3.unmount()
  }

  const c2 = win.document.createElement('div')
  win.document.body.appendChild(c2)
  const root2 = createRoot(c2)
  await act(async () => {
    root2.render(Root(React.createElement(App)))
  })
  await act(async () => { await new Promise(r => setTimeout(r, 1700)) }) // splash
  const inputs2 = c2.querySelectorAll('input')
  await type(inputs2[0], 'OwenMtp')
  await type(inputs2[1], 'demo1234')
  await click([...c2.querySelectorAll('button')].find(b => b.textContent.includes('Se connecter')))
  await act(async () => { await new Promise(r => setTimeout(r, 2800)) })
  if (!c2.textContent.includes('Test')) throw new Error('Migration failed: env Test not injected into legacy storage')
  // La suppression du projet auto-créé a bien persisté (migrate ne l'a pas ressuscité).
  const afterReload = dbNow()
  if (afterReload.projects.some(p => p.sourceEnvId === 'env-peoplespheres')) throw new Error('Deleted auto-project resurrected after reload')

  const realErrors = errors.filter(e => !e.includes('act(') && !e.includes('width(0) and height(0)') && !e.includes('Not implemented') && !e.includes('test-utils'))
  if (realErrors.length) throw new Error('Console errors:\n' + realErrors.join('\n---\n'))
  // Modèles d'environnement : la CONFIGURATION se reprend, jamais les données du client
  // d'origine — ouvrir un espace ne doit recopier ni rendez-vous, ni contacts, ni notes.
  {
    const st = win.__bdrStore
    if (!st) throw new Error('Store non exposé pour le test des modèles')
    const read = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')) }
    const src = read().environments.find(e => e.id === 'env-peoplespheres')
    if (!src) throw new Error('Environnement source introuvable')
    const created = st.createEnv({ name: 'Modèle Test', templateOf: 'env-peoplespheres' })
    await act(async () => {})
    const env = read().environments.find(e => e.id === created.id)
    if (!env) throw new Error('Environnement issu du modèle non créé')
    if (!env._template || !env._template.phases?.length) throw new Error('La configuration du modèle n\'a pas été reprise')
    if (!env._template.bareme) throw new Error('Le barème du modèle n\'a pas été repris')
    if ('rdvs' in env._template || 'contacts' in env._template || 'notes' in env._template) {
      throw new Error('Un modèle ne doit JAMAIS embarquer les données du client d\'origine')
    }
  }

  // Mentions sur une fiche entreprise : la personne CHOISIE dans l'autocomplétion est notifiée
  // par son identifiant, et le texte seul reste reconnu pour qui tape la mention à la main.
  // Le test se déroule dans l'environnement « Test » : celui de PeopleSpheres a été passé en
  // résiliation par un test précédent, donc en lecture seule.
  {
    const read = () => { win.__bdrFlushSave?.(); return JSON.parse(win.localStorage.getItem('bdrflow_db_v1')) }
    // `__bdrStore` est l'api du DERNIER rendu : on la relit après chaque action, sinon on
    // travaillerait avec une session périmée.
    const api = () => win.__bdrStore
    api().enterEnv('env-test')
    await act(async () => {})
    api().enterSubEnv('tsub-julie')
    await act(async () => {})
    const mentionsOf = () => (read().data['tsub-thomas']?.mentions || []).length
    const before = mentionsOf()
    api().addCompanyComment('NovaCorp Industries', 'Je passe la main à @Thomas Moreau sur ce compte.', ['tsub-thomas'])
    await act(async () => {})
    if (mentionsOf() !== before + 1) throw new Error("La mention choisie n'a pas notifié la personne visée")
    if (!(read().data['tsub-thomas']?.notifs || []).some(n => n.type === 'mention')) {
      throw new Error('La mention doit aussi remonter dans la cloche de notifications')
    }
    // Mention tapée à la main, sans passer par la liste.
    api().addCompanyComment('NovaCorp Industries', 'ping @Thomas pour la relance')
    await act(async () => {})
    if (mentionsOf() !== before + 2) throw new Error('Une mention tapée à la main doit rester reconnue')
    // Un préfixe ne doit jamais déclencher de notification.
    api().addCompanyComment('NovaCorp Industries', 'aucun @Thom ici')
    await act(async () => {})
    if (mentionsOf() !== before + 2) throw new Error('Un préfixe de prénom ne doit pas notifier')
  }

  // Balayage de TOUTE l'application en anglais. Le contrôle statique ne voit que les
  // chaînes écrites en dur ; celui-ci voit ce qui arrive vraiment à l'écran, page par page.
  // Sans lui, la garantie « tout change de langue » ne portait que sur l'écran des RDV.
  {
    const st = () => win.__bdrStore
    // Relevé remis à zéro : ce qu'on veut juger, c'est ce que MONTRENT les écrans qui
    // suivent — pas un état transitoire capté plus tôt, entre deux rendus de React.
    st().setUiLang('en')
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    // Remise à zéro APRÈS le premier rendu en anglais : l'instant qui sépare le changement
    // de langue du rendu de React n'est pas un état que l'utilisateur voit.
    win.__bdrI18nResetMissing?.()
    const tabs = [...c2.querySelectorAll('nav button')]
    for (const btn of tabs) {
      try {
        await click(btn)
        await act(async () => { await new Promise(r => setTimeout(r, 30)) })
      } catch (e) { /* un onglet qui refuse de s'ouvrir est déjà couvert plus haut */ }
    }
    // Le contenu SAISI (notes, messages, noms d'entreprise) reste dans sa langue : c'est une
    // donnée, la traduire serait la réécrire. On le reconnaît en le retrouvant dans la base.
    const stored = win.localStorage.getItem('bdrflow_db_v1') || ''
    const stop = / (de|des|du|le|la|les|un|une|vous|votre|pour|dans|avec|sur|par|est|aux) /
    const left = (win.__bdrI18nMissing?.() || [])
      .filter(s => s.length > 25 && stop.test(` ${s} `))
      .filter(s => !stored.includes(s))
    if (left.length) {
      throw new Error(`Écrans restés en français en anglais (${left.length}) : ${left.slice(0, 8).join(' | ')}`)
    }
    st().setUiLang('fr')
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
  }

  console.log('SMOKE OK — all screens rendered without errors')
}

main().then(() => process.exit(0), (e) => { console.error("SMOKE FAILED:", e.stack || e.message); process.exit(1) })
