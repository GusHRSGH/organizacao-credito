import { describe, expect, it } from 'vitest'
import { suggestSettlement, type SettleRow } from '../settle'

const r = (id: string, amount: number, date = '2026-10-10', group: string | null = null): SettleRow => ({ id, amount, date, group })

describe('pagou um valor', () => {
  const rows = [r('a', 500), r('b', 700), r('c', 400), r('d', 89)]

  it('procura o que sobrou: devia 1689, pagou 1600 e sobra a compra de 89', () => {
    const [best] = suggestSettlement(rows, 1600)
    expect(best.kind).toBe('exata')
    expect(best.leftIds).toEqual(['d'])
    expect(best.diff).toBe(0)
    expect(best.paidIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('quando não fecha, mostra a diferença em vez de esconder', () => {
    const [best] = suggestSettlement(rows, 1599.5)
    expect(best.kind).toBe('perto')
    expect(best.leftIds).toEqual(['d'])
    expect(best.diff).toBeCloseTo(0.5, 2)
    const [less] = suggestSettlement(rows, 1601)
    expect(less.leftIds).toEqual(['d'])
    expect(less.diff).toBeCloseTo(-1, 2)
  })

  it('pagou tudo ou mais: marca tudo e sobra crédito', () => {
    const [all] = suggestSettlement(rows, 1700)
    expect(all.leftIds).toEqual([])
    expect(all.diff).toBeCloseTo(-11, 2)
  })

  it('valor zero ou negativo não sugere nada', () => {
    expect(suggestSettlement(rows, 0)).toEqual([])
    expect(suggestSettlement([], 50)).toEqual([])
  })

  it('prefere não rachar uma compra parcelada no meio', () => {
    const list = [r('p1', 50, '2026-09-10', 'g'), r('p2', 50, '2026-10-10', 'g'), r('x', 50, '2026-10-12'), r('y', 150)]
    const [best] = suggestSettlement(list, 150)
    expect(best.diff).toBe(0)
    expect(best.leftIds.includes('p1')).toBe(best.leftIds.includes('p2'))
  })

  it('sem combinação parecida, paga do mais antigo ao mais novo até onde alcança', () => {
    const list = [r('old', 300, '2026-08-01'), r('mid', 300, '2026-09-01'), r('new', 300, '2026-10-01')]
    const [best] = suggestSettlement(list, 400)
    expect(best.kind).toBe('antigas')
    expect(best.paidIds).toEqual(['old'])
    expect(best.diff).toBe(-100)
  })

  it('devolve até 3 opções, da mais exata para a menos', () => {
    const list = [r('a', 40), r('b', 40), r('c', 40), r('d', 39), r('e', 100)]
    const options = suggestSettlement(list, 220)
    expect(options.length).toBeGreaterThan(1)
    expect(options.length).toBeLessThanOrEqual(3)
    expect(options[0].diff).toBe(0)
  })

  it('aguenta dezenas de lançamentos sem travar', () => {
    const list = Array.from({ length: 60 }, (_, i) => r(`i${i}`, 17.37 + i * 3.11, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`))
    const started = Date.now()
    const options = suggestSettlement(list, 2500)
    expect(options.length).toBeGreaterThan(0)
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
