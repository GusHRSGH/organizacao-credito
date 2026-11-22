import { feeSplitFor } from './fee'
import { moneyFull } from './format'
import type { CardFee, Invoice, Transaction } from '../types'

/** Fatura quitada: tem lançamentos, todos pagos, e ninguém deve a taxa do cartão. */
export function isSettled(invoiceId: string, invoices: Invoice[], transactions: Transaction[], fees: CardFee[]): boolean {
  const rows = transactions.filter((row) => row.invoice_id === invoiceId)
  if (!rows.length || rows.some((row) => row.status !== 'paid')) return false
  const split = feeSplitFor(invoiceId, invoices, fees, transactions)
  return !split || split.shares.every((share) => share.paid || share.share <= 0)
}

export function settledIds(invoices: Invoice[], transactions: Transaction[], fees: CardFee[]): Set<string> {
  return new Set(invoices.filter((invoice) => isSettled(invoice.id, invoices, transactions, fees)).map((invoice) => invoice.id))
}

export interface SettledLine { name: string; spent: number; fee: number; total: number }
export interface SettledSummary { label: string; lines: SettledLine[]; spent: number; fee: number; total: number }

const cents = (value: number) => Math.round(Number(value) * 100)

/** Resumo do mês quitado: quanto cada um gastou, a taxa e o total que pagou. */
export function settledSummary(invoiceId: string, invoices: Invoice[], transactions: Transaction[], fees: CardFee[]): SettledSummary {
  const label = invoices.find((item) => item.id === invoiceId)?.label ?? 'Fatura'
  const spent = new Map<string, number>()
  for (const row of transactions.filter((item) => item.invoice_id === invoiceId)) {
    const name = row.person?.name || 'Sem responsável'
    spent.set(name, (spent.get(name) ?? 0) + cents(row.amount))
  }
  const split = feeSplitFor(invoiceId, invoices, fees, transactions)
  const feeOf = new Map((split?.shares ?? []).map((share) => [share.name, cents(share.share)]))
  const lines = [...new Set([...spent.keys(), ...feeOf.keys()])]
    .map((name) => { const s = spent.get(name) ?? 0; const f = feeOf.get(name) ?? 0; return { name, spent: s / 100, fee: f / 100, total: (s + f) / 100 } })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  const sum = (pick: (line: SettledLine) => number) => lines.reduce((acc, line) => acc + cents(pick(line)), 0) / 100
  return { label, lines, spent: sum((l) => l.spent), fee: sum((l) => l.fee), total: sum((l) => l.total) }
}

/** Mensagem pro grupo quando o mês fecha. */
export function settledMessage(summary: SettledSummary): string {
  const lines = summary.lines.map((line) => `• ${line.name}: ${moneyFull(line.total)}${line.fee > 0 ? ` (compras ${moneyFull(line.spent)} + taxa ${moneyFull(line.fee)})` : ''}`)
  return `${summary.label} quitada! Obrigado a todos 🎉\n\nResumo do mês:\n${lines.join('\n')}\n\nTotal: ${moneyFull(summary.total)}`
}

/**
 * Fatura que o app abre: a do mês atual ou a próxima que não está quitada.
 * Se todas daqui pra frente estiverem quitadas, a mais recente em aberto; se tudo estiver quitado, a do mês atual (ou a última antes dele).
 */
export function startInvoice(invoices: Invoice[], settled: Set<string>, now: string): string {
  const asc = [...invoices].sort((a, b) => a.period.localeCompare(b.period))
  const open = asc.filter((invoice) => !settled.has(invoice.id))
  const pick = open.find((invoice) => invoice.period >= now) ?? [...open].reverse().find((invoice) => invoice.period < now)
  if (pick) return pick.id
  const before = asc.filter((invoice) => invoice.period <= now)
  return (before[before.length - 1] ?? asc[0])?.id ?? ''
}
