import { displayOf, feeSplitFor, roundUpCents, spreadCents } from './fee'
import { formatDate, moneyFull } from './format'
import { settledIds } from './settled'
import { walletOf, type Wallet } from './wallet'
import { periodLabel } from '../services/installments'
import type { CardFee, FeeDisplay, Invoice, Transaction } from '../types'

/** Tudo de todas as carteiras, para somar a cobrança de cada pessoa. */
export interface Everything { wallets: Wallet[]; invoices: Invoice[]; transactions: Transaction[]; fees: CardFee[] }

export interface DebtPart {
  walletId: string; wallet: string; kind: Wallet['kind']
  invoiceId: string; invoice: string; period: string
  /** Quanto a pessoa deve nesta fatura (compras pendentes mais a taxa não paga). */
  amount: number
  /** Compras pendentes da pessoa nesta fatura, para a mensagem detalhada. */
  rows: Transaction[]
  fee: number
  /** Nome usado na taxa, para marcar a parte dela como paga. */
  feeName?: string
  /** Taxa discreta da pessoa nesta fatura (embutida ou arredondada). */
  display?: FeeDisplay | null
  /** Empréstimo: o que ainda vai vencer depois deste mês (só informação, não entra no total). */
  remaining?: { count: number; amount: number }
}
export interface PersonDebt { name: string; total: number; parts: DebtPart[] }
export interface UnifiedDebts { period: string; people: PersonDebt[]; total: number; wallets: number }

const cents = (value: number) => Math.round(Number(value) * 100)
const key = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

/**
 * O que cada pessoa deve no mês de vencimento `period`, somando todas as carteiras.
 * Cartão: só a fatura que vence nesse mês. Empréstimo: a parcela desse mês e as atrasadas;
 * as parcelas seguintes aparecem como saldo, sem entrar no total.
 */
