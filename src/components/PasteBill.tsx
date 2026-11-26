import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDate, messageOf, money } from '../lib/format'
import { detectDueDate, IMAGE_BREAK, parsePastedBill } from '../lib/pasteImport'
import { parseInstallment } from '../services/importXlsx'
import { suggestFor, type Suggestion } from '../lib/suggest'
import { addMonthsToPeriod, currentPeriod, periodLabel } from '../services/installments'
import { DEFAULT_CARD, dueDate, invoicePeriodFor, readCard, writeCard } from '../lib/card'
import type { LocalSource } from '../services/localSource'
import type { ImportInvoice, ImportResult, ImportRow } from '../types'

interface Props {
  local: LocalSource
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  onClose: () => void
  onDone: () => Promise<void>
  /** Depois de importar tudo numa fatura só, abre essa fatura. */
  onImported?: (period: string) => void
  /** Meses que já têm fatura nesta carteira. */
  existing?: string[]
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function PasteBill({ local, people, categories, suggestions, onClose, onDone, onImported, existing = [], notify }: Props) {
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
  // Fatura de destino: a do vencimento achado no texto, a que a pessoa escolher, ou pela data de cada compra.
  const card = readCard()
  const due = useMemo(() => detectDueDate(text, new Date().toISOString().slice(0, 10)), [text])
  const [destChoice, setDestChoice] = useState<string | null>(null)
  const dest = destChoice ?? due?.period ?? 'auto'
  const [saveDue, setSaveDue] = useState(true)
  const dueDiffers = !!due && card?.dueDay !== due.day
  const destOptions = useMemo(() => {
    const now = currentPeriod()
    const list = new Set<string>([...existing, ...(due ? [due.period] : [])])
    for (let step = -3; step <= 12; step++) list.add(addMonthsToPeriod(now, step))
    return [...list].sort()
  }, [existing, due])
  const destLabel = (period: string) => `${periodLabel(period)}${card ? ` (vence ${dueDate(period, card).slice(8, 10)}/${period.slice(5, 7)})` : ''}`
  const total = picked.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100

  const batch = (): ImportInvoice[] => {
    const groups = new Map<string, ImportRow[]>()
    for (const row of picked) {
      const hint = suggestFor(row.description, suggestions)
      const parcel = parseInstallment(row.description)
      // Parcela 3/3 de uma compra de setembro cai na fatura de setembro + 2 meses, não na de setembro.
      const period = dest !== 'auto' ? dest : addMonthsToPeriod(invoicePeriodFor(row.date, readCard()), parcel ? parcel.number - 1 : 0)
      const list = groups.get(period) ?? []
      list.push({ date: row.date, description: row.description, amount: row.amount, person: row.person ?? hint?.person ?? person.trim(), category: hint?.category ?? (category.trim() || 'Outros'), status: 'pending', installmentNumber: parcel?.number ?? null, installmentCount: parcel?.count ?? null })
      groups.set(period, list)
    }
    return [...groups].map(([period, rows]) => ({ period, label: periodLabel(period), rows }))
  }

  const ready = picked.length > 0
  // Linhas que nem o robô nem o responsável padrão sabem de quem é: entram sem responsável e a pessoa define depois.
  const unknown = picked.filter((row) => !(row.person ?? suggestFor(row.description, suggestions)?.person ?? person.trim())).length
  const reset = () => { setPreview(null) }

  /** Lê um ou vários arquivos (PDF ou prints). Vários prints são juntados e as compras repetidas entre eles somem. */
  async function readFiles(list: FileList | null | undefined) {
    const files = [...(list ?? [])]
    if (!files.length) return
    setReading('Abrindo o arquivo…')
    try {
      const texts: string[] = []
      for (const [index, file] of files.entries()) {
        const which = files.length > 1 ? ` (${index + 1} de ${files.length})` : ''
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          const { readPdfText } = await import('../services/pdfText')
          usedOcr.current = true
          texts.push(await readPdfText(file, (info) => setReading(info.mode === 'texto' ? `Lendo a página ${info.page} de ${info.pages}${which}…` : `Página ${info.page} de ${info.pages} é imagem, reconhecendo o texto${which} (pode levar um pouco)…`),
            (info) => setReading(`Reconhecendo o texto${which}… ${Math.round(info.progress * 100)}%`)))
        } else {
          const { readImageText } = await import('../services/ocr')
          usedOcr.current = true
          setReading(`Preparando o leitor de fotos${which}…`)
          texts.push(await readImageText(file, (info) => setReading(info.status === 'recognizing text' ? `Reconhecendo o texto${which}… ${Math.round(info.progress * 100)}%` : `Preparando o leitor de fotos${which}…`)))
        }
      }
      const result = texts.filter((item) => item.trim()).join(`\n${IMAGE_BREAK}\n`)
      if (!result.trim()) throw new Error('Não consegui ler texto nesse arquivo. Tente uma foto mais nítida, de frente e com boa luz.')
      setText(result); setOff(new Set()); reset()
      notify('notice', files.length > 1 ? `Li ${files.length} arquivos e juntei as compras, sem repetir. Confira antes de importar.` : 'Li o arquivo. Confira as linhas abaixo antes de importar.')
    } catch (cause) { notify('error', messageOf(cause)) } finally { setReading(''); if (fileRef.current) fileRef.current.value = ''; if (cameraRef.current) cameraRef.current.value = '' }
  }

