import { describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'

const newSource = () => new LocalSource(new MemoryPersistence())
const base = { invoiceId: '', occurredOn: '2026-11-15', description: 'TV', amount: 100, personName: 'Ana', categoryName: 'Casa' }

describe('edição', () => {
  it('edita só uma parcela', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 3 })
    const rows = await src.listAllTransactions()
    const second = rows.find((row) => row.installment_number === 2)!
    await src.updateTransaction(second.id, { description: 'TV 4K', amount: 40, occurredOn: '2026-12-20', personName: 'Bruno', categoryName: 'Casa' })
    const after = (await src.listAllTransactions()).find((row) => row.id === second.id)!
    expect(after).toMatchObject({ description: 'TV 4K', amount: 40, occurred_on: '2026-12-20' })
    expect(after.person?.name).toBe('Bruno')
  })

  it('recalcula a compra inteira e mantém pagas as parcelas que continuam', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 3 })
    const first = (await src.listAllTransactions()).find((row) => row.installment_number === 1)!
    await src.setTransactionStatus(first.id, 'paid')
    await src.updatePurchase(first.installment_group!, { description: 'TV', total: 200, occurredOn: '2026-11-15', personName: 'Ana', categoryName: 'Casa', installmentCount: 4 })
    const rows = (await src.listAllTransactions()).filter((row) => row.installment_group).sort((a, b) => a.installment_number! - b.installment_number!)
    expect(rows.map((row) => row.amount)).toEqual([50, 50, 50, 50])
    expect(rows.map((row) => row.status)).toEqual(['paid', 'pending', 'pending', 'pending'])
    expect((await src.listInvoices()).length).toBe(4)
  })

  it('compra parcelada vira à vista com 1 parcela', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 3 })
    const group = (await src.listAllTransactions())[0].installment_group!
    await src.updatePurchase(group, { description: 'TV', total: 100, occurredOn: '2026-11-15', personName: 'Ana', categoryName: 'Casa', installmentCount: 1 })
    const rows = await src.listAllTransactions()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 100, installment_group: null })
  })

  it('rejeita dados inválidos sem alterar nada', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 1 })
    const row = (await src.listAllTransactions())[0]
    await expect(src.updateTransaction(row.id, { description: '', amount: 10, occurredOn: '2026-11-15', personName: 'Ana', categoryName: 'Casa' })).rejects.toThrow()
    await expect(src.updateTransaction(row.id, { description: 'x', amount: 0, occurredOn: '2026-11-15', personName: 'Ana', categoryName: 'Casa' })).rejects.toThrow()
    expect((await src.listAllTransactions())[0].description).toBe('TV')
  })

  it('troca categoria em lote', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 1 })
    await src.createPurchase({ ...base, description: 'Pizza', installmentCount: 1 })
    const ids = (await src.listAllTransactions()).map((row) => row.id)
    await src.updateMany(ids, { categoryName: 'Lazer' })
    expect((await src.listAllTransactions()).every((row) => row.category?.name === 'Lazer')).toBe(true)
  })

  it('remove e desfaz a exclusão', async () => {
    const src = newSource()
    await src.createPurchase({ ...base, installmentCount: 3 })
    const ids = (await src.listAllTransactions()).map((row) => row.id)
    const removed = await src.removeTransactions(ids.slice(0, 2))
    expect(await src.listAllTransactions()).toHaveLength(1)
    await src.restoreTransactions(removed)
    expect(await src.listAllTransactions()).toHaveLength(3)
    await src.restoreTransactions(removed)
    expect(await src.listAllTransactions()).toHaveLength(3)
  })
})
