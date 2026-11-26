import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon } from './Icon'
import { messageOf, money } from '../lib/format'
import { parseMoney } from '../lib/quickEntry'
import { detectSubscriptions } from '../lib/watch'
import { getActiveWallet, getKnownWallets } from '../lib/wallet'
import { currentPeriod, periodLabel } from '../services/installments'
import type { DataSource, Invoice, Recurring, Transaction } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  people: string[]
  categories: string[]
  onClose: () => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

const blank = () => ({ description: '', amount: '', person: '', category: '', day: '10' })

/** Despesas fixas (Netflix, academia…): o app lança sozinho todo mês na fatura do mês, para a pessoa certa. */
export default function RecurringPanel({ source, invoices, transactions, people, categories, onClose, onChanged, notify }: Props) {
  const [list, setList] = useState<Recurring[]>([])
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setList(await source.listRecurring()) } catch { setList([]) } }, [source])
  useEffect(() => { void load() }, [load])
  const wallets = getKnownWallets()
  const walletName = (id: string) => wallets.find((item) => item.id === id)?.name ?? 'Cartão principal'

  // Assinaturas que o robô já viu se repetindo e ainda não são fixas.
  const suggestions = useMemo(() => {
    const known = new Set(list.map((item) => item.description.toLocaleLowerCase('pt-BR')))
    return detectSubscriptions(transactions, invoices).filter((sub) => sub.active && sub.certain && !known.has(sub.name.toLocaleLowerCase('pt-BR'))).slice(0, 4)
  }, [transactions, invoices, list])

  async function save(item: Recurring, text: string) {
    setBusy(true)
    try {
      await source.saveRecurring(item)
      const launched = await source.launchRecurring(currentPeriod())
      await load(); await onChanged()
      notify('notice', `${text}${launched ? ` Já lancei ${launched === 1 ? 'a deste mês' : `${launched} meses`}.` : ''}`)
      return true
    } catch (cause) { notify('error', messageOf(cause)); return false } finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amount = parseMoney(form.amount) ?? 0
    const ok = await save({ id: crypto.randomUUID(), description: form.description, amount, person: form.person, category: form.category, wallet: getActiveWallet(), day: Number(form.day), active: true, start: currentPeriod() },
      `${form.description.trim()} vai ser lançada todo mês.`)
    if (ok) setForm(blank())
  }

  function adopt(sub: ReturnType<typeof detectSubscriptions>[number]) {
    const last = transactions.find((row) => row.id === sub.ids[sub.ids.length - 1])
    // A deste mês já existe quando ela apareceu na última fatura: começa no mês seguinte.
    const start = sub.lastPeriod >= currentPeriod() ? sub.lastPeriod : currentPeriod()
    void save({ id: crypto.randomUUID(), description: sub.name, amount: sub.monthly, person: last?.person?.name ?? '', category: last?.category?.name ?? 'Fixas', wallet: getActiveWallet(), day: Number(last?.occurred_on.slice(8, 10) ?? 10), active: true, start, last: sub.lastPeriod >= currentPeriod() ? sub.lastPeriod : undefined },
      `${sub.name} virou despesa fixa.`)
  }

  async function toggle(item: Recurring) {
    // Ao reativar, não lança os meses em que ficou pausada.
    const back = !item.active ? { last: item.last && item.last < currentPeriod() ? undefined : item.last, start: currentPeriod() } : {}
    await save({ ...item, active: !item.active, ...back }, item.active ? `${item.description} pausada.` : `${item.description} voltou a ser lançada.`)
  }

  async function remove(item: Recurring) {
    if (!window.confirm(`Parar de lançar ${item.description}? O que já foi lançado continua nas faturas.`)) return
    try { await source.removeRecurring(item.id); await load(); notify('notice', `${item.description} não vai mais ser lançada.`) } catch (cause) { notify('error', messageOf(cause)) }
  }

  const set = (key: keyof ReturnType<typeof blank>) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value })

  return <section className="panel recurring-panel" aria-label="Despesas fixas">
    <div className="panel-heading"><div><h2>Despesas fixas</h2><p className="panel-sub">Netflix, academia, internet: cadastre uma vez e o app lança sozinho todo mês na fatura do mês, para quem paga.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div>
    {list.length > 0 && <ul className="recurring-list">{list.map((item) => <li key={item.id} className={item.active ? '' : 'off'}>
      <span className="grow"><b>{item.description}</b><small>{money(item.amount)} · {item.person} · dia {item.day}{wallets.length > 1 ? ` · ${walletName(item.wallet)}` : ''}{item.last ? ` · lançada até ${periodLabel(item.last)}` : ''}{item.active ? '' : ' · pausada'}</small></span>
      <button className="text-button" disabled={busy} onClick={() => void toggle(item)}>{item.active ? 'Pausar' : 'Voltar'}</button>
      <button className="icon-button danger" aria-label={`Parar de lançar ${item.description}`} onClick={() => void remove(item)}><Icon name="trash" size={15} /></button>
    </li>)}</ul>}
    {suggestions.length > 0 && <div className="recurring-suggest"><p className="hint">O robô viu estas se repetindo todo mês:</p>
      {suggestions.map((sub) => <button key={sub.key} className="secondary-button" disabled={busy} onClick={() => adopt(sub)}><Icon name="repeat" size={15} />{sub.name} · {money(sub.monthly)}</button>)}</div>}
    <form className="recurring-form" onSubmit={(event) => void submit(event)}>
      <label>Descrição<input value={form.description} onChange={set('description')} maxLength={160} placeholder="Ex.: Netflix" required /></label>
      <label>Valor por mês (R$)<input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="55,90" required /></label>
      <label>Quem paga<input value={form.person} onChange={set('person')} list="recurring-people" maxLength={80} required /></label>
      <label>Categoria<input value={form.category} onChange={set('category')} list="recurring-categories" maxLength={60} placeholder="Fixas" /></label>
      <label>Dia da cobrança<input type="number" min={1} max={31} value={form.day} onChange={set('day')} required /></label>
      <datalist id="recurring-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="recurring-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
      <div className="button-row"><button className="primary-button" disabled={busy}><Icon name="repeat" size={16} />Lançar todo mês</button></div>
    </form>
  </section>
}