  async function check() {
    try { setPreview(await local.importInvoices(batch(), { dryRun: true })) } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function confirm() {
    setBusy(true)
    try {
      const result = await local.importInvoices(batch())
      if (due && dueDiffers && saveDue && dest === due.period) writeCard({ ...(card ?? DEFAULT_CARD), dueDay: due.day })
      await onDone()
      if (dest !== 'auto') onImported?.(dest)
      notify('notice', `${result.added} lançamentos importados${result.duplicates ? `, ${result.duplicates} já existiam e foram ignorados` : ''}.`)
      onClose()
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  return <section className="panel paste-panel">
    <div className="panel-heading"><div><h2>Colar do banco ou da conversa</h2><p className="panel-sub">Cole linhas da fatura, notificações do banco ou mensagens do WhatsApp (“gastei 50 no mercado”). O robô separa os gastos e você confere.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div>
    <div className="button-row paste-files">
      <button className="secondary-button" disabled={!!reading} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Anexar PDF ou prints da fatura</button>
      <button className="secondary-button" disabled={!!reading} onClick={() => cameraRef.current?.click()}><Icon name="receipt" size={16} />Tirar foto</button>
      <input ref={fileRef} type="file" accept=".pdf,application/pdf,image/*" multiple hidden aria-label="Arquivo da fatura" onChange={(event) => void readFiles(event.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void readFiles(event.target.files)} />
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
      <div className="paste-dest">
        <label>Fatura de destino<select value={dest} onChange={(event) => { setDestChoice(event.target.value); reset() }} aria-label="Fatura de destino">
          <option value="auto">Pela data de cada compra</option>
          {destOptions.map((period) => <option key={period} value={period}>{destLabel(period)}</option>)}
        </select></label>
        {due && dest === due.period && <p className="paste-due"><Icon name="check" size={15} />Achei o vencimento <b>{formatDate(due.date)}</b> no texto: tudo vai para a fatura de {periodLabel(due.period)}.</p>}
        {due && dueDiffers && dest === due.period && <label className="check-line"><input type="checkbox" checked={saveDue} onChange={(event) => setSaveDue(event.target.checked)} />Usar dia {due.day} como vencimento deste cartão{card ? ` (hoje está dia ${card.dueDay})` : ''}</label>}
        {dest === 'auto' && <p className="hint">Cada compra vai para a fatura do mês em que cai pela data e pelo vencimento do cartão; parcelas vão para o mês da parcela.</p>}
      </div>
      <div className="paste-list" role="list">
        {parsed.rows.map((row) => {
          const hint = suggestFor(row.description, suggestions)
          return <label key={row.line} className={`paste-row ${off.has(row.line) ? 'off' : ''}`} role="listitem">
            <input type="checkbox" checked={!off.has(row.line)} onChange={() => { const next = new Set(off); if (next.has(row.line)) next.delete(row.line); else next.add(row.line); setOff(next); reset() }} />
            <span className="paste-date">{formatDate(row.date)}</span><span className="paste-desc">{row.description}</span>
            <span className="paste-who">{row.person ?? hint?.person ?? (person || 'sem responsável')}{row.origin ? ` · ${row.origin}` : hint ? ' · sugerido' : ''}{row.dateGuessed ? ' · data: hoje?' : ''}</span><span className="paste-amount">{money(row.amount)}</span>
          </label>
        })}
        {!parsed.rows.length && <p className="empty">Nenhuma linha com data e valor foi encontrada.</p>}
      </div>
      {parsed.skipped.length > 0 && <p className="hint">{parsed.skipped.length} {parsed.skipped.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}: {parsed.skipped.slice(0, 3).map((item) => `"${item.text.slice(0, 28)}" (${item.reason})`).join('; ')}{parsed.skipped.length > 3 ? '…' : ''}</p>}
      {preview && <p className="notice">Prévia: {preview.added} novos e {preview.duplicates} repetidos (serão ignorados){preview.invoicesCreated ? `, ${preview.invoicesCreated} fatura(s) nova(s)` : ''}.</p>}
      <div className="button-row">
        <button className="secondary-button" onClick={() => void check()} disabled={!ready}>Conferir</button>
        <button className="primary-button" onClick={() => void confirm()} disabled={!ready || busy}><Icon name="upload" size={16} />Importar {picked.length} ({money(total)})</button>
        {unknown > 0 && <span className="hint">{unknown === 1 ? '1 linha vai' : `${unknown} linhas vão`} sem responsável. Preencha o responsável padrão ou defina depois em Faturas.</span>}
      </div>
    </>}
  </section>
}
