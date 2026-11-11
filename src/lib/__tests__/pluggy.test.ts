import { describe, expect, it } from 'vitest'
import { fetchBills, groupBills, parseItemIds, PluggyClient, sinceDate, validItemId, type Http, type HttpRequest, type PluggyTransaction } from '../pluggy'

const ITEM = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const tx = (over: Partial<PluggyTransaction>): PluggyTransaction => ({ id: Math.random().toString(36), date: '2026-11-05', description: 'Mercado Livre', amount: 89.9, type: 'DEBIT', currencyCode: 'BRL', amountInAccountCurrency: null, status: 'POSTED', merchant: '', installmentNumber: null, installmentCount: null, purchaseDate: null, billId: null, billMonth: null, ...over })

/** API falsa da Pluggy: guarda as chamadas e responde conforme o caminho. */
function fake(handlers: Record<string, (req: HttpRequest) => { status: number; data: unknown }>) {
  const calls: HttpRequest[] = []
  const http: Http = async (req) => {
    calls.push(req)
    const path = req.url.replace('https://api.pluggy.ai', '')
    const key = Object.keys(handlers).find((k) => path.startsWith(k))
    return key ? handlers[key](req) : { status: 404, data: null }
  }
  return { http, calls }
}

describe('Meu Pluggy: configuração', () => {
  it('lê vários Item IDs de qualquer jeito', () => {
    expect(parseItemIds(`${ITEM.toUpperCase()}, outro\n${ITEM}`)).toEqual([ITEM, 'outro'])
    expect(validItemId(ITEM)).toBe(true)
    expect(validItemId('abc')).toBe(false)
  })
})

