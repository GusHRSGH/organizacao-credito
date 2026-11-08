import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, storedTheme } from './lib/theme'
import AppLock from './components/AppLock'
import { hideSplash, initNative, isNative } from './lib/native'
import { installAndroidGoogle } from './lib/androidGoogle'

applyTheme(storedTheme())
initNative()
if (isNative && !window.desktopGoogle) installAndroidGoogle()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppLock><App /></AppLock></React.StrictMode>,
)
requestAnimationFrame(() => hideSplash())

