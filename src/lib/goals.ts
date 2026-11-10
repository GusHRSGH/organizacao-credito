import type { Transaction } from '../types'

/** Limite mensal (por fatura) para o total, uma categoria ou uma pessoa. */
export interface Goal {
  id: string
  scope: 'total' | 'category' | 'person'
  name: string
  limit: number
  /** Só para metas de pessoa: limita o que essa pessoa gasta nessa categoria (ex.: Ana em Lazer). */
  category?: string
}
export type GoalLevel = 'ok' | 'warn' | 'over'

const STORE = 'oc:metas'

export function readGoals(): Goal[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Partial<Goal>[]
    return Array.isArray(raw) ? raw.filter((g): g is Goal => !!g && typeof g.id === 'string' && (g.scope === 'total' || g.scope === 'category' || g.scope === 'person') && typeof g.name === 'string' && Number(g.limit) > 0).map((g) => (g.scope === 'person' && typeof g.category === 'string' && g.category ? g : { ...g, category: undefined })) : []
  } catch { return [] }
}

export function writeGoals(goals: Goal[]) {
  try { localStorage.setItem(STORE, JSON.stringify(goals)) } catch { /* vale até recarregar */ }
}

export const goalTitle = (goal: Goal) => goal.scope === 'total' ? 'Total da fatura' : goal.scope === 'category' ? `Categoria ${goal.name}` : goal.category ? `${goal.name} em ${goal.category}` : `Gastos de ${goal.name}`

/** Quanto já foi gasto nas linhas dadas (as de uma fatura) dentro do escopo da meta. */
export function spentFor(goal: Goal, rows: Transaction[]) {
  const cents = rows.reduce((sum, row) => {
    const match = goal.scope === 'total' || (goal.scope === 'category' ? row.category?.name === goal.name : row.person?.name === goal.name && (!goal.category || row.category?.name === goal.category))
    return match ? sum + Math.round(Number(row.amount) * 100) : sum
  }, 0)
  return cents / 100
}

export function levelOf(spent: number, limit: number): GoalLevel {
  const ratio = limit > 0 ? spent / limit : 0
  return ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
}

/** Sugere limites pela média das últimas faturas (até 3) antes da escolhida, arredondada para cima de 10 em 10. */
export function suggestGoals(transactions: Transaction[], invoices: { id: string; period: string }[], invoiceId: string, existing: Goal[]): Goal[] {
  const current = invoices.find((item) => item.id === invoiceId)
  const before = invoices.filter((item) => !current || item.period < current.period).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3)
  if (!before.length) return []
  const ids = new Set(before.map((item) => item.id))
  const sums = new Map<string, number>()
  for (const row of transactions) {
    if (!ids.has(row.invoice_id) || !row.category?.name) continue
    sums.set(row.category.name, (sums.get(row.category.name) ?? 0) + Number(row.amount))
  }
  const taken = new Set(existing.filter((g) => g.scope === 'category').map((g) => g.name))
  return [...sums.entries()].filter(([name]) => !taken.has(name)).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, sum]) => ({ id: `s-${name}`, scope: 'category' as const, name, limit: Math.max(10, Math.ceil(sum / before.length / 10) * 10) }))
}
