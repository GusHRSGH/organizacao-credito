import { describe, expect, it } from 'vitest'
import { feeFor, feeLine, splitFee } from '../fee'
import type { CardFee, Invoice } from '../../types'

const fee = (patch: Partial<CardFee> = {}): CardFee => ({ invoice_id: 'i1', name: 'Taxa teste', mode: 'fixed', value: 50, excluded: [], overrides: {}, paid: [], ...patch })
const spend = new Map([['Ana', 1200], ['Bia', 800]])

describe('taxa de uso do cartão', () => {
  it('valor fixo dividido proporcional ao gasto', () => {
    const r = splitFee(fee(), spend)
    expect(r.shares.map((s) => [s.name, s.share])).toEqual([['Ana', 30], ['Bia', 20]])
    expect(r.total).toBe(50)
  })

  it('porcentagem sobre o gasto de cada um', () => {
    const r = splitFee(fee({ mode: 'percent', value: 3 }), spend)
    expect(r.shares.map((s) => s.share)).toEqual([36, 24])
  })

  it('arredonda cada parte para cima no centavo', () => {
    const r = splitFee(fee({ value: 60 }), new Map([['Ana', 100], ['Bia', 100], ['Caio', 100]]))
    expect(r.shares.map((s) => s.share)).toEqual([20, 20, 20])
    const odd = splitFee(fee({ value: 10 }), new Map([['Ana', 1], ['Bia', 1], ['Caio', 1]]))
    expect(odd.shares.map((s) => s.share)).toEqual([3.34, 3.34, 3.34])
    expect(odd.total).toBe(10.02)
  })

  it('quem fica de fora não paga, e quem não gastou nada não entra', () => {
    const r = splitFee(fee(), new Map([['Ana', 1200], ['Bia', 800], ['Caio', 0]]))
    expect(r.shares.map((s) => s.name)).toEqual(['Ana', 'Bia'])
    const sem = splitFee(fee({ excluded: ['Bia'] }), spend)
    expect(sem.shares.map((s) => [s.name, s.share])).toEqual([['Ana', 50]])
  })

  it('parte ajustada na mão: o resto se recalcula para manter o total', () => {
    const r = splitFee(fee({ overrides: { Ana: 40 } }), new Map([['Ana', 1200], ['Bia', 600], ['Caio', 200]]))
    expect(r.shares.map((s) => [s.name, s.share, s.manual])).toEqual([['Ana', 40, true], ['Bia', 7.5, false], ['Caio', 2.5, false]])
    expect(r.total).toBe(50)
  })

  it('repete a taxa da fatura anterior, sem ajustes nem pagamentos', () => {
    const invoices = [{ id: 'out', period: '2026-10-01' }, { id: 'nov', period: '2026-11-01' }, { id: 'dez', period: '2026-12-01' }] as Invoice[]
    const fees = [fee({ invoice_id: 'out', value: 40, paid: ['Ana'], overrides: { Ana: 10 } }), fee({ invoice_id: 'nov', value: 70, paid: ['Bia'], excluded: ['Caio'] })]
    const dez = feeFor('dez', invoices, fees)!
    expect(dez).toMatchObject({ inherited: true, fee: { invoice_id: 'dez', value: 70, excluded: ['Caio'], paid: [], overrides: {} } })
    expect(feeFor('nov', invoices, fees)!.inherited).toBe(false)
    expect(feeFor('out', [{ id: 'set', period: '2026-09-01' } as Invoice, ...invoices], fees)!.fee.value).toBe(40)
    expect(feeFor('set', [{ id: 'set', period: '2026-09-01' } as Invoice, ...invoices], fees)).toBeNull()
  })

  it('a linha da cobrança explica a conta', () => {
    const [ana] = splitFee(fee({ mode: 'percent', value: 2.5 }), spend).shares
    expect(feeLine(fee({ mode: 'percent', value: 2.5 }), ana)).toBe('Taxa teste (2,5% do seu gasto)')
  })
})

describe('limite de cada pessoa e extra por passar do limite', () => {
  const spend3 = new Map([['Gusta', 1500], ['Lia', 900], ['Rui', 600]])
  it('quem passou paga a % extra sobre tudo que gastou, por cima da parte normal', () => {
    const r = splitFee(fee({ value: 100, limits: { Gusta: 1200, Lia: 1000 }, extraPct: 10 }), spend3)
    const gusta = r.shares.find((s) => s.name === 'Gusta')!
    expect([gusta.base, gusta.extra, gusta.share]).toEqual([50, 150, 200])
    expect(r.shares.find((s) => s.name === 'Lia')!.extra).toBe(0)
    expect(r.shares.find((s) => s.name === 'Rui')!.limit).toBeNull()
    expect(r.total).toBe(250)
  })
  it('o ajuste na mão mexe só na parte normal; o extra continua', () => {
    const r = splitFee(fee({ value: 100, limits: { Gusta: 1200 }, extraPct: 10, overrides: { Gusta: 20 } }), spend3)
    expect(r.shares.find((s) => s.name === 'Gusta')!.share).toBe(170)
  })
  it('quem está fora da taxa fica livre do extra, e sem % extra não há extra', () => {
    expect(splitFee(fee({ limits: { Gusta: 1200 }, extraPct: 10, excluded: ['Gusta'] }), spend3).shares.some((s) => s.name === 'Gusta')).toBe(false)
    expect(splitFee(fee({ limits: { Gusta: 1200 } }), spend3).shares[0].extra).toBe(0)
  })
  it('aviso de perto do limite a partir de 80%', async () => {
    const { limitLevel } = await import('../fee')
    expect(limitLevel(799, 1000)).toBe('ok')
    expect(limitLevel(800, 1000)).toBe('near')
    expect(limitLevel(1000, 1000)).toBe('near')
    expect(limitLevel(1000.5, 1000)).toBe('over')
    expect(limitLevel(5000, null)).toBe('ok')
  })
  it('a cobrança explica o extra', () => {
    const f = fee({ name: 'Taxa', value: 100, limits: { Gusta: 1200 }, extraPct: 10 })
    const gusta = splitFee(f, spend3).shares[0]
    expect(feeLine(f, gusta)).toMatch(/^Taxa \(proporcional ao seu gasto \+ 10% por passar do limite de R\$\s1\.200,00\)$/)
  })
  it('limites e % extra se repetem na fatura seguinte', () => {
    const invoices = [{ id: 'nov', period: '2026-11-01' }, { id: 'dez', period: '2026-12-01' }] as Invoice[]
    expect(feeFor('dez', invoices, [fee({ invoice_id: 'nov', limits: { Gusta: 1200 }, extraPct: 10 })])!.fee).toMatchObject({ limits: { Gusta: 1200 }, extraPct: 10 })
  })
})
