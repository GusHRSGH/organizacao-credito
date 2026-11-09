import { describe, expect, it } from 'vitest'
import { cleanDescription, planDescriptions, planMerge } from '../cleanup'
import type { Transaction } from '../../types'

const tx = (description: string): Transaction => ({ id: description + Math.random(), user_id: 'u', invoice_id: 'i', occurred_on: '2026-11-01', description, amount: 1, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '' })

describe('limpeza de descrições', () => {
  it('troca nomes sujos pelo nome certo', () => {
    expect(cleanDescription('UBER *TRIP 8842')).toBe('Uber')
    expect(cleanDescription('Uber Eats 1234')).toBe('Uber Eats')
    expect(cleanDescription('MP*MERCADOLIVRE')).toBe('Mercado Livre')
    expect(cleanDescription('AMAZON PRIME VIDEO BR')).toBe('Amazon Prime')
    expect(cleanDescription('NETFLIX.COM')).toBe('Netflix')
  })
  it('tira códigos e arruma maiúsculas, mantendo a parcela', () => {
    expect(cleanDescription('IFD*PADARIA DO ZE 12345')).toBe('Padaria do Ze')
    expect(cleanDescription('SUPERMERCADO XYZ SAO PAULO BR')).toBe('Supermercado XYZ Sao Paulo')
    expect(cleanDescription('LOJA CENTRAL 3/6')).toBe('Loja Central 3/6')
  })
  it('não mexe no que já está limpo', () => {
    for (const ok of ['Mercado Exemplo', 'Loja Exemplo - Parcela 2/6', 'Farmácia 24 horas', 'Aluguel']) expect(cleanDescription(ok)).toBe(ok)
  })
  it('junta variações na forma mais comum e só propõe o que muda', () => {
    const rows = [tx('UBER *TRIP 1'), tx('UBER *TRIP 2'), tx('Uber'), tx('Aluguel'), tx('mercado extra'), tx('Mercado Extra'), tx('Mercado Extra')]
    const fixes = planDescriptions(rows)
    const uber = fixes.find((f) => f.to === 'Uber')!
    expect(uber.from.sort()).toEqual(['UBER *TRIP 1', 'UBER *TRIP 2'])
    expect(fixes.find((f) => f.to === 'Mercado Extra')?.from).toEqual(['mercado extra'])
    expect(fixes.some((f) => f.to === 'Aluguel')).toBe(false)
  })
})

describe('juntar nomes repetidos', () => {
  it('acha plural e variações em categorias', () => {
    const fixes = planMerge([{ name: 'Transporte', count: 10 }, { name: 'Transportes', count: 2 }, { name: 'Casa', count: 5 }], 'category')
    expect(fixes).toEqual([{ from: ['Transportes'], to: 'Transporte', count: 2, maybe: false }])
  })
  it('em pessoas, primeiro nome sozinho vira "talvez"', () => {
    const fixes = planMerge([{ name: 'Ana', count: 3 }, { name: 'Ana Lima', count: 9 }, { name: 'Bruno', count: 4 }], 'person')
    expect(fixes).toEqual([{ from: ['Ana'], to: 'Ana Lima', count: 3, maybe: true }])
  })
})
