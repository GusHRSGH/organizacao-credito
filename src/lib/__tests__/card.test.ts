import { describe, expect, it } from 'vitest'
import { closingDate, dueDate, invoicePeriodFor } from '../card'
import { LocalSource } from '../../services/localSource'
import { MemoryPersistence } from '../../services/persistence'

const nubank = { dueDay: 7, closingDaysBefore: 7 }

describe('fatura pelo fechamento', () => {
  it('calcula vencimento e fechamento', () => {
    expect(dueDate('2026-12-01', nubank)).toBe('2026-12-07')
    expect(closingDate('2026-12-01', nubank)).toBe('2026-11-30')
    expect(closingDate('2026-11-01', nubank)).toBe('2026-10-31')
    expect(dueDate('2027-02-01', { dueDay: 31, closingDaysBefore: 7 })).toBe('2027-02-28')
  })
  it('manda compra depois do fechamento para a fatura seguinte', () => {
    expect(invoicePeriodFor('2026-11-09', nubank)).toBe('2026-12-01')
    expect(invoicePeriodFor('2026-11-29', nubank)).toBe('2026-12-01')
    expect(invoicePeriodFor('2026-11-30', nubank)).toBe('2027-01-01') // dia do fechamento já entra na seguinte
    expect(invoicePeriodFor('2026-10-30', nubank)).toBe('2026-11-01')
    expect(invoicePeriodFor('2026-12-31', nubank)).toBe('2027-02-01')
  })
  it('vencimento no fim do mês e sem cartão configurado', () => {
    const late = { dueDay: 25, closingDaysBefore: 7 } // fecha dia 18
    expect(invoicePeriodFor('2026-11-10', late)).toBe('2026-11-01')
    expect(invoicePeriodFor('2026-11-20', late)).toBe('2026-12-01')
    expect(invoicePeriodFor('2026-11-20', null)).toBe('2026-11-01')
  })
  it('o banco usa a fatura indicada e espalha as parcelas a partir dela', async () => {
    const local = new LocalSource(new MemoryPersistence())
    await local.createPurchase({ invoiceId: '', occurredOn: '2026-11-09', description: 'TV', amount: 200, personName: 'Ana', categoryName: 'Casa', installmentCount: 2, period: '2026-12-01' })
    const rows = (await local.listAllTransactions()).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    expect(rows.map((r) => [r.occurred_on, r.amount])).toEqual([['2026-11-09', 100], ['2026-12-09', 100]])
    expect((await local.listInvoices()).map((i) => i.period).sort()).toEqual(['2026-12-01', '2027-01-01'])
  })
})
