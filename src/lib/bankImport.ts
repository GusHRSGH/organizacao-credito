import { cleanDescription } from './cleanup'
import { invoicePeriodFor, type Card } from './card'
import { guessCategory, matchCategoryName } from './keywords'
import { parsePastedBill } from './pasteImport'
import { questionKey } from './assign'
import { byHistory, type Suggestion } from './suggest'
import { analyzeSheet, applyMapping, readRawSheets } from '../services/smartImport'
import { parseInstallment } from '../services/importXlsx'
import type { ImportRow } from '../types'

export interface BankRow { date: string; description: string; amount: number; bankCategory: string; installmentNumber: number | null; installmentCount: number | null }
export interface BankCredit { date: string; description: string; amount: number }
export interface BankFile { rows: BankRow[]; ignored: string[]; credits: BankCredit[]; periodHint: string | null; kind: 'planilha' | 'pdf' | 'foto' | 'texto' }

/** O nome do arquivo costuma trazer o vencimento (Nubank_2026-12-07.csv). Devolve a fatura (AAAA-MM-01). */
export function periodFromFileName(name: string): string | null {
  const match = name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/)
  return match ? `${match[1]}-${match[2]}-01` : null
}

const sentence = (text: string) => text.trim().replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))

/** Lê a fatura exportada (CSV, XLSX, PDF ou foto) sem exigir formato nenhum. */
export async function readBankFile(file: File, ctx: { people: string[]; categories: string[]; today: string }, onStatus?: (text: string) => void): Promise<BankFile> {
  const periodHint = periodFromFileName(file.name)
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (isPdf || isImage) {
    onStatus?.(isPdf ? 'Lendo o PDF…' : 'Reconhecendo o texto da foto…')
    let text: string
    if (isPdf) { const { readPdfText } = await import('../services/pdfText'); text = await readPdfText(file, (i) => onStatus?.(`Lendo a página ${i.page} de ${i.pages}…`)) }
    else { const { readImageText } = await import('../services/ocr'); text = await readImageText(file, (i) => onStatus?.(`Reconhecendo o texto… ${Math.round(i.progress * 100)}%`)) }
    if (!text.trim()) throw new Error('Não consegui ler texto nesse arquivo. Tente o CSV da fatura, ou uma foto mais nítida.')
    const parsed = parsePastedBill(text, ctx.today, ctx.people, ctx.categories)
    return {
      rows: parsed.rows.map((row) => ({ date: row.date, description: row.description, amount: row.amount, bankCategory: '', installmentNumber: parseInstallment(row.description)?.number ?? null, installmentCount: parseInstallment(row.description)?.count ?? null })),
      ignored: parsed.skipped.map((item) => `${item.text} (${item.reason})`), credits: [], periodHint, kind: isPdf ? 'pdf' : 'foto',
    }
  }
  onStatus?.('Lendo a planilha…')
  const raw = await readRawSheets(file)
  const rows: BankRow[] = []
  const ignored: string[] = []
  const credits: BankCredit[] = []
  for (const sheet of raw) {
    const proposal = analyzeSheet(sheet.name, sheet.data)
    if (!proposal?.ok) continue
    for (const parsed of applyMapping(proposal, sheet.data, null)) {
      ignored.push(...parsed.issues)
      credits.push(...(parsed.credits ?? []))
      parsed.rows.forEach((row) => rows.push({ date: row.date, description: row.description, amount: row.amount, bankCategory: row.category, installmentNumber: row.installmentNumber, installmentCount: row.installmentCount }))
    }
  }
  if (!rows.length) throw new Error('Não consegui identificar as compras nesse arquivo. Confira se é a fatura exportada, ou use Dados > Importar planilha para ajustar as colunas.')
  return { rows, ignored, credits, periodHint, kind: 'planilha' }
}

export interface ClassifiedRow extends BankRow {
  id: number
  person: string
  category: string
  personFrom: 'histórico' | 'padrão' | 'resposta' | ''
  categoryFrom: 'histórico' | 'banco' | 'palavras' | 'nova' | ''
  renamed: boolean
  /** Pergunta a que esta compra pertence (compras parecidas respondem juntas). */
  qkey: string
  /** Se é um IOF, a compra internacional que o gerou. */
  iofOf: number | null
}

