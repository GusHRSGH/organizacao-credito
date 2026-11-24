import { describe, expect, it } from 'vitest'
import { parsePastedBill } from '../pasteImport'

// Texto que o leitor de fotos tirou de um print da fatura aberta no app do banco.
const PRINT = `19:57 o oeoC€AA“do
< Fatura Aberta O)
R$ 754,30
Vencimento 10 de dezembro

Outras faturas

Histórico da fatura
PAGAMENTO EFETIVADO

Fr) -R$712,09
01 de novembro - 09:04
LOJA EXEMPLO 5/6

FE] / R$ 120,58
02 de julho - 10:25
MERCADO TESTE 1/3

Fc] / R$ 254,79
06 de novembro - 10:00
MERCADO TESTE 2/3

FE] / R$ 263,59
D6 de outubro - 12:06
PADARIA EXEMPLO 3 / 3

LC] / R$ 115,34
08 de setembro - 16:24`

describe('print do app do banco', () => {
  it('junta descrição, valor e data de cada compra e ignora o pagamento', () => {
    const { rows, skipped } = parsePastedBill(PRINT, '2026-11-24')
    expect(rows.map((r) => [r.description, r.amount, r.date])).toEqual([
      ['LOJA EXEMPLO 5/6', 120.58, '2026-07-02'],
      ['MERCADO TESTE 1/3', 254.79, '2026-11-06'],
      ['MERCADO TESTE 2/3', 263.59, '2026-10-06'],
      ['PADARIA EXEMPLO 3/3', 115.34, '2026-09-08'],
    ])
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(754.3, 2)
    expect(skipped.some((s) => /PAGAMENTO/.test(s.text))).toBe(true)
  })

  it('não confunde a fatura colada linha a linha', () => {
    const { rows } = parsePastedBill('05/11 SUPERMERCADO XYZ 152,30\n06/11 PADARIA 23,40', '2026-11-24')
    expect(rows.map((r) => r.description)).toEqual(['SUPERMERCADO XYZ', 'PADARIA'])
  })
})

describe('preparo da imagem para o leitor', () => {
  it('cinza-claro vira preto e tema escuro é invertido', async () => {
    const { binarize } = await import('../../services/ocr')
    const light = new Uint8ClampedArray([255, 255, 255, 255, 154, 154, 154, 255, 255, 255, 255, 255])
    binarize(light)
    expect([light[0], light[4], light[8]]).toEqual([255, 0, 255])
    const dark = new Uint8ClampedArray([10, 10, 10, 255, 240, 240, 240, 255, 10, 10, 10, 255])
    binarize(dark)
    expect([dark[0], dark[4], dark[8]]).toEqual([255, 0, 255])
  })
})

describe('vencimento da fatura no texto', () => {
  it('acha o vencimento por extenso, em número e vira o ano quando precisa', async () => {
    const { detectDueDate } = await import('../pasteImport')
    expect(detectDueDate('R$ 754,30\nVencimento 10 de dezembro', '2026-11-24')).toEqual({ date: '2026-12-10', period: '2026-12-01', day: 10 })
    expect(detectDueDate('Vence em 07/01', '2026-11-24')?.period).toBe('2027-01-01')
    expect(detectDueDate('Vencimento: 15 NOV 2026', '2026-11-24')?.date).toBe('2026-11-15')
    expect(detectDueDate('05/11 MERCADO 10,00', '2026-11-24')).toBeNull()
  })
})