export function unifiedDebts(data: Everything, period: string): UnifiedDebts {
  const people = new Map<string, { name: string; parts: DebtPart[] }>()
  const used = new Set<string>()
  for (const wallet of data.wallets) {
    const invoices = data.invoices.filter((invoice) => walletOf(invoice) === wallet.id)
    if (!invoices.length) continue
    const ids = new Set(invoices.map((invoice) => invoice.id))
    const rows = data.transactions.filter((row) => ids.has(row.invoice_id))
    const settled = settledIds(invoices, rows, data.fees)
    const loan = wallet.kind === 'loan'
    const due = invoices.filter((invoice) => !settled.has(invoice.id) && (loan ? invoice.period <= period : invoice.period === period))
      .sort((a, b) => a.period.localeCompare(b.period))
    const future = loan ? new Set(invoices.filter((invoice) => invoice.period > period).map((invoice) => invoice.id)) : new Set<string>()
    const byPerson = new Map<string, DebtPart[]>()
    for (const invoice of due) {
      const pending = new Map<string, { name: string; rows: Transaction[]; cents: number; fee: number; feeName?: string; display?: FeeDisplay | null }>()
      const slot = (name: string) => { const k = key(name); const hit = pending.get(k) ?? { name, rows: [], cents: 0, fee: 0 }; pending.set(k, hit); return hit }
      for (const row of rows) {
        if (row.invoice_id !== invoice.id || row.status === 'paid') continue
        const hit = slot(row.person?.name || 'Sem responsável')
        hit.rows.push(row); hit.cents += cents(row.amount)
      }
      const split = feeSplitFor(invoice.id, invoices, data.fees, rows)
      for (const share of split?.shares ?? []) {
        if (!share.paid && share.share > 0) { const hit = slot(share.name); hit.fee += cents(share.share); hit.cents += cents(share.share); hit.feeName = share.name; hit.display = displayOf(split!.fee, share.name) }
      }
      // Arredondado: o total da pessoa nesta fatura sobe até o próximo múltiplo de R$ 5.
      for (const item of pending.values()) if (item.display?.mode === 'rounded' && item.fee > 0) { const up = roundUpCents(item.cents); item.fee += up - item.cents; item.cents = up }
      for (const [k, item] of pending) {
        if (item.cents <= 0) continue
        used.add(wallet.id)
        const part: DebtPart = { walletId: wallet.id, wallet: wallet.name, kind: wallet.kind, invoiceId: invoice.id, invoice: invoice.label, period: invoice.period, amount: item.cents / 100, rows: item.rows.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)), fee: item.fee / 100, feeName: item.feeName, display: item.display }
        byPerson.set(k, [...(byPerson.get(k) ?? []), part])
        if (!people.has(k)) people.set(k, { name: item.name, parts: [] })
      }
    }
    for (const [k, parts] of byPerson) {
      if (loan && future.size) {
        const later = rows.filter((row) => future.has(row.invoice_id) && row.status !== 'paid' && key(row.person?.name || 'Sem responsável') === k)
        if (later.length) parts[parts.length - 1].remaining = { count: later.length, amount: later.reduce((sum, row) => sum + cents(row.amount), 0) / 100 }
      }
      people.get(k)!.parts.push(...parts)
    }
  }
  const list = [...people.values()].filter((person) => person.parts.length)
    .map(({ name, parts }) => ({ name, parts, total: parts.reduce((sum, part) => sum + cents(part.amount), 0) / 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  return { period, people: list, total: list.reduce((sum, person) => sum + cents(person.total), 0) / 100, wallets: used.size }
}

export const findDebt = (debts: UnifiedDebts | null | undefined, name: string) => debts?.people.find((person) => key(person.name) === key(name))

const parcelOf = (part: DebtPart) => {
  const row = part.rows.find((item) => item.installment_count)
  return row ? `parcela ${row.installment_number}/${row.installment_count}` : ''
}
const remainingLine = (part: DebtPart) => part.remaining ? `depois desta, faltam ${part.remaining.count} (${moneyFull(part.remaining.amount)})` : ''

/** Agrupa as partes por carteira, na ordem em que aparecem. */
function byWallet(parts: DebtPart[]) {
  const groups = new Map<string, DebtPart[]>()
  for (const part of parts) groups.set(part.walletId, [...(groups.get(part.walletId) ?? []), part])
  return [...groups.values()]
}

export type UnifiedMode = 'total' | 'items'

/**
 * Mensagem de cobrança de todas as carteiras.
 * `total`: uma linha por carteira. `items`: cada compra, agrupada por carteira. O Pix, se tiver, vai separado.
 */
export function unifiedMessage(debt: PersonDebt, options: { mode?: UnifiedMode; period: string; pixSeparate?: boolean; credit?: number }): string {
  const word = debt.name.split(/\s+/)[0]
  const first = word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  const blocks = byWallet(debt.parts).map((parts) => {
    const head = parts[0]
    const sum = parts.reduce((acc, part) => acc + cents(part.amount), 0) / 100
    const last = parts[parts.length - 1]
    if (options.mode !== 'items') {
      const extra = head.kind === 'loan' ? [parts.length > 1 ? `${parts.length} parcelas` : parcelOf(last), remainingLine(last)].filter(Boolean).join('; ') : ''
      return `• ${head.wallet}: ${moneyFull(sum)}${extra ? ` (${extra})` : ''}`
    }
    const lines = parts.flatMap((part) => {
      const hidden = part.fee > 0 ? part.display ?? null : null
      if (hidden?.style === 'total') return []
      // Diluída: cada compra leva a sua parte da taxa e a soma bate com a parte desta fatura.
      const values = hidden?.style === 'spread' && part.rows.length ? spreadCents(part.rows.map((row) => cents(row.amount)), cents(part.amount)) : part.rows.map((row) => cents(row.amount))
      return [
        ...part.rows.map((row, i) => `  - ${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count && !row.description.includes(`${row.installment_number}/${row.installment_count}`) ? ` (${row.installment_number}/${row.installment_count})` : ''}: ${moneyFull(values[i] / 100)}`),
        ...(part.fee > 0 && !hidden ? [`  - Taxa de uso do cartão: ${moneyFull(part.fee)}`] : []),
      ]
    })
    const tail = head.kind === 'loan' && last.remaining ? [`  (${remainingLine(last)})`] : []
    const note = parts.some((part) => part.fee > 0 && part.display?.style === 'note') ? ' (inclui os custos do cartão)' : ''
    return [`*${head.wallet}*: ${moneyFull(sum)}${note}`, ...lines, ...tail].join('\n')
  })
  const credit = Math.min(cents(options.credit ?? 0), cents(debt.total)) / 100
  const creditLine = credit > 0 ? `\n• Crédito (pagou a mais antes): -${moneyFull(credit)}` : ''
  return `Oi ${first}! Segue o que vence em ${periodLabel(options.period)}:\n\n${blocks.join(options.mode === 'items' ? '\n\n' : '\n')}${creditLine}\n\nTotal: ${moneyFull((cents(debt.total) - cents(credit)) / 100)}${options.pixSeparate ? '\n\nO Pix com o total vai na próxima mensagem.' : ''}`
}

/** Ids e taxas para marcar tudo da pessoa como pago de uma vez. */
export function settleTargets(debt: PersonDebt) {
  return {
    rowIds: debt.parts.flatMap((part) => part.rows.map((row) => row.id)),
    fees: debt.parts.filter((part) => part.fee > 0 && part.feeName).map((part) => ({ invoice_id: part.invoiceId, name: part.feeName! })),
  }
}

/** Saldo de crédito por pessoa (nome sem diferenciar maiúsculas). */
export function creditBalance(entries: Array<{ person: string; amount: number }>, name: string) {
  return Math.max(0, entries.filter((entry) => key(entry.person) === key(name)).reduce((sum, entry) => sum + cents(entry.amount), 0) / 100)
}
