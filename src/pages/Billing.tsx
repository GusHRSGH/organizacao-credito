import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { personToken, type DrillFilter } from '../lib/drill'
import { EmptyState, Metric, PageHeading } from '../components/ui'
import ReceivingPanel from '../components/ReceivingPanel'
import SettleByAmount from '../components/SettleByAmount'
import FeePanel, { type FeeBlock } from '../components/FeePanel'
import SettledModal from '../components/SettledModal'
import { invoiceOptions } from '../components/InvoiceOptions'
import { settledIds, settledMessage, settledSummary } from '../lib/settled'
import { feeLine, feeSplitFor, spendByPerson } from '../lib/fee'
import { billsByPerson, buildGroupMessage, buildMessage, type FeeCharge, type PersonBill } from '../lib/billing'
import { hasReceiving, pixCode, readReceiving } from '../lib/receiving'
import { useSettings } from '../lib/settings'
import { shareText } from '../lib/share'
import { getKnownWallets, useActiveWallet } from '../lib/wallet'
import { creditBalance, findDebt, settleTargets, unifiedDebts, unifiedMessage, type Everything, type PersonDebt, type UnifiedMode } from '../lib/unified'
import { currentPeriod, periodLabel } from '../services/installments'
import { punctuality } from '../lib/punctuality'
import { formatDate, messageOf, money } from '../lib/format'
import type { CardFee, CreditEntry, DataSource, Invoice, Transaction } from '../types'

interface Props {
  source: DataSource
  invoices: Invoice[]
  transactions: Transaction[]
  invoiceId: string
  onInvoice: (id: string) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
  onDrill: (filter: DrillFilter) => void
  /** Com mais de uma carteira: tudo de todas, para somar o mesmo mês de vencimento. */
  everything?: Everything | null
}

