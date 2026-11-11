import { describe, expect, it } from 'vitest'
import { parseNotification, toQuickLine } from '../notificacao'

const today = '2026-11-11'
const get = (text: string) => parseNotification(text, today)

describe('notificações de compra do banco', () => {
  it('lê o formato do Nubank', () => {
    expect(get('Compra de R$ 89,90 APROVADA em MERCADO LIVRE')).toEqual({ description: 'Mercado Livre', amount: 89.9, installments: 1, date: null })
  })
  it('lê "compra aprovada no cartão final" com estabelecimento depois do valor (Itaú)', () => {
    expect(get('Compra aprovada: cartão final 1234 R$ 45,00 PADARIA SAO JOSE 10/11 14:32')).toMatchObject({ description: 'Padaria Sao Jose', amount: 45, installments: 1, date: '2026-11-10' })
  })
  it('lê "em UBER*TRIP" e tira o código do intermediador', () => {
    expect(get('Compra no crédito aprovada: R$ 32,10 em UBER *TRIP')).toMatchObject({ description: 'Uber Trip', amount: 32.1 })
    expect(get('Compra aprovada R$ 20,00 em IFD*IFOOD')).toMatchObject({ description: 'Ifood' })
  })
  it('lê parcelado e valor com milhar', () => {
    expect(get('Compra aprovada em 3x de R$ 100,00 em MAGAZINE LUIZA')).toMatchObject({ amount: 300, installments: 3, description: 'Magazine Luiza' })
    expect(get('Compra de R$ 1.299,00 aprovada em CASAS BAHIA em 6x')).toMatchObject({ amount: 1299, installments: 6, description: 'Casas Bahia' })
  })
  it('lê o formato com traços (C6)', () => {
    expect(get('Compra aprovada no cartão C6 final 4321 - R$ 20,00 - IFOOD')).toMatchObject({ description: 'Ifood', amount: 20 })
  })
  it('ignora o que não é compra no cartão', () => {
    expect(get('Pix enviado de R$ 50,00 para Ana')).toBeNull()
    expect(get('Compra no débito de R$ 12,00 em MERCADO')).toBeNull()
    expect(get('Sua fatura fechou em R$ 1.200,00')).toBeNull()
    expect(get('mercado 150,90 3x')).toBeNull()
    expect(get('')).toBeNull()
  })
  it('monta o texto do lançamento rápido com o valor por último', () => {
    expect(toQuickLine({ description: 'Mercado Livre', amount: 89.9, installments: 1, date: null })).toBe('Mercado Livre 89,90')
    expect(toQuickLine({ description: 'Loja 123', amount: 300, installments: 3, date: '2026-11-10' })).toBe('Loja 123 3x 10/11/2026 300,00')
  })
})
