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

describe('linguagem natural', () => {
  const nat = { people: ['Ana Lima', 'Bruno'], categories: ['Mercado', 'Transporte'], today: '2026-11-09' } // segunda
  it('entende uma frase falada', () => {
    const r = parseQuickLine('gastei 50 reais no mercado ontem com a Ana', nat)
    expect(r).toMatchObject({ amount: 50, person: 'Ana Lima', category: 'Mercado', date: '2026-11-08', description: 'mercado' })
  })
  it('entende parcelas faladas e valor em mil', () => {
    expect(parseQuickLine('comprei um notebook de 2,5 mil em 10 vezes pra Bruno', nat)).toMatchObject({ description: 'notebook', amount: 2500, installments: 10, person: 'Bruno' })
    expect(parseQuickLine('tênis 300 parcelado em 3x', nat)).toMatchObject({ description: 'tênis', amount: 300, installments: 3 })
  })
  it('entende dia do mês e dia da semana', () => {
    expect(parseQuickLine('farmácia 40 dia 5', nat).date).toBe('2026-11-05')
    expect(parseQuickLine('farmácia 40 dia 20', nat).date).toBe('2026-10-20')
    expect(parseQuickLine('padaria 12 sexta', nat).date).toBe('2026-11-06')
    expect(parseQuickLine('padaria 12 segunda passada', nat).date).toBe('2026-11-02')
    expect(parseQuickLine('padaria 12 semana passada', nat).date).toBe('2026-11-02')
  })
  it('não inventa responsável que não existe', () => {
    expect(parseQuickLine('presente da Marta 80', nat)).toMatchObject({ person: null, description: 'presente da Marta' })
  })
})

describe('colar notificação e conversa', () => {
  const people = ['Ana Lima', 'Bruno']
  it('lê notificação do banco', () => {
    const r = parsePastedBill('Compra aprovada no cartão final 1234 de R$ 45,90 em PADARIA CENTRAL hoje às 14:32', '2026-11-09', people)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ amount: 45.9, description: 'PADARIA CENTRAL', date: '2026-11-09', origin: 'notificação' })
  })
  it('lê conversa de WhatsApp e usa quem mandou como responsável', () => {
    const r = parsePastedBill('[08/11/2026 14:32] Ana: gastei 50 no mercado ontem\n08/11/2026 15:00 - Bruno: paguei 30 de uber', '2026-11-09', people, ['Mercado'])
    expect(r.rows.map((x) => [x.description, x.amount, x.person, x.date])).toEqual([['mercado', 50, 'Ana Lima', '2026-11-08'], ['uber', 30, 'Bruno', '2026-11-09']])
  })
  it('continua lendo linha de fatura e ignora conversa sem gasto', () => {
    const r = parsePastedBill('05/11 SUPERMERCADO XYZ 152,30\n[08/11/2026 14:32] Ana: bom dia pessoal', '2026-11-09', people)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].origin).toBeUndefined()
    expect(r.skipped).toHaveLength(1)
  })
})

import { groupLines } from '../pdfText'

describe('PDF e datas por extenso', () => {
  it('lê data "05 NOV" e "5 de novembro" da fatura em PDF', () => {
    const r = parsePastedBill('05 NOV  SUPERMERCADO XYZ  152,30\n6 de novembro de 2026 UBER 23,40\nTotal da fatura 175,70', '2026-11-09')
    expect(r.rows.map((x) => [x.date, x.description, x.amount])).toEqual([['2026-11-05', 'SUPERMERCADO XYZ', 152.3], ['2026-11-06', 'UBER', 23.4]])
    expect(r.skipped).toHaveLength(1)
  })
  it('monta linhas do PDF de cima para baixo e da esquerda para a direita', () => {
    const lines = groupLines([
      { str: '152,30', x: 400, y: 700 }, { str: 'MERCADO', x: 100, y: 701 }, { str: '05 NOV', x: 20, y: 700 },
      { str: 'UBER', x: 100, y: 680 }, { str: '23,40', x: 400, y: 680 }, { str: ' ', x: 1, y: 10 },
    ])
    expect(lines).toEqual(['05 NOV  MERCADO  152,30', 'UBER  23,40'])
  })
})
