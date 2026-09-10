// Audit : monte la démo et l'app réelle, traverse tout, et relève les erreurs de rendu.
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
const win = dom.window
Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage,
  sessionStorage: win.sessionStorage, HTMLInputElement: win.HTMLInputElement, HTMLElement: win.HTMLElement,
  Element: win.Element, Node: win.Node, Event: win.Event, CustomEvent: win.CustomEvent, MouseEvent: win.MouseEvent,
  FileReader: win.FileReader, Blob: win.Blob, getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })
win.ResizeObserver = globalThis.ResizeObserver

async function main() {
  const s = await import('../src/store.jsx')
  const problems = []
  const ok = (c, m) => { if (!c) problems.push(m) }

  // 1. Démo : tous les modules doivent être actifs et alimentés.
  const demo = s.buildDemoDb({ company: 'Atlas Revenue' })
  const env = demo.environments.find(e => e.id === 'env-demo')
  s.ENV_MODULES.forEach(m => ok(s.envModuleOn(env, m.id), `Démo : module ${m.id} inactif`))
  ok((env.challenges || []).length >= 2, 'Démo : challenges absents')
  ok(env.quotas && Object.keys(env.quotas.byMember || {}).length > 0, 'Démo : quotas absents')
  ok((demo.channels || []).some(c => c.oneToOne), 'Démo : aucun 1:1')
  Object.entries(demo.data).forEach(([k, d]) => {
    ok((d.objections || []).length > 0, `Démo ${k} : objections absentes`)
    ok((d.messageTemplates || []).length > 0, `Démo ${k} : modèles de messages absents`)
    ok(d.primeRules && d.primeRules.on === false, `Démo ${k} : les modulateurs de prime doivent être neutres`)
    ok((d.rdvs || []).some(r => r.handoff), `Démo ${k} : aucune passation`)
    ok((d.rdvs || []).some(r => (r.contacts || []).some(c => c.role)), `Démo ${k} : aucun comité d'achat`)
  })

  // 2. Cohérence des catalogues.
  const dupClient = s.CLIENT_PERMISSION_IDS.filter((v, i, a) => a.indexOf(v) !== i)
  ok(dupClient.length === 0, 'Droits client en double : ' + dupClient)
  const dupStaff = s.STAFF_PERMISSION_IDS.filter((v, i, a) => a.indexOf(v) !== i)
  ok(dupStaff.length === 0, 'Droits staff en double : ' + dupStaff)
  const nav = await import('../src/nav.jsx')
  const bricks = nav.GRANTABLE_TABS.map(t => t.brick)
  const dupBricks = bricks.filter((v, i, a) => a.indexOf(v) !== i)
  ok(dupBricks.length === 0, 'Briques en double dans la navigation : ' + dupBricks)
  // Toute brique doit être accordable par au moins une offre.
  const offers = s.defaultOffers()
  const beta = offers.find(o => o.id === 'beta')
  const notInBeta = bricks.filter(b => !beta.bricks.includes(b))
  ok(notInBeta.length === 0, "Briques absentes de l'offre Beta : " + notInBeta)

  // 3. Migration : une base vierge doit se stabiliser (idempotence).
  const fresh = s.buildDemoDb({})
  const before = JSON.stringify(fresh.channels.length)
  ok(before === JSON.stringify(fresh.channels.length), 'instable')

  // 4. Modulateurs : un total nul n'explose pas.
  const r = s.applyPrimeRules(0, { data: { primeRules: { on: true, cap: { on: true, amount: 100 } } }, env: null, subId: 'x', monthKey: '2026-09' })
  ok(r.total === 0, 'Un total nul ne doit pas devenir positif')

  // 5. Contraste : un fond clair codé en dur sans variante sombre devient illisible dans
  // les thèmes Nuit et Studio. On refuse la classe, pas la couleur.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.default.join(process.cwd(), 'src', 'pages')
  const NEW_FILES = ['Handoff.jsx', 'Objections.jsx', 'MessageTemplates.jsx', 'Quotas.jsx', 'Challenges.jsx', 'Statements.jsx', 'Workshop.jsx', 'StaffAgenda.jsx', 'SupportLogs.jsx']
  NEW_FILES.forEach(f => {
    const txt = fs.default.readFileSync(path.default.join(dir, f), 'utf8')
    const re = /bg-(amber|emerald|red|sky|rose|purple|slate|blue|orange)-(50|100|200)\b/g
    let m
    while ((m = re.exec(txt))) {
      const around = txt.slice(m.index, m.index + 220)
      if (!around.includes('dark:')) problems.push(`${f} : ${m[0]} sans variante sombre`)
    }
  })

  // 5 bis. Un seul montant de primes dans toute l'app : le versé.
  {
    const d = s.buildDemoDb({})
    const e3 = d.environments.find(x => x.id === 'env-demo')
    const mk = new Date().toISOString().slice(0, 7)
    Object.keys(d.data).forEach(k => {
      const paid = s.monthlyPaidPrimes(d.data[k], e3, k, mk)
      const viaQuota = s.quotaAchieved(d.data[k], 'primes', 'mois', new Date(), { env: e3, subId: k })
      ok(paid === viaQuota, `${k} : quota et tableau de bord annoncent des primes différentes (${viaQuota} vs ${paid})`)
      ok(s.buildStatement(d.data[k], e3, k, mk).total === paid, `${k} : le relevé diverge du montant affiché`)
    })
  }

  // 5 ter. Le closing doit être peuplé dans la démo, dans ses trois états.
  {
    const d = s.buildDemoDb({})
    let open = 0, won = 0, lost = 0
    Object.values(d.data).forEach(data => (data.rdvs || []).forEach(r => {
      const st = s.closingState(r, data)
      if (st === 'won') won++; else if (st === 'lost') lost++; else if (st) open++
    }))
    ok(open > 0, 'Démo : aucune affaire en cours de closing')
    ok(won > 0, 'Démo : aucune affaire signée au closing')
    ok(lost > 0, 'Démo : aucune affaire perdue au closing')
  }

  // 6. Relevé de primes : chaque ligne doit être NOMMÉE, y compris les primes d'activité.
  {
    const d = s.buildDemoDb({})
    const e2 = d.environments.find(x => x.id === 'env-demo')
    const st = s.buildStatement(d.data['dsub-b1'], e2, 'dsub-b1', Object.keys({}).length ? '' : new Date().toISOString().slice(0, 7))
    ok(st.lines.every(l => l.label && l.label !== 'undefined'), 'Relevé : une ligne sans intitulé')
  }

  // 6 bis. Le texte affiché est TRADUIT ; il ne doit jamais servir de valeur enregistrée.
  //   Un `<option>` sans attribut `value` prend son propre texte pour valeur : en anglais,
  //   choisir « Signed » écrirait « Signed » dans les données d'un client francophone.
  //   Aucun aujourd'hui — la règle est là pour que ça le reste.
  {
    const files = fs.default.readdirSync(dir).filter(f => /\.jsx$/.test(f))
      .map(f => ['pages/' + f, path.default.join(dir, f)])
      .concat(['App.jsx', 'ui.jsx'].map(f => [f, path.default.join(process.cwd(), 'src', f)]))
    files.forEach(([name, full]) => {
      const txt = fs.default.readFileSync(full, 'utf8')
      for (const m of txt.matchAll(/<option\b[^>]*>/g)) {
        if (!/\bvalue=/.test(m[0])) problems.push(`${name} : <option> sans value — son texte traduit deviendrait la donnée`)
      }
    })
  }

  // 6 ter. Atterrissage : la fourchette doit REFLÉTER un ralentissement, sinon elle ne sert
  //   à rien. Espace fabriqué à la main — 10 rendez-vous pris du 1er au 10, puis plus rien.
  {
    const now = new Date(2026, 8, 15) // 15 septembre, mois de 30 jours
    const rdvs = []
    for (let i = 1; i <= 10; i++) rdvs.push({ id: 'r' + i, datePriseRdv: `2026-09-${String(i).padStart(2, '0')}`, phase: 'R1', opportunite: 'En cours' })
    const f = s.landingForecast({ rdvs, phases: ['R1', 'SQL', 'Signée'], bareme: [] }, 'rdvPris', { now, period: 'mois' })
    ok(f.elapsed === 15 && f.totalDays === 30, `Atterrissage : découpage de période faux (${f.elapsed}/${f.totalDays})`)
    ok(f.done === 10, `Atterrissage : réalisé faux (${f.done})`)
    ok(f.sinceStart === 20, `Atterrissage : 10 en 15 jours doit projeter 20 sur 30, pas ${f.sinceStart}`)
    ok(f.last7 < f.sinceStart, "Atterrissage : l'arrêt d'activité doit tirer la borne basse vers le bas")
    ok(f.low === f.last7 && f.high === f.sinceStart, 'Atterrissage : fourchette mal ordonnée')
    // Un espace vide ne divise pas par zéro et n'invente pas d'objectif.
    const empty = s.landingForecast({ rdvs: [] }, 'sql', { now, period: 'mois' })
    ok(empty.low === 0 && empty.high === 0, 'Atterrissage : un espace vide doit projeter zéro')
    ok(empty.target === null && empty.onTrack === null, "Atterrissage : sans quota, aucun objectif ne doit être inventé")
    // La cible vient du DÉTAIL du quota, pas de l'objet qui le décrit : un objet passé tel
    // quel donnait « Objectif NaN » à l'écran.
    const d2 = s.buildDemoDb({})
    const e2 = d2.environments.find(x => x.id === 'env-demo')
    const k2 = Object.keys(d2.data)[0]
    const withQuota = s.landingForecast(d2.data[k2], 'sql', { now: new Date(), period: 'mois', env: e2, subId: k2 })
    ok(withQuota.target === null || Number.isFinite(withQuota.target), `Atterrissage : objectif non numérique (${withQuota.target})`)
  }

  // 6 quater. Territoires : un compte NOMMÉ l'emporte sur un secteur — une exception
  //   nominative existe précisément pour déroger à la règle générale. Sans cet ordre,
  //   impossible de sortir un grand compte du territoire qui le couvre par défaut.
  {
    const env = {
      territories: [
        { id: 't1', name: 'Industrie', ownerSubId: 'sub-a', companies: [], sectors: ['Industrie'] },
        { id: 't2', name: 'Grands comptes', ownerSubId: 'sub-b', companies: ['Renault'], sectors: [] },
      ],
    }
    ok(s.territoryOwner(env, { entreprise: 'Renault', secteur: 'Industrie' })?.id === 't2',
      "Territoires : le compte nommé doit l'emporter sur le secteur")
    ok(s.territoryOwner(env, { entreprise: 'Autre SA', secteur: 'Industrie' })?.id === 't1',
      'Territoires : le secteur doit couvrir les comptes non nommés')
    ok(s.territoryOwner(env, { entreprise: 'Inconnue', secteur: 'Services' }) === null,
      "Territoires : un compte non couvert reste ouvert à tous, il ne s'attribue pas au hasard")
    // La casse et les espaces ne doivent pas créer de faux territoires libres.
    ok(s.territoryOwner(env, { entreprise: '  renault ', secteur: '' })?.id === 't2',
      'Territoires : la comparaison doit ignorer casse et espaces')
    // Un environnement sans carte n'attribue rien.
    ok(s.territoryOwner({}, { entreprise: 'Renault' }) === null, 'Territoires : sans carte, aucune attribution')
  }

  // 6 quinquies. Récapitulatif hebdomadaire : il doit compter la BONNE semaine, nommer ce
  //   qui ne bouge pas, et se taire quand il n'y a rien à dire — un canal qui poste
  //   « 0 partout » toutes les semaines finit par ne plus être lu.
  {
    const monday = s.startOfWeek(new Date())
    const lastMon = new Date(monday); lastMon.setDate(lastMon.getDate() - 7)
    const iso = (d) => d.toISOString().slice(0, 10)
    const inWeek = iso(new Date(lastMon.getTime() + 2 * 86400000)) // mercredi dernier
    const outWeek = iso(new Date(lastMon.getTime() - 5 * 86400000)) // la semaine d'avant
    const db = {
      environments: [{ id: 'e1', name: 'X' }],
      subenvs: [{ id: 'sa', envId: 'e1', prenom: 'Ana', nom: 'B' }, { id: 'sb', envId: 'e1', prenom: 'Zoé', nom: 'C' }],
      data: {
        sa: { rdvs: [{ id: '1', datePriseRdv: inWeek, opportunite: 'En cours', phase: 'R1' }, { id: '2', datePriseRdv: outWeek, opportunite: 'En cours', phase: 'R1' }], phases: ['R1', 'SQL', 'Signée'], bareme: [] },
        sb: { rdvs: [], phases: ['R1', 'SQL', 'Signée'], bareme: [] },
      },
    }
    const txt = s.buildWeeklyDigest(db, 'e1', iso(lastMon), iso(new Date(lastMon.getTime() + 6 * 86400000)))
    ok(!!txt, 'Récapitulatif : aucun texte produit alors que la semaine a de l\'activité')
    ok(/1 RDV pris/.test(txt || ''), `Récapitulatif : le compte de la semaine est faux — ${JSON.stringify(txt)}`)
    ok(/Ana/.test(txt || ''), 'Récapitulatif : la personne active doit être nommée')
    ok(/Sans activité/.test(txt || '') && /Zoé/.test(txt || ''), "Récapitulatif : il doit nommer qui n'a rien fait — aucun événement ne peut le signaler")
    // Semaine vide : silence.
    const quiet = s.buildWeeklyDigest({ environments: [{ id: 'e1' }], subenvs: [{ id: 'sa', envId: 'e1' }], data: { sa: { rdvs: [] } } }, 'e1', '2020-01-06', '2020-01-12')
    ok(quiet === null, 'Récapitulatif : une semaine sans rien à dire ne doit rien poster')
  }

  // 6 sexies. AUCUN mot de passe en clair, nulle part. C'est la garantie la plus simple à
  //   énoncer et la plus facile à casser par inadvertance : un seul `passwordClear` réécrit
  //   quelque part, et tous les comptes redeviennent réutilisables ailleurs.
  {
    const scan = (db, where) => {
      ;(db.accounts || []).forEach(a => {
        ok(a.passwordClear === undefined, `${where} : ${a.pseudo || a.id} porte un mot de passe en clair`)
        ok(a.passwordPlain === undefined, `${where} : ${a.pseudo || a.id} porte un ancien mot de passe en clair`)
        ok(!a.password || String(a.password).startsWith('sha256:'), `${where} : ${a.pseudo || a.id} n'a pas de hash`)
      })
    }
    scan(s.buildDemoDb({}), 'Démo')
    scan(s.buildTrainingDb('Fondateur', []), 'Formation')
    // Une base héritée porteuse d'un clair doit ressortir PURGÉE de la migration. On part
    // d'une base réelle plutôt que d'un objet minimal : c'est ce chemin-là qui compte.
    const legacy = s.buildDemoDb({})
    legacy.accounts[0].passwordClear = 'motdepasse'
    legacy.accounts[0].passwordPlain = 'motdepasse'
    legacy.accounts[0].password = 'motdepasse'   // ancien format, non hashé
    s.migrate(legacy)
    scan(legacy, "Après migration d'une base héritée")
    // Le droit d'AFFICHER un mot de passe ne doit plus exister : un droit qui ne fait rien
    // laisse croire qu'il protège quelque chose.
    ok(!s.STAFF_PERMISSION_IDS.includes('passwords.view'), "Le droit « afficher les mots de passe » subsiste alors qu'il n'y a plus rien à afficher")
    ok(s.STAFF_PERMISSION_IDS.includes('passwords.reset'), 'Le droit de réinitialiser un mot de passe doit rester : c\'est ce qui remplace l\'affichage')
    // ⚠️ CONTREPARTIE EXIGÉE de la suppression de l'affichage : le manager doit continuer
    // d'accéder à l'ESPACE de ses collaborateurs. Cet accès ne passe pas — et n'a jamais
    // eu besoin de passer — par leur mot de passe : il repose sur un droit d'encadrement.
    ok(s.CLIENT_PERMISSION_IDS.includes('team.view'), "Le droit d'accéder aux espaces de l'équipe a disparu")
    ok(s.CLIENT_PERMISSION_IDS.includes('team.manage'), "Le droit d'encadrement de l'équipe a disparu")
    const roles = s.defaultEnvRoles()
    const mgr = roles.find(r => /manager/i.test(r.name))
    ok(!!mgr, 'Aucun rôle Manager par défaut dans un environnement')
    ok(mgr && (mgr.perms || []).includes('team.view'),
      "Le rôle Manager doit pouvoir ouvrir l'espace de ses collaborateurs — c'est la contrepartie du retrait de l'affichage des mots de passe")
  }

  // 6 septies. Fusion des états distants. Le scénario à couvrir : A et B travaillent en même
  //   temps ; B enregistre, et sa version contient une copie PÉRIMÉE de l'espace de A.
  //   Remplacer l'état local par le distant faisait disparaître le travail de A sans un mot.
  {
    const local = { data: { a: { note: 'travail de A', _rev: 200 }, b: { note: 'vieux B', _rev: 50 } }, accounts: [] }
    const remote = { data: { a: { note: 'copie périmée de A', _rev: 100 }, b: { note: 'B tout frais', _rev: 300 } }, accounts: [] }
    const m = s.mergeRemoteDb(local, remote)
    ok(m.data.a.note === 'travail de A', "Fusion : le travail local plus récent doit survivre à une copie périmée")
    ok(m.data.b.note === 'B tout frais', 'Fusion : la version distante plus récente doit être adoptée')
    // Un espace créé localement et inconnu du distant ne doit pas disparaître.
    const m2 = s.mergeRemoteDb({ data: { neuf: { _rev: 10 } } }, { data: {} })
    ok(!!m2.data.neuf, "Fusion : un espace créé ici ne doit pas être effacé par un distant qui l'ignore")
    // Sans horodatage des deux côtés, le distant l'emporte — comportement d'avant, conservé.
    const m3 = s.mergeRemoteDb({ data: { x: { v: 'local' } } }, { data: { x: { v: 'distant' } } })
    ok(m3.data.x.v === 'distant', 'Fusion : sans horodatage, le distant fait foi comme avant')
    ok(s.mergeRemoteDb(null, remote) === remote && s.mergeRemoteDb(local, null) === local,
      'Fusion : un côté absent ne doit pas faire tomber la fusion')
  }

  // 6 octies. RÉSURRECTION. Un projet supprimé qui revient est pire qu'un projet manquant :
  //   on le resupprime, il revient, et on cesse de faire confiance à la corbeille. Trois
  //   chemins le provoquaient, on les rejoue tous les trois.
  {
    // a) Environnement créé DANS l'app : créer et marquer doivent aller ensemble.
    const db = s.buildDemoDb({}); s.migrate(db)
    const env = { id: 'env-neuf', name: 'Neuf', plan: 'beta', subState: 'active' }
    db.environments.push(env)
    s.seedEnvClientAndProject(db, env)
    ok(db.projects.some(p => p.sourceEnvId === 'env-neuf'), 'Un environnement neuf doit recevoir son projet')
    db.projects = db.projects.filter(p => p.sourceEnvId !== 'env-neuf')
    db.clients = db.clients.filter(c => c.key !== 'env:env-neuf')
    s.migrate(db); s.migrate(db)
    ok(!db.projects.some(p => p.sourceEnvId === 'env-neuf'), 'Le projet supprimé est ressuscité par la migration')
    ok(!db.clients.some(c => c.key === 'env:env-neuf'), 'Le client supprimé est ressuscité par la migration')

    // b) Synchronisation : la photo d'un collègue ne doit pas EFFACER les repères de semis.
    //    C'est ce qui rendait la résurrection répétitive, à chaque synchronisation.
    const merged = s.mergeRemoteDb(
      { _autoSeed: { envProjects: ['env-x'], envClients: ['env-x'], modulesV2: true }, data: {} },
      { _autoSeed: { envProjects: [], envClients: [] }, data: {} },
    )
    ok((merged._autoSeed.envProjects || []).includes('env-x'),
      'Fusion : un repère de semis local a été perdu — les suppressions vont revenir')
    ok(merged._autoSeed.modulesV2 === true, 'Fusion : un drapeau de semis local a été perdu')
    // Et dans l'autre sens : le repère du distant doit survivre aussi.
    const merged2 = s.mergeRemoteDb({ _autoSeed: { envProjects: [] }, data: {} }, { _autoSeed: { envProjects: ['env-y'] }, data: {} })
    ok((merged2._autoSeed.envProjects || []).includes('env-y'), 'Fusion : un repère de semis distant a été perdu')

    // c) Rattrapage des bases déjà en service : un environnement sans repère, dans une base
    //    qui en a d'autres, ne doit PAS voir son projet recréé.
    const old = s.buildDemoDb({}); s.migrate(old)
    old.environments.push({ id: 'env-ancien', name: 'Ancien', plan: 'beta', subState: 'active' })
    old._autoSeed.envSeedBackfill = false      // on rejoue une base d'avant la correction
    s.migrate(old)
    ok(!old.projects.some(p => p.sourceEnvId === 'env-ancien'),
      'Rattrapage : un environnement déjà en service ne doit pas se voir recréer un projet supprimé')
  }

  // 6 nonies. Fusion « Projets & atelier » : réunir deux écrans ne doit accorder AUCUN droit.
  //   L'onglet s'ouvre à qui a l'un OU l'autre des deux droits, mais chaque vue reste gardée
  //   par le sien. Sans cela, la fusion aurait ouvert la composition d'environnements à tous
  //   ceux qui pouvaient seulement consulter les projets.
  {
    const src = fs.default.readFileSync(path.default.join(dir, 'Delivery.jsx'), 'utf8')
    ok(/hasPerm\('env\.build'\)/.test(src), "Delivery : la vue Atelier n'est pas gardée par `env.build`")
    ok(/hasPerm\('projects\.view'\)/.test(src), "Delivery : la vue Livraisons n'est pas gardée par `projects.view`")
    // La passerelle vers l'atelier ne doit être proposée qu'à qui peut composer.
    ok(/canBuild \? openWorkshop : null/.test(src), 'Delivery : la passerelle vers l\'atelier est proposée sans le droit de composer')
    const hub = fs.default.readFileSync(path.default.join(process.cwd(), 'src', 'pages', 'SupportHub.jsx'), 'utf8')
    ok(!/id: 'workshop'/.test(hub) && !/id: 'projects'/.test(hub), 'SupportHub : un onglet fusionné subsiste dans la barre')
    ok(/perms: \['projects\.view', 'env\.build'\]/.test(hub), "SupportHub : l'onglet fusionné ne s'ouvre pas à l'un OU l'autre droit")
    // Le parcours de formation visait l'ancien identifiant : il déraillerait en silence.
    const tour = fs.default.readFileSync(path.default.join(dir, 'TrainingJourney.jsx'), 'utf8')
    ok(!/hub: 'projects'/.test(tour) && !/hub: 'workshop'/.test(tour),
      'Parcours de formation : une étape vise encore un onglet qui n\'existe plus')

    // Ce que le client REÇOIT (modules, offre, membres, accès) a rejoint l'atelier. Il ne
    // doit pas rester une seconde copie dans les livraisons : deux réglages du même objet
    // finissent par se contredire, et l'utilisateur ne sait plus lequel fait foi.
    const proj = fs.default.readFileSync(path.default.join(dir, 'Projects.jsx'), 'utf8')
    const wk = fs.default.readFileSync(path.default.join(dir, 'Workshop.jsx'), 'utf8')
    ok(!/ENV_MODULES/.test(proj), 'Les modules se règlent encore depuis les livraisons — il en reste deux copies')
    // `deleteClientEnv` fait exception depuis que la SUPPRESSION est pilotée par le panneau
    // des projets (un projet est la livraison d'un environnement : les deux partent
    // ensemble). Ce qui reste interdit ici, c'est la CONFIGURATION — offre, modules, blocage.
    ok(!/setEnvOffer|blockEnv/.test(proj),
      "L'administration de l'environnement se fait encore depuis les livraisons")
    ok(/EnvAdmin/.test(wk), "L'atelier n'expose pas la fiche d'administration de l'environnement")
    const adm = fs.default.readFileSync(path.default.join(dir, 'EnvAdmin.jsx'), 'utf8')
    ;['ENV_MODULES', 'setEnvOffer', 'blockEnv', 'deleteClientEnv', 'deployEnvProject', 'enterEnv'].forEach(k => {
      ok(new RegExp(k).test(adm), `EnvAdmin : « ${k} » a été perdu lors du déplacement`)
    })
  }

  // 6 decies. Réattribution d'une prime : RIEN NE SE CRÉE, RIEN NE SE PERD. Une prime
  //   attribuée à un collègue doit QUITTER le total de son espace d'origine et ENTRER dans
  //   celui du bénéficiaire. Sans cet invariant, réattribuer reviendrait à payer deux fois —
  //   ou à ne payer personne.
  {
    const d = s.buildDemoDb({})
    const e = d.environments.find(x => x.id === 'env-demo')
    const mk = new Date().toISOString().slice(0, 7)
    const subs = d.subenvs.filter(x => x.envId === 'env-demo')
    const total = () => subs.reduce((a, x) => a + s.monthlyPaidPrimes(s.primeView(d, x.id), e, x.id, mk), 0)
    const before = total()
    // On prend une affaire qui rapporte réellement ce mois-ci, sinon le test ne prouve rien.
    let from = null, rdv = null
    subs.some(x => (d.data[x.id]?.rdvs || []).some(r => {
      const solo = s.monthlyPaidPrimes({ ...d.data[x.id], rdvs: [r] }, e, x.id, mk)
      if (solo > 0) { from = x; rdv = r; return true }
      return false
    }))
    ok(!!rdv, 'Réattribution : aucune prime du mois pour éprouver le déplacement')
    if (rdv) {
      const to = subs.find(x => x.id !== from.id)
      const soloBefore = s.monthlyPaidPrimes({ ...d.data[from.id], rdvs: [rdv] }, e, from.id, mk)
      const fromBefore = s.monthlyPaidPrimes(s.primeView(d, from.id), e, from.id, mk)
      rdv.primeTo = to.id
      const fromAfter = s.monthlyPaidPrimes(s.primeView(d, from.id), e, from.id, mk)
      ok(fromAfter < fromBefore, "Réattribution : la prime n'a pas quitté l'espace d'origine")
      ok(fromBefore - fromAfter === soloBefore,
        `Réattribution : le montant retiré ne correspond pas à la prime (${fromBefore - fromAfter} vs ${soloBefore})`)
      ok(total() === before, `Réattribution : le total de l'environnement a changé (${before} → ${total()})`)
      // Revenir en arrière restitue exactement l'état d'avant.
      rdv.primeTo = ''
      ok(s.monthlyPaidPrimes(s.primeView(d, from.id), e, from.id, mk) === fromBefore,
        "Réattribution : annuler ne restitue pas le montant d'origine")
    }
    // Les écrans qui annoncent un montant passent tous par la vue « prime ».
    ;['Dashboard.jsx', 'Classement.jsx'].forEach(f => {
      const txt = fs.default.readFileSync(path.default.join(dir, f), 'utf8')
      ok(/primeView/.test(txt), `${f} : annonce un montant sans passer par la vue « prime » — deux écrans diront deux paies`)
    })
  }

  // 6 undecies. Code d'accès : l'équipe BD Report n'en a pas à donner chez un client, mais
  //   personne d'autre n'échappe au verrou. Une exception mal bornée transformerait un
  //   contournement légitime en porte ouverte.
  {
    const app = fs.default.readFileSync(path.default.join(process.cwd(), 'src', 'App.jsx'), 'utf8')
    ok(/skipsPin/.test(app), "App : le code est encore demandé au staff, l'entrée depuis l'atelier reste bloquée")
    // Les DEUX portes doivent appliquer la règle : l'environnement et le sous-espace.
    ok((app.match(/skipsPin/g) || []).length >= 2,
      'App : une seule des deux portes applique la règle — le staff sera bloqué à la seconde')
    const st = fs.default.readFileSync(path.default.join(process.cwd(), 'src', 'store.jsx'), 'utf8')
    ok(/skipsPin\(envId\) \{\s*\n\s*if \(!isSupportRole/.test(st),
      "store.skipsPin : l'exception n'est pas bornée au rôle support")
    ok(/env\.createdBy !== account\?\.id/.test(st),
      'store.skipsPin : un membre du staff doit rester soumis au code dans SON PROPRE environnement')
  }

  // 6 duodecies. « Voir en situation » : CHAQUE brique doit savoir dire où elle se montre.
  //   Une brique sans destination laisserait un bouton qui ne mène nulle part — pire qu'un
  //   bouton absent, puisqu'il promet quelque chose.
  {
    const navItems = nav.NAV_GROUPS.flatMap(g => g.items).map(i => i.id)
    s.ENV_MODULES.forEach(m => {
      ok(!!m.where?.page, `Module ${m.id} : aucune destination pour « Voir en situation »`)
      ok(!!m.where?.hint, `Module ${m.id} : aucune indication de l'endroit où la brique se voit`)
      if (m.where?.page) {
        ok(navItems.includes(m.where.page),
          `Module ${m.id} : « Voir en situation » vise « ${m.where.page} », qui n'est pas un écran de l'application`)
      }
    })
    // Tout onglet accordable doit pouvoir s'ouvrir en situation, pas seulement les briques.
    // Un onglet de la console Manager n'est pas une page : sans le second temps qui désigne
    // l'onglet interne, la moitié des onglets accordables resteraient injoignables.
    const allItems = nav.NAV_GROUPS.flatMap(g => g.items)
    nav.GRANTABLE_TABS.forEach(t => {
      const item = allItems.find(i => i.id === t.id)
      ok(!!item, `Onglet « ${t.id} » : introuvable dans la navigation`)
    })
    const st2 = fs.default.readFileSync(path.default.join(process.cwd(), 'src', 'store.jsx'), 'utf8')
    ok(/previewPage\(envId, pageId, hubTab\)/.test(st2), 'store.previewPage : absent — les onglets ne s\'ouvrent pas en situation')
    ok(/manager-tab/.test(st2), 'store.previewPage : un onglet de la console Manager ne peut pas être visé')
    const mh = fs.default.readFileSync(path.default.join(dir, 'ManagerHub.jsx'), 'utf8')
    ok(/manager-tab/.test(mh), "ManagerHub : n'écoute pas la désignation d'onglet, la moitié des onglets restent injoignables")
    const wk2 = fs.default.readFileSync(path.default.join(dir, 'Workshop.jsx'), 'utf8')
    ok((wk2.match(/previewPage/g) || []).length >= 2,
      "Atelier : les onglets ne sont pas cliquables partout (aperçu de rôle ET éditeur d'onglets)")

    // Les onglets fusionnés ne doivent pas être visés : ils n'existent plus.
    s.ENV_MODULES.forEach(m => {
      ok(!['simulateur', 'dataquality', 'classement', 'kpi', 'workshop', 'projects'].includes(m.where?.page),
        `Module ${m.id} : vise un onglet fusionné ou supprimé (${m.where?.page})`)
    })
  }

  // 6 terdecies. Relevé de primes : « automatique » automatise la DEMANDE et la remise,
  //   JAMAIS la signature. Un relevé signé sans avoir été lu ne prouve rien — c'est-à-dire
  //   qu'il perd la seule chose qui en fait un document opposable.
  {
    const d = s.buildDemoDb({})
    const e = d.environments.find(x => x.id === 'env-demo')
    e.statementMode = 'automatic'
    delete e.statementRequests
    s.migrate(d)
    const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1)
    const mk = s.monthKey(prev)
    const subs = d.subenvs.filter(x => x.envId === 'env-demo')
    ok(subs.every(x => !!s.envStatementRequests(e)[s.statementKey(x.id, mk)]),
      'Mode automatique : la demande du mois écoulé ne s\'ouvre pas pour toute l\'équipe')
    // Le mois EN COURS ne doit pas être demandé : la paie n'est pas arrêtée.
    ok(!s.envStatementRequests(e)[s.statementKey(subs[0].id, s.monthKey(new Date()))],
      'Mode automatique : un relevé du mois en cours porterait sur une paie non arrêtée')
    // Et surtout : AUCUNE signature n'a été posée automatiquement.
    ok(subs.every(x => !(e.statements || {})[s.statementKey(x.id, mk)]?.signature),
      'Mode automatique : un relevé a été SIGNÉ sans manager — le document ne prouve plus rien')
    // Idempotence : repasser la migration ne réécrit pas les demandes existantes.
    const before = JSON.stringify(e.statementRequests)
    s.migrate(d)
    ok(JSON.stringify(e.statementRequests) === before, 'Mode automatique : les demandes sont réécrites à chaque chargement')
    // Le mode par défaut reste « à la demande » : on n'impose pas une règle à qui n'a rien choisi.
    ok(s.statementMode({}) === 'onRequest', 'Le mode par défaut doit rester « à la demande »')
  }

  // 6 quaterdecies. APPELS NUS À UNE MÉTHODE DU STORE.
  //   Les méthodes du store vivent dans un objet littéral : `setSub(...)` sans `this.` ne
  //   désigne rien, et lève une ReferenceError au CLIC — le bouton « ne fait rien », sans
  //   message, sans trace. Trois méthodes en souffraient (`setEcosystem`, `renamePhase`,
  //   `importEnvContacts`) : activer les seuils et plafonds était sans effet.
  //   Aucun test de rendu ne peut voir cela, puisque l'erreur n'arrive qu'à l'usage.
  {
    const raw = fs.default.readFileSync(path.default.join(process.cwd(), 'src', 'store.jsx'), 'utf8')
    // Sans commentaires ni chaînes : un nom cité dans une phrase n'est pas un appel.
    // ⚠️ Les commentaires de bloc sont remplacés en CONSERVANT leurs retours à la ligne :
    // les supprimer décalerait toute la numérotation, et le repère de début d'objet ne
    // tomberait plus au bon endroit — le détecteur ne chercherait alors nulle part.
    // ⚠️ Tout se fait LIGNE PAR LIGNE. Une première version nettoyait les chaînes sur le
    // fichier entier : une apostrophe déséquilibrée avalait des dizaines de lignes, la
    // numérotation partait, et le détecteur ne trouvait plus le début de l'objet — il ne
    // cherchait donc nulle part, tout en affichant « aucun problème ».
    const lines = raw.split('\n').map(l => l
      .replace(/(^|[^:'"\\])\/\/.*$/, '$1')           // commentaires de fin de ligne
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")          // chaînes simples, sans franchir la ligne
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""'))
    const start = lines.findIndex((l, i) => l.trim() === 'return {' && i > 3400)
    const methods = new Set()
    lines.slice(start).forEach(l => { const m = /^ {6}([a-zA-Z_$][\w$]*)\s*\(/.exec(l); if (m) methods.add(m[1]) })
    // Ce qui existe AUSSI comme fonction/variable/import est appelable sans `this.`.
    const scope = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'function', 'await'])
    for (const m of raw.matchAll(/^\s*(?:export\s+)?(?:const|let|var|function|async function)\s+([a-zA-Z_$][\w$]*)/gm)) scope.add(m[1])
    for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      m[1].split(',').forEach(x => scope.add(x.trim().split(' as ').pop().trim()))
    }
    const suspects = [...methods].filter(n => !scope.has(n))
    const bare = []
    lines.slice(start).forEach((l, k) => {
      const decl = /^ {6}([a-zA-Z_$][\w$]*)\s*\(/.exec(l)
      suspects.forEach(n => {
        const re = new RegExp('(?<![.\\w$])' + n.replace(/[$]/g, '\\$') + '\\s*\\(', 'g')
        for (const mm of l.matchAll(re)) {
          if (decl && decl[1] === n && mm.index === 6) continue
          bare.push(`${start + k + 1}: ${n}()`)
        }
      })
    })
    ok(bare.length === 0, `Appel nu à une méthode du store (ReferenceError au clic) : ${bare.slice(0, 5).join(', ')}`)
  }

  // 6 quindecies. SUPPRIMER UNE LIVRAISON EMPORTE SON ENVIRONNEMENT — et rien d'autre.
  //   Le défaut signalé : « des environnements se baladent alors que j'ai supprimé les
  //   projets ». Un environnement sans livraison n'apparaît plus nulle part, mais reste
  //   vivant pour son équipe : invisible et actif, c'est le pire des deux états.
  //   On vérifie les trois promesses : tout part, tout revient, et le fil de discussion existe.
  {
    const d = s.buildDemoDb({}); s.migrate(d)
    // Une équipe cliente réaliste : un propriétaire, un membre, un membre qui travaille
    // AUSSI pour une autre société, et un membre du staff invité dans l'environnement.
    d.accounts.push(
      { id: 'acc-own', email: 'own@x.fr', pseudo: 'Patronne', role: 'Manager', plan: 'beta', bricks: [] },
      { id: 'acc-mbr', email: 'mbr@x.fr', pseudo: 'Membre', role: 'Membre', plan: 'beta', bricks: [] },
      { id: 'acc-two', email: 'two@x.fr', pseudo: 'Double', role: 'Membre', plan: 'beta', bricks: [] },
      { id: 'acc-stf', email: 'stf@x.fr', pseudo: 'Staff', role: 'Support BD Report', plan: 'beta', bricks: [] },
    )
    d.environments.push({ id: 'env-autre', name: 'Autre client', plan: 'beta', subState: 'active', members: ['acc-two'] })
    const env = { id: 'env-supp', name: 'Client à fermer', plan: 'beta', subState: 'active', createdBy: 'acc-own', members: ['acc-mbr', 'acc-two', 'acc-stf'] }
    d.environments.push(env)
    s.seedEnvClientAndProject(d, env)
    const proj = d.projects.find(p => p.sourceEnvId === 'env-supp')
    ok(!!proj, 'Archive : l\'environnement de test n\'a pas reçu sa livraison')
    // Deux espaces avec des données, pour vérifier qu'ils partent ET reviennent.
    const owner = d.accounts.find(a => a.id === 'acc-own')
    proj.ownerId = owner.id
    ;['sub-supp-1', 'sub-supp-2'].forEach((id, i) => {
      d.subenvs.push({ id, envId: 'env-supp', prenom: 'P' + i, nom: '', pin: '0000', ownerId: i ? 'acc-mbr' : 'acc-own' })
      d.data[id] = { rdvs: [{ id: 'r' + i, entreprise: 'Test' }], _rev: 1 }
    })
    const beforeSpaces = JSON.stringify(['sub-supp-1', 'sub-supp-2'].map(k => d.data[k]))
    const ticketsBefore = d.tickets.length

    const entry = s.archiveDelivery(d, { projectId: proj.id, reason: 'Fin de contrat', actorId: 'acc-stf', actorName: 'Nadia (staff)' })
    ok(!!entry, 'Archive : rien n\'a été archivé')
    // a. Plus rien ne se balade.
    ok(!d.environments.some(e => e.id === 'env-supp'), 'Supprimer la livraison laisse l\'environnement derrière')
    ok(!d.subenvs.some(x => x.envId === 'env-supp'), 'Supprimer la livraison laisse des espaces orphelins')
    ok(!d.data['sub-supp-1'] && !d.data['sub-supp-2'], 'Supprimer la livraison laisse les données des espaces')
    ok(!d.projects.some(p => p.id === proj.id), 'La livraison supprimée est toujours là')
    // b. Rien n'est perdu : tout est dans la corbeille, avec de quoi le remettre.
    ok((d.supportTrash || []).some(t => t.id === entry.id && t.kind === 'project'),
      'La livraison supprimée n\'est pas dans la corbeille : la suppression est irréversible')
    ok(entry.data.subenvs.length === 2 && Object.keys(entry.data.spaces).length === 2,
      'L\'archive ne contient pas les espaces : la restauration rendrait une coquille')
    // c. Le ticket de fermeture est ADRESSÉ AU CLIENT, et ne le met pas face à un collègue.
    const tk = (d.tickets || []).find(t => t.id === entry.data.ticketId)
    ok(!!tk && tk.category === s.PROJECT_CLOSURE_CATEGORY, 'Aucun ticket de fermeture n\'a été ouvert')
    ok(d.tickets.length === ticketsBefore + 1, 'La suppression a ouvert plus d\'un ticket')
    ok(tk && tk.userAccountId === 'acc-own', 'Le ticket de fermeture n\'est pas adressé au propriétaire du projet')
    ok(tk && s.ticketHasUnread(tk, 'user'), 'Le ticket de fermeture est déjà lu côté client : la fermeture passerait inaperçue')
    const seen = (tk?.messages || []).map(m => `${m.text} ${m.authorName || ''}`).join(' ')
    ok(!/Nadia/.test(seen), 'Le nom du collègue qui a fermé l\'accès est visible du client')
    ok(!/Fin de contrat/.test(seen), 'Le motif interne de fermeture est visible du client')
    ok(/L'accès au logiciel BD Report/.test(seen) && /supprimer définitivement/.test(seen),
      'Le message de contexte ne dit pas que l\'accès est fermé, ni à quoi sert la discussion')
    // Le message vient du support, pas du « bot » : un message bot disparaît de la
    // conversation dès la première réponse d'un technicien, avec tout le contexte.
    ok(tk?.messages[0]?.from === 'support', 'Le message de fermeture disparaîtrait à la première réponse')
    // …et le support, lui, garde de quoi trancher.
    ok(tk?.projectClosure?.reason === 'Fin de contrat' && tk?.projectClosure?.deletedBy === 'Nadia (staff)',
      'Le support perd le motif interne et l\'auteur de la fermeture')

    // c bis. FERMER, c'est fermer l'accès. Sauf pour qui travaille ailleurs, et sauf le
    //   propriétaire — sans lui, la décision se prendrait entre BD Report et un mur.
    const acc = (id) => d.accounts.find(a => a.id === id)
    ok(acc('acc-mbr').disabled === true, 'Un membre du projet fermé peut encore se connecter')
    ok(!acc('acc-own').disabled && acc('acc-own').closureTicketId === tk.id,
      'Le propriétaire doit garder une porte d\'entrée, et elle doit mener au ticket')
    ok(!acc('acc-two').disabled, 'Un membre qui travaille pour une autre société a perdu cet accès aussi')
    ok(!acc('acc-stf').disabled, 'Un membre du staff a été désactivé avec le client')

    // d. Le client reste, devenu ancien : c'est lui qui porte l'histoire du départ.
    const cli = d.clients.find(c => c.key === 'env:env-supp')
    ok(cli && cli.status === 'anciens', 'La fiche client a disparu ou n\'est pas classée en « anciens »')

    // e. Restaurer rend TOUT, à l'identique — y compris les accès.
    s.restoreDelivery(d, entry)
    ok(!acc('acc-mbr').disabled, 'Rétablir le projet ne rend pas son accès à l\'équipe')
    ok(!acc('acc-own').closureTicketId, 'Le propriétaire reste enfermé dans l\'écran de fermeture')
    ok(tk.status === 'closed' && tk.projectClosure.decided === 'restored',
      'La décision de rétablir ne clôt pas le ticket de fermeture')
    ok(d.environments.some(e => e.id === 'env-supp'), 'Restaurer ne rend pas l\'environnement')
    ok(d.subenvs.filter(x => x.envId === 'env-supp').length === 2, 'Restaurer ne rend pas les espaces')
    ok(JSON.stringify(['sub-supp-1', 'sub-supp-2'].map(k => d.data[k])) === beforeSpaces,
      'Restaurer ne rend pas les données des espaces à l\'identique')
    ok(d.projects.filter(p => p.id === proj.id).length === 1, 'Restaurer duplique la livraison (ou ne la rend pas)')
    // f. Et une migration derrière ne recrée rien en double.
    s.migrate(d)
    ok(d.projects.filter(p => p.sourceEnvId === 'env-supp').length === 1,
      'Après restauration, la migration recrée un second projet')

    // g. Supprimer par l'autre bout (l'environnement) doit emporter la livraison de la
    //    même façon : deux gestes aux effets différents laisseraient toujours une moitié.
    const e2 = s.archiveDelivery(d, { envId: 'env-supp', actorId: owner.id, actorName: 'Owen' })
    ok(!!e2 && !d.projects.some(p => p.sourceEnvId === 'env-supp'),
      'Supprimer l\'environnement laisse sa livraison derrière')
    // h. Et une migration ne le ramène par aucun chemin : la pierre tombale fait foi.
    d.environments.push({ id: 'env-supp', name: 'Revenant', plan: 'beta', subState: 'active' })
    s.migrate(d)
    ok(!d.environments.some(e => e.id === 'env-supp'),
      'Un environnement supprimé revient par la migration (sauvegarde locale, importation)')

    // i. SYNCHRONISATION : la photo périmée d'un collègue contient encore l'environnement.
    //    Sans pierre tombale, elle le « rebaladait » à chaque échange — le défaut signalé.
    const dead = { deletedAt: '2026-01-02T00:00:00.000Z', restoredAt: '' }
    const m = s.mergeRemoteDb(
      { _envTombstones: { 'env-mort': dead }, environments: [], subenvs: [], projects: [], data: {} },
      { environments: [{ id: 'env-mort', name: 'Zombie' }], subenvs: [{ id: 'sz', envId: 'env-mort' }], projects: [{ id: 'pz', sourceEnvId: 'env-mort' }], data: { sz: { _rev: 3 } } },
    )
    ok(!m.environments.some(e => e.id === 'env-mort'), 'Synchro : un environnement supprimé revient par la fusion')
    ok(!m.projects.some(p => p.sourceEnvId === 'env-mort'), 'Synchro : la livraison supprimée revient par la fusion')
    ok(!m.data.sz, 'Synchro : les données d\'un espace supprimé reviennent par la fusion')
    // Et l'inverse doit tenir aussi : une restauration plus récente lève la pierre, sinon
    // « Restaurer » ne tiendrait que jusqu'à la prochaine synchronisation.
    const m2 = s.mergeRemoteDb(
      {
        _envTombstones: { 'env-mort': { deletedAt: dead.deletedAt, restoredAt: '2026-01-03T00:00:00.000Z' } },
        environments: [{ id: 'env-mort', name: 'Restauré' }], subenvs: [{ id: 'sz', envId: 'env-mort' }],
        projects: [{ id: 'pz', sourceEnvId: 'env-mort' }], data: { sz: { _rev: 1 } },
      },
      { _envTombstones: { 'env-mort': dead }, environments: [], subenvs: [], projects: [], data: {} },
    )
    ok(m2.environments.some(e => e.id === 'env-mort'), 'Synchro : une restauration plus récente est annulée par la pierre tombale')
    ok(m2.projects.some(p => p.sourceEnvId === 'env-mort') && !!m2.data.sz, 'Synchro : la restauration ne rend pas la livraison et ses données')

    // j. L'AUTRE ISSUE : la suppression définitive. Elle doit vraiment tout emporter —
    //    un compte laissé derrière, désactivé pour toujours, garderait son adresse prise
    //    et son propriétaire devant une porte qui ne s'ouvre plus sur rien.
    const dd = s.buildDemoDb({}); s.migrate(dd)
    dd.accounts.push(
      { id: 'p-own', email: 'o@p.fr', pseudo: 'Prop', role: 'Manager', plan: 'beta', bricks: [] },
      { id: 'p-mbr', email: 'm@p.fr', pseudo: 'Mbr', role: 'Membre', plan: 'beta', bricks: [] },
      { id: 'p-two', email: 't@p.fr', pseudo: 'Deux', role: 'Membre', plan: 'beta', bricks: [] },
    )
    dd.environments.push({ id: 'env-ailleurs', name: 'Ailleurs', plan: 'beta', subState: 'active', members: ['p-two'] })
    const pe = { id: 'env-purge', name: 'À purger', plan: 'beta', subState: 'active', createdBy: 'p-own', members: ['p-mbr', 'p-two'] }
    dd.environments.push(pe)
    s.seedEnvClientAndProject(dd, pe)
    dd.subenvs.push({ id: 'sub-purge', envId: 'env-purge', prenom: 'P', nom: '', pin: '0000', ownerId: 'p-own' })
    dd.data['sub-purge'] = { rdvs: [], _rev: 1 }
    const pEntry = s.archiveDelivery(dd, { envId: 'env-purge', reason: 'Impayé', actorId: null, actorName: 'Staff' })
    const removed = s.purgeDelivery(dd, pEntry)
    ok(!dd.accounts.some(a => a.id === 'p-own') && !dd.accounts.some(a => a.id === 'p-mbr'),
      'Suppression définitive : des comptes du projet supprimé subsistent')
    ok(dd.accounts.some(a => a.id === 'p-two') && !dd.accounts.find(a => a.id === 'p-two').closureTicketId,
      'Suppression définitive : un compte qui travaille ailleurs a été supprimé avec le projet')
    ok(removed.length === 2, `Suppression définitive : ${removed.length} comptes retirés au lieu de 2`)
    ok(!(dd.supportTrash || []).some(t => t.id === pEntry.id), 'Suppression définitive : l\'archive reste dans la corbeille')
    const pTk = dd.tickets.find(t => t.id === pEntry.data.ticketId)
    ok(pTk && pTk.status === 'closed' && pTk.projectClosure.decided === 'purged',
      'Suppression définitive : le ticket de fermeture reste ouvert')
    // Le ticket SURVIT à la purge : c'est la trace de la décision et de ce qui s'est dit.
    ok(!!pTk, 'Suppression définitive : la discussion de fermeture a disparu avec le projet')

    // k. La décision appartient à BD Report, et elle se prend. Le client ne referme pas le
    //    dossier de son côté, et le support ne clôt pas le ticket sans avoir tranché.
    const sup = fs.default.readFileSync(path.default.join(dir, 'Support.jsx'), 'utf8')
    ok(/!openTicket\.projectClosure/.test(sup),
      'Le client peut refermer un ticket de fermeture de projet sans que rien ne soit décidé')
    const tic = fs.default.readFileSync(path.default.join(dir, 'Tickets.jsx'), 'utf8')
    ok(/projectClosure && !openTicket\.projectClosure\.decided/.test(tic),
      'Le support peut clôturer un ticket de fermeture sans choisir entre rétablir et supprimer')
    ok(/restoreClosedProject/.test(tic) && /purgeClosedProject/.test(tic),
      'Le ticket de fermeture ne propose pas ses deux issues')
  }

  // 7. RETIRER un module doit être sans danger. Le staff décoche une brique à la création
  //    d'un environnement : les écrans concernés disparaissent, mais RIEN ne s'efface et
  //    aucun calcul voisin ne tombe. On vérifie les deux, module par module.
  {
    // Ce qu'on appelle, module par module, pour s'assurer que les calculs voisins tiennent
    // debout une fois la brique retirée.
    const probes = {
      handoff: (d, e, k) => [s.handoffStats(d.data[k].rdvs, d.data[k]), s.handoffState({}, d.data[k])],
      closing: (d, e, k) => [s.closingStats(d.data[k].rdvs, d.data[k]), s.closingState({}, d.data[k])],
      dealValue: (d, e, k) => [s.pipelineValue(d.data[k].rdvs), s.wonValue(d.data[k].rdvs, d.data[k]), s.valueBySource(d.data[k].rdvs, d.data[k])],
      committee: (d, e, k) => [s.committeeGaps(d.data[k].rdvs[0], d.data[k])],
      quotas: (d, e, k) => [s.memberQuota(e, k, 'primes'), s.quotaAchieved(d.data[k], 'primes', 'mois', new Date(), { env: e, subId: k })],
      oneToOne: (d) => [(d.channels || []).filter(c => c.oneToOne).length],
      challenges: (d, e, k) => [(e.challenges || []).map(c => s.challengeScore(c, d.data[k], k))],
      statements: (d, e, k) => [s.buildStatement(d.data[k], e, k, new Date().toISOString().slice(0, 7))],
    }
    const allItems = nav.NAV_GROUPS.flatMap(g => g.items)
    for (const mod of s.ENV_MODULES) {
      const d = s.buildDemoDb({})
      const e = d.environments.find(x => x.id === 'env-demo')
      const k = Object.keys(d.data)[0]
      const dataBefore = JSON.stringify(d.data)
      const envBefore = JSON.stringify({ q: e.quotas, c: e.challenges, st: e.statements })
      e.modules = { ...(e.modules || {}), [mod.id]: false }
      ok(!s.envModuleOn(e, mod.id), `Module ${mod.id} : le retrait n'est pas pris en compte`)
      // a. Rien n'est effacé : retirer une brique masque des écrans, elle ne détruit pas.
      ok(JSON.stringify(d.data) === dataBefore, `Module ${mod.id} : des données d'espace ont disparu au retrait`)
      ok(JSON.stringify({ q: e.quotas, c: e.challenges, st: e.statements }) === envBefore,
        `Module ${mod.id} : des réglages d'environnement ont disparu au retrait`)
      // b. Les calculs voisins tiennent sans lui.
      try { probes[mod.id]?.(d, e, k) } catch (err) {
        problems.push(`Module ${mod.id} retiré : un calcul lève une erreur — ${err.message}`)
      }
      // c. Ses onglets ne sont plus proposés, et ceux des autres restent là.
      const tabs = s.previewTabs(e, offers, null).map(t => t.id)
      nav.GRANTABLE_TABS
        .filter(t => (allItems.find(i => i.id === t.id) || {}).module === mod.id)
        .forEach(t => ok(!tabs.includes(t.id), `Module ${mod.id} retiré : l'onglet « ${t.id} » reste proposé`))
      ok(tabs.length > 0, `Module ${mod.id} retiré : plus aucun onglet, le retrait emporte trop`)
      // d. Le montant VERSÉ ne bouge pas : aucune brique optionnelle n'est censée changer
      //    ce que touche un commercial.
      const mkNow = new Date().toISOString().slice(0, 7)
      const full = s.buildDemoDb({})
      const eFull = full.environments.find(x => x.id === 'env-demo')
      const paidWith = s.monthlyPaidPrimes(full.data[k], eFull, k, mkNow)
      const paidWithout = s.monthlyPaidPrimes(d.data[k], e, k, mkNow)
      ok(paidWith === paidWithout, `Module ${mod.id} retiré : les primes versées changent (${paidWith} → ${paidWithout})`)
    }
  }

  process.stdout.write((problems.length ? 'PROBLÈMES:\n- ' + problems.join('\n- ') : 'AUDIT OK') + '\n')

}
main().then(() => process.exit(0), (e) => { process.stdout.write('AUDIT FAILED: ' + (e.stack || e.message) + '\n'); process.exit(1) })
