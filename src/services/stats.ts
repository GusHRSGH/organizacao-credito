import type { Invoice, Transaction } from '../types'

export const UNKNOWN_PERSON = 'Sem responsável'
export const UNKNOWN_CATEGORY = 'Sem categoria'

const cents = (row: Transaction) => Math.round(Number(row.amount) * 100)

export interface Group { name: string; totalCents: number; paidCents: number }

export function groupBy(rows: Transaction[], key: 'person' | 'category'): Group[] {
  const fallback = key === 'person' ? UNKNOWN_PERSON : UNKNOWN_CATEGORY
  const map = new Map<string, Group>()
  for (const row of rows) {
    const name = row[key]?.name?.trim() || fallback
    const group = map.get(name) ?? { name, totalCents: 0, paidCents: 0 }
    group.totalCents += cents(row)
    if (row.status === 'paid') group.paidCents += cents(row)
    map.set(name, group)
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))
}

export function totals(rows: Transaction[]) {
  let total = 0
  let paid = 0
  for (const row of rows) {
    total += cents(row)
    if (row.status === 'paid') paid += cents(row)
  }
  return { total: total / 100, paid: paid / 100, pending: (total - paid) / 100, count: rows.length }
}

export interface CompareRow { name: string; a: number; b: number; diff: number; paidA: number; pendingA: number }

export function compareGroups(focus: Group[], other: Group[]): CompareRow[] {
  const names = new Set([...focus.map((g) => g.name), ...other.map((g) => g.name)])
  const fa = new Map(focus.map((g) => [g.name, g]))
  const fb = new Map(other.map((g) => [g.name, g]))
  return [...names].map((name) => {
    const a = fa.get(name)?.totalCents ?? 0
    const b = fb.get(name)?.totalCents ?? 0
    const paidA = fa.get(name)?.paidCents ?? 0
    return { name, a: a / 100, b: b / 100, diff: (a - b) / 100, paidA: paidA / 100, pendingA: (a - paidA) / 100 }
  }).sort((x, y) => y.a - x.a || y.b - x.b || x.name.localeCompare(y.name, 'pt-BR'))
}

export function variation(current: number, base: number): number | null {
  return base === 0 ? null : (current - base) / base
}

export interface MonthTotal { id: string; label: string; period: string; total: number; paid: number; pending: number }

export function monthlyTotals(invoices: Invoice[], rows: Transaction[], limit = 12): MonthTotal[] {
  const byInvoice = new Map<string, Transaction[]>()
  for (const row of rows) byInvoice.set(row.invoice_id, [...(byInvoice.get(row.invoice_id) ?? []), row])
  return [...invoices]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((invoice) => ({ id: invoice.id, label: invoice.label, period: invoice.period, ...totals(byInvoice.get(invoice.id) ?? []) }))
    .filter((month) => month.total > 0)
    .slice(-limit)
}
