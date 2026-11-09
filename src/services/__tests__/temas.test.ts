import { describe, expect, it } from 'vitest'
import { PALETTES, tokensFor } from '../../lib/themes'

const lum = (hex: string) => {
  const c = (i: number) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2)
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('temas', () => {
  it('todo tema tem as mesmas chaves nos dois modos', () => {
    for (const palette of PALETTES) {
      expect(Object.keys(tokensFor(palette, 'dark')).sort()).toEqual(Object.keys(tokensFor(palette, 'light')).sort())
    }
  })
  it('texto e botões têm contraste legível em todos os temas', () => {
    for (const palette of PALETTES) for (const mode of ['dark', 'light'] as const) {
      const t = tokensFor(palette, mode)
      expect(contrast(t['--text'], t['--bg']), `${palette.id} ${mode} texto`).toBeGreaterThan(7)
      expect(contrast(t['--on-primary'], t['--primary']), `${palette.id} ${mode} botão`).toBeGreaterThan(3)
      expect(contrast(t['--bad'], t['--surface']), `${palette.id} ${mode} pendente`).toBeGreaterThan(3)
    }
  })
  it('o preto puro usa fundo #000 no escuro', () => {
    expect(tokensFor(PALETTES.find((p) => p.id === 'amoled')!, 'dark')['--bg']).toBe('#000000')
  })
})
