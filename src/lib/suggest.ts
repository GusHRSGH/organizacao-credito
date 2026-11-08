import { plain } from './quickEntry'
import type { Transaction } from '../types'

export interface Suggestion { person: string | null; category: string | null }

/** Remove sufixos como "(2/5)" ou "02/05" para que as parcelas de uma compra contem como a mesma descrição. */
const clean = (description: string) => plain(description).replace(/\(?\b\d{1,2}\/\d{1,2}\b\)?/g, '').replace(/\s+/g, ' ').trim()

/** Para cada descrição já usada, guarda o responsável e a categoria do lançamento mais recente. */
export function buildSuggestions(transactions: Transaction[]) {
  const latest = new Map<string, { on: string; value: Suggestion }>()
  for (const row of transactions) {
    const key = clean(row.description)
    if (!key) continue
    const known = latest.get(key)
    if (!known || row.occurred_on >= known.on) latest.set(key, { on: row.occurred_on, value: { person: row.person?.name ?? null, category: row.category?.name ?? null } })
  }
  return new Map([...latest].map(([key, entry]) => [key, entry.value]))
}

/** Acha pelo texto igual ou, na falta, por uma descrição conhecida que comece com ele (mínimo de 3 letras). */
export function suggestFor(text: string, suggestions: Map<string, Suggestion>): Suggestion | null {
  const key = clean(text)
  if (key.length < 2) return null
  const exact = suggestions.get(key)
  if (exact) return exact
  if (key.length < 3) return null
  for (const [known, value] of suggestions) if (known.startsWith(key)) return value
  return null
}

export function knownDescriptions(transactions: Transaction[], limit = 200) {
  const seen = new Map<string, string>()
  for (const row of [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))) {
    const key = clean(row.description)
    if (key && !seen.has(key)) seen.set(key, row.description.replace(/\s*\(?\b\d{1,2}\/\d{1,2}\b\)?\s*$/, '').trim() || row.description)
    if (seen.size >= limit) break
  }
  return [...new Set(seen.values())]
}
