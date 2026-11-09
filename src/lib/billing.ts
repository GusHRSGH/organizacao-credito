import { formatDate, money } from './format'
import { receivingText, type Receiving } from './receiving'
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
export interface MessageOptions { receiving?: Receiving; /** Quando a cobrança junta várias faturas, agrupa as linhas pelo nome da fatura. */ invoiceLabels?: Map<string, string> }

export function buildMessage(bill: PersonBill, invoiceLabel: string, options: MessageOptions = {}) {
  const open = bill.rows.filter((row) => row.status !== 'paid')
  const word = bill.name.split(/\s+/)[0]
  const first = word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  if (!open.length) return `Oi ${first}! Tudo certo com a fatura de ${invoiceLabel}, nada pendente.`
  const line = (row: Transaction) => `• ${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}: ${money(Number(row.amount))}`
  const labels = options.invoiceLabels
  const many = labels && new Set(open.map((row) => row.invoice_id)).size > 1
  let detail: string
  if (many) {
    const byInvoice = new Map<string, Transaction[]>()
    for (const row of open) byInvoice.set(row.invoice_id, [...(byInvoice.get(row.invoice_id) ?? []), row])
    detail = [...byInvoice].map(([id, list]) => `${labels.get(id) ?? 'Fatura'} (${money(list.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100)}):\n${list.map(line).join('\n')}`).join('\n\n')
  } else detail = open.map(line).join('\n')
  const paidNote = bill.paid > 0 ? `\n(Já pago: ${money(bill.paid)})` : ''
  const pay = options.receiving ? receivingText(options.receiving, bill.pending, invoiceLabel) : ''
  const head = many ? `Oi ${first}! Somando as faturas em aberto (${invoiceLabel}), sua parte é ${money(bill.pending)}.` : `Oi ${first}! Sua parte da fatura de ${invoiceLabel}: ${money(bill.pending)}.`
  return `${head}\n\nDetalhe:\n${detail}\n\nTotal: ${money(bill.pending)}${paidNote}${pay ? `\n\n${pay}` : ''}`
}

/** Uma mensagem só para o grupo: quanto cada um deve e como pagar. */
export function buildGroupMessage(bills: PersonBill[], label: string, receiving?: Receiving) {
  const owing = bills.filter((bill) => bill.pending > 0.004)
  if (!owing.length) return `Acerto de ${label}: tudo pago, ninguém deve nada. 🎉`
  const total = owing.reduce((sum, bill) => sum + Math.round(bill.pending * 100), 0) / 100
  const lines = owing.map((bill) => `• ${bill.name}: ${money(bill.pending)}`)
  const pay = receiving ? receivingText(receiving) : ''
  return `Acerto de ${label}:\n\n${lines.join('\n')}\n\nTotal a receber: ${money(total)}${pay ? `\n\n${pay}` : ''}`
}
