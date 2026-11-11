import { describe, expect, it } from 'vitest'
import { buildQuestions, findRefunds, questionKey } from '../assign'
import { classifyRows, readBankFile } from '../bankImport'
import { buildSuggestions } from '../suggest'
import type { Transaction } from '../../types'

/** Formato real do CSV do Nubank: só date,title,amount, vírgula decimal, crédito com espaço ("- 9,94") e milhar com ponto. Nomes inventados. */
const CSV = `date,title,amount
2026-11-10,Pagamento recebido,"- 9,94"
2026-11-09,Uber - NuPay,"9,94"
2026-11-09,IOF de compra internacional,"3,50"
2026-11-09,Servico Ai* Assinatura,"100,00"
2026-11-07,Pagamento recebido,"- 4.182,94"
2026-11-05,Mercado*Mercadolivre,"182,66"
2026-11-04,Shein *Loja Teste - Parcela 1/3,"72,73"
2026-11-02,Mercado*Lojadozeca - Parcela 4/4,"182,88"
2026-10-31,Pix no Crédito - MARIA SOUZA LIMA - 2/3,"241,37"
2026-10-31,Pix no Crédito - Maria Souza Lima - 3/3,"241,37"
2026-10-31,Boleto no Crédito - BANCO X SA - AUTO - 1/5,"319,37"
`
const CATS = ['Compras', 'Transporte', 'Assinaturas']
const tx = (description: string, person: string, category: string, amount = 10): Transaction => ({ id: Math.random().toString(), user_id: 'u', invoice_id: 'i', occurred_on: '2026-10-01', description, amount, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: { name: category } })
const load = async () => readBankFile(new File([CSV], 'Nubank_2026-12-07.csv', { type: 'text/csv' }), { people: [], categories: CATS, today: '2026-11-11' })

describe('CSV do Nubank no formato real', () => {
  it('lê valores com vírgula, milhar e crédito com espaço, e guarda os créditos', async () => {
    const bank = await load()
    expect(bank.rows).toHaveLength(9)
    expect(bank.rows.find((r) => r.description.startsWith('Shein'))).toMatchObject({ amount: 72.73, installmentNumber: 1, installmentCount: 3 })
    expect(bank.credits.map((c) => c.amount)).toEqual([9.94, 4182.94])
    expect(bank.periodHint).toBe('2026-12-01')
  })

  it('liga o IOF à compra internacional pelos 3,5% e a classifica junto', async () => {
    const bank = await load()
    const rows = classifyRows(bank.rows, { suggestions: new Map(), categories: CATS, defaultPerson: '' })
    const iof = rows.find((r) => r.description.startsWith('IOF'))!
    const buy = rows.find((r) => r.description.startsWith('Servico'))!
    expect(iof.iofOf).toBe(buy.id)
    expect(iof.qkey).toBe(buy.qkey)
  })

  it('dá nome e categoria para Pix e boleto no crédito, e acha Mercado Livre pelo vendedor', async () => {
    const bank = await load()
    const rows = classifyRows(bank.rows, { suggestions: new Map(), categories: CATS, defaultPerson: '' })
    const by = (text: string) => rows.find((r) => r.description.startsWith(text))!
    expect(by('Pix no Crédito')).toMatchObject({ category: 'Pix no crédito', categoryFrom: 'nova' })
    expect(by('Boleto no Crédito')).toMatchObject({ category: 'Boleto no crédito' })
    expect(rows.filter((r) => r.description.startsWith('Mercado Livre')).map((r) => r.category)).toEqual(['Compras', 'Compras'])
    expect(by('Shein').description).toBe('Shein - Parcela 1/3')
  })
})

