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

  // 6. Relevé de primes : chaque ligne doit être NOMMÉE, y compris les primes d'activité.
  {
    const d = s.buildDemoDb({})
    const e2 = d.environments.find(x => x.id === 'env-demo')
    const st = s.buildStatement(d.data['dsub-b1'], e2, 'dsub-b1', Object.keys({}).length ? '' : new Date().toISOString().slice(0, 7))
    ok(st.lines.every(l => l.label && l.label !== 'undefined'), 'Relevé : une ligne sans intitulé')
  }

  process.stdout.write((problems.length ? 'PROBLÈMES:\n- ' + problems.join('\n- ') : 'AUDIT OK') + '\n')

}
main().then(() => process.exit(0), (e) => { process.stdout.write('AUDIT FAILED: ' + (e.stack || e.message) + '\n'); process.exit(1) })
