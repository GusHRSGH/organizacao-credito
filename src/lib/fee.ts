import type { CardFee, Invoice, Transaction } from '../types'

export const DEFAULT_FEE_NAME = 'Taxa de evolução de crédito'

export interface FeeShare { name: string; spend: number; share: number; manual: boolean; paid: boolean }
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
    const share = manual[i] ?? parts[free.indexOf(i)]
    return { name, spend: value, share: share / 100, manual: manual[i] !== null, paid: fee.paid.includes(name) }
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
  return `${fee.name} (${how})`
}
