import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { authenticate, lockAvailable, lockEnabled, setLockEnabled } from '../lib/lock'
import { isNative } from '../lib/native'
import { Panel } from './ui'

/** Bloqueio do app por biometria ou PIN do aparelho (só no Android). */
export default function SecurityPanel({ notify }: { notify: (kind: 'notice' | 'error', text: string) => void }) {
  const [on, setOn] = useState(lockEnabled)
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => { if (isNative) void lockAvailable().then(setAvailable) }, [])
  if (!isNative) return null

  async function toggle() {
    if (on) { if (!(await authenticate('Desativar o bloqueio'))) return; setLockEnabled(false); setOn(false); notify('notice', 'Bloqueio desativado.'); return }
    if (!(await authenticate('Ativar o bloqueio do app'))) { notify('error', 'Não foi possível confirmar. O bloqueio não foi ativado.'); return }
    setLockEnabled(true); setOn(true); notify('notice', 'Bloqueio ativado. O app pede biometria ou PIN ao abrir.')
  }

  return <Panel title="Segurança" subtitle="Proteja seus dados financeiros neste aparelho">
    {available === false
      ? <p className="empty">Cadastre uma digital, rosto ou PIN nas configurações do Android para usar o bloqueio.</p>
      : <div className="button-row"><button className={on ? 'secondary-button' : 'primary-button'} onClick={() => void toggle()} disabled={available === null}><Icon name="lock" size={16} />{on ? 'Desativar bloqueio' : 'Bloquear com biometria ou PIN'}</button>
        <span className="hint">{on ? 'Ativado: pede para desbloquear ao abrir e depois de 20 segundos fora do app.' : 'Pede digital, rosto ou o PIN do aparelho ao abrir o app.'}</span></div>}
  </Panel>
}

/** Botão para procurar uma versão nova do app agora. */
export function UpdatePanel({ onCheck }: { onCheck: () => void }) {
  if (!isNative) return null
  return <Panel title="Atualização do app" subtitle="O app procura versões novas sozinho a cada poucas horas."><div className="button-row"><button className="secondary-button" onClick={onCheck}><Icon name="download" size={16} />Procurar atualização agora</button></div></Panel>
}