describe('Meu Pluggy: cliente da API', () => {
  it('autentica uma vez e reaproveita a chave por quase 2 horas', async () => {
    let time = 0
    const { http, calls } = fake({ '/auth': () => ({ status: 200, data: { apiKey: 'K1' } }), '/accounts': () => ({ status: 200, data: { results: [] } }) })
    const client = new PluggyClient({ clientId: 'id', clientSecret: 'secret' }, http, () => time)
    await client.creditAccounts(ITEM); await client.creditAccounts(ITEM)
    expect(calls.filter((c) => c.url.endsWith('/auth'))).toHaveLength(1)
    expect(calls.find((c) => c.url.includes('/accounts'))!.headers['X-API-KEY']).toBe('K1')
    time = 101 * 60_000
    await client.creditAccounts(ITEM)
    expect(calls.filter((c) => c.url.endsWith('/auth'))).toHaveLength(2)
  })
  it('explica credencial recusada e conexão inexistente', async () => {
    const bad = new PluggyClient({ clientId: 'x', clientSecret: 'y' }, fake({ '/auth': () => ({ status: 401, data: null }) }).http)
    await expect(bad.apiKey()).rejects.toThrow(/Client ID ou o Client Secret/)
    const missing = new PluggyClient({ clientId: 'x', clientSecret: 'y' }, fake({ '/auth': () => ({ status: 200, data: { apiKey: 'K' } }), '/accounts': () => ({ status: 404, data: null }) }).http)
    await expect(missing.creditAccounts(ITEM)).rejects.toThrow(/Item ID/)
  })
  it('renova a chave se a Pluggy responder 401 no meio', async () => {
    let first = true
    const { http, calls } = fake({ '/auth': () => ({ status: 200, data: { apiKey: first ? 'velha' : 'nova' } }), '/accounts': () => { if (first) { first = false; return { status: 401, data: null } } return { status: 200, data: { results: [{ id: 'a1', name: 'Nu', number: 'xxxx1' }] } } } })
    const accounts = await new PluggyClient({ clientId: 'x', clientSecret: 'y' }, http).creditAccounts(ITEM)
    expect(accounts).toHaveLength(1)
    expect(calls.filter((c) => c.url.endsWith('/auth'))).toHaveLength(2)
  })
  it('pagina pelo cursor da v2', async () => {
    const { http, calls } = fake({
      '/auth': () => ({ status: 200, data: { apiKey: 'K' } }),
      '/v2/transactions': (req) => req.url.includes('after=P2') ? { status: 200, data: { results: [{ id: 't2', date: '2026-11-06', description: 'B', amount: 2, type: 'DEBIT' }], next: null } } : { status: 200, data: { results: [{ id: 't1', date: '2026-11-05', description: 'A', amount: 1, type: 'DEBIT' }], next: '?accountId=a1&after=P2' } },
    })
    const list = await new PluggyClient({ clientId: 'x', clientSecret: 'y' }, http).transactions('a1', '2026-09-01')
    expect(list.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(calls.filter((c) => c.url.includes('/v2/transactions'))).toHaveLength(2)
  })
  it('cai para a paginação antiga se a v2 não existir', async () => {
    const { http } = fake({
      '/auth': () => ({ status: 200, data: { apiKey: 'K' } }),
      '/v2/transactions': () => ({ status: 404, data: null }),
      '/transactions': (req) => ({ status: 200, data: { results: [{ id: req.url.includes('page=1') ? 't1' : 't2', date: '2026-11-05', description: 'A', amount: 1, type: 'DEBIT' }], totalPages: 2 } }),
    })
    const list = await new PluggyClient({ clientId: 'x', clientSecret: 'y' }, http).transactions('a1', '2026-09-01')
    expect(list.map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

describe('Meu Pluggy: faturas para o robô', () => {
  const card = { dueDay: 7, closingDaysBefore: 7 }
  it('agrupa por fatura, ignora pagamentos e separa créditos', () => {
    const bills = groupBills([
      tx({ id: '1', date: '2026-11-02', description: 'Mercado Livre', amount: 89.9, billMonth: '2026-12-01' }),
      tx({ id: '2', date: '2026-11-03', description: 'Netflix', amount: 39.9, billMonth: '2026-12-01' }),
      tx({ id: '3', date: '2026-11-04', description: 'Pagamento recebido', amount: -500, type: 'CREDIT', billMonth: '2026-12-01' }),
      tx({ id: '4', date: '2026-11-05', description: 'Estorno Zara', amount: -120, type: 'CREDIT', billMonth: '2026-12-01' }),
      tx({ id: '5', date: '2026-10-20', description: 'Padaria', amount: 12, billMonth: '2026-11-01' }),
    ], card)
    expect(bills.map((b) => b.period)).toEqual(['2026-12-01', '2026-11-01'])
    const dec = bills[0]
    expect(dec.rows.map((r) => r.description)).toEqual(['Mercado Livre', 'Netflix'])
    expect(dec.credits).toEqual([{ date: '2026-11-05', description: 'Estorno Zara', amount: 120 }])
    expect(dec.ignored[0]).toContain('pagamento da fatura')
  })
  it('lê parcelas, valor negativo de compra e dia da compra', () => {
    const [bill] = groupBills([tx({ id: '1', description: 'Magazine Luiza', amount: -100, installmentNumber: 2, installmentCount: 3, purchaseDate: '2026-09-10', billMonth: '2026-11-01' })], card)
    expect(bill.rows[0]).toMatchObject({ date: '2026-09-10', amount: 100, installmentNumber: 2, installmentCount: 3 })
  })
  it('usa o valor em reais nas compras internacionais, pula pendentes e duplicadas', () => {
    const bills = groupBills([
      tx({ id: 'x', description: 'Amazon US', amount: 20, currencyCode: 'USD', amountInAccountCurrency: 105.5, billMonth: '2026-12-01' }),
      tx({ id: 'x', description: 'Amazon US', amount: 20, currencyCode: 'USD', amountInAccountCurrency: 105.5, billMonth: '2026-12-01' }),
      tx({ id: 'p', description: 'Pendente', amount: 5, status: 'PENDING', billMonth: '2026-12-01' }),
    ], card)
    expect(bills[0].rows).toHaveLength(1)
    expect(bills[0].rows[0].amount).toBe(105.5)
  })
  it('sem o mês da fatura, usa o fechamento do cartão', () => {
    const [bill] = groupBills([tx({ id: '1', date: '2026-11-20', description: 'Loja' })], card)
    expect(bill.period).toBe('2026-12-01')
  })
  it('a busca completa junta cartões e faturas e valida o Item ID', async () => {
    const { http } = fake({
      '/auth': () => ({ status: 200, data: { apiKey: 'K' } }),
      '/accounts': () => ({ status: 200, data: { results: [{ id: 'a1', name: 'Nubank', number: 'xxxx1' }] } }),
      '/v2/transactions': () => ({ status: 200, data: { results: [{ id: 't1', date: '2026-11-05', description: 'Mercado', amount: 10, type: 'DEBIT' }], next: null } }),
    })
    const config = { clientId: 'x', clientSecret: 'y', itemIds: [ITEM] }
    const result = await fetchBills(config, card, new Date(2026, 10, 11), new PluggyClient(config, http))
    expect(result.cards).toHaveLength(1)
    expect(result.bills[0].rows).toHaveLength(1)
    await expect(fetchBills({ ...config, itemIds: [] }, card)).rejects.toThrow(/Item ID/)
  })
  it('calcula o começo da janela de busca', () => {
    expect(sinceDate(new Date(2026, 10, 11), 75)).toBe('2026-08-28')
  })
})
