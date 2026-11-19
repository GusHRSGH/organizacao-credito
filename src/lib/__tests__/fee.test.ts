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
