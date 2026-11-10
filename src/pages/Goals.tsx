import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { HBarChart } from '../components/charts'
import { TEAL, withName } from '../components/palette'
import { EmptyState, PageHeading, Panel } from '../components/ui'
import { categoryToken, personToken, type DrillFilter } from '../lib/drill'
import { money } from '../lib/format'
import { goalTitle, levelOf, readGoals, spentFor, suggestGoals, writeGoals, type Goal } from '../lib/goals'
import type { Invoice, Transaction } from '../types'

interface Props {
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  notify: (kind: 'notice' | 'error', text: string) => void
  onDrill: (filter: DrillFilter) => void
}

const chartLabel = (g: Goal) => (g.category ? `${g.name.split(' ')[0]} · ${g.category}` : g.name.split(' ').slice(0, 2).join(' '))

const LEVEL_TEXT = { ok: 'Dentro do limite', warn: 'Perto do limite', over: 'Passou do limite' } as const

export default function Goals({ invoices, transactions, invoiceId, onInvoice, notify, onDrill }: Props) {
  const [goals, setGoals] = useState<Goal[]>(readGoals)
  const [scope, setScope] = useState<Goal['scope']>('category')
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [onlyCategory, setOnlyCategory] = useState('')
  const invoice = invoices.find((item) => item.id === invoiceId) ?? invoices[invoices.length - 1]
  const rows = useMemo(() => transactions.filter((row) => row.invoice_id === invoice?.id), [transactions, invoice])
  const categories = useMemo(() => [...new Set(transactions.map((row) => row.category?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const people = useMemo(() => [...new Set(transactions.map((row) => row.person?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const options = scope === 'category' ? categories : people
  const suggestions = useMemo(() => suggestGoals(transactions, invoices, invoice?.id ?? '', goals), [transactions, invoices, invoice, goals])
  const personGoals = goals.filter((g) => g.scope === 'person')
  const value = Number(limit.replace(/\./g, '').replace(',', '.'))

  const save = (next: Goal[]) => { setGoals(next); writeGoals(next) }
  function add() {
    if (!(value > 0)) { notify('error', 'Informe um limite maior que zero.'); return }
    if (scope !== 'total' && !name) { notify('error', scope === 'category' ? 'Escolha a categoria.' : 'Escolha a pessoa.'); return }
    const finalName = scope === 'total' ? '' : name
    const finalCategory = scope === 'person' && onlyCategory ? onlyCategory : undefined
    if (goals.some((g) => g.scope === scope && g.name === finalName && g.category === finalCategory)) { notify('error', 'Já existe uma meta para isso. Edite o limite dela na lista.'); return }
    save([...goals, { id: `g-${Date.now()}`, scope, name: finalName, ...(finalCategory ? { category: finalCategory } : {}), limit: Math.round(value * 100) / 100 }])
    setLimit(''); setName(''); setOnlyCategory(''); notify('notice', 'Meta criada.')
  }

  if (!invoices.length) return <><PageHeading title="Metas e limites" subtitle="Defina quanto você quer gastar e acompanhe pela barra." /><EmptyState title="Ainda não há faturas">Crie ou importe uma fatura e volte aqui para definir seus limites.</EmptyState></>

  return <>
    <PageHeading title="Metas e limites" subtitle="Um limite por fatura para o total, uma categoria ou uma pessoa. A barra avisa quando chega perto.">
      <select aria-label="Fatura" value={invoice?.id ?? ''} onChange={(event) => onInvoice(event.target.value)}>{[...invoices].reverse().map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
    </PageHeading>

    <Panel tour="goals-list" icon="trend-up" title={`Acompanhamento de ${invoice?.label ?? ''}`} subtitle="Os limites valem para todas as faturas; a barra mostra a fatura escolhida acima.">
      {goals.length ? <ul className="goal-list">{goals.map((goal) => {
        const spent = spentFor(goal, rows)
        const level = levelOf(spent, goal.limit)
        const pct = Math.min(100, Math.round((spent / goal.limit) * 100))
        const left = goal.limit - spent
        return <li key={goal.id} className={`goal ${level}`}>
          <div className="goal-top"><b>{goalTitle(goal)}</b><span className={`goal-tag ${level}`}>{LEVEL_TEXT[level]}</span></div>
          <div className="goal-bar" role="progressbar" aria-label={goalTitle(goal)} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
          <div className="goal-foot">
            <span>{money(spent)} de <label className="goal-limit">limite <input aria-label={`Limite de ${goalTitle(goal)}`} inputMode="decimal" defaultValue={String(goal.limit).replace('.', ',')} onBlur={(event) => { const v = Number(event.target.value.replace(/\./g, '').replace(',', '.')); if (v > 0 && v !== goal.limit) save(goals.map((g) => g.id === goal.id ? { ...g, limit: v } : g)); else event.target.value = String(goal.limit).replace('.', ',') }} /></label></span>
            <span className={left < 0 ? 'neg' : 'muted'}>{left >= 0 ? `Sobram ${money(left)}` : `Passou ${money(-left)}`}</span>
            <span className="tx-actions">
              {goal.scope !== 'total' && invoice && <button className="text-button" onClick={() => onDrill({ invoiceId: invoice.id, ...(goal.scope === 'category' ? { category: categoryToken(goal.name) } : { person: personToken(goal.name), ...(goal.category ? { category: categoryToken(goal.category) } : {}) }) })}>Ver lançamentos</button>}
              <button className="icon-button danger" aria-label={`Excluir meta ${goalTitle(goal)}`} onClick={() => save(goals.filter((g) => g.id !== goal.id))}><Icon name="trash" size={16} /></button>
            </span>
          </div>
        </li>
      })}</ul> : <p className="empty">Nenhuma meta ainda. Crie a primeira abaixo.</p>}
    </Panel>

    {personGoals.length > 0 && <Panel tour="goals-chart" icon="users" title="Pessoas x limite" subtitle={`${invoice?.label ?? ''}: quanto cada pessoa gastou e onde está o limite dela`}>
      <HBarChart rows={personGoals.map((g) => ({ label: chartLabel(g), values: [spentFor(g, rows)] }))} onPick={(label) => { const g = personGoals.find((item) => chartLabel(item) === label); if (g && invoice) onDrill({ invoiceId: invoice.id, person: personToken(g.name), ...(g.category ? { category: categoryToken(g.category) } : {}) }) }} series={[withName(TEAL, invoice?.label ?? 'Gasto')]} limits={Object.fromEntries(personGoals.map((g) => [chartLabel(g), g.limit]))} />
    </Panel>}

    <Panel tour="goals-new" icon="plus" title="Nova meta" subtitle="Escolha o que limitar e quanto.">
      <div className="goal-form">
        <label>O que limitar<select value={scope} onChange={(event) => { setScope(event.target.value as Goal['scope']); setName(''); setOnlyCategory('') }}><option value="category">Uma categoria</option><option value="person">Uma pessoa</option><option value="total">O total da fatura</option></select></label>
        {scope !== 'total' && <label>{scope === 'category' ? 'Categoria' : 'Pessoa'}<select value={name} onChange={(event) => setName(event.target.value)}><option value="">Escolher…</option>{options.map((item) => <option key={item}>{item}</option>)}</select></label>}
        {scope === 'person' && <label>Só na categoria (opcional)<select value={onlyCategory} onChange={(event) => setOnlyCategory(event.target.value)}><option value="">Todos os gastos dela</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>}
        <label>Limite por fatura (R$)<input inputMode="decimal" placeholder="800,00" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
        <button className="primary-button" onClick={add}>Criar meta</button>
      </div>
      {suggestions.length > 0 && <div className="goal-suggest"><p className="hint">Sugestões pela média das últimas faturas:</p>
        <div className="ex-chips">{suggestions.map((s) => <button key={s.id} className="chip-button" onClick={() => save([...goals, { ...s, id: `g-${Date.now()}-${s.name}` }])}>{s.name} · {money(s.limit)}</button>)}</div></div>}
    </Panel>
  </>
}
