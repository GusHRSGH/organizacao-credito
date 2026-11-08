export interface Series { name: string; color: string; light: string }

export const TEAL: Series = { name: '', color: '#1f8a7d', light: '#5cc6b8' }
export const AMBER: Series = { name: '', color: '#e08a12', light: '#f6c56b' }
export const GREEN: Series = { name: '', color: '#2e9e5b', light: '#7ed6a0' }
export const RED: Series = { name: '', color: '#d64545', light: '#f19393' }
export const SLICE_COLORS = ['#2a9d8f', '#e9a23b', '#3d5a98', '#d64545', '#8e7cc3', '#4f9d69', '#c76b98', '#6c8ea4', '#b5894a', '#9aa5b1']
export const withName = (series: Series, name: string): Series => ({ ...series, name })

