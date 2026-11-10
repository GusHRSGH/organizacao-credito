import { describe, expect, it } from 'vitest'
import { reconcile } from '../reconcile'
import type { Transaction } from '../../types'

const tx = (id: string, date: string, description: string, amount: number): Transaction => ({ id, user_id: 'u', invoice_id: 'i', occurred_on: date, description, amount, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '' })

describe('conciliação', () => {
  const mine = [tx('a', '2026-10-05', 'Mercado', 150.9), tx('b', '2026-10-07', 'Uber', 23.5), tx('c', '2026-10-09', 'Cinema', 60)]
  it('casa por valor com nome parecido ou data próxima e aponta o que sobra', () => {
    const bank = [
      { id: 1, date: '2026-10-06', description: 'Mercado Zona Sul', amount: 150.9 },
      { id: 2, date: '2026-10-07', description: 'Uber *Trip', amount: 23.5 },
      { id: 3, date: '2026-10-20', description: 'Farmácia', amount: 42 },
    ]
    const r = reconcile(bank, mine)
    expect([...r.matched.keys()]).toEqual([1, 2])
    expect(r.matched.get(1)?.id).toBe('a')
    expect(r.onlyApp.map((t) => t.id)).toEqual(['c'])
  })
  it('um lançamento não casa com duas compras do mesmo valor', () => {
    const bank = [{ id: 1, date: '2026-10-09', description: 'Cinema', amount: 60 }, { id: 2, date: '2026-10-09', description: 'Cinema', amount: 60 }]
    const r = reconcile(bank, mine)
    expect(r.matched.size).toBe(1)
  })
  it('valor diferente nunca casa', () => {
    const r = reconcile([{ id: 1, date: '2026-10-09', description: 'Cinema', amount: 61 }], mine)
    expect(r.matched.size).toBe(0)
  })
})
