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
  const { StoreProvider } = await import('../src/store.jsx')
  const { I18nProvider } = await import('../src/i18n.jsx')
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
  const inputs = container.querySelectorAll('input')
  await type(inputs[0], 'OwenMtp')
  await type(inputs[1], 'Elisaowen2003.')
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
  if (!text().includes('4 chiffres')) throw new Error('PIN gate missing: ' + text().slice(0, 300))
  await type(container.querySelector('input'), '1205')
  await act(async () => { await new Promise(r => setTimeout(r, 600)) }) // laisse passer le squelette de chargement

  // 5. App principale : Dashboard
  if (!text().includes('Espace Sales de OwenMtp')) throw new Error('Main app missing: ' + text().slice(0, 400))
  if (!text().includes('RDV réalisés')) throw new Error('Dashboard missing: ' + text().slice(0, 400))

  // 6. Navigation sur chaque page
  for (const label of ['Mes Rendez-vous', 'Leads', 'Recommandations prioritaires', 'Mes tâches', 'Mes contacts', 'Mes notes', 'Logs', 'Primes & Commissions', 'Dashboard personnalisé', 'KPI Entreprise', 'Support', 'Nouvelles demandes', 'Tickets Techniques', 'Clients', 'Gestion de Projet', 'Logs Support', 'Gestion Administration']) {
    // .replace(/\d+$/,'') : certains onglets portent une pastille de messages/demandes non lus
    const btn = [...container.querySelectorAll('nav button')].find(b => b.textContent.trim().replace(/\d+$/, '').trim() === label)
    if (!btn) throw new Error('Nav button missing: ' + label)
    await click(btn)
    if (!text().includes(label)) throw new Error(`Page ${label} did not render`)
  }

  // 6b. Support : créer un ticket, vérifier la conversation, le côté support et l'enrichissement client
  await click([...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Support'))
  await click(find('button', 'Nouveau ticket'))
  if (!text().includes('Décrivez votre problème')) throw new Error('Ticket form did not open')
  await type(container.querySelector('textarea'), 'Test smoke : impossible de me connecter')
  await click(find('button', 'Créer le ticket'))
  if (!text().includes('équipe technique')) throw new Error('Bot auto-message missing in ticket conversation')
  const dbNow = () => JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
  const psClient = () => dbNow().clients.find(c => c.envId === 'env-peoplespheres')
  if (psClient()?.status !== 'attente') throw new Error('Client not set to "en attente" on ticket open: ' + psClient()?.status)
  // Les onglets support peuvent porter une pastille de messages non lus (chiffre accolé au libellé).
  const navBtn = (label) => [...container.querySelectorAll('nav button')].find(b => b.textContent.trim().replace(/\d+$/, '').trim() === label)
  await click(navBtn('Tickets Techniques'))
  if (!text().includes('Connexion & authentification')) throw new Error('Ticket not visible in Tickets Techniques')
  // Clôture du ticket → le client repasse en « Clients actifs »
  await click(find('button', 'Connexion & authentification'))
  await click(find('button', 'Clôturer'))
  if (psClient()?.status !== 'actifs') throw new Error('Client not restored to "actifs" on ticket close: ' + psClient()?.status)
  // Helpdesk : priorité par défaut + notation de satisfaction (CSAT) après clôture.
  const myTicket = () => dbNow().tickets.find(t => t.category === 'Connexion & authentification')
  if (myTicket()?.priority !== 'normale') throw new Error('Default ticket priority should be "normale"')
  await click(navBtn('Support'))
  await click(find('button', 'Connexion & authentification'))
  if (!text().includes('comment évaluez-vous')) throw new Error('CSAT prompt not shown on closed ticket')
  await click(container.querySelector('button[title="4/5"]'))
  await click(find('button', 'Envoyer mon avis'))
  if (myTicket()?.csat?.score !== 4) throw new Error('CSAT rating not saved: ' + JSON.stringify(myTicket()?.csat))
  await click(navBtn('Clients'))
  // Chaque environnement existant est forcément un client (PeopleSpheres + Test).
  if (!text().includes('PeopleSpheres') || !text().includes('Test')) throw new Error('Environments not turned into clients')
  // La demande du site est arrivée dans Nouvelles demandes...
  await click(navBtn('Nouvelles demandes'))
  if (!text().includes('ACME Corp')) throw new Error('Contact request not ingested into Nouvelles demandes')
  // ...et a généré automatiquement un projet ; chaque environnement a aussi son projet d'implémentation.
  await click(navBtn('Gestion de Projet'))
  if (!text().includes('ACME Corp')) throw new Error('Auto-project from request not created')
  if (!text().includes('PeopleSpheres')) throw new Error('Environment project not created')
  // Création manuelle d'un projet : le formulaire + le planning Gantt doivent fonctionner.
  await click(find('button', 'Nouveau projet'))
  if (!text().includes('Phases du projet')) throw new Error('Project form did not open')
  await type([...container.querySelectorAll('input')].find(i => (i.getAttribute('placeholder') || '').includes('Déploiement')), 'Projet manuel')
  await click(find('button', 'Enregistrer'))
  if (!text().includes('Avancement')) throw new Error('Project not created / Gantt did not render')

  // 6c. Logs Support : la création de ticket a bien été journalisée.
  await click(navBtn('Logs Support'))
  if (!text().includes('Ticket créé')) throw new Error('Support log for ticket creation missing')

  // 6d. Le support peut bloquer puis débloquer un environnement client.
  await click(navBtn('Clients'))
  await click(find('button', 'PeopleSpheres'))
  await click(find('button', 'Bloquer le client'))
  await click(findExact('Bloquer')) // confirmation
  if (dbNow().environments.find(e => e.id === 'env-peoplespheres').subState !== 'blocked') throw new Error('Env not blocked')
  await click(find('button', 'Débloquer'))
  if (dbNow().environments.find(e => e.id === 'env-peoplespheres').subState !== 'active') throw new Error('Env not unblocked')
  await click(find('button', 'Fermer'))

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

  // 9. Organigramme + paramètres
  await click(container.querySelector('button[title="Organigramme"]'))
  if (!text().includes('Organigramme')) throw new Error('OrgChart did not render')
  await click(container.querySelector('button[title="Paramètres"]'))
  if (!text().includes('Thèmes de design')) throw new Error('Settings did not render')

  // 9b. Résiliation d'abonnement : ouvre un ticket support + bascule l'environnement en lecture seule.
  await click(find('button', 'Gérer mes environnements'))
  await click(find('button', 'Résilier mon abonnement'))
  await click(findExact('Résilier')) // confirmation
  const dbR = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
  if (dbR.environments.find(e => e.id === 'env-peoplespheres').subState !== 'cancelling') throw new Error('Résiliation did not set env to cancelling')
  if (!dbR.tickets.some(t => t.category === 'Facturation & abonnement')) throw new Error('Résiliation ticket not created')

  // 10. Migration : un ancien stockage SANS l'environnement Test doit le récupérer au rechargement
  const raw = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
  raw.environments = raw.environments.filter(x => x.id !== 'env-test')
  raw.accounts = raw.accounts.filter(a => !String(a.id).startsWith('test-'))
  raw.subenvs = raw.subenvs.filter(s => !String(s.id).startsWith('tsub-'))
  Object.keys(raw.data).forEach(k => { if (k.startsWith('tsub-')) delete raw.data[k] })
  // Persistance des suppressions : un projet auto-créé supprimé ne doit pas réapparaître au rechargement.
  if (!raw.projects.some(p => p.sourceEnvId === 'env-peoplespheres')) throw new Error('Env project missing before deletion test')
  raw.projects = raw.projects.filter(p => p.sourceEnvId !== 'env-peoplespheres')
  win.localStorage.setItem('bdrflow_db_v1', JSON.stringify(raw))
  win.sessionStorage.clear()
  const c2 = win.document.createElement('div')
  win.document.body.appendChild(c2)
  const root2 = createRoot(c2)
  await act(async () => {
    root2.render(Root(React.createElement(App)))
  })
  await act(async () => { await new Promise(r => setTimeout(r, 1700)) }) // splash
  const inputs2 = c2.querySelectorAll('input')
  await type(inputs2[0], 'OwenMtp')
  await type(inputs2[1], 'Elisaowen2003.')
  await click([...c2.querySelectorAll('button')].find(b => b.textContent.includes('Se connecter')))
  await act(async () => { await new Promise(r => setTimeout(r, 2800)) })
  if (!c2.textContent.includes('Test')) throw new Error('Migration failed: env Test not injected into legacy storage')
  // La suppression du projet auto-créé a bien persisté (migrate ne l'a pas ressuscité).
  const afterReload = JSON.parse(win.localStorage.getItem('bdrflow_db_v1'))
  if (afterReload.projects.some(p => p.sourceEnvId === 'env-peoplespheres')) throw new Error('Deleted auto-project resurrected after reload')

  const realErrors = errors.filter(e => !e.includes('act(') && !e.includes('width(0) and height(0)') && !e.includes('Not implemented') && !e.includes('test-utils'))
  if (realErrors.length) throw new Error('Console errors:\n' + realErrors.join('\n---\n'))
  console.log('SMOKE OK — all screens rendered without errors')
}

main().then(() => process.exit(0), (e) => { console.error("SMOKE FAILED:", e.stack || e.message); process.exit(1) })
