/** Faixa da fatura quitada com o botão de apagar. */
export default function SettledBar({ onRemove }: { onRemove: () => void }) {
  return <div className="settled-line" role="status"><span className="settled-badge">✓ Quitada</span><span>Todo mundo pagou esta fatura.</span>
    <button className="secondary-button danger-soft" onClick={onRemove}>Apagar fatura</button></div>
}
