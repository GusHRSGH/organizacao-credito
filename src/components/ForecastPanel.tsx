import { useMemo, useState } from 'react'
import { Panel } from './ui'
import { Icon } from './Icon'
import { invoicePeriodFor, readCard } from '../lib/card'
import { forecastFor } from '../lib/forecast'
import { money } from '../lib/format'
import { periodLabel } from '../services/installments'
import type { Subscription } from '../lib/watch'
import type { Invoice, Transaction } from '../types'

interface Props { invoices: Invoice[]; transactions: Transaction[]; onLaunch?: (period: string, subs: Subscription[]) => Promise<void> }

/** Quanto a fatura aberta deve fechar: o que já está lançado, as assinaturas que ainda vão cair e a média do dia a dia. */
export default function ForecastPanel({ invoices, transactions, onLaunch }: Props) {
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const period = invoicePeriodFor(today, readCard())
  const forecast = useMemo(() => forecastFor(transactions, invoices, period), [transactions, invoices, period])
  if (!forecast || forecast.total <= 0) return null
  const rows: [string, string, string][] = [
    ['Já lançado', money(forecast.committed), 'parcelas e gastos que você já registrou'],
    ['Assinaturas que faltam', money(forecast.subsTotal), forecast.missingSubs.length ? forecast.missingSubs.map((s) => s.name).join(', ') : 'nenhuma pendente'],
    ['Dia a dia que ainda deve vir', money(forecast.variable), `média das últimas ${forecast.basedOn} ${forecast.basedOn === 1 ? 'fatura' : 'faturas'}, sem parcelas e assinaturas`],
  ]
  return <Panel tour="dash-forecast" icon="trend-up" title={`Previsão da fatura de ${periodLabel(period)}`} subtitle="Uma estimativa para você se planejar. Não é o valor final do banco.">
    <div className="forecast-total"><b>{money(forecast.total)}</b><span>previstos no fim do mês</span></div>
    <ul className="forecast-rows">{rows.map(([label, value, note]) => <li key={label}><span><b>{label}</b><small>{note}</small></span><b className="num">{value}</b></li>)}</ul>
    {onLaunch && forecast.missingSubs.length > 0 && <div className="button-row"><button className="secondary-button" disabled={busy} onClick={() => { setBusy(true); void onLaunch(period, forecast.missingSubs).finally(() => setBusy(false)) }}><Icon name="repeat" size={16} />Lançar as {forecast.missingSubs.length} {forecast.missingSubs.length === 1 ? 'assinatura' : 'assinaturas'} em {periodLabel(period)}</button></div>}
  </Panel>
}
