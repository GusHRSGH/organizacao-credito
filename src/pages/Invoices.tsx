import { Icon } from '../components/Icon'
import { useMemo, useState, type FormEvent } from 'react'
import { Metric, PageHeading, Panel, TransactionTable, type Sort, type SortKey } from '../components/ui'
import { messageOf, money, pct } from '../lib/format'
import { addMonthsToPeriod, currentPeriod, periodLabel } from '../services/installments'
import { totals } from '../services/stats'
import type { DataSource, Invoice, Transaction } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function Invoices({ source, invoices, transactions, invoiceId, onInvoice, onChanged, notify }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [showForm, setShowForm] = useState(false)
  const [newPeriod, setNewPeriod] = useState('')

  const rows = useMemo(() => transactions.filter((row) => row.invoice_id === invoiceId), [transactions, invoiceId])
  const people = useMemo(() => [...new Set(transactions.map((row) => row.person?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const categories = useMemo(() => [...new Set(transactions.map((row) => row.category?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const summary = totals(rows)

  const visible = useMemo(() => {
    const text = query.toLocaleLowerCase('pt-BR')
    const filtered = rows.filter((row) =>
      (!text || `${row.description} ${row.person?.name ?? ''} ${row.category?.name ?? ''}`.toLocaleLowerCase('pt-BR').includes(text)) &&
      (!status || row.status === status) && (!person || row.person?.name === person) && (!category || row.category?.name === category))
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'amount') return (Number(a.amount) - Number(b.amount)) * sign
      if (sort.key === 'person') return (a.person?.name ?? '').localeCompare(b.person?.name ?? '', 'pt-BR') * sign || b.occurred_on.localeCompare(a.occurred_on)
      return a.occurred_on.localeCompare(b.occurred_on) * sign
    })
  }, [rows, query, status, person, category, sort])
  const pendingVisible = visible.filter((row) => row.status === 'pending')
  const visibleSum = visible.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try { await action(); await onChanged(); if (success) notify('notice', success) } catch (cause) { notify('error', messageOf(cause)) }
  }

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'amount' || key === 'date' ? 'desc' : 'asc' })
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const count = Number(data.get('installments'))
    await run(async () => {
      await source.createPurchase({
        invoiceId: String(data.get('invoice') ?? invoiceId), occurredOn: String(data.get('date')), description: String(data.get('description')),
        amount: Number(data.get('amount')), personName: String(data.get('person')), categoryName: String(data.get('category')), installmentCount: count,
      })
      form.reset(); setShowForm(false)
    }, count > 1 ? `Compra registrada em ${count} parcelas.` : 'Lançamento salvo.')
  }

  async function addInvoice() {
    const period = newPeriod ? `${newPeriod}-01` : addMonthsToPeriod(invoices[0]?.period ?? currentPeriod(), invoices.length ? 1 : 0)
    await run(async () => { await source.createInvoice(period) }, `Fatura de ${periodLabel(period)} criada.`)
    setNewPeriod('')
  }

  const markVisiblePaid = () => {
    if (!window.confirm(`Marcar ${pendingVisible.length} lançamentos visíveis (${money(pendingVisible.reduce((s, r) => s + Number(r.amount), 0))}) como pagos?`)) return
    void run(() => source.setStatusMany(pendingVisible.map((row) => row.id), 'paid'), 'Lançamentos marcados como pagos.')
  }

  return <>
    <PageHeading title="Faturas e lançamentos" subtitle="Cadastre compras, acompanhe pagamentos e filtre os lançamentos.">
      <label className="select-group"><span>Fatura</span>
        <select value={invoiceId} onChange={(event) => onInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>) : <option value="">Nenhuma fatura</option>}</select></label>
      <button className="primary-button" onClick={() => setShowForm(!showForm)}><Icon name="plus" size={16} />Novo lançamento</button>
    </PageHeading>

    {showForm && <Panel title="Nova compra" action={<button className="text-button" onClick={() => setShowForm(false)}>Fechar</button>}>
      <form className="entry-form" onSubmit={(event) => void saveEntry(event)}>
        <label>Descrição<input name="description" maxLength={160} required /></label>
        <label>Valor total (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Data da compra<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Responsável<input name="person" maxLength={80} list="people-list" required placeholder="Quem vai pagar" /></label>
        <label>Categoria<input name="category" maxLength={60} list="categories-list" required /></label>
        <label>Parcelas<select name="installments">{Array.from({ length: 48 }, (_, i) => <option key={i + 1} value={i + 1}>{i === 0 ? 'À vista' : `${i + 1} parcelas`}</option>)}</select></label>
        {source.kind === 'local' && invoices.length > 0 && <label>1ª parcela na fatura<select name="invoice" defaultValue={invoiceId}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>}
        <button className="primary-button">Salvar compra</button>
        <datalist id="people-list">{people.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id="categories-list">{categories.map((name) => <option key={name} value={name} />)}</datalist>
      </form>
      <p className="hint">O valor informado é o total da compra: ele é dividido em parcelas mensais iguais e a diferença de centavos fica na última. As faturas dos meses seguintes são criadas automaticamente.</p>
    </Panel>}

    <section className="metric-grid">
      <Metric label="Total da fatura" value={money(summary.total)} foot={`${summary.count} lançamentos`} />
      <Metric label="Já pago" value={money(summary.paid)} foot={`${summary.total ? pct(summary.paid / summary.total) : '0,0%'} do total`} />
      <Metric label="Pendente" value={money(summary.pending)} tone="warning" />
      <article className="metric-card"><div className="metric-label">Nova fatura</div><div className="inline-form"><input type="month" value={newPeriod} onChange={(event) => setNewPeriod(event.target.value)} aria-label="Mês da nova fatura" /><button className="secondary-button" onClick={() => void addInvoice()}>Criar</button></div><div className="metric-foot">Sem mês, cria o seguinte à última.</div></article>
    </section>

    <div className="toolbar">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" />
      <select value={person} onChange={(event) => setPerson(event.target.value)} aria-label="Responsável"><option value="">Todos os responsáveis</option>{people.map((name) => <option key={name}>{name}</option>)}</select>
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{categories.map((name) => <option key={name}>{name}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="">Todos os status</option><option value="paid">Pago</option><option value="pending">Não pago</option></select>
      {pendingVisible.length > 0 && (person || category || query || status) && <button className="secondary-button" onClick={markVisiblePaid}>Marcar {pendingVisible.length} como pagos</button>}
      <span className="count-pill">{visible.length} lançamentos · {money(visibleSum)}</span>
    </div>

    <section className="panel">
      <TransactionTable rows={visible} busy={false} sort={sort} onSort={toggleSort}
        onToggle={(row) => void run(() => source.setTransactionStatus(row.id, row.status === 'paid' ? 'pending' : 'paid'))}
        onDelete={(row) => { if (window.confirm('Excluir este lançamento?')) void run(() => source.removeTransaction(row.id)) }} />
    </section>
  </>
}
