import { money, pct } from './format'
import type { CompareRow } from '../services/stats'

export interface InsightInput {
  label: string
  total: number
  pending: number
  count: number
  otherLabel?: string
  otherTotal?: number
  categories: CompareRow[]
}

const SEM = 'Sem categoria'

/** Frase curta que resume o mês: quanto foi, como está contra o outro mês, o que puxou a diferença e o que falta pagar. */
export function summarize(input: InsightInput): string {
  const { label, total, pending, count, otherLabel, otherTotal, categories } = input
  if (count === 0) return `${label} ainda não tem lançamentos.`
  const parts: string[] = [`Em ${label} você gastou ${money(total)} em ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`]
  if (otherLabel && otherTotal !== undefined && otherTotal > 0) {
    const change = (total - otherTotal) / otherTotal
    if (Math.abs(change) < 0.005) parts[0] += `, praticamente igual a ${otherLabel}`
    else {
      parts[0] += `, ${pct(Math.abs(change))} ${change > 0 ? 'a mais' : 'a menos'} que em ${otherLabel}`
      const sign = change > 0 ? 1 : -1
      const driver = [...categories].filter((row) => row.name !== SEM && row.diff * sign > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0]
      if (driver) parts[0] += `, ${change > 0 ? 'puxado' : 'aliviado'} por ${driver.name} (${driver.diff > 0 ? '+' : '−'}${money(Math.abs(driver.diff))})`
    }
  } else {
    const top = [...categories].filter((row) => row.name !== SEM).sort((a, b) => b.a - a.a)[0]
    if (top && top.a > 0) parts[0] += `, a maior fatia é ${top.name} (${pct(top.a / total, 0)})`
  }
  parts[0] += '.'
  parts.push(pending > 0.004 ? `Falta pagar ${money(pending)}.` : 'Tudo pago.')
  return parts.join(' ')
}
