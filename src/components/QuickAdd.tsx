import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { messageOf, money, formatDate } from '../lib/format'
import { parseQuickLine } from '../lib/quickEntry'
import { suggestFor, type Suggestion } from '../lib/suggest'
import type { DataSource, Invoice } from '../types'

const LAST_KEY = 'oc:ultimo'
const readLast = (): Suggestion => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as Suggestion } catch { return { person: null, category: null } } }
const writeLast = (value: Suggestion) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(value)) } catch { /* ignora */ } }

interface Props {
  source: DataSource
  invoice: Invoice | undefined
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  signal: number
  onSaved: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function QuickAdd({ source, invoice, people, categories, suggestions, signal, onSaved, notify }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Suggestion>(readLast)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (signal > 0) input.current?.focus() }, [signal])

  const parsed = useMemo(() => parseQuickLine(text, { people, categories, today: new Date().toISOString().slice(0, 10) }), [text, people, categories])
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
      await source.createPurchase({ invoiceId: invoice?.id ?? '', occurredOn: parsed.date, description: parsed.description, amount: parsed.amount ?? 0, personName: person ?? '', categoryName: category ?? '', installmentCount: parsed.installments })
      const next = { person, category }
      writeLast(next); setLast(next); setText('')
      await onSaved()
      notify('notice', `Salvo: ${parsed.description}, ${money(parsed.amount ?? 0)}${parsed.installments > 1 ? ` em ${parsed.installments}x` : ''}.`)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false); input.current?.focus() }
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); void save() }
    if (event.key === 'Escape') setText('')
  }

  return <section className="quick-add" aria-label="Lançamento rápido">
    <div className="quick-row">
      <span className="quick-icon"><Icon name="sparkle" size={18} /></span>
      <input ref={input} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} disabled={busy} maxLength={200}
        placeholder="Digite e dê Enter: mercado 150,90 3x @ana #casa ontem" aria-label="Lançamento rápido" autoComplete="off" />
      <button className="primary-button" onClick={() => void save()} disabled={busy || !text.trim()}>Salvar</button>
    </div>
    {text.trim() && <div className="quick-chips" aria-live="polite">
      <span className={`chip ${parsed.description ? '' : 'miss'}`}>{parsed.description || 'descrição?'}</span>
      <span className={`chip ${parsed.amount === null ? 'miss' : ''}`}>{parsed.amount === null ? 'valor?' : money(parsed.amount)}</span>
      {parsed.installments > 1 && <span className="chip">{parsed.installments}x de {money((parsed.amount ?? 0) / parsed.installments)}</span>}
      <span className="chip">{formatDate(parsed.date)}</span>
      <span className={`chip ${person ? '' : 'miss'}`}>{person ?? 'responsável?'}{guessed.person && person ? ' · sugerido' : ''}</span>
      <span className={`chip ${category ? '' : 'miss'}`}>{category ?? 'categoria?'}{guessed.category && category ? ' · sugerido' : ''}</span>
      {invoice && <span className="chip soft">{invoice.label}</span>}
    </div>}
    {!text.trim() && <p className="quick-help">Atalho: <kbd>Ctrl</kbd>+<kbd>N</kbd>. Use <b>@nome</b> para o responsável, <b>#nome</b> para a categoria, <b>3x</b> para parcelas, <b>ontem</b> ou <b>05/11</b> para a data. O que faltar eu sugiro pelo seu histórico.</p>}
  </section>
}
