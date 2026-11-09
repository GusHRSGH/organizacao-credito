import { describe, expect, it } from 'vitest'
import { searchAll } from '../search'
import { addFilter, isActive, removeFilter, suggestName } from '../savedFilters'
import type { Invoice, Transaction } from '../../types'

const invoice = (id: string, label: string): Invoice => ({ id, user_id: 'u', period: '2026-11-01', label, status: 'open', created_at: '' })
const row = (id: string, invoice_id: string, description: string, amount: number, person: string, category: string, date: string, status: 'paid' | 'pending' = 'pending'): Transaction => ({
  id, user_id: 'u', invoice_id, occurred_on: date, description, amount, person_id: person, category_id: category, status, installment_group: null, installment_number: null, installment_count: null, created_at: '',
  person: { name: person }, category: { name: category },
} as Transaction)

const invoices = [invoice('a', 'Novembro 2026'), invoice('b', 'Outubro 2026')]
const rows = [
  row('1', 'a', 'Uber Viagem', 23.9, 'Ana', 'Transporte', '2026-11-10'),
  row('2', 'a', 'Mercado Extra', 150.9, 'Bia', 'Alimentação', '2026-11-12', 'paid'),
  row('3', 'b', 'Uber Eats', 48, 'Ana', 'Alimentação', '2026-10-05'),
]

describe('searchAll', () => {
  it('acha em todas as faturas, mais recentes primeiro', () => {
    const { hits, total } = searchAll(rows, invoices, 'uber')
    expect(total).toBe(2)
    expect(hits.map((hit) => hit.row.id)).toEqual(['1', '3'])
  })
  it('ignora acento e maiúscula, e exige todas as palavras', () => {
    expect(searchAll(rows, invoices, 'ALIMENTACAO ana').hits.map((hit) => hit.row.id)).toEqual(['3'])
  })
  it('acha pelo mês da fatura, pelo valor e pela situação', () => {
    expect(searchAll(rows, invoices, 'outubro').total).toBe(1)
    expect(searchAll(rows, invoices, '150,90').hits[0].row.id).toBe('2')
    expect(searchAll(rows, invoices, 'pago').hits.map((hit) => hit.row.id)).toEqual(['2'])
  })
  it('busca vazia não devolve nada e o limite é respeitado', () => {
    expect(searchAll(rows, invoices, '  ').total).toBe(0)
    expect(searchAll(rows, invoices, 'a', 1).hits).toHaveLength(1)
  })
})

describe('filtros salvos', () => {
  const values = { person: 'Ana', category: '', status: 'pending', query: '' }
  it('sugere um nome legível', () => { expect(suggestName(values)).toBe('Pendentes · Ana') })
  it('reconhece filtro ativo', () => { expect(isActive(values)).toBe(true); expect(isActive({ person: '', category: '', status: '', query: ' ' })).toBe(false) })
  it('troca o filtro de mesmo nome e remove por id', () => {
    let list = addFilter([], 'Da Ana', values, '1')
    list = addFilter(list, 'da ana', { ...values, person: 'Bia' }, '2')
    expect(list).toHaveLength(1)
    expect(list[0].person).toBe('Bia')
    expect(removeFilter(list, '2')).toEqual([])
  })
  it('não salva sem nome', () => { expect(addFilter([], '  ', values, '1')).toEqual([]) })
})
