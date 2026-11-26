import { DEFAULT_CARD, dueDate, readCardFor } from './card'
import { walletOf } from './wallet'
import type { Everything } from './unified'

export interface Punctuality {
  name: string
  /** Faturas que a pessoa terminou de pagar (com a data registrada). */
  paid: number
  onTime: number
  /** Média de dias de atraso, só das que atrasaram. */
  avgLate: number
  /** O que está vencido e ainda não foi pago agora. */
  overdue: number
  overdueDays: number
  /** Últimas faturas, da mais antiga para a mais nova: dias de atraso (0 = em dia). */
  recent: Array<{ label: string; late: number }>
}

const DAY = 86_400_000
const days = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY)
const key = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

/**
 * Histórico de quem paga em dia, por pessoa e em todas as carteiras.
 * Cada fatura conta uma vez por pessoa: a data em que ela terminou de pagar a parte dela, comparada com o vencimento do cartão.
 * Pagamentos marcados antes deste recurso não têm data e ficam de fora.
 */
export function punctuality(data: Everything, today: string, due = (wallet: string, period: string) => dueDate(period, readCardFor(wallet) ?? DEFAULT_CARD)): Punctuality[] {
  const invoices = new Map(data.invoices.map((invoice) => [invoice.id, invoice]))
  const groups = new Map<string, { name: string; invoice: string; rows: typeof data.transactions }>()
  for (const row of data.transactions) {
    const name = row.person?.name
    if (!name || !invoices.has(row.invoice_id)) continue
    const id = `${key(name)}|${row.invoice_id}`
    const group = groups.get(id) ?? { name, invoice: row.invoice_id, rows: [] }
    group.rows.push(row)
    groups.set(id, group)
  }
  const people = new Map<string, Punctuality & { lateSum: number; history: Array<{ period: string; label: string; late: number }> }>()
  for (const group of groups.values()) {
    const invoice = invoices.get(group.invoice)!
    const deadline = due(walletOf(invoice), invoice.period)
    const person = people.get(key(group.name)) ?? { name: group.name, paid: 0, onTime: 0, avgLate: 0, overdue: 0, overdueDays: 0, recent: [], lateSum: 0, history: [] }
    people.set(key(group.name), person)
    const pending = group.rows.filter((row) => row.status !== 'paid')
    if (pending.length) {
      if (deadline < today) {
        person.overdue = Math.round((person.overdue + pending.reduce((sum, row) => sum + Number(row.amount), 0)) * 100) / 100
        person.overdueDays = Math.max(person.overdueDays, days(deadline, today))
      }
      continue
    }
    const dates = group.rows.map((row) => row.paid_at).filter((value): value is string => !!value)
    if (dates.length < group.rows.length) continue
    const finished = dates.sort().pop()!
    const late = Math.max(0, days(deadline, finished))
    person.paid++
    if (late === 0) person.onTime++
    else person.lateSum += late
    person.history.push({ period: invoice.period, label: invoice.label, late })
  }
  return [...people.values()]
    .filter((person) => person.paid || person.overdue)
    .map(({ lateSum, history, ...person }) => ({
      ...person,
      avgLate: person.paid - person.onTime ? Math.round(lateSum / (person.paid - person.onTime)) : 0,
      recent: history.sort((a, b) => a.period.localeCompare(b.period)).slice(-6).map(({ label, late }) => ({ label, late })),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.name.localeCompare(b.name, 'pt-BR'))
}
