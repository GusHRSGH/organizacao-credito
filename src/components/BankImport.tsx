import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import MonthPicker from './MonthPicker'
import AskWizard, { type AskStep } from './AskWizard'
import { buildRowQuestions, findRefunds } from '../lib/assign'
import { categoryUncertain, classifyRows, futureInstallments, guessPeriod, readBankFile, summarizeIncoming, toImportRows, type BankFile } from '../lib/bankImport'
import { readCard } from '../lib/card'
import { fetchBills, readPluggy, toBankFile, type PluggyBill } from '../lib/pluggy'
import { readReview, reconcile, writeReview } from '../lib/reconcile'
import { formatDate, messageOf, money, pct } from '../lib/format'
import { buildInstallmentSuggestions, type Suggestion } from '../lib/suggest'
import { periodLabel } from '../services/installments'
import type { LocalSource } from '../services/localSource'
import type { Invoice, ImportResult, Transaction } from '../types'

interface Props {
  local: LocalSource
  invoices: Invoice[]
  transactions: Transaction[]
  /** Lançamentos atuais e de faturas apagadas: usados só para o robô sugerir e perguntar. */
  history?: Transaction[]
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
export default function BankImport({ local, invoices, transactions, history, people, categories, suggestions, onClose, onDone, notify }: Props) {
  const [file, setFile] = useState<BankFile | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const [period, setPeriod] = useState('')
  const [pickMonth, setPickMonth] = useState(false)
  const [defaultPerson, setDefaultPerson] = useState('')
  const [paid, setPaid] = useState(false)
  const [future, setFuture] = useState(true)
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [catAnswers, setCatAnswers] = useState<Record<string, string>>({})
  const [periodOk, setPeriodOk] = useState(false)
  const [futureAnswer, setFutureAnswer] = useState<string | undefined>(undefined)
  const [refunds, setRefunds] = useState<Record<number, 'ignore' | 'keep'>>({})
  const [dry, setDry] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const [pluggyBills, setPluggyBills] = useState<PluggyBill[] | null>(null)
  const pluggy = useMemo(() => readPluggy(), [])

  async function open(chosen: File | undefined) {
    if (!chosen) return
    setStatus('Abrindo o arquivo…'); setName(chosen.name)
    try {
      const bank = await readBankFile(chosen, { people, categories, today: new Date().toISOString().slice(0, 10) }, setStatus)
      setFile(bank); setEdits({}); setAnswers({}); setCatAnswers({}); setPeriodOk(false); setFutureAnswer(undefined); setRefunds({}); setDry(null)
      setPeriod(guessPeriod(bank.periodHint, bank.rows, readCard()))
    } catch (cause) { notify('error', messageOf(cause)) } finally { setStatus(''); if (pick.current) pick.current.value = '' }
  }

  async function fromBank() {
    if (!pluggy) return
    setStatus('Buscando as compras no banco pela Pluggy…')
    try {
      const found = await fetchBills(pluggy, readCard())
      if (!found.bills.length) throw new Error('A Pluggy não trouxe compras de cartão dos últimos 75 dias. O banco atualiza a cada 24 horas; tente de novo mais tarde.')
      setPluggyBills(found.bills)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setStatus('') }
  }

  function pickBill(bill: PluggyBill) {
    const bank = toBankFile(bill)
    setFile(bank); setName(`Meu Pluggy, fatura de ${periodLabel(bill.period)}`); setEdits({}); setAnswers({}); setCatAnswers({}); setPeriodOk(false); setFutureAnswer(undefined); setRefunds({}); setDry(null); setPluggyBills(null)
    setPeriod(guessPeriod(bank.periodHint, bank.rows, readCard()))
  }

  const existingInvoice = invoices.find((invoice) => invoice.period === period)
  const existingRows = useMemo(() => (existingInvoice ? transactions.filter((row) => row.invoice_id === existingInvoice.id) : []), [transactions, existingInvoice])
  const learned = history ?? transactions
  const installments = useMemo(() => buildInstallmentSuggestions(learned), [learned])
  const base = useMemo(() => (file ? classifyRows(file.rows, { suggestions, categories, defaultPerson, installments }) : []), [file, suggestions, categories, defaultPerson, installments])
  const recon = useMemo(() => reconcile(base, existingRows), [base, existingRows])
  const rows = useMemo(() => base.map((row) => {
    // Cada compra tem a própria resposta; o IOF segue a compra a que pertence.
    const answered = answers[`p${row.iofOf ?? row.id}`]
    const own = answered !== undefined ? { person: answered, personFrom: 'resposta' as const } : {}
    const cat = catAnswers[`c${row.iofOf ?? row.id}`]
    const ownCat = cat !== undefined ? { category: cat, categoryFrom: 'resposta' as const } : {}
    return { ...row, ...own, ...ownCat, ...edits[row.id], include: edits[row.id]?.include ?? (refunds[row.id] === 'ignore' ? false : !recon.matched.has(row.id)), match: recon.matched.get(row.id) }
  }), [base, edits, recon, answers, catAnswers, refunds])
  const refundGuesses = useMemo(() => findRefunds(base.map((row) => ({ id: row.id, date: row.date, amount: row.amount })), file?.credits ?? []), [base, file])
  const waiting = useMemo(() => new Set(refundGuesses.filter((guess) => refunds[guess.rowId] === undefined).map((guess) => guess.rowId)), [refundGuesses, refunds])
  const askable = useMemo(() => base.filter((row) => !recon.matched.has(row.id) && refunds[row.id] !== 'ignore' && !waiting.has(row.id)), [base, recon, refunds, waiting])
  const asked = useMemo(() => askable.filter((row) => row.iofOf === null), [askable])
  const rowQuestions = useMemo(() => new Map(buildRowQuestions(asked.map((row) => ({ id: row.id, description: row.description, amount: row.amount, category: row.category, person: row.person, personFrom: row.personFrom })), learned).map((q) => [q.id, q])), [asked, learned])
  const chosen = useMemo(() => rows.filter((row) => row.include), [rows])
  const summary = useMemo(() => summarizeIncoming(chosen), [chosen])
  const importRows = useMemo(() => toImportRows(chosen, paid), [chosen, paid])
  const coming = useMemo(() => futureInstallments(importRows, period, transactions), [importRows, period, transactions])
  const comingLabel = coming.entries.length ? `${coming.entries.length === 1 ? coming.entries[0].label : `${coming.entries[0].label} a ${coming.entries[coming.entries.length - 1].label}`}` : ''
  const steps = useMemo(() => {
    const list: AskStep[] = []
    if (file && !file.periodHint) list.push({ key: 'period', tag: 'Mês da fatura', title: `Essa fatura é de ${periodLabel(period)}?`, hint: 'O nome do arquivo não diz o mês. Pelas datas das compras, parece esse.', answer: periodOk ? 'ok' : undefined,
      options: [{ value: 'ok', label: `Sim, ${periodLabel(period)}`, primary: true }, { value: 'pick', label: 'Não, escolher o mês' }] })
    for (const guess of refundGuesses) {
      const row = base[guess.rowId]
      list.push({ key: `r${guess.rowId}`, tag: 'Estorno', title: row.description, meta: `${money(row.amount)} em ${formatDate(row.date)}`, answer: refunds[guess.rowId],
        hint: `Tem um crédito de ${money(guess.credit.amount)} em ${formatDate(guess.credit.date)} (“${guess.credit.description}”). Foi estornada ou cancelada?`,
        options: [{ value: 'ignore', label: 'Sim, não importar', primary: true }, { value: 'keep', label: 'Não, importar' }] })
    }
    if (coming.count > 0) list.push({ key: 'future', tag: 'Parcelas', title: `Achei ${coming.count} ${coming.count === 1 ? 'parcela que ainda vai vir' : 'parcelas que ainda vão vir'} (${money(coming.total)})`, hint: `Lanço desde já nas próximas faturas (${comingLabel})?`, answer: futureAnswer,
      options: [{ value: 'sim', label: coming.count === 1 ? 'Sim, lançar' : `Sim, lançar as ${coming.count}`, primary: true }, { value: 'nao', label: 'Não, só esta fatura' }] })
    for (const row of asked) {
      const q = rowQuestions.get(row.id)
      const suggested = q?.suggestion?.person
      const meta = `${money(row.amount)} · ${formatDate(row.date)}${row.installmentCount ? ` · parcela ${row.installmentNumber}/${row.installmentCount}` : ''}`
      list.push({ key: `p${row.id}`, tag: 'De quem é', title: row.description, meta, answer: answers[`p${row.id}`],
        hint: q?.suggestion ? q.suggestion.reason : 'Não achei nada parecido no seu histórico. De quem é?',
        options: [...(suggested ? [{ value: suggested, label: suggested, primary: true, note: 'costuma ser' }] : []), ...people.filter((name) => name !== suggested).slice(0, 7).map((name) => ({ value: name, label: name }))],
        other: { placeholder: 'outra pessoa', list: 'bank-people', button: 'Atribuir' } })
      if (categoryUncertain(row) && edits[row.id]?.category === undefined) {
        const guess = row.categoryFrom === 'nova' ? row.category : ''
        list.push({ key: `c${row.id}`, tag: 'Categoria', title: row.description, meta, answer: catAnswers[`c${row.id}`],
          hint: guess ? `O banco chama isso de “${guess}”, e você não tem essa categoria. Crio uma nova ou uso outra?` : 'Não consegui adivinhar a categoria. Qual é?',
          options: [...(guess ? [{ value: guess, label: `Criar “${guess}”`, primary: true }] : []), ...categories.filter((name) => name !== guess).slice(0, 7).map((name) => ({ value: name, label: name }))],
          other: { placeholder: 'outra categoria', list: 'bank-cats', button: 'Usar' } })
      }
    }
    return list
  }, [file, period, periodOk, refundGuesses, base, refunds, coming, comingLabel, futureAnswer, asked, rowQuestions, answers, catAnswers, people, categories, edits])
  function onAnswer(key: string, value: string) {
    if (key === 'period') { if (value === 'pick') setPickMonth(true); setPeriodOk(true); return }
    if (key === 'future') { setFutureAnswer(value); setFuture(value === 'sim'); return }
    if (key.startsWith('r')) { setRefunds((all) => ({ ...all, [Number(key.slice(1))]: value as 'ignore' | 'keep' })); return }
    if (key.startsWith('p')) { setAnswers((all) => ({ ...all, [key]: value })); return }
    if (key.startsWith('c')) setCatAnswers((all) => ({ ...all, [key]: value }))
  }
  const guessed = steps.filter((step) => step.answer === undefined && step.options[0]?.primary)
  const acceptGuesses = guessed.length ? { label: `Aceitar os ${guessed.length} palpites do robô`, run: () => guessed.forEach((step) => onAnswer(step.key, step.options[0].value)) } : null

  const previous = useMemo(() => {
    const before = [...invoices].filter((invoice) => invoice.period < period).sort((a, b) => b.period.localeCompare(a.period))[0]
    if (!before) return null
    return { label: before.label, total: transactions.filter((row) => row.invoice_id === before.id).reduce((s, row) => s + Math.round(Number(row.amount) * 100), 0) / 100 }
  }, [invoices, transactions, period])

  useEffect(() => {
    if (!file || !period || !chosen.length) { setDry(null); return }
    let alive = true
    void local.importInvoices([{ period, label: periodLabel(period), rows: importRows }], { dryRun: true }).then((value) => { if (alive) setDry(value) }).catch(() => { if (alive) setDry(null) })
    return () => { alive = false }
  }, [file, period, chosen, importRows, local])

  const edit = (id: number, patch: Edit) => setEdits((all) => ({ ...all, [id]: { ...all[id], ...patch } }))
  const newCategories = [...new Set(chosen.filter((row) => row.categoryFrom === 'nova' || (row.categoryFrom === 'resposta' && !categories.includes(row.category))).map((row) => row.category))]
  const noPerson = chosen.filter((row) => !row.person.trim()).length

  async function confirm() {
    setBusy(true)
    try {
      const knownIds = new Set(existingRows.map((row) => row.id))
      const done = await local.importInvoices([{ period, label: periodLabel(period), rows: importRows }, ...(future ? coming.entries : [])])
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
        <p>{result.added} lançamentos entraram (marcados “Conferir” na fatura){result.duplicates ? `, ${result.duplicates} já existiam e foram ignorados` : ''}. Total desta importação: <b>{money(summary.total)}</b>.{future && coming.count > 0 ? ` Também lancei ${coming.count} ${coming.count === 1 ? 'parcela futura' : 'parcelas futuras'} (${money(coming.total)}) em ${comingLabel}.` : ''}</p>
        <div className="button-row"><button className="primary-button" onClick={() => void onDone(period, 'dashboard')}>Ver na visão geral</button><button className="secondary-button" onClick={() => void onDone(period, 'invoices')}>Ver os lançamentos</button><button className="text-button" onClick={onClose}>Fechar</button></div>
      </> : !file ? <>
        <h2>Importar fatura do banco</h2>
        <p className="hint">Exporte a fatura no app do banco (no Nubank, o CSV ou o PDF da fatura) e escolha o arquivo aqui. O robô separa compras de pagamentos e estornos, acha as parcelas, descobre o mês da fatura e classifica a categoria e propõe o responsável pelo seu histórico. O que ele não souber, ele pergunta. Você confere tudo antes de entrar.</p>
        <div className="button-row"><button className="primary-button" disabled={!!status} onClick={() => pick.current?.click()}><Icon name="upload" size={16} />Escolher o arquivo da fatura</button>
          <input ref={pick} type="file" accept=".csv,.xlsx,.pdf,.txt,application/pdf,image/*" hidden aria-label="Arquivo da fatura do banco" onChange={(event) => void open(event.target.files?.[0])} />
          <button className="text-button" onClick={onClose}>Cancelar</button>{status && <span className="muted" role="status">{status}</span>}</div>
        <p className="hint">Aceita CSV, XLSX, PDF e foto. Tudo é lido neste aparelho; nada é enviado para fora.</p>
        {pluggy && <section className="bank-asks" aria-label="Buscar no banco">
          <h3>Ou busque direto no banco</h3>
          {!pluggyBills ? <>
            <p className="hint">Usa a sua conexão do Meu Pluggy (Configurações, Avançado). Traz as compras dos últimos 75 dias, já separadas por fatura.</p>
            <div className="button-row"><button className="secondary-button" disabled={!!status} onClick={() => void fromBank()}><Icon name="bank" size={16} />Buscar no banco (Meu Pluggy)</button></div>
          </> : <>
            <p className="hint">Achei estas faturas. Qual você quer conferir?</p>
            <div className="button-row">{pluggyBills.map((bill) => <button key={bill.period} className="secondary-button" onClick={() => pickBill(bill)}>{periodLabel(bill.period)} · {bill.rows.length} {bill.rows.length === 1 ? 'compra' : 'compras'}</button>)}</div>
          </>}
        </section>}
      </> : <>
        <h2>Conferi sua fatura</h2>
        <p className="hint">{name}: {file.rows.length} compras encontradas{file.ignored.length ? `, ${file.ignored.length} ${file.ignored.length === 1 ? 'linha ignorada' : 'linhas ignoradas'} (pagamentos, estornos ou ruído)` : ''}.</p>
        {pickMonth && <MonthPicker value={period} onChange={(p) => { setPeriod(p); setPickMonth(false) }} existing={invoices.map((invoice) => invoice.period)} />}
        <datalist id="bank-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="bank-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <AskWizard steps={steps} onAnswer={onAnswer} bulk={acceptGuesses} summary={<>
          <h3 className="ask-summary-title">Resumo antes de importar</h3>
        <section className="bank-top">
          <div><span className="muted">Fatura</span><b>{periodLabel(period)}</b>{existingInvoice ? <small className="muted">já existe, entra nela</small> : <small className="muted">será criada</small>}
            <button className="text-button" onClick={() => setPickMonth(!pickMonth)} aria-expanded={pickMonth}>{pickMonth ? 'Fechar' : 'Trocar mês'}</button></div>
          <label>Responsável padrão<input value={defaultPerson} onChange={(event) => setDefaultPerson(event.target.value)} list="bank-people" placeholder="Opcional: quem paga o que sobrar" aria-label="Responsável padrão" /></label>
          <label className="check"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />Marcar tudo como já pago</label>
          {coming.count > 0 && <label className="check"><input type="checkbox" checked={future} onChange={(event) => setFuture(event.target.checked)} />Lançar {coming.count === 1 ? 'a' : 'as'} {coming.count} {coming.count === 1 ? 'parcela que falta' : 'parcelas que faltam'} ({money(coming.total)}) em {comingLabel}</label>}
        </section>
        <section className="bank-summary" aria-label="Resumo da importação">
          <div><span className="muted">Vai entrar</span><b>{money(summary.total)}</b><small className="muted">{summary.count} lançamentos{summary.installments ? ` · ${summary.installments} ${summary.installments === 1 ? 'parcelado' : 'parcelados'}` : ''}</small></div>
          {previous && <div><span className="muted">Contra {previous.label}</span><b className={variation !== null && variation > 0 ? 'neg' : 'pos'}>{variation === null ? '—' : `${variation > 0 ? '+' : ''}${pct(variation)}`}</b><small className="muted">{money(previous.total)} lá</small></div>}
          {dry && <div><span className="muted">Já existem</span><b>{dry.duplicates}</b><small className="muted">{dry.added} novos</small></div>}
          <div className="bank-cats" aria-label="Quanto cada pessoa deve"><span className="muted">Por pessoa</span>{summary.byPerson.slice(0, 4).map((p) => <small key={p.name}>{p.name} {money(p.total)}</small>)}</div>
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

        <details className="bank-all"><summary>Ver a lista completa ({rows.length} {rows.length === 1 ? 'compra' : 'compras'})</summary>
        <div className="bank-list" role="list">{rows.map((row) => <div key={row.id} role="listitem" className={`bank-row ${row.include ? '' : 'off'}`}>
          <input type="checkbox" checked={row.include} onChange={() => edit(row.id, { include: !row.include })} aria-label={`Importar ${row.description}`} />
          <span className="bank-date">{formatDate(row.date)}</span>
          <input className="bank-desc" value={row.description} onChange={(event) => edit(row.id, { description: event.target.value })} maxLength={160} aria-label={`Descrição de ${row.description}`} />
          <span className="bank-amount">{money(row.amount)}</span>
          <input className={row.person.trim() ? '' : 'missing'} value={row.person} onChange={(event) => edit(row.id, { person: event.target.value })} list="bank-people" placeholder="responsável" aria-label={`Responsável de ${row.description}`} />
          <input value={row.category} onChange={(event) => edit(row.id, { category: event.target.value })} list="bank-cats" placeholder="categoria" aria-label={`Categoria de ${row.description}`} />
          <small className="bank-why muted">{[row.match ? `já lançado: ${row.match.description}` : '', row.installmentCount ? `parcela ${row.installmentNumber}/${row.installmentCount}` : '', row.renamed ? 'nome limpo' : '', row.categoryFrom ? `categoria: ${row.categoryFrom === 'histórico' ? 'seu histórico' : row.categoryFrom === 'banco' ? 'do banco' : row.categoryFrom === 'palavras' ? 'pelo nome' : row.categoryFrom === 'resposta' ? 'sua resposta' : 'nova'}` : '', row.personFrom === 'histórico' ? 'responsável: histórico' : row.personFrom === 'resposta' ? 'responsável: sua resposta' : '', row.iofOf !== null ? 'IOF da compra internacional' : ''].filter(Boolean).join(' · ')}</small>
        </div>)}</div>
        </details>
        {file.ignored.length > 0 && <details className="issues"><summary>{file.ignored.length} {file.ignored.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}</summary><ul>{file.ignored.slice(0, 40).map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
        <div className="button-row"><button className="primary-button" disabled={busy || !chosen.length || !period} onClick={() => void confirm()}>Importar {chosen.length} lançamentos para {periodLabel(period)}</button><button className="secondary-button" onClick={() => { setFile(null); setEdits({}); setAnswers({}); setCatAnswers({}); setPeriodOk(false); setFutureAnswer(undefined); setRefunds({}) }}>Outro arquivo</button><button className="text-button" onClick={onClose}>Cancelar</button></div>
        </>} />
      </>}
    </div>
  </div>
}