/** Tipos do Nubank que o banco não categoriza: o nome da categoria é nosso. */
const SPECIAL: Array<[RegExp, string]> = [
  [/^pix no cr[eé]dito\b/i, 'Pix no crédito'],
  [/^boleto no cr[eé]dito\b/i, 'Boleto no crédito'],
]
const IOF_RATE = 0.035
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/** O IOF de compra internacional é 3,5% da compra: acha a compra pelo valor, perto da data. */
function linkIof(rows: BankRow[]): Map<number, number> {
  const links = new Map<number, number>()
  const taken = new Set<number>()
  rows.forEach((iof, id) => {
    if (!/^iof\b/i.test(iof.description.trim())) return
    const buy = rows.findIndex((row, other) => other !== id && !taken.has(other) && !/^iof\b/i.test(row.description.trim()) && Math.abs(Math.round(row.amount * IOF_RATE * 100) - Math.round(iof.amount * 100)) <= 2 && dayDiff(row.date, iof.date) <= 3)
    if (buy >= 0) { links.set(id, buy); taken.add(buy) }
  })
  return links
}

/** Decide responsável e categoria de cada compra: primeiro o seu histórico, depois a categoria do banco, depois palavras comuns. */
export function classifyRows(rows: BankRow[], ctx: { suggestions: Map<string, Suggestion>; categories: string[]; defaultPerson: string }): ClassifiedRow[] {
  const iof = linkIof(rows)
  const first = rows.map((row, id): ClassifiedRow => {
    const description = cleanDescription(row.description)
    const history = byHistory(description, ctx.suggestions) ?? byHistory(row.description, ctx.suggestions)
    let category = ''
    let categoryFrom: ClassifiedRow['categoryFrom'] = ''
    const special = SPECIAL.find(([pattern]) => pattern.test(row.description.trim()))?.[1]
    if (history?.category) { category = history.category; categoryFrom = 'histórico' }
    else if (special) { const mine = matchCategoryName(special, ctx.categories); category = mine ?? special; categoryFrom = mine ? 'palavras' : 'nova' }
    else {
      const mapped = matchCategoryName(row.bankCategory, ctx.categories)
      const guessed = mapped ?? guessCategory(description, ctx.categories)
      if (mapped) { category = mapped; categoryFrom = 'banco' }
      else if (guessed) { category = guessed; categoryFrom = 'palavras' }
      else if (row.bankCategory.trim()) { category = sentence(row.bankCategory); categoryFrom = 'nova' }
    }
    const person = history?.person ?? ctx.defaultPerson
    return { ...row, id, description, renamed: description !== row.description.trim(), category, categoryFrom, person, personFrom: history?.person ? 'histórico' : ctx.defaultPerson ? 'padrão' : '', qkey: questionKey(description), iofOf: null }
  })
  // O IOF segue a compra que o gerou: mesma categoria, mesmo responsável, mesma pergunta.
  for (const [iofId, buyId] of iof) {
    const buy = first[buyId]
    first[iofId] = { ...first[iofId], iofOf: buyId, qkey: buy.qkey, category: buy.category || first[iofId].category, categoryFrom: buy.category ? buy.categoryFrom : first[iofId].categoryFrom, person: buy.person, personFrom: buy.personFrom }
  }
  return first
}

export interface IncomingSummary { count: number; total: number; byCategory: Array<{ name: string; total: number }>; byPerson: Array<{ name: string; total: number }>; installments: number }

export function summarizeIncoming(rows: Array<{ amount: number; category: string; person: string; installmentCount: number | null }>): IncomingSummary {
  const sum = (key: 'category' | 'person', fallback: string) => {
    const map = new Map<string, number>()
    for (const row of rows) map.set(row[key] || fallback, (map.get(row[key] || fallback) ?? 0) + Math.round(row.amount * 100))
    return [...map].map(([name, cents]) => ({ name, total: cents / 100 })).sort((a, b) => b.total - a.total)
  }
  return { count: rows.length, total: rows.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100, byCategory: sum('category', 'Sem categoria'), byPerson: sum('person', 'Sem responsável'), installments: rows.filter((r) => r.installmentCount).length }
}

/** Fatura mais provável do arquivo: o vencimento no nome, ou pelo fechamento do cartão, ou o mês mais comum das compras. */
export function guessPeriod(hint: string | null, rows: Array<{ date: string }>, card: Card | null): string {
  if (hint) return hint
  const votes = new Map<string, number>()
  for (const row of rows) { const p = invoicePeriodFor(row.date, card); votes.set(p, (votes.get(p) ?? 0) + 1) }
  return [...votes].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? `${new Date().toISOString().slice(0, 7)}-01`
}

export const toImportRows = (rows: ClassifiedRow[], paid: boolean): ImportRow[] => rows.map((row) => ({
  date: row.date, description: row.description.trim().slice(0, 160), amount: row.amount, person: row.person.trim(), category: row.category.trim(), status: paid ? 'paid' : 'pending',
  installmentNumber: row.installmentNumber, installmentCount: row.installmentCount,
}))
