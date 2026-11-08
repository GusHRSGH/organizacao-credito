import { useState } from 'react'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import type { Theme } from '../lib/theme'
import { GoogleLogo, GoogleSetup } from './GoogleAccount'
import { Icon, Logo } from './Icon'

interface Props {
  google: GoogleAccount
  theme: Theme
  onToggleTheme: () => void
  onGuest: () => void
  alert: { kind: 'notice' | 'error'; text: string } | null
  onDismissAlert: () => void
}

export default function Welcome({ google, theme, onToggleTheme, onGuest, alert, onDismissAlert }: Props) {
  const { available, status, busy } = google
  const [setup, setSetup] = useState(false)

  async function withGoogle() {
    onDismissAlert()
    if (!status?.configured) { setSetup(true); return }
    await google.signIn()
  }

  async function afterSetup() {
    setSetup(false)
    await google.signIn()
  }

  return <main className="welcome">
    <button className="theme-toggle welcome-theme" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
      <span key={theme} className="theme-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span>
    </button>
    <section className="welcome-card" aria-labelledby="welcome-title">
      <Logo size={72} />
      <h1 id="welcome-title">Organização do Crédito</h1>
      <p className="welcome-lead">Acompanhe suas faturas e guarde uma cópia segura dos dados no seu Google Drive.</p>

      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={onDismissAlert}>Fechar</button></div>}

      {setup ? <div className="welcome-setup">
        <GoogleSetup google={google} onSaved={() => void afterSetup()} onCancel={() => setSetup(false)} />
      </div> : <>
        <div className="welcome-actions">
          <button className="google-button wide" disabled={!available || busy || !status} onClick={() => void withGoogle()}>
            <GoogleLogo />{busy ? 'Aguardando o navegador…' : 'Continuar com Google'}
          </button>
          {busy && <button className="text-button" onClick={() => void google.cancelSignIn()}>Cancelar</button>}
          <div className="divider"><span>ou</span></div>
          <button className="secondary-button wide" disabled={busy} onClick={onGuest}>Continuar sem login</button>
        </div>
        {!available && <p className="hint center">O login com Google funciona no aplicativo para Windows.</p>}
        <ul className="welcome-points">
          <li><Icon name="check" size={16} />Backup automático na pasta oculta do seu Drive</li>
          <li><Icon name="check" size={16} />Seus dados continuam neste computador</li>
          <li><Icon name="check" size={16} />Sem login, tudo funciona do mesmo jeito e você entra depois em Dados e backup</li>
        </ul>
      </>}
    </section>
  </main>
}
