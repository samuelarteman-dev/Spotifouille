import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { Callback } from './pages/Callback'

/** Deux routes seulement : pas besoin d'une bibliothèque de routage. */
const surCallback = window.location.pathname === '/callback'

const racine = document.getElementById('racine')
if (!racine) throw new Error('Élément #racine introuvable.')

createRoot(racine).render(
  <StrictMode>{surCallback ? <Callback /> : <App />}</StrictMode>,
)
