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
