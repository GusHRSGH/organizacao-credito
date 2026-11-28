import { describe, expect, it } from 'vitest'
import { buildGroupMessage, buildMessage, billsByPerson } from '../billing'
import { chargeCents, spreadCents } from '../fee'
import type { Transaction } from '../../types'

const tx = (id: string, description: string, amount: number): Transaction => ({
  id, user_id: 'u', invoice_id: 'i', occurred_on: '2026-11-06', description, amount, person_id: null, category_id: null,
  status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: 'Ana' },
})
const [ana] = billsByPerson([tx('a', 'Mercado', 400), tx('b', 'Farmácia', 127.12)])
const fees = [{ text: 'Taxa de uso (proporcional ao seu gasto)', amount: 11.56 }]

describe('taxa discreta', () => {
  it('arredonda para o próximo múltiplo de R$ 5 e dilui somando certinho', () => {
    expect(chargeCents(52712, 1156, { mode: 'rounded', style: 'note' })).toBe(54000)
    expect(chargeCents(52712, 1156, { mode: 'embedded', style: 'note' })).toBe(53868)
    expect(chargeCents(52712, 0, { mode: 'rounded', style: 'note' })).toBe(52712)
    const parts = spreadCents([40000, 12712], 54000)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(54000)
  })

  it('à vista mostra a linha da taxa; embutida com nota não', () => {
    expect(buildMessage(ana, 'Dezembro 2026', { fees })).toContain('Taxa de uso')
    const note = buildMessage(ana, 'Dezembro 2026', { fees, display: { mode: 'embedded', style: 'note' } })
    expect(note).not.toContain('Taxa')
    expect(note).toMatch(/• 06\/11 Mercado: R\$\s400,00/)
    expect(note).toMatch(/Total: R\$\s538,68 \(inclui os custos do cartão\)/)
  })

  it('arredondada e diluída: compras maiores, sem taxa, total redondo', () => {
    const text = buildMessage(ana, 'Dezembro 2026', { fees, display: { mode: 'rounded', style: 'spread' } })
    expect(text).not.toContain('Taxa')
    expect(text).not.toContain('custos')
    expect(text).toMatch(/Total: R\$\s540,00/)
    expect(text).toMatch(/Mercado: R\$\s409,7\d/)
  })

  it('sem mencionar: lista as compras com o valor real e o total redondo, sem falar de taxa', () => {
    const text = buildMessage(ana, 'Dezembro 2026', { fees, display: { mode: 'rounded', style: 'total' }, pixSeparate: true, receiving: { key: 'x@y.com', holder: 'X', city: 'SP', note: 'Nubank', include: true } })
    expect(text).toMatch(/• 06\/11 Mercado: R\$\s400,00/)
    expect(text).toMatch(/Total: R\$\s540,00\n/)
    expect(text).not.toMatch(/taxa|custos/i)
    const group = buildGroupMessage([ana], 'Dezembro 2026', undefined, new Map([['Ana', 11.56]]), new Map([['Ana', { mode: 'rounded', style: 'total' }]]))
    expect(group).toMatch(/• Ana: R\$\s540,00\n/)
    expect(group).not.toContain('taxa')
  })
})

describe('taxa discreta em todas as carteiras', () => {
  it('o total da pessoa arredonda e a mensagem de cada compra não mostra a taxa', async () => {
    const { LocalSource } = await import('../../services/localSource')
    const { MemoryPersistence } = await import('../../services/persistence')
    const { findDebt, unifiedDebts, unifiedMessage } = await import('../unified')
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase({ invoiceId: '', description: 'Mercado', amount: 527.12, occurredOn: '2026-11-06', personName: 'Ana', categoryName: 'Casa', installmentCount: 1, period: '2026-12-01' })
    const [inv] = await source.listInvoices()
    await source.saveFee({ invoice_id: inv.id, name: 'Anuidade', mode: 'fixed', value: 11.56, excluded: [], overrides: {}, paid: [], display: { Ana: { mode: 'rounded', style: 'note' } } })
    const ana = findDebt(unifiedDebts(await source.listEverything(), '2026-12-01'), 'Ana')!
    expect(ana.total).toBe(540)
    const text = unifiedMessage(ana, { mode: 'items', period: '2026-12-01' })
    expect(text).not.toContain('Taxa')
    expect(text).toContain('(inclui os custos do cartão)')
  })
})
