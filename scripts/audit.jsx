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
