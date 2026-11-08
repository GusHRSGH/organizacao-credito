import { describe, expect, it } from 'vitest'
import { billsByPerson, buildMessage } from '../../lib/billing'
import type { Transaction } from '../../types'

const row = (id: string, person: string, amount: number, status: 'paid' | 'pending', description = 'Item', n: number | null = null) =>
  ({ id, occurred_on: '2026-11-05', description, amount, status, person: { name: person }, category: { name: 'X' }, installment_number: n, installment_count: n ? 3 : null }) as Transaction

describe('cobrança', () => {
  const rows = [row('1', 'ana', 10.1, 'pending'), row('2', 'ana', 20.2, 'paid'), row('3', 'bruno', 50, 'pending', 'TV', 2)]
  it('soma por pessoa em centavos, maior pendente primeiro', () => {
    const bills = billsByPerson(rows)
    expect(bills.map((bill) => [bill.name, bill.total, bill.paid, bill.pending])).toEqual([['bruno', 50, 0, 50], ['ana', 30.3, 20.2, 10.1]])
  })
  it('monta a mensagem só com o pendente', () => {
    const [, ana] = billsByPerson(rows)
    const text = buildMessage(ana, 'Novembro 2026')
    expect(text).toContain('Oi Ana!')
    expect(text).toContain('Item: R$')
    expect(text).toContain('Já pago')
    expect(buildMessage(billsByPerson([row('9', 'carla', 5, 'paid')])[0], 'Novembro 2026')).toContain('nada pendente')
  })
  it('mostra a parcela', () => {
    expect(buildMessage(billsByPerson(rows)[0], 'Nov')).toContain('TV (2/3)')
  })
})
