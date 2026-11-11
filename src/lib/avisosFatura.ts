// Notificações do celular ligadas ao cartão: vencimento, fechamento e dia de cobrar. São locais (sem servidor, sem custo).
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { closingDate, dueDate, readCard, type Card } from './card'
import { addMonthsToPeriod, periodLabel } from '../services/installments'

export interface AvisosFatura {
  due: { on: boolean; daysBefore: 0 | 1 | 3; hour: number }
  closing: { on: boolean; hour: number }
  collect: { on: boolean; day: number; hour: number }
}
export const AVISOS_PADRAO: AvisosFatura = { due: { on: false, daysBefore: 1, hour: 9 }, closing: { on: false, hour: 9 }, collect: { on: false, day: 8, hour: 10 } }

const KEY = 'oc:avisos-fatura'
const BASE_ID = 7200
const MONTHS = 4
const int = (value: unknown, min: number, max: number, fallback: number) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback }

export function readAvisos(): AvisosFatura {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<keyof AvisosFatura, Record<string, unknown>>> | null
    const d = AVISOS_PADRAO
    return {
      due: { on: raw?.due?.on === true, daysBefore: ([0, 1, 3] as const).find((n) => n === raw?.due?.daysBefore) ?? d.due.daysBefore, hour: int(raw?.due?.hour, 0, 23, d.due.hour) },
      closing: { on: raw?.closing?.on === true, hour: int(raw?.closing?.hour, 0, 23, d.closing.hour) },
      collect: { on: raw?.collect?.on === true, day: int(raw?.collect?.day, 1, 28, d.collect.day), hour: int(raw?.collect?.hour, 0, 23, d.collect.hour) },
    }
  } catch { return structuredClone(AVISOS_PADRAO) }
}
export function writeAvisos(value: AvisosFatura) { try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* vale até recarregar */ } }

export const avisosDisponiveis = () => Capacitor.isNativePlatform()
export const algumAvisoLigado = (a: AvisosFatura) => a.due.on || a.closing.on || a.collect.on

export interface PlannedNotice { id: number; at: Date; title: string; body: string; go: 'invoices' | 'billing' }

const at = (iso: string, hour: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, hour, 0, 0, 0) }
const monthStart = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

/** Datas e textos das próximas notificações, só do futuro. O vencimento e o fechamento dependem do cartão configurado. */
export function planAvisos(config: AvisosFatura, card: Card | null, now: Date): PlannedNotice[] {
  const out: Omit<PlannedNotice, 'id'>[] = []
  const first = addMonthsToPeriod(monthStart(now), -1)
  for (let i = 0; i < MONTHS + 1; i += 1) {
    const period = addMonthsToPeriod(first, i)
    const label = periodLabel(period)
    if (card && config.due.on) {
      const day = new Date(`${dueDate(period, card)}T00:00:00Z`)
      day.setUTCDate(day.getUTCDate() - config.due.daysBefore)
      const iso = day.toISOString().slice(0, 10)
      out.push({ at: at(iso, config.due.hour), title: 'Fatura perto de vencer', body: `A fatura de ${label} vence ${config.due.daysBefore === 0 ? 'hoje' : config.due.daysBefore === 1 ? 'amanhã' : `em ${config.due.daysBefore} dias`}.`, go: 'invoices' })
    }
    if (card && config.closing.on) out.push({ at: at(closingDate(period, card), config.closing.hour), title: 'Hoje fecha a fatura', body: `A fatura de ${label} fecha hoje. Compras de hoje em diante já entram na de ${periodLabel(addMonthsToPeriod(period, 1))}.`, go: 'invoices' })
    if (config.collect.on) {
      const [y, m] = period.split('-').map(Number)
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(config.collect.day).padStart(2, '0')}`
      out.push({ at: at(iso, config.collect.hour), title: 'Hora de cobrar', body: 'Veja quem ainda não pagou e mande a cobrança.', go: 'billing' })
    }
  }
  return out.filter((n) => n.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 30).map((n, i) => ({ ...n, id: BASE_ID + i }))
}

/** Reagenda as notificações do cartão. Chame ao abrir o app e ao mudar a configuração ou o cartão. */
export async function agendarAvisos(config: AvisosFatura = readAvisos()): Promise<'ok' | 'desligado' | 'negado' | 'indisponivel'> {
  if (!avisosDisponiveis()) return 'indisponivel'
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 30 }, (_, i) => ({ id: BASE_ID + i })) })
    if (!algumAvisoLigado(config)) return 'desligado'
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') return 'negado'
    const plan = planAvisos(config, readCard(), new Date())
    if (plan.length) await LocalNotifications.schedule({ notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, extra: { go: n.go }, schedule: { at: n.at, allowWhileIdle: true }, smallIcon: 'ic_stat_chacun', iconColor: '#5b8cff' })) })
    return 'ok'
  } catch { return 'indisponivel' }
}
