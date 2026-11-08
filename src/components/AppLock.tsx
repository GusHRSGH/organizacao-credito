import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon, Logo } from './Icon'
import { authenticate, lockEnabled } from '../lib/lock'
import { isNative, watchResume } from '../lib/native'

const AWAY_LIMIT_MS = 20_000

/** Cobre o app com uma tela de bloqueio (biometria ou PIN do aparelho) ao abrir e depois de um tempo em segundo plano. */
export default function AppLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => isNative && lockEnabled())
  const [failed, setFailed] = useState(false)

  const unlock = useCallback(async () => {
    setFailed(false)
    if (await authenticate('Desbloquear o app')) setLocked(false)
    else setFailed(true)
  }, [])

  useEffect(() => { if (locked) void unlock() }, [locked, unlock])
  useEffect(() => watchResume((away) => { if (lockEnabled() && away > AWAY_LIMIT_MS) setLocked(true) }), [])

  return <>
    {children}
    {locked && <div className="lock-screen" role="dialog" aria-modal="true" aria-label="App bloqueado">
      <Logo size={72} />
      <h1>Organização do Crédito</h1>
      <p>{failed ? 'Não foi possível confirmar. Tente de novo.' : 'Confirme que é você para continuar.'}</p>
      <button className="primary-button" onClick={() => void unlock()}><Icon name="check" size={18} />Desbloquear</button>
    </div>}
  </>
}
