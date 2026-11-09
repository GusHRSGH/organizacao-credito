// Interpreta uma linha digitada, como "mercado 150,90 3x @ana #casa ontem".
// Tudo é opcional, menos o valor. O que sobra do texto vira a descrição.

export interface QuickContext { people: string[]; categories: string[]; today: string; /** Mês da fatura aberta (AAAA-MM-01). Base para "próximos 3 meses" e "em janeiro". */ basePeriod?: string }

export interface QuickParsed {
  description: string
  amount: number | null
  installments: number
  date: string
  person: string | null
  category: string | null
  /** Faturas pedidas por extenso ("em novembro, janeiro e fevereiro", "nos próximos 3 meses"). Vazio = só a fatura aberta. */
  months: string[]
}

const capital = (word: string) => word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)

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

const MONTH_WORDS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTH_RE = '(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:[cç]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)'
const addPeriod = (period: string, months: number) => {
  const [y, m] = period.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }
const FILLER = new Set(['gastei', 'paguei', 'comprei', 'gasto', 'compra', 'foi', 'fui', 'de', 'do', 'da', 'no', 'na', 'em', 'com', 'a', 'o', 'um', 'uma', 'pra', 'para', 'por', 'e', 'la', 'reais', 'real', 'conto', 'contos', 'pila', 'pilas', 'parcelado', 'parcelada'])

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** Entende o jeito de falar: "1,5 mil", "em 3 vezes", "dia 5", "sexta passada", "com a Ana". Devolve o texto limpo e o que achou. */
function understandSpeech(text: string, ctx: QuickContext) {
  let rest = ` ${text} `
  const found: { installments?: number; date?: string; months?: string[] } = {}
  const base = ctx.basePeriod ?? `${ctx.today.slice(0, 7)}-01`
  const monthOf = (name: string, year?: string) => {
    const index = MONTH_WORDS.findIndex((word) => plain(name).startsWith(word))
    if (index < 0) return null
    const [baseYear, baseMonth] = base.split('-').map(Number)
    const y = year ? Number(year) : index + 1 >= baseMonth ? baseYear : baseYear + 1
    return `${y}-${String(index + 1).padStart(2, '0')}-01`
  }
  const monthsBetween = (from: string, to: string) => {
    const list: string[] = []
    for (let p = from; p <= to && list.length < 24; p = addPeriod(p, 1)) list.push(p)
    return list
  }
  rest = rest.replace(new RegExp(`\\btodo m[eê]s\\s+at[eé]\\s+(${MONTH_RE})(?:\\s+de\\s+(\\d{4}))?`, 'i'), (all, name: string, year?: string) => {
    const end = monthOf(name, year)
    if (!end || end < base) return all
    found.months = monthsBetween(base, end)
    return ' '
  })
  rest = rest.replace(/\b(?:(?:nos|pelos|por|durante)\s+)?(?:(?:os\s+)?pr[oó]ximos?\s+)?(\d{1,2})\s+meses\b/i, (all, n: string) => {
    const count = Number(n)
    if (count < 2 || count > 24) return all
    found.months = Array.from({ length: count }, (_, i) => addPeriod(base, i))
    return ' '
  })
  rest = rest.replace(new RegExp(`\\b(?:em|no|nos meses de|nos meses|para)\\s+((?:${MONTH_RE})(?:\\s*(?:,|e)\\s*(?:${MONTH_RE}))*)(?!\\p{L})`, 'iu'), (_all, list: string) => {
    const names = list.match(new RegExp(MONTH_RE, 'gi')) ?? []
    found.months = [...new Set(names.map((name) => monthOf(name)).filter((p): p is string => !!p))].sort()
    return ' '
  })
  rest = rest.replace(/\b(\d+(?:[.,]\d+)?)\s*(mil|k)\b/gi, (_, n: string) => String(Math.round(Number(n.replace(',', '.')) * 1000)))
  rest = rest.replace(/\b(?:parcelad[oa]\s+)?(?:em\s+)?(\d{1,2})\s*(?:vezes|x)\b/gi, (all, n: string) => { const count = Number(n); if (count < 1 || count > 48) return all; found.installments = count; return ' ' })
  rest = rest.replace(/\bsemana passada\b/gi, () => { found.date = addDays(ctx.today, -7); return ' ' })
  rest = rest.replace(/\bdia\s+(\d{1,2})\b/gi, (all, d: string) => {
    const day = Number(d)
    const [y, m] = ctx.today.split('-').map(Number)
    const thisMonth = makeDate(day, m, y)
    const iso = thisMonth && thisMonth <= ctx.today ? thisMonth : makeDate(day, m === 1 ? 12 : m - 1, m === 1 ? y - 1 : y)
    if (!iso) return all
    found.date = iso
    return ' '
  })
  rest = rest.replace(/\b(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(?:-feira)?(\s+passad[oa])?\b/gi, (_, name: string, past?: string) => {
    const target = WEEKDAYS[plain(name)]
    let back = (weekdayOf(ctx.today) - target + 7) % 7
    if (back === 0 && past) back = 7
    found.date = addDays(ctx.today, -back)
    return ' '
  })
  // "com a Ana", "pra Bia", "da Ana": só vira responsável se o nome já existe
  for (const person of ctx.people) {
    const first = person.split(/\s+/)[0]
    if (first.length < 2) continue
    const safe = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rest = rest.replace(new RegExp(`\\b(?:com|pra|para|da|do|de)\\s+(?:a\\s+|o\\s+)?${safe}(?![\\p{L}\\d])`, 'iu'), ` @${first} `)
  }
  return { text: rest.replace(/\s+/g, ' ').trim(), found }
}

export function parseQuickLine(text: string, ctx: QuickContext): QuickParsed {
  const out: QuickParsed = { description: '', amount: null, installments: 1, date: ctx.today, person: null, category: null, months: [] }
  const speech = understandSpeech(text, ctx)
  if (speech.found.installments) out.installments = speech.found.installments
  if (speech.found.date) out.date = speech.found.date
  if (speech.found.months) out.months = speech.found.months
  const tokens = speech.text.split(/\s+/).filter(Boolean)
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
    if (token.startsWith('@') && token.length > 1) { out.person = matchKnown(token.slice(1), ctx.people, true) ?? capital(token.slice(1)); kept[index] = null; return }
    if (token.startsWith('#') && token.length > 1) { out.category = matchKnown(token.slice(1), ctx.categories, false) ?? capital(token.slice(1)); kept[index] = null; return }
    if (parseMoney(token) !== null) amountIndex = index
  })

  if (amountIndex >= 0) { out.amount = parseMoney(tokens[amountIndex]); kept[amountIndex] = null }

  let looseCategory = ''
  // Palavras soltas que são exatamente uma pessoa ou categoria já cadastrada.
  kept.forEach((token, index) => {
    if (token === null) return
    if (out.person === null) { const person = matchKnown(token, ctx.people, true); if (person) { out.person = person; kept[index] = null; return } }
    if (out.category === null) { const category = matchKnown(token, ctx.categories, false); if (category) { out.category = category; kept[index] = null; looseCategory = token } }
  })

  const words = kept.filter((token): token is string => token !== null)
  // tira as palavrinhas das pontas ("gastei", "no", "com a") sem esvaziar a descrição
  const isFiller = (word: string) => FILLER.has(plain(word))
  let from = 0
  let to = words.length
  while (from < to && isFiller(words[from])) from++
  while (to > from && isFiller(words[to - 1])) to--
  out.description = words.slice(from, to).join(' ').trim()
  if (!out.description && looseCategory) out.description = looseCategory
  if (!out.description && out.amount !== null) out.description = words.join(' ').trim()
  if (out.amount !== null && !(out.amount > 0)) out.amount = null
  return out
}