export default function Billing({ source, invoices, transactions, invoiceId, onInvoice, onChanged, notify, onDrill, everything }: Props) {
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
  const activeWallet = useActiveWallet()
  const isLoan = getKnownWallets().find((item) => item.id === activeWallet)?.kind === 'loan'
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
  // Crédito de quem pagou a mais antes: desconta no Pix e na mensagem, e é usado ao marcar como pago.
  const [credits, setCredits] = useState<CreditEntry[]>([])
  useEffect(() => { void source.listCredits().then(setCredits).catch(() => setCredits([])) }, [source, transactions])
  const balanceOf = (name: string) => creditBalance(credits, name)
  const netDue = (bill: PersonBill) => Math.max(0, Math.round((dueOf(bill) - balanceOf(bill.name)) * 100) / 100)
  async function spendCredit(name: string, owed: number, label: string) {
    const used = Math.min(balanceOf(name), owed)
    if (used > 0.004) await source.addCredit(name, -used, `Usado em ${label}`)
  }
  async function saveFee(fee: CardFee) {
    try { await source.saveFee(fee); await loadFees(); await onChanged() } catch (cause) { notify('error', messageOf(cause)) }
  }

  // Mês quitado: compras e taxa pagas. Comemora só na hora em que a fatura passa a ficar quitada.
  const settled = useMemo(() => settledIds(invoices, transactions, fees), [invoices, transactions, fees])
  const [shown, setShown] = useState<{ id: string; celebrate: boolean } | null>(null)
  const before = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previous = before.current
    before.current = settled
    if (!previous) return
    const fresh = [...settled].find((id) => !previous.has(id))
    if (fresh) setShown({ id: fresh, celebrate: true })
  }, [settled])
  const summary = shown ? settledSummary(shown.id, invoices, transactions, fees) : null
  const settledList = invoices.filter((item) => settled.has(item.id)).sort((a, b) => b.period.localeCompare(a.period))

  async function shareSettled() {
    if (!summary) return
    try {
      const done = await shareText(settledMessage(summary), `${summary.label} quitada`)
      if (done === 'copied') notify('notice', 'Mensagem do mês quitado copiada. É só colar no grupo.')
    } catch { notify('error', 'Não consegui compartilhar nem copiar. Tente de novo.') }
  }

  async function removeSettled(invoice: Invoice) {
    const count = transactions.filter((row) => row.invoice_id === invoice.id).length
    if (!window.confirm(`Apagar a fatura de ${invoice.label} (${count} ${count === 1 ? 'lançamento' : 'lançamentos'})? Fica uma cópia em Dados e backup para restaurar, e o robô continua lembrando de quem é cada compra.`)) return
    try { await source.removeInvoice(invoice.id); await onChanged(); notify('notice', `Fatura de ${invoice.label} apagada. Dá para restaurar em Dados e backup.`) } catch (cause) { notify('error', messageOf(cause)) }
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

  const [askKey, setAskKey] = useState(0)
  // Modo simples: Como você recebe e a taxa ficam recolhidos, e cada card mostra só Pix e Marcar como pago.
  const [{ advanced }] = useSettings()
  const [recvOpen, setRecvOpen] = useState(false)
  const [feeOpen, setFeeOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)
  const [othersFor, setOthersFor] = useState<string | null>(null)
  const [punctualOpen, setPunctualOpen] = useState(false)
  const punctual = useMemo(() => punctuality(everything ?? { wallets: getKnownWallets(), invoices, transactions, fees }, new Date().toISOString().slice(0, 10)), [everything, invoices, transactions, fees])
  // Todas as carteiras, no mesmo mês de vencimento da fatura aberta aqui.
  const refPeriod = invoice?.period ?? currentPeriod()
  const unified = useMemo(() => (everything ? unifiedDebts(everything, refPeriod) : null), [everything, refPeriod])
  const debtOf = (name: string) => findDebt(unified, name)
  const hasOthers = (name: string) => !!debtOf(name)?.parts.some((part) => part.walletId !== activeWallet)
  // Escolha antes de mandar: Pix só deste cartão ou de todos; mensagem por carteira ou cada compra.
  const [choice, setChoice] = useState<{ name: string; kind: 'pix' | 'msg'; where: 'card' | 'fold' } | null>(null)
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const fold = (title: string, sub: string, isOpen: boolean, setIsOpen: (value: boolean) => void, child: ReactNode) => <details className="fold" open={isOpen} onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}><summary><b>{title}</b><small>{sub}</small></summary>{child}</details>
  const pixOf = (bill: PersonBill) => pixCode(receiving, netDue(bill), scopeLabel)

  /** Detalhes das compras e o total, sem a chave: o Pix vai no outro botão. */
  async function sendDetails(bill: PersonBill) {
    try {
      const text = buildMessage(bill, scopeLabel, { receiving, invoiceLabels: all ? labels : undefined, fees: feesOf(bill.name), pixSeparate: !!pixOf(bill), credit: balanceOf(bill.name) })
      const done = await shareText(text, `Cobrança de ${bill.name}`)
      if (done === 'copied') notify('notice', `Detalhes de ${bill.name} copiados. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui compartilhar nem copiar. Tente de novo.') }
  }

  /** Só o Pix copia e cola, já com o valor que a pessoa deve, para ela copiar com um toque. */
  async function sharePix(bill: PersonBill) {
    const code = pixOf(bill)
    if (!code) {
      setAskKey((n) => n + 1); setRecvOpen(true)
      notify('notice', 'Cadastre sua chave Pix e o nome de quem recebe para gerar o Pix copia e cola.')
      return
    }
    try {
      const done = await shareText(code, `Pix de ${bill.name}`)
      if (done === 'copied') notify('notice', `Pix de ${bill.name} (${money(netDue(bill))}) copiado. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui compartilhar nem copiar. Tente de novo.') }
  }

  async function copyGroup() {
    try { await navigator.clipboard.writeText(buildGroupMessage(bills, scopeLabel, receiving, feeDue)); notify('notice', 'Acerto do grupo copiado. É só colar na conversa.') } catch { notify('error', 'Não consegui copiar. Libere o acesso à área de transferência e tente de novo.') }
  }

  /** Pix com o total de todas as carteiras. */
  async function shareUnifiedPix(debt: PersonDebt) {
    setChoice(null)
    const net = Math.max(0, Math.round((debt.total - balanceOf(debt.name)) * 100) / 100)
    const code = pixCode(receiving, net, 'Total')
    if (!code) {
      setAskKey((n) => n + 1); setRecvOpen(true)
      notify('notice', 'Cadastre sua chave Pix e o nome de quem recebe para gerar o Pix copia e cola.')
      return
    }
    try {
      const done = await shareText(code, `Pix de ${debt.name}`)
      if (done === 'copied') notify('notice', `Pix de ${debt.name} com o total (${money(net)}) copiado. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui compartilhar nem copiar. Tente de novo.') }
  }

  async function sendUnified(debt: PersonDebt, mode: UnifiedMode) {
    setChoice(null)
    try {
      const done = await shareText(unifiedMessage(debt, { mode, period: refPeriod, pixSeparate: !!pixCode(receiving, debt.total, 'Total'), credit: balanceOf(debt.name) }), `Cobrança de ${debt.name}`)
      if (done === 'copied') notify('notice', `Total de ${debt.name} copiado. É só colar no WhatsApp.`)
    } catch { notify('error', 'Não consegui compartilhar nem copiar. Tente de novo.') }
  }

  /** A pessoa mandou o total: marca como pago tudo dela no mês, em todas as carteiras, e usa o crédito. */
  async function payAll(debt: PersonDebt) {
    const wallets = new Set(debt.parts.map((part) => part.walletId)).size
    const { rowIds, fees: feeMarks } = settleTargets(debt)
    if (!window.confirm(`${debt.name} pagou tudo de ${periodLabel(refPeriod)}? Marca como pago ${rowIds.length} ${rowIds.length === 1 ? 'lançamento' : 'lançamentos'}${feeMarks.length ? ' e a taxa' : ''} em ${wallets} ${wallets === 1 ? 'carteira' : 'carteiras'} (${money(debt.total)}).`)) return
    try {
      await source.settleAcross(rowIds, feeMarks)
      await spendCredit(debt.name, debt.total, periodLabel(refPeriod))
      await loadFees(); await onChanged()
      notify('notice', `${debt.name} está em dia em todas as carteiras em ${periodLabel(refPeriod)}.`)
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  /** Caixinha de escolha que abre no lugar do botão tocado. */
  function choiceBox(debt: PersonDebt, bill: PersonBill | null, where: 'card' | 'fold') {
    if (!choice || choice.name !== debt.name || choice.where !== where) return null
    const here = bill ? dueOf(bill) : 0
    return <div className="choice-box" role="group" aria-label={choice.kind === 'pix' ? 'Qual Pix mandar' : 'Como mandar a cobrança'}>
      {choice.kind === 'pix'
        ? <><b>Qual Pix mandar para {debt.name}?</b>
          {bill && here > 0 && <button className="secondary-button" onClick={() => { setChoice(null); void sharePix(bill) }}>Só deste cartão · {money(here)}</button>}
          <button className="secondary-button" onClick={() => void shareUnifiedPix(debt)}>Todos somados · {money(debt.total)}</button></>
        : <><b>Como mandar a cobrança de {periodLabel(refPeriod)}?</b>
          <button className="secondary-button" onClick={() => void sendUnified(debt, 'total')}>Total por carteira</button>
          <button className="secondary-button" onClick={() => void sendUnified(debt, 'items')}>Cada compra</button></>}
      <button className="text-button" onClick={() => setChoice(null)}>Cancelar</button>
    </div>
  }

  async function settle(bill: PersonBill) {
    const ids = bill.rows.filter((row) => row.status !== 'paid').map((row) => row.id)
    const fee = feeDue.get(bill.name) ?? 0
    if ((!ids.length && !fee) || !window.confirm(`Marcar ${ids.length} lançamentos de ${bill.name}${fee ? ' e a taxa' : ''} (${money(dueOf(bill))}) como pagos?`)) return
    try { if (ids.length) await source.setStatusMany(ids, 'paid'); if (fee) await payFees(bill.name); await spendCredit(bill.name, dueOf(bill), scopeLabel); await onChanged(); notify('notice', `${bill.name} está em dia nesta fatura.`) } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function settleSome(bill: PersonBill, ids: string[], feePaid = false, credit = 0) {
    try {
      if (ids.length) await source.setStatusMany(ids, 'paid')
      if (feePaid) await payFees(bill.name)
      if (credit > 0.004) await source.addCredit(bill.name, credit, `Pagou a mais em ${scopeLabel}`)
      setPaying(null)
      await onChanged()
      notify('notice', `${ids.length} ${ids.length === 1 ? 'lançamento marcado' : 'lançamentos marcados'} como ${ids.length === 1 ? 'pago' : 'pagos'} para ${bill.name}.${credit > 0.004 ? ` ${money(credit)} ficaram de crédito para a próxima.` : ''}`)
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  return <>
    <PageHeading title="Quem deve quanto" subtitle="Veja a parte de cada responsável, copie a cobrança e marque como paga.">
      <div className="mode-switch" role="radiogroup" aria-label="O que cobrar"><button role="radio" aria-checked={!all} className={!all ? 'on' : ''} onClick={() => setScope('month')}>Esta fatura</button><button role="radio" aria-checked={all} className={all ? 'on' : ''} onClick={() => setScope('all')}>Tudo em aberto</button></div>
      <label className="select-group"><span>Fatura</span>
        <select value={invoiceId} onChange={(event) => onInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoiceOptions(invoices, settled) : <option value="">Nenhuma fatura</option>}</select></label>
    </PageHeading>
    {fold('Como você recebe', hasReceiving(receiving) ? (receiving.key ? `Pix: ${receiving.key}` : 'Só o recado') : 'Ainda sem chave Pix', recvOpen, setRecvOpen,
      <ReceivingPanel value={receiving} onChange={setReceiving} openSignal={askKey} preview={bills[0] ? buildMessage(bills[0], scopeLabel, { receiving, invoiceLabels: all ? labels : undefined, fees: feesOf(bills[0].name) }).split('\n\n').slice(-1)[0] : ''} />)}
    {unified && fold('Todas as carteiras', unified.total > 0 ? `${periodLabel(refPeriod)} · ${money(unified.total)}` : `${periodLabel(refPeriod)} · todo mundo em dia`, allOpen, setAllOpen,
      <>
        <p className="muted unified-note">O que vence em {periodLabel(refPeriod)} em cada cartão, e a parcela do mês dos empréstimos. Troque a fatura lá em cima para ver outro mês.</p>
        {unified.people.length ? <ul className="unified-list">{unified.people.map((debt) => <li key={debt.name}>
          <div className="unified-head"><b>{debt.name}</b><span>{money(debt.total)}</span></div>
          <ul className="unified-parts">{debt.parts.map((part) => <li key={part.invoiceId}><span>{part.wallet} · {part.invoice}{part.remaining ? ` · faltam ${part.remaining.count} (${money(part.remaining.amount)})` : ''}</span><span>{money(part.amount)}</span></li>)}</ul>
          <div className="button-row">
            <button className="secondary-button" onClick={() => void shareUnifiedPix(debt)}><Icon name="wallet" size={16} />Pix do total</button>
            <button className="secondary-button" onClick={() => setChoice({ name: debt.name, kind: 'msg', where: 'fold' })}><Icon name="copy" size={16} />Cobrar todos</button>
            <button className="secondary-button" onClick={() => void payAll(debt)}><Icon name="check" size={16} />Pagou tudo</button>
          </div>
          {choiceBox(debt, null, 'fold')}
        </li>)}</ul> : <p className="muted">Ninguém deve nada em {periodLabel(refPeriod)} em nenhuma carteira.</p>}
      </>)}
    {punctual.length > 0 && fold('Quem paga em dia', punctual.some((p) => p.overdue > 0) ? `${punctual.filter((p) => p.overdue > 0).length} com conta vencida` : 'Só você vê isso', punctualOpen, setPunctualOpen,
      <>
        <p className="muted unified-note">Conta a data em que você marcou como pago, comparada com o vencimento de cada cartão. Só você vê isso.</p>
        <ul className="punctual-list">{punctual.map((p) => <li key={p.name}>
          <div className="unified-head"><b>{p.name}</b>{p.paid > 0 && <span>{p.onTime} de {p.paid} em dia</span>}</div>
          <small>{p.overdue > 0 ? <span className="warn">Vencido há {p.overdueDays} {p.overdueDays === 1 ? 'dia' : 'dias'}: {money(p.overdue)}. </span> : null}{p.paid - p.onTime > 0 ? `Quando atrasa, leva em média ${p.avgLate} ${p.avgLate === 1 ? 'dia' : 'dias'}.` : p.paid ? 'Nunca atrasou.' : ''}</small>
          {p.recent.length > 0 && <div className="punctual-dots" aria-label={`Últimas faturas de ${p.name}`}>{p.recent.map((item, i) => <i key={i} className={item.late ? 'late' : 'ok'} title={`${item.label}: ${item.late ? `${item.late} dias de atraso` : 'em dia'}`} />)}</div>}
        </li>)}</ul>
      </>)}
    {!all && settled.has(invoiceId) && <p className="settled-line"><span className="settled-badge">✓ Quitada</span> Todo mundo pagou esta fatura. <button className="text-button" onClick={() => setShown({ id: invoiceId, celebrate: false })}>Ver resumo</button></p>}
    {!isLoan && feeBlocks.length > 0 && fold('Taxa de uso do cartão', feeBlocks[0]?.split ? `${feeBlocks[0].split.fee.name} · ${money(feeBlocks[0].split.total)}` : 'Nenhuma taxa nesta fatura', feeOpen, setFeeOpen,
      <FeePanel blocks={feeBlocks} editable={!all} onSave={saveFee} />)}
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
              <div className="bill-name"><b>{bill.name}</b><small>{bill.rows.length} {bill.rows.length === 1 ? 'lançamento' : 'lançamentos'} · total {money(bill.total)}</small>{fee > 0 && <small className="bill-fee">+ taxa {money(fee)}</small>}{balanceOf(bill.name) > 0 && <small className="bill-credit">crédito {money(balanceOf(bill.name))}{due > 0 ? ' (já descontado)' : ''}</small>}</div>
              <div className="bill-due"><span>{due > 0 ? 'Deve' : 'Em dia'}</span><b className={due > 0 ? 'warn' : 'ok'}>{money(due > 0 ? netDue(bill) : 0)}</b></div>
            </div>
            <div className="bill-progress" role="img" aria-label={`${Math.round(share * 100)}% pago`}><i style={{ width: `${share * 100}%` }} /></div>
            <div className="bill-actions">
              <button className="secondary-button" disabled={due <= 0 && !hasOthers(bill.name)} onClick={() => { if (hasOthers(bill.name)) setChoice({ name: debtOf(bill.name)!.name, kind: 'pix', where: 'card' }); else void sharePix(bill) }}><Icon name="wallet" size={16} />Compartilhar Pix</button>
              {(advanced || moreFor === bill.name) && <button className="secondary-button" onClick={() => void sendDetails(bill)}><Icon name="copy" size={16} />Enviar detalhes</button>}
              <button className="secondary-button" disabled={due <= 0} onClick={() => void settle(bill)}><Icon name="check" size={16} />Marcar tudo como pago</button>
              {(advanced || moreFor === bill.name) && <>
                <button className="secondary-button" disabled={due <= 0} onClick={() => setPaying(paying === bill.name ? null : bill.name)} aria-expanded={paying === bill.name}><Icon name="wallet" size={16} />Pagou um valor</button>
                {bill.pending > 0 && <button className="text-button" onClick={() => onDrill({ invoiceId, person: personToken(bill.name), status: 'pending' })}>Ver o que falta →</button>}
                <button className="text-button" onClick={() => setOpen(expanded ? null : bill.name)} aria-expanded={expanded}>{expanded ? 'Ocultar detalhes' : 'Ver detalhes'}</button>
              </>}
              {!advanced && <button className="text-button" aria-expanded={moreFor === bill.name} onClick={() => setMoreFor(moreFor === bill.name ? null : bill.name)}>{moreFor === bill.name ? 'Menos opções' : 'Mais opções'}</button>}
            </div>
            {(() => { const debt = debtOf(bill.name); return debt ? choiceBox(debt, bill, 'card') : null })()}
            {(() => {
              const debt = debtOf(bill.name)
              const others = debt?.parts.filter((part) => part.walletId !== activeWallet) ?? []
              if (!debt || !others.length) return null
              const kinds = getKnownWallets()
              const cards = others.every((part) => kinds.find((item) => item.id === part.walletId)?.kind !== 'loan')
              const count = new Set(others.map((part) => part.walletId)).size
              const where = count === 1 ? (cards ? 'outro cartão' : 'outra carteira') : `${count} ${cards ? 'outros cartões' : 'outras carteiras'}`
              const sum = others.reduce((acc, part) => acc + Math.round(part.amount * 100), 0) / 100
              const isOpen = othersFor === bill.name
              return <div className="other-cards">
                <div className="other-cards-head"><span>Também deve em {where}: <b>{money(sum)}</b></span>
                  <button className="text-button" aria-expanded={isOpen} onClick={() => setOthersFor(isOpen ? null : bill.name)}>{isOpen ? 'Ocultar' : `Ver ${cards ? 'outros cartões' : 'outras carteiras'}`}</button></div>
                {isOpen && <>
                  <ul aria-label={`Onde ${bill.name} deve`}>{debt.parts.map((part) => <li key={part.invoiceId} className={part.walletId === activeWallet ? 'here' : ''}><span>{part.wallet} · {part.invoice}{part.walletId === activeWallet ? ' (este)' : ''}</span><span>{money(part.amount)}</span></li>)}</ul>
                  <div className="total"><span>Total em todos</span><span>{money(debt.total)}</span></div>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => void sendDetails(bill)}><Icon name="copy" size={16} />Cobrar só este</button>
                    <button className="secondary-button" onClick={() => setChoice({ name: debt.name, kind: 'msg', where: 'card' })}><Icon name="copy" size={16} />Cobrar todos</button>
                    <button className="secondary-button" onClick={() => setChoice({ name: debt.name, kind: 'pix', where: 'card' })}><Icon name="wallet" size={16} />Pix</button>
                    <button className="secondary-button" onClick={() => void payAll(debt)}><Icon name="check" size={16} />Pagou tudo · {money(debt.total)}</button>
                  </div>
                </>}
              </div>
            })()}
            {paying === bill.name && <SettleByAmount name={bill.name} rows={bill.rows} fee={fee} onConfirm={(ids, feePaid, credit) => settleSome(bill, ids, feePaid, credit)} onCancel={() => setPaying(null)} />}
            {expanded && <ul className="bill-rows">{bill.rows.map((row) => <li key={row.id} className={row.status === 'paid' ? 'done' : ''}>
              <span>{formatDate(row.occurred_on).slice(0, 5)}</span><span className="grow">{row.description}{row.installment_count ? ` (${row.installment_number}/${row.installment_count})` : ''}</span><span className="muted">{row.category?.name ?? ''}</span><b>{money(Number(row.amount))}</b>
            </li>)}</ul>}
          </article>
        })}
      </section>
    </>}
    {settledList.length > 0 && <details className="settled-list">
      <summary>Faturas quitadas ({settledList.length})</summary>
      <ul>{settledList.map((item) => <li key={item.id}>
        <span className="grow"><b>{item.label}</b> <span className="muted">{money(transactions.filter((row) => row.invoice_id === item.id).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100)}</span></span>
        <button className="text-button" onClick={() => setShown({ id: item.id, celebrate: false })}>Ver resumo</button>
        <button className="text-button danger" onClick={() => void removeSettled(item)}>Apagar</button>
      </li>)}</ul>
    </details>}
    {summary && shown && <SettledModal summary={summary} celebrate={shown.celebrate} onShare={() => void shareSettled()} onClose={() => setShown(null)} />}
  </>
}
