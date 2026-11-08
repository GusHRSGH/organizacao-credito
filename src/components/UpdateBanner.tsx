import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { messageOf } from '../lib/format'
import { isNative } from '../lib/native'
import { checkForUpdate, installUpdate, skipUpdate, type UpdateInfo } from '../lib/updater'

/** Aviso de nova versão do app Android, com baixar e instalar num toque. */
export default function UpdateBanner({ manualSignal }: { manualSignal: number }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState('')

  const look = useCallback(async (force: boolean) => {
    try { setError(''); setInfo(await checkForUpdate(force)) } catch (cause) { if (force) setError(messageOf(cause)) }
  }, [])

  useEffect(() => { if (isNative) void look(false) }, [look])
  useEffect(() => { if (manualSignal > 0) void look(true) }, [manualSignal, look])

  async function update() {
    if (!info) return
    setError(''); setPercent(0)
    try { await installUpdate(info, setPercent) } catch (cause) { setError(messageOf(cause)) } finally { setPercent(null) }
  }

  if (!isNative || (!info && !error)) return null
  return <div className="restore-offer update-banner" role="status">
    <span>{error ? error : <>Nova versão <b>{info!.version}</b> disponível.{percent !== null ? ` Baixando… ${percent}%` : ''}</>}</span>
    {info && <div className="button-row">
      <button className="primary-button" onClick={() => void update()} disabled={percent !== null}><Icon name="download" size={16} />Atualizar</button>
      <button className="text-button" onClick={() => { skipUpdate(info.build); setInfo(null) }} disabled={percent !== null}>Depois</button>
    </div>}
    {!info && <button className="text-button" onClick={() => setError('')}>Fechar</button>}
  </div>
}
