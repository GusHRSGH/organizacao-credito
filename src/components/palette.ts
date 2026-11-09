export interface Series { name: string; color: string; light: string }

// Paleta verde-petróleo e terra. Nomes antigos mantidos para não quebrar imports:
// TEAL = série principal (verde-petróleo), AMBER = série de comparação (ocre),
// GREEN = pago (verde folha), RED = pendente (vermelho).
export const TEAL: Series = { name: '', color: '#0f5c5c', light: '#2f7f7a' }
export const AMBER: Series = { name: '', color: '#c98a3c', light: '#dba65f' }
export const GREEN: Series = { name: '', color: '#3b8f62', light: '#5aa47c' }
export const RED: Series = { name: '', color: '#c0392b', light: '#d4584a' }
export const SLICE_COLORS = ['#0f5c5c', '#c98a3c', '#7a8f5a', '#b5533c', '#5b7c99', '#8b6f9a', '#a39171', '#3f7f7a', '#d0a15a', '#6c7a74']
export const NEUTRAL_SLICE = '#9aa39d'
export const withName = (series: Series, name: string): Series => ({ ...series, name })
