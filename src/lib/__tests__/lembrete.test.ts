import { describe, expect, it } from 'vitest'
import { proximosLembretes } from '../lembrete'
import { normalizeSpoken } from '../voice'

describe('lembrete diário', () => {
  const cfg = { on: true, hour: 20, minute: 0 }
  it('agenda a partir de hoje se ainda não deu o horário', () => {
    const list = proximosLembretes(cfg, new Date(2026, 10, 11, 15, 0), false, 3)
    expect(list.map((d) => `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h`)).toEqual(['11/11 20h', '12/11 20h', '13/11 20h'])
  })
  it('pula hoje depois do horário ou se já lançou', () => {
    expect(proximosLembretes(cfg, new Date(2026, 10, 11, 21, 0), false, 2).map((d) => d.getDate())).toEqual([12, 13])
    expect(proximosLembretes(cfg, new Date(2026, 10, 11, 15, 0), true, 2).map((d) => d.getDate())).toEqual([12, 13])
  })
  it('vira o mês sem erro', () => {
    expect(proximosLembretes(cfg, new Date(2026, 10, 29, 21, 0), false, 3).map((d) => `${d.getDate()}/${d.getMonth() + 1}`)).toEqual(['30/11', '1/12', '2/12'])
  })
})

describe('fala de valores', () => {
  it('junta vírgula e centavos', () => {
    expect(normalizeSpoken('mercado 12 vírgula 50')).toBe('mercado 12,50')
    expect(normalizeSpoken('padaria 12 reais e 50 centavos')).toBe('padaria 12,50')
    expect(normalizeSpoken('uber 30 reais e 90')).toBe('uber 30,90')
  })
  it('não mexe em parcelas, datas e valores normais', () => {
    expect(normalizeSpoken('tv 300 reais em 3 vezes')).toBe('tv 300 reais em 3 vezes')
    expect(normalizeSpoken('mercado 150,90 ontem')).toBe('mercado 150,90 ontem')
    expect(normalizeSpoken('farmácia 25 reais e 5 vezes')).toBe('farmácia 25 reais e 5 vezes')
  })
})
