import { useState } from 'react'
import MonthPicker from './MonthPicker'
import { closingDate, dueDate, readCard } from '../lib/card'
import { formatDate } from '../lib/format'
import { currentPeriod, periodLabel } from '../services/installments'

interface Props { existing: string[]; onCreate: (period: string) => void; onClose: () => void; busy: boolean }

/** Criar a fatura de qualquer mês, passado ou futuro. */
export default function NewInvoiceDialog({ existing, onCreate, onClose, busy }: Props) {
  const [period, setPeriod] = useState(currentPeriod())
  const card = readCard()
  const exists = existing.includes(period)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="Nova fatura">
      <h2>Nova fatura</h2>
      <p className="hint">Escolha o mês em que a fatura <b>vence</b>. Pode ser de meses passados (para organizar o histórico) ou futuros.</p>
      <MonthPicker value={period} onChange={setPeriod} existing={existing} />
      <p className="hint">{exists ? `A fatura de ${periodLabel(period)} já existe.` : card ? `Fatura de ${periodLabel(period)}: fecha em ${formatDate(closingDate(period, card))} e vence em ${formatDate(dueDate(period, card))}.` : `Será criada a fatura de ${periodLabel(period)}.`}</p>
      <div className="button-row"><button className="primary-button" disabled={busy || exists} onClick={() => onCreate(period)}>Criar fatura de {periodLabel(period)}</button><button className="text-button" onClick={onClose}>Cancelar</button></div>
    </div>
  </div>
}
