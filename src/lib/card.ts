import { addDays } from './quickEntry'
import { addMonthsToPeriod, periodOfDate } from '../services/installments'
import { getActiveWallet, MAIN_WALLET } from './wallet'

/** Como o cartão fecha a fatura. A fatura leva o nome do mês em que vence. */
export interface Card { dueDay: number; closingDaysBefore: number; /** Limite do cartão em reais (opcional). */ limit?: number }

const STORE = 'oc:cartao'
export const DEFAULT_CARD: Card = { dueDay: 7, closingDaysBefore: 7 }
/** Cada carteira guarda o seu vencimento e fechamento; a principal usa a chave de antes das carteiras. */
const storeOf = (wallet: string) => (wallet === MAIN_WALLET ? STORE : `${STORE}:${wallet}`)

/** Cartão da carteira aberta agora. */
export function readCard(): Card | null { return readCardFor(getActiveWallet()) }

export function readCardFor(wallet: string): Card | null {
  try {
    const raw = JSON.parse(localStorage.getItem(storeOf(wallet)) ?? 'null') as Partial<Card> | null
    if (!raw) return null
    const dueDay = Number(raw.dueDay)
    const before = Number(raw.closingDaysBefore)
    const limit = Number(raw.limit)
    if (!(dueDay >= 1 && dueDay <= 31 && before >= 0 && before <= 20)) return null
    return limit > 0 ? { dueDay, closingDaysBefore: before, limit } : { dueDay, closingDaysBefore: before }
  } catch { return null }
}

export function writeCard(card: Card | null, wallet = getActiveWallet()) {
  try { if (card) localStorage.setItem(storeOf(wallet), JSON.stringify(card)); else localStorage.removeItem(storeOf(wallet)) } catch { /* vale até recarregar */ }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Dia do vencimento da fatura do mês `period` (cai no último dia se o mês for curto). */
export function dueDate(period: string, card: Card) {
  const [year, month] = period.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(card.dueDay, last))}`
}

/** Dia do fechamento. Compras feitas nesse dia já entram na fatura seguinte (o "melhor dia de compra"). */
export const closingDate = (period: string, card: Card) => addDays(dueDate(period, card), -card.closingDaysBefore)

/** Em qual fatura (AAAA-MM-01, pelo mês do vencimento) uma compra feita em `date` cai. */
export function invoicePeriodFor(date: string, card: Card | null): string {
  const calendar = periodOfDate(date)
  if (!card) return calendar
  for (let step = -1; step <= 2; step++) {
    const period = addMonthsToPeriod(calendar, step)
    if (date < closingDate(period, card)) return period
  }
  return addMonthsToPeriod(calendar, 2)
}
