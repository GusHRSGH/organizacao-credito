import type { LocalData } from '../types'

export interface Persistence {
  load(): Promise<LocalData | null>
  save(data: LocalData): Promise<void>
}

export class MemoryPersistence implements Persistence {
  private data: LocalData | null = null
  async load() { return this.data ? structuredClone(this.data) : null }
  async save(data: LocalData) { this.data = structuredClone(data) }
}

const DB_NAME = 'organizacao-credito'
const STORE = 'kv'
const KEY = 'data'

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
}
