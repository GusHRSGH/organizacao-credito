import { describe, expect, it } from 'vitest'
import { forecastFor } from '../forecast'
import type { Invoice, Transaction } from '../../types'

const inv = (id: string, period: string): Invoice => ({ id, user_id: 'u', period, label: period, status: 'open', created_at: '' })
const tx = (invoice_id: string, description: string, amount: number, group: string | null = null): Transaction => ({ id: `${invoice_id}-${description}-${amount}`, user_id: 'u', invoice_id, occurred_on: '2026-10-05', description, amount, person_id: null, category_id: null, status: 'pending', installment_group: group, installment_number: null, installment_count: null, created_at: '', person: { name: 'Ana' }, category: { name: 'X' } })

describe('previsão da próxima fatura', () => {
  const invoices = [inv('a', '2026-08-01'), inv('b', '2026-09-01'), inv('c', '2026-10-01'), inv('d', '2026-11-01')]
  const data = [
    ...['a', 'b', 'c', 'd'].map((i) => tx(i, 'Netflix', 55.9)),
    tx('a', 'Mercado Zona Sul', 300), tx('b', 'Mercado Zona Sul', 360), tx('c', 'Posto Shell', 330), tx('d', 'Padaria Central', 300),
    tx('d', 'Notebook', 200, 'g1'),
    tx('e', 'Notebook', 200, 'g1'),
  ]
  it('soma parcela futura, assinatura que falta e a média do dia a dia', () => {
    const f = forecastFor(data, [...invoices, inv('e', '2026-12-01')], '2026-12-01')!
    expect(f.period).toBe('2026-12-01')
    expect(f.committed).toBe(200)
    expect(f.missingSubs.map((s) => s.name)).toEqual(['Netflix'])
    expect(f.subsTotal).toBe(55.9)
    expect(f.variable).toBe(330)
    expect(f.total).toBeCloseTo(585.9, 2)
  })
  it('sem assinatura já lançada, não duplica', () => {
    const f = forecastFor([...data, tx('e', 'Netflix', 55.9)], [...invoices, inv('e', '2026-12-01')], '2026-12-01')!
    expect(f.missingSubs).toHaveLength(0)
    expect(f.committed).toBeCloseTo(255.9, 2)
    expect(f.variable).toBe(330)
  })
})
