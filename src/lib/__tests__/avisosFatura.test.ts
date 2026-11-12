import { describe, expect, it } from 'vitest'
import { AVISOS_PADRAO, planAvisos, type AvisosFatura } from '../avisosFatura'

const card = { dueDay: 7, closingDaysBefore: 7 }
const all: AvisosFatura = { due: { on: true, daysBefore: 1, hour: 9 }, closing: { on: true, hour: 9 }, collect: { on: true, day: 8, hour: 10 } }
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.getHours()}h`

describe('notificações do cartão', () => {
  it('não agenda nada com tudo desligado', () => {
    expect(planAvisos(AVISOS_PADRAO, card, new Date(2026, 10, 11, 12))).toEqual([])
  })
  it('agenda vencimento (1 dia antes), fechamento e cobrança, só no futuro', () => {
    const plan = planAvisos(all, card, new Date(2026, 10, 11, 12))
    expect(plan.slice(0, 5).map((n) => `${fmt(n.at)} ${n.title}`)).toEqual([
      '30/11 9h Hoje fecha a fatura',
      '06/12 9h Fatura perto de vencer',
      '08/12 10h Hora de cobrar',
      '31/12 9h Hoje fecha a fatura',
      '06/01 9h Fatura perto de vencer',
    ])
    expect(plan.every((n) => n.at.getTime() > new Date(2026, 10, 11, 12).getTime())).toBe(true)
    expect(new Set(plan.map((n) => n.id)).size).toBe(plan.length)
  })
  it('escreve o texto certo e leva à tela certa', () => {
    const plan = planAvisos(all, card, new Date(2026, 10, 11, 12))
    expect(plan[0].body).toBe('A fatura de Dezembro 2026 fecha hoje. Compras de hoje em diante já entram na de Janeiro 2027.')
    expect(plan[1].body).toBe('A fatura de Dezembro 2026 vence amanhã.')
    expect(plan[1].go).toBe('invoices')
    expect(plan[2].go).toBe('billing')
  })
  it('sem cartão configurado só a cobrança funciona', () => {
    const plan = planAvisos(all, null, new Date(2026, 10, 11, 12))
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.every((n) => n.go === 'billing')).toBe(true)
  })
  it('respeita antecedência de 3 dias e vencimento no mesmo dia', () => {
    const three = planAvisos({ ...all, closing: { on: false, hour: 9 }, collect: { on: false, day: 8, hour: 10 }, due: { on: true, daysBefore: 3, hour: 8 } }, card, new Date(2026, 10, 11, 12))
    expect(fmt(three[0].at)).toBe('04/12 8h')
    expect(three[0].body).toContain('em 3 dias')
    const same = planAvisos({ ...all, closing: { on: false, hour: 9 }, collect: { on: false, day: 8, hour: 10 }, due: { on: true, daysBefore: 0, hour: 8 } }, card, new Date(2026, 10, 11, 12))
    expect(same[0].body).toContain('vence hoje')
  })
  it('depois do horário de hoje, não agenda o que já passou', () => {
    const plan = planAvisos(all, card, new Date(2026, 11, 8, 11))
    expect(fmt(plan[0].at)).not.toBe('08/12 10h')
  })
})
