import { afterEach, describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { MAIN_WALLET, setActiveWallet } from '../../lib/wallet'
import { creditBalance, findDebt, settleTargets, unifiedDebts } from '../../lib/unified'
import { buildMessage, billsByPerson } from '../../lib/billing'

const compra = (description: string, amount: number, personName: string, period = '2026-12-01') => ({ invoiceId: '', description, amount, occurredOn: `${period.slice(0, 8)}05`, personName, categoryName: 'Casa', installmentCount: 1, period })

describe('pagou tudo e crédito', () => {
  afterEach(() => setActiveWallet(MAIN_WALLET))

  it('pagou tudo marca as compras e a taxa em todas as carteiras, com a data do pagamento', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase(compra('Mercado', 100, 'Ana'))
    const [inv] = await source.listInvoices()
    await source.saveFee({ invoice_id: inv.id, name: 'Anuidade', mode: 'fixed', value: 20, excluded: [], overrides: {}, paid: [] })
    await source.saveWallet({ id: 'b', name: 'Cartão B', kind: 'card' })
    setActiveWallet('b')
    await source.createPurchase(compra('Loja', 50, 'ana'))
    setActiveWallet(MAIN_WALLET)
    const ana = findDebt(unifiedDebts(await source.listEverything(), '2026-12-01'), 'Ana')!
    expect(ana.total).toBe(170)
    const targets = settleTargets(ana)
    await source.settleAcross(targets.rowIds, targets.fees)
    const after = await source.listEverything()
    expect(findDebt(unifiedDebts(after, '2026-12-01'), 'Ana')).toBeUndefined()
    expect(after.transactions.every((row) => row.status === 'paid' && row.paid_at)).toBe(true)
  })

  it('crédito soma, é usado e desconta na mensagem', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.addCredit('Rosana', 46, 'Pagou a mais')
    await source.addCredit('rosana', -10, 'Usado')
    expect(creditBalance(await source.listCredits(), 'ROSANA')).toBe(36)
    await source.createPurchase(compra('Mercado', 100, 'Rosana'))
    const [bill] = billsByPerson(await source.listAllTransactions())
    const text = buildMessage(bill, 'Dezembro 2026', { credit: 36 })
    expect(text).toMatch(/Crédito \(pagou a mais antes\): -R\$\s36,00/)
    expect(text).toMatch(/Total: R\$\s64,00/)
  })

  it('voltar para pendente apaga a data do pagamento', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase(compra('Mercado', 100, 'Ana'))
    const [row] = await source.listAllTransactions()
    await source.setStatusMany([row.id], 'paid')
    expect((await source.listAllTransactions())[0].paid_at).toBeTruthy()
    await source.setStatusMany([row.id], 'pending')
    expect((await source.listAllTransactions())[0].paid_at).toBeUndefined()
  })
})
