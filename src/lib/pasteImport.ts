import { addDays, dateFromDayMonth, makeDate, parseQuickLine, plain } from './quickEntry'

export interface PastedRow { line: number; date: string; description: string; amount: number; person?: string; /** Como o robô chegou nessa linha, quando não foi o formato de fatura. */ origin?: 'notificação' | 'conversa'; dateGuessed?: boolean }
export interface PasteResult { rows: PastedRow[]; skipped: Array<{ line: number; text: string; reason: string }> }

const MONEY = /(?:R\$\s*)?(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/g
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/
const DATE_BR = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DATE_TEXT = /\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+(?:de\s+)?(\d{4}))?(?![a-zç])/i

/** Lê texto colado da fatura do banco (uma compra por linha) e separa o que é lançamento do que é ruído. */
export function parsePastedBill(text: string, today: string, people: string[] = [], categories: string[] = []): PasteResult {
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
