import { getSettings } from '../lib/settings'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { messageOf, money, formatDate } from '../lib/format'
import { addMonthsToPeriod, currentPeriod, MONTH_NAMES, periodLabel, shortPeriodLabel } from '../services/installments'
import { invoicePeriodFor, readCard } from '../lib/card'
import { parseMoney, parseQuickLine } from '../lib/quickEntry'
import { suggestFor, type Suggestion } from '../lib/suggest'
import { parseNotification, toQuickLine } from '../lib/notificacao'
import { startListening, voiceAvailable, type Listening } from '../lib/voice'
import { goalAlerts } from '../lib/goalAlert'
import { extraFor, feeFor, limitLevel, spendByPerson } from '../lib/fee'
import type { CardFee } from '../types'
import { readGoals } from '../lib/goals'
import { marcarLancamentoHoje } from '../lib/lembrete'
import type { DataSource, Invoice, Transaction } from '../types'

const basePeriodOf = (invoice: Invoice | undefined) => invoice?.period ?? currentPeriod()

interface Overrides { description?: string; amount?: number; date?: string; person?: string; category?: string }
const FIELD_LABEL: Record<keyof Overrides, string> = { description: 'Descrição', amount: 'Valor', date: 'Data da compra', person: 'Responsável', category: 'Categoria' }

const LAST_KEY = 'oc:ultimo'
const readLast = (): Suggestion => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as Suggestion } catch { return { person: null, category: null } } }
const writeLast = (value: Suggestion) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(value)) } catch { /* ignora */ } }

