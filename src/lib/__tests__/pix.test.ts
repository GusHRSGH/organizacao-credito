import { describe, expect, it } from 'vitest'
import { crc16, detectPixKey, pixPayload } from '../pix'
import { EMPTY_RECEIVING, receivingText } from '../receiving'

describe('pix', () => {
  it('calcula o CRC16 certo', () => { expect(crc16('123456789')).toBe('29B1') })
  it('reconhece os tipos de chave', () => {
    expect(detectPixKey('Ana@Email.com')).toEqual({ kind: 'email', key: 'ana@email.com' })
    expect(detectPixKey('529.982.247-25')).toEqual({ kind: 'cpf', key: '52998224725' })
    expect(detectPixKey('11.222.333/0001-81')).toEqual({ kind: 'cnpj', key: '11222333000181' })
    expect(detectPixKey('(44) 99999-1234')).toEqual({ kind: 'phone', key: '+5544999991234' })
    expect(detectPixKey('123e4567-e89b-12d3-a456-426614174000')?.kind).toBe('random')
    expect(detectPixKey('abc')).toBeNull()
    expect(detectPixKey('111.111.111-11')).toBeNull()
  })
  it('gera um copia e cola com valor e CRC consistente', () => {
    const code = pixPayload({ key: 'ana@email.com', name: 'Ana Souza', city: 'Maringá', amount: 23.9, reference: 'Nov2026' })
    expect(code.startsWith('000201')).toBe(true)
    expect(code).toContain('0014br.gov.bcb.pix0113ana@email.com')
    expect(code).toContain('540523.90')
    expect(code).toContain('5909ANA SOUZA')
    expect(code).toContain('6007MARINGA')
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)))
  })
  it('monta o bloco de texto da cobrança', () => {
    expect(receivingText(EMPTY_RECEIVING, 10)).toBe('')
    const text = receivingText({ ...EMPTY_RECEIVING, key: 'ana@email.com', holder: 'Ana', note: 'Manda o comprovante' }, 50)
    expect(text).toContain('Pix (e-mail): ana@email.com · Ana')
    expect(text).toContain('copia e cola')
    expect(text).toContain('Manda o comprovante')
    expect(receivingText({ ...EMPTY_RECEIVING, key: 'ana@email.com', include: false }, 50)).toBe('')
  })
})

import { billsByPerson, buildGroupMessage, buildMessage } from '../billing'
import type { Transaction } from '../../types'

const tx = (id: string, invoice: string, person: string, amount: number, status: 'paid' | 'pending' = 'pending'): Transaction => ({ id, user_id: 'u', invoice_id: invoice, occurred_on: '2026-11-05', description: `Compra ${id}`, amount, person_id: null, category_id: null, status, installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: null })

describe('cobrança', () => {
  const rows = [tx('a', 'i1', 'Ana', 50), tx('b', 'i2', 'Ana', 30), tx('c', 'i1', 'Bia', 20), tx('d', 'i1', 'Bia', 5, 'paid')]
  const receiving = { ...EMPTY_RECEIVING, key: 'ana@email.com', holder: 'Gus' }
  it('junta faturas em aberto agrupando por mês e leva o Pix', () => {
    const [ana] = billsByPerson(rows.filter((r) => r.status !== 'paid'))
    const text = buildMessage(ana, '2 faturas', { receiving, invoiceLabels: new Map([['i1', 'Outubro'], ['i2', 'Novembro']]) })
    expect(text).toContain('Outubro (R$')
    expect(text).toContain('Novembro (R$')
    expect(text).toContain('Pix (e-mail)')
    expect(text).toContain('Total: R$')
  })
  it('monta o acerto do grupo', () => {
    const text = buildGroupMessage(billsByPerson(rows), 'Outubro', receiving)
    expect(text).toContain('• Ana:')
    expect(text).toContain('• Bia:')
    expect(text).toContain('Pix (e-mail)')
    expect(buildGroupMessage(billsByPerson([tx('z', 'i1', 'Ana', 10, 'paid')]), 'Outubro')).toContain('tudo pago')
  })
})

describe('cobrança com taxa de uso do cartão', () => {
  const rows = [tx('a', 'i1', 'Ana', 1200), tx('b', 'i1', 'Bia', 800, 'paid')]
  it('a taxa entra no detalhe e no total, com a conta', () => {
    const [ana] = billsByPerson(rows)
    const text = buildMessage(ana, 'Novembro', { fees: [{ text: 'Taxa teste (proporcional ao seu gasto)', amount: 30 }] })
    expect(text).toContain('• Taxa teste (proporcional ao seu gasto): R$')
    expect(text).toMatch(/Sua parte da fatura de Novembro: R\$\s1\.230,00/)
    expect(text).toMatch(/Total: R\$\s1\.230,00/)
  })
  it('quem já pagou as compras ainda recebe a cobrança só da taxa', () => {
    const bia = billsByPerson(rows).find((b) => b.name === 'Bia')!
    expect(buildMessage(bia, 'Novembro')).toContain('nada pendente')
    expect(buildMessage(bia, 'Novembro', { fees: [{ text: 'Taxa teste', amount: 20 }] })).toMatch(/Total: R\$\s20,00/)
    expect(buildGroupMessage(billsByPerson(rows), 'Novembro', undefined, new Map([['Ana', 30], ['Bia', 20]]))).toContain('• Bia: R$')
  })
})

describe('Pix separado da mensagem de detalhes', () => {
  const rows = [tx('a', 'i1', 'Ana', 120)]
  const receiving = { ...EMPTY_RECEIVING, key: 'ana@email.com', holder: 'Gus Teste', note: 'Manda o comprovante.' }
  it('os detalhes não levam a chave, só o recado e o aviso', async () => {
    const [ana] = billsByPerson(rows)
    const text = buildMessage(ana, 'Novembro', { receiving, pixSeparate: true })
    expect(text).not.toContain('ana@email.com')
    expect(text).not.toContain('000201')
    expect(text).toContain('Manda o comprovante.')
    expect(text.trim().endsWith('É só copiar o Pix que te mandei.')).toBe(true)
  })
  it('o Pix copia e cola sai sozinho, com o valor, e só quando dá para gerar', async () => {
    const { pixCode } = await import('../receiving')
    const code = pixCode(receiving, 120, 'Novembro')!
    expect(code.startsWith('000201')).toBe(true)
    expect(code).toContain('5406120.00')
    expect(code).toMatch(/^000201[^\n]*6304[0-9A-F]{4}$/)
    expect(pixCode({ ...receiving, holder: '' }, 120)).toBeNull()
    expect(pixCode({ ...receiving, key: 'xyz' }, 120)).toBeNull()
    expect(pixCode(receiving, 0)).toBeNull()
  })
})
