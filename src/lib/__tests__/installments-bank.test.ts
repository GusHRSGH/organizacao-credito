import { describe, expect, it } from 'vitest'
import { bumpInstallment, classifyRows, futureInstallments, summarizeIncoming } from '../bankImport'
import { buildInstallmentSuggestions, buildSuggestions } from '../suggest'
import type { ImportRow, Transaction } from '../../types'

const tx = (description: string, person: string, amount: number, n: number | null = null, count: number | null = null): Transaction => ({ id: Math.random().toString(), user_id: 'u', invoice_id: 'i', occurred_on: '2026-10-01', description, amount, person_id: null, category_id: null, status: 'pending', installment_group: count ? 'g' : null, installment_number: n, installment_count: count, created_at: '', person: { name: person }, category: { name: 'Compras' } })
const row = (description: string, amount: number, n: number | null, count: number | null, date = '2026-10-31'): ImportRow => ({ date, description, amount, person: 'Ana', category: 'Compras', status: 'pending', installmentNumber: n, installmentCount: count })

describe('parcelas que faltam', () => {
  it('troca o número da parcela no fim da descrição', () => {
    expect(bumpInstallment('Loja - Parcela 4/6', 1)).toBe('Loja - Parcela 5/6')
    expect(bumpInstallment('Pix no Crédito - Fulano - 2/3', 1)).toBe('Pix no Crédito - Fulano - 3/3')
    expect(bumpInstallment('Loja 1/2 (Parcela)', 1)).toBe('Loja 1/2 (Parcela)')
  })

  it('cria uma parcela por mês até o fim, com mesmo valor e responsável', () => {
    const result = futureInstallments([row('Loja - Parcela 4/6', 90.02, 4, 6)], '2026-12-01', [])
    expect(result.count).toBe(2)
    expect(result.total).toBe(180.04)
    expect(result.entries.map((e) => e.period)).toEqual(['2027-01-01', '2027-02-01'])
    expect(result.entries[0].rows[0]).toMatchObject({ description: 'Loja - Parcela 5/6', date: '2026-11-30', amount: 90.02, person: 'Ana', installmentNumber: 5, installmentCount: 6, status: 'pending' })
    expect(result.entries[1].rows[0]).toMatchObject({ description: 'Loja - Parcela 6/6', date: '2026-12-31' })
  })

  it('não cria nada para a última parcela nem para compra à vista', () => {
    expect(futureInstallments([row('Loja - Parcela 6/6', 10, 6, 6), row('Padaria', 5, null, null)], '2026-12-01', []).count).toBe(0)
  })

  it('pula a parcela que já está lançada', () => {
    const existing = [tx('Loja - Parcela 5/6', 'Ana', 90.02, 5, 6)]
    const result = futureInstallments([row('Loja - Parcela 4/6', 90.02, 4, 6)], '2026-12-01', existing)
    expect(result.count).toBe(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].rows[0].description).toBe('Loja - Parcela 6/6')
  })
})

describe('parcela anterior define o responsável', () => {
  it('a mesma compra (nome, valor e total) vence o último dono do nome', () => {
    const history = [tx('Mercado Livre - Parcela 3/6', 'Bia', 90.02, 3, 6), tx('Mercado Livre', 'Ana', 73.98)]
    const bank = [
      { date: '2026-10-31', description: 'Mercado Livre - Parcela 4/6', amount: 90.02, bankCategory: '', installmentNumber: 4, installmentCount: 6 },
      { date: '2026-11-04', description: 'Mercado Livre', amount: 73.98, bankCategory: '', installmentNumber: null, installmentCount: null },
    ]
    const rows = classifyRows(bank, { suggestions: buildSuggestions(history), installments: buildInstallmentSuggestions(history), categories: ['Compras'], defaultPerson: '' })
    expect(rows[0]).toMatchObject({ person: 'Bia', personFrom: 'histórico' })
    expect(rows[1]).toMatchObject({ person: 'Ana', personFrom: 'histórico' })
  })

  it('quanto cada pessoa deve entra no resumo', () => {
    const sum = summarizeIncoming([{ amount: 10, category: 'A', person: 'Ana', installmentCount: null }, { amount: 5, category: 'A', person: 'Bia', installmentCount: null }, { amount: 2.5, category: 'A', person: 'Ana', installmentCount: null }])
    expect(sum.byPerson).toEqual([{ name: 'Ana', total: 12.5 }, { name: 'Bia', total: 5 }])
  })
})

describe('parcelas futuras no banco local', () => {
  it('entram nas faturas seguintes, no mesmo grupo, e importar de novo não duplica', async () => {
    const { LocalSource } = await import('../../services/localSource')
    const { MemoryPersistence } = await import('../../services/persistence')
    const source = new LocalSource(new MemoryPersistence())
    const main = row('Loja - Parcela 1/3', 100, 1, 3)
    const future = futureInstallments([main], '2026-12-01', [])
    const batch = [{ period: '2026-12-01', label: 'Dezembro 2026', rows: [main] }, ...future.entries]
    const first = await source.importInvoices(batch)
    expect(first.added).toBe(3)
    const all = await source.listAllTransactions()
    expect(all.map((t) => t.installment_number).sort()).toEqual([1, 2, 3])
    expect(new Set(all.map((t) => t.installment_group)).size).toBe(1)
    const again = await source.importInvoices(batch)
    expect(again.added).toBe(0)
    expect(again.duplicates).toBe(3)
    // E o robô, na hora de importar de novo, já enxerga as parcelas lançadas e não cria outras.
    expect(futureInstallments([main], '2026-12-01', all).count).toBe(0)
  })
})
