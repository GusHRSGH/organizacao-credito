import { useEffect } from 'react'
import { Icon } from './Icon'
import type { ChangelogEntry } from '../lib/changelog'

interface Props { entries: ChangelogEntry[]; onClose: () => void }

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Janela "Novidades": o que mudou na atualização, escrito pelo desenvolvedor. */
export default function WhatsNew({ entries, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal whatsnew" role="dialog" aria-modal="true" aria-label="Novidades do app">
      <div className="whatsnew-head"><span className="tour-icon"><Icon name="sparkle" size={24} /></span><div><h2>Novidades do app</h2><p className="hint">Notas do desenvolvedor</p></div></div>
      {entries.map((entry) => <section key={entry.n} className="whatsnew-entry">
        <h3>{entry.title}<small>{day(entry.date)}</small></h3>
        <ul>{entry.items.map((item) => <li key={item}><Icon name="check" size={15} />{item}</li>)}</ul>
      </section>)}
      <p className="hint">Gustavo R. Santana (Dev.)</p>
      <div className="modal-actions"><button className="primary-button" onClick={onClose}>Entendi</button></div>
    </div>
  </div>
}
