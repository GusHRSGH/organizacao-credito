import { plain } from './quickEntry'
import { guessCategory } from './keywords'
import type { Transaction } from '../types'

export interface Suggestion { person: string | null; category: string | null }

/** Remove sufixos como "(2/5)" ou "02/05" para que as parcelas de uma compra contem como a mesma descrição. */
export const historyKey = (description: string) => plain(description).replace(/\(?\b\d{1,2}\/\d{1,2}\b\)?/g, '').replace(/\s+/g, ' ').trim()

/** Para cada descrição já usada, guarda o responsável e a categoria do lançamento mais recente. */
export function buildSuggestions(transactions: Transaction[]) {
  const latest = new Map<string, { on: string; value: Suggestion }>()
  for (const row of transactions) {
    const key = historyKey(row.description)
    if (!key) continue
    const known = latest.get(key)
    if (!known || row.occurred_on >= known.on) latest.set(key, { on: row.occurred_on, value: { person: row.person?.name ?? null, category: row.category?.name ?? null } })
  }
  return new Map([...latest].map(([key, entry]) => [key, entry.value]))
}

/** Acha pelo texto igual ou, na falta, por uma descrição conhecida que comece com ele (mínimo de 3 letras). */
export function byHistory(text: string, suggestions: Map<string, Suggestion>): Suggestion | null {
  const key = historyKey(text)
  if (key.length < 2) return null
  const exact = suggestions.get(key)
  if (exact) return exact
  if (key.length < 3) return null
  for (const [known, value] of suggestions) if (known.startsWith(key)) return value
  return null
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