describe('perguntas do robô', () => {
  it('agrupa compras parecidas e o mesmo destinatário de Pix', async () => {
    expect(questionKey('Mercado Livre - Parcela 2/3')).toBe(questionKey('Mercado Livre Fabionline'))
    expect(questionKey('Pix no Crédito - MARIA SOUZA LIMA - 2/3')).toBe(questionKey('Pix no Crédito - Maria Souza Lima - 3/3'))
    expect(questionKey('Pix no Crédito - Maria Souza Lima - 3/3')).not.toBe(questionKey('Pix no Crédito - Outro Nome - 3/3'))
  })

  it('pergunta uma vez por grupo e propõe quem já costuma ser, com o motivo', async () => {
    const bank = await load()
    const history = [tx('Mercado Livre', 'Ana', 'Compras'), tx('Mercado Livre - Parcela 2/3', 'Ana', 'Compras')]
    const rows = classifyRows(bank.rows, { suggestions: buildSuggestions(history), categories: CATS, defaultPerson: '' })
    const questions = buildQuestions(rows.map((r) => ({ ...r, iof: r.iofOf !== null })), history)
    const pix = questions.find((q) => q.label.startsWith('Pix no Crédito'))!
    expect(pix.rowIds).toHaveLength(2)
    expect(pix.total).toBe(482.74)
    expect(pix.suggestion).toBeNull()
    // "Mercado Livre" exato já tem dono no histórico; só o vendedor novo vira pergunta, e com palpite da Ana.
    const ml = questions.filter((q) => q.label.startsWith('Mercado Livre'))
    expect(ml).toHaveLength(1)
    expect(ml[0].rowIds).toHaveLength(1)
    expect(ml[0].suggestion).toMatchObject({ person: 'Ana' })
    expect(questions[0].suggestion).not.toBeNull()
    // O IOF responde junto com a compra internacional.
    expect(questions.find((q) => q.label.startsWith('Servico'))!.rowIds).toHaveLength(2)
  })

  it('sugere pelo padrão da categoria quando o histórico tem maioria clara', () => {
    const history = [tx('Posto A', 'Gus', 'Transporte'), tx('Posto B', 'Gus', 'Transporte'), tx('Posto C', 'Gus', 'Transporte'), tx('Taxi', 'Ana', 'Transporte')]
    const [question] = buildQuestions([{ id: 0, qkey: 'oficina nova', description: 'Oficina Nova', amount: 300, category: 'Transporte', person: '', personFrom: '' }], history)
    expect(question.suggestion).toMatchObject({ person: 'Gus' })
    expect(question.suggestion?.reason).toContain('3 de 4')
  })

  it('não inventa palpite com pouca base ou histórico dividido', () => {
    const split = [tx('Posto A', 'Gus', 'Transporte'), tx('Posto B', 'Ana', 'Transporte'), tx('Posto C', 'Gus', 'Transporte'), tx('Posto D', 'Ana', 'Transporte')]
    expect(buildQuestions([{ id: 0, qkey: 'x', description: 'X', amount: 5, category: 'Transporte', person: '', personFrom: '' }], split)[0].suggestion).toBeNull()
    expect(buildQuestions([{ id: 0, qkey: 'x', description: 'X', amount: 5, category: 'Transporte', person: '', personFrom: '' }], [tx('A', 'Gus', 'Transporte')])[0].suggestion).toBeNull()
  })

  it('sugere pelo valor repetido, como uma assinatura', () => {
    const history = [tx('Streaming X', 'Bia', 'Assinaturas', 39.9), tx('Streaming X', 'Bia', 'Assinaturas', 39.9)]
    const [question] = buildQuestions([{ id: 0, qkey: 'servico y', description: 'Servico Y', amount: 39.9, category: '', person: '', personFrom: '' }], history)
    expect(question.suggestion).toMatchObject({ person: 'Bia' })
  })

  it('quem já tem responsável pelo histórico não é perguntado', () => {
    expect(buildQuestions([{ id: 0, qkey: 'a', description: 'A', amount: 1, category: '', person: 'Ana', personFrom: 'histórico' }], [])).toHaveLength(0)
  })

  it('aponta o provável estorno: crédito de mesmo valor até 3 dias de diferença', async () => {
    const bank = await load()
    const found = findRefunds(bank.rows.map((r, id) => ({ id, date: r.date, amount: r.amount })), bank.credits)
    expect(found).toHaveLength(1)
    expect(bank.rows[found[0].rowId].description).toContain('Uber')
  })
})
