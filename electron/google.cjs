// Login com Google (OAuth para apps de computador, com PKCE) e backup no Google Drive.
// Tudo roda no processo principal: tokens nunca chegam à interface.
// Escopo drive.appdata = pasta oculta e exclusiva do app, sem acesso aos outros arquivos do Drive.
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata']
const BACKUP_NAME = 'organizacao-credito-backup.json'
const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000

function registerGoogle({ ipcMain, app, shell, safeStorage, isTrustedSender }) {
  const dir = () => app.getPath('userData')
  const credentialsFile = () => path.join(dir(), 'google-credentials.bin')
  const sessionFile = () => path.join(dir(), 'google-session.bin')

  function seal(value) {
    const text = JSON.stringify(value)
    return safeStorage.isEncryptionAvailable() ? Buffer.concat([Buffer.from('E'), safeStorage.encryptString(text)]) : Buffer.concat([Buffer.from('P'), Buffer.from(text)])
  }
  function unseal(buffer) {
    const body = buffer.subarray(1)
    return JSON.parse(buffer[0] === 69 ? safeStorage.decryptString(body) : body.toString('utf8'))
  }
  function readSealed(file) {
    try { return unseal(fs.readFileSync(file)) } catch { return null }
  }
  function writeSealed(file, value) {
    fs.mkdirSync(dir(), { recursive: true })
    fs.writeFileSync(file, seal(value), { mode: 0o600 })
  }
  const remove = (file) => { try { fs.unlinkSync(file) } catch { /* já não existe */ } }

  let memoryToken = null

  const credentials = () => readSealed(credentialsFile())
  const session = () => readSealed(sessionFile())

  function status() {
    const creds = credentials()
    const current = session()
    return {
      configured: !!(creds && creds.clientId && creds.clientSecret),
      signedIn: !!(current && current.refreshToken),
      email: current?.email ?? null,
      name: current?.name ?? null,
      picture: current?.picture ?? null,
      lastBackupAt: current?.lastBackupAt ?? null,
    }
  }

  async function postForm(url, params) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(googleError(body, 'Falha ao falar com o Google.'))
    return body
  }

  function googleError(body, fallback) {
    const code = body?.error
    if (code === 'invalid_client') return 'O Google não reconheceu o ID ou a chave do cliente. Confira os dois valores colados.'
    if (code === 'invalid_grant') return 'A sessão com o Google expirou. Entre de novo.'
    if (code === 'access_denied') return 'O acesso foi negado na tela do Google.'
    const message = body?.error_description || body?.error?.message || (typeof body?.error === 'string' ? body.error : '')
    return message ? `Google: ${message}` : fallback
  }

  const base64url = (buffer) => buffer.toString('base64url')

  function decodeIdToken(idToken) {
    try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) } catch { return {} }
  }

  async function signIn() {
    const creds = credentials()
    if (!creds?.clientId || !creds?.clientSecret) throw new Error('Cole o ID e a chave do cliente Google antes de entrar.')
    const verifier = base64url(crypto.randomBytes(48))
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    const state = base64url(crypto.randomBytes(16))

    const { code, redirectUri } = await new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        const port = server.address().port
        const url = new URL(request.url, 'http://127.0.0.1')
        if (url.pathname !== '/') { response.writeHead(404).end(); return }
        const failure = url.searchParams.get('error')
        const okState = url.searchParams.get('state') === state
        const received = url.searchParams.get('code')
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(`<!doctype html><meta charset="utf-8"><title>Organização do Crédito</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0a1124;color:#e8eeff"><div style="text-align:center"><h1>${received && okState && !failure ? 'Tudo certo!' : 'Não foi possível entrar'}</h1><p>${received && okState && !failure ? 'Pode fechar esta aba e voltar ao app.' : 'Volte ao app e tente de novo.'}</p></div>`)
        clearTimeout(timer)
        server.close()
        if (failure) reject(new Error(googleError({ error: failure }, 'O Google recusou o acesso.')))
        else if (!okState || !received) reject(new Error('Resposta do Google inválida. Tente novamente.'))
        else resolve({ code: received, redirectUri: `http://127.0.0.1:${port}` })
      })
      const timer = setTimeout(() => { server.close(); reject(new Error('Tempo esgotado. Tente entrar de novo.')) }, LOGIN_TIMEOUT_MS)
      server.on('error', (error) => { clearTimeout(timer); reject(error) })
      server.listen(0, '127.0.0.1', () => {
        const redirect = `http://127.0.0.1:${server.address().port}`
        const query = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' })
        void shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${query}`)
      })
    })

    const tokens = await postForm('https://oauth2.googleapis.com/token', { client_id: creds.clientId, client_secret: creds.clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    if (!tokens.refresh_token) throw new Error('O Google não devolveu a permissão de acesso contínuo. Remova o app em myaccount.google.com/permissions e tente de novo.')
    if (!String(tokens.scope || '').includes('drive.appdata')) throw new Error('Para guardar o backup, marque a permissão do Google Drive na tela de acesso.')
    const profile = decodeIdToken(tokens.id_token || '')
    memoryToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
    writeSealed(sessionFile(), { refreshToken: tokens.refresh_token, email: profile.email ?? null, name: profile.name ?? null, picture: profile.picture ?? null, lastBackupAt: null })
    return status()
  }

  async function accessToken() {
    if (memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken.value
    const creds = credentials()
    const current = session()
    if (!creds || !current?.refreshToken) throw new Error('Entre com o Google primeiro.')
    const tokens = await postForm('https://oauth2.googleapis.com/token', { client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: current.refreshToken, grant_type: 'refresh_token' })
    memoryToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
    return memoryToken.value
  }

  async function drive(url, init = {}) {
    const token = await accessToken()
    const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      if (response.status === 403 && body?.error?.errors?.[0]?.reason === 'accessNotConfigured') throw new Error('Ative a "Google Drive API" no seu projeto do Google Cloud.')
      throw new Error(googleError(body, `O Google Drive respondeu com erro ${response.status}.`))
    }
    return response
  }

  async function findBackup() {
    const query = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${BACKUP_NAME}' and trashed=false`, fields: 'files(id,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '1' })
    const body = await (await drive(`https://www.googleapis.com/drive/v3/files?${query}`)).json()
    return body.files?.[0] ?? null
  }

  async function backup(text) {
    if (typeof text !== 'string' || !text) throw new Error('Nada para guardar.')
    if (Buffer.byteLength(text) > MAX_BACKUP_BYTES) throw new Error('O backup passou do limite de 20 MB.')
    const existing = await findBackup()
    if (existing) {
      await drive(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: text })
    } else {
      const boundary = `oc${crypto.randomBytes(8).toString('hex')}`
      const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] })}\r\n--${boundary}\r\ncontent-type: application/json\r\n\r\n${text}\r\n--${boundary}--`
      await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body })
    }
    const current = session()
    const at = new Date().toISOString()
    if (current) writeSealed(sessionFile(), { ...current, lastBackupAt: at })
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

  function signOut() {
    remove(sessionFile())
    memoryToken = null
    return status()
  }

  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error('Origem não autorizada.')
      return fn(...args)
    })
  }

  handle('google:status', () => status())
  handle('google:save-credentials', (clientId, clientSecret) => {
    const id = String(clientId ?? '').trim()
    const secret = String(clientSecret ?? '').trim()
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('O ID do cliente deve terminar com .apps.googleusercontent.com.')
    if (secret.length < 10) throw new Error('A chave do cliente parece incompleta.')
    writeSealed(credentialsFile(), { clientId: id, clientSecret: secret })
    remove(sessionFile())
    memoryToken = null
    return status()
  })
  handle('google:forget-credentials', () => { remove(credentialsFile()); return signOut() })
  handle('google:sign-in', () => signIn())
  handle('google:sign-out', () => signOut())
  handle('google:backup', (text) => backup(text))
  handle('google:latest', () => latest())
  handle('google:restore', () => restore())
}

module.exports = { registerGoogle }
