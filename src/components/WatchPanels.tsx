import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Panel } from './ui'
import { money } from '../lib/format'
import { shortPeriodLabel as shortPeriod } from '../services/installments'
import { detectRadar, detectSubscriptions } from '../lib/watch'
import type { DrillFilter } from '../lib/drill'
import { categoryToken } from '../lib/drill'
import type { Invoice, Transaction } from '../types'

const STORE = 'oc:radar-off'
const readOff = (): string[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[] } catch { return [] } }
const writeOff = (list: string[]) => { try { localStorage.setItem(STORE, JSON.stringify(list.slice(-200))) } catch { /* vale até recarregar */ } }

interface Props { invoices: Invoice[]; transactions: Transaction[]; focusId: string; onDrill: (filter: DrillFilter) => void }

/** Radar (o que merece um olhar neste mês) e assinaturas (custo fixo que se repete). */
export default function WatchPanels({ invoices, transactions, focusId, onDrill }: Props) {
  const [off, setOff] = useState<string[]>(readOff)
  const radar = useMemo(() => detectRadar(transactions, invoices, focusId).filter((item) => !off.includes(item.id)), [transactions, invoices, focusId, off])
  const subs = useMemo(() => detectSubscriptions(transactions, invoices), [transactions, invoices])
  const active = subs.filter((sub) => sub.active)
  const fixed = active.reduce((sum, sub) => sum + Math.round(sub.lastAmount * 100), 0) / 100
  const stopped = subs.filter((sub) => sub.stopped)

  function dismiss(id: string) { const next = [...off, id]; setOff(next); writeOff(next) }

  return <div className="panel-grid">
    <Panel tour="dash-radar" icon="shield" title="Radar do mês" subtitle={radar.length ? `${radar.length} ${radar.length === 1 ? 'coisa merece' : 'coisas merecem'} um olhar` : 'Nada estranho neste mês'}>
      {!radar.length ? <p className="empty">Sem cobranças repetidas, valores fora do padrão ou categorias disparadas. Se algo aparecer, aviso aqui.</p> :
        <ul className="radar-list">{radar.map((item) => <li key={item.id} className={`radar-item ${item.kind}`}>
          <div><b>{item.title}</b><p>{item.detail}</p></div>
          <div className="radar-actions">
            <button className="text-button" onClick={() => onDrill({ invoiceId: item.invoiceId, query: item.query, category: item.category ? categoryToken(item.category) : undefined })}>Ver</button>
            <button className="text-button" onClick={() => dismiss(item.id)} aria-label={`Ignorar o alerta: ${item.title}`}>Ignorar</button></div></li>)}</ul>}
    </Panel>
    <Panel tour="dash-subs" icon="repeat" title="Assinaturas e custos fixos" subtitle={active.length ? `${active.length} ativas · ${money(fixed)} por mês` : 'O que se repete todo mês'}>
      {!subs.length ? <p className="empty">Ainda não achei nada que se repita todo mês. Com 3 faturas importadas, eu descubro sozinho (Netflix, academia, plano de celular…).</p> : <>
        <ul className="subs-list">{subs.slice(0, 8).map((sub) => <li key={sub.key} className={sub.active ? '' : 'off'}>
          <span className="grow"><b>{sub.name}</b><small>{sub.certain ? `${sub.months} meses seguidos` : 'provável, 2 meses iguais'}{!sub.active ? ` · última em ${shortPeriod(sub.lastPeriod)}` : ''}</small></span>
          <span className="subs-amount">{money(sub.lastAmount)}{sub.priceUp && sub.previousAmount !== null && <small className="neg">subiu de {money(sub.previousAmount)}</small>}</span></li>)}</ul>
        {stopped.length > 0 && <p className="hint"><Icon name="check" size={14} /> {stopped.map((sub) => sub.name).join(', ')} {stopped.length === 1 ? 'parou' : 'pararam'} de ser cobrada{stopped.length === 1 ? '' : 's'}. Se foi cancelamento, economia garantida.</p>}
        {subs.length > 8 && <p className="hint">E mais {subs.length - 8} cobranças recorrentes.</p>}</>}
    </Panel>
  </div>
}
