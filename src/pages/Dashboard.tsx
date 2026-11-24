import { useMemo } from 'react'
import { Donut, HBarChart, StackedColumns } from '../components/charts'
import { AMBER, GREEN, NEUTRAL_SLICE, RED, SLICE_COLORS, TEAL, withName } from '../components/palette'
import { Icon } from '../components/Icon'
import WatchPanels from '../components/WatchPanels'
import ForecastPanel from '../components/ForecastPanel'
import type { Subscription } from '../lib/watch'
import { EmptyState, Hero, Metric, PageHeading, Panel } from '../components/ui'
import { money, pct, signedMoney } from '../lib/format'
import { categoryToken, personToken, type DrillFilter } from '../lib/drill'
import { shortPeriodLabel } from '../services/installments'
import { useInsightVisible } from '../lib/prefs'
import { summarize } from '../lib/insight'
import { readGoals } from '../lib/goals'
import { compareGroups, groupBy, monthlyTotals, totals, variation } from '../services/stats'
import type { CardFee, Invoice, Transaction } from '../types'
import { feeSplitFor } from '../lib/fee'
import { updateSettings } from '../lib/settings'
import { invoiceOptions } from '../components/InvoiceOptions'
import SettledBar from '../components/SettledBar'
import type { UnifiedDebts } from '../lib/unified'

interface Props {
  invoices: Invoice[]
  transactions: Transaction[]
  focusId: string
  compareId: string
  onFocus: (id: string) => void
  onCompare: (id: string) => void
  onGo: (page: 'invoices' | 'settings' | 'billing') => void
  /** Modo avançado: comparações e gráficos. Desligado, só o essencial. */
  advanced?: boolean
  settled?: Set<string>
  fees?: CardFee[]
  /** Apagar a fatura (só aparece quando ela está quitada). */
  onRemove?: (id: string) => void
  onDrill: (filter: DrillFilter) => void
  canImport: boolean
  onLaunchSubs?: (period: string, subs: Subscription[]) => Promise<void>
  /** Com mais de uma carteira: o que cada um deve somando todas. */
  unified?: UnifiedDebts | null
}

const diffClass = (value: number) => (value > 0.004 ? 'neg' : value < -0.004 ? 'pos' : '')

