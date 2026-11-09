import type { SupabaseClient } from '@supabase/supabase-js'
import type { BackupFile, LocalData } from '../types'

export interface CloudRecord { payload: BackupFile; version: number; updatedAt: string }
export interface SyncMarker { version: number; hash: string; at: string }
export type SyncDecision = 'noop' | 'record' | 'upload' | 'download' | 'choose'

export class VersionConflictError extends Error {
  constructor() { super('Os dados mudaram em outro aparelho.'); this.name = 'VersionConflictError' }
}

/** Hash curto e estável (cyrb53) para saber se os dados mudaram desde a última sincronização. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export const hashData = (data: LocalData) => hashText(JSON.stringify(data))
export const isEmptyData = (data: LocalData) => data.invoices.length === 0 && data.transactions.length === 0

/**
 * Decide o que fazer ao comparar este aparelho com a nuvem.
 * `last` é o que foi sincronizado da última vez neste aparelho (nulo na primeira vez).
 * Regra de ouro: um aparelho vazio nunca apaga a nuvem.
 */
export function decideSync(input: {
  localHash: string
  localEmpty: boolean
  cloud: { version: number; hash: string; empty: boolean } | null
  last: { version: number; hash: string } | null
}): SyncDecision {
  const { localHash, localEmpty, cloud, last } = input
  if (!cloud || cloud.empty) return localEmpty ? 'noop' : 'upload'
  if (localEmpty) return 'download'
  if (cloud.hash === localHash) return last && last.version === cloud.version && last.hash === localHash ? 'noop' : 'record'
  if (!last) return 'choose'
  const localChanged = last.hash !== localHash
  const cloudChanged = last.version !== cloud.version
  if (localChanged && cloudChanged) return 'choose'
  if (cloudChanged) return 'download'
  return localChanged ? 'upload' : 'noop'
}

export function friendlyAuthError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause)
  if (/rate limit|too many|security purposes|after \d+ seconds/i.test(text)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/expired|invalid|otp/i.test(text)) return 'Código inválido ou vencido. Confira o e-mail ou peça um novo código.'
  if (/valid email|email address/i.test(text)) return 'Esse e-mail não parece válido.'
  if (/network|fetch|failed to/i.test(text)) return 'Sem conexão com a nuvem. Verifique a internet e tente de novo.'
  return text
}

/** Conversa com o Supabase: login por código de e-mail e a cópia dos dados da conta. */
export class CloudApi {
  constructor(private readonly client: SupabaseClient) {}

  async sendCode(email: string) {
    const { error } = await this.client.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    if (error) throw new Error(friendlyAuthError(error))
  }

  async verifyCode(email: string, code: string) {
    const { error } = await this.client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s/g, ''), type: 'email' })
    if (error) throw new Error(friendlyAuthError(error))
  }

  async signOut() { await this.client.auth.signOut() }

  async pull(userId: string): Promise<CloudRecord | null> {
    const { data, error } = await this.client.from('user_data').select('payload, version, updated_at').eq('user_id', userId).maybeSingle()
    if (error) throw new Error(friendlyAuthError(error))
    return data ? { payload: data.payload as BackupFile, version: Number(data.version), updatedAt: String(data.updated_at) } : null
  }

  /** Devolve a nova versão. Lança VersionConflictError se outro aparelho salvou antes. */
  async push(payload: BackupFile, expectedVersion: number): Promise<number> {
    const { data, error } = await this.client.rpc('save_user_data', { p_payload: payload, p_expected_version: expectedVersion })
    if (error) {
      if (/version_conflict/.test(error.message)) throw new VersionConflictError()
      if (/payload_too_large/.test(error.message)) throw new Error('Os dados passaram do limite da nuvem (4 MB).')
      throw new Error(friendlyAuthError(error))
    }
    return Number(data)
  }

  async deleteAccount() {
    const { error } = await this.client.rpc('delete_my_account')
    if (error) throw new Error(friendlyAuthError(error))
    await this.client.auth.signOut()
  }
}
