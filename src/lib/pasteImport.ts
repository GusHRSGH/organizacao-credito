import { addDays, dateFromDayMonth, makeDate, parseQuickLine, plain } from './quickEntry'
import { fixMojibake, INTERNAL_MOVE } from '../services/smartImport'

export interface PastedRow { line: number; date: string; description: string; amount: number; person?: string; /** Como o robô chegou nessa linha, quando não foi o formato de fatura. */ origin?: 'notificação' | 'conversa'; dateGuessed?: boolean }
export interface PasteResult { rows: PastedRow[]; skipped: Array<{ line: number; text: string; reason: string }> }

const MONEY = /(?:R\$\s*)?(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/g
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/
const DATE_BR = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DATE_TEXT = /\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+(?:de\s+)?(\d{4}))?(?![a-zç])/i

/** Lê texto colado da fatura do banco (uma compra por linha) e separa o que é lançamento do que é ruído. */
export function parsePastedBill(text: string, today: string, people: string[] = [], categories: string[] = []): PasteResult {
  const statement = parseAccountStatement(text)
  if (statement) return statement
  const app = parseAppScreen(text, today)
  if (app) return app
  const rows: PastedRow[] = []
  const skipped: PasteResult['skipped'] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\t|;/g, '  ').trim()
    if (!line) return
    const money = [...line.matchAll(MONEY)].pop()
    const iso = line.match(DATE_ISO)
    const named = iso ? null : line.match(DATE_TEXT)
    const br = iso || named ? null : line.match(DATE_BR)
    const fallback = (!iso && !br && !named) || !money ? smartLine(line, index + 1, today, people, categories) : null
    if (fallback) { rows.push(fallback); return }
    if (!money) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem valor' }); return }
    if (!iso && !br && !named) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem data' }); return }
    const date = iso ? makeDate(Number(iso[3]), Number(iso[2]), Number(iso[1]))
      : named ? dateFromDayMonth(Number(named[1]), MONTHS.indexOf(named[2].toLowerCase()) + 1, named[3] ? Number(named[3]) : null, today)
      : dateFromDayMonth(Number(br![1]), Number(br![2]), br![3] ? Number(br![3]) : null, today)
    if (!date) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'data inválida' }); return }
    const amount = money[2].includes(',') ? Number(money[2].replace(/\./g, '').replace(',', '.')) : Number(money[2])
    if (money[1]) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'crédito ou estorno' }); return }
    if (!(amount > 0)) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'valor zerado' }); return }
    const description = line.replace(money[0], ' ').replace(iso ? DATE_ISO : named ? DATE_TEXT : DATE_BR, ' ').replace(/\bR\$/g, ' ').replace(/\s+/g, ' ').trim()
    if (!description || /^(total|subtotal|pagamento|saldo|limite)\b/.test(plain(description))) { skipped.push({ line: index + 1, text: raw.trim(), reason: description ? 'linha de total' : 'sem descrição' }); return }
    rows.push({ line: index + 1, date, description: description.slice(0, 160), amount })
  })
  return { rows, skipped }
}

const CHAT_PREFIX = /^\[?\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?\s*\]?\s*-?\s*([^:]{1,40}):\s*(.+)$/
const NOTIFICATION = /\b(compra|aprovad[ao]|pagamento|d[eé]bito|cr[eé]dito|pix|cart[aã]o|gasto)\b/i
const MERCHANT = /\b(?:em|no|na|com|:)\s+([A-Za-zÀ-ú0-9*][^\n]*?)(?=\s+(?:hoje|ontem|[àa]s\s+\d|em\s+\d{1,2}\/|no\s+valor|valor|R\$)|\s*[.!]?$)/i

