import { useMemo, useState } from 'react'
import { parseMoney } from '../lib/quickEntry'
import { suggestSettlement } from '../lib/settle'
import { formatDate, moneyFull } from '../lib/format'
import type { Transaction } from '../types'

interface Props {
  name: string
  rows: Transaction[]
  /** Taxa de uso do cartão ainda não paga: as compras são quitadas primeiro, a taxa por último. */
  fee?: number
  onConfirm: (paidIds: string[], feePaid: boolean) => Promise<void> | void
  onCancel: () => void
}

const KIND_LABEL = { exata: 'Fecha certinho', perto: 'Chega perto', antigas: 'Pelas mais antigas' } as const

/** Painel "Pagou um valor": o usuário digita o que a pessoa mandou e o robô sugere o que ficou pendente. */
export default function SettleByAmount({ name, rows, fee = 0, onConfirm, onCancel }: Props) {
  const open = useMemo(() => rows.filter((row) => row.status !== 'paid'), [rows])
  const rowsOwed = open.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100
  const owed = (Math.round(rowsOwed * 100) + Math.round(fee * 100)) / 100
  const [raw, setRaw] = useState('')
  const [choice, setChoice] = useState(0)
  const value = parseMoney(raw)
  // Compras primeiro: se o valor cobre todas, o que sobra vai para a taxa.
  const coversRows = value !== null && value > 0 && value >= rowsOwed - 0.005
  const extra = coversRows ? Math.round((value! - rowsOwed) * 100) / 100 : 0
  const feePaid = coversRows && fee > 0 && extra >= fee - 0.005
  const credit = coversRows ? Math.round((extra - (feePaid ? fee : 0)) * 100) / 100 : 0
  const options = useMemo(() => (value && !coversRows ? suggestSettlement(open.map((row) => ({ id: row.id, amount: Number(row.amount), date: row.occurred_on, group: row.installment_group })), value) : []), [open, value, coversRows])
  const picked = options[Math.min(choice, options.length - 1)]
  const byId = new Map(open.map((row) => [row.id, row]))
  const line = (row: Transaction) => `${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''} · ${moneyFull(Number(row.amount))}`

  return <div className="settle-panel" role="group" aria-label={`Pagou um valor, ${name}`}>
    <label className="field"><span>Quanto {name.split(/\s+/)[0]} pagou? (deve {moneyFull(owed)})</span>
      <input inputMode="decimal" placeholder="Ex.: 1600" value={raw} onChange={(event) => { setRaw(event.target.value); setChoice(0) }} aria-label="Valor pago" autoFocus /></label>
    {raw && value === null && <p className="muted">Não entendi esse valor. Digite algo como 1600 ou 1.600,50.</p>}
    {coversRows && <>
      <p>Cobre as compras: {open.length} {open.length === 1 ? 'lançamento vira pago' : 'lançamentos viram pagos'}.
        {fee > 0 ? feePaid ? ' A taxa também fica paga.' : ` A taxa (${moneyFull(fee)}) continua pendente${extra > 0 ? `: os ${moneyFull(extra)} que sobram não cobrem ela toda` : ''}.` : ''}
        {credit > 0.004 && (feePaid || !fee) ? ` Sobram ${moneyFull(credit)} de crédito.` : ''}</p>
      <div className="button-row">
        <button className="primary-button" onClick={() => void onConfirm(open.map((row) => row.id), feePaid)}>Marcar como pago</button>
        <button className="text-button" onClick={onCancel}>Cancelar</button>
      </div>
    </>}
    {!coversRows && picked && value !== null && <>
      {fee > 0 && <p className="muted">A taxa ({moneyFull(fee)}) fica pendente: as compras vêm primeiro.</p>}
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
        <button className="primary-button" onClick={() => void onConfirm(picked.paidIds, false)}>{picked.diff !== 0 ? 'Confirmar com a diferença' : `Marcar ${picked.paidIds.length} como ${picked.paidIds.length === 1 ? 'pago' : 'pagos'}`}</button>
        <button className="text-button" onClick={onCancel}>Cancelar</button>
      </div>
    </>}
    {!coversRows && !picked && <div className="button-row"><button className="text-button" onClick={onCancel}>Cancelar</button></div>}
  </div>
}
