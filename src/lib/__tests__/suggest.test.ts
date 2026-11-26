import { describe, expect, it } from 'vitest'
import { buildSuggestions, historyKey, suggestFor } from '../suggest'
import type { Transaction } from '../../types'

let n = 0
const row = (description: string, person: string, category = 'Mercado'): Transaction => ({
  id: String(++n), user_id: 'u', invoice_id: 'i', occurred_on: `2026-11-${String((n % 27) + 1).padStart(2, '0')}`, description, amount: 10,
  person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: { name: category },
})

describe('robô aprende o responsável', () => {
  it('ignora parcela, maquininha e códigos', () => {
    expect(historyKey('MUFFATO COLOMBO 2/3')).toBe('muffato colombo')
    expect(historyKey('PG *LOJA EXEMPLO 123456')).toBe('loja exemplo')
    expect(historyKey('IFD*RESTAURANTE BOM')).toBe('restaurante bom')
  })

  it('outra filial da mesma marca vai para quem costuma comprar lá', () => {
    const map = buildSuggestions([row('MUFFATO COLOMBO 1/3', 'Rosana'), row('MUFFATO CENTRO', 'Rosana')])
    expect(suggestFor('MUFFATO JOAO PAULINO 3/3', map)?.person).toBe('Rosana')
  })

  it('loja genérica usa a palavra seguinte, e sem maioria clara o robô não chuta', () => {
    const map = buildSuggestions([row('FARMACIA PAGUE MENOS', 'Ana', 'Saúde'), row('FARMACIA SAO JOAO', 'Bia', 'Saúde'), row('POSTO SHELL', 'Ana'), row('POSTO SHELL CENTRO', 'Bia')])
    expect(suggestFor('FARMACIA PAGUE MENOS LOJA 2', map)?.person).toBe('Ana')
    expect(suggestFor('POSTO SHELL AVENIDA', map)?.person ?? null).toBeNull()
  })
})
