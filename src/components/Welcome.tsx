import { useState } from 'react'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import type { CloudState } from '../hooks/useCloud'
import CloudLogin from './CloudLogin'
import type { Theme } from '../lib/theme'
import { GoogleLogo, GoogleSetup } from './GoogleAccount'
import { Icon, Logo } from './Icon'

interface Props {
  google: GoogleAccount
  cloud: CloudState
  theme: Theme
  onToggleTheme: () => void
  onGuest: () => void
  alert: { kind: 'notice' | 'error'; text: string } | null
  onDismissAlert: () => void
}

export default function Welcome({ google, cloud, theme, onToggleTheme, onGuest, alert, onDismissAlert }: Props) {
  const { available, status, busy } = google
  const [setup, setSetup] = useState(false)
  const [email, setEmail] = useState(false)

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
      <p className="welcome-lead">Acompanhe suas faturas e entenda para onde vai o seu dinheiro. Entre com o e-mail para guardar uma cópia segura na nuvem, ou comece sem conta.</p>

      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={onDismissAlert}>Fechar</button></div>}

      {email ? <CloudLogin api={cloud.api} onCancel={() => setEmail(false)} /> : setup ? <div className="welcome-setup">
        <GoogleSetup google={google} onSaved={() => void afterSetup()} onCancel={() => setSetup(false)} />
      </div> : <>
        <div className="welcome-actions">
          <button className="primary-button wide" disabled={busy} onClick={() => setEmail(true)}><Icon name="user" size={16} />Entrar com e-mail</button>
          {available && <button className="google-button wide" disabled={busy || !status} onClick={() => void withGoogle()}>
            <GoogleLogo />{busy ? 'Aguardando o navegador…' : 'Backup no Google Drive'}
          </button>}
          {busy && <button className="text-button" onClick={() => void google.cancelSignIn()}>Cancelar</button>}
          <div className="divider"><span>ou</span></div>
          <button className="secondary-button wide" disabled={busy} onClick={onGuest}>Continuar sem conta</button>
        </div>
        <ul className="welcome-points">
          <li><Icon name="check" size={16} />Sem senha: você recebe um código no e-mail</li>
          <li><Icon name="check" size={16} />Seus dados ficam também neste aparelho e funcionam sem internet</li>
          <li><Icon name="check" size={16} />Sem conta, tudo funciona igual e você entra depois em Dados</li>
        </ul>
      </>}
    </section>
  </main>
}
