import { useCallback, useEffect, useState } from 'react'
import { applyNativeTheme } from './native'

export type Theme = 'light' | 'dark'
const KEY = 'oc:theme'

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light' || value === 'dark') return value
  } catch { /* storage indisponível */ }
  return systemTheme()
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  applyNativeTheme(theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1124' : '#f3f6fd')
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  useEffect(() => { applyTheme(theme) }, [theme])
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, next) } catch { /* ignora */ }
      return next
    })
  }, [])
  return [theme, toggle]
}
