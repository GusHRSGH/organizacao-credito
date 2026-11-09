import { describe, expect, it } from 'vitest'
import { ENTRIES, LATEST, pendingEntries } from '../changelog'

describe('changelog', () => {
  it('as entradas estão em ordem decrescente e sem repetição', () => {
    const numbers = ENTRIES.map((entry) => entry.n)
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a))
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(LATEST).toBe(numbers[0])
  })
  it('quem nunca viu recebe as mais novas, no máximo 3', () => {
    expect(pendingEntries(null).length).toBeLessThanOrEqual(3)
  })
  it('quem já viu tudo não recebe nada', () => {
    expect(pendingEntries(LATEST)).toEqual([])
  })
  it('quem viu uma antiga recebe só as mais novas', () => {
    const sample = [{ n: 3, date: '', title: '', items: [] }, { n: 2, date: '', title: '', items: [] }, { n: 1, date: '', title: '', items: [] }]
    expect(pendingEntries(1, sample).map((entry) => entry.n)).toEqual([3, 2])
  })
})
