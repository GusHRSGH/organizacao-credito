import { getSettings } from './settings'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlShort = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const brlRound = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const HIDDEN = 'R$ ••••'

/** Arredonda no centavo e tira o "-0" que sobra de contas como 10,1 - 10,1 (senão aparece "-R$ 0,00"). */
const tidy = (value: number) => { const v = Math.round(value * 100) / 100; return v === 0 ? 0 : v }

export const money = (value: number) => { const s = getSettings(); return s.hideValues ? HIDDEN : (s.cents ? brl : brlRound).format(tidy(value)) }
export const moneyShort = (value: number) => getSettings().hideValues ? HIDDEN : `R$ ${brlShort.format(value)}`
/** Valor formatado sempre completo, para mensagens e arquivos (ignora ocultar valores e centavos). */
export const moneyFull = (value: number) => brl.format(tidy(value))
export const pct = (value: number, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
export const signedMoney = (value: number) => { const s = getSettings(); return s.hideValues ? HIDDEN : `${value > 0 ? '+' : value < 0 ? '−' : ''}${(s.cents ? brl : brlRound).format(Math.abs(value))}` }

export function formatDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return getSettings().dateStyle === 'short' ? `${day}/${month}/${year.slice(2)}` : `${day}/${month}/${year}`
}

export function messageOf(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return 'Ocorreu um erro inesperado.'
}
