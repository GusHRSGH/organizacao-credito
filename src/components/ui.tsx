import type { ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'
import { Icon, Logo, PersonDot, type IconName } from './Icon'
import { categoryIcon } from '../lib/categoryIcon'
import { formatDate, money } from '../lib/format'
import type { Transaction } from '../types'

export function PageHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>
}

export function Metric({ label, value, foot, tone, icon }: { label: string; value: string; foot?: string; tone?: 'warning' | 'good' | 'bad'; icon?: IconName }) {
  return <article className="metric-card"><div className="metric-label">{icon && <span className={`metric-icon ${tone ?? ''}`}><Icon name={icon} size={16} /></span>}{label}</div><div className={`metric-value ${tone === 'bad' ? 'neg' : tone === 'good' ? 'pos' : ''}`}>{value}</div>{foot && <div className={`metric-foot ${tone === 'warning' ? 'warning' : ''}`}>{foot}</div>}</article>
}

export function Panel({ title, subtitle, children, action, icon }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; icon?: IconName }) {
  const [reveal, shown] = useReveal<HTMLElement>(0.04)
  return <section ref={reveal} className={`panel rise ${shown ? 'in' : ''}`}><div className="panel-heading">{icon && <span className="panel-icon"><Icon name={icon} size={18} /></span>}<div className="panel-title"><h2>{title}</h2>{subtitle && <p className="panel-sub">{subtitle}</p>}</div>{action}</div>{children}</section>
}

export function EmptyState({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="panel empty-state"><Logo size={56} /><h2>{title}</h2><p>{children}</p>{actions && <div className="empty-actions">{actions}</div>}</section>
}

export type SortKey = 'date' | 'person' | 'amount'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

interface TableProps {
  rows: Transaction[]
  busy: boolean
  onToggle: (row: Transaction) => void
  onDelete: (row: Transaction) => void
  sort?: Sort
  onSort?: (key: SortKey) => void
  selected?: Set<string>
  onSelect?: (id: string) => void
  onSelectAll?: (all: boolean) => void
  onEdit?: (row: Transaction) => void
}

export function TransactionTable({ rows, busy, onToggle, onDelete, sort, onSort, selected, onSelect, onSelectAll, onEdit }: TableProps) {
  if (busy) return <p className="empty">Carregando lançamentos…</p>
  if (!rows.length) return <p className="empty">Nenhum lançamento por aqui.</p>
  const head = (key: SortKey, label: string, className = '') => onSort
    ? <th className={className}><button className="th-button" onClick={() => onSort(key)}>{label}{sort?.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
    : <th className={className}>{label}</th>
  const cards = <ul className="tx-cards">{rows.map((row) => <li key={row.id} className={`tx-card ${row.status === 'paid' ? '' : 'is-pending'} ${selected?.has(row.id) ? 'selected' : ''}`}>
    {selected && <input type="checkbox" className="tx-check" aria-label={`Selecionar ${row.description}`} checked={selected.has(row.id)} onChange={() => onSelect?.(row.id)} />}
    <div className="tx-main">
      <div className="tx-top"><b>{row.description}</b><span className="tx-amount">{money(Number(row.amount))}</span></div>
      <div className="tx-meta"><span>{formatDate(row.occurred_on).slice(0, 5)}</span><span className="person-cell">{row.person?.name ? <><PersonDot name={row.person.name} />{row.person.name}</> : '—'}</span>{row.category?.name && <span className="tag cat"><Icon name={categoryIcon(row.category.name)} size={13} />{row.category.name}</span>}{row.installment_count ? <span className="tag">{row.installment_number}/{row.installment_count}</span> : null}</div>
      <div className="tx-foot">
        <button className={`tag ${row.status === 'paid' ? 'paid' : 'pending'}`} onClick={() => onToggle(row)}><Icon name={row.status === 'paid' ? 'check' : 'clock'} size={12} />{row.status === 'paid' ? 'Pago' : 'Pendente'}</button>
        <span className="tx-actions">{onEdit && <button className="icon-button" onClick={() => onEdit(row)} aria-label="Editar lançamento"><Icon name="edit" size={18} /></button>}<button className="icon-button danger" onClick={() => onDelete(row)} aria-label="Excluir lançamento"><Icon name="trash" size={18} /></button></span>
      </div>
    </div>
  </li>)}</ul>
  return <><div className="table-scroll tx-table"><table><thead><tr>
    {selected && <th className="check"><input type="checkbox" aria-label="Selecionar todos" checked={rows.length > 0 && rows.every((row) => selected.has(row.id))} onChange={(event) => onSelectAll?.(event.target.checked)} /></th>}{head('date', 'Data')}<th>Descrição</th>{head('person', 'Responsável')}<th>Categoria</th><th>Parcela</th><th>Status</th>{head('amount', 'Valor', 'num')}<th />
  </tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`${row.status === 'paid' ? '' : 'is-pending'} ${selected?.has(row.id) ? 'selected' : ''}`}>
    {selected && <td className="check"><input type="checkbox" aria-label={`Selecionar ${row.description}`} checked={selected.has(row.id)} onChange={() => onSelect?.(row.id)} /></td>}
    <td>{formatDate(row.occurred_on)}</td>
    <td className="desc"><b>{row.description}</b></td>
    <td>{row.person?.name ? <span className="person-cell"><PersonDot name={row.person.name} />{row.person.name}</span> : '—'}</td>
    <td>{row.category?.name ? <span className="tag cat"><Icon name={categoryIcon(row.category.name)} size={13} />{row.category.name}</span> : '—'}</td>
    <td>{row.installment_count ? <span className={`tag ${row.installment_number === row.installment_count ? 'last' : ''}`}>{row.installment_number}/{row.installment_count}</span> : <span className="muted">À vista</span>}</td>
    <td><button className={`tag ${row.status === 'paid' ? 'paid' : 'pending'}`} onClick={() => onToggle(row)} title="Clique para alternar"><Icon name={row.status === 'paid' ? 'check' : 'clock'} size={12} />{row.status === 'paid' ? 'Pago' : 'Pendente'}</button></td>
    <td className="num">{money(Number(row.amount))}</td>
    <td className="actions">{onEdit && <button className="icon-button" onClick={() => onEdit(row)} aria-label="Editar lançamento" title="Editar"><Icon name="edit" size={16} /></button>}<button className="icon-button danger" onClick={() => onDelete(row)} aria-label="Excluir lançamento" title="Excluir"><Icon name="trash" size={16} /></button></td>
  </tr>)}</tbody></table></div>{cards}</>
}

