import { describe, expect, it } from 'vitest'
import { punctuality } from '../punctuality'
import type { Invoice, Transaction } from '../../types'

const inv = (id: string, period: string): Invoice => ({ id, user_id: 'u', period, label: period, status: 'open', created_at: '' })
const tx = (invoice_id: string, person: string, amount: number, paid_at?: string): Transaction => ({
  id: `${invoice_id}-${person}-${amount}`, user_id: 'u', invoice_id, occurred_on: '2026-09-01', description: 'x', amount, person_id: null, category_id: null,
  status: paid_at ? 'paid' : 'pending', paid_at, installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person },
})
const due = (_wallet: string, period: string) => `${period.slice(0, 7)}-10`

describe('quem paga em dia', () => {
  it('conta em dia, atraso médio e o que está vencido', () => {
    const data = {
      wallets: [], fees: [],
      invoices: [inv('a', '2026-09-01'), inv('b', '2026-10-01'), inv('c', '2026-11-01')],
      transactions: [
        tx('a', 'Ana', 10, '2026-09-09T12:00:00Z'), tx('a', 'Ana', 5, '2026-09-10T08:00:00Z'),
        tx('b', 'Ana', 10, '2026-10-16T12:00:00Z'),
        tx('c', 'ana', 30),
        tx('a', 'Bia', 10, '2026-09-01T00:00:00Z'), tx('b', 'Bia', 10),
      ],
    }
    const [bia, ana] = punctuality(data, '2026-11-20', due)
    expect(ana).toMatchObject({ name: 'Ana', paid: 2, onTime: 1, avgLate: 6, overdue: 30, overdueDays: 10 })
    expect(ana.recent.map((r) => r.late)).toEqual([0, 6])
    expect(bia).toMatchObject({ paid: 1, onTime: 1, overdue: 10, overdueDays: 41 })
  })

  it('pagamento antigo sem data fica de fora', () => {
    const old = { ...tx('a', 'Ana', 10), status: 'paid' as const }
    expect(punctuality({ wallets: [], fees: [], invoices: [inv('a', '2026-09-01')], transactions: [old] }, '2026-11-20', due)).toEqual([])
  })
})
