import { keyOf } from './watch'
import type { Transaction } from '../types'

export interface BankLine { id: number; date: string; description: string; amount: number }
export interface Reconciliation {
  /** Compra do banco -> lançamento seu que corresponde a ela. */
  matched: Map<number, Transaction>
  /** Lançamentos seus dessa fatura que o banco não cobrou. */
  onlyApp: Transaction[]
}

const cents = (v: number) => Math.round(Number(v) * 100)
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

function similar(a: string, b: string) {
  const x = keyOf(a), y = keyOf(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x) || x.split(' ')[0] === y.split(' ')[0]
}

/** Confere a fatura do banco com o que você já lançou: mesmo valor e (nome parecido ou data próxima). Cada lançamento casa com uma compra só. */
export function reconcile(bank: BankLine[], existing: Transaction[]): Reconciliation {
  const used = new Set<string>()
  const matched = new Map<number, Transaction>()
  const pass = (accept: (line: BankLine, row: Transaction) => boolean) => {
    for (const line of bank) {
      if (matched.has(line.id)) continue
      const candidates = existing.filter((row) => !used.has(row.id) && cents(row.amount) === cents(line.amount) && accept(line, row))
      if (!candidates.length) continue
      const best = candidates.sort((a, b) => dayDiff(a.occurred_on, line.date) - dayDiff(b.occurred_on, line.date))[0]
      used.add(best.id)
      matched.set(line.id, best)
    }
  }
  pass((line, row) => similar(line.description, row.description) && dayDiff(row.occurred_on, line.date) <= 5)
  pass((line, row) => similar(line.description, row.description))
  pass((line, row) => dayDiff(row.occurred_on, line.date) <= 3)
  return { matched, onlyApp: existing.filter((row) => !used.has(row.id)) }
}

const KEY = 'oc:conferir'
export function readReview(): string[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } }
export function writeReview(ids: string[]) { try { localStorage.setItem(KEY, JSON.stringify([...new Set(ids)].slice(-2000))) } catch { /* vale até recarregar */ } }
