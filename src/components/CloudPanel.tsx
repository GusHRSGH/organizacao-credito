import { Icon } from './Icon'
import { Panel } from './ui'
import CloudLogin from './CloudLogin'
import type { CloudState } from '../hooks/useCloud'
import { messageOf } from '../lib/format'

interface Props {
  cloud: CloudState
  notify: (kind: 'notice' | 'error', text: string) => void
  onLegal: () => void
}

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function CloudPanel({ cloud, notify, onLegal }: Props) {
  const { session, status, lastSyncAt, conflict } = cloud

  async function remove() {
    if (!window.confirm('Excluir sua conta e os dados que estão na nuvem? Não dá para desfazer. Os dados guardados neste aparelho continuam aqui.')) return
    try { await cloud.deleteAccount(); notify('notice', 'Conta excluída. Os dados deste aparelho continuam aqui.') } catch (cause) { notify('error', messageOf(cause)) }
  }

  if (!session) return <Panel icon="cloud" title="Conta na nuvem" subtitle="Entre com o e-mail para guardar seus dados com segurança e usar em outros aparelhos. É opcional.">
    <CloudLogin api={cloud.api} />
    <p className="hint">Ao entrar, você concorda com os <button className="link-button" onClick={onLegal}>termos de uso e a privacidade</button>.</p>
  </Panel>

  return <Panel icon="cloud" title="Conta na nuvem" subtitle="Seus dados ficam numa área só sua e sincronizam sozinhos quando você mexe neles.">
    <p className="cloud-line"><Icon name="user" size={16} /><b>{session.user.email}</b></p>
    {conflict ? <div className="cloud-conflict" role="alert">
      <b>Este aparelho e a nuvem têm dados diferentes.</b>
      <p className="hint">Na nuvem: {conflict.cloudTransactions} lançamentos, salvos em {when(conflict.cloudAt)}. Escolha qual manter; o outro lado fica guardado nas cópias automáticas deste aparelho.</p>
      <div className="button-row">
        <button className="primary-button" onClick={() => void cloud.keepThisDevice()}>Manter os deste aparelho</button>
        <button className="secondary-button" onClick={() => void cloud.keepCloud()}>Usar os da nuvem</button>
      </div>
    </div> : <p className="hint">{status === 'syncing' ? 'Sincronizando…' : status === 'error' ? 'Não foi possível sincronizar agora. Vamos tentar de novo na próxima alteração.' : lastSyncAt ? `Sincronizado em ${when(lastSyncAt)}.` : 'Tudo certo.'}</p>}
    <div className="button-row">
      <button className="secondary-button" disabled={status === 'syncing' || !!conflict} onClick={() => void cloud.syncNow()}><Icon name="repeat" size={16} />Sincronizar agora</button>
      <button className="secondary-button" onClick={() => void cloud.signOut()}>Sair da conta</button>
      <button className="danger-button" onClick={() => void remove()}><Icon name="trash" size={16} />Excluir minha conta</button>
    </div>
    <p className="hint"><button className="link-button" onClick={onLegal}>Termos de uso e privacidade</button></p>
  </Panel>
}
