import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, storedTheme } from './lib/theme'
import AppLock from './components/AppLock'
import ErrorBoundary from './components/ErrorBoundary'
import { hideSplash, initNative } from './lib/native'

applyTheme(storedTheme())
initNative()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><AppLock><App /></AppLock></ErrorBoundary></React.StrictMode>,
)
requestAnimationFrame(() => hideSplash())