export default function Dashboard({ invoices, transactions, focusId, compareId, onFocus, onCompare, onGo, onDrill, canImport, onLaunchSubs, advanced = true, settled = new Set(), fees = [], onRemove, unified }: Props) {
  const [showInsight, setShowInsight] = useInsightVisible()
  const personLimits = useMemo(() => Object.fromEntries(readGoals().filter((g) => g.scope === 'person' && !g.category).map((g) => [g.name, g.limit])), [])
  const focus = invoices.find((invoice) => invoice.id === focusId)
  const other = invoices.find((invoice) => invoice.id === compareId)
  const data = useMemo(() => {
    const rowsA = transactions.filter((row) => row.invoice_id === focusId)
    const rowsB = compareId ? transactions.filter((row) => row.invoice_id === compareId) : []
    const people = compareGroups(groupBy(rowsA, 'person'), groupBy(rowsB, 'person'))
    const categories = compareGroups(groupBy(rowsA, 'category'), groupBy(rowsB, 'category'))
    return { a: totals(rowsA), b: totals(rowsB), people, categories, months: monthlyTotals(invoices, transactions) }
  }, [transactions, invoices, focusId, compareId])

  if (!invoices.length) {
    return <>
      <PageHeading title="Visão geral" subtitle="Acompanhe os gastos e pagamentos das suas faturas." />
      <EmptyState title="Vamos começar" actions={<>
        {canImport && <button className="primary-button" onClick={() => onGo('settings')}>Importar minha planilha</button>}
        <button className="secondary-button" onClick={() => onGo('invoices')}>Adicionar uma compra</button>
      </>}>Ainda não há faturas nesta carteira. Você pode trazer a planilha .xlsx que já usa ou cadastrar a primeira compra.</EmptyState>
    </>
  }

  if (!advanced) {
    // Modo simples: o total do mês, quanto falta receber e quem deve, com atalho para cobrar.
    const split = feeSplitFor(focusId, invoices, fees, transactions)
    const owed = new Map(data.people.filter((row) => row.pendingA > 0.004).map((row) => [row.name, Math.round(row.pendingA * 100)]))
    for (const share of split?.shares ?? []) if (!share.paid && share.share > 0) owed.set(share.name, (owed.get(share.name) ?? 0) + Math.round(share.share * 100))
    const debtors = [...owed].map(([name, value]) => ({ name, value: value / 100 })).sort((a, b) => b.value - a.value)
    const toReceive = debtors.reduce((sum, row) => sum + Math.round(row.value * 100), 0) / 100
    return <>
      <PageHeading tour="dash-select" title="Visão geral" subtitle="O resumo do mês e quem ainda deve.">
        <label className="select-group"><span>Fatura</span>
          <select value={focusId} onChange={(event) => onFocus(event.target.value)} aria-label="Fatura">{invoiceOptions(invoices, settled)}</select></label>
      </PageHeading>
      {settled.has(focusId) && onRemove && <SettledBar onRemove={() => onRemove(focusId)} />}
      <section className="metric-grid simple-home">
        <Hero label={focus?.label ?? '—'} total={money(data.a.total)} count={data.a.count} paid={money(data.a.paid)} pending={money(data.a.pending)} paidShare={data.a.total ? data.a.paid / data.a.total : 0} onPending={() => onDrill({ invoiceId: focusId, status: 'pending' })} />
        {unified
          ? <Metric icon="clock" label="Falta receber (todas as carteiras)" value={money(unified.total)} tone={unified.total > 0 ? 'bad' : 'good'} foot={unified.total > 0 ? `${money(toReceive)} nesta carteira · ${unified.people.length} ${unified.people.length === 1 ? 'pessoa deve' : 'pessoas devem'}` : 'Todo mundo em dia'} />
          : <Metric icon="clock" label="Falta receber" value={money(toReceive)} tone={toReceive > 0 ? 'bad' : 'good'} foot={debtors.length ? `${debtors.length} ${debtors.length === 1 ? 'pessoa deve' : 'pessoas devem'}` : 'Todo mundo em dia'} />}
      </section>
      <Panel tour="dash-people" icon="users" title="Quem deve" subtitle={focus?.label}>
        {debtors.length ? <ul className="debtor-list">{debtors.map((row) => <li key={row.name}>
          <span className="avatar">{row.name[0]?.toUpperCase()}</span><b className="grow">{row.name}</b><span className="neg">{money(row.value)}</span>
          <button className="secondary-button" onClick={() => onGo('billing')}>Cobrar</button>
        </li>)}</ul> : <p className="empty">Ninguém deve nada nesta fatura. 🎉</p>}
      </Panel>
      <button className="text-button more-link" onClick={() => updateSettings({ advanced: true })}>Ver gráficos e comparações (modo detalhado)</button>
    </>
  }

  const labelA = focus?.label ?? '—'
  const labelB = other?.label ?? ''
  const change = other ? variation(data.a.total, data.b.total) : null
  const changeTone = change === null ? undefined : change > 0.0005 ? 'bad' : change < -0.0005 ? 'good' : undefined
  const sliceColor = (index: number, name: string) => (name === 'Sem categoria' ? NEUTRAL_SLICE : SLICE_COLORS[index % SLICE_COLORS.length])
  const slices = (key: 'a' | 'b') => data.categories.map((row, i) => ({ name: row.name, value: row[key], color: sliceColor(i, row.name) }))
  const series = [withName(TEAL, labelA), ...(other ? [withName(AMBER, labelB)] : [])]
  const insight = summarize({ label: labelA, total: data.a.total, pending: data.a.pending, count: data.a.count, otherLabel: other ? labelB : undefined, otherTotal: other ? data.b.total : undefined, categories: data.categories })
  const peopleRows = data.people.filter((row) => row.a > 0 || row.b > 0)
  const invoiceOf = (index: number) => (index === 0 ? focusId : compareId)

  return <>
    <PageHeading tour="dash-select" title="Visão geral" subtitle="Compare dois meses e acompanhe o que já foi pago.">
      <label className="select-group"><span>Mês foco</span>
        <select value={focusId} onChange={(event) => onFocus(event.target.value)}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>
      <label className="select-group"><span>Comparar com</span>
        <select value={compareId} onChange={(event) => onCompare(event.target.value)}><option value="">Sem comparação</option>{invoices.filter((invoice) => invoice.id !== focusId).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>
    </PageHeading>
    {settled.has(focusId) && onRemove && <SettledBar onRemove={() => onRemove(focusId)} />}

    <section className="metric-grid">
      <Hero label={labelA} total={money(data.a.total)} count={data.a.count} paid={money(data.a.paid)} pending={money(data.a.pending)} paidShare={data.a.total ? data.a.paid / data.a.total : 0} onPending={() => onDrill({ invoiceId: focusId, status: 'pending' })}
        badge={change === null ? undefined : { text: `${change > 0 ? '+' : ''}${pct(change)} vs ${shortPeriodLabel(other!.period)}`, tone: changeTone === 'bad' ? 'bad' : changeTone === 'good' ? 'good' : 'flat', trend: change > 0 ? 'trend-up' : 'trend-down' }} />
      <Metric icon="receipt" label={other ? `Total · ${labelB}` : 'Comparação'} value={other ? money(data.b.total) : '—'} foot={other ? `${data.b.count} lançamentos` : 'Escolha um mês para comparar'} />
      <Metric icon={change !== null && change < 0 ? 'trend-down' : 'trend-up'} label="Diferença entre os meses" value={other ? signedMoney(data.a.total - data.b.total) : '—'} tone={changeTone} foot={change === null ? undefined : `${change > 0 ? '+' : ''}${pct(change)} em relação a ${shortPeriodLabel(other!.period)}`} />
    </section>
    {unified && unified.total > 0 && <p className="unified-strip"><Icon name="wallet" size={16} /><span>Falta receber em todas as carteiras: <b>{money(unified.total)}</b> de {unified.people.length} {unified.people.length === 1 ? 'pessoa' : 'pessoas'}</span><button className="text-button" onClick={() => onGo('billing')}>Ver cobrança</button></p>}
    {showInsight && <p className="insight" data-tour="dash-insight"><Icon name="sparkle" size={16} /><span>{insight}</span><button className="insight-x" aria-label="Ocultar o resumo" title="Ocultar (volta em Dados > Aparência)" onClick={() => setShowInsight(false)}>×</button></p>}

    <ForecastPanel invoices={invoices} transactions={transactions} onLaunch={onLaunchSubs} />
    <WatchPanels invoices={invoices} transactions={transactions} focusId={focusId} onDrill={onDrill} />

    <div className="panel-grid">
      <Panel tour="dash-people" icon="users" title="Gasto por responsável" subtitle={other ? `${labelA} x ${labelB}` : labelA}>
        <HBarChart rows={peopleRows.map((row) => ({ label: row.name, values: other ? [row.a, row.b] : [row.a] }))} series={series} limits={personLimits} onPick={(name, index) => onDrill({ invoiceId: invoiceOf(index), person: personToken(name) })} />
      </Panel>
      <Panel icon="pie" title="Categorias" subtitle={labelA}><Donut slices={slices('a')} centerLabel="Total" onPick={(name) => onDrill({ invoiceId: focusId, category: categoryToken(name) })} /></Panel>
    </div>

    <div className="panel-grid">
      <Panel icon="clock" title="Situação dos pagamentos" subtitle={`${labelA}: pago x pendente por responsável`}>
        <HBarChart stacked rows={data.people.filter((row) => row.a > 0).map((row) => ({ label: row.name, values: [row.a - row.pendingA, row.pendingA] }))} series={[withName(GREEN, 'Pago'), withName(RED, 'Pendente')]} onPick={(name, index) => onDrill({ invoiceId: focusId, person: personToken(name), status: index === 0 ? 'paid' : 'pending' })} />
      </Panel>
      <Panel icon="pie" title={other ? 'Categorias' : 'Categorias no mês comparado'} subtitle={other ? labelB : 'Escolha um mês para comparar'}>
        {other ? <Donut slices={slices('b')} centerLabel="Total" onPick={(name) => onDrill({ invoiceId: compareId, category: categoryToken(name) })} /> : <p className="empty">Selecione “Comparar com” para ver este gráfico.</p>}
      </Panel>
    </div>

    <Panel tour="dash-months" icon="dashboard" title="Fatura mês a mês" subtitle="Pago e pendente em cada fatura, com o total no topo">
      <StackedColumns items={data.months.map((month) => ({ id: month.id, label: shortPeriodLabel(month.period), paid: month.paid, pending: month.pending }))} onPick={(id, part) => onDrill({ invoiceId: id, status: part === 'all' ? undefined : part })} />
    </Panel>

    <div className="panel-grid wide">
      <Panel icon="users" title="Por responsável">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Responsável</th><th className="num">{labelA}</th><th className="num">{labelB || '—'}</th><th className="num">Variação</th><th className="num">Pago</th><th className="num">Pendente</th><th className="num">% do mês</th></tr></thead>
          <tbody>{peopleRows.map((row) => <tr key={row.name} className="row-link" onClick={() => onDrill({ invoiceId: focusId, person: personToken(row.name) })}><td><b>{row.name}</b></td><td className="num">{money(row.a)}</td><td className="num">{other ? money(row.b) : '—'}</td><td className={`num ${other ? diffClass(row.diff) : ''}`}>{other ? signedMoney(row.diff) : '—'}</td><td className="num">{money(row.paidA)}</td><td className="num">{money(row.pendingA)}</td><td className="num">{data.a.total ? pct(row.a / data.a.total) : '—'}</td></tr>)}
            <tr className="total-row"><td>Total</td><td className="num">{money(data.a.total)}</td><td className="num">{other ? money(data.b.total) : '—'}</td><td className={`num ${other ? diffClass(data.a.total - data.b.total) : ''}`}>{other ? signedMoney(data.a.total - data.b.total) : '—'}</td><td className="num">{money(data.a.paid)}</td><td className="num">{money(data.a.pending)}</td><td className="num">{data.a.total ? '100,0%' : '—'}</td></tr></tbody></table></div>
      </Panel>
      <Panel icon="tag" title="Por categoria">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Categoria</th><th className="num">{labelA}</th><th className="num">{labelB || '—'}</th><th className="num">Variação</th></tr></thead>
          <tbody>{data.categories.filter((row) => row.a > 0 || row.b > 0).map((row) => <tr key={row.name} className="row-link" onClick={() => onDrill({ invoiceId: focusId, category: categoryToken(row.name) })}><td><b>{row.name}</b></td><td className="num">{money(row.a)}</td><td className="num">{other ? money(row.b) : '—'}</td><td className={`num ${other ? diffClass(row.diff) : ''}`}>{other ? signedMoney(row.diff) : '—'}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  </>
}
