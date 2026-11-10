import type { ImportRow } from '../types'
import { inferPeriod, parseDate, parseInstallment, type ParsedSheet } from './importXlsx'
import { periodLabel } from './installments'
import { invoicePeriodFor, type Card } from '../lib/card'

export type Field = 'date' | 'desc' | 'amount' | 'person' | 'category' | 'status' | 'parcel' | 'ignore'
export type Confidence = 'alta' | 'media' | 'baixa'

export const FIELD_LABELS: Record<Field, string> = {
  date: 'Data', desc: 'Título', amount: 'Valor', person: 'Responsável', category: 'Categoria', status: 'Status', parcel: 'Parcela', ignore: 'Ignorar',
}

export interface Proposal {
  sheetName: string
  /** Linha do cabeçalho (começando em 0) ou -1 quando a planilha não tem cabeçalho. */
  headerIndex: number
  fields: Field[]
  confidence: Confidence[]
  headers: string[]
  ok: boolean
}

const strip = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const blank = (value: unknown) => value === null || value === undefined || String(value).trim() === ''
const colName = (index: number) => `Coluna ${String.fromCharCode(65 + (index % 26))}`

const SYNONYMS: Record<Exclude<Field, 'ignore'>, string[]> = {
  date: ['data', 'dia', 'date', 'data da compra', 'data compra', 'data lancamento', 'data do lancamento'],
  desc: ['titulo', 'title', 'descricao', 'estabelecimento', 'lancamento', 'historico', 'nome', 'compra', 'detalhes', 'description', 'loja', 'memo'],
  amount: ['valor', 'preco', 'total', 'quantia', 'montante', 'amount', 'valor (r$)', 'valor r$'],
  person: ['responsavel', 'pessoa', 'quem', 'titular', 'portador', 'dono', 'comprador'],
  category: ['categoria', 'tipo', 'grupo', 'category'],
  status: ['status', 'situacao', 'pago', 'pagamento'],
  parcel: ['parcela', 'parcelas', 'parc'],
}

function fieldOfHeader(header: unknown): Exclude<Field, 'ignore'> | null {
  const key = strip(header)
  if (!key) return null
  for (const field of Object.keys(SYNONYMS) as Exclude<Field, 'ignore'>[]) if (SYNONYMS[field].includes(key)) return field
  for (const field of Object.keys(SYNONYMS) as Exclude<Field, 'ignore'>[]) if (SYNONYMS[field].some((word) => word.length >= 4 && key.startsWith(word))) return field
  return null
}

/** Número vindo do Excel ou texto como "R$ 1.234,56", "-45,90" ou "(45,90)". Mantém o sinal. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  let text = value.replace(/R\$|\s/g, '')
  let sign = 1
  if (/^\(.*\)$/.test(text)) { sign = -1; text = text.slice(1, -1) }
  if (text.startsWith('-')) { sign = -sign; text = text.slice(1) }
  if (text.startsWith('+')) text = text.slice(1)
  if (!/^\d[\d.,]*$/.test(text)) return null
  const number = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
  return Number.isFinite(number) ? sign * number : null
}

/** Data de verdade: objeto Date, texto em formato de data ou número de série do Excel (inteiro entre 2000 e 2049). */
function looksDate(value: unknown) {
  if (value instanceof Date) return true
  if (typeof value === 'number') return Number.isInteger(value) && value >= 36526 && value <= 54789
  return typeof value === 'string' && parseDate(value) !== null
}

const looksAmount = (value: unknown) => !(value instanceof Date) && !(typeof value === 'string' && parseDate(value)) && parseMoney(value) !== null
const looksParcel = (value: unknown) => typeof value === 'string' && parseInstallment(value) !== null
const PAID = new Set(['pago', 'paga', 'paid', 'sim', 'ok', 'quitado'])
const STATUS_WORDS = new Set([...PAID, 'pendente', 'nao pago', 'nao', 'aberto', 'a pagar', 'em aberto', 'nao paga'])

const ratio = (values: unknown[], test: (value: unknown) => boolean) => (values.length ? values.filter(test).length / values.length : 0)

