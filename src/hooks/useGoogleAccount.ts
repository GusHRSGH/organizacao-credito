import { useCallback, useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/format'

const AUTO_KEY = 'oc:google-auto-backup'
const AUTO_DELAY_MS = 8000

export interface GoogleAccount {
  available: boolean
  status: GoogleStatus | null
  /** true depois de saber se há (ou não) uma conta conectada */
  ready: boolean
  busy: boolean
  autoBackup: boolean
  setAutoBackup: (value: boolean) => void
  saveCredentials: (clientId: string, clientSecret: string) => Promise<boolean>
  forgetCredentials: () => Promise<void>
  signIn: () => Promise<boolean>
  cancelSignIn: () => Promise<void>
  signOut: () => Promise<void>
  backupNow: () => Promise<void>
  latest: () => Promise<{ modifiedTime: string; size: number } | null>
  restoreText: () => Promise<string>
}

type Notify = (kind: 'notice' | 'error', text: string) => void

interface Options {
  /** Gera o texto do backup. Retorna null quando não há dados (nunca sobrescrevemos o Drive com vazio). */
  makeBackupText: (() => Promise<string | null>) | null
  /** Muda quando os dados mudam; dispara o backup automático. */
  dataKey: unknown
  notify: Notify
}

function readAuto() {
  try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true }
}

export function useGoogleAccount({ makeBackupText, dataKey, notify }: Options): GoogleAccount {
  const api = window.desktopGoogle
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(!window.desktopGoogle)
  const [autoBackup, setAuto] = useState(readAuto)
  const makeRef = useRef(makeBackupText)
  makeRef.current = makeBackupText

  useEffect(() => { void api?.status().then(setStatus).catch(() => setStatus(null)).finally(() => setReady(true)) }, [api])

  const run = useCallback(async (action: () => Promise<GoogleStatus | void>) => {
    setBusy(true)
    try {
      const next = await action()
      if (next) setStatus(next)
    } catch (cause) {
      notify('error', messageOf(cause))
    } finally { setBusy(false) }
  }, [notify])

  const setAutoBackup = useCallback((value: boolean) => {
    setAuto(value)
    try { localStorage.setItem(AUTO_KEY, value ? 'on' : 'off') } catch { /* ignora */ }
  }, [])

  const backupNow = useCallback(() => run(async () => {
    if (!api || !makeRef.current) return
    const text = await makeRef.current()
    if (!text) throw new Error('Não há dados para guardar ainda.')
    const next = await api.backup(text)
    notify('notice', 'Backup guardado no seu Google Drive.')
    return next
  }), [api, run, notify])

  useEffect(() => {
    if (!api || !autoBackup || !status?.signedIn || !makeRef.current) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const text = await makeRef.current?.()
          if (!text) return
          setStatus(await api.backup(text))
        } catch (cause) { notify('error', `Backup automático falhou: ${messageOf(cause)}`) }
      })()
    }, AUTO_DELAY_MS)
    return () => clearTimeout(timer)
  }, [api, autoBackup, status?.signedIn, dataKey, notify])

  return {
    available: !!api,
    status,
    ready,
    busy,
    autoBackup,
    setAutoBackup,
    saveCredentials: async (clientId, clientSecret) => {
      let ok = false
      await run(async () => { const next = await api!.saveCredentials(clientId, clientSecret); ok = true; return next })
      return ok
    },
    forgetCredentials: () => run(() => api!.forgetCredentials()),
    signIn: async () => {
      let done = false
      await run(async () => {
        try {
          const next = await api!.signIn()
          done = true
          notify('notice', `Conectado como ${next.email ?? 'sua conta Google'}.`)
          return next
        } catch (cause) {
          if (messageOf(cause).includes('Login cancelado')) return
          throw cause
        }
      })
      return done
    },
    cancelSignIn: async () => { await api?.cancelSignIn() },
    signOut: () => run(() => api!.signOut()),
    backupNow,
    latest: () => api!.latest(),
    restoreText: () => api!.restore(),
  }
}
