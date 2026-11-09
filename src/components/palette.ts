export interface Series { name: string; color: string; light: string }

// Paleta preto e roxo. Nomes antigos mantidos para não quebrar imports:
// TEAL = série principal (violeta), AMBER = série de comparação (ciano),
// GREEN = pago (verde), RED = pendente (vermelho).
export const TEAL: Series = { name: '', color: '#8b5cf6', light: '#a78bfa' }
export const AMBER: Series = { name: '', color: '#22b8d4', light: '#4fd0e6' }
export const GREEN: Series = { name: '', color: '#22b55e', light: '#4cc97c' }
export const RED: Series = { name: '', color: '#e5484d', light: '#ef6a6e' }
export const SLICE_COLORS = ['#8b5cf6', '#22b8d4', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#c084fc', '#fb923c', '#a3e635', '#94a3b8']
export const NEUTRAL_SLICE = '#8a8a99'
export const withName = (series: Series, name: string): Series => ({ ...series, name })