/** Linhas que não são de fatura: conversa de WhatsApp ("[12/11/2026 14:32] Ana: gastei 50 no mercado") e notificação do banco. */
function smartLine(line: string, number: number, today: string, people: string[], categories: string[]): PastedRow | null {
  const chat = line.match(CHAT_PREFIX)
  if (chat) {
    const parsed = parseQuickLine(chat[2], { people, categories, today })
    if (parsed.amount === null || !parsed.description) return null
    const sender = people.find((name) => plain(name) === plain(chat[1]) || plain(name).split(/\s+/)[0] === plain(chat[1]).split(/\s+/)[0])
    return { line: number, date: parsed.date, description: parsed.description.slice(0, 160), amount: parsed.amount, person: parsed.person ?? sender, origin: 'conversa' }
  }
  if (!NOTIFICATION.test(line)) return null
  const money = [...line.matchAll(MONEY)].pop()
  if (!money || money[1]) return null
  const amount = money[2].includes(',') ? Number(money[2].replace(/\./g, '').replace(',', '.')) : Number(money[2])
  if (!(amount > 0)) return null
  const at = money.index ?? 0
  const after = line.slice(at + money[0].length)
  const before = line.slice(0, at)
  const strip = (text: string) => text.replace(NOTIFICATION, ' ').replace(/\b(hoje|ontem|aprovad[ao]|(?:no\s+)?cart[aã]o|final\s*\d{4}|de|no valor|[àa]s\s+\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi, ' ')
  const merchant = after.match(MERCHANT)?.[1]
  const description = (merchant ?? strip(before + ' ' + after)).replace(/\s+/g, ' ').replace(/^[\s:\-–]+|[\s:\-–.]+$/g, '').slice(0, 160)
  if (!description) return null
  const low = plain(line)
  const date = low.includes('ontem') ? addDays(today, -1) : today
  return { line: number, date, description, amount, origin: 'notificação', dateGuessed: !low.includes('ontem') && !low.includes('hoje') }
}


// Extrato da conta (Nubank): "01/11/2026  -13,95  6ae6cfe6-dd27-4e1  Transferência enviada pelo Pix - NOME - CNPJ ...".
// O id é minúsculo e vem cortado, às vezes colado na descrição ("...4e1Transferência"), por isso só minúsculas entram no id.
const ACCOUNT_LINE = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s+(-?\s*\d[\d.]*(?:,\d+)?)\s+[0-9a-f]{8}-[0-9a-f-]*\s*(.*)$/
const ACCOUNT_HEADER = /^\s*data\s+valor\s+identificador\s+descri/i

function accountDescription(raw: string) {
  let text = raw.replace(/\s+/g, ' ').trim()
  const pix = text.match(/^Transfer[êe]ncia (enviada|recebida) pelo Pix - (.+)$/i)
  if (pix) text = `Pix - ${pix[2].split(' - ')[0].replace(/\s*\(.*\)\s*$/, '').replace(/\s*Ag[êe]ncia:.*$/i, '').trim()}`
  else text = text.replace(/^Pagamento de boleto efetuado - /i, 'Boleto - ').replace(/\s*Ag[êe]ncia:.*$/i, '').replace(/ - \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, '')
  return text.slice(0, 160)
}

/** Extrato da conta: negativo é o que saiu (gasto), positivo é o que entrou. Devolve null quando o texto não é um extrato. */
export function parseAccountStatement(source: string): PasteResult | null {
  const lines = fixMojibake(source).split(/\r?\n/).filter((l) => l.trim())
  const hits = lines.filter((l) => ACCOUNT_LINE.test(l)).length
  const body = lines.filter((l) => !ACCOUNT_HEADER.test(l)).length
  if (hits < 3 || hits < body * 0.6) return null
  const rows: PastedRow[] = []
  const skipped: PasteResult['skipped'] = []
  lines.forEach((raw, index) => {
    if (ACCOUNT_HEADER.test(raw)) return
    const m = raw.match(ACCOUNT_LINE)
    if (!m) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem valor' }); return }
    const date = makeDate(Number(m[1]), Number(m[2]), Number(m[3]))
    const signed = Number(m[4].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    const description = accountDescription(m[5])
    if (!date || !Number.isFinite(signed)) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'data inválida' }); return }
    if (INTERNAL_MOVE.test(plain(description))) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'movimentação entre as suas contas, não é gasto' }); return }
    if (signed >= 0) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'entrada de dinheiro' }); return }
    if (!description) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem descrição' }); return }
    rows.push({ line: index + 1, date, description, amount: Math.round(-signed * 100) / 100 })
  })
  return { rows, skipped }
}

