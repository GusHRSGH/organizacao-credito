import { describe, expect, it } from 'vitest'
import { analyzeSheet, applyMapping, fixMojibake, parseCsv } from '../smartImport'

const linhas = [
  ['01/11/2026', '-13.95', '6ae6cfe6-dd27-4e15-bb1a-bc68ff04ab00', 'Transferência enviada pelo Pix - ANA TESTE - 000'],
  ['01/11/2026', '40', '6ae87437-86ae-4e15-bb1a-bc68ff04ab01', 'Resgate RDB'],
  ['04/11/2026', '-44.89', '6aeb5db6-0b9e-4b12-85ff-609f64f08e81', 'Compra no débito - MERCADO TESTE'],
  ['05/11/2026', '-600', '6aedec22-c491-4b12-85ff-609f64f08e82', 'Aplicação RDB'],
  ['06/11/2026', '-70', '6aee1223-ff37-4b12-85ff-609f64f08e83', 'Plano Nucel - Conta'],
  ['07/11/2026', '2180.06', '6aedacd6-9027-4b12-85ff-609f64f08e84', 'Transferência recebida pelo Pix - EMPRESA TESTE'],
  ['09/11/2026', '-300', '6aedacd6-9027-4b12-85ff-609f64f08e85', 'Pagamento da fatura'],
]
const csv = ['Data,Valor,Identificador,Descrição', ...linhas.map((l) => l.map((c) => `"${c}"`).join(','))].join('\n')
const quebrado = (text: string) => Buffer.from(text, 'utf8').toString('latin1')

function ler(text: string) {
  const data = parseCsv(fixMojibake(text))
  const proposal = analyzeSheet('NU_000_01NOV2026_30NOV2026', data)!
  return { proposal, parsed: applyMapping(proposal, data, null)[0] }
}

describe('extrato da conta do Nubank', () => {
  it('desfaz o acento quebrado e deixa o texto certo como está', () => {
    expect(fixMojibake('Transferência enviada')).toBe('Transferência enviada')
    expect(fixMojibake(quebrado('Transferência enviada, Descrição, débito'))).toBe('Transferência enviada, Descrição, débito')
    expect(fixMojibake('Só Ã sozinho')).toBe('Só Ã sozinho')
  })

  it('usa a Descrição como título, nunca o Identificador', () => {
    for (const text of [csv, quebrado(csv)]) {
      const { proposal, parsed } = ler(text)
      expect(proposal.fields).toEqual(['date', 'amount', 'ignore', 'desc'])
      expect(parsed.rows.map((r) => r.description)).toContain('Compra no débito - MERCADO TESTE')
      expect(parsed.rows.some((r) => /^[0-9a-f]{8}-/.test(r.description))).toBe(false)
    }
  })

  it('não conta investimento nem pagamento da fatura como gasto', () => {
    const { parsed } = ler(csv)
    expect(parsed.rows.map((r) => r.description)).toEqual(['Transferência enviada pelo Pix - ANA TESTE - 000', 'Compra no débito - MERCADO TESTE', 'Plano Nucel - Conta'])
    expect(parsed.rows.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(128.84, 2)
    expect(parsed.issues.filter((i) => i.includes('não é gasto'))).toHaveLength(3)
  })

  it('mesmo sem cabeçalho legível, uma coluna de códigos não vira título', () => {
    const semTitulos = ['A,B,C,D', ...linhas.map((l) => l.map((c) => `"${c}"`).join(','))].join('\n')
    const { proposal } = ler(semTitulos)
    expect(proposal.fields[proposal.fields.indexOf('desc')]).toBe('desc')
    expect(proposal.fields.indexOf('desc')).toBe(3)
  })
})

describe('planilha sem data (orçamento do mês)', () => {
  const data = [['Orçamento - Dezembro/2026', ''], ['Descrição', 'Valor'], ['Aluguel', '1200'], ['Mercado', '850,40'], ['Internet', '99,90']]
  it('acha o mês no título da planilha', async () => {
    const { guessSheetMonth } = await import('../smartImport')
    expect(guessSheetMonth('Planilha1', data, '2026-11-18')).toBe('2026-12-01')
    expect(guessSheetMonth('Gastos', [['Aluguel', '1200']], '2026-11-18')).toBe('2026-11-01')
  })
  it('com um mês fixo, importa tudo nesse mês', () => {
    const proposal = analyzeSheet('Planilha1', data)!
    expect(proposal.fields.includes('date')).toBe(false)
    const [sheet] = applyMapping({ ...proposal, fixedPeriod: '2026-12-01' }, data, null)
    expect(sheet.period).toBe('2026-12-01')
    expect(sheet.rows.map((r) => [r.date, r.description, r.amount])).toEqual([['2026-12-01', 'Aluguel', 1200], ['2026-12-01', 'Mercado', 850.4], ['2026-12-01', 'Internet', 99.9]])
  })
})
