import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import TrainingJourney from './pages/TrainingJourney.jsx'
import { StoreProvider } from './store.jsx'
import { I18nProvider } from './i18n.jsx'
import './index.css'

// La formation occupe sa PROPRE page (#/formation) plutôt qu'un calque au-dessus de
// l'application : deux applications montées côte à côte écoutaient les mêmes événements
// de navigation et se disputaient la main, ce qui faisait dérailler le parcours guidé.
// Le provider ci-dessous reste celui de production — la formation y lit les rôles réels,
// puis monte son propre provider isolé pour ses données fictives.
const isTraining = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0] === 'formation'
const leaveTraining = () => {
  try { window.close() } catch (e) { /* onglet non ouvert par script */ }
  window.location.hash = ''
  window.location.reload()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <I18nProvider>
        {isTraining ? <TrainingJourney onClose={leaveTraining} /> : <App />}
      </I18nProvider>
    </StoreProvider>
  </React.StrictMode>,
)

// PWA : installable et utilisable hors-ligne (uniquement en HTTPS, ignoré en fichier local)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
