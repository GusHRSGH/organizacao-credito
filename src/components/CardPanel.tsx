import { agendarAvisos } from '../lib/avisosFatura'
import { useEffect, useState } from 'react'
import { getActiveWallet, getKnownWallets } from '../lib/wallet'
import { Panel } from './ui'
import { closingDate, DEFAULT_CARD, dueDate, invoicePeriodFor, readCardFor, writeCard, type Card } from '../lib/card'
import { formatDate } from '../lib/format'
import { parseMoney } from '../lib/quickEntry'
import { periodLabel } from '../services/installments'

/** Dia de vencimento e de fechamento: o app passa a mandar cada compra para a fatura certa. */
export default function CardPanel({ notify }: { notify: (kind: 'notice' | 'error', text: string) => void }) {
  // Cada carteira (cartão) tem o seu vencimento e fechamento.
  const wallets = getKnownWallets()
  const [walletId, setWalletId] = useState(getActiveWallet)
  const [saved, setSaved] = useState<Card | null>(() => readCardFor(walletId))
  const [due, setDue] = useState(String((saved ?? DEFAULT_CARD).dueDay))
  const [before, setBefore] = useState(String((saved ?? DEFAULT_CARD).closingDaysBefore))
  const [limit, setLimit] = useState(saved?.limit ? String(saved.limit) : '')
  useEffect(() => { const next = readCardFor(walletId); setSaved(next); setDue(String((next ?? DEFAULT_CARD).dueDay)); setBefore(String((next ?? DEFAULT_CARD).closingDaysBefore)); setLimit(next?.limit ? String(next.limit) : '') }, [walletId])
  const limitValue = parseMoney(limit) ?? 0
  const card: Card = { dueDay: Math.min(31, Math.max(1, Number(due) || 1)), closingDaysBefore: Math.min(20, Math.max(0, Number(before) || 0)), ...(limitValue > 0 ? { limit: limitValue } : {}) }
  const today = new Date().toISOString().slice(0, 10)
  const target = invoicePeriodFor(today, card)
  const changed = !saved || saved.dueDay !== card.dueDay || saved.closingDaysBefore !== card.closingDaysBefore || (saved.limit ?? 0) !== (card.limit ?? 0)

  return <Panel tour="set-card" icon="bank" title="Meu cartão" subtitle="A fatura leva o nome do mês em que vence. Informe o vencimento e o fechamento e cada compra vai para a fatura certa, sozinho.">
    {wallets.length > 1 && <label className="select-group"><span>Cartão</span><select value={walletId} onChange={(event) => setWalletId(event.target.value)} aria-label="Cartão">{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <div className="card-grid">
      <label>Vence todo dia<input type="number" inputMode="numeric" min={1} max={31} value={due} onChange={(event) => setDue(event.target.value)} aria-label="Dia do vencimento" /></label>
      <label>Fecha quantos dias antes<input type="number" inputMode="numeric" min={0} max={20} value={before} onChange={(event) => setBefore(event.target.value)} aria-label="Dias antes do vencimento" /></label>
      <label>Limite do cartão (opcional)<input inputMode="decimal" placeholder="Ex.: 5.000" value={limit} onChange={(event) => setLimit(event.target.value)} aria-label="Limite do cartão" /></label>
    </div>
    <p className="hint" data-testid="card-preview">Uma compra de hoje ({formatDate(today)}) entra na fatura de <b>{periodLabel(target)}</b>, que fecha em {formatDate(closingDate(target, card))} e vence em {formatDate(dueDate(target, card))}. Compras no dia do fechamento já entram na fatura seguinte.</p>
    <p className="hint">Nubank costuma fechar 7 dias antes do vencimento. Confira o dia de fechamento no app do seu banco.</p>
    <div className="button-row">
      <button className="primary-button" disabled={!changed} onClick={() => { writeCard(card, walletId); void agendarAvisos(); setSaved(card); notify('notice', `Pronto: as próximas compras vão para a fatura pelo fechamento (vence dia ${card.dueDay}).`) }}>Salvar</button>
      {saved && <button className="text-button" onClick={() => { writeCard(null, walletId); void agendarAvisos(); setSaved(null); notify('notice', 'Voltei a usar o mês do calendário.') }}>Desligar</button>}
      <span className="muted">{saved ? `Ligado: vence dia ${saved.dueDay}, fecha ${saved.closingDaysBefore} dias antes.` : 'Desligado: o app usa o mês do calendário.'}</span></div>
  </Panel>
}
