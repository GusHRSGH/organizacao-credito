import type { BackupFile, LocalData } from '../types'
import { isValidPeriod } from './installments'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'

export function makeBackup(data: LocalData, now = new Date()): BackupFile {
  return { app: 'organizacao-credito', version: 1, exportedAt: now.toISOString(), data: structuredClone(data) }
}

/** Valida um backup antes de substituir o banco local. Lança erro em português. */
export function validateBackup(input: unknown): LocalData {
  if (!isObject(input) || input.app !== 'organizacao-credito') throw new Error('Este arquivo não é um backup do Organização do Crédito.')
  if (input.version !== 1) throw new Error('Versão de backup não suportada por esta versão do aplicativo.')
  const data = input.data
  if (!isObject(data) || !Array.isArray(data.invoices) || !Array.isArray(data.transactions) || !Array.isArray(data.people) || !Array.isArray(data.categories)) {
    throw new Error('O backup está incompleto ou corrompido.')
  }
  const invoiceIds = new Set<string>()
  for (const invoice of data.invoices) {
    if (!isObject(invoice) || !isString(invoice.id) || !isString(invoice.period) || !isValidPeriod(invoice.period) || !isString(invoice.label)) {
      throw new Error('O backup contém uma fatura inválida.')
    }
    invoiceIds.add(invoice.id)
  }
  const personIds = new Set(data.people.filter(isObject).map((p) => p.id))
  const categoryIds = new Set(data.categories.filter(isObject).map((c) => c.id))
  const seen = new Set<string>()
  for (const row of data.transactions) {
    if (!isObject(row) || !isString(row.id) || !isString(row.invoice_id) || !isString(row.description) || !isString(row.occurred_on)) {
      throw new Error('O backup contém um lançamento inválido.')
    }
    if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0) throw new Error('O backup contém um lançamento com valor inválido.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on)) throw new Error('O backup contém um lançamento com data inválida.')
    if (row.status !== 'paid' && row.status !== 'pending') throw new Error('O backup contém um lançamento com status inválido.')
    if (!invoiceIds.has(row.invoice_id)) throw new Error('O backup referencia uma fatura que não existe.')
    if (row.person_id != null && !personIds.has(row.person_id)) throw new Error('O backup referencia uma pessoa que não existe.')
    if (row.category_id != null && !categoryIds.has(row.category_id)) throw new Error('O backup referencia uma categoria que não existe.')
    if (seen.has(row.id)) throw new Error('O backup contém lançamentos duplicados.')
    seen.add(row.id)
  }
  return structuredClone(data) as unknown as LocalData
}
