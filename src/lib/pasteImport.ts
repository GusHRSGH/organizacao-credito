import { dateFromDayMonth, makeDate, plain } from './quickEntry'

export interface PastedRow { line: number; date: string; description: string; amount: number }
export interface PasteResult { rows: PastedRow[]; skipped: Array<{ line: number; text: string; reason: string }> }

const MONEY = /(?:R\$\s*)?(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/g
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/
const DATE_BR = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/

/** Lê texto colado da fatura do banco (uma compra por linha) e separa o que é lançamento do que é ruído. */
export function parsePastedBill(text: string, today: string): PasteResult {
  const rows: PastedRow[] = []
  const skipped: PasteResult['skipped'] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\t|;/g, '  ').trim()
    if (!line) return
    const money = [...line.matchAll(MONEY)].pop()
    const iso = line.match(DATE_ISO)
    const br = iso ? null : line.match(DATE_BR)
    if (!money) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem valor' }); return }
    if (!iso && !br) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'sem data' }); return }
    const date = iso ? makeDate(Number(iso[3]), Number(iso[2]), Number(iso[1])) : dateFromDayMonth(Number(br![1]), Number(br![2]), br![3] ? Number(br![3]) : null, today)
    if (!date) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'data inválida' }); return }
    const amount = money[2].includes(',') ? Number(money[2].replace(/\./g, '').replace(',', '.')) : Number(money[2])
    if (money[1]) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'crédito ou estorno' }); return }
    if (!(amount > 0)) { skipped.push({ line: index + 1, text: raw.trim(), reason: 'valor zerado' }); return }
    const description = line.replace(money[0], ' ').replace(iso ? DATE_ISO : DATE_BR, ' ').replace(/\bR\$/g, ' ').replace(/\s+/g, ' ').trim()
    if (!description || /^(total|subtotal|pagamento|saldo|limite)\b/.test(plain(description))) { skipped.push({ line: index + 1, text: raw.trim(), reason: description ? 'linha de total' : 'sem descrição' }); return }
    rows.push({ line: index + 1, date, description: description.slice(0, 160), amount })
  })
  return { rows, skipped }
}
