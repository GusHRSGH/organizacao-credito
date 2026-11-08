import { useEffect, useRef, useState, type FormEvent } from 'react'
import { messageOf, money } from '../lib/format'
import type { LocalSource } from '../services/localSource'
import type { Transaction } from '../types'

interface Props {
  row: Transaction
  group: Transaction[]
  local: LocalSource
  people: string[]
  categories: string[]
  onClose: () => void
  onSaved: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function EditDialog({ row, group, local, people, categories, onClose, onSaved, notify }: Props) {
  const parcelado = !!row.installment_group && group.length > 1
  const [scope, setScope] = useState<'one' | 'all'>('one')
  const first = [...group].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))[0] ?? row
  const groupTotal = Math.round(group.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)) / 100
  const [description, setDescription] = useState(row.description)
  const [amount, setAmount] = useState(String(row.amount).replace('.', ','))
  const [total, setTotal] = useState(String(groupTotal).replace('.', ','))
  const [date, setDate] = useState(row.occurred_on)
  const [startDate, setStartDate] = useState(first.occurred_on)
  const [person, setPerson] = useState(row.person?.name ?? '')
  const [category, setCategory] = useState(row.category?.name ?? '')
  const [count, setCount] = useState(String(row.installment_count ?? group.length))
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => { field.current?.focus() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const number = (text: string) => Number(text.replace(/\./g, '').replace(',', '.'))

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      if (parcelado && scope === 'all') {
        await local.updatePurchase(row.installment_group!, { description, total: number(total), occurredOn: startDate, personName: person, categoryName: category, installmentCount: Number(count) })
        notify('notice', 'Compra atualizada e parcelas recalculadas.')
      } else {
        await local.updateTransaction(row.id, { description, amount: number(amount), occurredOn: date, personName: person, categoryName: category })
        notify('notice', 'Lançamento atualizado.')
      }
      await onSaved(); onClose()
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  const whole = parcelado && scope === 'all'
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="modal" role="dialog" aria-modal="true" aria-label="Editar lançamento" onSubmit={(event) => void save(event)}>
      <h2>Editar lançamento</h2>
      {parcelado && <div className="segmented" role="radiogroup" aria-label="O que editar">
        <button type="button" role="radio" aria-checked={scope === 'one'} className={scope === 'one' ? 'on' : ''} onClick={() => setScope('one')}>Só esta parcela ({row.installment_number}/{row.installment_count})</button>
        <button type="button" role="radio" aria-checked={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Compra inteira</button>
      </div>}
      <label>Descrição<input ref={field} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} required /></label>
      <div className="modal-grid">
        {whole
          ? <><label>Valor total (R$)<input value={total} onChange={(event) => setTotal(event.target.value)} inputMode="decimal" required /></label>
            <label>Parcelas<input type="number" min={1} max={48} value={count} onChange={(event) => setCount(event.target.value)} required /></label>
            <label>Data da 1ª parcela<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label></>
          : <><label>Valor (R$)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required /></label>
            <label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></>}
        <label>Responsável<input value={person} onChange={(event) => setPerson(event.target.value)} list="edit-people" maxLength={80} required /></label>
        <label>Categoria<input value={category} onChange={(event) => setCategory(event.target.value)} list="edit-categories" maxLength={60} required /></label>
      </div>
      <datalist id="edit-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="edit-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
      {whole && <p className="hint">O total é dividido de novo em parcelas mensais iguais (centavos na última). Parcelas já pagas continuam pagas. Hoje: {money(groupTotal)} em {group.length}x.</p>}
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>Salvar</button></div>
    </form>
  </div>
}
