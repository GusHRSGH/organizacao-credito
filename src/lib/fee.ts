import type { FeeDisplay, CardFee, Invoice, Transaction } from '../types'

export const DEFAULT_FEE_NAME = 'Taxa de evolução de crédito'

export interface FeeShare {
  name: string
  spend: number
  /** Total que a pessoa paga de taxa: a parte normal mais o extra por passar do limite. */
  share: number
  /** Parte normal (proporcional, porcentagem ou ajustada na mão). */
  base: number
  /** Extra por passar do limite (0 se não passou ou não tem limite). */
  extra: number
  limit: number | null
  manual: boolean
  paid: boolean
}

export type LimitLevel = 'ok' | 'near' | 'over'
/** Situação do gasto em relação ao limite: perto a partir de 80%, passou acima do limite. */
export function limitLevel(spend: number, limit: number | null | undefined): LimitLevel {
  if (!limit || limit <= 0) return 'ok'
  if (spend > limit + 0.004) return 'over'
  return spend >= limit * 0.8 ? 'near' : 'ok'
}

/** Extra de quem passou do limite: a % extra sobre todo o gasto, arredondado para cima no centavo. */
export function extraFor(fee: CardFee, name: string, spend: number): number {
  const limit = fee.limits?.[name]
  if (!fee.extraPct || fee.extraPct <= 0 || limitLevel(spend, limit) !== 'over') return 0
  return Math.ceil(cents(spend) * fee.extraPct / 100) / 100
}
export interface FeeSplit { fee: CardFee; shares: FeeShare[]; total: number; inherited: boolean }

const cents = (value: number) => Math.round(Number(value) * 100)

/** Gasto total (pago e pendente) de cada pessoa na fatura, em reais. */
export function spendByPerson(rows: Transaction[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const name = row.person?.name || 'Sem responsável'
    map.set(name, (map.get(name) ?? 0) + cents(row.amount))
  }
  return new Map([...map].map(([name, value]) => [name, value / 100]))
}

/** Distribui `target` centavos proporcionalmente aos pesos, arredondando cada parte para cima. */
function spread(target: number, weights: number[]): number[] {
  if (target <= 0 || !weights.length) return weights.map(() => 0)
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => Math.ceil(target / weights.length))
  return weights.map((w) => Math.ceil((target * w) / sum))
}

/**
 * Divide a taxa entre os participantes, proporcional ao gasto de cada um.
 * Valor fixo: o total é o valor da taxa. Porcentagem: o total é a soma da porcentagem sobre o gasto de cada um.
 * Partes ajustadas na mão ficam como estão; a diferença vai para os outros, sempre proporcional ao gasto.
 * Cada parte arredonda para cima no centavo, então a soma pode passar uns centavos do total.
 */
