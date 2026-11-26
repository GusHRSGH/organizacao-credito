import { describe, expect, it } from 'vitest'
import { moneyFull } from '../format'

describe('dinheiro', () => {
  it('não mostra "-R$ 0,00" quando a conta dá zero com sobra de ponto flutuante', () => {
    expect(moneyFull(1460.12 - (1492.14 - 32.02))).toMatch(/^R\$\s0,00$/)
    expect(moneyFull(-0)).toMatch(/^R\$\s0,00$/)
  })
})
