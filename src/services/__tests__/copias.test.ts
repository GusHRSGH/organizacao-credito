import { describe, expect, it } from 'vitest'
import { LocalSource } from '../localSource'
import { MemoryPersistence } from '../persistence'
import { parseSheet } from '../importXlsx'

const newSource = () => new LocalSource(new MemoryPersistence())
const row = (description: string) => ({ date: '2026-10-05', description, amount: 10, person: 'Ana', category: 'Compras', status: 'pending' as const, installmentNumber: null, installmentCount: null })

describe('cópias automáticas', () => {
  it('guarda uma cópia por dia, com o estado de antes da alteração', async () => {
    const source = newSource()
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Mercado')] }])
    expect(await source.listSnapshots()).toHaveLength(0) // banco vazio não gera cópia
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Padaria')] }])
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Farmácia')] }])
    const list = await source.listSnapshots()
    expect(list).toHaveLength(1)
    expect(list[0].transactions).toBe(1)
  })

  it('restaura uma cópia e guarda o estado anterior para desfazer', async () => {
    const source = newSource()
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Mercado')] }])
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Padaria')] }])
    const [daily] = await source.listSnapshots()
    await source.clearAll()
    expect((await source.exportBackup()).data.transactions).toHaveLength(0)
    const antes = (await source.listSnapshots()).find((item) => item.reason === 'antes')
    expect(antes?.transactions).toBe(2)
    await source.restoreSnapshot(daily.id)
    expect((await source.exportBackup()).data.transactions).toHaveLength(1)
  })

  it('mantém no máximo 5 cópias de "antes"', async () => {
    const source = newSource()
    await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row('Mercado')] }])
    for (let i = 0; i < 8; i += 1) {
      await source.importInvoices([{ period: '2026-11-01', label: 'Novembro 2026', rows: [row(`Item ${i}`)] }])
      await source.restoreBackup(await source.exportBackup())
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    expect((await source.listSnapshots()).filter((item) => item.reason === 'antes').length).toBeLessThanOrEqual(5)
  })
})

describe('layout da planilha "Fatura <mês>" (nomes fictícios)', () => {
  const sheet = [
    ['Fatura Novembro'], ['Cartão de crédito compartilhado · dicas'], [],
    ['TOTAL DA FATURA', '', 'PAGO', '', 'PENDENTE', '', '% PAGO'], ['R$ 400,00', '', 'R$ 100,00', '', 'R$ 300,00', '', '25%'], [],
    ['Data', 'Titulo', 'Valor', 'Responsável', 'Status', 'Categoria', 'Parcela'],
    ['30/09/2026', 'Loja X - Parcela 2/2', 'R$ 125,00', 'Ana', 'Pago', 'Compras', '2/2'],
    ['09/10/2026', 'Pix no Crédito - Fulano - 1/2', 'R$ 139,88', 'Ana', 'Não pago', 'Pix/Boleto no crédito', '1/2'],
    ['27/10/2026', 'Dl*Uberrides', 'R$ 1.037,95', 'Bia', 'Não pago', 'Transporte', 'À vista'],
  ]
  it('lê cabeçalho na linha 7, valores em R$, status e parcelas', () => {
    const parsed = parseSheet('Fatura Novembro', sheet)!
    expect(parsed.period).toBe('2026-11-01')
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0]).toMatchObject({ date: '2026-09-30', amount: 125, status: 'paid', installmentNumber: 2, installmentCount: 2 })
    expect(parsed.rows[1]).toMatchObject({ status: 'pending', installmentNumber: 1, installmentCount: 2 })
    expect(parsed.rows[2]).toMatchObject({ amount: 1037.95, installmentNumber: null })
    expect(parsed.issues).toHaveLength(0)
  })
  it('ignora a aba Resumo/Modelo vazia', () => {
    expect(parseSheet('Resumo', [['Resumo'], ['Mês', 'Total']])).toBeNull()
  })
})
