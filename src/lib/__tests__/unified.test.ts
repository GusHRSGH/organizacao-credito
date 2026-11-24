import { afterEach, describe, expect, it } from 'vitest'
import { LocalSource } from '../../services/localSource'
import { MemoryPersistence } from '../../services/persistence'
import { MAIN_WALLET, setActiveWallet } from '../wallet'
import { unifiedDebts, unifiedMessage } from '../unified'

const compra = (description: string, amount: number, personName: string, period = '2026-11-01') => ({ invoiceId: '', description, amount, occurredOn: `${period.slice(0, 8)}05`, personName, categoryName: 'Casa', installmentCount: 1, period })

describe('cobrança unificada', () => {
  afterEach(() => setActiveWallet(MAIN_WALLET))

  async function montar() {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase(compra('Mercado', 100, 'Ana'))
    await source.createPurchase(compra('Farmácia', 40, 'Bia'))
    await source.createPurchase(compra('Viagem', 300, 'Ana', '2027-01-01'))
    await source.createLoan('Carro', { person: 'Ana', installment: 520, count: 12, start: '2026-11-01', dueDay: 10, extraPct: 2 }, 'carro')
    return source
  }

  it('soma o mês em aberto de cada carteira, sem parcelas futuras', async () => {
    const source = await montar()
    const debts = unifiedDebts(await source.listEverything(), '2026-11-01')
    expect(debts.people.map((p) => [p.name, p.total])).toEqual([['Ana', 630.4], ['Bia', 40]])
    expect(debts.total).toBe(670.4)
    expect(debts.wallets).toBe(2)
    expect(debts.people[0].parts.map((p) => p.wallet)).toEqual(['Cartão principal', 'Carro'])
  })

  it('o que já foi pago sai do total, e a carteira quitada pula para o próximo mês', async () => {
    const source = await montar()
    const rows = (await source.listEverything()).transactions
    await source.setStatusMany(rows.filter((r) => r.description === 'Mercado' || r.description === 'Farmácia').map((r) => r.id), 'paid')
    const debts = unifiedDebts(await source.listEverything(), '2026-11-01')
    // a fatura de novembro foi quitada: entra a próxima em aberto do cartão (janeiro) e a parcela do carro de novembro
    expect(debts.people.map((p) => [p.name, p.total])).toEqual([['Ana', 830.4]])
  })

  it('mensagem lista carteira por carteira e o total', async () => {
    const source = await montar()
    const [ana] = unifiedDebts(await source.listEverything(), '2026-11-01').people
    const text = unifiedMessage(ana, true)
    expect(text).toContain('Oi Ana!')
    expect(text).toMatch(/Cartão principal \(.+\): R\$\s100,00/)
    expect(text).toMatch(/Carro \(.+\): R\$\s530,40/)
    expect(text).toMatch(/Total: R\$\s630,40/)
    expect(text).toContain('Pix com o total')
  })
})
