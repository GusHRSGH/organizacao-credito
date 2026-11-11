export interface PaletteDef {
  id: string
  name: string
  /** Matiz do destaque (0 a 360). */
  hue: number
  nhDark: number
  satDark: number
  nhLight: number
  satLight: number
  /** Fundo totalmente preto no modo escuro. */
  amoled?: boolean
  /** Cores fixas (paleta de marca), em vez de derivadas do matiz. */
  fixed?: Record<Mode, Record<string, string>>
}

const GOOD_BAD = {
  dark: { '--good': '#4ade80', '--good-soft': '#10281a', '--warn': '#fbbf24', '--warn-soft': '#33270b', '--bad': '#f87171', '--bad-soft': '#3a1618' },
  light: { '--good': '#1f8a4c', '--good-soft': '#def3e6', '--warn': '#9a5b0a', '--warn-soft': '#fbeccf', '--bad': '#d12f3f', '--bad-soft': '#fde3e6' },
}

export const PALETTES: PaletteDef[] = [
  {
    id: 'cadence', name: 'Chacun (grafite e azul)', hue: 222, nhDark: 0, satDark: 0, nhLight: 220, satLight: 8,
    fixed: {
      dark: {
        '--bg': '#0b0d12', '--sidebar': '#0b0d12', '--surface': '#12151c', '--surface-2': '#191d26', '--line': '#222733', '--line-strong': '#323949',
        '--text': '#eaedf5', '--muted': '#9aa1b5', '--faint': '#7a8196',
        '--primary': '#5b8cff', '--primary-strong': '#86a9ff', '--primary-soft': '#121c33', '--on-primary': '#071026', '--accent': '#5b8cff',
        ...GOOD_BAD.dark, '--chart-alt': '#eaedf5', '--chart-alt-light': '#f5f7fb', '--slice-1': '#5b8cff', '--slice-2': '#eaedf5', '--slice-3': '#b0b6c7', '--slice-4': '#8a91a5', '--slice-5': '#666d82', '--slice-6': '#3f6fe0', '--slice-7': '#d0d4e0', '--slice-8': '#3d5aa6', '--slice-9': '#464c5e', '--slice-10': '#363b4b', '--focus': '#5b8cff80',
      },
      light: {
        '--bg': '#f7f8fb', '--sidebar': '#ffffff', '--surface': '#ffffff', '--surface-2': '#eef0f6', '--line': '#e1e4ec', '--line-strong': '#cbd0de',
        '--text': '#0b0d12', '--muted': '#555c70', '--faint': '#858ba0',
        '--primary': '#2f5fe0', '--primary-strong': '#234bc0', '--primary-soft': '#e6ecfd', '--on-primary': '#ffffff', '--accent': '#5b8cff',
        ...GOOD_BAD.light, '--chart-alt': '#858ba0', '--chart-alt-light': '#a3a9bb', '--slice-1': '#2f5fe0', '--slice-2': '#0b0d12', '--slice-3': '#5b6fb8', '--slice-4': '#a3a9bb', '--slice-5': '#c9cdda', '--slice-6': '#46506b', '--slice-7': '#8aa5f0', '--slice-8': '#27304d', '--slice-9': '#b8bdcc', '--slice-10': '#d8dce6', '--focus': '#2f5fe040',
      },
    },
  },
  { id: 'violeta', name: 'Preto e roxo', hue: 262, nhDark: 260, satDark: 6, nhLight: 255, satLight: 20 },
  { id: 'petroleo', name: 'Verde-petróleo e creme', hue: 175, nhDark: 175, satDark: 14, nhLight: 40, satLight: 35 },
  { id: 'azul', name: 'Azul clássico', hue: 220, nhDark: 222, satDark: 22, nhLight: 220, satLight: 30 },
  { id: 'amoled', name: 'Preto puro (AMOLED)', hue: 258, nhDark: 0, satDark: 0, nhLight: 255, satLight: 20, amoled: true },
  { id: 'grafite', name: 'Grafite e laranja', hue: 24, nhDark: 30, satDark: 4, nhLight: 30, satLight: 12 },
  { id: 'rosa', name: 'Rosa e vinho', hue: 335, nhDark: 330, satDark: 12, nhLight: 335, satLight: 25 },
  { id: 'oceano', name: 'Oceano', hue: 195, nhDark: 200, satDark: 18, nhLight: 200, satLight: 28 },
  { id: 'floresta', name: 'Floresta', hue: 145, nhDark: 150, satDark: 14, nhLight: 100, satLight: 25 },
  { id: 'dourado', name: 'Dourado', hue: 42, nhDark: 40, satDark: 8, nhLight: 42, satLight: 30 },
]

export const DEFAULT_PALETTE = PALETTES[0].id
export const getPalette = (id: string) => PALETTES.find((palette) => palette.id === id) ?? PALETTES[0]

function hsl(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function luminance(hex: string) {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/** Cor do texto sobre o destaque: branco, ou quase preto quando o destaque é claro. */
const onAccent = (hex: string) => (luminance(hex) > 0.3 ? '#0b0b0f' : '#ffffff')

export type Mode = 'light' | 'dark'

export function tokensFor(def: PaletteDef, mode: Mode): Record<string, string> {
  if (def.fixed) return def.fixed[mode]
  if (mode === 'dark') {
    const n = (l: number) => hsl(def.nhDark, def.satDark, l)
    const primary = hsl(def.hue, 90, 66)
    return {
      '--bg': def.amoled ? '#000000' : n(4), '--sidebar': def.amoled ? '#050505' : n(5.5),
      '--surface': def.amoled ? n(6) : n(8.5), '--surface-2': def.amoled ? n(10) : n(11.5),
      '--line': n(15), '--line-strong': n(22),
      '--text': hsl(def.nhDark, Math.min(def.satDark + 8, 20), 95), '--muted': hsl(def.nhDark, def.satDark + 4, 68), '--faint': hsl(def.nhDark, def.satDark + 2, 52),
      '--primary': primary, '--primary-strong': hsl(def.hue, 92, 76), '--primary-soft': hsl(def.hue, 45, def.amoled ? 12 : 15),
      '--on-primary': onAccent(primary),
      '--good': '#4ade80', '--good-soft': '#10281a', '--warn': '#fbbf24', '--warn-soft': '#33270b', '--bad': '#f87171', '--bad-soft': '#3a1618',
      '--focus': `${primary}80`,
    }
  }
  const n = (l: number) => hsl(def.nhLight, def.satLight, l)
  const lightness = def.hue >= 140 && def.hue <= 210 ? 31 : def.hue >= 35 && def.hue <= 60 ? 36 : 44
  const primary = hsl(def.hue, 70, lightness)
  return {
    '--bg': n(96), '--sidebar': n(99), '--surface': '#ffffff', '--surface-2': n(94), '--line': n(89), '--line-strong': n(80),
    '--text': hsl(def.nhLight, 25, 9), '--muted': hsl(def.nhLight, 10, 38), '--faint': hsl(def.nhLight, 8, 55),
    '--primary': primary, '--primary-strong': hsl(def.hue, 72, lightness - 9), '--primary-soft': hsl(def.hue, 85, 94),
    '--on-primary': onAccent(primary),
    '--good': '#1f8a4c', '--good-soft': '#def3e6', '--warn': '#9a5b0a', '--warn-soft': '#fbeccf', '--bad': '#d12f3f', '--bad-soft': '#fde3e6',
    '--focus': `${primary}55`,
  }
}
