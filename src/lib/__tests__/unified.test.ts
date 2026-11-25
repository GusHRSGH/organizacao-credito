import { afterEach, describe, expect, it } from 'vitest'
import { LocalSource } from '../../services/localSource'
import { MemoryPersistence } from '../../services/persistence'
import { MAIN_WALLET, setActiveWallet } from '../wallet'
import { findDebt, unifiedDebts, unifiedMessage } from '../unified'

const compra = (description: string, amount: number, personName: string, period = '2026-11-01') => ({ invoiceId: '', description, amount, occurredOn: `${period.slice(0, 8)}05`, personName, categoryName: 'Casa', installmentCount: 1, period })

describe('cobrança unificada (mesmo mês de vencimento)', () => {
  afterEach(() => setActiveWallet(MAIN_WALLET))

  async function montar() {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase(compra('Mercado', 100, 'Ana'))
    await source.createPurchase(compra('Farmácia', 40, 'Bia'))
    await source.createPurchase(compra('Viagem', 300, 'Ana', '2027-01-01'))
    await source.saveWallet({ id: 'b', name: 'Cartão B', kind: 'card' })
    setActiveWallet('b')
    await source.createInvoice('2026-11-01') // fatura vazia de novembro: não pode esconder a de dezembro
    await source.createPurchase(compra('Loja', 754.3, 'ana', '2026-12-01'))
    setActiveWallet(MAIN_WALLET)
    await source.createLoan('Carro', { person: 'Ana', installment: 520, count: 12, start: '2026-11-01', dueDay: 10, extraPct: 2 }, 'carro')
    return source
  }

  it('novembro: só as faturas que vencem em novembro e a parcela do mês, com o saldo à parte', async () => {
    const debts = unifiedDebts(await (await montar()).listEverything(), '2026-11-01')
    expect(debts.people.map((p) => [p.name, p.total])).toEqual([['Ana', 630.4], ['Bia', 40]])
    const loan = findDebt(debts, 'ana')!.parts.find((p) => p.kind === 'loan')!
    expect(loan.remaining).toEqual({ count: 11, amount: 5834.4 })
  })

  it('dezembro: soma o outro cartão (mesmo com fatura vazia antes) e as parcelas atrasadas', async () => {
    const source = await montar()
    const debts = unifiedDebts(await source.listEverything(), '2026-12-01')
    const ana = findDebt(debts, 'Ana')!
    expect(ana.parts.map((p) => [p.wallet, p.period, p.amount])).toEqual([
      ['Cartão B', '2026-12-01', 754.3],
      ['Carro', '2026-11-01', 530.4],
      ['Carro', '2026-12-01', 530.4],
    ])
    expect(ana.total).toBe(1815.1)
    const rows = (await source.listEverything()).transactions
    await source.setStatusMany(rows.filter((r) => r.description === 'Carro - Parcela 1/12').map((r) => r.id), 'paid')
    expect(findDebt(unifiedDebts(await source.listEverything(), '2026-12-01'), 'Ana')!.total).toBe(1284.7)
  })

  it('mensagem por carteira ou com cada compra', async () => {
    const debts = unifiedDebts(await (await montar()).listEverything(), '2026-11-01')
    const ana = findDebt(debts, 'Ana')!
    const total = unifiedMessage(ana, { mode: 'total', period: '2026-11-01', pixSeparate: true })
    expect(total).toContain('Oi Ana! Segue o que vence em Novembro 2026')
    expect(total).toMatch(/• Cartão principal: R\$\s100,00/)
    expect(total).toMatch(/• Carro: R\$\s530,40 \(parcela 1\/12; depois desta, faltam 11 \(R\$\s5\.834,40\)\)/)
    expect(total).toMatch(/Total: R\$\s630,40/)
    expect(total).toContain('Pix com o total')
    const items = unifiedMessage(ana, { mode: 'items', period: '2026-11-01' })
    expect(items).toMatch(/\*Cartão principal\*: R\$\s100,00\n {2}- 05\/11 Mercado: R\$\s100,00/)
    expect(items).toContain('Carro - Parcela 1/12')
    expect(items).not.toContain('Pix com o total')
  })
})
