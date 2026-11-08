// Interpreta uma linha digitada, como "mercado 150,90 3x @ana #casa ontem".
// Tudo é opcional, menos o valor. O que sobra do texto vira a descrição.

export interface QuickContext { people: string[]; categories: string[]; today: string }

export interface QuickParsed {
  description: string
  amount: number | null
  installments: number
  date: string
  person: string | null
  category: string | null
}

export const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim()

/** Converte "1.234,56", "150,9" ou "150.90" em número; devolve null se não parecer dinheiro. */
export function parseMoney(raw: string): number | null {
  const text = raw.replace(/^r\$\s*/i, '').trim()
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) return Number(text.replace(/\./g, '').replace(',', '.'))
  if (/^\d+(,\d{1,2})?$/.test(text)) return Number(text.replace(',', '.'))
  if (/^\d+\.\d{1,2}$/.test(text)) return Number(text)
  return null
}

const pad = (value: number) => String(value).padStart(2, '0')

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Monta uma data ISO válida a partir de dia/mês/ano, ou devolve null. */
export function makeDate(day: number, month: number, year: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "dd/mm" sem ano usa o ano de `today`, ou o anterior se a data cair no futuro (fatura de dezembro lida em janeiro). */
export function dateFromDayMonth(day: number, month: number, year: number | null, today: string) {
  const currentYear = Number(today.slice(0, 4))
  if (year !== null) return makeDate(day, month, year < 100 ? 2000 + year : year)
  const same = makeDate(day, month, currentYear)
  if (same && same <= today) return same
  return makeDate(day, month, currentYear - 1) ?? same
}

function matchKnown(word: string, known: string[], allowFirstWord: boolean) {
  const target = plain(word)
  if (!target) return null
  return known.find((name) => plain(name) === target) ?? (allowFirstWord ? known.find((name) => plain(name).split(/\s+/)[0] === target) ?? null : null)
}

export function parseQuickLine(text: string, ctx: QuickContext): QuickParsed {
  const out: QuickParsed = { description: '', amount: null, installments: 1, date: ctx.today, person: null, category: null }
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const kept: Array<string | null> = tokens.map((token) => token)
  let amountIndex = -1

  tokens.forEach((token, index) => {
    const low = plain(token)
    if (low === 'r$') { kept[index] = null; return }
    const installments = low.match(/^(\d{1,2})x$/) ?? low.match(/^x(\d{1,2})$/)
    if (installments && Number(installments[1]) >= 1 && Number(installments[1]) <= 48) { out.installments = Number(installments[1]); kept[index] = null; return }
    if (low === 'hoje') { out.date = ctx.today; kept[index] = null; return }
    if (low === 'ontem') { out.date = addDays(ctx.today, -1); kept[index] = null; return }
    if (low === 'anteontem') { out.date = addDays(ctx.today, -2); kept[index] = null; return }
    const day = low.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
    if (day) {
      const iso = dateFromDayMonth(Number(day[1]), Number(day[2]), day[3] ? Number(day[3]) : null, ctx.today)
      if (iso) { out.date = iso; kept[index] = null; return }
    }
    if (token.startsWith('@') && token.length > 1) { out.person = matchKnown(token.slice(1), ctx.people, true) ?? token.slice(1); kept[index] = null; return }
    if (token.startsWith('#') && token.length > 1) { out.category = matchKnown(token.slice(1), ctx.categories, false) ?? token.slice(1); kept[index] = null; return }
    if (parseMoney(token) !== null) amountIndex = index
  })

  if (amountIndex >= 0) { out.amount = parseMoney(tokens[amountIndex]); kept[amountIndex] = null }

  // Palavras soltas que são exatamente uma pessoa ou categoria já cadastrada.
  kept.forEach((token, index) => {
    if (token === null) return
    if (out.person === null) { const person = matchKnown(token, ctx.people, true); if (person) { out.person = person; kept[index] = null; return } }
    if (out.category === null) { const category = matchKnown(token, ctx.categories, false); if (category) { out.category = category; kept[index] = null } }
  })

  out.description = kept.filter((token): token is string => token !== null).join(' ').trim()
  if (out.amount !== null && !(out.amount > 0)) out.amount = null
  return out
}
