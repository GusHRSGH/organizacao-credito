import { useMemo } from 'react'
import { Donut, HBarChart, StackedColumns } from '../components/charts'
import { AMBER, GREEN, NEUTRAL_SLICE, RED, SLICE_COLORS, TEAL, withName } from '../components/palette'
import { EmptyState, Hero, Metric, PageHeading, Panel } from '../components/ui'
import { money, pct, signedMoney } from '../lib/format'
import { shortPeriodLabel } from '../services/installments'
import { compareGroups, groupBy, monthlyTotals, totals, variation } from '../services/stats'
import type { Invoice, Transaction } from '../types'

interface Props {
  invoices: Invoice[]
  transactions: Transaction[]
  focusId: string
  compareId: string
  onFocus: (id: string) => void
  onCompare: (id: string) => void
  onGo: (page: 'invoices' | 'settings') => void
  canImport: boolean
}

const diffClass = (value: number) => (value > 0.004 ? 'neg' : value < -0.004 ? 'pos' : '')

export default function Dashboard({ invoices, transactions, focusId, compareId, onFocus, onCompare, onGo, canImport }: Props) {
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
      </>}>Ainda não há faturas neste banco de dados. Você pode trazer a planilha .xlsx que já usa ou cadastrar a primeira compra.</EmptyState>
    </>
  }

  const labelA = focus?.label ?? '—'
  const labelB = other?.label ?? ''
  const change = other ? variation(data.a.total, data.b.total) : null
  const changeTone = change === null ? undefined : change > 0.0005 ? 'bad' : change < -0.0005 ? 'good' : undefined
  const sliceColor = (index: number, name: string) => (name === 'Sem categoria' ? NEUTRAL_SLICE : SLICE_COLORS[index % SLICE_COLORS.length])
  const slices = (key: 'a' | 'b') => data.categories.map((row, i) => ({ name: row.name, value: row[key], color: sliceColor(i, row.name) }))
  const series = [withName(TEAL, labelA), ...(other ? [withName(AMBER, labelB)] : [])]
  const peopleRows = data.people.filter((row) => row.a > 0 || row.b > 0)

  return <>
    <PageHeading title="Visão geral" subtitle="Compare dois meses e acompanhe o que já foi pago.">
      <label className="select-group"><span>Mês foco</span>
        <select value={focusId} onChange={(event) => onFocus(event.target.value)}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>
      <label className="select-group"><span>Comparar com</span>
        <select value={compareId} onChange={(event) => onCompare(event.target.value)}><option value="">Sem comparação</option>{invoices.filter((invoice) => invoice.id !== focusId).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>
    </PageHeading>

    <section className="metric-grid">
      <Hero label={labelA} total={money(data.a.total)} count={data.a.count} paid={money(data.a.paid)} pending={money(data.a.pending)} paidShare={data.a.total ? data.a.paid / data.a.total : 0}
        badge={change === null ? undefined : { text: `${change > 0 ? '+' : ''}${pct(change)} vs ${shortPeriodLabel(other!.period)}`, tone: changeTone === 'bad' ? 'bad' : changeTone === 'good' ? 'good' : 'flat', trend: change > 0 ? 'trend-up' : 'trend-down' }} />
      <Metric icon="receipt" label={other ? `Total · ${labelB}` : 'Comparação'} value={other ? money(data.b.total) : '—'} foot={other ? `${data.b.count} lançamentos` : 'Escolha um mês para comparar'} />
      <Metric icon={change !== null && change < 0 ? 'trend-down' : 'trend-up'} label="Diferença entre os meses" value={other ? signedMoney(data.a.total - data.b.total) : '—'} tone={changeTone} foot={change === null ? undefined : `${change > 0 ? '+' : ''}${pct(change)} em relação a ${shortPeriodLabel(other!.period)}`} />
    </section>

    <div className="panel-grid">
      <Panel icon="users" title="Gasto por responsável" subtitle={other ? `${labelA} x ${labelB}` : labelA}>
        <HBarChart rows={peopleRows.map((row) => ({ label: row.name, values: other ? [row.a, row.b] : [row.a] }))} series={series} />
      </Panel>
      <Panel icon="pie" title="Categorias" subtitle={labelA}><Donut slices={slices('a')} centerLabel="Total" /></Panel>
    </div>

    <div className="panel-grid">
      <Panel icon="clock" title="Situação dos pagamentos" subtitle={`${labelA}: pago x pendente por responsável`}>
        <HBarChart stacked rows={data.people.filter((row) => row.a > 0).map((row) => ({ label: row.name, values: [row.a - row.pendingA, row.pendingA] }))} series={[withName(GREEN, 'Pago'), withName(RED, 'Pendente')]} />
      </Panel>
      <Panel icon="pie" title={other ? 'Categorias' : 'Categorias no mês comparado'} subtitle={other ? labelB : 'Escolha um mês para comparar'}>
        {other ? <Donut slices={slices('b')} centerLabel="Total" /> : <p className="empty">Selecione “Comparar com” para ver este gráfico.</p>}
      </Panel>
    </div>

    <Panel icon="dashboard" title="Fatura mês a mês" subtitle="Pago e pendente em cada fatura, com o total no topo">
      <StackedColumns items={data.months.map((month) => ({ label: shortPeriodLabel(month.period), paid: month.paid, pending: month.pending }))} />
    </Panel>

    <div className="panel-grid wide">
      <Panel icon="users" title="Por responsável">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Responsável</th><th className="num">{labelA}</th><th className="num">{labelB || '—'}</th><th className="num">Variação</th><th className="num">Pago</th><th className="num">Pendente</th><th className="num">% do mês</th></tr></thead>
          <tbody>{peopleRows.map((row) => <tr key={row.name}><td><b>{row.name}</b></td><td className="num">{money(row.a)}</td><td className="num">{other ? money(row.b) : '—'}</td><td className={`num ${other ? diffClass(row.diff) : ''}`}>{other ? signedMoney(row.diff) : '—'}</td><td className="num">{money(row.paidA)}</td><td className="num">{money(row.pendingA)}</td><td className="num">{data.a.total ? pct(row.a / data.a.total) : '—'}</td></tr>)}
            <tr className="total-row"><td>Total</td><td className="num">{money(data.a.total)}</td><td className="num">{other ? money(data.b.total) : '—'}</td><td className={`num ${other ? diffClass(data.a.total - data.b.total) : ''}`}>{other ? signedMoney(data.a.total - data.b.total) : '—'}</td><td className="num">{money(data.a.paid)}</td><td className="num">{money(data.a.pending)}</td><td className="num">{data.a.total ? '100,0%' : '—'}</td></tr></tbody></table></div>
      </Panel>
      <Panel icon="tag" title="Por categoria">
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Categoria</th><th className="num">{labelA}</th><th className="num">{labelB || '—'}</th><th className="num">Variação</th></tr></thead>
          <tbody>{data.categories.filter((row) => row.a > 0 || row.b > 0).map((row) => <tr key={row.name}><td><b>{row.name}</b></td><td className="num">{money(row.a)}</td><td className="num">{other ? money(row.b) : '—'}</td><td className={`num ${other ? diffClass(row.diff) : ''}`}>{other ? signedMoney(row.diff) : '—'}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  </>
}
