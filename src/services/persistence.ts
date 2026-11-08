import type { LocalData } from '../types'

export interface SnapshotRecord { id: string; savedAt: string; reason: 'auto' | 'antes'; data: LocalData }

export interface Persistence {
  load(): Promise<LocalData | null>
  save(data: LocalData): Promise<void>
  listSnapshots(): Promise<SnapshotRecord[]>
  putSnapshot(record: SnapshotRecord): Promise<void>
  removeSnapshot(id: string): Promise<void>
}

export class MemoryPersistence implements Persistence {
  private data: LocalData | null = null
  private snapshots = new Map<string, SnapshotRecord>()
  async load() { return this.data ? structuredClone(this.data) : null }
  async save(data: LocalData) { this.data = structuredClone(data) }
  async listSnapshots() { return [...this.snapshots.values()].map((record) => structuredClone(record)) }
  async putSnapshot(record: SnapshotRecord) { this.snapshots.set(record.id, structuredClone(record)) }
  async removeSnapshot(id: string) { this.snapshots.delete(id) }
}

const DB_NAME = 'organizacao-credito'
const STORE = 'kv'
const KEY = 'data'
const SNAP_PREFIX = 'snapshot:'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o banco local.'))
  })
}

export class IndexedDbPersistence implements Persistence {
  private dbPromise: Promise<IDBDatabase> | null = null
  private db() {
    this.dbPromise ??= openDb()
    return this.dbPromise
  }

  async load(): Promise<LocalData | null> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve((request.result as LocalData | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler o banco local.'))
    })
  }

  async save(data: LocalData): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar no banco local.'))
      tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada pelo navegador.'))
    })
    void navigator.storage?.persist?.()
  }

  private async write<T>(run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar a cópia automática.'))
      tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada pelo navegador.'))
    })
  }

  async listSnapshots(): Promise<SnapshotRecord[]> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(IDBKeyRange.bound(SNAP_PREFIX, `${SNAP_PREFIX}\uffff`))
      request.onsuccess = () => resolve(request.result as SnapshotRecord[])
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler as cópias automáticas.'))
    })
  }

  async putSnapshot(record: SnapshotRecord) { await this.write((store) => store.put(record, SNAP_PREFIX + record.id)) }
  async removeSnapshot(id: string) { await this.write((store) => store.delete(SNAP_PREFIX + id)) }
}
