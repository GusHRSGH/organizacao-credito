import type { ImportRow } from '../types'
import { MONTH_NAMES, periodLabel } from './installments'

export interface ParsedSheet {
  sheetName: string
  period: string | null
  label: string
  rows: ImportRow[]
  issues: string[]
}

const strip = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const MONTH_KEYS = MONTH_NAMES.map(strip)
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
}

export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  if (typeof value === 'number' && value > 1000) {
    const date = new Date(Math.round((value - 25569) * 86400000))
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }
  if (typeof value === 'string') {
    const text = value.trim()
    let match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
    if (match) return validDate(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]), Number(match[1]))
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]))
  }
  return null
}

export function parseAmount(value: unknown): number | null {
  let number: number
  if (typeof value === 'number') number = value
  else if (typeof value === 'string') {
    const text = value.replace(/R\$|\s/g, '')
    number = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
  } else return null
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null
}

export function parseInstallment(...sources: unknown[]): { number: number; count: number } | null {
  for (const source of sources) {
    const text = String(source ?? '')
    const match = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*$/)
    if (!match) continue
    const number = Number(match[1])
    const count = Number(match[2])
    if (count >= 2 && count <= 48 && number >= 1 && number <= count) return { number, count }
  }
  return null
}

export function inferPeriod(sheetName: string, rows: ImportRow[]): string | null {
  const name = strip(sheetName)
  let month = MONTH_KEYS.findIndex((key) => name.includes(key)) + 1
  if (!month) month = MONTH_ABBR.findIndex((key) => new RegExp(`\\b${key}\\b`).test(name)) + 1
  if (!month) return null
  const explicit = name.match(/\b(20\d{2})\b/)
  if (explicit) return `${explicit[1]}-${String(month).padStart(2, '0')}-01`
  if (!rows.length) return null
  const latest = rows.reduce((max, row) => (row.date > max ? row.date : max), rows[0].date)
  const [year, latestMonth] = latest.split('-').map(Number)
  const target = year * 12 + (latestMonth - 1)
  let candidate = year
  while (candidate * 12 + (month - 1) < target) candidate += 1
  return `${candidate}-${String(month).padStart(2, '0')}-01`
}

/** Lê uma aba convertida em matriz. Devolve nulo se não tem as colunas esperadas (ex.: Resumo). */
export function parseSheet(sheetName: string, data: unknown[][]): ParsedSheet | null {
  const headerIndex = data.slice(0, 40).findIndex((row) => {
    const keys = row.map(strip)
    return keys.includes('data') && keys.includes('valor')
  })
  if (headerIndex < 0) return null
  const keys = data[headerIndex].map(strip)
  const col = (...names: string[]) => keys.findIndex((key) => names.includes(key))
  const idx = {
    date: col('data'), desc: col('titulo', 'descricao', 'estabelecimento', 'lancamento'), amount: col('valor'),
    person: col('responsavel'), status: col('status'), category: col('categoria'), parcel: col('parcela'),
  }
  if (idx.desc < 0) return null
  const rows: ImportRow[] = []
  const issues: string[] = []
  data.slice(headerIndex + 1).forEach((raw, offset) => {
    if (!raw || raw.every((value) => value === null || value === undefined || String(value).trim() === '')) return
    const line = headerIndex + offset + 2
    const description = String(raw[idx.desc] ?? '').trim()
    const date = parseDate(raw[idx.date])
    const amount = parseAmount(raw[idx.amount])
    if (!description) { issues.push(`Linha ${line}: sem título, ignorada.`); return }
    if (!date) { issues.push(`Linha ${line} (${description}): data inválida, ignorada.`); return }
    if (amount === null) { issues.push(`Linha ${line} (${description}): valor inválido ou zerado, ignorada.`); return }
    const installment = parseInstallment(idx.parcel >= 0 ? raw[idx.parcel] : null, description)
    const clipped = description.slice(0, 160)
    if (clipped !== description) issues.push(`Linha ${line}: título cortado em 160 caracteres.`)
    rows.push({
      date, description: clipped, amount,
      person: idx.person >= 0 ? String(raw[idx.person] ?? '').trim().slice(0, 80) : '',
      category: idx.category >= 0 ? String(raw[idx.category] ?? '').trim().slice(0, 60) : '',
      status: idx.status >= 0 && strip(raw[idx.status]) === 'pago' ? 'paid' : 'pending',
      installmentNumber: installment?.number ?? null, installmentCount: installment?.count ?? null,
    })
  })
  const period = inferPeriod(sheetName, rows)
  return { sheetName, period, label: period ? periodLabel(period) : sheetName, rows, issues }
}

/** Lê o .xlsx no próprio computador e devolve as abas que parecem faturas. */
export async function readWorkbook(file: Blob): Promise<ParsedSheet[]> {
  const { default: readExcelFile } = await import('read-excel-file/web-worker')
  const sheets = await readExcelFile(file)
  return sheets
    .map((sheet) => parseSheet(sheet.sheet, sheet.data as unknown[][]))
    .filter((sheet): sheet is ParsedSheet => sheet !== null && sheet.rows.length > 0)
}
