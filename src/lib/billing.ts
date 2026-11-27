import { formatDate, moneyFull } from './format'
import { receivingText, type Receiving } from './receiving'
import { chargeCents, spreadCents } from './fee'
import type { FeeDisplay, Transaction } from '../types'

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
export interface FeeCharge { text: string; amount: number }
export interface MessageOptions { receiving?: Receiving; /** O Pix vai numa mensagem separada: aqui não entra a chave, só o recado e o aviso. */ pixSeparate?: boolean; /** Taxa de uso do cartão ainda não paga: entra no detalhe e no total. */ fees?: FeeCharge[]; /** Quando a cobrança junta várias faturas, agrupa as linhas pelo nome da fatura. */ invoiceLabels?: Map<string, string>; /** Crédito de quem pagou a mais antes: desconta do total. */ credit?: number; /** Taxa discreta desta pessoa (sem linha de taxa). */ display?: FeeDisplay | null }

export function buildMessage(bill: PersonBill, invoiceLabel: string, options: MessageOptions = {}) {
  const open = bill.rows.filter((row) => row.status !== 'paid')
  const word = bill.name.split(/\s+/)[0]
  const first = word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  const fees = options.fees ?? []
  const feeCents = fees.reduce((sum, fee) => sum + Math.round(fee.amount * 100), 0)
  const display = feeCents > 0 ? options.display ?? null : null
  const purchases = Math.round(bill.pending * 100)
  const gross = chargeCents(purchases, feeCents, display)
  const creditCents = Math.min(Math.round((options.credit ?? 0) * 100), gross)
  const due = (gross - creditCents) / 100
  if (!open.length && !feeCents) return `Oi ${first}! Tudo certo com a fatura de ${invoiceLabel}, nada pendente.`
  const labels = options.invoiceLabels
  const many = labels && new Set(open.map((row) => row.invoice_id)).size > 1
  const paidNote = bill.paid > 0 ? `\n(Já pago: ${moneyFull(bill.paid)})` : ''
  const pay = options.pixSeparate
    ? [options.receiving?.include && options.receiving.note.trim() ? options.receiving.note.trim() : '', 'É só copiar o Pix que te mandei.'].filter(Boolean).join('\n')
    : options.receiving ? receivingText(options.receiving, due, invoiceLabel) : ''
  const head = many ? `Oi ${first}! Somando as faturas em aberto (${invoiceLabel}), sua parte é ${moneyFull(due)}.` : `Oi ${first}! Sua parte da fatura de ${invoiceLabel}: ${moneyFull(due)}.`
  // Taxa discreta, "só o total" (ou sem compras para diluir): uma frase com o valor.
  if (display && (display.style === 'total' || !open.length)) {
    const credit = creditCents > 0 ? `\n(Já descontado o crédito de ${moneyFull(creditCents / 100)}.)` : ''
    return `${head}${credit}${pay ? `\n\n${pay}` : ''}`
  }
  // Diluída: cada compra aparece com a sua parte da taxa, e a soma bate com o total.
  const shown = display?.style === 'spread' ? spreadCents(open.map((row) => Math.round(Number(row.amount) * 100)), gross) : open.map((row) => Math.round(Number(row.amount) * 100))
  const amountOf = new Map(open.map((row, i) => [row.id, shown[i]]))
  const line = (row: Transaction) => `• ${formatDate(row.occurred_on).slice(0, 5)} ${row.description}${row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}: ${moneyFull((amountOf.get(row.id) ?? Math.round(Number(row.amount) * 100)) / 100)}`
  let detail: string
  if (many) {
    const byInvoice = new Map<string, Transaction[]>()
    for (const row of open) byInvoice.set(row.invoice_id, [...(byInvoice.get(row.invoice_id) ?? []), row])
    detail = [...byInvoice].map(([id, list]) => `${labels.get(id) ?? 'Fatura'} (${moneyFull(list.reduce((sum, row) => sum + (amountOf.get(row.id) ?? 0), 0) / 100)}):\n${list.map(line).join('\n')}`).join('\n\n')
  } else detail = open.map(line).join('\n')
  if (fees.length && !display) detail = [detail, fees.map((fee) => `• ${fee.text}: ${moneyFull(fee.amount)}`).join('\n')].filter(Boolean).join(open.length ? '\n\n' : '')
  if (creditCents > 0) detail = `${detail}\n• Crédito (pagou a mais antes): -${moneyFull(creditCents / 100)}`
  const note = display?.style === 'note' ? ' (inclui os custos do cartão)' : ''
  return `${head}\n\nDetalhe:\n${detail}\n\nTotal: ${moneyFull(due)}${note}${paidNote}${pay ? `\n\n${pay}` : ''}`
}

/** Uma mensagem só para o grupo: quanto cada um deve e como pagar. Quem tem taxa discreta não ganha o "(com taxa)". */
export function buildGroupMessage(bills: PersonBill[], label: string, receiving?: Receiving, feeDue: Map<string, number> = new Map(), displays: Map<string, FeeDisplay | null> = new Map()) {
  const dueOf = (bill: PersonBill) => chargeCents(Math.round(bill.pending * 100), Math.round((feeDue.get(bill.name) ?? 0) * 100), displays.get(bill.name) ?? null) / 100
  const owing = bills.filter((bill) => dueOf(bill) > 0.004)
  if (!owing.length) return `Acerto de ${label}: tudo pago, ninguém deve nada. 🎉`
  const total = owing.reduce((sum, bill) => sum + Math.round(dueOf(bill) * 100), 0) / 100
  const lines = owing.map((bill) => `• ${bill.name}: ${moneyFull(dueOf(bill))}${feeDue.get(bill.name) && !displays.get(bill.name) ? ` (com taxa de ${moneyFull(feeDue.get(bill.name)!)})` : ''}`)
  const pay = receiving ? receivingText(receiving) : ''
  return `Acerto de ${label}:\n\n${lines.join('\n')}\n\nTotal a receber: ${moneyFull(total)}${pay ? `\n\n${pay}` : ''}`
}
