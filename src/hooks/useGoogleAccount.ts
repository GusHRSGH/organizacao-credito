import { useCallback, useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/format'

const AUTO_KEY = 'oc:google-auto-backup'
const AUTO_DELAY_MS = 8000

export interface GoogleAccount {
  available: boolean
  status: GoogleStatus | null
  busy: boolean
  autoBackup: boolean
  setAutoBackup: (value: boolean) => void
  saveCredentials: (clientId: string, clientSecret: string) => Promise<void>
  forgetCredentials: () => Promise<void>
  signIn: () => Promise<void>
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
  const [autoBackup, setAuto] = useState(readAuto)
  const makeRef = useRef(makeBackupText)
  makeRef.current = makeBackupText

  useEffect(() => { void api?.status().then(setStatus).catch(() => setStatus(null)) }, [api])

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
    busy,
    autoBackup,
    setAutoBackup,
    saveCredentials: (clientId, clientSecret) => run(() => api!.saveCredentials(clientId, clientSecret)),
    forgetCredentials: () => run(() => api!.forgetCredentials()),
    signIn: () => run(async () => { const next = await api!.signIn(); notify('notice', `Conectado como ${next.email ?? 'sua conta Google'}.`); return next }),
    signOut: () => run(() => api!.signOut()),
    backupNow,
    latest: () => api!.latest(),
    restoreText: () => api!.restore(),
  }
}
