import { describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { validateBackup } from '../backup'

describe('taxa guardada com os dados (vai junto na nuvem e no backup)', () => {
  it('salva, substitui e entra no backup', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.createInvoice('2026-11-01')
    const [invoice] = await source.listInvoices()
    const fee = { invoice_id: invoice.id, name: 'Taxa teste', mode: 'fixed' as const, value: 100, excluded: [], overrides: {}, paid: [] }
    await source.saveFee(fee)
    await source.saveFee({ ...fee, value: 80, paid: ['Ana'] })
    expect(await source.listFees()).toEqual([{ ...fee, value: 80, paid: ['Ana'] }])
    const backup = await source.exportBackup()
    expect(validateBackup(backup).fees).toHaveLength(1)
    await expect(source.saveFee({ ...fee, mode: 'percent', value: 150 })).rejects.toThrow('inválido')
    await source.clearAll()
    expect(await source.listFees()).toEqual([])
  })
  it('backup antigo, sem taxa, continua valendo', () => {
    expect(validateBackup({ app: 'organizacao-credito', version: 1, data: { invoices: [], transactions: [], people: [], categories: [] } }).fees).toBeUndefined()
  })
})
