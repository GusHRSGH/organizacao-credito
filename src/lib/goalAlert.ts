import { goalTitle, levelOf, spentFor, type Goal } from './goals'
import { money } from './format'
import type { Transaction } from '../types'

export interface GoalAlert { goal: Goal; before: number; after: number; level: 'warn' | 'over'; text: string }

/**
 * Avisa, antes de salvar, quais metas essa compra faz chegar perto do limite ou estourar.
 * `rows` são os lançamentos da fatura em que a compra vai cair; `amount` é o que cai nessa fatura (a 1ª parcela, se parcelada).
 */
export function goalAlerts(goals: Goal[], rows: Transaction[], purchase: { person?: string | null; category?: string | null; amount: number }): GoalAlert[] {
  if (!(purchase.amount > 0)) return []
  const out: GoalAlert[] = []
  for (const goal of goals) {
    const applies = goal.scope === 'total'
      || (goal.scope === 'category' && !!purchase.category && goal.name === purchase.category)
      || (goal.scope === 'person' && !!purchase.person && goal.name === purchase.person && (!goal.category || goal.category === purchase.category))
    if (!applies) continue
    const before = spentFor(goal, rows)
    const after = Math.round((before + purchase.amount) * 100) / 100
    const level = levelOf(after, goal.limit)
    if (level === 'ok') continue
    const percent = Math.round((after / goal.limit) * 100)
    const text = level === 'over'
      ? before >= goal.limit
        ? `${goalTitle(goal)}: já passou do limite (${money(before)} de ${money(goal.limit)}) e com essa compra vai a ${money(after)}.`
        : `${goalTitle(goal)}: com essa compra passa do limite (${money(after)} de ${money(goal.limit)}).`
      : `${goalTitle(goal)}: com essa compra chega a ${percent}% do limite (${money(after)} de ${money(goal.limit)}).`
    out.push({ goal, before, after, level, text })
  }
  return out.sort((a, b) => Number(b.level === 'over') - Number(a.level === 'over'))
}
