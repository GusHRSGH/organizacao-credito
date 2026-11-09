import { useCallback, useSyncExternalStore } from 'react'
import { applyNativeTheme } from './native'
import { DEFAULT_PALETTE, getPalette, tokensFor } from './themes'

export type Theme = 'light' | 'dark'
export type ThemeMode = 'auto' | 'light' | 'dark'
interface Prefs { mode: ThemeMode; palette: string }

const MODE_KEY = 'oc:mode'
const PALETTE_KEY = 'oc:palette'
const OLD_KEY = 'oc:theme'

const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* sem armazenamento: vale só nesta sessão */ } }

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readPrefs(): Prefs {
  const stored = read(MODE_KEY) ?? read(OLD_KEY)
  const mode: ThemeMode = stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  return { mode, palette: getPalette(read(PALETTE_KEY) ?? DEFAULT_PALETTE).id }
}

let prefs = readPrefs()
let snapshot = { ...prefs, theme: resolve(prefs.mode) }
const listeners = new Set<() => void>()

function resolve(mode: ThemeMode): Theme { return mode === 'auto' ? systemTheme() : mode }

export function applyPrefs() {
  const theme = resolve(prefs.mode)
  const tokens = tokensFor(getPalette(prefs.palette), theme)
  const root = document.documentElement
  root.dataset.theme = theme
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
  applyNativeTheme(theme, tokens['--bg'])
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--bg'])
  snapshot = { ...prefs, theme }
  listeners.forEach((listener) => listener())
}

export function storedTheme(): Theme { return resolve(prefs.mode) }
/** Aplica o tema salvo (a assinatura antiga ainda é aceita). */
export function applyTheme(_theme?: Theme) { void _theme; applyPrefs() }

export function setMode(mode: ThemeMode) { prefs = { ...prefs, mode }; write(MODE_KEY, mode); applyPrefs() }
export function setPalette(palette: string) { prefs = { ...prefs, palette: getPalette(palette).id }; write(PALETTE_KEY, prefs.palette); applyPrefs() }

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (prefs.mode === 'auto') applyPrefs() })
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const getSnapshot = () => snapshot

export function useAppearance() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...state, setMode, setPalette }
}

/** Compatível com o botão de sol/lua: alterna entre claro e escuro. */
export function useTheme(): [Theme, () => void] {
  const { theme } = useAppearance()
  const toggle = useCallback(() => setMode(theme === 'dark' ? 'light' : 'dark'), [theme])
  return [theme, toggle]
}
