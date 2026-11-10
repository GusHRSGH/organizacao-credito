import { useSyncExternalStore } from 'react'

/** Preferências do app. Ficam só neste aparelho (localStorage). */
export interface Settings {
  fontScale: 'small' | 'normal' | 'large' | 'xlarge'
  density: 'comfortable' | 'compact'
  reduceMotion: boolean
  dateStyle: 'full' | 'short'
  cents: boolean
  hideValues: boolean
  startPage: 'dashboard' | 'invoices' | 'billing' | 'goals'
  showBilling: boolean
  showGoals: boolean
  defaultPerson: string
  defaultCategory: string
  remindDue: 0 | 1 | 3 | 7
  remindDebts: boolean
  remindGoals: boolean
}

export const DEFAULTS: Settings = {
  fontScale: 'normal', density: 'comfortable', reduceMotion: false, dateStyle: 'full', cents: true, hideValues: false,
  startPage: 'dashboard', showBilling: true, showGoals: true, defaultPerson: '', defaultCategory: '',
  remindDue: 3, remindDebts: true, remindGoals: true,
}

const KEY = 'oc:settings'
const ZOOM = { small: 0.92, normal: 1, large: 1.1, xlarge: 1.22 } as const
const listeners = new Set<() => void>()

function sanitize(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = <K extends keyof Settings>(key: K, allowed?: readonly Settings[K][]): Settings[K] => {
    const value = input[key]
    if (typeof value !== typeof DEFAULTS[key]) return DEFAULTS[key]
    if (allowed && !allowed.includes(value as Settings[K])) return DEFAULTS[key]
    return value as Settings[K]
  }
  return {
    fontScale: pick('fontScale', ['small', 'normal', 'large', 'xlarge']), density: pick('density', ['comfortable', 'compact']),
    reduceMotion: pick('reduceMotion'), dateStyle: pick('dateStyle', ['full', 'short']), cents: pick('cents'), hideValues: pick('hideValues'),
    startPage: pick('startPage', ['dashboard', 'invoices', 'billing', 'goals']), showBilling: pick('showBilling'), showGoals: pick('showGoals'),
    defaultPerson: pick('defaultPerson'), defaultCategory: pick('defaultCategory'),
    remindDue: pick('remindDue', [0, 1, 3, 7]), remindDebts: pick('remindDebts'), remindGoals: pick('remindGoals'),
  }
}

function load(): Settings {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return { ...DEFAULTS } }
}

let current: Settings = load()

export const getSettings = () => current

/** Aplica no documento o que depende de CSS (tamanho do texto, densidade, animações). */
export function applySettings(settings: Settings = current) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('zoom', settings.fontScale === 'normal' ? '' : String(ZOOM[settings.fontScale]))
  root.classList.toggle('density-compact', settings.density === 'compact')
  root.classList.toggle('reduce-motion', settings.reduceMotion)
}

export function updateSettings(patch: Partial<Settings>) {
  current = sanitize({ ...current, ...patch })
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* vale até recarregar */ }
  applySettings(current)
  listeners.forEach((listener) => listener())
}

export const resetSettings = () => { try { localStorage.removeItem(KEY) } catch { /* ignora */ } current = { ...DEFAULTS }; applySettings(current); listeners.forEach((l) => l()) }
export const exportSettings = () => JSON.stringify({ app: 'organizacao-credito', settings: current }, null, 2)
export function importSettings(text: string) {
  const parsed = JSON.parse(text) as { app?: string; settings?: unknown }
  if (parsed.app !== 'organizacao-credito' || !parsed.settings) throw new Error('Esse arquivo não é de configurações do app.')
  current = sanitize(parsed.settings)
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* ignora */ }
  applySettings(current)
  listeners.forEach((listener) => listener())
}

export function useSettings(): [Settings, typeof updateSettings] {
  const value = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, getSettings, () => DEFAULTS)
  return [value, updateSettings]
}
