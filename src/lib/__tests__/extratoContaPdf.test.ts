import { describe, expect, it } from 'vitest'
import { parsePastedBill } from '../pasteImport'
import { fixMojibake } from '../../services/smartImport'

// Extrato da conta como sai de um PDF: id cortado (às vezes colado na descrição) e acento quebrado.
const quebrado = (text: string) => Buffer.from(text, 'utf8').toString('latin1')
const extrato = [
  'Data                Valor           Identificador     Descrição',
  '       01/11/2026            -13,95 6ae6cfe6-dd27-4e1Transferência enviada pelo Pix - LOJA TESTE LTDA. - 11.111.111/0001-11 - BANCO TESTE S.A. Agência: 1 Conta: 1-0',
  '       02/11/2026               40 6ae87437-86ae-4e Resgate RDB',
  '       04/11/2026            -44,89 6aeb5db6-0b9e-4b Compra no débito - MERCADO TESTE',
  '       05/11/2026              -600 6aedec22-c491-4f1Aplicação RDB',
  '       06/11/2026           2180,06 6aedacd6-9027-48 Transferência recebida pelo Pix - EMPRESA TESTE - ••• .111.111-•• - BANCO TESTE S.A. Agência: 3 Conta: 2-0',
  '       06/11/2026              -205 6aedad87-b772-41 Pagamento de boleto efetuado - ESCOLA TESTE LTDA',
  '       07/11/2026               -70 6aee1223-ff37-499 Plano Nucel - Conta',
  '       09/11/2026            -94,2 6af2432a-cdc6-403Compra no débito - PADARIA TESTE',
  '13/11/2026                    -14,5 6af718a8-34f5-4c9 Transferência enviada pelo Pix - Maria Teste Silva (Transferência enviada)',
].join('\n')

describe('extrato da conta em PDF ou texto colado', () => {
  it('só o que saiu vira gasto, com o valor positivo', () => {
    for (const texto of [extrato, quebrado(extrato)]) {
      const r = parsePastedBill(texto, '2026-11-15')
      expect(r.rows.map((x) => [x.date, x.description, x.amount])).toEqual([
        ['2026-11-01', 'Pix - LOJA TESTE LTDA.', 13.95],
        ['2026-11-04', 'Compra no débito - MERCADO TESTE', 44.89],
        ['2026-11-06', 'Boleto - ESCOLA TESTE LTDA', 205],
        ['2026-11-07', 'Plano Nucel - Conta', 70],
        ['2026-11-09', 'Compra no débito - PADARIA TESTE', 94.2],
        ['2026-11-13', 'Pix - Maria Teste Silva', 14.5],
      ])
    }
  })

  it('investimento e dinheiro que entrou ficam de fora, com o motivo', () => {
    const r = parsePastedBill(extrato, '2026-11-15')
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(['entrada de dinheiro', 'movimentação entre as suas contas, não é gasto', 'movimentação entre as suas contas, não é gasto'])
  })

  it('o id colado na descrição não come a primeira letra maiúscula', () => {
    const r = parsePastedBill(extrato, '2026-11-15')
    expect(r.rows.some((x) => x.description.startsWith('ompra'))).toBe(false)
  })

  it('texto comum de fatura continua sendo lido como antes', () => {
    const r = parsePastedBill('05 NOV  SUPERMERCADO TESTE  152,30\n06 NOV  PADARIA TESTE  23,40', '2026-11-15')
    expect(r.rows).toHaveLength(2)
  })

  it('devolve o í que o PDF perde no acento quebrado', () => {
    expect(fixMojibake('DescriÃ§Ã£o, PatrÃcia')).toBe('Descrição, Patrícia')
  })
})
