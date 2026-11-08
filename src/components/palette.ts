export interface Series { name: string; color: string; light: string }

// Paleta azul. Nomes antigos mantidos para não quebrar imports:
// TEAL = série principal (azul cobalto), AMBER = série de comparação (ciano),
// GREEN = pago (esmeralda), RED = pendente (âmbar).
export const TEAL: Series = { name: '', color: '#2f6bff', light: '#7aa5ff' }
export const AMBER: Series = { name: '', color: '#12b5d6', light: '#7fe0f2' }
export const GREEN: Series = { name: '', color: '#12a979', light: '#5fdcb2' }
export const RED: Series = { name: '', color: '#f09a2b', light: '#ffc87a' }
export const SLICE_COLORS = ['#2f6bff', '#12b5d6', '#7a5cff', '#12a979', '#f09a2b', '#5aa2ff', '#c05cf0', '#4b6fb8', '#e2688f', '#8fb0e6']
export const NEUTRAL_SLICE = '#8da2c4'
export const withName = (series: Series, name: string): Series => ({ ...series, name })
