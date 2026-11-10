import { Component, type ErrorInfo, type ReactNode } from 'react'
import { getSource } from '../services/source'
import { downloadText, stamp } from '../services/exporters'

interface State { failed: boolean; saving: boolean; note: string }

/** Última rede de segurança: se algo quebrar, a pessoa não perde os dados nem fica com tela em branco. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, saving: false, note: '' }

  static getDerivedStateFromError(): Partial<State> { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Falha no app', error, info.componentStack) }

  private async saveData() {
    this.setState({ saving: true, note: '' })
    try {
      downloadText(`cadence-backup-${stamp()}.json`, JSON.stringify(await getSource().exportBackup()), 'application/json')
      this.setState({ note: 'Backup salvo.' })
    } catch { this.setState({ note: 'Não consegui ler os dados agora. Eles continuam guardados neste aparelho.' }) } finally { this.setState({ saving: false }) }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="center-screen"><section className="auth-card" role="alert">
      <h1>Algo deu errado</h1>
      <p>O app encontrou um problema inesperado. Seus dados continuam guardados neste aparelho. Tente recarregar.</p>
      <div className="button-row">
        <button className="primary-button" onClick={() => window.location.reload()}>Recarregar o app</button>
        <button className="secondary-button" disabled={this.state.saving} onClick={() => void this.saveData()}>Baixar um backup</button>
      </div>
      {this.state.note && <p className="hint" role="status">{this.state.note}</p>}
    </section></main>
  }
}
