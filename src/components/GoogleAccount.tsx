import { useState } from 'react'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import { messageOf } from '../lib/format'
import type { LocalSource } from '../services/localSource'
import { Icon } from './Icon'
import { Panel } from './ui'

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca')


export function GoogleSetup({ google, onSaved, onCancel, openGuide = true }: { google: GoogleAccount; onSaved?: () => void; onCancel?: () => void; openGuide?: boolean }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const { busy } = google

  async function save() {
    if (await google.saveCredentials(clientId, clientSecret)) { setClientSecret(''); onSaved?.() }
  }

  return <>
    <details className="guide" open={openGuide}>
      <summary>Como criar a chave gratuita do Google (uma vez só, uns 10 minutos)</summary>
      <ol>
        <li>Acesse <b>console.cloud.google.com</b>, entre com sua conta e crie um projeto (qualquer nome).</li>
        <li>Em <b>APIs e serviços › Biblioteca</b>, procure <b>Google Drive API</b> e clique em <b>Ativar</b>.</li>
        <li>Em <b>Google Auth Platform</b>, configure a tela de permissão: nome do app, seu e-mail, público <b>Externo</b>.</li>
        <li>Em <b>Acesso a dados</b>, adicione o escopo <b>.../auth/drive.appdata</b>. Ele só dá acesso a uma pasta oculta do próprio app.</li>
        <li>Em <b>Público-alvo</b>, clique em <b>Publicar app</b>. Sem isso a sessão expira a cada 7 dias. Não precisa de verificação do Google para este escopo.</li>
        <li>Em <b>Clientes › Criar cliente</b>, escolha <b>App para computador</b>. Copie o <b>ID do cliente</b> e a <b>Chave secreta do cliente</b> e cole abaixo.</li>
      </ol>
    </details>
    <form className="google-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label>ID do cliente<input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="123456-abc.apps.googleusercontent.com" autoComplete="off" spellCheck={false} required /></label>
      <label>Chave secreta do cliente<input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="GOCSPX-…" autoComplete="off" required /></label>
      <div className="button-row"><button className="primary-button" disabled={busy}>Salvar chave</button>{onCancel && <button type="button" className="text-button" onClick={onCancel}>Cancelar</button>}</div>
    </form>
    <p className="hint">A chave fica guardada só neste computador, criptografada pelo Windows. Ela não vai para o GitHub nem para o Drive.</p>
  </>
}

interface Props {
  google: GoogleAccount
  local: LocalSource | null
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function GoogleAccountPanel({ google, local, onChanged, notify }: Props) {
  const { status, available, busy } = google
  const [editing, setEditing] = useState(false)

  async function restore() {
    if (!local) return
    try {
      const info = await google.latest()
      if (!info) { notify('error', 'Ainda não existe backup no seu Google Drive.'); return }
      if (!window.confirm(`Restaurar o backup de ${when(info.modifiedTime)} substitui TODOS os dados atuais do banco local. Continuar?`)) return
      const parsed: unknown = JSON.parse(await google.restoreText())
      await local.restoreBackup(parsed)
      await onChanged()
      notify('notice', 'Backup do Google Drive restaurado.')
    } catch (cause) { notify('error', cause instanceof SyntaxError ? 'O backup no Drive está corrompido.' : messageOf(cause)) }
  }

  if (!available) {
    return <Panel title="Conta Google" subtitle="Login e backup no seu Google Drive">
      <p className="empty">Disponível no aplicativo para Windows. No navegador, use o backup em arquivo.</p>
    </Panel>
  }
  if (!status) return <Panel title="Conta Google"><p className="empty">Carregando…</p></Panel>

  const needsSetup = !status.configured || editing

  return <Panel title="Conta Google" subtitle="Entre com sua conta e mantenha uma cópia dos dados no seu Google Drive. É gratuito.">
    {needsSetup ? <>
      <GoogleSetup google={google} openGuide={!status.configured} onCancel={editing ? () => setEditing(false) : undefined} onSaved={() => setEditing(false)} />
    </> : !status.signedIn ? <>
      <div className="button-row">
        <button className="google-button" disabled={busy} onClick={() => void google.signIn()}><GoogleLogo />{busy ? 'Aguardando o navegador…' : 'Entrar com Google'}</button>
        <button className="text-button" onClick={() => setEditing(true)}>Trocar chave</button>
      </div>
      <p className="hint">O navegador abre para você escolher a conta. Depois é só voltar ao app.</p>
    </> : <>
      <div className="account-row">
        {status.picture ? <img className="account-avatar" src={status.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(status.email ?? '?')[0].toUpperCase()}</span>}
        <div><b>{status.name ?? status.email}</b><small>{status.email}</small></div>
      </div>
      <label className="check-row"><input type="checkbox" checked={google.autoBackup} onChange={(event) => google.setAutoBackup(event.target.checked)} />Guardar backup automático no Drive a cada alteração</label>
      <p className="hint">Último backup: {when(status.lastBackupAt)}</p>
      <div className="button-row">
        <button className="primary-button" disabled={busy || !local} onClick={() => void google.backupNow()}><Icon name="upload" size={16} />Fazer backup agora</button>
        <button className="secondary-button" disabled={busy || !local} onClick={() => void restore()}><Icon name="download" size={16} />Restaurar do Drive</button>
        <button className="text-button" disabled={busy} onClick={() => void google.signOut()}>Sair da conta</button>
      </div>
    </>}
  </Panel>
}