interface Props {
  source: DataSource
  invoice: Invoice | undefined
  /** Faturas existentes, para escolher em quais meses lançar. */
  invoices?: Invoice[]
  /** Lançamentos já feitos, para avisar quando a compra estoura uma meta. */
  transactions?: Transaction[]
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  signal: number
  /** true quando aberto na tela cheia do celular */
  sheet?: boolean
  onSaved: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function QuickAdd({ source, invoice, invoices = [], transactions = [], people, categories, suggestions, signal, sheet, onSaved, notify }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Suggestion>(readLast)
  const [picked, setPicked] = useState<string[]>([])
  const [choosing, setChoosing] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  // Ajustes feitos tocando nas etiquetas: valem por cima do que o robô entendeu da frase.
  const [ov, setOv] = useState<Overrides>({})
  const [editing, setEditing] = useState<keyof Overrides | null>(null)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const voice = useRef<Listening | null>(null)
  const canSpeak = useMemo(() => voiceAvailable(), [])
  useEffect(() => () => { voice.current?.stop() }, [])

  useEffect(() => { if (signal > 0) input.current?.focus() }, [signal])

  const card = readCard()
  const today = new Date().toISOString().slice(0, 10)
  const firstPass = useMemo(() => parseQuickLine(text, { people, categories, today, basePeriod: basePeriodOf(invoice) }), [text, people, categories, today, invoice])
  // Com o cartão configurado, a fatura vem da data da compra e do fechamento, não do mês do calendário.
  const auto = chosen ?? (card ? invoicePeriodFor(ov.date ?? firstPass.date, card) : null)
  const parsed = useMemo(() => (auto ? parseQuickLine(text, { people, categories, today, basePeriod: auto }) : firstPass), [auto, text, people, categories, today, firstPass])
  const description = ov.description ?? parsed.description
  const amount = ov.amount !== undefined ? ov.amount : parsed.amount
  const date = ov.date ?? parsed.date
  const base = auto ?? basePeriodOf(invoice)
  const options = useMemo(() => [...new Set([...invoices.map((item) => item.period), ...Array.from({ length: 12 }, (_, i) => addMonthsToPeriod(base, i))])].sort(), [invoices, base])
  const periodShown = auto ?? base
  const years = useMemo(() => { const y = Number(periodShown.slice(0, 4)); const all = new Set([y - 1, y, y + 1, y + 2, ...invoices.map((item) => Number(item.period.slice(0, 4)))]); return [...all].sort() }, [periodShown, invoices])
  const setMonthYear = (month: string, year: string) => setChosen(`${year}-${month}-01`)
  const months = useMemo(() => [...new Set([...parsed.months, ...picked])].sort(), [parsed.months, picked])
  const spread = parsed.installments > 1 ? Array.from({ length: parsed.installments }, (_, i) => addMonthsToPeriod(base, i)) : []
  const hint = useMemo(() => suggestFor(description, suggestions), [description, suggestions])
  const defaults = getSettings()
  const person = ov.person ?? parsed.person ?? hint?.person ?? (defaults.defaultPerson || undefined) ?? last.person
  const category = ov.category ?? parsed.category ?? hint?.category ?? (defaults.defaultCategory || undefined) ?? last.category
  const guessed = { person: !ov.person && !parsed.person && !!person, category: !ov.category && !parsed.category && !!category }
  const missing = [!description && 'descrição', amount === null && 'valor', !person && 'responsável (@nome)', !category && 'categoria (#nome)'].filter(Boolean) as string[]

  const [fees, setFees] = useState<CardFee[]>([])
  useEffect(() => { let alive = true; void source.listFees().then((list) => { if (alive) setFees(list) }).catch(() => undefined); return () => { alive = false } }, [source, transactions])
  // Limite de cada pessoa (na taxa do cartão): avisa quando o gasto novo deixa perto (80%) ou acima do limite.
  const limitAlert = useMemo(() => {
    if (!text.trim() || amount === null || !person) return null
    const target = invoices.find((item) => item.period === periodShown)
    if (!target) return null
    const found = feeFor(target.id, invoices, fees)
    const fee = found?.fee
    const limit = fee && fee.value > 0 && !fee.excluded.includes(person) ? fee.limits?.[person] : undefined
    if (!fee || !limit) return null
    const here = parsed.installments > 1 ? Math.round((amount / parsed.installments) * 100) / 100 : amount
    const before = spendByPerson(transactions.filter((row) => row.invoice_id === target.id)).get(person) ?? 0
    const after = Math.round((before + here) * 100) / 100
    const level = limitLevel(after, limit)
    if (level === 'ok') return null
    const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    if (level === 'near') return { level: 'warn', text: `${person} vai a ${brl(after)} de ${brl(limit)} do limite (pode gastar mais ${brl(Math.max(0, limit - after))}).` }
    const extra = extraFor(fee, person, after)
    return { level: 'over', text: `${person} vai passar do limite de ${brl(limit)}${extra > 0 ? `: taxa extra de ${String(fee.extraPct).replace('.', ',')}% sobre tudo que gastou (${brl(extra)})` : ''}.` }
  }, [text, amount, parsed.installments, person, invoices, periodShown, fees, transactions])

  const alerts = useMemo(() => {
    if (!text.trim() || amount === null) return []
    const target = invoices.find((item) => item.period === periodShown)
    const rows = target ? transactions.filter((row) => row.invoice_id === target.id) : []
    const here = parsed.installments > 1 ? Math.round((amount / parsed.installments) * 100) / 100 : amount
    return goalAlerts(readGoals(), rows, { person, category, amount: here })
  }, [text, amount, parsed.installments, invoices, transactions, periodShown, person, category])

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const notice = parseNotification(event.clipboardData.getData('text'), today)
    if (!notice) return
    event.preventDefault()
    setText(toQuickLine(notice)); setHeard('Li a notificação do banco. Confira e toque em Salvar.')
  }

  async function pasteButton() {
    try {
      const raw = await navigator.clipboard.readText()
      const notice = parseNotification(raw, today)
      if (!notice) { notify('error', 'O texto copiado não parece uma notificação de compra no cartão.'); return }
      setText(toQuickLine(notice)); setHeard('Li a notificação do banco. Confira e toque em Salvar.'); input.current?.focus()
    } catch { notify('error', 'Não consegui ler o que foi copiado. Cole direto no campo.') }
  }

  async function toggleVoice() {
    if (listening) { voice.current?.stop(); return }
    setHeard(null)
    try {
      setListening(true)
      voice.current = await startListening({
        onText: (spoken) => { if (spoken) { setText(spoken); setHeard('Ouvi: confira e toque em Salvar.') } },
        onEnd: () => { setListening(false); voice.current = null; input.current?.focus() },
        onError: (message) => { setListening(false); voice.current = null; notify('error', message) },
      })
    } catch (cause) { setListening(false); voice.current = null; notify('error', messageOf(cause)) }
  }

