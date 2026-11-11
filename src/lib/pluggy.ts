// Modo pessoal do Open Finance via Meu Pluggy (https://www.pluggy.ai/meu-pluggy).
// Só para as SUAS contas: o Client ID e o Client Secret ficam apenas neste aparelho e as chamadas vão direto do aparelho para a Pluggy.

import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { invoicePeriodFor, type Card } from './card'
import type { BankCredit, BankFile, BankRow } from './bankImport'

export interface PluggyConfig { clientId: string; clientSecret: string; itemIds: string[] }

const KEY = 'oc:pluggy'
const BASE = 'https://api.pluggy.ai'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readPluggy(): PluggyConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PluggyConfig> | null
    if (!raw || typeof raw.clientId !== 'string' || typeof raw.clientSecret !== 'string' || !raw.clientId || !raw.clientSecret) return null
    return { clientId: raw.clientId, clientSecret: raw.clientSecret, itemIds: Array.isArray(raw.itemIds) ? raw.itemIds.filter((id): id is string => typeof id === 'string') : [] }
  } catch { return null }
}
export function writePluggy(config: PluggyConfig | null) {
  try { if (config) localStorage.setItem(KEY, JSON.stringify(config)); else localStorage.removeItem(KEY) } catch { /* vale até recarregar */ }
}

/** Aceita vários IDs separados por vírgula, espaço ou linha. */
export const parseItemIds = (text: string) => [...new Set(text.split(/[\s,;]+/).map((id) => id.trim().toLowerCase()).filter(Boolean))]
export const validItemId = (id: string) => UUID.test(id)

export interface HttpRequest { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: unknown }
export interface HttpResponse { status: number; data: unknown }
export type Http = (request: HttpRequest) => Promise<HttpResponse>

/** No celular usa o cliente HTTP nativo (sem bloqueio de CORS); no navegador, fetch. */
export const defaultHttp: Http = async (request) => {
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({ url: request.url, method: request.method, headers: request.headers, data: request.body })
      return { status: response.status, data: response.data }
    }
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body === undefined ? undefined : JSON.stringify(request.body) })
    let data: unknown = null
    try { data = await response.json() } catch { /* corpo vazio */ }
    return { status: response.status, data }
  } catch {
    throw new Error('Não consegui falar com a Pluggy. Confira a internet. No navegador e no Windows, a Pluggy pode bloquear o acesso direto; use o app do celular.')
  }
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})
const list = (value: unknown): Array<Record<string, unknown>> => (Array.isArray(value) ? value.map(obj) : [])
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => { const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isFinite(n) ? n : null }

export interface PluggyAccount { id: string; name: string; number: string; itemId: string }
export interface PluggyTransaction {
  id: string; date: string; description: string; amount: number; type: 'DEBIT' | 'CREDIT'; currencyCode: string; amountInAccountCurrency: number | null
  status: string; merchant: string; installmentNumber: number | null; installmentCount: number | null; purchaseDate: string | null; billId: string | null; billMonth: string | null
}

export class PluggyClient {
  private key: { value: string; until: number } | null = null
  constructor(private config: Pick<PluggyConfig, 'clientId' | 'clientSecret'>, private http: Http = defaultHttp, private now: () => number = Date.now) {}

