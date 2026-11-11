import { describe, expect, it } from 'vitest'
import { goalAlerts } from '../goalAlert'
import type { Goal } from '../goals'
import type { Transaction } from '../../types'

const row = (person: string, category: string, amount: number) => ({ id: Math.random(), invoice_id: 'i', amount, person: { name: person }, category: { name: category } }) as unknown as Transaction
const goals: Goal[] = [
  { id: 'a', scope: 'person', name: 'Ana', limit: 1000 },
  { id: 'b', scope: 'category', name: 'Lazer', limit: 300 },
  { id: 'c', scope: 'person', name: 'Ana', category: 'Mercado', limit: 500 },
]

describe('alerta de meta antes de salvar', () => {
  it('avisa quando a compra estoura a meta da pessoa', () => {
    const alerts = goalAlerts(goals, [row('Ana', 'Mercado', 900)], { person: 'Ana', category: 'Casa', amount: 150 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe('over')
    expect(alerts[0].text).toContain('passa do limite')
  })
  it('avisa quando chega perto (80% ou mais)', () => {
    const alerts = goalAlerts(goals, [row('Ana', 'Casa', 700)], { person: 'Ana', category: 'Casa', amount: 120 })
    expect(alerts[0]).toMatchObject({ level: 'warn' })
    expect(alerts[0].text).toContain('82%')
  })
  it('não avisa quando está folgado ou a meta é de outro escopo', () => {
    expect(goalAlerts(goals, [row('Ana', 'Casa', 100)], { person: 'Ana', category: 'Casa', amount: 50 })).toEqual([])
    expect(goalAlerts(goals, [row('Bia', 'Casa', 5000)], { person: 'Bia', category: 'Casa', amount: 50 })).toEqual([])
  })
  it('respeita a categoria da meta de pessoa e junta categoria e pessoa', () => {
    const alerts = goalAlerts(goals, [row('Ana', 'Mercado', 480), row('Bia', 'Lazer', 290)], { person: 'Ana', category: 'Lazer', amount: 40 })
    // Ana em Mercado não conta para uma compra de Lazer; Lazer total passa de 300.
    expect(alerts.map((a) => a.goal.id)).toEqual(['b'])
    expect(alerts[0].level).toBe('over')
  })
  it('lista primeiro o que estoura', () => {
    const alerts = goalAlerts(goals, [row('Ana', 'Lazer', 810), row('Bia', 'Lazer', 0)], { person: 'Ana', category: 'Lazer', amount: 200 })
    expect(alerts[0].level).toBe('over')
  })
  it('ignora valor inválido', () => {
    expect(goalAlerts(goals, [], { person: 'Ana', amount: 0 })).toEqual([])
  })
})
