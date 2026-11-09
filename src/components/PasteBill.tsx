import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDate, messageOf, money } from '../lib/format'
import { parsePastedBill } from '../lib/pasteImport'
import { parseInstallment } from '../services/importXlsx'
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
  const [reading, setReading] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const usedOcr = useRef(false)
  useEffect(() => () => { if (usedOcr.current) void import('../services/ocr').then((m) => m.stopOcr()) }, [])

  const parsed = useMemo(() => parsePastedBill(text, new Date().toISOString().slice(0, 10), people, categories), [text, people, categories])
  const picked = parsed.rows.filter((row) => !off.has(row.line))
  const total = picked.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100

  const batch = (): ImportInvoice[] => {
    const groups = new Map<string, ImportRow[]>()
    for (const row of picked) {
      const hint = suggestFor(row.description, suggestions)
      const period = periodOfDate(row.date)
      const list = groups.get(period) ?? []
      list.push({ date: row.date, description: row.description, amount: row.amount, person: row.person ?? hint?.person ?? person.trim(), category: hint?.category ?? category.trim(), status: 'pending', installmentNumber: parseInstallment(row.description)?.number ?? null, installmentCount: parseInstallment(row.description)?.count ?? null })
      groups.set(period, list)
    }
    return [...groups].map(([period, rows]) => ({ period, label: periodLabel(period), rows }))
  }

  const ready = picked.length > 0 && person.trim() !== '' && category.trim() !== ''
  const reset = () => { setPreview(null) }

  async function readFile(file: File | undefined) {
    if (!file) return
    setReading('Abrindo o arquivo…')
    try {
      let result: string
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { readPdfText } = await import('../services/pdfText')
        usedOcr.current = true
        result = await readPdfText(file, (info) => setReading(info.mode === 'texto' ? `Lendo a página ${info.page} de ${info.pages}…` : `Página ${info.page} de ${info.pages} é imagem, reconhecendo o texto (pode levar um pouco)…`),
          (info) => setReading(`Reconhecendo o texto… ${Math.round(info.progress * 100)}%`))
      } else {
        const { readImageText } = await import('../services/ocr')
        usedOcr.current = true
        setReading('Preparando o leitor de fotos…')
        result = await readImageText(file, (info) => setReading(info.status === 'recognizing text' ? `Reconhecendo o texto… ${Math.round(info.progress * 100)}%` : 'Preparando o leitor de fotos…'))
      }
      if (!result.trim()) throw new Error('Não consegui ler texto nesse arquivo. Tente uma foto mais nítida, de frente e com boa luz.')
      setText(result); setOff(new Set()); reset()
      notify('notice', 'Li o arquivo. Confira as linhas abaixo antes de importar.')
    } catch (cause) { notify('error', messageOf(cause)) } finally { setReading(''); if (fileRef.current) fileRef.current.value = ''; if (cameraRef.current) cameraRef.current.value = '' }
  }

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
    <div className="panel-heading"><div><h2>Colar do banco ou da conversa</h2><p className="panel-sub">Cole linhas da fatura, notificações do banco ou mensagens do WhatsApp (“gastei 50 no mercado”). O robô separa os gastos e você confere.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div>
    <div className="button-row paste-files">
      <button className="secondary-button" disabled={!!reading} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Anexar PDF ou foto da fatura</button>
      <button className="secondary-button" disabled={!!reading} onClick={() => cameraRef.current?.click()}><Icon name="receipt" size={16} />Tirar foto</button>
      <input ref={fileRef} type="file" accept=".pdf,application/pdf,image/*" hidden aria-label="Arquivo da fatura" onChange={(event) => void readFile(event.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void readFile(event.target.files?.[0])} />
      {reading && <span className="muted" role="status">{reading}</span>}
    </div>
    <textarea value={text} onChange={(event) => { setText(event.target.value); setOff(new Set()); reset() }} rows={6} placeholder={'05/11 SUPERMERCADO XYZ 152,30\nCompra aprovada de R$ 23,40 em UBER hoje\n[08/11/2026 14:32] Ana: gastei 50 no mercado'} aria-label="Texto da fatura" />
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
            <span className="paste-who">{row.person ?? hint?.person ?? (person || '?')}{row.origin ? ` · ${row.origin}` : hint ? ' · sugerido' : ''}{row.dateGuessed ? ' · data: hoje?' : ''}</span><span className="paste-amount">{money(row.amount)}</span>
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
