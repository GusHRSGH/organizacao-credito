import { useEffect } from 'react'
import QuickAdd from './QuickAdd'
import type { ComponentProps } from 'react'
import { useBackHandler } from '../lib/native'

type QuickProps = Omit<ComponentProps<typeof QuickAdd>, 'signal'>

/** Linha rápida em tela cheia, aberta pelo botão + (ou pelo atalho da tela inicial) no celular. */
export default function QuickSheet({ open, onClose, ...quick }: QuickProps & { open: boolean; onClose: () => void }) {
  useBackHandler(open, onClose)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return <div className="quick-sheet" role="dialog" aria-modal="true" aria-label="Novo gasto">
    <div className="sheet-head"><h2>Novo gasto</h2><button className="text-button" onClick={onClose}>Concluir</button></div>
    <QuickAdd {...quick} signal={1} sheet />
  </div>
}