export interface HeroProps {
  label: string
  total: string
  count: number
  paid: string
  pending: string
  paidShare: number
  badge?: { text: string; tone: 'bad' | 'good' | 'flat'; trend: 'trend-up' | 'trend-down' }
  onPending?: () => void
}

export function Hero({ label, total, count, paid, pending, paidShare, badge, onPending }: HeroProps) {
  const share = Math.max(0, Math.min(1, paidShare))
  const clear = count === 0 || share >= 0.9999
  const [reveal, shown] = useReveal<HTMLElement>(0.1)
  return <article ref={reveal} className={`hero-card reveal ${shown ? 'in' : ''}`}>
    <div className="hero-top"><span className="hero-label">{label}</span>{badge && <span className={`hero-badge ${badge.tone}`}><Icon name={badge.trend} size={14} />{badge.text}</span>}</div>
    <div className="hero-kicker">{clear ? 'Tudo pago' : 'Falta pagar'}</div>
    <div className={`hero-total ${clear ? 'clear' : ''}`}>{clear ? total : pending}</div>
    <div className="hero-sub">{clear ? `${count} lançamentos nesta fatura` : `de ${total} · ${count} lançamentos · ${paid} já pago`}</div>
    <div className="hero-progress" role="img" aria-label={`${Math.round(share * 100)}% pago`}><i style={{ width: `${share * 100}%` }} /></div>
    <div className="hero-split"><span>{Math.round(share * 100)}% pago</span>{onPending && !clear && <button className="hero-link" onClick={onPending}>Ver o que falta pagar →</button>}</div>
  </article>
}
