export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const pad = (n: number) => String(n).padStart(2, '0')

export function periodLabel(period: string) {
  const [year, month] = period.split('-')
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`
}

export function shortPeriodLabel(period: string) {
  const [year, month] = period.split('-')
  return `${MONTH_NAMES[Number(month) - 1].slice(0, 3)}/${year.slice(2)}`
}

export const periodOfDate = (iso: string) => `${iso.slice(0, 7)}-01`

export function currentPeriod(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
}

export function addMonthsToPeriod(period: string, months: number) {
  const [year, month] = period.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`
}

export function addMonthsToDate(iso: string, months: number) {
  const day = Number(iso.slice(8, 10))
  const period = addMonthsToPeriod(periodOfDate(iso), months)
  const [year, month] = period.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDay))}`
}

/** Divide em centavos iguais; a diferença de arredondamento fica na última parcela. */
export function splitCents(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count)
  const parts = Array<number>(count).fill(base)
  parts[count - 1] = totalCents - base * (count - 1)
  return parts
}

export function isValidPeriod(period: string) {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(period)
}
