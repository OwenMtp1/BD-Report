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
  const { default: App } = await import('../src/App.jsx')

  const errors = []
  const origError = console.error
  console.error = (...a) => { errors.push(a.join(' ')); origError(...a) }

  const container = win.document.createElement('div')
  win.document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(React.StrictMode, null,
      React.createElement(StoreProvider, null, React.createElement(App))))
  })

  const text = () => container.textContent || ''
  const find = (sel, label) => [...container.querySelectorAll(sel)].find(el => el.textContent.trim().includes(label))
  const click = async (el) => act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  const type = async (el, value) => act(async () => { Simulate.change(el, { target: { value } }) })

  // 1. Écran de connexion
  if (!text().includes('BDR Flow Pro')) throw new Error('Login screen missing: ' + text().slice(0, 200))
  const inputs = container.querySelectorAll('input')
  await type(inputs[0], 'OwenMtp')
  await type(inputs[1], 'Elisaowen2003.')
  await click(find('button', 'Se connecter'))

  // 2. Écran de bienvenue
  if (!text().includes('Bienvenue OwenMtp')) throw new Error('Welcome screen missing: ' + text().slice(0, 300))
  await act(async () => { await new Promise(r => setTimeout(r, 2800)) })

  // 3. Choix de l'environnement
  if (!text().includes('PeopleSpheres')) throw new Error('Env picker missing: ' + text().slice(0, 300))
  await click(find('button', 'PeopleSpheres'))

  // 4. Sous-environnement protégé par PIN
  if (!text().includes('Owen Mrani Bonnier')) throw new Error('SubEnv picker missing: ' + text().slice(0, 300))
  await click(find('button', 'Owen Mrani Bonnier'))
  if (!text().includes('4 chiffres')) throw new Error('PIN gate missing: ' + text().slice(0, 300))
  await type(container.querySelector('input'), '1205')

  // 5. App principale : Dashboard
  if (!text().includes('Espace Sales de OwenMtp')) throw new Error('Main app missing: ' + text().slice(0, 400))
  if (!text().includes('RDV réalisés')) throw new Error('Dashboard missing: ' + text().slice(0, 400))

  // 6. Navigation sur chaque page
  for (const label of ['Mes Rendez-vous', 'Leads', 'Tâches prioritaires', 'Mes contacts', 'Mes notes', 'Primes & Commissions', 'Dashboard personnalisé', 'KPI Entreprise', 'Gestion Administration']) {
    const btn = [...container.querySelectorAll('nav button')].find(b => b.textContent.trim() === label)
    if (!btn) throw new Error('Nav button missing: ' + label)
    await click(btn)
    if (!text().includes(label)) throw new Error(`Page ${label} did not render`)
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

  // 9. Organigramme + paramètres
  await click(container.querySelector('button[title="Organigramme"]'))
  if (!text().includes('Organigramme')) throw new Error('OrgChart did not render')
  await click(container.querySelector('button[title="Paramètres"]'))
  if (!text().includes('Thèmes de design')) throw new Error('Settings did not render')

  const realErrors = errors.filter(e => !e.includes('act(') && !e.includes('width(0) and height(0)') && !e.includes('Not implemented') && !e.includes('test-utils'))
  if (realErrors.length) throw new Error('Console errors:\n' + realErrors.join('\n---\n'))
  console.log('SMOKE OK — all screens rendered without errors')
}

main().then(() => process.exit(0), (e) => { console.error('SMOKE FAILED:', e.message); process.exit(1) })
