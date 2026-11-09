import { useSyncExternalStore } from 'react'

const KEY = 'oc:insight'
const listeners = new Set<() => void>()

const read = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }

/** Mostra ou esconde a frase-resumo da Visão geral. Fica guardado neste aparelho. */
export function setInsightVisible(visible: boolean) {
  try { if (visible) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off') } catch { /* sem armazenamento: vale só até recarregar */ }
  listeners.forEach((listener) => listener())
}

export function useInsightVisible(): [boolean, (visible: boolean) => void] {
  const visible = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, read, () => true)
  return [visible, setInsightVisible]
}
