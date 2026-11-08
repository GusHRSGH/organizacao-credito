// Login com Google e backup no Drive para o app Android.
// Mesmo fluxo do Windows (OAuth com PKCE no navegador do sistema), mas o retorno chega por um esquema de URL do app
// e o cliente é do tipo "Android" (sem chave secreta). Escopo drive.appdata: pasta oculta e exclusiva do app.
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import config from './google-android.json'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata']
const BACKUP_NAME = 'organizacao-credito-backup.json'
const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000
const SESSION_KEY = 'oc:google-session'

interface Session { refreshToken: string; email: string | null; name: string | null; picture: string | null; lastBackupAt: string | null }

const clientId = () => String(config.clientId || '')
const redirectUri = () => `com.googleusercontent.apps.${clientId().replace(/\.apps\.googleusercontent\.com$/, '')}:/oauth2redirect`

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (size: number) => base64url(crypto.getRandomValues(new Uint8Array(size)))

export async function pkceChallenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

export function decodeIdToken(idToken: string): { email?: string; name?: string; picture?: string } {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(part))))
  } catch { return {} }
}

export function googleError(body: unknown, fallback: string) {
  const data = body as { error?: string | { message?: string }; error_description?: string } | null
  const code = typeof data?.error === 'string' ? data.error : ''
  if (code === 'invalid_client') return 'O Google não reconheceu o cliente do app. Confira o ID e a assinatura cadastrados.'
  if (code === 'invalid_grant') return 'A sessão com o Google expirou. Entre de novo.'
  if (code === 'access_denied') return 'O acesso foi negado na tela do Google.'
  const message = data?.error_description || (typeof data?.error === 'object' ? data.error?.message : '') || code
  return message ? `Google: ${message}` : fallback
}

async function readSession(): Promise<Session | null> {
  try { const raw = await SecureStorage.get(SESSION_KEY); return typeof raw === 'string' ? JSON.parse(raw) as Session : null } catch { return null }
}
const writeSession = (session: Session) => SecureStorage.set(SESSION_KEY, JSON.stringify(session))

let memoryToken: { value: string; expiresAt: number } | null = null
let cancelLogin: (() => void) | null = null

async function status(): Promise<GoogleStatus> {
  const current = await readSession()
  return { configured: !!clientId(), bundled: true, signedIn: !!current?.refreshToken, email: current?.email ?? null, name: current?.name ?? null, picture: current?.picture ?? null, lastBackupAt: current?.lastBackupAt ?? null }
}

async function postForm(params: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(googleError(body, 'Falha ao falar com o Google.'))
  return body as { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string }
}

