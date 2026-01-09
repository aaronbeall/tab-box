import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from './Panel'
import './main.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
)
