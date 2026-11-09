import { describe, expect, it } from 'vitest'
import { summarize } from '../insight'
import { guessCategory } from '../keywords'
import { buildSuggestions, suggestFor } from '../suggest'
import type { Transaction } from '../../types'

const row = (description: string, category: string): Transaction => ({ id: description, user_id: 'u', invoice_id: 'i', occurred_on: '2026-10-01', description, amount: 10, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', category: { name: category } })

describe('resumo em texto', () => {
  const cat = (name: string, a: number, b: number) => ({ name, a, b, diff: a - b, paidA: 0, pendingA: a })
  it('explica a alta e aponta quem puxou', () => {
    const text = summarize({ label: 'Novembro', total: 1080, pending: 300, count: 12, otherLabel: 'Outubro', otherTotal: 1000, categories: [cat('Lazer', 400, 300), cat('Casa', 680, 700)] })
    expect(text).toContain('puxado por Lazer')
    expect(text).toContain('a mais que em Outubro')
    expect(text).toContain('Falta pagar')
  })
  it('explica a queda e o mês pago', () => {
    const text = summarize({ label: 'Novembro', total: 900, pending: 0, count: 3, otherLabel: 'Outubro', otherTotal: 1000, categories: [cat('Lazer', 100, 200)] })
    expect(text).toContain('a menos')
    expect(text).toContain('aliviado por Lazer')
    expect(text).toContain('Tudo pago')
  })
  it('sem comparação mostra a maior fatia, e mês vazio avisa', () => {
    expect(summarize({ label: 'Nov', total: 100, pending: 10, count: 1, categories: [cat('Casa', 100, 0)] })).toContain('maior fatia é Casa')
    expect(summarize({ label: 'Nov', total: 0, pending: 0, count: 0, categories: [] })).toContain('ainda não tem')
  })
})

describe('categoria por palavras', () => {
  it('só sugere categorias que a pessoa já tem', () => {
    expect(guessCategory('Uber viagem', ['Transporte', 'Casa'])).toBe('Transporte')
    expect(guessCategory('Uber viagem', ['Casa'])).toBeNull()
    expect(guessCategory('Farmácia Pague Menos', ['Saúde'])).toBe('Saúde')
    expect(guessCategory('xyz', ['Casa'])).toBeNull()
  })
  it('não confunde pedaços de palavras', () => {
    expect(guessCategory('Barra de cereal', ['Lazer'])).toBeNull()
  })
  it('o histórico vence a palavra-chave', () => {
    const map = buildSuggestions([row('Uber do trabalho', 'Casa'), row('Netflix', 'Lazer')])
    expect(suggestFor('Uber do trabalho', map)?.category).toBe('Casa')
    expect(suggestFor('Spotify', map)?.category).toBe('Lazer')
  })
})
