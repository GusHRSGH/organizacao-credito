import { feeSplitFor } from './fee'
import { moneyFull } from './format'
import { settledIds, startInvoice } from './settled'
import { walletOf, type Wallet } from './wallet'
import type { CardFee, Invoice, Transaction } from '../types'

/** Tudo de todas as carteiras, para somar a cobrança de cada pessoa. */
export interface Everything { wallets: Wallet[]; invoices: Invoice[]; transactions: Transaction[]; fees: CardFee[] }

export interface DebtPart { walletId: string; wallet: string; invoiceId: string; invoice: string; amount: number }
export interface PersonDebt { name: string; total: number; parts: DebtPart[] }
export interface UnifiedDebts { people: PersonDebt[]; total: number; wallets: number }

const cents = (value: number) => Math.round(Number(value) * 100)

/**
 * O que cada pessoa deve somando todas as carteiras.
 * Em cada carteira entra a fatura em aberto que o app abriria (a do mês atual ou a próxima) e as anteriores ainda não quitadas.
 * Parcelas futuras de empréstimo e faturas de meses à frente ficam de fora.
 */
export function unifiedDebts(data: Everything, now: string): UnifiedDebts {
  const people = new Map<string, DebtPart[]>()
  const used = new Set<string>()
  for (const wallet of data.wallets) {
    const invoices = data.invoices.filter((invoice) => walletOf(invoice) === wallet.id)
    if (!invoices.length) continue
    const ids = new Set(invoices.map((invoice) => invoice.id))
    const rows = data.transactions.filter((row) => ids.has(row.invoice_id))
    const settled = settledIds(invoices, rows, data.fees)
    const limit = invoices.find((invoice) => invoice.id === startInvoice(invoices, settled, now))?.period
    if (!limit) continue
    for (const invoice of invoices) {
      if (invoice.period > limit || settled.has(invoice.id)) continue
      const owed = new Map<string, number>()
      for (const row of rows) {
        if (row.invoice_id !== invoice.id || row.status === 'paid') continue
        const name = row.person?.name || 'Sem responsável'
        owed.set(name, (owed.get(name) ?? 0) + cents(row.amount))
      }
      for (const share of feeSplitFor(invoice.id, invoices, data.fees, rows)?.shares ?? []) {
        if (!share.paid && share.share > 0) owed.set(share.name, (owed.get(share.name) ?? 0) + cents(share.share))
      }
      for (const [name, value] of owed) {
        if (value <= 0) continue
        used.add(wallet.id)
        people.set(name, [...(people.get(name) ?? []), { walletId: wallet.id, wallet: wallet.name, invoiceId: invoice.id, invoice: invoice.label, amount: value / 100 }])
      }
    }
  }
  const list = [...people].map(([name, parts]) => ({ name, parts, total: parts.reduce((sum, part) => sum + cents(part.amount), 0) / 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  return { people: list, total: list.reduce((sum, person) => sum + cents(person.total), 0) / 100, wallets: used.size }
}

/** Mensagem com o total de tudo, carteira por carteira. O Pix, se tiver, vai separado. */
export function unifiedMessage(debt: PersonDebt, pixSeparate = false): string {
  const word = debt.name.split(/\s+/)[0]
  const first = word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  const lines = debt.parts.map((part) => `• ${part.wallet} (${part.invoice}): ${moneyFull(part.amount)}`)
  return `Oi ${first}! Segue tudo o que está em aberto:\n\n${lines.join('\n')}\n\nTotal: ${moneyFull(debt.total)}${pixSeparate ? '\n\nO Pix com o total vai na próxima mensagem.' : ''}`
}
