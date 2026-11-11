// Lê o texto de uma notificação de compra do banco ("Compra aprovada de R$ 89,90 em MERCADO LIVRE")
// e devolve valor, estabelecimento, parcelas e data, para virar um lançamento sem digitar nada.

import { dateFromDayMonth, parseMoney } from './quickEntry'

export interface BankNotice {
  description: string
  amount: number
  installments: number
  /** Data escrita na notificação (AAAA-MM-DD); null quando ela não traz data, e vale hoje. */
  date: string | null
}

const MONEY = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i
const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na'])
const NOT_PLACE = /^(cart[aã]o|cr[eé]dito|d[eé]bito|final|fatura|conta|aprovad|\d)/i

/** "MERCADO LIVRE*ABC" vira "Mercado Livre Abc"; texto já misturado (maiúsculas e minúsculas) fica como está. */
function titleCase(text: string) {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (!letters || letters !== letters.toLocaleUpperCase('pt-BR')) return text
  return text.toLocaleLowerCase('pt-BR').split(' ').map((word, index) => (index > 0 && SMALL.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1))).join(' ')
}

function cleanPlace(raw: string) {
  let place = raw
    .replace(/\b(?:[àa]s\s+)?\d{1,2}[:h]\d{2}\b.*$/i, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b.*$/, '')
    .replace(/\b(?:no\s+)?cart[aã]o\b.*$/i, '')
    .replace(/\bfinal\s*\d{3,4}\b.*$/i, '')
    .replace(/\b(?:parcelad[oa]\s+)?em\s+\d{1,2}\s*(?:x|vezes)\b.*$/i, '')
    .replace(/\b\d{1,2}\s*x\s+de\s+R\$.*$/i, '')
    .replace(/^(?:pag|mp|ifd|pg|ec|sumup|zp|pp)\s*\*\s*/i, '')
    .replace(/\s*\*\s*/g, ' ')
    .replace(/[\s.,;:!|-]+$/g, '')
    .replace(/^[\s.,;:!|-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  place = place.slice(0, 60)
  return place ? titleCase(place) : ''
}

export function parseNotification(text: string, today: string): BankNotice | null {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat || flat.length > 400) return null
  const money = flat.match(MONEY)
  if (!money) return null
  // Só compra no cartão: pix, transferência, saque e avisos de fatura ficam de fora.
  if (!/\b(?:compra|aprovad[ao]|cr[eé]dito|parcelad[oa])\b/i.test(flat)) return null
  if (/\b(?:pix|transfer[eê]ncia|ted|doc|saque|dep[oó]sito|saldo|fatura (?:fechou|vence|dispon)|limite dispon|boleto)\b/i.test(flat)) return null
  if (/\bd[eé]bito\b/i.test(flat) && !/\bcr[eé]dito\b/i.test(flat)) return null

  let amount = parseMoney(money[1])
  if (amount === null || !(amount > 0)) return null

  let installments = 1
  const perParcel = flat.match(/\b(\d{1,2})\s*x\s+de\s+R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i)
  if (perParcel) {
    const count = Number(perParcel[1])
    const each = parseMoney(perParcel[2])
    if (count >= 2 && count <= 48 && each !== null) { installments = count; amount = Math.round(each * count * 100) / 100 }
  } else {
    const plain = flat.match(/\b(?:parcelad[oa]\s+)?em\s+(\d{1,2})\s*(?:x|vezes)\b/i) ?? flat.match(/\b(\d{1,2})\s*x\b/i)
    if (plain && Number(plain[1]) >= 2 && Number(plain[1]) <= 48) installments = Number(plain[1])
  }

  let date: string | null = null
  const day = flat.match(/(?<![\d/:])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/)
  if (day) date = dateFromDayMonth(Number(day[1]), Number(day[2]), day[3] ? Number(day[3]) : null, today)

  const after = flat.slice((money.index ?? 0) + money[0].length)
  let description = ''
  for (const match of after.matchAll(/\b(?:em|no|na|at)\s+([^.;|]+)/gi)) {
    if (NOT_PLACE.test(match[1].trim())) continue
    description = cleanPlace(match[1])
    if (description) break
  }
  if (!description) {
    const lead = after.replace(/^[\s,:;|–-]+/, '').replace(/^aprovad[ao]\b[\s,:;|–-]*/i, '')
    if (!NOT_PLACE.test(lead)) description = cleanPlace(lead)
  }
  if (!description) {
    const before = flat.slice(0, money.index ?? 0).match(/\b(?:em|no|na|at)\s+([^.;|]+?)\s*(?:de|por)?\s*$/i)
    if (before && !NOT_PLACE.test(before[1].trim())) description = cleanPlace(before[1])
  }
  return { description, amount, installments, date }
}

const brl = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Texto no formato do lançamento rápido. O valor vai por último, para números no nome da loja não confundirem a leitura. */
export function toQuickLine(notice: BankNotice) {
  const date = notice.date ? `${notice.date.slice(8, 10)}/${notice.date.slice(5, 7)}/${notice.date.slice(0, 4)}` : ''
  return [notice.description, notice.installments > 1 ? `${notice.installments}x` : '', date, brl(notice.amount)].filter(Boolean).join(' ')
}
