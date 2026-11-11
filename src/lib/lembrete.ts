// Lembrete diário no Android (notificação local, sem servidor e sem custo).
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export interface Lembrete { on: boolean; hour: number; minute: number }
export const LEMBRETE_PADRAO: Lembrete = { on: false, hour: 20, minute: 0 }

const KEY = 'oc:lembrete'
const DONE_KEY = 'oc:lancou-hoje'
const BASE_ID = 7100
const DAYS = 14

export const lembreteDisponivel = () => Capacitor.isNativePlatform()

export function readLembrete(): Lembrete {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Lembrete> | null
    const hour = Number(raw?.hour), minute = Number(raw?.minute)
    return { on: raw?.on === true, hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : LEMBRETE_PADRAO.hour, minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : LEMBRETE_PADRAO.minute }
  } catch { return { ...LEMBRETE_PADRAO } }
}
export function writeLembrete(value: Lembrete) { try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* vale até recarregar */ } }

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Guarda que já houve lançamento hoje, para o lembrete de hoje não aparecer à toa. */
export function marcarLancamentoHoje(now = new Date()) {
  try { localStorage.setItem(DONE_KEY, dayKey(now)) } catch { /* ignora */ }
  void agendarLembrete()
}

/** Datas dos próximos lembretes: a partir de agora, pulando hoje se já houve lançamento. */
export function proximosLembretes(config: Lembrete, now: Date, jaLancouHoje: boolean, days = DAYS): Date[] {
  const out: Date[] = []
  for (let i = 0; i < days + 1 && out.length < days; i += 1) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, config.hour, config.minute, 0, 0)
    if (at.getTime() <= now.getTime()) continue
    if (i === 0 && jaLancouHoje) continue
    out.push(at)
  }
  return out
}

/** Reagenda os lembretes dos próximos dias. Chame ao abrir o app e depois de cada lançamento. */
export async function agendarLembrete(config: Lembrete = readLembrete()): Promise<'ok' | 'desligado' | 'negado' | 'indisponivel'> {
  if (!lembreteDisponivel()) return 'indisponivel'
  try {
    const ids = Array.from({ length: DAYS + 1 }, (_, i) => ({ id: BASE_ID + i }))
    await LocalNotifications.cancel({ notifications: ids })
    if (!config.on) return 'desligado'
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') return 'negado'
    const now = new Date()
    let doneToday = false
    try { doneToday = localStorage.getItem(DONE_KEY) === dayKey(now) } catch { /* ignora */ }
    const when = proximosLembretes(config, now, doneToday)
    await LocalNotifications.schedule({ notifications: when.map((at, i) => ({ id: BASE_ID + i, title: 'Chacun', body: 'Lançou os gastos de hoje? Leva só alguns segundos.', extra: { go: 'novo' }, schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_chacun', iconColor: '#5b8cff' })) })
    return 'ok'
  } catch { return 'indisponivel' }
}

/** Quando a pessoa toca numa notificação do app, abre a tela certa (lançamento, faturas ou cobrança). */
export function aoTocarNaNotificacao(open: (go: string) => void) {
  if (!lembreteDisponivel()) return () => undefined
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', (event) => { const go = (event.notification.extra as { go?: string } | undefined)?.go; open(go ?? 'novo') })
  return () => { void listener.then((handle) => handle.remove()) }
}
