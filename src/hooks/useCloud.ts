import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasStoredSession, loadSupabase } from '../lib/supabase'
import { messageOf } from '../lib/format'
import { CloudApi, VersionConflictError, decideSync, hashData, isEmptyData, type CloudRecord, type SyncMarker } from '../services/cloud'
import { validateBackup } from '../services/backup'
import type { LocalSource } from '../services/localSource'

const PUSH_DELAY_MS = 4000
const markerKey = (userId: string) => `oc:cloud:${userId}`

function readMarker(userId: string): SyncMarker | null {
  try { const raw = localStorage.getItem(markerKey(userId)); return raw ? JSON.parse(raw) as SyncMarker : null } catch { return null }
}
function writeMarker(userId: string, marker: SyncMarker | null) {
  try { if (marker) localStorage.setItem(markerKey(userId), JSON.stringify(marker)); else localStorage.removeItem(markerKey(userId)) } catch { /* ignora */ }
}

export interface CloudState {
  session: Session | null
  ready: boolean
  api: CloudApi
  /** idle | syncing | error */
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  /** Aparelho e nuvem têm dados diferentes: a pessoa escolhe qual manter. */
  conflict: { cloudAt: string; cloudTransactions: number } | null
  syncNow: () => Promise<void>
  keepThisDevice: () => Promise<void>
  keepCloud: () => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

type Notify = (kind: 'notice' | 'error', text: string) => void

interface Options {
  local: LocalSource
  /** Muda quando os dados mudam; dispara o envio automático. */
  dataKey: unknown
  /** Só sincroniza depois que os dados locais foram carregados na tela. */
  loaded: boolean
  onDownloaded: () => Promise<void>
  notify: Notify
}

export function useCloud({ local, dataKey, loaded, onDownloaded, notify }: Options): CloudState {
  const api = useMemo(() => new CloudApi(loadSupabase), [])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<CloudState['status']>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [conflict, setConflict] = useState<CloudState['conflict']>(null)
  const pending = useRef<CloudRecord | null>(null)
  const busy = useRef(false)
  const userId = session?.user.id ?? null

  useEffect(() => {
    let mounted = true
    api.onSession((current) => { if (mounted) { setSession(current); setReady(true) } })
    // Sem sessão guardada, nem carrega a biblioteca da nuvem: ela vem quando a pessoa abre o login.
    if (hasStoredSession()) void api.start().catch(() => { if (mounted) setReady(true) })
    else setReady(true)
    return () => { mounted = false }
  }, [api])

  const finish = useCallback((uid: string, version: number, hash: string) => {
    const at = new Date().toISOString()
    writeMarker(uid, { version, hash, at })
    setLastSyncAt(at); setStatus('idle')
  }, [])

  const upload = useCallback(async (uid: string, expected: number) => {
    const backup = await local.exportBackup()
    const version = await api.push(backup, expected)
    finish(uid, version, hashData(backup.data))
  }, [api, local, finish])

  const download = useCallback(async (uid: string, record: CloudRecord) => {
    const data = validateBackup(record.payload)
    await local.restoreBackup(record.payload)
    await onDownloaded()
    finish(uid, record.version, hashData(data))
  }, [local, onDownloaded, finish])

  /** Compara este aparelho com a nuvem e faz o que for seguro. Em dúvida, pergunta. */
  const reconcile = useCallback(async (manual: boolean) => {
    if (!userId || busy.current) return
    busy.current = true
    setStatus('syncing')
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const backup = await local.exportBackup()
          const record = await api.pull(userId)
          const localHash = hashData(backup.data)
          const cloudData = record ? validateBackup(record.payload) : null
          const decision = decideSync({
            localHash, localEmpty: isEmptyData(backup.data),
            cloud: record && cloudData ? { version: record.version, hash: hashData(cloudData), empty: isEmptyData(cloudData) } : null,
            last: readMarker(userId),
          })
          if (decision === 'upload') await upload(userId, record?.version ?? 0)
          else if (decision === 'download' && record) { await download(userId, record); if (manual) notify('notice', 'Dados da nuvem carregados neste aparelho.') }
          else if (decision === 'record' && record) finish(userId, record.version, localHash)
          else if (decision === 'choose' && record && cloudData) {
            pending.current = record
            setConflict({ cloudAt: record.updatedAt, cloudTransactions: cloudData.transactions.length })
            setStatus('idle')
          } else { setLastSyncAt(readMarker(userId)?.at ?? new Date().toISOString()); setStatus('idle') }
          return
        } catch (cause) {
          // Outro aparelho salvou no meio do caminho: compara de novo uma vez.
          if (cause instanceof VersionConflictError && attempt === 0) continue
          throw cause
        }
      }
    } catch (cause) {
      setStatus('error')
      if (manual) notify('error', messageOf(cause))
    } finally { busy.current = false }
  }, [userId, local, api, upload, download, finish, notify])

  // Ao entrar (ou abrir o app já logado), compara uma vez.
  useEffect(() => { if (userId && loaded) void reconcile(false) }, [userId, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de cada mudança, espera um pouco e envia.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!userId || !loaded || conflict) return
    const timer = setTimeout(() => void reconcile(false), PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [dataKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Voltou a ter internet: tenta sincronizar o que ficou pendente.
  useEffect(() => {
    const onOnline = () => { if (userId && loaded && !conflict) void reconcile(false) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [userId, loaded, conflict, reconcile])

  const keepThisDevice = useCallback(async () => {
    const record = pending.current
    if (!userId || !record) return
    setConflict(null); setStatus('syncing')
    try { await upload(userId, record.version); notify('notice', 'Os dados deste aparelho foram para a nuvem.') } catch (cause) { setStatus('error'); notify('error', messageOf(cause)) }
    pending.current = null
  }, [userId, upload, notify])

  const keepCloud = useCallback(async () => {
    const record = pending.current
    if (!userId || !record) return
    setConflict(null); setStatus('syncing')
    try { await download(userId, record); notify('notice', 'Dados da nuvem carregados. Os de antes ficaram na lista de cópias automáticas.') } catch (cause) { setStatus('error'); notify('error', messageOf(cause)) }
    pending.current = null
  }, [userId, download, notify])

  const signOut = useCallback(async () => { await api.signOut(); setConflict(null); setLastSyncAt(null); setStatus('idle') }, [api])

  const deleteAccount = useCallback(async () => {
    if (userId) writeMarker(userId, null)
    await api.deleteAccount()
    setConflict(null); setLastSyncAt(null); setStatus('idle')
  }, [api, userId])

  const syncNow = useCallback(() => reconcile(true), [reconcile])

  return { session, ready, api, status, lastSyncAt, conflict, syncNow, keepThisDevice, keepCloud, signOut, deleteAccount }
}
