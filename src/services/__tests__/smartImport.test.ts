import { describe, expect, it } from 'vitest'
import { analyzeSheet, applyMapping, parseCsv, parseMoney } from '../smartImport'

describe('robô de importação', () => {
  it('entende títulos fora do padrão e colunas fora de ordem', () => {
    const data = [
      ['Relatório do cartão'],
      ['Estabelecimento', 'Data da compra', 'Valor (R$)', 'Quem', 'Situação'],
      ['Padaria Pão Quente', '05/11/2026', 'R$ 23,90', 'Ana', 'Pago'],
      ['Posto Shell', '07/11/2026', '180,00', 'Bia', 'Pendente'],
    ]
    const p = analyzeSheet('Cartão', data)!
    expect(p.ok).toBe(true)
    expect(p.headerIndex).toBe(1)
    expect(p.fields).toEqual(['desc', 'date', 'amount', 'person', 'status'])
    const [sheet] = applyMapping(p, data)
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0]).toMatchObject({ description: 'Padaria Pão Quente', date: '2026-11-05', amount: 23.9, person: 'Ana', status: 'paid' })
    expect(sheet.period).toBe('2026-11-01')
  })

  it('descobre as colunas só pelo conteúdo, sem cabeçalho', () => {
    const data = [
      ['2026-10-03', 'Uber *Trip', -32.5, '1/1'],
      ['2026-10-09', 'Mercado Central', -210.9, '1/1'],
      ['2026-10-20', 'Loja de Roupas 2/6', -90, '2/6'],
      ['2026-10-21', 'Pagamento recebido', 500, ''],
    ]
    const p = analyzeSheet('extrato', data)!
    expect(p.headerIndex).toBe(-1)
    expect(p.fields.slice(0, 3)).toEqual(['date', 'desc', 'amount'])
    expect(p.confidence[0]).toBe('media')
    const [sheet] = applyMapping(p, data)
    expect(sheet.rows.map((r) => r.amount)).toEqual([32.5, 210.9, 90])
    expect(sheet.issues.join()).toContain('estorno ou pagamento')
    expect(sheet.rows[2].installmentNumber).toBe(2)
  })

  it('divide em uma fatura por mês quando a aba não diz o mês', () => {
    const data = [['Data', 'Descrição', 'Valor'], ['10/09/2026', 'A', '10,00'], ['10/10/2026', 'B', '20,00']]
    const sheets = applyMapping(analyzeSheet('Tudo', data)!, data)
    expect(sheets.map((s) => s.period)).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('não confunde valor inteiro com data do Excel', () => {
    const data = [['Data', 'Descrição', 'Valor'], [new Date(Date.UTC(2026, 10, 2)), 'Aluguel', 1500], [new Date(Date.UTC(2026, 10, 3)), 'Luz', 230]]
    const p = analyzeSheet('Nov', data)!
    expect(p.fields).toEqual(['date', 'desc', 'amount'])
    expect(applyMapping(p, data)[0].rows[0].amount).toBe(1500)
  })

  it('avisa quando não dá para entender', () => {
    expect(analyzeSheet('Vazia', [['a'], ['b']])).toBeNull()
    expect(analyzeSheet('Texto', [['oi', 'tchau'], ['sim', 'não']])?.ok).toBe(false)
  })

  it('lê valores em vários formatos e CSV com ponto e vírgula', () => {
    expect(parseMoney('R$ 1.234,56')).toBe(1234.56)
    expect(parseMoney('(45,90)')).toBe(-45.9)
    expect(parseMoney('abc')).toBeNull()
    expect(parseCsv('Data;Descrição;Valor\r\n01/11/2026;"Café; pão";12,50\r\n')).toEqual([['Data', 'Descrição', 'Valor'], ['01/11/2026', 'Café; pão', '12,50']])
  })
})
