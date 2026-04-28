import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Add platform to root element so CSS can target it
document.documentElement.dataset.platform = navigator.userAgent.includes('Mac') ? 'mac' : 'other'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
