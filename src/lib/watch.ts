import { cleanDescription } from './cleanup'
import { money, pct } from './format'
import { plain } from './quickEntry'
import type { Invoice, Transaction } from '../types'

const cents = (value: number) => Math.round(Number(value) * 100)
const median = (list: number[]) => { const s = [...list].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Chave da "mesma coisa": descrição limpa, sem parcela e sem acento. */
export const keyOf = (description: string) => plain(cleanDescription(description)).replace(/\s*\(?\b\d{1,2}\/\d{1,2}\b\)?\s*$/, '').trim()

export interface Subscription {
  key: string
  name: string
  /** Valor típico por mês (mediana). */
  monthly: number
  months: number
  lastPeriod: string
  lastAmount: number
  previousAmount: number | null
  /** Aparece na fatura mais recente: ainda está sendo cobrada. */
  active: boolean
  certain: boolean
  priceUp: boolean
  /** Nunca mais apareceu depois de algum tempo: pode ter sido cancelada. */
  stopped: boolean
  ids: string[]
}

/** Cobranças que se repetem todo mês com valor parecido (ignora compras parceladas). */
export function detectSubscriptions(transactions: Transaction[], invoices: Invoice[]): Subscription[] {
  const period = new Map(invoices.map((invoice) => [invoice.id, invoice.period]))
  const periods = [...new Set(invoices.map((invoice) => invoice.period))].sort()
  const latest = periods[periods.length - 1]
  const byKey = new Map<string, Transaction[]>()
  for (const row of transactions) {
    if (row.installment_group || !period.has(row.invoice_id)) continue
    const key = keyOf(row.description)
    if (key.length < 2) continue
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  const found: Subscription[] = []
  for (const [key, rows] of byKey) {
    const perMonth = new Map<string, Transaction>()
    for (const row of rows) { const p = period.get(row.invoice_id)!; const old = perMonth.get(p); if (!old || row.occurred_on > old.occurred_on) perMonth.set(p, row) }
    // um mês com vários lançamentos iguais não é assinatura (é compra frequente)
    const multiples = rows.length > perMonth.size * 1.5
    if (multiples) continue
    const months = [...perMonth.keys()].sort()
    const values = months.map((p) => cents(perMonth.get(p)!.amount) / 100)
    const mid = median(values)
    const steady = values.filter((v) => Math.abs(v - mid) <= mid * 0.15).length
    const consecutive = months.length >= 2 && months.slice(1).every((p, i) => periods.indexOf(p) - periods.indexOf(months[i]) === 1)
    const identical = values.length >= 2 && values.every((v) => v === values[0])
    const certain = months.length >= 3 && steady >= Math.ceil(months.length * 0.7)
    const likely = !certain && consecutive && months.length === 2 && identical
    if (!certain && !likely) continue
    const lastPeriod = months[months.length - 1]
    const last = perMonth.get(lastPeriod)!
    const prev = months.length > 1 ? perMonth.get(months[months.length - 2])! : null
    const lastAmount = cents(last.amount) / 100
    const previousAmount = prev ? cents(prev.amount) / 100 : null
    const gap = periods.indexOf(latest) - periods.indexOf(lastPeriod)
    found.push({
      key, name: cleanDescription(last.description).replace(/\s*\(?\b\d{1,2}\/\d{1,2}\b\)?\s*$/, ''), monthly: mid, months: months.length, lastPeriod, lastAmount, previousAmount,
      active: gap === 0, certain, priceUp: previousAmount !== null && lastAmount > previousAmount * 1.03 && lastAmount - previousAmount >= 1, stopped: gap >= 2 && certain,
      ids: months.map((p) => perMonth.get(p)!.id),
    })
  }
  return found.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly)
}

export type RadarKind = 'duplicada' | 'acima' | 'nova-alta' | 'categoria'
export interface RadarItem {
  id: string
  kind: RadarKind
  title: string
  detail: string
  invoiceId: string
  /** Texto para abrir a fatura já filtrada. */
  query?: string
  category?: string
  ids: string[]
}

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000

/** O que merece um olhar na fatura escolhida: repetidas, acima do seu normal, novas e caras, categoria disparada. */
export function detectRadar(transactions: Transaction[], invoices: Invoice[], invoiceId: string): RadarItem[] {
  const current = transactions.filter((row) => row.invoice_id === invoiceId)
  if (!current.length) return []
  const items: RadarItem[] = []
  const periodOf = new Map(invoices.map((invoice) => [invoice.id, invoice.period]))
  const thisPeriod = periodOf.get(invoiceId) ?? ''
  const earlier = transactions.filter((row) => row.invoice_id !== invoiceId && (periodOf.get(row.invoice_id) ?? '') < thisPeriod)

  // 1) possível cobrança duplicada
  const seen = new Map<string, Transaction>()
  const flagged = new Set<string>()
  for (const row of [...current].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
    if (row.installment_group) continue
    const key = `${keyOf(row.description)}|${cents(row.amount)}|${row.person?.name ?? ''}`
    const before = seen.get(key)
    if (before && daysBetween(before.occurred_on, row.occurred_on) <= 3 && !flagged.has(before.id)) {
      flagged.add(before.id); flagged.add(row.id)
      items.push({ id: `dup:${before.id}:${row.id}`, kind: 'duplicada', title: `Possível cobrança duplicada: ${row.description}`, detail: `Duas cobranças de ${money(Number(row.amount))} em ${before.occurred_on.slice(8)}/${before.occurred_on.slice(5, 7)} e ${row.occurred_on.slice(8)}/${row.occurred_on.slice(5, 7)}. Se foi engano, vale contestar no banco.`, invoiceId, query: row.description, ids: [before.id, row.id] })
    }
    seen.set(key, row)
  }

  // 2) bem acima do seu normal para aquela mesma coisa
  const history = new Map<string, number[]>()
  for (const row of earlier) { if (row.installment_group) continue; const key = keyOf(row.description); history.set(key, [...(history.get(key) ?? []), Number(row.amount)]) }
  for (const row of current) {
    if (row.installment_group || flagged.has(row.id)) continue
    const past = history.get(keyOf(row.description))
    const amount = Number(row.amount)
    if (past && past.length >= 3) {
      const usual = median(past)
      if (amount > usual * 1.8 && amount - usual >= 30) { flagged.add(row.id); items.push({ id: `high:${row.id}`, kind: 'acima', title: `${row.description} veio bem acima do normal`, detail: `${money(amount)} desta vez, normalmente cerca de ${money(usual)} (${pct(amount / usual - 1, 0)} a mais).`, invoiceId, query: row.description, ids: [row.id] }) }
    }
  }

  // 3) gasto novo e alto: nunca visto antes e bem maior que o gasto típico
  const all = earlier.map((row) => Number(row.amount))
  if (all.length >= 15) {
    const typical = median(all)
    const limit = Math.max(typical * 6, 300)
    for (const row of current) {
      if (row.installment_group || flagged.has(row.id) || history.has(keyOf(row.description))) continue
      if (Number(row.amount) >= limit) { flagged.add(row.id); items.push({ id: `new:${row.id}`, kind: 'nova-alta', title: `Gasto novo e alto: ${row.description}`, detail: `${money(Number(row.amount))}, e você nunca teve um lançamento assim. Seu gasto típico é ${money(typical)}.`, invoiceId, query: row.description, ids: [row.id] }) }
    }
  }

  // 4) categoria disparada contra a média dos meses anteriores
  const catTotals = (rows: Transaction[]) => { const m = new Map<string, number>(); for (const r of rows) { const n = r.category?.name; if (n) m.set(n, (m.get(n) ?? 0) + cents(r.amount) / 100) } return m }
  const prevPeriods = [...new Set(earlier.map((row) => periodOf.get(row.invoice_id)!))].sort().slice(-3)
  if (prevPeriods.length >= 2) {
    const now = catTotals(current)
    const per = prevPeriods.map((p) => catTotals(earlier.filter((row) => periodOf.get(row.invoice_id) === p)))
    for (const [name, total] of now) {
      const avg = per.reduce((sum, m) => sum + (m.get(name) ?? 0), 0) / per.length
      if (avg > 0 && total > avg * 1.5 && total - avg >= 100) items.push({ id: `cat:${invoiceId}:${name}`, kind: 'categoria', title: `${name} disparou neste mês`, detail: `${money(total)} contra uma média de ${money(avg)} nos ${per.length} meses anteriores (${pct(total / avg - 1, 0)} a mais).`, invoiceId, category: name, ids: [] })
    }
  }
  return items
}