  async function save() {
    if (busy || !text.trim()) return
    if (missing.length) { notify('error', `Falta: ${missing.join(', ')}.`); return }
    setBusy(true)
    try {
      if (months.length && parsed.installments === 1) await source.createRepeated({ invoiceId: invoice?.id ?? '', occurredOn: date, description: description, amount: amount ?? 0, personName: person ?? '', categoryName: category ?? '', period: periodShown }, months)
      else await source.createPurchase({ invoiceId: invoice?.id ?? '', occurredOn: date, description: description, amount: amount ?? 0, personName: person ?? '', categoryName: category ?? '', installmentCount: parsed.installments, period: periodShown })
      const next = { person, category }
      writeLast(next); setLast(next); setText(''); setOv({}); setEditing(null); setPicked([]); setChoosing(false); setHeard(null); marcarLancamentoHoje()
      await onSaved()
      notify('notice', `Salvo: ${description}, ${money(amount ?? 0)}${parsed.installments > 1 ? ` em ${parsed.installments}x` : months.length ? ` em ${months.length} ${months.length === 1 ? 'fatura' : 'faturas'}` : ` na fatura de ${periodLabel(periodShown)}`}.`)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false); input.current?.focus() }
  }

  /** Etiqueta que dá para tocar e trocar o valor (o lápis aparece quando foi ajustada na mão). */
  function chip(field: keyof Overrides, label: string, miss: boolean) {
    const edited = ov[field] !== undefined
    return <button type="button" className={`chip edit ${miss ? 'miss' : ''} ${edited ? 'edited' : ''} ${editing === field ? 'open' : ''}`} aria-label={`Trocar ${FIELD_LABEL[field].toLowerCase()}: ${label}`} aria-expanded={editing === field}
      onClick={() => {
        if (editing === field) { setEditing(null); return }
        setEditing(field)
        setDraft(field === 'amount' ? (amount === null ? '' : String(amount).replace('.', ',')) : field === 'date' ? date : field === 'description' ? description : field === 'person' ? person ?? '' : category ?? '')
      }}>{label}{edited ? ' ✎' : ''}</button>
  }

  function applyEdit() {
    if (!editing) return
    const value = draft.trim()
    if (editing === 'amount') {
      const parsedAmount = parseMoney(value)
      if (parsedAmount === null || !(parsedAmount > 0)) { notify('error', 'Valor inválido. Digite algo como 16,93.'); return }
      setOv({ ...ov, amount: parsedAmount })
    } else if (editing === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { notify('error', 'Escolha uma data.'); return }
      setOv({ ...ov, date: value })
    } else if (value) setOv({ ...ov, [editing]: value })
    setEditing(null)
  }

  function undoEdit(field: keyof Overrides) {
    const next = { ...ov }
    delete next[field]
    setOv(next); setEditing(null)
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); void save() }
    if (event.key === 'Escape') { setText(''); setOv({}); setEditing(null) }
  }

  return <section data-tour={sheet ? undefined : 'quick-add'} className={`quick-add ${sheet ? 'sheet' : 'inline'}`} aria-label="Lançamento rápido">
    <div className="quick-row">
      <span className="quick-icon"><Icon name="sparkle" size={18} /></span>
      <input ref={input} value={text} onChange={(event) => { setText(event.target.value); setHeard(null); if (!event.target.value.trim()) { setOv({}); setEditing(null) } }} onPaste={onPaste} onKeyDown={onKey} disabled={busy} maxLength={200}
        placeholder="Digite e dê Enter: mercado 150,90 3x @ana #casa ontem" aria-label="Lançamento rápido" autoComplete="off" enterKeyHint="done" autoCapitalize="sentences" />
      {canSpeak && <button type="button" className={`icon-button quick-tool ${listening ? 'live' : ''}`} onClick={() => void toggleVoice()} aria-pressed={listening} aria-label={listening ? 'Parar de ouvir' : 'Falar o gasto'} title={listening ? 'Parar de ouvir' : 'Falar o gasto'}><Icon name="mic" size={18} /></button>}
      <button type="button" className="icon-button quick-tool" onClick={() => void pasteButton()} aria-label="Colar notificação do banco" title="Colar notificação do banco"><Icon name="clipboard" size={18} /></button>
      <button className="primary-button" onClick={() => void save()} disabled={busy || !text.trim()}>Salvar</button>
    </div>
    {(listening || heard) && <p className="quick-heard" role="status">{listening ? 'Ouvindo… fale o gasto, por exemplo: “mercado 50 reais com a Ana ontem”.' : heard}</p>}
    <div className="quick-period" role="group" aria-label="Fatura do lançamento">
      <span className="quick-period-label">Fatura <b>(obrigatório)</b></span>
      <select aria-label="Mês da fatura" value={periodShown.slice(5, 7)} onChange={(event) => setMonthYear(event.target.value, periodShown.slice(0, 4))}>{MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}</select>
      <select aria-label="Ano da fatura" value={periodShown.slice(0, 4)} onChange={(event) => setMonthYear(periodShown.slice(5, 7), event.target.value)}>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select>
      {!chosen && <small className="muted">{card ? 'sugerida pelo fechamento do cartão' : 'a fatura aberta'}</small>}
      {chosen && <button type="button" className="text-button" onClick={() => setChosen(null)}>Voltar à sugerida</button>}
    </div>
    {text.trim() && <div className="quick-chips" aria-live="polite">
      {chip('description', description || 'descrição?', !description)}
      {chip('amount', amount === null ? 'valor?' : money(amount), amount === null)}
      {parsed.installments > 1 && <span className="chip">{parsed.installments}x de {money((amount ?? 0) / parsed.installments)} · {spread.map(shortPeriodLabel).join(', ')}</span>}
      {parsed.installments === 1 && months.length > 0 && <span className="chip accent">{money(amount ?? 0)} em cada: {months.map(shortPeriodLabel).join(', ')}</span>}
      {chip('date', formatDate(date), false)}
      {chip('person', `${person ?? 'responsável?'}${guessed.person && person ? ' · sugerido' : ''}`, !person)}
      {chip('category', `${category ?? 'categoria?'}${guessed.category && category ? ' · sugerido' : ''}`, !category)}
      {parsed.installments === 1 && <button type="button" className="chip pick" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>{months.length ? 'Trocar meses' : 'Lançar em vários meses'}</button>}
    </div>}
    {editing && <div className="chip-editor" role="group" aria-label={`Trocar ${FIELD_LABEL[editing].toLowerCase()}`}>
      <label>{FIELD_LABEL[editing]}
        <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyEdit() } if (event.key === 'Escape') setEditing(null) }}
          type={editing === 'date' ? 'date' : 'text'} inputMode={editing === 'amount' ? 'decimal' : undefined} list={editing === 'person' ? 'quick-people' : editing === 'category' ? 'quick-categories' : undefined} maxLength={editing === 'description' ? 160 : 80} />
      </label>
      <div className="button-row">
        <button type="button" className="primary-button" onClick={applyEdit}>OK</button>
        {ov[editing] !== undefined && <button type="button" className="text-button" onClick={() => undoEdit(editing)}>Voltar ao que o robô entendeu</button>}
        <button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button>
      </div>
      <datalist id="quick-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="quick-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
    </div>}
    {(alerts.length > 0 || limitAlert) && <div className="quick-alerts" role="status">{alerts.map((alert) => <p key={alert.goal.id} className={`quick-alert ${alert.level}`}>{alert.text}</p>)}{limitAlert && <p className={`quick-alert ${limitAlert.level}`}>{limitAlert.text}</p>}</div>}
    {text.trim() && choosing && parsed.installments === 1 && <div className="month-picker" role="group" aria-label="Meses para lançar">
      {options.map((period) => <button type="button" key={period} className={`month-chip ${months.includes(period) ? 'on' : ''}`} aria-pressed={months.includes(period)} onClick={() => setPicked(picked.includes(period) ? picked.filter((p) => p !== period) : [...picked, period])}>{shortPeriodLabel(period)}</button>)}
      <small className="muted">Cada mês escolhido recebe o valor cheio. Para dividir, use 3x.</small></div>}
    {!text.trim() && getSettings().advanced && <p className="quick-help">Dica: cole a notificação do banco ou use o microfone, e eu monto o lançamento. Atalho: <kbd>Ctrl</kbd>+<kbd>N</kbd>. Use <b>@nome</b> para o responsável, <b>#nome</b> para a categoria, <b>3x</b> para parcelas, <b>ontem</b> ou <b>05/11</b> para a data. O que faltar eu sugiro pelo seu histórico.</p>}
  </section>
}