/** Descobre sozinho o que cada coluna é, olhando os títulos e o conteúdo. */
export function analyzeSheet(sheetName: string, data: unknown[][]): Proposal | null {
  const rows = data.filter((row) => Array.isArray(row))
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (!rows.length || width < 2) return null

  // 1) cabeçalho: a linha com mais títulos conhecidos; sem nenhuma, a linha de texto logo acima dos dados
  let headerIndex = -1
  let best = 0
  rows.slice(0, 40).forEach((row, index) => {
    const hits = new Set(row.map(fieldOfHeader).filter(Boolean)).size
    if (hits > best) { best = hits; headerIndex = index }
  })
  if (best < 2) {
    headerIndex = -1
    const firstData = rows.findIndex((row) => row.some(looksDate) && row.some(looksAmount))
    const above = firstData > 0 ? rows[firstData - 1] : null
    if (above && above.filter((cell) => !blank(cell)).length >= 2 && above.every((cell) => blank(cell) || (typeof cell === 'string' && !looksDate(cell) && !looksAmount(cell)))) headerIndex = firstData - 1
  }
  const body = rows.slice(headerIndex + 1, headerIndex + 1 + 300)
  const columns = Array.from({ length: width }, (_, c) => body.map((row) => row[c]).filter((value) => !blank(value)))
  const headers = Array.from({ length: width }, (_, c) => (headerIndex >= 0 && !blank(rows[headerIndex][c]) ? String(rows[headerIndex][c]).trim() : colName(c)))

  const fields: Field[] = Array(width).fill('ignore')
  const confidence: Confidence[] = Array(width).fill('baixa')
  const taken = new Set<Exclude<Field, 'ignore'>>()
  const assign = (c: number, field: Exclude<Field, 'ignore'>, level: Confidence) => { fields[c] = field; confidence[c] = level; taken.add(field) }

  // 2) pelos títulos (confere com o conteúdo antes de confiar)
  if (headerIndex >= 0) {
    for (let c = 0; c < width; c++) {
      const field = fieldOfHeader(rows[headerIndex][c])
      if (!field || taken.has(field) || !columns[c].length) continue
      const fits = field === 'date' ? ratio(columns[c], looksDate) > 0.6 : field === 'amount' ? ratio(columns[c], looksAmount) > 0.6 : field === 'parcel' ? ratio(columns[c], looksParcel) > 0.3 : true
      if (fits) assign(c, field, 'alta')
    }
  }

  // 3) pelo conteúdo, só no que faltou
  const free = () => fields.map((_, c) => c).filter((c) => fields[c] === 'ignore' && columns[c].length)
  const pick = (score: (c: number) => number, min: number) => free().map((c) => ({ c, s: score(c) })).filter((x) => x.s >= min).sort((a, b) => b.s - a.s)[0]?.c
  if (!taken.has('date')) { const c = pick((c) => ratio(columns[c], looksDate), 0.8); if (c !== undefined) assign(c, 'date', 'media') }
  if (!taken.has('amount')) { const c = pick((c) => (ratio(columns[c], looksDate) > 0.5 ? 0 : ratio(columns[c], looksAmount)), 0.8); if (c !== undefined) assign(c, 'amount', 'media') }
  if (!taken.has('parcel')) { const c = pick((c) => ratio(columns[c], looksParcel), 0.4); if (c !== undefined) assign(c, 'parcel', 'media') }
  if (!taken.has('status')) { const c = pick((c) => ratio(columns[c], (v) => typeof v === 'string' && STATUS_WORDS.has(strip(v))), 0.8); if (c !== undefined) assign(c, 'status', 'media') }
  const textual = (c: number) => ratio(columns[c], (v) => typeof v === 'string' && !looksAmount(v) && !looksDate(v))
  const distinct = (c: number) => new Set(columns[c].map(strip)).size
  if (!taken.has('desc')) {
    const c = pick((c) => (textual(c) > 0.8 ? (distinct(c) / columns[c].length) * Math.min(columns[c].reduce<number>((n, v) => n + String(v).length, 0) / columns[c].length, 40) : 0), 1)
    if (c !== undefined) assign(c, 'desc', 'media')
  }
  const few = (c: number) => textual(c) > 0.8 && distinct(c) <= Math.max(12, columns[c].length * 0.3)
  const small = free().filter(few).sort((a, b) => distinct(a) - distinct(b))
  if (!taken.has('person') && small.length) { assign(small[0], 'person', 'baixa'); small.shift() }
  if (!taken.has('category') && small.length) assign(small[0], 'category', 'baixa')

  const ok = taken.has('date') && taken.has('desc') && taken.has('amount')
  return { sheetName, headerIndex, fields, confidence, headers, ok }
}

