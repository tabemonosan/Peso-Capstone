import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './theme.css'
import App from './App.jsx'
import CompanyProfileWindow from './components/CompanyProfileWindow'
import ActionConfirmations from './components/ActionConfirmations'
import { installConfirmedFetch } from './utils/actionConfirmation'

const uninstallConfirmedFetch = installConfirmedFetch()
if (import.meta.hot) import.meta.hot.dispose(uninstallConfirmedFetch)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ActionConfirmations />
    {window.location.hash.startsWith('#company-profile/') ? <CompanyProfileWindow /> : <App />}
  </StrictMode>,
)
