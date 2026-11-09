import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNative = Capacitor.isNativePlatform()

const backStack: Array<() => boolean> = []

/** Registra quem quer tratar o botão Voltar do Android; o último registrado tem prioridade. */
export function registerBack(handler: () => boolean) {
  backStack.push(handler)
  return () => { const index = backStack.lastIndexOf(handler); if (index >= 0) backStack.splice(index, 1) }
}

/** Enquanto `active`, o botão Voltar executa `close` em vez de sair do app. */
export function useBackHandler(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active || !isNative) return
    return registerBack(() => { close(); return true })
  }, [active, close])
}

export function applyNativeTheme(theme: 'light' | 'dark') {
  if (!isNative) return
  void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => undefined)
  void StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#09090b' : '#f5f4fa' }).catch(() => undefined)
}

export function tap() {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}

export function hideSplash() {
  if (isNative) void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined)
}

/** Chama uma vez ao iniciar e sempre que um atalho (organizacaocredito://novo) abrir o app. */
export function watchShortcuts(handle: (target: string) => void) {
  if (!isNative) return () => undefined
  const parse = (url: string | undefined | null) => { const match = url?.match(/^organizacaocredito:\/\/([a-z-]+)/); if (match) handle(match[1]) }
  void App.getLaunchUrl().then((launch) => parse(launch?.url)).catch(() => undefined)
  const listener = App.addListener('appUrlOpen', (event) => parse(event.url))
  return () => { void listener.then((handle) => handle.remove()) }
}

/** Avisa quando o app volta do segundo plano, com o tempo que ficou fora. */
export function watchResume(onResume: (awayMs: number) => void) {
  if (!isNative) return () => undefined
  let left = 0
  const listener = App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) left = Date.now()
    else if (left) { onResume(Date.now() - left); left = 0 }
  })
  return () => { void listener.then((handle) => handle.remove()) }
}

export function initNative() {
  if (!isNative) return
  document.documentElement.classList.add('native')
  void App.addListener('backButton', () => {
    for (let index = backStack.length - 1; index >= 0; index -= 1) if (backStack[index]()) return
    void App.minimizeApp()
  })
}
