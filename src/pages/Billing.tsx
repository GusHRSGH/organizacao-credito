import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { personToken, type DrillFilter } from '../lib/drill'
import { EmptyState, Metric, PageHeading } from '../components/ui'
import ReceivingPanel from '../components/ReceivingPanel'
import SettleByAmount from '../components/SettleByAmount'
import FeePanel, { type FeeBlock } from '../components/FeePanel'
import { feeLine, feeSplitFor, spendByPerson } from '../lib/fee'
import { billsByPerson, buildGroupMessage, buildMessage, type FeeCharge, type PersonBill } from '../lib/billing'
import { readReceiving } from '../lib/receiving'
import { formatDate, messageOf, money } from '../lib/format'
import type { CardFee, DataSource, Invoice, Transaction } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
  onDrill: (filter: DrillFilter) => void
}

export default function Billing({ source, invoices, transactions, invoiceId, onInvoice, onChanged, notify, onDrill }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [scope, setScope] = useState<'month' | 'all'>('month')
  const [receiving, setReceiving] = useState(readReceiving)
  const invoice = invoices.find((item) => item.id === invoiceId)
  const all = scope === 'all'
  const [fees, setFees] = useState<CardFee[]>([])
  const loadFees = useCallback(async () => { try { setFees(await source.listFees()) } catch { setFees([]) } }, [source])
  useEffect(() => { void loadFees() }, [loadFees, transactions])
  const labels = useMemo(() => new Map(invoices.map((item) => [item.id, item.label])), [invoices])

  // Taxa de uso do cartão: uma por fatura, calculada sobre o gasto total (pago e pendente) de cada um.
  const feeBlocks: FeeBlock[] = useMemo(() => {
    const block = (id: string): FeeBlock => ({ invoiceId: id, label: labels.get(id) ?? 'Fatura', split: feeSplitFor(id, invoices, fees, transactions), spend: spendByPerson(transactions.filter((row) => row.invoice_id === id)) })
    if (!all) return invoiceId ? [block(invoiceId)] : []
    const open = new Set(transactions.filter((row) => row.status !== 'paid').map((row) => row.invoice_id))
    for (const fee of fees) if (fee.paid.length < 1000) open.add(fee.invoice_id)
    return [...open].filter((id) => invoices.some((item) => item.id === id)).sort((a, b) => (invoices.find((i) => i.id === b)?.period ?? '').localeCompare(invoices.find((i) => i.id === a)?.period ?? ''))
      .map(block).filter((item) => item.split?.shares.some((share) => !share.paid))
  }, [all, invoiceId, invoices, fees, transactions, labels])
  const feesOf = useCallback((name: string): Array<FeeCharge & { invoiceId: string; fee: CardFee }> => feeBlocks.flatMap((block) => {
    const share = block.split?.shares.find((item) => item.name === name && !item.paid && item.share > 0)
    return share && block.split ? [{ invoiceId: block.invoiceId, fee: block.split.fee, amount: share.share, text: `${feeLine(block.split.fee, share)}${all ? ` · ${block.label}` : ''}` }] : []
  }), [feeBlocks, all])
  const feeDue = useMemo(() => new Map(feeBlocks.flatMap((block) => block.split?.shares ?? []).filter((share) => !share.paid).reduce((map, share) => map.set(share.name, (map.get(share.name) ?? 0) + share.share), new Map<string, number>())), [feeBlocks])
  const bills = useMemo(() => {
    const list = billsByPerson(transactions.filter((row) => (all ? row.status !== 'paid' : row.invoice_id === invoiceId)))
    // Quem só deve a taxa (já pagou as compras) também aparece na cobrança.
    for (const name of feeDue.keys()) if (!list.some((bill) => bill.name === name)) list.push({ name, rows: [], total: 0, paid: 0, pending: 0 })
    return list
  }, [transactions, invoiceId, all, feeDue])
  const dueOf = (bill: PersonBill) => (Math.round(bill.pending * 100) + Math.round((feeDue.get(bill.name) ?? 0) * 100)) / 100
  async function saveFee(fee: CardFee) {
    try { await source.saveFee(fee); await loadFees() } catch (cause) { notify('error', messageOf(cause)) }
  }
  async function payFees(name: string) {
    for (const charge of feesOf(name)) await source.saveFee({ ...charge.fee, paid: [...charge.fee.paid.filter((n) => n !== name), name] })
    await loadFees()
  }
  const openInvoices = new Set(transactions.filter((row) => row.status !== 'paid').map((row) => row.invoice_id)).size
  const scopeLabel = all ? `${openInvoices} ${openInvoices === 1 ? 'fatura' : 'faturas'}` : invoice?.label ?? 'este mês'
  const total = bills.reduce((sum, bill) => sum + Math.round(bill.total * 100), 0) / 100
  const pending = bills.reduce((sum, bill) => sum + Math.round(dueOf(bill) * 100), 0) / 100
  const feeTotal = [...feeDue.values()].reduce((sum, value) => sum + Math.round(value * 100), 0) / 100

  async function copy(bill: PersonBill) {
    try {
      await navigator.clipboard.writeText(buildMessage(bill, scopeLabel, { receiving, invoiceLabels: all ? labels : undefined, fees: feesOf(bill.name) }))
      notify('notice', `Mensagem de ${bill.name} copiada. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui copiar. Libere o acesso à área de transferência e tente de novo.') }
  }

  async function copyGroup() {
    try { await navigator.clipboard.writeText(buildGroupMessage(bills, scopeLabel, receiving, feeDue)); notify('notice', 'Acerto do grupo copiado. É só colar na conversa.') } catch { notify('error', 'Não consegui copiar. Libere o acesso à área de transferência e tente de novo.') }
  }

  async function settle(bill: PersonBill) {
    const ids = bill.rows.filter((row) => row.status !== 'paid').map((row) => row.id)
    const fee = feeDue.get(bill.name) ?? 0
    if ((!ids.length && !fee) || !window.confirm(`Marcar ${ids.length} lançamentos de ${bill.name}${fee ? ' e a taxa' : ''} (${money(dueOf(bill))}) como pagos?`)) return
    try { if (ids.length) await source.setStatusMany(ids, 'paid'); if (fee) await payFees(bill.name); await onChanged(); notify('notice', `${bill.name} está em dia nesta fatura.`) } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function settleSome(bill: PersonBill, ids: string[], feePaid = false) {
    try {
      if (ids.length) await source.setStatusMany(ids, 'paid')
      if (feePaid) await payFees(bill.name)
      setPaying(null)
      await onChanged()
      notify('notice', `${ids.length} ${ids.length === 1 ? 'lançamento marcado' : 'lançamentos marcados'} como ${ids.length === 1 ? 'pago' : 'pagos'} para ${bill.name}.`)
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  return <>
    <PageHeading title="Quem deve quanto" subtitle="Veja a parte de cada responsável, copie a cobrança e marque como paga.">
      <div className="mode-switch" role="radiogroup" aria-label="O que cobrar"><button role="radio" aria-checked={!all} className={!all ? 'on' : ''} onClick={() => setScope('month')}>Esta fatura</button><button role="radio" aria-checked={all} className={all ? 'on' : ''} onClick={() => setScope('all')}>Tudo em aberto</button></div>
      <label className="select-group"><span>Fatura</span>
        <select value={invoiceId} onChange={(event) => onInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>) : <option value="">Nenhuma fatura</option>}</select></label>
    </PageHeading>
    <ReceivingPanel value={receiving} onChange={setReceiving} preview={bills[0] ? buildMessage(bills[0], scopeLabel, { receiving, invoiceLabels: all ? labels : undefined, fees: feesOf(bills[0].name) }).split('\n\n').slice(-1)[0] : ''} />
    {feeBlocks.length > 0 && <FeePanel blocks={feeBlocks} editable={!all} onSave={saveFee} />}
    {!bills.length ? <EmptyState title="Nada por aqui ainda">Esta fatura não tem lançamentos. Cadastre compras em Faturas e elas aparecem divididas por responsável.</EmptyState> : <>
      <section className="metric-grid three">
        <Metric label={all ? 'Total em aberto' : 'Total da fatura'} value={money(total)} icon="wallet" foot={`${bills.length} ${bills.length === 1 ? 'responsável' : 'responsáveis'}`} />
        <Metric label="Falta receber" value={money(pending)} icon="clock" tone={pending > 0 ? 'bad' : 'good'} foot={feeTotal > 0 ? `inclui ${money(feeTotal)} de taxa` : undefined} />
        <Metric label="Já pago" value={money(total - (pending - feeTotal))} icon="check" tone="good" />
      </section>
      <div className="button-row"><button className="secondary-button" onClick={() => void copyGroup()}><Icon name="copy" size={16} />Copiar acerto do grupo</button></div>
      <section className="bill-list">
        {bills.map((bill, position) => {
          const share = bill.total ? bill.paid / bill.total : 0
          const expanded = open === bill.name
          const due = dueOf(bill)
          const fee = feeDue.get(bill.name) ?? 0
          return <article key={bill.name} data-tour={position === 0 ? 'bill-card' : undefined} className="bill-card">
            <div className="bill-head">
              <span className="avatar">{bill.name[0].toUpperCase()}</span>
              <div className="bill-name"><b>{bill.name}</b><small>{bill.rows.length} {bill.rows.length === 1 ? 'lançamento' : 'lançamentos'} · total {money(bill.total)}</small>{fee > 0 && <small className="bill-fee">+ taxa {money(fee)}</small>}</div>
              <div className="bill-due"><span>{due > 0 ? 'Deve' : 'Em dia'}</span><b className={due > 0 ? 'warn' : 'ok'}>{money(due)}</b></div>
            </div>
            <div className="bill-progress" role="img" aria-label={`${Math.round(share * 100)}% pago`}><i style={{ width: `${share * 100}%` }} /></div>
            <div className="bill-actions">
              <button className="secondary-button" onClick={() => void copy(bill)}><Icon name="copy" size={16} />Copiar cobrança</button>
              <button className="secondary-button" disabled={due <= 0} onClick={() => void settle(bill)}><Icon name="check" size={16} />Marcar tudo como pago</button>
              <button className="secondary-button" disabled={due <= 0} onClick={() => setPaying(paying === bill.name ? null : bill.name)} aria-expanded={paying === bill.name}><Icon name="wallet" size={16} />Pagou um valor</button>
              {bill.pending > 0 && <button className="text-button" onClick={() => onDrill({ invoiceId, person: personToken(bill.name), status: 'pending' })}>Ver o que falta →</button>}
              <button className="text-button" onClick={() => setOpen(expanded ? null : bill.name)} aria-expanded={expanded}>{expanded ? 'Ocultar detalhes' : 'Ver detalhes'}</button>
            </div>
            {paying === bill.name && <SettleByAmount name={bill.name} rows={bill.rows} fee={fee} onConfirm={(ids, feePaid) => settleSome(bill, ids, feePaid)} onCancel={() => setPaying(null)} />}
            {expanded && <ul className="bill-rows">{bill.rows.map((row) => <li key={row.id} className={row.status === 'paid' ? 'done' : ''}>
              <span>{formatDate(row.occurred_on).slice(0, 5)}</span><span className="grow">{row.description}{row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}</span><span className="muted">{row.category?.name ?? ''}</span><b>{money(Number(row.amount))}</b>
            </li>)}</ul>}
          </article>
        })}
      </section>
    </>}
  </>
}
