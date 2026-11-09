import { describe, expect, it } from 'vitest'
import { detectRadar, detectSubscriptions } from '../watch'
import type { Invoice, Transaction } from '../../types'

const invoices: Invoice[] = ['2026-08', '2026-09', '2026-10', '2026-11'].map((p, i) => ({ id: `i${i}`, user_id: 'u', period: `${p}-01`, label: p, status: 'open', created_at: '' }))
let n = 0
const tx = (inv: number, description: string, amount: number, day = '05', extra: Partial<Transaction> = {}): Transaction => ({ id: `t${n++}`, user_id: 'u', invoice_id: `i${inv}`, occurred_on: `${invoices[inv].period.slice(0, 7)}-${day}`, description, amount, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: 'Ana' }, category: null, ...extra })

describe('assinaturas', () => {
  it('acha o que se repete todo mês e avisa aumento de preço', () => {
    const rows = [tx(0, 'NETFLIX.COM', 39.9), tx(1, 'Netflix', 39.9), tx(2, 'Netflix', 39.9), tx(3, 'Netflix', 55.9), tx(1, 'Mercado', 120), tx(2, 'Mercado', 80), tx(2, 'Mercado', 90), tx(3, 'Mercado', 70)]
    const subs = detectSubscriptions(rows, invoices)
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ name: 'Netflix', months: 4, active: true, priceUp: true, previousAmount: 39.9, lastAmount: 55.9 })
  })
  it('reconhece 2 meses seguidos idênticos como provável e ignora parcelas', () => {
    const rows = [tx(2, 'Academia', 99), tx(3, 'Academia', 99), tx(1, 'TV', 100, '05', { installment_group: 'g' }), tx(2, 'TV', 100, '05', { installment_group: 'g' }), tx(3, 'TV', 100, '05', { installment_group: 'g' })]
    const subs = detectSubscriptions(rows, invoices)
    expect(subs.map((s) => [s.name, s.certain])).toEqual([['Academia', false]])
  })
  it('marca como parada a que sumiu', () => {
    const rows = [tx(0, 'Revista', 20), tx(1, 'Revista', 20), tx(2, 'Revista', 20)]
    expect(detectSubscriptions(rows, invoices)[0]).toMatchObject({ active: false })
    expect(detectSubscriptions([...rows, tx(3, 'Outra', 1)], invoices)[0].stopped).toBe(false)
  })
})

describe('radar', () => {
  it('avisa cobrança duplicada', () => {
    const rows = [tx(3, 'Padaria Central', 23.9, '05'), tx(3, 'Padaria Central', 23.9, '06'), tx(3, 'Outra', 10)]
    const radar = detectRadar(rows, invoices, 'i3')
    expect(radar.map((r) => r.kind)).toEqual(['duplicada'])
    expect(radar[0].ids).toHaveLength(2)
  })
  it('avisa valor muito acima do normal', () => {
    const rows = [tx(0, 'Luz', 100), tx(1, 'Luz', 110), tx(2, 'Luz', 95), tx(3, 'Luz', 260)]
    const radar = detectRadar(rows, invoices, 'i3')
    expect(radar[0]).toMatchObject({ kind: 'acima' })
    expect(radar[0].detail).toContain('260')
  })
  it('não alerta no que é normal', () => {
    const rows = [tx(0, 'Luz', 100), tx(1, 'Luz', 110), tx(2, 'Luz', 95), tx(3, 'Luz', 120)]
    expect(detectRadar(rows, invoices, 'i3')).toEqual([])
  })
  it('avisa categoria disparada', () => {
    const cat = (name: string) => ({ category: { name } })
    const rows = [tx(0, 'a', 100, '05', cat('Lazer')), tx(1, 'b', 120, '05', cat('Lazer')), tx(2, 'c', 110, '05', cat('Lazer')), tx(3, 'd', 400, '05', cat('Lazer'))]
    expect(detectRadar(rows, invoices, 'i3').map((r) => r.kind)).toContain('categoria')
  })
})
