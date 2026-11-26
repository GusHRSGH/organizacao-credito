import { plain } from './quickEntry'
import { guessCategory } from './keywords'
import type { Transaction } from '../types'

export interface Suggestion { person: string | null; category: string | null }

/** Prefixos de maquininha ("PG *", "IFD*", "MP *") que escondem o nome da loja. */
const ACQUIRER = /^(pg|ifd|mp|ec|pag|pagseguro|mercadopago|sumup|stone|ton)\s*\*\s*/

/** Remove parcela ("(2/5)", "02/05"), prefixo de maquininha e códigos numéricos, para a mesma loja contar como a mesma descrição. */
export const historyKey = (description: string) => plain(description).replace(/\(?\b\d{1,2}\/\d{1,2}\b\)?/g, '').replace(ACQUIRER, '').replace(/\b\d{3,}\b/g, '').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Palavras que não identificam a loja sozinhas: nelas a marca é a palavra seguinte. */
const GENERIC = new Set(['compra', 'pagamento', 'pag', 'loja', 'lojas', 'supermercado', 'mercado', 'farmacia', 'drogaria', 'restaurante', 'lanchonete', 'padaria', 'posto', 'auto', 'de', 'do', 'da', 'dos', 'das', 'the', 'casa', 'comercial', 'comercio'])

/** A marca da loja: "MUFFATO COLOMBO" e "MUFFATO JOAO PAULINO" são o mesmo Muffato. */
export function brandOf(key: string) {
  const words = key.split(' ').filter((word) => word.length >= 2)
  const picked: string[] = []
  for (const word of words) {
    picked.push(word)
    if (!GENERIC.has(word)) break
  }
  const brand = picked.join(' ')
  return brand.replace(/\s/g, '').length >= 4 && !GENERIC.has(brand) ? `~marca:${brand}` : null
}

/**
 * Para cada descrição já usada, guarda o responsável e a categoria do lançamento mais recente.
 * Também aprende por marca (chave "~marca:..."): quem mais compra naquela loja, se for a maioria clara.
 */
export function buildSuggestions(transactions: Transaction[]) {
  const latest = new Map<string, { on: string; value: Suggestion }>()
  const brands = new Map<string, { people: Map<string, number>; categories: Map<string, number> }>()
  for (const row of transactions) {
    const key = historyKey(row.description)
    if (!key) continue
    const known = latest.get(key)
    if (!known || row.occurred_on >= known.on) latest.set(key, { on: row.occurred_on, value: { person: row.person?.name ?? null, category: row.category?.name ?? null } })
    const brand = brandOf(key)
    if (!brand) continue
    const stats = brands.get(brand) ?? { people: new Map(), categories: new Map() }
    if (row.person?.name) stats.people.set(row.person.name, (stats.people.get(row.person.name) ?? 0) + 1)
    if (row.category?.name) stats.categories.set(row.category.name, (stats.categories.get(row.category.name) ?? 0) + 1)
    brands.set(brand, stats)
  }
  const result = new Map([...latest].map(([key, entry]) => [key, entry.value]))
  // Maioria clara (60% ou mais): numa loja que todo mundo usa, o robô não chuta.
  const winner = (counts: Map<string, number>) => {
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
    const [name, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    return name && n / total >= 0.6 ? name : null
  }
  for (const [brand, stats] of brands) {
    const value = { person: winner(stats.people), category: winner(stats.categories) }
    if (value.person || value.category) result.set(brand, value)
  }
  return result
}

/** Acha pelo texto igual ou, na falta, por uma descrição conhecida que comece com ele (mínimo de 3 letras). */
export function byHistory(text: string, suggestions: Map<string, Suggestion>): Suggestion | null {
  const key = historyKey(text)
  if (key.length < 2) return null
  const exact = suggestions.get(key)
  if (exact) return exact
  if (key.length < 3) return null
  for (const [known, value] of suggestions) if (!known.startsWith('~') && known.startsWith(key)) return value
  const brand = brandOf(key)
  return (brand && suggestions.get(brand)) || null
}

/** Primeiro o histórico da pessoa; se não achar, tenta adivinhar a categoria por palavras comuns. */
export function suggestFor(text: string, suggestions: Map<string, Suggestion>): Suggestion | null {
  const history = byHistory(text, suggestions)
  if (history) return history
  const categories = [...new Set([...suggestions.values()].map((value) => value.category).filter((name): name is string => !!name))]
  const category = guessCategory(text, categories)
  return category ? { person: null, category } : null
}

export function knownDescriptions(transactions: Transaction[], limit = 200) {
  const seen = new Map<string, string>()
  for (const row of [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))) {
    const key = historyKey(row.description)
    if (key && !seen.has(key)) seen.set(key, row.description.replace(/\s*\(?\b\d{1,2}\/\d{1,2}\b\)?\s*$/, '').trim() || row.description)
    if (seen.size >= limit) break
  }
  return [...new Set(seen.values())]
}

const cents = (value: number) => Math.round(Number(value) * 100)
export const installmentKey = (description: string, amount: number, count: number) => `${historyKey(description)}|${cents(amount)}|${count}`

/** Parcelas já lançadas: a mesma compra (nome, valor e total de parcelas) continua com o mesmo responsável e categoria. */
export function buildInstallmentSuggestions(transactions: Transaction[]) {
  const latest = new Map<string, { n: number; value: Suggestion }>()
  for (const row of transactions) {
    if (!row.installment_count) continue
    const key = installmentKey(row.description, Number(row.amount), row.installment_count)
    const known = latest.get(key)
    const n = row.installment_number ?? 0
    if (!known || n >= known.n) latest.set(key, { n, value: { person: row.person?.name ?? null, category: row.category?.name ?? null } })
  }
  return new Map([...latest].map(([key, entry]) => [key, entry.value]))
}
