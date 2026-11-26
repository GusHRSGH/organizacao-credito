import { describe, expect, it } from 'vitest'
import { limitUse } from '../limit'
import type { Invoice, Transaction } from '../../types'

const inv = (id: string, period: string): Invoice => ({ id, user_id: 'u', period, label: period, status: 'open', created_at: '' })
const tx = (invoice_id: string, person: string, amount: number, status: 'paid' | 'pending' = 'pending'): Transaction => ({
  id: `${invoice_id}${person}${amount}`, user_id: 'u', invoice_id, occurred_on: '2026-11-01', description: 'x', amount, person_id: null, category_id: null,
  status, installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person },
})

describe('limite do cartão', () => {
  it('conta as faturas que ainda não venceram, por pessoa, e avisa perto do limite', () => {
    const card = { dueDay: 10, closingDaysBefore: 7, limit: 1000 }
    const use = limitUse(card, [inv('out', '2026-10-01'), inv('nov', '2026-11-01'), inv('dez', '2026-12-01')],
      [tx('out', 'Ana', 500), tx('dez', 'Ana', 600, 'paid'), tx('dez', 'Bia', 250), tx('nov', 'Ana', 900)], '2026-11-26')
    expect(use).toMatchObject({ used: 850, level: 'warn', people: [{ name: 'Ana', used: 600 }, { name: 'Bia', used: 250 }] })
    expect(limitUse({ dueDay: 10, closingDaysBefore: 7 }, [], [], '2026-11-26')).toBeNull()
  })
})
