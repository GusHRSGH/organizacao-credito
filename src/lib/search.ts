import type { Invoice, Transaction } from '../types'

const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

export interface SearchHit { row: Transaction; invoice: Invoice | undefined }

/** Texto onde a busca procura: descrição, responsável, categoria, fatura, valor e parcela. */
function haystack(row: Transaction, invoice: Invoice | undefined) {
  const amount = Number(row.amount)
  const valores = `${amount.toFixed(2)} ${amount.toFixed(2).replace('.', ',')} ${Math.trunc(amount)}`
  const parcela = row.installment_count ? `${row.installment_number}/${row.installment_count} parcela parcelado` : ''
  const situacao = row.status === 'paid' ? 'pago' : 'pendente'
  return norm(`${row.description} ${row.person?.name ?? ''} ${row.category?.name ?? ''} ${invoice?.label ?? ''} ${valores} ${parcela} ${situacao}`)
}

/**
 * Busca em todas as faturas. Cada palavra digitada precisa aparecer (sem diferenciar acento ou maiúscula),
 * então "uber ana novembro" acha o Uber da Ana na fatura de novembro.
 */
export function searchAll(transactions: Transaction[], invoices: Invoice[], query: string, limit = 60): { hits: SearchHit[]; total: number } {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return { hits: [], total: 0 }
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const found = transactions
    .map((row) => ({ row, invoice: byId.get(row.invoice_id) }))
    .filter(({ row, invoice }) => { const text = haystack(row, invoice); return words.every((word) => text.includes(word)) })
    .sort((a, b) => b.row.occurred_on.localeCompare(a.row.occurred_on))
  return { hits: found.slice(0, limit), total: found.length }
}
