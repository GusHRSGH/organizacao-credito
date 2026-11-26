import { describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { MAIN_WALLET } from '../../lib/wallet'

const fixa = { id: 'n', description: 'Netflix', amount: 55.9, person: 'Ana', category: 'Lazer', wallet: MAIN_WALLET, day: 31, active: true, start: '2026-11-01' }

describe('despesas fixas', () => {
  it('lança uma vez por mês até o mês pedido, sem repetir', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.saveRecurring(fixa)
    expect(await source.launchRecurring('2027-01-01')).toBe(3)
    expect(await source.launchRecurring('2027-01-01')).toBe(0)
    const rows = await source.listAllTransactions()
    expect(rows.map((r) => r.occurred_on).sort()).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])
    expect(rows.every((r) => r.person?.name === 'Ana' && r.amount === 55.9)).toBe(true)
    expect((await source.listRecurring())[0].last).toBe('2027-01-01')
  })

  it('pausada não lança, e recusa cadastro incompleto', async () => {
    const source = new LocalSource(new MemoryPersistence())
    await source.saveRecurring({ ...fixa, active: false })
    expect(await source.launchRecurring('2026-12-01')).toBe(0)
    await expect(source.saveRecurring({ ...fixa, id: 'x', amount: 0 })).rejects.toThrow('valor')
    await source.removeRecurring('n')
    expect(await source.listRecurring()).toEqual([])
  })
})
