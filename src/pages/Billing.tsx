import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, Metric, PageHeading } from '../components/ui'
import { billsByPerson, buildMessage, type PersonBill } from '../lib/billing'
import { formatDate, messageOf, money } from '../lib/format'
import type { DataSource, Invoice, Transaction } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function Billing({ source, invoices, transactions, invoiceId, onInvoice, onChanged, notify }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const invoice = invoices.find((item) => item.id === invoiceId)
  const bills = useMemo(() => billsByPerson(transactions.filter((row) => row.invoice_id === invoiceId)), [transactions, invoiceId])
  const total = bills.reduce((sum, bill) => sum + Math.round(bill.total * 100), 0) / 100
  const pending = bills.reduce((sum, bill) => sum + Math.round(bill.pending * 100), 0) / 100

  async function copy(bill: PersonBill) {
    try {
      await navigator.clipboard.writeText(buildMessage(bill, invoice?.label ?? 'este mês'))
      notify('notice', `Mensagem de ${bill.name} copiada. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui copiar. Libere o acesso à área de transferência e tente de novo.') }
  }

  async function settle(bill: PersonBill) {
    const ids = bill.rows.filter((row) => row.status !== 'paid').map((row) => row.id)
    if (!ids.length || !window.confirm(`Marcar ${ids.length} lançamentos de ${bill.name} (${money(bill.pending)}) como pagos?`)) return
    try { await source.setStatusMany(ids, 'paid'); await onChanged(); notify('notice', `${bill.name} está em dia nesta fatura.`) } catch (cause) { notify('error', messageOf(cause)) }
  }

  return <>
    <PageHeading title="Quem deve quanto" subtitle="Veja a parte de cada responsável, copie a cobrança e marque como paga.">
      <label className="select-group"><span>Fatura</span>
        <select value={invoiceId} onChange={(event) => onInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>) : <option value="">Nenhuma fatura</option>}</select></label>
    </PageHeading>
    {!bills.length ? <EmptyState title="Nada por aqui ainda">Esta fatura não tem lançamentos. Cadastre compras em Faturas e elas aparecem divididas por responsável.</EmptyState> : <>
      <section className="metric-grid three">
        <Metric label="Total da fatura" value={money(total)} icon="wallet" foot={`${bills.length} ${bills.length === 1 ? 'responsável' : 'responsáveis'}`} />
        <Metric label="Falta receber" value={money(pending)} icon="clock" tone={pending > 0 ? 'warning' : 'good'} />
        <Metric label="Já pago" value={money(total - pending)} icon="check" tone="good" />
      </section>
      <section className="bill-list">
        {bills.map((bill) => {
          const share = bill.total ? bill.paid / bill.total : 0
          const expanded = open === bill.name
          return <article key={bill.name} className="bill-card">
            <div className="bill-head">
              <span className="avatar">{bill.name[0].toUpperCase()}</span>
              <div className="bill-name"><b>{bill.name}</b><small>{bill.rows.length} {bill.rows.length === 1 ? 'lançamento' : 'lançamentos'} · total {money(bill.total)}</small></div>
              <div className="bill-due"><span>{bill.pending > 0 ? 'Deve' : 'Em dia'}</span><b className={bill.pending > 0 ? 'warn' : 'ok'}>{money(bill.pending)}</b></div>
            </div>
            <div className="bill-progress" role="img" aria-label={`${Math.round(share * 100)}% pago`}><i style={{ width: `${share * 100}%` }} /></div>
            <div className="bill-actions">
              <button className="secondary-button" onClick={() => void copy(bill)}><Icon name="copy" size={16} />Copiar cobrança</button>
              <button className="secondary-button" disabled={bill.pending <= 0} onClick={() => void settle(bill)}><Icon name="check" size={16} />Marcar tudo como pago</button>
              <button className="text-button" onClick={() => setOpen(expanded ? null : bill.name)} aria-expanded={expanded}>{expanded ? 'Ocultar detalhes' : 'Ver detalhes'}</button>
            </div>
            {expanded && <ul className="bill-rows">{bill.rows.map((row) => <li key={row.id} className={row.status === 'paid' ? 'done' : ''}>
              <span>{formatDate(row.occurred_on).slice(0, 5)}</span><span className="grow">{row.description}{row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}</span><span className="muted">{row.category?.name ?? ''}</span><b>{money(Number(row.amount))}</b>
            </li>)}</ul>}
          </article>
        })}
      </section>
    </>}
  </>
}