/** Lê as linhas com o mapeamento escolhido (pelo robô ou ajustado pela pessoa). */
export function applyMapping(proposal: Proposal, data: unknown[][], card: Card | null = null): ParsedSheet[] {
  const idx = (field: Field) => proposal.fields.indexOf(field)
  const [cDate, cDesc, cAmount, cPerson, cCat, cStatus, cParcel] = (['date', 'desc', 'amount', 'person', 'category', 'status', 'parcel'] as Field[]).map(idx)
  const issues: string[] = []
  if (cDate < 0 || cDesc < 0 || cAmount < 0) return [{ sheetName: proposal.sheetName, period: null, label: proposal.sheetName, rows: [], issues: ['Faltou indicar Data, Título ou Valor.'] }]
  const body = data.slice(proposal.headerIndex + 1)
  const amounts = body.map((row) => parseMoney(row?.[cAmount])).filter((v): v is number => v !== null && v !== 0)
  const flip = amounts.filter((v) => v < 0).length > amounts.length / 2
  const rows: ImportRow[] = []
  body.forEach((raw, offset) => {
    if (!raw || raw.every(blank)) return
    const line = proposal.headerIndex + offset + 2
    const description = String(raw[cDesc] ?? '').trim()
    if (!description) { issues.push(`Linha ${line}: sem título, ignorada.`); return }
    const date = parseDate(raw[cDate])
    if (!date) { issues.push(`Linha ${line} (${description}): data não reconhecida, ignorada.`); return }
    const signed = parseMoney(raw[cAmount])
    if (signed === null) { issues.push(`Linha ${line} (${description}): valor não reconhecido, ignorada.`); return }
    const amount = Math.round((flip ? -signed : signed) * 100) / 100
    if (amount <= 0) { issues.push(`Linha ${line} (${description}): valor ${signed === 0 ? 'zerado' : 'de estorno ou pagamento'}, ignorada.`); return }
    const installment = parseInstallment(cParcel >= 0 ? raw[cParcel] : null, description)
    rows.push({
      date, description: description.slice(0, 160), amount,
      person: cPerson >= 0 ? String(raw[cPerson] ?? '').trim().slice(0, 80) : '',
      category: cCat >= 0 ? String(raw[cCat] ?? '').trim().slice(0, 60) : '',
      status: cStatus >= 0 && PAID.has(strip(raw[cStatus])) ? 'paid' : 'pending',
      installmentNumber: installment?.number ?? null, installmentCount: installment?.count ?? null,
    })
  })
  if (!rows.length) return [{ sheetName: proposal.sheetName, period: null, label: proposal.sheetName, rows, issues }]
  // Nome da aba com mês: uma fatura só. Senão, uma fatura para cada mês das datas.
  const named = inferPeriod(proposal.sheetName, rows)
  if (named) return [{ sheetName: proposal.sheetName, period: named, label: periodLabel(named), rows, issues }]
  const byMonth = new Map<string, ImportRow[]>()
  for (const row of rows) { const key = invoicePeriodFor(row.date, card); byMonth.set(key, [...(byMonth.get(key) ?? []), row]) }
  return [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([period, list], i) => ({
    sheetName: byMonth.size > 1 ? `${proposal.sheetName} · ${periodLabel(period)}` : proposal.sheetName, period, label: periodLabel(period), rows: list, issues: i === 0 ? issues : [],
  }))
}

/** CSV simples: detecta ; , ou tab e respeita aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const first = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [';', '\t', ','].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell); cell = ''; out.push(row); row = []
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface RawSheet { name: string; data: unknown[][] }

/** Lê .xlsx ou .csv sem exigir nenhum formato de colunas. */
export async function readRawSheets(file: File): Promise<RawSheet[]> {
  if (/\.(csv|txt)$/i.test(file.name)) return [{ name: file.name.replace(/\.[^.]+$/, ''), data: parseCsv(await file.text()) }]
  const { default: readExcelFile } = await import('read-excel-file/web-worker')
  const sheets = await readExcelFile(file)
  return sheets.map((sheet) => ({ name: sheet.sheet, data: sheet.data as unknown[][] }))
}
