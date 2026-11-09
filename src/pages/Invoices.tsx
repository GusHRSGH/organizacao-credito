import { Icon } from '../components/Icon'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import QuickAdd from '../components/QuickAdd'
import PasteBill from '../components/PasteBill'
import { addFilter, isActive, readFilters, removeFilter, suggestName, writeFilters, type SavedFilter } from '../lib/savedFilters'
import EditDialog from '../components/EditDialog'
import { buildSuggestions, knownDescriptions, suggestFor } from '../lib/suggest'
import type { LocalSource } from '../services/localSource'
import { NO_CATEGORY, NO_PERSON, type DrillFilter } from '../lib/drill'
import { Hero, PageHeading, Panel, TransactionTable, type Sort, type SortKey } from '../components/ui'
import { messageOf, money } from '../lib/format'
import { addMonthsToPeriod, currentPeriod, periodLabel } from '../services/installments'
import { totals } from '../services/stats'
import type { DataSource, Invoice, Transaction, TransactionRow } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
  local: LocalSource | null
  quickSignal: number
  drill: { filter: DrillFilter; nonce: number } | null
}

export default function Invoices({ source, invoices, transactions, invoiceId, onInvoice, onChanged, notify, local, quickSignal, drill }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [showForm, setShowForm] = useState(false)
  const [newPeriod, setNewPeriod] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [undo, setUndo] = useState<{ rows: TransactionRow[]; text: string } | null>(null)
  const [bulkPerson, setBulkPerson] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const descriptionField = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedFilter[]>(readFilters)
  const [naming, setNaming] = useState<string | null>(null)

  useEffect(() => {
    if (!drill) return
    setPerson(drill.filter.person ?? ''); setCategory(drill.filter.category ?? ''); setStatus(drill.filter.status ?? ''); setQuery(drill.filter.query ?? ''); setSelected(new Set())
  }, [drill])

  const rows = useMemo(() => transactions.filter((row) => row.invoice_id === invoiceId), [transactions, invoiceId])
  const people = useMemo(() => [...new Set(transactions.map((row) => row.person?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const categories = useMemo(() => [...new Set(transactions.map((row) => row.category?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const suggestions = useMemo(() => buildSuggestions(transactions), [transactions])
  const descriptions = useMemo(() => knownDescriptions(transactions), [transactions])
  const summary = totals(rows)

  const visible = useMemo(() => {
    const text = query.toLocaleLowerCase('pt-BR')
    const filtered = rows.filter((row) =>
      (!text || `${row.description} ${row.person?.name ?? ''} ${row.category?.name ?? ''}`.toLocaleLowerCase('pt-BR').includes(text)) &&
      (!status || row.status === status) && (!person || (person === NO_PERSON ? !row.person : row.person?.name === person)) && (!category || (category === NO_CATEGORY ? !row.category : row.category?.name === category)))
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'amount') return (Number(a.amount) - Number(b.amount)) * sign
      if (sort.key === 'person') return (a.person?.name ?? '').localeCompare(b.person?.name ?? '', 'pt-BR') * sign || b.occurred_on.localeCompare(a.occurred_on)
      return a.occurred_on.localeCompare(b.occurred_on) * sign
    })
  }, [rows, query, status, person, category, sort])
  const chosen = visible.filter((row) => selected.has(row.id))
  const pendingVisible = visible.filter((row) => row.status === 'pending')
  const visibleSum = visible.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try { await action(); await onChanged(); if (success) notify('notice', success) } catch (cause) { notify('error', messageOf(cause)) }
  }

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 9000)
    return () => clearTimeout(timer)
  }, [undo])

  const toggleSelect = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const selectAll = (all: boolean) => setSelected(all ? new Set(visible.map((row) => row.id)) : new Set())

  async function removeWithUndo(ids: string[], text: string) {
    if (!local) { for (const id of ids) await source.removeTransaction(id); return }
    const rows = await local.removeTransactions(ids)
    setSelected(new Set())
    setUndo({ rows, text })
  }

  async function undoRemoval() {
    if (!undo || !local) return
    const { rows } = undo
    setUndo(null)
    await run(() => local.restoreTransactions(rows), 'Exclusão desfeita.')
  }

  async function applyBulk(action: 'paid' | 'pending' | 'person' | 'category' | 'delete') {
    const ids = chosen.map((row) => row.id)
    if (!ids.length) return
    if (action === 'paid' || action === 'pending') { await run(() => source.setStatusMany(ids, action), action === 'paid' ? 'Marcados como pagos.' : 'Marcados como não pagos.'); return }
    if (!local) return
    if (action === 'person') { if (!bulkPerson.trim()) return; await run(() => local.updateMany(ids, { personName: bulkPerson }), 'Responsável atualizado.'); setBulkPerson(''); return }
    if (action === 'category') { if (!bulkCategory.trim()) return; await run(() => local.updateMany(ids, { categoryName: bulkCategory }), 'Categoria atualizada.'); setBulkCategory(''); return }
    await run(() => removeWithUndo(ids, `${ids.length} lançamentos excluídos.`))
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
      const keep = { date: String(data.get('date')), person: String(data.get('person')), category: String(data.get('category')), installments: String(count) }
      form.reset()
      for (const [name, value] of Object.entries({ date: keep.date, person: keep.person, category: keep.category, installments: keep.installments })) { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value }
      descriptionField.current?.focus()
    }, count > 1 ? `Compra registrada em ${count} parcelas.` : 'Lançamento salvo.')
  }

  function fillFromHistory(event: { currentTarget: HTMLInputElement }) {
    const form = event.currentTarget.form
    const hint = suggestFor(event.currentTarget.value, suggestions)
    if (!form || !hint) return
    for (const [name, value] of [['person', hint.person], ['category', hint.category]] as const) {
      const field = form.elements.namedItem(name)
      if (field instanceof HTMLInputElement && !field.value && value) field.value = value
    }
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
    <PageHeading tour="inv-top" title="Faturas e lançamentos" subtitle="Cadastre compras, acompanhe pagamentos e filtre os lançamentos.">
      <label className="select-group"><span>Fatura</span>
        <select value={invoiceId} onChange={(event) => onInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>) : <option value="">Nenhuma fatura</option>}</select></label>
      {local && <button className="secondary-button" onClick={() => setShowPaste(!showPaste)}><Icon name="upload" size={16} />Colar fatura</button>}
      <button className="secondary-button" onClick={() => setShowForm(!showForm)}><Icon name="plus" size={16} />Formulário completo</button>
    </PageHeading>

    <QuickAdd source={source} invoice={invoices.find((invoice) => invoice.id === invoiceId)} people={people} categories={categories} suggestions={suggestions} signal={quickSignal} onSaved={onChanged} notify={notify} />
    {showPaste && local && <PasteBill local={local} people={people} categories={categories} suggestions={suggestions} onClose={() => setShowPaste(false)} onDone={onChanged} notify={notify} />}

    {showForm && <Panel icon="plus" title="Nova compra (o formulário continua aberto para o próximo lançamento)" action={<button className="text-button" onClick={() => setShowForm(false)}>Fechar</button>}>
      <form className="entry-form" onSubmit={(event) => void saveEntry(event)}>
        <label>Descrição<input ref={descriptionField} name="description" maxLength={160} required list="descriptions-list" autoComplete="off" onBlur={fillFromHistory} /></label>
        <label>Valor total (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Data da compra<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Responsável<input name="person" maxLength={80} list="people-list" required placeholder="Quem vai pagar" /></label>
        <label>Categoria<input name="category" maxLength={60} list="categories-list" required /></label>
        <label>Parcelas<select name="installments">{Array.from({ length: 48 }, (_, i) => <option key={i + 1} value={i + 1}>{i === 0 ? 'À vista' : `${i + 1} parcelas`}</option>)}</select></label>
        {source.kind === 'local' && invoices.length > 0 && <label>1ª parcela na fatura<select name="invoice" defaultValue={invoiceId}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label>}
        <button className="primary-button">Salvar compra</button>
        <datalist id="descriptions-list">{descriptions.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id="people-list">{people.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id="categories-list">{categories.map((name) => <option key={name} value={name} />)}</datalist>
      </form>
      <p className="hint">O valor informado é o total da compra: ele é dividido em parcelas mensais iguais e a diferença de centavos fica na última. As faturas dos meses seguintes são criadas automaticamente.</p>
    </Panel>}

    <section className="metric-grid">
      <Hero label={invoices.find((invoice) => invoice.id === invoiceId)?.label ?? 'Fatura'} total={money(summary.total)} count={summary.count} paid={money(summary.paid)} pending={money(summary.pending)} paidShare={summary.total ? summary.paid / summary.total : 0} />
      <article className="metric-card new-invoice"><div className="metric-label">Nova fatura</div><div className="inline-form"><input type="month" value={newPeriod} onChange={(event) => setNewPeriod(event.target.value)} aria-label="Mês da nova fatura" /><button className="secondary-button" onClick={() => void addInvoice()}>Criar</button></div><div className="metric-foot">Sem mês, cria o seguinte à última.</div></article>
    </section>

    {saved.length > 0 && <div className="saved-filters" role="group" aria-label="Filtros salvos"><span className="saved-label">Filtros salvos</span>
      {saved.map((item) => <span key={item.id} className="saved-chip">
        <button onClick={() => { setPerson(item.person); setCategory(item.category); setStatus(item.status); setQuery(item.query); setSelected(new Set()) }}>{item.name}</button>
        <button className="saved-x" aria-label={`Remover o filtro ${item.name}`} onClick={() => { const next = removeFilter(saved, item.id); setSaved(next); writeFilters(next) }}>×</button></span>)}
    </div>}
    <div className="toolbar" data-tour="filters">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" />
      <select value={person} onChange={(event) => setPerson(event.target.value)} aria-label="Responsável"><option value="">Todos os responsáveis</option>{people.map((name) => <option key={name}>{name}</option>)}{rows.some((row) => !row.person) && <option value={NO_PERSON}>Sem responsável</option>}</select>
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{categories.map((name) => <option key={name}>{name}</option>)}{rows.some((row) => !row.category) && <option value={NO_CATEGORY}>Sem categoria</option>}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="">Todos os status</option><option value="paid">Pago</option><option value="pending">Pendente</option></select>
      {pendingVisible.length > 0 && (person || category || query || status) && <button className="secondary-button" onClick={markVisiblePaid}>Marcar {pendingVisible.length} como pagos</button>}
      <span className="count-pill">{visible.length} lançamentos · {money(visibleSum)}</span>
      {isActive({ person, category, status, query }) && naming === null && <button className="secondary-button" onClick={() => setNaming(suggestName({ person, category, status, query }))}><Icon name="tag" size={16} />Salvar este filtro</button>}
    </div>
    {naming !== null && <form className="saved-form" onSubmit={(event) => { event.preventDefault(); const next = addFilter(saved, naming, { person, category, status, query }, crypto.randomUUID()); setSaved(next); writeFilters(next); setNaming(null); notify('notice', `Filtro “${naming.trim()}” salvo.`) }}>
      <input value={naming} onChange={(event) => setNaming(event.target.value)} maxLength={40} aria-label="Nome do filtro" autoFocus placeholder="Nome do filtro" />
      <button className="primary-button" disabled={!naming.trim()}>Salvar</button><button type="button" className="text-button" onClick={() => setNaming(null)}>Cancelar</button></form>}

    {(person || category || status) && <div className="filter-chip" role="status">
      <span>Mostrando: <b>{[person === NO_PERSON ? 'Sem responsável' : person, category === NO_CATEGORY ? 'Sem categoria' : category, status === 'pending' ? 'Pendentes' : status === 'paid' ? 'Pagos' : ''].filter(Boolean).join(' · ')}</b></span>
      <button className="text-button" onClick={() => { setPerson(''); setCategory(''); setStatus(''); setQuery('') }}>Limpar filtros</button></div>}

    {local && chosen.length > 0 && <div className="bulk-bar" role="region" aria-label="Ações em lote">
      <b>{chosen.length} selecionados · {money(chosen.reduce((sum, row) => sum + Number(row.amount), 0))}</b>
      <button className="secondary-button" onClick={() => void applyBulk('paid')}>Marcar pagos</button>
      <button className="secondary-button" onClick={() => void applyBulk('pending')}>Marcar não pagos</button>
      <span className="bulk-field"><input value={bulkPerson} onChange={(event) => setBulkPerson(event.target.value)} list="bulk-people" placeholder="Novo responsável" /><button className="secondary-button" disabled={!bulkPerson.trim()} onClick={() => void applyBulk('person')}>Aplicar</button></span>
      <span className="bulk-field"><input value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} list="bulk-categories" placeholder="Nova categoria" /><button className="secondary-button" disabled={!bulkCategory.trim()} onClick={() => void applyBulk('category')}>Aplicar</button></span>
      <button className="secondary-button danger" onClick={() => void applyBulk('delete')}>Excluir</button>
      <button className="text-button" onClick={() => setSelected(new Set())}>Limpar seleção</button>
      <datalist id="bulk-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="bulk-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
    </div>}

    <section className="panel" data-tour="tx-list">
      <TransactionTable rows={visible} busy={false} sort={sort} onSort={toggleSort}
        onToggle={(row) => void run(() => source.setTransactionStatus(row.id, row.status === 'paid' ? 'pending' : 'paid'))}
        selected={local ? selected : undefined} onSelect={toggleSelect} onSelectAll={selectAll} onEdit={local ? setEditing : undefined}
        onDelete={(row) => { if (local) void run(() => removeWithUndo([row.id], `Excluído: ${row.description}.`)); else if (window.confirm('Excluir este lançamento?')) void run(() => source.removeTransaction(row.id)) }} />
    </section>

    {editing && local && <EditDialog row={editing} group={editing.installment_group ? transactions.filter((row) => row.installment_group === editing.installment_group) : [editing]} local={local} people={people} categories={categories} onClose={() => setEditing(null)} onSaved={onChanged} notify={notify} />}
    {undo && <div className="snackbar" role="status"><span>{undo.text}</span><button className="text-button" onClick={() => void undoRemoval()}><Icon name="undo" size={15} />Desfazer</button></div>}
  </>
}
