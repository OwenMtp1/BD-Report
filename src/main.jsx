import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
)

// PWA : installable et utilisable hors-ligne (uniquement en HTTPS, ignoré en fichier local)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
