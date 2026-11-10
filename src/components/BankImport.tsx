import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import MonthPicker from './MonthPicker'
import { classifyRows, guessPeriod, readBankFile, summarizeIncoming, toImportRows, type BankFile } from '../lib/bankImport'
import { readCard } from '../lib/card'
import { readReview, reconcile, writeReview } from '../lib/reconcile'
import { formatDate, messageOf, money, pct } from '../lib/format'
import type { Suggestion } from '../lib/suggest'
import { periodLabel } from '../services/installments'
import type { LocalSource } from '../services/localSource'
import type { Invoice, ImportResult, Transaction } from '../types'

interface Props {
  local: LocalSource
  invoices: Invoice[]
  transactions: Transaction[]
  people: string[]
  categories: string[]
  suggestions: Map<string, Suggestion>
  onClose: () => void
  /** Chamado ao terminar, com a fatura criada ou atualizada. */
  onDone: (period: string, where: 'dashboard' | 'invoices') => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

type Edit = Partial<{ description: string; person: string; category: string; include: boolean }>

/** Importar a fatura exportada do banco: o robô lê, classifica e mostra tudo para você conferir antes de entrar. */
export default function BankImport({ local, invoices, transactions, people, categories, suggestions, onClose, onDone, notify }: Props) {
  const [file, setFile] = useState<BankFile | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const [period, setPeriod] = useState('')
  const [pickMonth, setPickMonth] = useState(false)
  const [defaultPerson, setDefaultPerson] = useState(() => people[0] ?? '')
  const [paid, setPaid] = useState(false)
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [dry, setDry] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const pick = useRef<HTMLInputElement>(null)

  async function open(chosen: File | undefined) {
    if (!chosen) return
    setStatus('Abrindo o arquivo…'); setName(chosen.name)
    try {
      const bank = await readBankFile(chosen, { people, categories, today: new Date().toISOString().slice(0, 10) }, setStatus)
      setFile(bank); setEdits({}); setDry(null)
      setPeriod(guessPeriod(bank.periodHint, bank.rows, readCard()))
    } catch (cause) { notify('error', messageOf(cause)) } finally { setStatus(''); if (pick.current) pick.current.value = '' }
  }

  const existingInvoice = invoices.find((invoice) => invoice.period === period)
  const existingRows = useMemo(() => (existingInvoice ? transactions.filter((row) => row.invoice_id === existingInvoice.id) : []), [transactions, existingInvoice])
  const base = useMemo(() => (file ? classifyRows(file.rows, { suggestions, categories, defaultPerson }) : []), [file, suggestions, categories, defaultPerson])
  const recon = useMemo(() => reconcile(base, existingRows), [base, existingRows])
  const rows = useMemo(() => base.map((row) => ({ ...row, ...edits[row.id], include: edits[row.id]?.include ?? !recon.matched.has(row.id), match: recon.matched.get(row.id) })), [base, edits, recon])
  const chosen = useMemo(() => rows.filter((row) => row.include), [rows])
  const summary = useMemo(() => summarizeIncoming(chosen), [chosen])
  const previous = useMemo(() => {
    const before = [...invoices].filter((invoice) => invoice.period < period).sort((a, b) => b.period.localeCompare(a.period))[0]
    if (!before) return null
    return { label: before.label, total: transactions.filter((row) => row.invoice_id === before.id).reduce((s, row) => s + Math.round(Number(row.amount) * 100), 0) / 100 }
  }, [invoices, transactions, period])

  useEffect(() => {
    if (!file || !period || !chosen.length) { setDry(null); return }
    let alive = true
    void local.importInvoices([{ period, label: periodLabel(period), rows: toImportRows(chosen, paid) }], { dryRun: true }).then((value) => { if (alive) setDry(value) }).catch(() => { if (alive) setDry(null) })
    return () => { alive = false }
  }, [file, period, chosen, paid, local])

  const edit = (id: number, patch: Edit) => setEdits((all) => ({ ...all, [id]: { ...all[id], ...patch } }))
  const newCategories = [...new Set(chosen.filter((row) => row.categoryFrom === 'nova').map((row) => row.category))]
  const noPerson = chosen.filter((row) => !row.person.trim()).length

  async function confirm() {
    setBusy(true)
    try {
      const knownIds = new Set(existingRows.map((row) => row.id))
      const done = await local.importInvoices([{ period, label: periodLabel(period), rows: toImportRows(chosen, paid) }])
      const created = (await local.listInvoices()).find((invoice) => invoice.period === period)
      if (created && done.added > 0) {
        const fresh = (await local.listTransactions(created.id)).filter((row) => !knownIds.has(row.id)).map((row) => row.id)
        writeReview([...readReview(), ...fresh])
      }
      setResult(done)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  const bankTotal = base.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
  const appTotal = existingRows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100
  const variation = previous && previous.total > 0 ? (summary.total - previous.total) / previous.total : null

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="modal assistant bank" role="dialog" aria-modal="true" aria-label="Importar fatura do banco">
      {result ? <>
        <h2>Fatura de {periodLabel(period)} pronta</h2>
        <p>{result.added} lançamentos entraram (marcados “Conferir” na fatura){result.duplicates ? `, ${result.duplicates} já existiam e foram ignorados` : ''}. Total desta importação: <b>{money(summary.total)}</b>.</p>
        <div className="button-row"><button className="primary-button" onClick={() => void onDone(period, 'dashboard')}>Ver na visão geral</button><button className="secondary-button" onClick={() => void onDone(period, 'invoices')}>Ver os lançamentos</button><button className="text-button" onClick={onClose}>Fechar</button></div>
      </> : !file ? <>
        <h2>Importar fatura do banco</h2>
        <p className="hint">Exporte a fatura no app do banco (no Nubank, o CSV ou o PDF da fatura) e escolha o arquivo aqui. O robô separa compras de pagamentos e estornos, acha as parcelas, descobre o mês da fatura e classifica responsável e categoria pelo seu histórico. Você confere tudo antes de entrar.</p>
        <div className="button-row"><button className="primary-button" disabled={!!status} onClick={() => pick.current?.click()}><Icon name="upload" size={16} />Escolher o arquivo da fatura</button>
          <input ref={pick} type="file" accept=".csv,.xlsx,.pdf,.txt,application/pdf,image/*" hidden aria-label="Arquivo da fatura do banco" onChange={(event) => void open(event.target.files?.[0])} />
          <button className="text-button" onClick={onClose}>Cancelar</button>{status && <span className="muted" role="status">{status}</span>}</div>
        <p className="hint">Aceita CSV, XLSX, PDF e foto. Tudo é lido neste aparelho; nada é enviado para fora.</p>
      </> : <>
        <h2>Conferi sua fatura</h2>
        <p className="hint">{name}: {file.rows.length} compras encontradas{file.ignored.length ? `, ${file.ignored.length} ${file.ignored.length === 1 ? 'linha ignorada' : 'linhas ignoradas'} (pagamentos, estornos ou ruído)` : ''}.</p>
        <section className="bank-top">
          <div><span className="muted">Fatura</span><b>{periodLabel(period)}</b>{existingInvoice ? <small className="muted">já existe, entra nela</small> : <small className="muted">será criada</small>}
            <button className="text-button" onClick={() => setPickMonth(!pickMonth)} aria-expanded={pickMonth}>{pickMonth ? 'Fechar' : 'Trocar mês'}</button></div>
          <label>Responsável padrão<input value={defaultPerson} onChange={(event) => setDefaultPerson(event.target.value)} list="bank-people" placeholder="Quem paga o que eu não reconhecer" aria-label="Responsável padrão" /></label>
          <label className="check"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />Marcar tudo como já pago</label>
        </section>
        {pickMonth && <MonthPicker value={period} onChange={(p) => { setPeriod(p); setPickMonth(false) }} existing={invoices.map((invoice) => invoice.period)} />}
        <datalist id="bank-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="bank-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>

        <section className="bank-summary" aria-label="Resumo da importação">
          <div><span className="muted">Vai entrar</span><b>{money(summary.total)}</b><small className="muted">{summary.count} lançamentos{summary.installments ? ` · ${summary.installments} ${summary.installments === 1 ? 'parcelado' : 'parcelados'}` : ''}</small></div>
          {previous && <div><span className="muted">Contra {previous.label}</span><b className={variation !== null && variation > 0 ? 'neg' : 'pos'}>{variation === null ? '—' : `${variation > 0 ? '+' : ''}${pct(variation)}`}</b><small className="muted">{money(previous.total)} lá</small></div>}
          {dry && <div><span className="muted">Já existem</span><b>{dry.duplicates}</b><small className="muted">{dry.added} novos</small></div>}
          <div className="bank-cats"><span className="muted">Maiores categorias</span>{summary.byCategory.slice(0, 4).map((c) => <small key={c.name}>{c.name} {money(c.total)}</small>)}</div>
        </section>
        {existingRows.length > 0 && <section className="bank-recon" aria-label="Conciliação com o que você já lançou">
          <h3>Conciliação com o que você já lançou em {periodLabel(period)}</h3>
          <div className="bank-summary">
            <div><span className="muted">Conferem</span><b className="pos">{recon.matched.size}</b><small className="muted">já estavam lançadas, não entram de novo</small></div>
            <div><span className="muted">Só no banco</span><b>{base.length - recon.matched.size}</b><small className="muted">entram para você conferir</small></div>
            <div><span className="muted">Só no app</span><b className={recon.onlyApp.length ? 'neg' : ''}>{recon.onlyApp.length}</b><small className="muted">o banco não cobrou</small></div>
            <div><span className="muted">Diferença</span><b className={Math.abs(bankTotal - appTotal) > 0.004 ? 'neg' : 'pos'}>{Math.abs(bankTotal - appTotal) > 0.004 ? money(bankTotal - appTotal) : 'zerada'}</b><small className="muted">banco {money(bankTotal)} x app {money(appTotal)}</small></div>
          </div>
          {recon.onlyApp.length > 0 && <details className="issues"><summary>{recon.onlyApp.length} {recon.onlyApp.length === 1 ? 'lançamento seu que o banco não cobrou' : 'lançamentos seus que o banco não cobrou'}</summary><ul>{recon.onlyApp.map((row) => <li key={row.id}>{formatDate(row.occurred_on)} · {row.description} · {money(Number(row.amount))}{row.person?.name ? ` · ${row.person.name}` : ''}</li>)}</ul></details>}
        </section>}
        {newCategories.length > 0 && <p className="hint">Categorias novas que serão criadas: {newCategories.join(', ')}. Troque na lista se já tiver uma equivalente.</p>}
        {noPerson > 0 && <p className="hint neg">{noPerson} {noPerson === 1 ? 'compra está' : 'compras estão'} sem responsável. Preencha o responsável padrão ou cada linha.</p>}

        <div className="bank-list" role="list">{rows.map((row) => <div key={row.id} role="listitem" className={`bank-row ${row.include ? '' : 'off'}`}>
          <input type="checkbox" checked={row.include} onChange={() => edit(row.id, { include: !row.include })} aria-label={`Importar ${row.description}`} />
          <span className="bank-date">{formatDate(row.date)}</span>
          <input className="bank-desc" value={row.description} onChange={(event) => edit(row.id, { description: event.target.value })} maxLength={160} aria-label={`Descrição de ${row.description}`} />
          <span className="bank-amount">{money(row.amount)}</span>
          <input value={row.person} onChange={(event) => edit(row.id, { person: event.target.value })} list="bank-people" placeholder="responsável" aria-label={`Responsável de ${row.description}`} />
          <input value={row.category} onChange={(event) => edit(row.id, { category: event.target.value })} list="bank-cats" placeholder="categoria" aria-label={`Categoria de ${row.description}`} />
          <small className="bank-why muted">{[row.match ? `já lançado: ${row.match.description}` : '', row.installmentCount ? `parcela ${row.installmentNumber}/${row.installmentCount}` : '', row.renamed ? 'nome limpo' : '', row.categoryFrom ? `categoria: ${row.categoryFrom === 'histórico' ? 'seu histórico' : row.categoryFrom === 'banco' ? 'do banco' : row.categoryFrom === 'palavras' ? 'pelo nome' : 'nova'}` : '', row.personFrom === 'histórico' ? 'responsável: histórico' : ''].filter(Boolean).join(' · ')}</small>
        </div>)}</div>
        {file.ignored.length > 0 && <details className="issues"><summary>{file.ignored.length} {file.ignored.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}</summary><ul>{file.ignored.slice(0, 40).map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
        <div className="button-row"><button className="primary-button" disabled={busy || !chosen.length || !period} onClick={() => void confirm()}>Importar {chosen.length} lançamentos para {periodLabel(period)}</button><button className="secondary-button" onClick={() => { setFile(null); setEdits({}) }}>Outro arquivo</button><button className="text-button" onClick={onClose}>Cancelar</button></div>
      </>}
    </div>
  </div>
}