  private async request(method: 'GET' | 'POST', path: string, body?: unknown, retry = true): Promise<HttpResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (path !== '/auth') headers['X-API-KEY'] = await this.apiKey()
    const response = await this.http({ method, url: `${BASE}${path}`, headers, body })
    if (response.status === 401 && path !== '/auth' && retry) { this.key = null; return this.request(method, path, body, false) }
    return response
  }

  /** A chave vale 2 horas; reaproveito por 100 minutos para não estourar o limite do /auth. */
  async apiKey(): Promise<string> {
    if (this.key && this.key.until > this.now()) return this.key.value
    const response = await this.http({ method: 'POST', url: `${BASE}/auth`, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: { clientId: this.config.clientId.trim(), clientSecret: this.config.clientSecret.trim() } })
    if (response.status === 401 || response.status === 403 || response.status === 400) throw new Error('A Pluggy recusou o Client ID ou o Client Secret. Copie de novo, em dashboard.pluggy.ai, na aba Aplicação.')
    if (response.status === 429) throw new Error('A Pluggy pediu para esperar um pouco. Tente de novo em alguns minutos.')
    const apiKey = str(obj(response.data).apiKey)
    if (response.status >= 300 || !apiKey) throw new Error(`A Pluggy não respondeu como esperado (código ${response.status}). Tente de novo mais tarde.`)
    this.key = { value: apiKey, until: this.now() + 100 * 60_000 }
    return apiKey
  }

  /** Cartões de crédito de uma conexão (item). */
  async creditAccounts(itemId: string): Promise<PluggyAccount[]> {
    const response = await this.request('GET', `/accounts?itemId=${encodeURIComponent(itemId)}&type=CREDIT`)
    if (response.status === 404) throw new Error(`Não achei a conexão ${itemId.slice(0, 8)}… na sua aplicação. Confira o Item ID.`)
    if (response.status >= 300) throw new Error(`A Pluggy recusou a consulta dos cartões (código ${response.status}).`)
    return list(obj(response.data).results).map((account) => ({ id: str(account.id), name: str(account.marketingName) || str(account.name) || 'Cartão', number: str(account.number), itemId })).filter((account) => account.id)
  }

  /** Compras do cartão desde `from` (AAAA-MM-DD). Usa a paginação nova (v2) e cai para a antiga se o endpoint novo não existir. */
  async transactions(accountId: string, from: string): Promise<PluggyTransaction[]> {
    const out: PluggyTransaction[] = []
    let next = `?accountId=${encodeURIComponent(accountId)}&dateFrom=${from}`
    for (let page = 0; page < 40 && next; page += 1) {
      const response = await this.request('GET', `/v2/transactions${next}`)
      if (response.status === 404 || response.status === 410) return page === 0 ? this.transactionsV1(accountId, from) : out
      if (response.status >= 300) throw new Error(`A Pluggy recusou a consulta das compras (código ${response.status}).`)
      const body = obj(response.data)
      out.push(...list(body.results).map(toTransaction))
      const cursor = str(body.next)
      next = cursor ? (cursor.startsWith('?') ? cursor : `?accountId=${encodeURIComponent(accountId)}&after=${encodeURIComponent(cursor)}`) : ''
    }
    return out
  }

  private async transactionsV1(accountId: string, from: string): Promise<PluggyTransaction[]> {
    const out: PluggyTransaction[] = []
    for (let page = 1; page <= 40; page += 1) {
      const response = await this.request('GET', `/transactions?accountId=${encodeURIComponent(accountId)}&from=${from}&pageSize=500&page=${page}`)
      if (response.status >= 300) throw new Error(`A Pluggy recusou a consulta das compras (código ${response.status}).`)
      const body = obj(response.data)
      out.push(...list(body.results).map(toTransaction))
      if (page >= (num(body.totalPages) ?? 1)) break
    }
    return out
  }
}

function toTransaction(raw: Record<string, unknown>): PluggyTransaction {
  const meta = obj(raw.creditCardMetadata)
  const merchant = obj(raw.merchant)
  const billId = str(meta.billId)
  const forecast = str(meta.billForecastDate)
  return {
    id: str(raw.id), date: str(raw.date).slice(0, 10), description: str(raw.description) || str(raw.descriptionRaw), amount: num(raw.amount) ?? 0,
    type: str(raw.type).toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT', currencyCode: str(raw.currencyCode) || 'BRL', amountInAccountCurrency: num(raw.amountInAccountCurrency),
    status: str(raw.status), merchant: str(merchant.name) || str(merchant.businessName),
    installmentNumber: num(meta.installmentNumber), installmentCount: num(meta.totalInstallments), purchaseDate: str(meta.purchaseDate).slice(0, 10) || null,
    billId: billId || null, billMonth: /^\d{4}-\d{2}/.test(forecast) ? `${forecast.slice(0, 7)}-01` : null,
  }
}

