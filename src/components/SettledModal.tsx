import { money } from '../lib/format'
import type { SettledSummary } from '../lib/settled'

interface Props { summary: SettledSummary; celebrate: boolean; onShare: () => void; onClose: () => void }

/** Mês quitado: comemoração (na hora em que quita) ou o resumo, com a mensagem pro grupo. */
export default function SettledModal({ summary, celebrate, onShare, onClose }: Props) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`modal settled-modal${celebrate ? ' party' : ''}`} role="dialog" aria-modal="true" aria-label={`${summary.label} quitada`}>
      {celebrate && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.12}s` }} />)}</div>}
      <h2>{celebrate ? `🎉 ${summary.label} quitada!` : `${summary.label}: resumo`}</h2>
      <p className="muted">{celebrate ? `Todo mundo pagou ${summary.fee > 0 ? 'as compras e a taxa' : 'as compras'}. Mês fechado.` : 'Fatura quitada: todo mundo pagou.'}</p>
      <table className="data-table settled-table">
        <thead><tr><th>Pessoa</th><th>Compras</th><th>Taxa</th><th>Pagou</th></tr></thead>
        <tbody>{summary.lines.map((line) => <tr key={line.name}><td>{line.name}</td><td>{money(line.spent)}</td><td>{line.fee ? money(line.fee) : '–'}</td><td><b>{money(line.total)}</b></td></tr>)}</tbody>
        <tfoot><tr><td>Total</td><td>{money(summary.spent)}</td><td>{summary.fee ? money(summary.fee) : '–'}</td><td><b>{money(summary.total)}</b></td></tr></tfoot>
      </table>
      <div className="modal-actions"><button className="text-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={onShare}>Enviar mensagem pro grupo</button></div>
    </div>
  </div>
}
