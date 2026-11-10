import { describe, expect, it } from 'vitest'
import { classifyRows, guessPeriod, periodFromFileName, readBankFile, summarizeIncoming, toImportRows } from '../bankImport'
import { matchCategoryName } from '../keywords'
import { buildSuggestions } from '../suggest'
import type { Transaction } from '../../types'

const NUBANK = `date,category,title,amount
2026-11-02,restaurante,Padaria Central,23.90
2026-11-03,transporte,Uber *Trip 8842,31.40
2026-11-05,serviços,Netflix.Com,55.90
2026-11-06,casa,Loja Casa Bela - Parcela 2/6,150.00
2026-11-08,pagamento,Pagamento recebido,-1200.00
2026-11-09,outros,Estorno de compra,-20.00
2026-11-10,saúde,Farmácia Pague Menos,48.30
`
const hist = (description: string, category: string, person: string): Transaction => ({ id: description, user_id: 'u', invoice_id: 'i', occurred_on: '2026-10-01', description, amount: 1, person_id: null, category_id: null, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: '', person: { name: person }, category: { name: category } })

describe('importar fatura do banco', () => {
  it('lê o CSV do Nubank, ignora pagamento e estorno e acha parcela', async () => {
    const file = new File([NUBANK], 'Nubank_2026-12-07.csv', { type: 'text/csv' })
    const bank = await readBankFile(file, { people: [], categories: [], today: '2026-11-11' })
    expect(bank.kind).toBe('planilha')
    expect(bank.rows).toHaveLength(5)
    expect(bank.rows.map((r) => r.amount)).toEqual([23.9, 31.4, 55.9, 150, 48.3])
    expect(bank.rows[0].bankCategory).toBe('restaurante')
    expect(bank.rows[3]).toMatchObject({ installmentNumber: 2, installmentCount: 6 })
    expect(bank.ignored.join(' ')).toContain('estorno ou pagamento')
    expect(bank.periodHint).toBe('2026-12-01')
  })
  it('acha a fatura pelo nome do arquivo ou pelo fechamento', () => {
    expect(periodFromFileName('Nubank_2026-12-07.csv')).toBe('2026-12-01')
    expect(periodFromFileName('fatura.csv')).toBeNull()
    const rows = [{ date: '2026-11-09' }, { date: '2026-11-20' }, { date: '2026-11-25' }]
    expect(guessPeriod(null, rows, { dueDay: 7, closingDaysBefore: 7 })).toBe('2026-12-01')
    expect(guessPeriod(null, rows, null)).toBe('2026-11-01')
    expect(guessPeriod('2027-01-01', rows, null)).toBe('2027-01-01')
  })
  it('classifica pelo histórico, depois pela categoria do banco, depois por palavras', async () => {
    const bank = await readBankFile(new File([NUBANK], 'x.csv'), { people: [], categories: [], today: '2026-11-11' })
    const suggestions = buildSuggestions([hist('Padaria Central', 'Lanches', 'Ana')])
    const rows = classifyRows(bank.rows, { suggestions, categories: ['Lanches', 'Transporte', 'Casa', 'Saúde', 'Assinaturas'], defaultPerson: 'Gus' })
    const by = (text: string) => rows.find((r) => r.description.startsWith(text))!
    expect(by('Padaria')).toMatchObject({ category: 'Lanches', categoryFrom: 'histórico', person: 'Ana', personFrom: 'histórico' })
    expect(by('Uber')).toMatchObject({ description: 'Uber', category: 'Transporte', categoryFrom: 'banco', person: 'Gus', personFrom: 'padrão', renamed: true })
    expect(by('Netflix')).toMatchObject({ category: 'Assinaturas', categoryFrom: 'banco' })
    expect(by('Farmácia')).toMatchObject({ category: 'Saúde' })
  })
  it('cria categoria nova com o nome do banco quando não tem equivalente', async () => {
    const bank = await readBankFile(new File([NUBANK], 'x.csv'), { people: [], categories: [], today: '2026-11-11' })
    const rows = classifyRows(bank.rows, { suggestions: new Map(), categories: [], defaultPerson: '' })
    expect(rows[0]).toMatchObject({ category: 'Restaurante', categoryFrom: 'nova', person: '', personFrom: '' })
  })
  it('resume o que vai entrar e monta as linhas de importação', async () => {
    const bank = await readBankFile(new File([NUBANK], 'x.csv'), { people: [], categories: [], today: '2026-11-11' })
    const rows = classifyRows(bank.rows, { suggestions: new Map(), categories: ['Transporte'], defaultPerson: 'Gus' })
    const sum = summarizeIncoming(rows)
    expect(sum).toMatchObject({ count: 5, total: 309.5, installments: 1 })
    expect(sum.byCategory[0].name).toBe('Casa')
    expect(toImportRows(rows, true)[0]).toMatchObject({ status: 'paid', person: 'Gus' })
  })
  it('liga categorias do banco às suas', () => {
    expect(matchCategoryName('supermercado', ['Mercado', 'Casa'])).toBe('Mercado')
    expect(matchCategoryName('Transportes', ['Transporte'])).toBe('Transporte')
    expect(matchCategoryName('lazer', ['Casa'])).toBeNull()
  })
})
