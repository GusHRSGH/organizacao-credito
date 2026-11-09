import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { messageOf, money, formatDate } from '../lib/format'
import { addMonthsToPeriod, currentPeriod, shortPeriodLabel } from '../services/installments'
import { parseQuickLine } from '../lib/quickEntry'
import { suggestFor, type Suggestion } from '../lib/suggest'
import type { DataSource, Invoice } from '../types'

const basePeriodOf = (invoice: Invoice | undefined) => invoice?.period ?? currentPeriod()

const LAST_KEY = 'oc:ultimo'
const readLast = (): Suggestion => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as Suggestion } catch { return { person: null, category: null } } }
const writeLast = (value: Suggestion) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(value)) } catch { /* ignora */ } }

interface Props {
  source: DataSource
  invoice: Invoice | undefined
  /** Faturas existentes, para escolher em quais meses lançar. */
  invoices?: Invoice[]
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  signal: number
  /** true quando aberto na tela cheia do celular */
  sheet?: boolean
  onSaved: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function QuickAdd({ source, invoice, invoices = [], people, categories, suggestions, signal, sheet, onSaved, notify }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Suggestion>(readLast)
  const [picked, setPicked] = useState<string[]>([])
  const [choosing, setChoosing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (signal > 0) input.current?.focus() }, [signal])

  const parsed = useMemo(() => parseQuickLine(text, { people, categories, today: new Date().toISOString().slice(0, 10), basePeriod: basePeriodOf(invoice) }), [text, people, categories, invoice])
  const base = basePeriodOf(invoice)
  const options = useMemo(() => [...new Set([...invoices.map((item) => item.period), ...Array.from({ length: 12 }, (_, i) => addMonthsToPeriod(base, i))])].sort(), [invoices, base])
  const months = useMemo(() => [...new Set([...parsed.months, ...picked])].sort(), [parsed.months, picked])
  const spread = parsed.installments > 1 ? Array.from({ length: parsed.installments }, (_, i) => addMonthsToPeriod(base, i)) : []
  const hint = useMemo(() => suggestFor(parsed.description, suggestions), [parsed.description, suggestions])
  const person = parsed.person ?? hint?.person ?? last.person
  const category = parsed.category ?? hint?.category ?? last.category
  const guessed = { person: !parsed.person && !!person, category: !parsed.category && !!category }
  const missing = [!parsed.description && 'descrição', parsed.amount === null && 'valor', !person && 'responsável (@nome)', !category && 'categoria (#nome)'].filter(Boolean) as string[]

  async function save() {
    if (busy || !text.trim()) return
    if (missing.length) { notify('error', `Falta: ${missing.join(', ')}.`); return }
    setBusy(true)
    try {
      if (months.length && parsed.installments === 1) await source.createRepeated({ invoiceId: invoice?.id ?? '', occurredOn: parsed.date, description: parsed.description, amount: parsed.amount ?? 0, personName: person ?? '', categoryName: category ?? '' }, months)
      else await source.createPurchase({ invoiceId: invoice?.id ?? '', occurredOn: parsed.date, description: parsed.description, amount: parsed.amount ?? 0, personName: person ?? '', categoryName: category ?? '', installmentCount: parsed.installments })
      const next = { person, category }
      writeLast(next); setLast(next); setText(''); setPicked([]); setChoosing(false)
      await onSaved()
      notify('notice', `Salvo: ${parsed.description}, ${money(parsed.amount ?? 0)}${parsed.installments > 1 ? ` em ${parsed.installments}x` : months.length ? ` em ${months.length} ${months.length === 1 ? 'fatura' : 'faturas'}` : ''}.`)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false); input.current?.focus() }
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); void save() }
    if (event.key === 'Escape') setText('')
  }

  return <section data-tour={sheet ? undefined : 'quick-add'} className={`quick-add ${sheet ? 'sheet' : 'inline'}`} aria-label="Lançamento rápido">
    <div className="quick-row">
      <span className="quick-icon"><Icon name="sparkle" size={18} /></span>
      <input ref={input} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} disabled={busy} maxLength={200}
        placeholder="Digite e dê Enter: mercado 150,90 3x @ana #casa ontem" aria-label="Lançamento rápido" autoComplete="off" enterKeyHint="done" autoCapitalize="sentences" />
      <button className="primary-button" onClick={() => void save()} disabled={busy || !text.trim()}>Salvar</button>
    </div>
    {text.trim() && <div className="quick-chips" aria-live="polite">
      <span className={`chip ${parsed.description ? '' : 'miss'}`}>{parsed.description || 'descrição?'}</span>
      <span className={`chip ${parsed.amount === null ? 'miss' : ''}`}>{parsed.amount === null ? 'valor?' : money(parsed.amount)}</span>
      {parsed.installments > 1 && <span className="chip">{parsed.installments}x de {money((parsed.amount ?? 0) / parsed.installments)} · {spread.map(shortPeriodLabel).join(', ')}</span>}
      {parsed.installments === 1 && months.length > 0 && <span className="chip accent">{money(parsed.amount ?? 0)} em cada: {months.map(shortPeriodLabel).join(', ')}</span>}
      <span className="chip">{formatDate(parsed.date)}</span>
      <span className={`chip ${person ? '' : 'miss'}`}>{person ?? 'responsável?'}{guessed.person && person ? ' · sugerido' : ''}</span>
      <span className={`chip ${category ? '' : 'miss'}`}>{category ?? 'categoria?'}{guessed.category && category ? ' · sugerido' : ''}</span>
      {invoice && !months.length && <span className="chip soft">{invoice.label}</span>}
      {parsed.installments === 1 && <button type="button" className="chip pick" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>{months.length ? 'Trocar meses' : 'Lançar em vários meses'}</button>}
    </div>}
    {text.trim() && choosing && parsed.installments === 1 && <div className="month-picker" role="group" aria-label="Meses para lançar">
      {options.map((period) => <button type="button" key={period} className={`month-chip ${months.includes(period) ? 'on' : ''}`} aria-pressed={months.includes(period)} onClick={() => setPicked(picked.includes(period) ? picked.filter((p) => p !== period) : [...picked, period])}>{shortPeriodLabel(period)}</button>)}
      <small className="muted">Cada mês escolhido recebe o valor cheio. Para dividir, use 3x.</small></div>}
    {!text.trim() && <p className="quick-help">Atalho: <kbd>Ctrl</kbd>+<kbd>N</kbd>. Use <b>@nome</b> para o responsável, <b>#nome</b> para a categoria, <b>3x</b> para parcelas, <b>ontem</b> ou <b>05/11</b> para a data. O que faltar eu sugiro pelo seu histórico.</p>}
  </section>
}