async function signIn(): Promise<GoogleStatus> {
  if (!clientId()) throw new Error('O login com Google ainda não foi configurado neste app.')
  const verifier = random(48)
  const challenge = await pkceChallenge(verifier)
  const state = random(16)
  const redirect = redirectUri()

  const code = await new Promise<string>((resolve, reject) => {
    let done = false
    const cleanups: Array<() => void> = []
    const finish = (action: () => void) => { if (done) return; done = true; cleanups.forEach((fn) => fn()); action() }
    const timer = setTimeout(() => finish(() => { void Browser.close().catch(() => undefined); reject(new Error('Tempo esgotado. Tente entrar de novo.')) }), LOGIN_TIMEOUT_MS)
    cleanups.push(() => clearTimeout(timer))
    cancelLogin = () => finish(() => { void Browser.close().catch(() => undefined); reject(new Error('Login cancelado.')) })

    void App.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(redirect)) return
      const query = new URL(url).searchParams
      finish(() => {
        void Browser.close().catch(() => undefined)
        const failure = query.get('error')
        if (failure) reject(new Error(googleError({ error: failure }, 'O Google recusou o acesso.')))
        else if (query.get('state') !== state || !query.get('code')) reject(new Error('Resposta do Google inválida. Tente novamente.'))
        else resolve(query.get('code')!)
      })
    }).then((handle) => { if (done) void handle.remove(); else cleanups.push(() => void handle.remove()) })

    // Fechar a aba do navegador sem concluir cancela o login (com folga para a resposta chegar antes).
    void Browser.addListener('browserFinished', () => { setTimeout(() => finish(() => reject(new Error('Login cancelado.'))), 900) })
      .then((handle) => { if (done) void handle.remove(); else cleanups.push(() => void handle.remove()) })

    const query = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' })
    void Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` })
  })
  cancelLogin = null

  const tokens = await postForm({ client_id: clientId(), code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' })
  if (!tokens.refresh_token) throw new Error('O Google não devolveu a permissão de acesso contínuo. Remova o app em myaccount.google.com/permissions e tente de novo.')
  if (!String(tokens.scope || '').includes('drive.appdata')) throw new Error('Para guardar o backup, marque a permissão do Google Drive na tela de acesso.')
  const profile = decodeIdToken(tokens.id_token || '')
  memoryToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
  await writeSession({ refreshToken: tokens.refresh_token, email: profile.email ?? null, name: profile.name ?? null, picture: profile.picture ?? null, lastBackupAt: null })
  return status()
}

async function accessToken() {
  if (memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken.value
  const current = await readSession()
  if (!current?.refreshToken) throw new Error('Entre com o Google primeiro.')
  const tokens = await postForm({ client_id: clientId(), refresh_token: current.refreshToken, grant_type: 'refresh_token' })
  memoryToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
  return memoryToken.value
}

async function drive(url: string, init: RequestInit = {}) {
  const token = await accessToken()
  const response = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 403 && (body as { error?: { errors?: Array<{ reason?: string }> } })?.error?.errors?.[0]?.reason === 'accessNotConfigured') throw new Error('Ative a "Google Drive API" no projeto do Google Cloud.')
    throw new Error(googleError(body, `O Google Drive respondeu com erro ${response.status}.`))
  }
  return response
}

async function findBackup() {
  const query = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${BACKUP_NAME}' and trashed=false`, fields: 'files(id,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '1' })
  const body = await (await drive(`https://www.googleapis.com/drive/v3/files?${query}`)).json() as { files?: Array<{ id: string; modifiedTime: string; size?: string }> }
  return body.files?.[0] ?? null
}

async function backup(text: string): Promise<GoogleStatus> {
  if (!text) throw new Error('Nada para guardar.')
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('O backup passou do limite de 20 MB.')
  const existing = await findBackup()
  if (existing) {
    await drive(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: text })
  } else {
    const boundary = `oc${random(8)}`
    const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] })}\r\n--${boundary}\r\ncontent-type: application/json\r\n\r\n${text}\r\n--${boundary}--`
    await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body })
  }
  const current = await readSession()
  if (current) await writeSession({ ...current, lastBackupAt: new Date().toISOString() })
  return status()
}

async function latest() {
  const file = await findBackup()
  return file ? { modifiedTime: file.modifiedTime, size: Number(file.size ?? 0) } : null
}

async function restore() {
  const file = await findBackup()
  if (!file) throw new Error('Ainda não existe backup no seu Google Drive.')
  if (Number(file.size ?? 0) > MAX_BACKUP_BYTES) throw new Error('O backup no Drive é maior que o limite esperado.')
  return (await drive(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).text()
}

async function signOut() {
  try { await SecureStorage.remove(SESSION_KEY) } catch { /* já não existe */ }
  memoryToken = null
  return status()
}

/** Faz o app Android expor a mesma interface de login que o Windows, para a tela funcionar igual. */
export function installAndroidGoogle() {
  window.desktopGoogle = {
    status,
    saveCredentials: async () => status(),
    forgetCredentials: async () => status(),
    signIn,
    cancelSignIn: async () => { cancelLogin?.(); return status() },
    signOut,
    backup,
    latest,
    restore,
  }
}
