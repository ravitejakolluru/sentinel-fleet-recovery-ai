import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './theme4.css'
import './recovery-command.css'
import './digital-twin.css'
import './alert-evaluation.css'
import './judge-mode.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
