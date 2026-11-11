import { plain } from './quickEntry'
import type { Transaction } from '../types'

/** Nomes que o banco escreve de vários jeitos, e o jeito certo de chamar. A ordem importa: o primeiro que casar vence. */
const ALIASES: Array<[RegExp, string]> = [
  [/^uber\s*\*?\s*eats\b/i, 'Uber Eats'],
  [/^uber\b/i, 'Uber'],
  [/^ifood\b/i, 'iFood'],
  [/^(mercado\s?livre|mercadolivre|meli)\b|^mercadolivre\s*\*|^mercado\s*\*\s*mercado\s?livre/i, 'Mercado Livre'],
  [/^mlp\s*\*?\s*magalu/i, 'Magalu'],
  [/^amazon\s*(prime\s*video|prime)\b/i, 'Amazon Prime'],
  [/^amazon\b|^amzn\b/i, 'Amazon'],
  [/^netflix\b/i, 'Netflix'],
  [/^spotify\b/i, 'Spotify'],
  [/^shopee\b/i, 'Shopee'],
  [/^shein\b/i, 'Shein'],
  [/^(magalu|magazine\s?luiza)\b/i, 'Magalu'],
  [/^rappi\b/i, 'Rappi'],
  [/^(99\s?(app|pop|taxi|tecnologia)|99\s?\*)/i, '99'],
  [/^apple\.com\/bill|^apple\s*(services|bill)\b/i, 'Apple'],
  [/^google\s*\*?\s*(youtube|one|play|storage)/i, 'Google'],
  [/^disney\s*\+?\s*(plus)?\b/i, 'Disney+'],
  [/^(hbo|max)\s*\*?\s*(max|plus)?\b/i, 'Max'],
]

const PROCESSOR = /^(pgz|pg|pag|mp|ps|sq|ifd|paypal|pagseguro|mercadopago|picpay|stone|cielo|getnet|zp|ec)\s*\*\s*/i
const INSTALLMENT = /\s*[(-]?\s*(?:parcela\s*)?\b\d{1,2}\s*\/\s*\d{1,2}\b\s*\)?\s*$/i
const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o'])

function titleCase(text: string) {
  return text.toLocaleLowerCase('pt-BR').split(' ').map((word, i) => {
    if (!word) return word
    if (word.length <= 3 && !/[aeiouáéíóúâêôãõ]/.test(word)) return word.toLocaleUpperCase('pt-BR')
    if (i > 0 && SMALL.has(word)) return word
    return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  }).join(' ')
}

/** Tira o ruído que o banco coloca na descrição ("UBER *TRIP 8842" vira "Uber"). Não mexe no que já está limpo. */
export function cleanDescription(raw: string): string {
  const original = raw.trim().replace(/\s+/g, ' ')
  if (!original) return original
  const suffix = original.match(INSTALLMENT)?.[0] ?? ''
  let text = suffix ? original.slice(0, original.length - suffix.length) : original
  const seller = text.match(/^mercado\s*\*\s*(?!mercado\s?livre)(\S.*)$/i)
  if (seller) return `Mercado Livre ${titleCase(seller[1].trim())}${suffix}`.replace(/\s+/g, ' ').trim()
  text = text.replace(PROCESSOR, '')
  const alias = ALIASES.find(([pattern]) => pattern.test(text))
  if (alias) return `${alias[1]}${suffix}`.replace(/\s+/g, ' ').trim()
  text = text.replace(/\*+/g, ' ')
  // códigos no fim: números longos, mistura de letras e números, "xxxx", cidade/país do cartão
  text = text.replace(/(?:\s+(?:\d{3,}|[A-Za-z]*\d+[A-Za-z\d]*\d[A-Za-z\d]*|x{3,}\d*))+\s*$/i, '')
  text = text.replace(/\s+(?:br|bra|brasil|sp|rj|mg|pr|sc|rs|ba|pe|ce|df|go)\s*$/i, '')
  text = text.replace(/[\s\-–.:,]+$/g, '').replace(/^[\s\-–.:,]+/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return original
  if (text === text.toLocaleUpperCase('pt-BR') && /[A-ZÀ-Ú]/.test(text)) text = titleCase(text)
  return `${text}${suffix}`.replace(/\s+/g, ' ').trim()
}

export interface DescriptionFix { from: string[]; to: string; count: number }
export interface NameFix { from: string[]; to: string; count: number; /** Parece a mesma coisa, mas não tenho certeza. */ maybe: boolean }

/** Descrições a limpar. Quando várias viram a mesma, usa a forma mais comum; só propõe o que de fato muda. */
export function planDescriptions(transactions: Transaction[]): DescriptionFix[] {
  const counts = new Map<string, number>()
  for (const row of transactions) counts.set(row.description, (counts.get(row.description) ?? 0) + 1)
  const groups = new Map<string, Array<{ raw: string; cleaned: string; n: number }>>()
  for (const [raw, n] of counts) {
    const cleaned = cleanDescription(raw)
    const key = plain(cleaned)
    groups.set(key, [...(groups.get(key) ?? []), { raw, cleaned, n }])
  }
  const fixes: DescriptionFix[] = []
  for (const list of groups.values()) {
    const votes = new Map<string, number>()
    for (const item of list) votes.set(item.cleaned, (votes.get(item.cleaned) ?? 0) + item.n)
    const to = [...votes].sort((a, b) => b[1] - a[1] || Number(/^[A-ZÀ-Ú]/.test(b[0])) - Number(/^[A-ZÀ-Ú]/.test(a[0])))[0][0]
    const from = list.filter((item) => item.raw !== to)
    if (from.length) fixes.push({ from: from.map((item) => item.raw), to, count: from.reduce((sum, item) => sum + item.n, 0) })
  }
  return fixes.sort((a, b) => b.count - a.count)
}

const stem = (name: string) => plain(name).replace(/\s+/g, ' ').replace(/(.{4,})s$/, '$1')

/** Pessoas ou categorias que parecem repetidas: plural, acento, espaço. Em pessoas, "Ana" e "Ana Lima" entram como "talvez". */
export function planMerge(names: Array<{ name: string; count: number }>, kind: 'person' | 'category'): NameFix[] {
  const groups = new Map<string, Array<{ name: string; count: number }>>()
  for (const item of names) groups.set(stem(item.name), [...(groups.get(stem(item.name)) ?? []), item])
  const fixes: NameFix[] = []
  const used = new Set<string>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => b.count - a.count || a.name.length - b.name.length)
    fixes.push({ from: sorted.slice(1).map((item) => item.name), to: sorted[0].name, count: sorted.slice(1).reduce((n, item) => n + item.count, 0), maybe: false })
    list.forEach((item) => used.add(item.name))
  }
  if (kind === 'person') {
    const rest = names.filter((item) => !used.has(item.name))
    for (const short of rest.filter((item) => !item.name.includes(' '))) {
      const longer = rest.filter((item) => item.name !== short.name && plain(item.name).split(' ')[0] === plain(short.name))
      if (longer.length === 1) fixes.push({ from: [short.name], to: longer[0].name, count: short.count, maybe: true })
    }
  }
  return fixes.sort((a, b) => Number(a.maybe) - Number(b.maybe) || b.count - a.count)
}

export interface CleanupPlan {
  descriptions: Array<{ from: string[]; to: string }>
  people: Array<{ from: string[]; to: string }>
  categories: Array<{ from: string[]; to: string }>
}
