import { describe, expect, it } from 'vitest'
import { addMonthsToDate, addMonthsToPeriod, splitCents } from '../installments'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { parseAmount, parseDate, parseInstallment, parseSheet } from '../importXlsx'
import { validateBackup } from '../backup'
import { compareGroups, groupBy, totals, variation } from '../stats'

const newSource = () => new LocalSource(new MemoryPersistence())

describe('parcelas', () => {
  it('divide em centavos e põe a sobra na última', () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334])
    expect(splitCents(10000, 3).reduce((a, b) => a + b)).toBe(10000)
  })
  it('avança meses e limita ao fim do mês', () => {
    expect(addMonthsToPeriod('2026-11-01', 2)).toBe('2027-01-01')
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
  })
})

describe('banco local', () => {
  it('cria compra parcelada atômica com faturas futuras', async () => {
    const src = newSource()
    await src.createPurchase({ invoiceId: '', occurredOn: '2026-11-15', description: 'TV', amount: 100, personName: 'Ana', categoryName: 'Compras', installmentCount: 3 })
    const invoices = await src.listInvoices()
    expect(invoices.map((i) => i.period)).toEqual(['2027-01-01', '2026-12-01', '2026-11-01'])
    const rows = await src.listAllTransactions()
    expect(rows.map((r) => r.amount).sort()).toEqual([33.33, 33.33, 33.34])
    expect(rows.every((r) => r.person?.name === 'Ana' && r.installment_count === 3)).toBe(true)
  })
  it('rejeita dados inválidos sem gravar nada', async () => {
    const src = newSource()
    await expect(src.createPurchase({ invoiceId: '', occurredOn: '2026-11-15', description: ' ', amount: 10, personName: 'A', categoryName: 'B' })).rejects.toThrow()
    await expect(src.createPurchase({ invoiceId: '', occurredOn: '2026-11-15', description: 'x', amount: 0, personName: 'A', categoryName: 'B' })).rejects.toThrow()
    expect(await src.listInvoices()).toEqual([])
  })
  it('importa sem duplicar ao reimportar e junta parcelas do mesmo grupo', async () => {
    const src = newSource()
    const batch = [{ period: '2026-11-01', label: 'Novembro 2026', rows: [
      { date: '2026-10-01', description: 'Loja - Parcela 1/2', amount: 50, person: 'Ana', category: 'Compras', status: 'paid' as const, installmentNumber: 1, installmentCount: 2 },
      { date: '2026-10-02', description: 'Uber', amount: 10, person: 'Ana', category: 'Transporte', status: 'pending' as const, installmentNumber: null, installmentCount: null },
      { date: '2026-10-02', description: 'Uber', amount: 10, person: 'Ana', category: 'Transporte', status: 'pending' as const, installmentNumber: null, installmentCount: null },
    ] }]
    const dry = await src.importInvoices(batch, { dryRun: true })
    expect(dry.added).toBe(3)
    expect(await src.listAllTransactions()).toHaveLength(0)
    expect((await src.importInvoices(batch)).added).toBe(3)
    const again = await src.importInvoices(batch)
    expect(again.added).toBe(0)
    expect(again.duplicates).toBe(3)
    expect(await src.listAllTransactions()).toHaveLength(3)
  })
  it('backup restaura exatamente e rejeita lixo', async () => {
    const src = newSource()
    await src.createPurchase({ invoiceId: '', occurredOn: '2026-11-15', description: 'A', amount: 20, personName: 'Ana', categoryName: 'X' })
    const backup = await src.exportBackup()
    const other = newSource()
    await other.restoreBackup(JSON.parse(JSON.stringify(backup)))
    expect(await other.listAllTransactions()).toEqual(await src.listAllTransactions())
    expect(() => validateBackup({ app: 'outro' })).toThrow()
    expect(() => validateBackup({ ...backup, data: { ...backup.data, transactions: [{ ...backup.data.transactions[0], invoice_id: 'nada' }] } })).toThrow()
  })
  it('altera status em lote', async () => {
    const src = newSource()
    await src.createPurchase({ invoiceId: '', occurredOn: '2026-11-15', description: 'A', amount: 20, personName: 'Ana', categoryName: 'X' })
    const [row] = await src.listAllTransactions()
    await src.setStatusMany([row.id], 'paid')
    expect((await src.listAllTransactions())[0].status).toBe('paid')
  })
})

describe('leitura de planilha', () => {
  it('interpreta valores e parcelas', () => {
    expect(parseAmount('R$ 1.234,56')).toBe(1234.56)
    expect(parseAmount(0)).toBeNull()
    expect(parseDate('05/11/2026')).toBe('2026-11-05')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseInstallment('3/6')).toEqual({ number: 3, count: 6 })
    expect(parseInstallment('À vista', 'Loja - Parcela 2/4')).toEqual({ number: 2, count: 4 })
    expect(parseInstallment('7/6')).toBeNull()
  })
  it('lê uma aba de fatura, ignora linhas ruins e descarta abas sem colunas', () => {
    const data = [['Fatura'], [], ['Data', 'Titulo', 'Valor', 'Responsável', 'Status', 'Categoria', 'Parcela'],
      [new Date(Date.UTC(2026, 9, 5)), 'Padaria', 12.5, 'Ana', 'Pago', 'Alimentação', 'À vista'],
      ['x', 'Quebrada', 5, 'Ana', 'Pago', 'Outros', ''], [null, null, null]]
    const sheet = parseSheet('Fatura Novembro', data)!
    expect(sheet.period).toBe('2026-11-01')
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.rows[0].status).toBe('paid')
    expect(sheet.issues).toHaveLength(1)
    expect(parseSheet('Resumo', [['a', 'b']])).toBeNull()
  })
})

describe('estatísticas', () => {
  it('agrupa, compara e calcula variação', () => {
    const row = (amount: number, name: string, status: 'paid' | 'pending') => ({ id: String(Math.random()), user_id: 'u', invoice_id: 'i', occurred_on: '2026-11-01', description: 'd', amount, person_id: null, category_id: null, status, installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name }, category: null })
    const a = [row(10.1, 'Ana', 'paid'), row(0.2, 'Ana', 'pending'), row(5, 'Bia', 'pending')]
    expect(totals(a)).toMatchObject({ total: 15.3, paid: 10.1, pending: 5.2 })
    const rows = compareGroups(groupBy(a, 'person'), groupBy([row(8, 'Ana', 'paid')], 'person'))
    expect(rows[0]).toMatchObject({ name: 'Ana', a: 10.3, b: 8, pendingA: 0.2 })
    expect(variation(110, 100)).toBeCloseTo(0.1)
    expect(variation(5, 0)).toBeNull()
  })
})
