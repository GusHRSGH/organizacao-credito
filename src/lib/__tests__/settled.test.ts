import { describe, expect, it } from 'vitest'
import { isSettled, settledMessage, settledSummary } from '../settled'
import type { CardFee, Invoice, Transaction } from '../../types'

const tx = (id: string, invoice: string, person: string, amount: number, status: 'paid' | 'pending' = 'paid'): Transaction => ({ id, user_id: 'u', invoice_id: invoice, occurred_on: '2026-11-05', description: `Compra ${id}`, amount, person_id: null, category_id: null, status, installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: null })
const invoices = [{ id: 'nov', period: '2026-11-01', label: 'Novembro 2026' }] as Invoice[]
const fee = (paid: string[]): CardFee => ({ invoice_id: 'nov', name: 'Taxa', mode: 'fixed', value: 50, excluded: [], overrides: {}, paid })

describe('mês quitado', () => {
  const rows = [tx('a', 'nov', 'Ana', 1200), tx('b', 'nov', 'Bia', 800)]
  it('quitada só quando compras e taxa estão pagas', () => {
    expect(isSettled('nov', invoices, rows, [])).toBe(true)
    expect(isSettled('nov', invoices, [...rows, tx('c', 'nov', 'Bia', 5, 'pending')], [])).toBe(false)
    expect(isSettled('nov', invoices, rows, [fee(['Ana'])])).toBe(false)
    expect(isSettled('nov', invoices, rows, [fee(['Ana', 'Bia'])])).toBe(true)
    expect(isSettled('nov', invoices, [], [])).toBe(false)
  })
  it('resumo e mensagem pro grupo com compras e taxa', () => {
    const summary = settledSummary('nov', invoices, rows, [fee(['Ana', 'Bia'])])
    expect(summary.lines.map((l) => [l.name, l.spent, l.fee, l.total])).toEqual([['Ana', 1200, 30, 1230], ['Bia', 800, 20, 820]])
    expect(summary.total).toBe(2050)
    const text = settledMessage(summary)
    expect(text.startsWith('Novembro 2026 quitada! Obrigado a todos')).toBe(true)
    expect(text).toMatch(/• Ana: R\$\s1\.230,00 \(compras R\$\s1\.200,00 \+ taxa R\$\s30,00\)/)
  })
})

describe('fatura que o app abre', () => {
  const inv = (id: string, period: string) => ({ id, period, label: id }) as Invoice
  const list = [inv('out', '2026-10-01'), inv('nov', '2026-11-01'), inv('dez', '2026-12-01'), inv('jan', '2027-01-01')]
  it('pula a do mês atual quando ela já está quitada', async () => {
    const { startInvoice } = await import('../settled')
    expect(startInvoice(list, new Set(), '2026-11-01')).toBe('nov')
    expect(startInvoice(list, new Set(['nov']), '2026-11-01')).toBe('dez')
    expect(startInvoice(list, new Set(['nov', 'dez', 'jan']), '2026-11-01')).toBe('out')
    expect(startInvoice(list, new Set(['out', 'nov', 'dez', 'jan']), '2026-11-01')).toBe('nov')
    expect(startInvoice([], new Set(), '2026-11-01')).toBe('')
  })
})
