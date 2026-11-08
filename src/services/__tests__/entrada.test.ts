import { describe, expect, it } from 'vitest'
import { parseMoney, parseQuickLine } from '../../lib/quickEntry'
import { parsePastedBill } from '../../lib/pasteImport'
import { buildSuggestions, suggestFor } from '../../lib/suggest'
import type { Transaction } from '../../types'

const ctx = { people: ['Ana Lima', 'Bruno'], categories: ['Mercado', 'Transporte'], today: '2026-11-08' }

describe('parseMoney', () => {
  it('entende formatos brasileiros e simples', () => {
    expect(parseMoney('150,90')).toBe(150.9)
    expect(parseMoney('1.234,56')).toBe(1234.56)
    expect(parseMoney('1.234')).toBe(1234)
    expect(parseMoney('25.5')).toBe(25.5)
    expect(parseMoney('R$')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})

describe('parseQuickLine', () => {
  it('lê descrição, valor, parcelas, pessoa e categoria', () => {
    const r = parseQuickLine('mercado extra 150,90 3x @ana #mercado', ctx)
    expect(r).toMatchObject({ description: 'mercado extra', amount: 150.9, installments: 3, person: 'Ana Lima', category: 'Mercado', date: '2026-11-08' })
  })
  it('reconhece pessoa e categoria sem símbolo quando já existem', () => {
    const r = parseQuickLine('uber 23,40 bruno transporte', ctx)
    expect(r).toMatchObject({ description: 'uber', amount: 23.4, person: 'Bruno', category: 'Transporte' })
  })
  it('entende datas', () => {
    expect(parseQuickLine('pizza 80 ontem', ctx).date).toBe('2026-11-07')
    expect(parseQuickLine('pizza 80 05/11', ctx).date).toBe('2026-11-05')
    expect(parseQuickLine('presente 50 20/12', ctx).date).toBe('2025-12-20')
  })
  it('deixa maiúscula a inicial de pessoa e categoria novas', () => {
    expect(parseQuickLine('pao 5 @carla #padaria', ctx)).toMatchObject({ person: 'Carla', category: 'Padaria' })
  })
  it('sem valor deixa amount nulo', () => {
    expect(parseQuickLine('padaria', ctx).amount).toBeNull()
  })
  it('número no meio da descrição não vira valor se houver outro depois', () => {
    expect(parseQuickLine('combo 2 lanches 45,00', ctx)).toMatchObject({ description: 'combo 2 lanches', amount: 45 })
  })
})

describe('parsePastedBill', () => {
  const text = ['05/11 SUPERMERCADO XYZ 152,30', '06/11\tUBER *TRIP\t23,40', 'Total da fatura 175,70', '07/11 ESTORNO LOJA -50,00', 'lixo sem nada'].join('\n')
  it('extrai compras e descarta o resto', () => {
    const r = parsePastedBill(text, '2026-11-08')
    expect(r.rows).toEqual([
      { line: 1, date: '2026-11-05', description: 'SUPERMERCADO XYZ', amount: 152.3 },
      { line: 2, date: '2026-11-06', description: 'UBER *TRIP', amount: 23.4 },
    ])
    expect(r.skipped.map((s) => s.reason)).toEqual(['sem data', 'crédito ou estorno', 'sem valor'])
  })
})

const tx = (description: string, on: string, person: string, category: string) => ({ description, occurred_on: on, person: { name: person }, category: { name: category } }) as Transaction
describe('suggest', () => {
  const s = buildSuggestions([tx('Uber (1/2)', '2026-09-01', 'Ana', 'Transporte'), tx('Uber', '2026-10-01', 'Bruno', 'Transporte'), tx('Mercado Extra', '2026-10-02', 'Ana', 'Mercado')])
  it('usa o lançamento mais recente e ignora marcador de parcela', () => {
    expect(suggestFor('uber', s)).toEqual({ person: 'Bruno', category: 'Transporte' })
  })
  it('sugere por prefixo', () => {
    expect(suggestFor('merc', s)).toEqual({ person: 'Ana', category: 'Mercado' })
    expect(suggestFor('zz', s)).toBeNull()
  })
})
