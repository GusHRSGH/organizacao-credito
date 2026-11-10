import { describe, expect, it } from 'vitest'
import { levelOf, spentFor, suggestGoals, type Goal } from '../goals'
import type { Transaction } from '../../types'

const tx = (invoice_id: string, amount: number, category: string, person = 'Ana'): Transaction => ({ id: Math.random().toString(), user_id: 'u', invoice_id, occurred_on: '2026-10-01', description: 'x', amount, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: { name: category } })

describe('metas', () => {
  const rows = [tx('a', 100.1, 'Mercado'), tx('a', 50.2, 'Lazer', 'Bia')]
  it('soma por escopo', () => {
    expect(spentFor({ id: '1', scope: 'total', name: '', limit: 1 }, rows)).toBe(150.3)
    expect(spentFor({ id: '2', scope: 'category', name: 'Mercado', limit: 1 }, rows)).toBe(100.1)
    expect(spentFor({ id: '3', scope: 'person', name: 'Bia', limit: 1 }, rows)).toBe(50.2)
  })
  it('classifica o nível', () => {
    expect(levelOf(79, 100)).toBe('ok')
    expect(levelOf(80, 100)).toBe('warn')
    expect(levelOf(100, 100)).toBe('over')
  })
  it('sugere pela média das faturas anteriores e pula o que já existe', () => {
    const invoices = [{ id: 'a', period: '2026-09-01' }, { id: 'b', period: '2026-10-01' }, { id: 'c', period: '2026-11-01' }]
    const data = [tx('a', 100, 'Mercado'), tx('b', 141, 'Mercado'), tx('b', 30, 'Lazer'), tx('c', 999, 'Mercado')]
    const existing: Goal[] = [{ id: 'x', scope: 'category', name: 'Lazer', limit: 50 }]
    const out = suggestGoals(data, invoices, 'c', existing)
    expect(out).toEqual([{ id: 's-Mercado', scope: 'category', name: 'Mercado', limit: 130 }])
  })
})