// Print do app do banco (Nubank e parecidos): cada compra ocupa várias linhas, e o leitor de fotos solta lixo dos ícones.
//   MUFFATO COLOMBO 1/3
//   Fc] / R$ 254,79
//   06 de novembro - 10:00
const APP_MONEY = /(-)?\s*R\$\s*(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/
const APP_DATE = /^\W{0,4}([0-9ODIl]{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+(?:de\s+)?(\d{4}))?(?:\s*[-–,]?\s*(?:[àa]s\s+)?\d{1,2}[:h]\d{2})?\W*$/i
const APP_NOISE = /^(total|subtotal|pagamento|saldo|limite|vencimento|fatura|hist[óo]rico|outras faturas|estorno|cr[ée]dito|ajuste|juros|iof)\b/
const ocrDigits = (text: string) => text.replace(/[OD]/g, '0').replace(/[Il]/g, '1')

/** Lista de compras em várias linhas (descrição, valor e data separados). Devolve null quando o texto não tem esse jeito. */
export function parseAppScreen(text: string, today: string): PasteResult | null {
  const lines = text.split(/\r?\n/).map((raw, index) => ({ raw: raw.trim(), index })).filter((item) => item.raw)
  const dates = lines.filter((item) => APP_DATE.test(item.raw)).length
  if (dates < 2) return null
  const rows: PastedRow[] = []
  const skipped: PasteResult['skipped'] = []
  let current: { line: number; text: string; money?: RegExpMatchArray; date?: string } | null = null
  const flush = () => {
    if (!current) return
    const item = current
    current = null
    const description = item.text.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
    if (!item.money || !item.date) { skipped.push({ line: item.line, text: item.text, reason: !item.money ? 'sem valor' : 'sem data' }); return }
    if (APP_NOISE.test(plain(description))) { skipped.push({ line: item.line, text: item.text, reason: 'pagamento ou ajuste da fatura' }); return }
    if (item.money[1] || item.money[2]) { skipped.push({ line: item.line, text: item.text, reason: 'crédito ou estorno' }); return }
    const amount = Number(item.money[3].replace(/\./g, '').replace(',', '.'))
    if (!(amount > 0)) { skipped.push({ line: item.line, text: item.text, reason: 'valor zerado' }); return }
    rows.push({ line: item.line, date: item.date, description: description.slice(0, 160), amount })
  }
  for (const { raw, index } of lines) {
    const date = raw.match(APP_DATE)
    if (date) {
      const parsed = dateFromDayMonth(Number(ocrDigits(date[1])), MONTHS.indexOf(date[2].toLowerCase()) + 1, date[3] ? Number(date[3]) : null, today)
      if (current && parsed && !current.date) current.date = parsed
      continue
    }
    const money = raw.match(APP_MONEY)
    if (money) {
      const rest = raw.replace(money[0], ' ').replace(/[^A-Za-zÀ-ú0-9/ ]/g, ' ').trim()
      // Valor sozinho na linha (com lixo de ícone em volta) pertence à descrição de cima.
      if (current && !current.money && !/[A-Za-zÀ-ú]{3,}/.test(rest)) { current.money = money; continue }
      if (/[A-Za-zÀ-ú]{3,}/.test(rest)) { flush(); current = { line: index + 1, text: rest, money }; continue }
      continue
    }
    // Descrição: precisa de uma palavra de verdade; lixo de ícone ("[E", "Fc]") e cabeçalhos do app ficam de fora.
    const words = raw.replace(/[^A-Za-zÀ-ú0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/[A-Za-zÀ-ú]{3,}/.test(words)) continue
    flush()
    current = { line: index + 1, text: words }
  }
  flush()
  return rows.length >= 2 ? { rows, skipped } : null
}

const DUE_TEXT = /venc(?:imento|e|eu)?\w*\s*(?:em|dia)?\s*:?\s*(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+(?:de\s+)?(\d{4}))?/i
const DUE_NUM = /venc(?:imento|e|eu)?\w*\s*(?:em|dia)?\s*:?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i

/** Vencimento escrito na fatura ou no print ("Vencimento 10 de dezembro", "Vence em 10/12"): a fatura leva o nome desse mês. */
export function detectDueDate(text: string, today: string): { date: string; period: string; day: number } | null {
  const named = text.match(DUE_TEXT)
  const num = named ? null : text.match(DUE_NUM)
  const m = named ?? num
  if (!m) return null
  const day = Number(m[1])
  const month = named ? MONTHS.indexOf(named[2].toLowerCase()) + 1 : Number(m[2])
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4))
  // Sem ano: o vencimento é o próximo (ou um que acabou de passar), nunca um de quase um ano atrás.
  if (!m[3] && makeDate(day, month, year) && makeDate(day, month, year)! < addDays(today, -60)) year += 1
  const date = makeDate(day, month, year)
  if (!date) return null
  return { date, period: `${date.slice(0, 7)}-01`, day }
}
