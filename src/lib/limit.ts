import { dueDate, type Card } from './card'
import type { Invoice, Transaction } from '../types'

export interface LimitUse { limit: number; used: number; share: number; level: 'ok' | 'warn' | 'danger'; people: Array<{ name: string; used: number }> }

const cents = (value: number) => Math.round(Number(value) * 100)

/**
 * Quanto do limite do cartão está tomado: tudo das faturas que ainda não venceram (inclui parcelas futuras),
 * pago ou não pelas pessoas, porque o banco só libera o limite quando a fatura é paga.
 */
export function limitUse(card: Card | null, invoices: Invoice[], transactions: Transaction[], today: string): LimitUse | null {
  if (!card?.limit) return null
  const open = new Set(invoices.filter((invoice) => dueDate(invoice.period, card) >= today).map((invoice) => invoice.id))
  const byPerson = new Map<string, number>()
  let used = 0
  for (const row of transactions) {
    if (!open.has(row.invoice_id)) continue
    used += cents(row.amount)
    const name = row.person?.name || 'Sem responsável'
    byPerson.set(name, (byPerson.get(name) ?? 0) + cents(row.amount))
  }
  const share = used / 100 / card.limit
  return {
    limit: card.limit, used: used / 100, share,
    level: share >= 0.95 ? 'danger' : share >= 0.8 ? 'warn' : 'ok',
    people: [...byPerson].map(([name, value]) => ({ name, used: value / 100 })).sort((a, b) => b.used - a.used),
  }
}
