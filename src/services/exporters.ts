import { Capacitor } from '@capacitor/core'
import type { Invoice, Transaction } from '../types'
import { formatDate } from '../lib/format'

const BOM = String.fromCharCode(0xfeff)
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`

/** CSV com ";" e BOM, para abrir direto no Excel em português. */
export function toCsv(rows: Transaction[], invoices: Invoice[]) {
  const labels = new Map(invoices.map((invoice) => [invoice.id, invoice.label]))
  const header = ['Fatura', 'Data', 'Descrição', 'Valor', 'Responsável', 'Categoria', 'Parcela', 'Status']
  const lines = rows.map((row) => [
    labels.get(row.invoice_id) ?? '', formatDate(row.occurred_on), row.description,
    Number(row.amount).toFixed(2).replace('.', ','), row.person?.name ?? '', row.category?.name ?? '',
    row.installment_count ? `${row.installment_number}/${row.installment_count}` : 'À vista',
    row.status === 'paid' ? 'Pago' : 'Não pago',
  ].map(cell).join(';'))
  return BOM + [header.map(cell).join(';'), ...lines].join('\r\n')
}

async function shareOnDevice(filename: string, content: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const written = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title: filename, url: written.uri, dialogTitle: 'Salvar ou enviar arquivo' })
}

export function downloadText(filename: string, content: string, mime: string) {
  if (Capacitor.isNativePlatform()) { void shareOnDevice(filename, content); return }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const stamp = (now = new Date()) => now.toISOString().slice(0, 10)
