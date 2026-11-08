import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { formatDate, messageOf, money } from '../lib/format'
import { parsePastedBill } from '../lib/pasteImport'
import { suggestFor, type Suggestion } from '../lib/suggest'
import { periodLabel, periodOfDate } from '../services/installments'
import type { LocalSource } from '../services/localSource'
import type { ImportInvoice, ImportResult, ImportRow } from '../types'

interface Props {
  local: LocalSource
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  onClose: () => void
  onDone: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function PasteBill({ local, people, categories, suggestions, onClose, onDone, notify }: Props) {
  const [text, setText] = useState('')
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState('')
  const [off, setOff] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => parsePastedBill(text, new Date().toISOString().slice(0, 10)), [text])
  const picked = parsed.rows.filter((row) => !off.has(row.line))
  const total = picked.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100

  const batch = (): ImportInvoice[] => {
    const groups = new Map<string, ImportRow[]>()
    for (const row of picked) {
      const hint = suggestFor(row.description, suggestions)
      const period = periodOfDate(row.date)
      const list = groups.get(period) ?? []
      list.push({ date: row.date, description: row.description, amount: row.amount, person: hint?.person ?? person.trim(), category: hint?.category ?? category.trim(), status: 'pending', installmentNumber: null, installmentCount: null })
      groups.set(period, list)
    }
    return [...groups].map(([period, rows]) => ({ period, label: periodLabel(period), rows }))
  }

  const ready = picked.length > 0 && person.trim() !== '' && category.trim() !== ''
  const reset = () => { setPreview(null) }

  async function check() {
    try { setPreview(await local.importInvoices(batch(), { dryRun: true })) } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function confirm() {
    setBusy(true)
    try {
      const result = await local.importInvoices(batch())
      await onDone()
      notify('notice', `${result.added} lançamentos importados${result.duplicates ? `, ${result.duplicates} já existiam e foram ignorados` : ''}.`)
      onClose()
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  return <section className="panel paste-panel">
    <div className="panel-heading"><div><h2>Colar da fatura do banco</h2><p className="panel-sub">Copie as linhas da fatura (data, descrição e valor) e cole aqui.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div>
    <textarea value={text} onChange={(event) => { setText(event.target.value); setOff(new Set()); reset() }} rows={6} placeholder={'05/11 SUPERMERCADO XYZ 152,30\n06/11 UBER *TRIP 23,40'} aria-label="Texto da fatura" />
    <div className="paste-defaults">
      <label>Responsável padrão<input value={person} onChange={(event) => { setPerson(event.target.value); reset() }} list="paste-people" placeholder="Quem paga o que eu não reconhecer" /></label>
      <label>Categoria padrão<input value={category} onChange={(event) => { setCategory(event.target.value); reset() }} list="paste-categories" placeholder="Ex: Outros" /></label>
      <datalist id="paste-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="paste-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
    {text.trim() && <>
      <div className="paste-list" role="list">
        {parsed.rows.map((row) => {
          const hint = suggestFor(row.description, suggestions)
          return <label key={row.line} className={`paste-row ${off.has(row.line) ? 'off' : ''}`} role="listitem">
            <input type="checkbox" checked={!off.has(row.line)} onChange={() => { const next = new Set(off); if (next.has(row.line)) next.delete(row.line); else next.add(row.line); setOff(next); reset() }} />
            <span className="paste-date">{formatDate(row.date)}</span><span className="paste-desc">{row.description}</span>
            <span className="paste-who">{hint?.person ?? (person || '?')}{hint ? ' · sugerido' : ''}</span><span className="paste-amount">{money(row.amount)}</span>
          </label>
        })}
        {!parsed.rows.length && <p className="empty">Nenhuma linha com data e valor foi encontrada.</p>}
      </div>
      {parsed.skipped.length > 0 && <p className="hint">{parsed.skipped.length} {parsed.skipped.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}: {parsed.skipped.slice(0, 3).map((item) => `"${item.text.slice(0, 28)}" (${item.reason})`).join('; ')}{parsed.skipped.length > 3 ? '…' : ''}</p>}
      {preview && <p className="notice">Prévia: {preview.added} novos e {preview.duplicates} repetidos (serão ignorados){preview.invoicesCreated ? `, ${preview.invoicesCreated} fatura(s) nova(s)` : ''}.</p>}
      <div className="button-row">
        <button className="secondary-button" onClick={() => void check()} disabled={!ready}>Conferir</button>
        <button className="primary-button" onClick={() => void confirm()} disabled={!ready || !preview || busy}><Icon name="upload" size={16} />Importar {picked.length} ({money(total)})</button>
        {!ready && picked.length > 0 && <span className="hint">Informe o responsável e a categoria padrão.</span>}
      </div>
    </>}
  </section>
}
