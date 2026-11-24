import { useState, type FormEvent } from 'react'
import { moneyFull } from '../lib/format'
import { parseMoney } from '../lib/quickEntry'
import { loanCharge, type Loan } from '../lib/wallet'

interface Props {
  onCancel: () => void
  onSave: (name: string, loan: Loan) => Promise<void>
}

const thisMonth = () => new Date().toISOString().slice(0, 7)

/** Cadastro de empréstimo ou financiamento: a pessoa, a parcela, quantas faltam e a sua % extra. */
export default function LoanForm({ onCancel, onSave }: Props) {
  const [name, setName] = useState('')
  const [person, setPerson] = useState('')
  const [installment, setInstallment] = useState('')
  const [count, setCount] = useState('12')
  const [start, setStart] = useState(thisMonth)
  const [dueDay, setDueDay] = useState('10')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)

  const value = parseMoney(installment) ?? 0
  const pct = Number(extra.replace(',', '.')) || 0
  const parcels = Number(count) || 0
  const charge = loanCharge({ installment: value, extraPct: pct })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await onSave(name, { person: person.trim(), installment: value, count: parcels, start: `${start}-01`, dueDay: Number(dueDay), extraPct: pct })
    } finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <form className="modal" role="dialog" aria-modal="true" aria-label="Novo empréstimo" onSubmit={(event) => void submit(event)}>
      <h2>Novo empréstimo ou financiamento</h2>
      <p className="muted">Cada parcela vira um lançamento no mês dela, para você cobrar e marcar como pago igual a fatura.</p>
      <label>Nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Ex.: Empréstimo do carro" required /></label>
      <div className="modal-grid">
        <label>Quem paga<input value={person} onChange={(event) => setPerson(event.target.value)} maxLength={80} required /></label>
        <label>Valor da parcela (R$)<input value={installment} onChange={(event) => setInstallment(event.target.value)} inputMode="decimal" placeholder="520,00" required /></label>
        <label>Quantas parcelas faltam<input type="number" min={1} max={480} value={count} onChange={(event) => setCount(event.target.value)} required /></label>
        <label>Mês da próxima parcela<input type="month" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
        <label>Dia do vencimento<input type="number" min={1} max={31} value={dueDay} onChange={(event) => setDueDay(event.target.value)} required /></label>
        <label>Sua % extra (opcional)<input value={extra} onChange={(event) => setExtra(event.target.value)} inputMode="decimal" placeholder="0" /></label>
      </div>
      {value > 0 && parcels > 0 && <p className="loan-preview" aria-live="polite">
        {pct > 0 ? <>{moneyFull(value)} + {pct}% = <b>{moneyFull(charge)}</b> por parcela</> : <><b>{moneyFull(charge)}</b> por parcela</>}
        {' · '}{parcels}x, total {moneyFull(Math.round(charge * 100 * parcels) / 100)}
      </p>}
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={busy}>Criar empréstimo</button>
      </div>
    </form>
  </div>
}