const PAYMENT = /pagamento|pgto|payment|fatura (?:anterior|paga)|saldo (?:anterior|restante)/i

/** Fatura (AAAA-MM-01) a que a compra pertence: a que o banco informou, senão a que o fechamento do cartão indica, senão o mês da compra. */
export function billOf(tx: PluggyTransaction, card: Card | null): string {
  if (tx.billMonth) return tx.billMonth
  const date = tx.purchaseDate ?? tx.date
  return card ? invoicePeriodFor(date, card) : `${date.slice(0, 7)}-01`
}

export interface PluggyBill { period: string; rows: BankRow[]; credits: BankCredit[]; ignored: string[] }

/** Agrupa as compras por fatura e converte para as linhas que o robô de importação já entende. */
export function groupBills(transactions: PluggyTransaction[], card: Card | null): PluggyBill[] {
  const bills = new Map<string, PluggyBill>()
  const seen = new Set<string>()
  for (const tx of transactions) {
    if (tx.id && seen.has(tx.id)) continue
    seen.add(tx.id)
    if (tx.status === 'PENDING') continue
    const period = billOf(tx, card)
    const bill = bills.get(period) ?? { period, rows: [], credits: [], ignored: [] }
    bills.set(period, bill)
    const date = tx.purchaseDate ?? tx.date
    const description = (tx.description || tx.merchant).trim()
    const foreign = tx.currencyCode !== 'BRL' && tx.amountInAccountCurrency !== null
    const value = Math.abs(foreign ? tx.amountInAccountCurrency ?? 0 : tx.amount)
    if (!date || !description || !(value > 0)) { bill.ignored.push(`${description || 'Sem descrição'} (sem data ou valor)`); continue }
    if (tx.type === 'CREDIT') {
      if (PAYMENT.test(description)) bill.ignored.push(`${description} (pagamento da fatura)`)
      else bill.credits.push({ date, description, amount: value })
      continue
    }
    const count = tx.installmentCount && tx.installmentCount > 1 ? tx.installmentCount : null
    bill.rows.push({ date, description, amount: Math.round(value * 100) / 100, bankCategory: '', installmentNumber: count ? tx.installmentNumber ?? null : null, installmentCount: count })
  }
  return [...bills.values()].filter((bill) => bill.rows.length).sort((a, b) => b.period.localeCompare(a.period))
}

export const toBankFile = (bill: PluggyBill): BankFile => ({ rows: bill.rows, ignored: bill.ignored, credits: bill.credits, periodHint: bill.period, kind: 'open-finance' })

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const sinceDate = (now: Date, days = 75) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))

export interface PluggyFetch { cards: PluggyAccount[]; bills: PluggyBill[] }

/** Busca, em todas as conexões e cartões, as compras dos últimos dias já separadas por fatura. */
export async function fetchBills(config: PluggyConfig, card: Card | null, now = new Date(), client: PluggyClient = new PluggyClient(config)): Promise<PluggyFetch> {
  if (!config.itemIds.length) throw new Error('Informe pelo menos um Item ID da sua conexão do Meu Pluggy.')
  const cards: PluggyAccount[] = []
  for (const itemId of config.itemIds) cards.push(...(await client.creditAccounts(itemId)))
  if (!cards.length) throw new Error('Não achei nenhum cartão de crédito nessas conexões. No Meu Pluggy, confira se o banco foi conectado e vinculado à sua aplicação.')
  const all: PluggyTransaction[] = []
  for (const account of cards) all.push(...(await client.transactions(account.id, sinceDate(now))))
  return { cards, bills: groupBills(all, card) }
}
