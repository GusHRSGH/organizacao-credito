const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlShort = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export const money = (value: number) => brl.format(value)
export const moneyShort = (value: number) => `R$ ${brlShort.format(value)}`
export const pct = (value: number, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
export const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${brl.format(Math.abs(value))}`

export function formatDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export function messageOf(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return 'Ocorreu um erro inesperado.'
}
