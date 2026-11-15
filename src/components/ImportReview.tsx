import { useMemo, useState } from 'react'
import AskWizard, { type AskStep } from './AskWizard'
import { buildRowQuestions } from '../lib/assign'
import { formatDate, money } from '../lib/format'
import { suggestFor, type Suggestion } from '../lib/suggest'
import type { ImportInvoice, Transaction } from '../types'

interface Props {
  batch: ImportInvoice[]
  transactions: Transaction[]
  suggestions: Map<string, Suggestion>
  busy: boolean
  onCancel: () => void
  onConfirm: (batch: ImportInvoice[]) => void
}

const unique = (list: string[]) => [...new Set(list.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Antes de importar a planilha: confirma de quem é cada compra, uma por vez, e pergunta a categoria quando falta. */
export default function ImportReview({ batch, transactions, suggestions, busy, onCancel, onConfirm }: Props) {
  const flat = useMemo(() => batch.flatMap((invoice, i) => invoice.rows.map((row, j) => ({ ...row, id: i * 100000 + j, invoice: i, index: j }))), [batch])
  const people = useMemo(() => unique([...transactions.map((row) => row.person?.name ?? ''), ...flat.map((row) => row.person)]), [transactions, flat])
  const categories = useMemo(() => unique([...transactions.map((row) => row.category?.name ?? ''), ...flat.map((row) => row.category)]), [transactions, flat])
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const questions = useMemo(() => new Map(buildRowQuestions(flat.map((row) => ({ id: row.id, description: row.description, amount: row.amount, category: row.category, person: row.person, personFrom: row.person.trim() ? 'planilha' : '' })), transactions).map((q) => [q.id, q])), [flat, transactions])

  const steps = useMemo(() => flat.flatMap((row): AskStep[] => {
    const q = questions.get(row.id)
    const suggested = q?.suggestion?.person ?? suggestFor(row.description, suggestions)?.person ?? ''
    const reason = q?.suggestion?.reason ?? (suggested ? `Pelo nome, parece ser de ${suggested}.` : 'Não achei nada parecido no seu histórico. De quem é?')
    const meta = `${money(row.amount)} · ${formatDate(row.date)}${row.installmentCount ? ` · parcela ${row.installmentNumber}/${row.installmentCount}` : ''}${batch.length > 1 ? ` · ${batch[row.invoice].label}` : ''}`
    const list: AskStep[] = [{
      key: `p${row.id}`, tag: 'De quem é', title: row.description, meta, hint: reason, answer: answers[`p${row.id}`],
      options: [...(suggested ? [{ value: suggested, label: suggested, primary: true, note: row.person.trim() ? 'está na planilha' : 'costuma ser' }] : []), ...people.filter((name) => name !== suggested).slice(0, 7).map((name) => ({ value: name, label: name }))],
      other: { placeholder: 'outra pessoa', list: 'review-people', button: 'Atribuir' },
    }]
    if (!row.category.trim()) {
      const guess = suggestFor(row.description, suggestions)?.category ?? ''
      list.push({
        key: `c${row.id}`, tag: 'Categoria', title: row.description, meta, hint: guess ? `Pelo nome, parece ${guess}. Confere?` : 'A planilha não diz a categoria. Qual é?', answer: answers[`c${row.id}`],
        options: [...(guess ? [{ value: guess, label: guess, primary: true }] : []), ...categories.filter((name) => name !== guess).slice(0, 7).map((name) => ({ value: name, label: name }))],
        other: { placeholder: 'outra categoria', list: 'review-cats', button: 'Usar' },
      })
    }
    return list
  }), [flat, questions, suggestions, answers, people, categories, batch])

  const final = useMemo(() => batch.map((invoice, i) => ({ ...invoice, rows: invoice.rows.map((row, j) => {
    const id = i * 100000 + j
    return { ...row, person: answers[`p${id}`] ?? row.person, category: answers[`c${id}`] ?? row.category }
  }) })), [batch, answers])
  const rows = final.flatMap((invoice) => invoice.rows)
  const total = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
  const byPerson = [...rows.reduce((map, row) => map.set(row.person.trim() || 'Sem responsável', (map.get(row.person.trim() || 'Sem responsável') ?? 0) + Math.round(row.amount * 100)), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const blank = rows.filter((row) => !row.person.trim()).length

  const answer = (key: string, value: string) => setAnswers((all) => ({ ...all, [key]: value }))
  const guessed = steps.filter((step) => step.answer === undefined && step.options[0]?.primary)
  const bulk = guessed.length ? { label: `Aceitar os ${guessed.length} palpites do robô`, run: () => setAnswers((all) => ({ ...all, ...Object.fromEntries(guessed.map((step) => [step.key, step.options[0].value])) })) } : null

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <div className="modal assistant" role="dialog" aria-modal="true" aria-label="Conferir de quem é cada compra">
      <h2>De quem é cada compra?</h2>
      <p className="hint">Uma compra por vez. O palpite do robô aparece em destaque, mas só vale quando você toca.</p>
      <datalist id="review-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="review-cats">{categories.map((name) => <option key={name} value={name} />)}</datalist>
      <AskWizard steps={steps} onAnswer={answer} bulk={bulk} summary={<>
        <h3 className="ask-summary-title">Resumo antes de importar</h3>
        <section className="bank-summary" aria-label="Resumo da importação">
          <div><span className="muted">Vai entrar</span><b>{money(total)}</b><small className="muted">{rows.length} lançamentos em {final.length} {final.length === 1 ? 'fatura' : 'faturas'}</small></div>
          <div className="bank-cats" aria-label="Quanto cada pessoa deve"><span className="muted">Por pessoa</span>{byPerson.map(([name, cents]) => <small key={name}>{name} {money(cents / 100)}</small>)}</div>
        </section>
        {blank > 0 && <p className="hint neg">{blank} {blank === 1 ? 'compra está' : 'compras estão'} sem responsável.</p>}
        <div className="button-row"><button className="primary-button" disabled={busy || !rows.length} onClick={() => onConfirm(final)}>Importar {rows.length} lançamentos</button><button className="text-button" onClick={onCancel}>Cancelar</button></div>
      </>} />
    </div>
  </div>
}