export function splitFee(fee: CardFee, spend: Map<string, number>): { shares: FeeShare[]; total: number } {
  const people = [...spend].filter(([name, value]) => value > 0 && !fee.excluded.includes(name)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  const spendCents = people.map(([, value]) => cents(value))
  const target = fee.mode === 'fixed' ? cents(fee.value) : spendCents.reduce((sum, value) => sum + Math.ceil((value * fee.value) / 100), 0)
  const manual = people.map(([name]) => (fee.overrides[name] !== undefined ? Math.max(0, cents(fee.overrides[name])) : null))
  const fixed = manual.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const free = people.map((_, i) => i).filter((i) => manual[i] === null)
  const parts = spread(Math.max(0, target - fixed), free.map((i) => spendCents[i]))
  const result = people.map(([name, value], i) => {
    const base = manual[i] ?? parts[free.indexOf(i)]
    // O extra entra por cima da parte normal, inclusive quando ela foi ajustada na mão.
    const extra = cents(extraFor(fee, name, value))
    const limit = fee.limits?.[name]
    return { name, spend: value, share: (base + extra) / 100, base: base / 100, extra: extra / 100, limit: limit && limit > 0 ? limit : null, manual: manual[i] !== null, paid: fee.paid.includes(name) }
  })
  return { shares: result, total: result.reduce((sum, item) => sum + cents(item.share), 0) / 100 }
}

/** A taxa desta fatura; sem configuração própria, repete a da fatura anterior mais recente (sem ajustes nem pagamentos). */
export function feeFor(invoiceId: string, invoices: Invoice[], fees: CardFee[]): { fee: CardFee; inherited: boolean } | null {
  const own = fees.find((item) => item.invoice_id === invoiceId)
  if (own) return { fee: own, inherited: false }
  const period = invoices.find((item) => item.id === invoiceId)?.period
  if (!period) return null
  const previous = fees
    .map((item) => ({ item, period: invoices.find((inv) => inv.id === item.invoice_id)?.period }))
    .filter((entry): entry is { item: CardFee; period: string } => !!entry.period && entry.period < period)
    .sort((a, b) => b.period.localeCompare(a.period))[0]
  if (!previous) return null
  return { fee: { ...previous.item, invoice_id: invoiceId, overrides: {}, paid: [] }, inherited: true }
}

/** Taxa calculada de uma fatura (ou null se não tem taxa ou ela está zerada). */
export function feeSplitFor(invoiceId: string, invoices: Invoice[], fees: CardFee[], rows: Transaction[]): FeeSplit | null {
  const found = feeFor(invoiceId, invoices, fees)
  if (!found || !(found.fee.value > 0)) return null
  const { shares, total } = splitFee(found.fee, spendByPerson(rows.filter((row) => row.invoice_id === invoiceId)))
  return { fee: found.fee, shares, total, inherited: found.inherited }
}

/** Texto da linha da taxa na cobrança, com a conta. */
export function feeLine(fee: CardFee, share: FeeShare): string {
  const how = share.manual ? 'valor combinado' : fee.mode === 'percent' ? `${String(fee.value).replace('.', ',')}% do seu gasto` : 'proporcional ao seu gasto'
  const extra = share.extra > 0 && share.limit ? ` + ${String(fee.extraPct).replace('.', ',')}% por passar do limite de ${brl(share.limit)}` : ''
  return `${fee.name} (${how}${extra})`
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Jeito discreto da taxa para a pessoa (null = taxa à vista, como sempre). */
export function displayOf(fee: CardFee | null | undefined, name: string): FeeDisplay | null {
  const found = fee?.display?.[name] ?? Object.entries(fee?.display ?? {}).find(([key]) => key.trim().toLocaleLowerCase('pt-BR') === name.trim().toLocaleLowerCase('pt-BR'))?.[1]
  return found && (found.mode === 'embedded' || found.mode === 'rounded') ? found : null
}

/** Arredonda para cima no próximo múltiplo de R$ 5 (em centavos). */
export const roundUpCents = (cents: number, step = 500) => Math.ceil(cents / step) * step

/** Total cobrado (em centavos) a partir das compras e da taxa: no modo arredondado, sobe até o próximo múltiplo de R$ 5. */
export function chargeCents(purchases: number, fee: number, display: FeeDisplay | null) {
  const total = purchases + fee
  return display?.mode === 'rounded' && fee > 0 ? roundUpCents(total) : total
}

/** Divide `target` centavos entre os valores, proporcional a cada um, e a soma bate exato (maior resto). */
export function spreadCents(values: number[], target: number): number[] {
  const base = values.reduce((sum, v) => sum + v, 0)
  if (!values.length) return []
  if (base <= 0) return values.map((_, i) => (i === 0 ? target : 0))
  const raw = values.map((v) => (v * target) / base)
  const out = raw.map(Math.floor)
  let left = target - out.reduce((sum, v) => sum + v, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++
  return out
}

export const FEE_DISPLAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Taxa à vista (linha separada)' },
  { value: 'embedded:note', label: 'Embutida: compras + total com a taxa' },
  { value: 'embedded:spread', label: 'Embutida: diluída nas compras' },
  { value: 'embedded:total', label: 'Embutida: só o total' },
  { value: 'rounded:note', label: 'Arredondar: compras + total redondo' },
  { value: 'rounded:spread', label: 'Arredondar: diluído nas compras' },
  { value: 'rounded:total', label: 'Arredondar: só o total' },
]
export const displayValue = (display: FeeDisplay | null) => (display ? `${display.mode}:${display.style}` : '')
export function parseDisplay(value: string): FeeDisplay | null {
  const [mode, style] = value.split(':')
  return (mode === 'embedded' || mode === 'rounded') && (style === 'note' || style === 'spread' || style === 'total') ? { mode, style } : null
}
