import { dueDate, invoicePeriodFor, type Card } from './card'
import { goalTitle, levelOf, readGoals, spentFor } from './goals'
import { money } from './format'
import type { Settings } from './settings'
import { addMonthsToPeriod, periodLabel } from '../services/installments'
import type { Invoice, Transaction } from '../types'

export interface Reminder { id: string; text: string; go: 'invoices' | 'billing' | 'goals' }

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)

/** Avisos dentro do app (sem notificações do sistema, sem custo): vencimento, quem ainda deve e metas estouradas. */
export function buildReminders(s: Settings, card: Card | null, invoices: Invoice[], transactions: Transaction[], today: string): Reminder[] {
  const out: Reminder[] = []
  const current = invoicePeriodFor(today, card)
  if (s.remindDue > 0 && card) {
    for (const period of [addMonthsToPeriod(current, -1), current]) {
      const days = dayNumber(dueDate(period, card)) - dayNumber(today)
      const invoice = invoices.find((item) => item.period === period)
      if (!invoice || days < 0 || days > s.remindDue) continue
      const pending = transactions.filter((row) => row.invoice_id === invoice.id && row.status !== 'paid').reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100
      if (pending <= 0) continue
      out.push({ id: `due:${period}`, go: 'invoices', text: `A fatura de ${periodLabel(period)} ${days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : `vence em ${days} dias`}. Ainda falta pagar ${money(pending)}.` })
    }
  }
  if (s.remindDebts) {
    const past = new Set(invoices.filter((item) => item.period < current).map((item) => item.id))
    const owing = new Map<string, number>()
    for (const row of transactions) if (past.has(row.invoice_id) && row.status !== 'paid' && row.person?.name) owing.set(row.person.name, (owing.get(row.person.name) ?? 0) + Math.round(Number(row.amount) * 100))
    const total = [...owing.values()].reduce((a, b) => a + b, 0) / 100
    if (owing.size && total > 0) out.push({ id: `debts:${today.slice(0, 7)}:${owing.size}`, go: 'billing', text: `${owing.size === 1 ? '1 pessoa ainda não pagou' : `${owing.size} pessoas ainda não pagaram`} faturas anteriores: ${money(total)} no total.` })
  }
  if (s.remindGoals) {
    const invoice = invoices.find((item) => item.period === current)
    if (invoice) {
      const rows = transactions.filter((row) => row.invoice_id === invoice.id)
      for (const goal of readGoals()) {
        const spent = spentFor(goal, rows)
        const level = levelOf(spent, goal.limit)
        if (level !== 'ok') out.push({ id: `goal:${goal.id}:${level}:${current}`, go: 'goals', text: `${goalTitle(goal)}: ${level === 'over' ? 'passou do limite' : 'chegou perto do limite'} (${money(spent)} de ${money(goal.limit)}).` })
      }
    }
  }
  return out
}
