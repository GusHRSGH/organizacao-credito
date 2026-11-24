/** Faixa da fatura quitada (ou vazia) com o botão de apagar. */
export default function SettledBar({ onRemove, empty = false }: { onRemove: () => void; empty?: boolean }) {
  return <div className="settled-line" role="status">
    {empty ? <><span className="settled-badge empty">Vazia</span><span>Esta fatura não tem lançamentos.</span></> : <><span className="settled-badge">✓ Quitada</span><span>Todo mundo pagou esta fatura.</span></>}
    <button className="secondary-button danger-soft" onClick={onRemove}>Apagar fatura</button></div>
}
