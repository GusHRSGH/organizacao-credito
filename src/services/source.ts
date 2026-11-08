import { hasSupabaseConfig } from '../lib/supabase'
import type { DataSource, SourceKind } from '../types'
import { LocalSource } from './localSource'
import { SupabaseSource } from './supabaseSource'

const STORAGE_KEY = 'oc:source'
const instances: Partial<Record<SourceKind, DataSource>> = {}

export function getStoredKind(): SourceKind {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'supabase' && hasSupabaseConfig) return 'supabase'
  } catch { /* armazenamento indisponível: usa o banco local */ }
  return 'local'
}

export function storeKind(kind: SourceKind) {
  try { localStorage.setItem(STORAGE_KEY, kind) } catch { /* ignora */ }
}

export function getSource(kind: SourceKind): DataSource {
  instances[kind] ??= kind === 'supabase' ? new SupabaseSource() : new LocalSource()
  return instances[kind]!
}

export const isLocalSource = (source: DataSource): source is LocalSource => source instanceof LocalSource
