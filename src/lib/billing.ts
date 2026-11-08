import { formatDate, money } from './format'
import type { Transaction } from '../types'

export interface PersonBill { name: string; rows: Transaction[]; total: number; paid: number; pending: number }

const cents = (value: number) => Math.round(Number(value) * 100)

/** Agrupa os lançamentos por responsável, em centavos, do maior pendente para o menor. */
export function billsByPerson(rows: Transaction[]): PersonBill[] {
  const map = new Map<string, Transaction[]>()
  for (const row of rows) {
    const name = row.person?.name || 'Sem responsável'
    map.set(name, [...(map.get(name) ?? []), row])
  }
  return [...map].map(([name, list]) => {
    const total = list.reduce((sum, row) => sum + cents(row.amount), 0)
    const paid = list.filter((row) => row.status === 'paid').reduce((sum, row) => sum + cents(row.amount), 0)
    const sorted = [...list].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    return { name, rows: sorted, total: total / 100, paid: paid / 100, pending: (total - paid) / 100 }
  }).sort((a, b) => b.pending - a.pending || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
}

/** Mensagem simples para enviar no WhatsApp com o que ainda está pendente. */
export function buildMessage(bill: PersonBill, invoiceLabel: string) {
  const open = bill.rows.filter((row) => row.status !== 'paid')
  const word = bill.name.split(/\s+/)[0]
  const first = word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  if (!open.length) return `Oi ${first}! Tudo certo com a fatura de ${invoiceLabel}, nada pendente.`
  const lines = open.map((row) => `• ${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}: ${money(Number(row.amount))}`)
  const paidNote = bill.paid > 0 ? `\n(Já pago: ${money(bill.paid)})` : ''
  return `Oi ${first}! Sua parte da fatura de ${invoiceLabel}: ${money(bill.pending)}.\n\nDetalhe:\n${lines.join('\n')}\n\nTotal: ${money(bill.pending)}${paidNote}`
}
