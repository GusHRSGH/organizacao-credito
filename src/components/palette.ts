export interface Series { name: string; color: string; light: string }

// As cores dos gráficos seguem o tema escolhido (variáveis CSS definidas em styles.css).
// Nomes antigos mantidos: TEAL = série principal, AMBER = comparação, GREEN = pago, RED = pendente.
export const TEAL: Series = { name: '', color: 'var(--chart-main)', light: 'var(--chart-main-light)' }
export const AMBER: Series = { name: '', color: 'var(--chart-alt)', light: 'var(--chart-alt-light)' }
export const GREEN: Series = { name: '', color: 'var(--chart-paid)', light: 'var(--chart-paid-light)' }
export const RED: Series = { name: '', color: 'var(--chart-pending)', light: 'var(--chart-pending-light)' }
export const SLICE_COLORS = Array.from({ length: 10 }, (_, index) => `var(--slice-${index + 1})`)
export const NEUTRAL_SLICE = 'var(--faint)'
export const withName = (series: Series, name: string): Series => ({ ...series, name })
