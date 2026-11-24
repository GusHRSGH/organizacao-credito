import { afterEach, describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { MAIN_WALLET, setActiveWallet } from '../../lib/wallet'

const compra = (description: string) => ({ invoiceId: '', description, amount: 50, occurredOn: '2026-11-05', personName: 'Ana', categoryName: 'Casa', installmentCount: 1, period: '2026-11-01' })
const linha = (description: string) => ({ date: '2026-11-05', description, amount: 50, person: 'Ana', category: 'Casa', status: 'pending' as const, installmentNumber: null, installmentCount: null })

describe('carteiras (vários cartões)', () => {
  afterEach(() => setActiveWallet(MAIN_WALLET))

  it('cada carteira tem as suas faturas e lançamentos, no mesmo mês', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase(compra('Mercado Nubank'))
    await source.saveWallet({ id: 'credi', name: 'Credifatto', kind: 'card' })
    setActiveWallet('credi')
    await source.createPurchase(compra('Farmácia Credifatto'))
    expect((await source.listInvoices()).map((i) => i.wallet_id)).toEqual(['credi'])
    expect((await source.listAllTransactions()).map((t) => t.description)).toEqual(['Farmácia Credifatto'])
    setActiveWallet(MAIN_WALLET)
    expect((await source.listInvoices()).map((i) => i.wallet_id)).toEqual([undefined])
    expect((await source.listAllTransactions()).map((t) => t.description)).toEqual(['Mercado Nubank'])
    expect((await source.listWallets()).map((w) => w.name)).toEqual(['Cartão principal', 'Credifatto'])
  })

  it('a mesma compra importada em outro cartão não conta como repetida', async () => {
    const source = new LocalSource(new MemoryPersistence())
    const batch = [{ period: '2026-11-01', label: 'Novembro 2026', rows: [linha('Uber')] }]
    expect((await source.importInvoices(batch)).added).toBe(1)
    await source.saveWallet({ id: 'credi', name: 'Credifatto', kind: 'card' })
    setActiveWallet('credi')
    const other = await source.importInvoices(batch)
    expect([other.added, other.duplicates, other.invoicesCreated]).toEqual([1, 0, 1])
    expect((await source.importInvoices(batch)).duplicates).toBe(1)
  })

  it('não apaga a principal nem carteira com faturas; nomes não se repetem', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await expect(source.removeWallet(MAIN_WALLET)).rejects.toThrow('principal')
    await source.saveWallet({ id: 'credi', name: 'Credifatto', kind: 'card' })
    await expect(source.saveWallet({ id: 'x', name: 'credifatto', kind: 'card' })).rejects.toThrow('Já existe')
    setActiveWallet('credi')
    await source.createPurchase(compra('Algo'))
    await expect(source.removeWallet('credi')).rejects.toThrow('ainda tem faturas')
    const [invoice] = await source.listInvoices()
    await source.removeInvoice(invoice.id)
    await source.removeWallet('credi')
    expect((await source.listWallets()).map((w) => w.id)).toEqual([MAIN_WALLET])
  })

  it('a principal pode ser renomeada (ex.: Nubank)', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.saveWallet({ id: MAIN_WALLET, name: 'Nubank', kind: 'card' })
    expect((await source.listWallets()).map((w) => w.name)).toEqual(['Nubank'])
  })
})
