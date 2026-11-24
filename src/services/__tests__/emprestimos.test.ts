import { afterEach, describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { loanCharge, MAIN_WALLET, setActiveWallet, type Loan } from '../../lib/wallet'

const loan = (over: Partial<Loan> = {}): Loan => ({ person: 'Bia', installment: 520, count: 3, start: '2026-12-01', dueDay: 31, extraPct: 2, ...over })

describe('empréstimos e financiamentos', () => {
  afterEach(() => setActiveWallet(MAIN_WALLET))

  it('soma a % extra em cada parcela, no centavo', () => {
    expect(loanCharge({ installment: 520, extraPct: 2 })).toBe(530.4)
    expect(loanCharge({ installment: 333.33, extraPct: 0 })).toBe(333.33)
    expect(loanCharge({ installment: 100, extraPct: 1.5 })).toBe(101.5)
  })

  it('gera uma parcela por mês na carteira do empréstimo', async () => {
    const source = new LocalSource(new MemoryPersistence())
    const id = await source.createLoan('Carro', loan(), 'carro')
    expect(id).toBe('carro')
    expect((await source.listWallets()).find((w) => w.id === 'carro')?.kind).toBe('loan')
    setActiveWallet('carro')
    const invoices = await source.listInvoices()
    expect(invoices.map((i) => i.period).sort()).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
    const rows = await source.listAllTransactions()
    expect(rows.map((r) => r.amount)).toEqual([530.4, 530.4, 530.4])
    expect(rows.map((r) => r.description).sort()).toEqual(['Carro - Parcela 1/3', 'Carro - Parcela 2/3', 'Carro - Parcela 3/3'])
    // dia 31 cai no último dia em fevereiro
    expect(rows.map((r) => r.occurred_on).sort()).toEqual(['2026-12-31', '2027-01-31', '2027-02-28'])
    setActiveWallet(MAIN_WALLET)
    expect(await source.listAllTransactions()).toEqual([])
  })

  it('recusa cadastro incompleto sem criar a carteira', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await expect(source.createLoan('X', loan({ installment: 0 }))).rejects.toThrow('valor da parcela')
    await expect(source.createLoan('X', loan({ person: ' ' }))).rejects.toThrow('quem vai pagar')
    await expect(source.createLoan('X', loan({ count: 0 }))).rejects.toThrow('parcelas')
    expect((await source.listWallets()).length).toBe(1)
  })

  it('apagar o empréstimo leva as parcelas e não mexe no cartão', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.createPurchase({ invoiceId: '', description: 'Mercado', amount: 50, occurredOn: '2026-12-05', personName: 'Ana', categoryName: 'Casa', installmentCount: 1, period: '2026-12-01' })
    await source.createLoan('Carro', loan(), 'carro')
    await source.removeLoan('carro')
    expect((await source.listWallets()).map((w) => w.id)).toEqual([MAIN_WALLET])
    expect((await source.listAllTransactions()).map((t) => t.description)).toEqual(['Mercado'])
    await expect(source.removeLoan(MAIN_WALLET)).rejects.toThrow()
  })
})
