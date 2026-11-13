import { useMemo, useState } from 'react'
import { parseMoney } from '../lib/quickEntry'
import { suggestSettlement } from '../lib/settle'
import { formatDate, moneyFull } from '../lib/format'
import type { Transaction } from '../types'

interface Props {
  name: string
  rows: Transaction[]
  onConfirm: (paidIds: string[]) => Promise<void> | void
  onCancel: () => void
}

const KIND_LABEL = { exata: 'Fecha certinho', perto: 'Chega perto', antigas: 'Pelas mais antigas' } as const

/** Painel "Pagou um valor": o usuário digita o que a pessoa mandou e o robô sugere o que ficou pendente. */
export default function SettleByAmount({ name, rows, onConfirm, onCancel }: Props) {
  const open = useMemo(() => rows.filter((row) => row.status !== 'paid'), [rows])
  const owed = open.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100
  const [raw, setRaw] = useState('')
  const [choice, setChoice] = useState(0)
  const value = parseMoney(raw)
  const options = useMemo(() => (value ? suggestSettlement(open.map((row) => ({ id: row.id, amount: Number(row.amount), date: row.occurred_on, group: row.installment_group })), value) : []), [open, value])
  const picked = options[Math.min(choice, options.length - 1)]
  const byId = new Map(open.map((row) => [row.id, row]))
  const line = (row: Transaction) => `${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''} · ${moneyFull(Number(row.amount))}`

  return <div className="settle-panel" role="group" aria-label={`Pagou um valor, ${name}`}>
    <label className="field"><span>Quanto {name.split(/\s+/)[0]} pagou? (deve {moneyFull(owed)})</span>
      <input inputMode="decimal" placeholder="Ex.: 1600" value={raw} onChange={(event) => { setRaw(event.target.value); setChoice(0) }} aria-label="Valor pago" autoFocus /></label>
    {raw && value === null && <p className="muted">Não entendi esse valor. Digite algo como 1600 ou 1.600,50.</p>}
    {picked && value !== null && <>
      {picked.leftIds.length === 0
        ? <p>Cobre tudo: {open.length} {open.length === 1 ? 'lançamento' : 'lançamentos'} viram pagos{picked.diff < 0 ? ` e sobram ${moneyFull(-picked.diff)} de crédito` : ''}.</p>
        : <>
          <p>Faltam <b>{moneyFull(owed - value)}</b>. Achei estes para ficarem pendentes:</p>
          <div className="settle-options" role="radiogroup" aria-label="Sugestões do robô">
            {options.map((option, index) => <label key={index} className={`settle-option${index === choice ? ' on' : ''}`}>
              <input type="radio" name="settle" checked={index === choice} onChange={() => setChoice(index)} />
              <span><b>{KIND_LABEL[option.kind]}</b>: ficam pendentes {moneyFull(option.leftTotal)}
                <small>{option.leftIds.map((id) => byId.get(id)).filter((row): row is Transaction => !!row).map(line).join(' | ')}</small></span>
            </label>)}
          </div>
          {picked.diff !== 0 && <p className="settle-diff" role="alert">A conta não fecha: os lançamentos pagos somam {moneyFull(picked.paidTotal)} e {name.split(/\s+/)[0]} mandou {moneyFull(value)}. Diferença de {moneyFull(Math.abs(picked.diff))} {picked.diff > 0 ? 'a mais marcada como paga' : 'a menos, que fica como crédito'}. Confirma assim mesmo?</p>}
        </>}
      <div className="button-row">
        <button className="primary-button" onClick={() => void onConfirm(picked.paidIds)}>{picked.diff !== 0 ? 'Confirmar com a diferença' : `Marcar ${picked.paidIds.length} como ${picked.paidIds.length === 1 ? 'pago' : 'pagos'}`}</button>
        <button className="text-button" onClick={onCancel}>Cancelar</button>
      </div>
    </>}
    {!picked && <div className="button-row"><button className="text-button" onClick={onCancel}>Cancelar</button></div>}
  </div>
}
