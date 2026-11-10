import { detectSubscriptions, keyOf, type Subscription } from './watch'
import type { Invoice, Transaction } from '../types'

export interface Forecast {
  period: string
  /** Já lançado na fatura (parcelas e o que você adiantou). */
  committed: number
  /** Assinaturas ativas que ainda não foram lançadas nessa fatura. */
  missingSubs: Subscription[]
  subsTotal: number
  /** Média dos gastos "soltos" das últimas faturas, menos o que já foi lançado desse tipo. */
  variable: number
  total: number
  basedOn: number
}

const cents = (v: number) => Math.round(Number(v) * 100)

/** Estima a fatura `period` (a que está aberta): o que já está lançado + assinaturas que vão repetir + a média do dia a dia. */
export function forecastFor(transactions: Transaction[], allInvoices: Invoice[], period: string): Forecast | null {
  const before = allInvoices.filter((item) => item.period < period).sort((a, b) => a.period.localeCompare(b.period))
  if (!before.length) return null
  const target = allInvoices.find((item) => item.period === period)
  const subs = detectSubscriptions(transactions, before)
  const subKeys = new Set(subs.map((s) => s.key))
  const rowsOf = (id: string) => transactions.filter((row) => row.invoice_id === id)

  const posted = target ? rowsOf(target.id) : []
  const postedKeys = new Set(posted.map((row) => keyOf(row.description)))
  const committed = posted.reduce((sum, row) => sum + cents(row.amount), 0)
  const missingSubs = subs.filter((s) => s.active && !postedKeys.has(s.key))
  const subsTotal = missingSubs.reduce((sum, s) => sum + cents(s.monthly), 0)

  const loose = (row: Transaction) => !row.installment_group && !subKeys.has(keyOf(row.description))
  const history = before.slice(-3)
  const averages = history.map((item) => rowsOf(item.id).filter(loose).reduce((sum, row) => sum + cents(row.amount), 0))
  const avg = averages.reduce((a, b) => a + b, 0) / averages.length
  const postedLoose = posted.filter(loose).reduce((sum, row) => sum + cents(row.amount), 0)
  const variable = Math.max(0, Math.round(avg) - postedLoose)

  return { period, committed: committed / 100, missingSubs, subsTotal: subsTotal / 100, variable: variable / 100, total: (committed + subsTotal + variable) / 100, basedOn: history.length }
}
