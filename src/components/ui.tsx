import type { ReactNode } from 'react'
import { formatDate, money } from '../lib/format'
import type { Transaction } from '../types'

export function PageHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>
}

export function Metric({ label, value, foot, tone }: { label: string; value: string; foot?: string; tone?: 'warning' | 'good' | 'bad' }) {
  return <article className="metric-card"><div className="metric-label">{label}</div><div className={`metric-value ${tone === 'bad' ? 'neg' : tone === 'good' ? 'pos' : ''}`}>{value}</div>{foot && <div className={`metric-foot ${tone === 'warning' ? 'warning' : ''}`}>{foot}</div>}</article>
}

export function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p className="panel-sub">{subtitle}</p>}</div>{action}</div>{children}</section>
}

export function EmptyState({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="panel empty-state"><span className="brand-mark">◒</span><h2>{title}</h2><p>{children}</p>{actions && <div className="empty-actions">{actions}</div>}</section>
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
}

export function TransactionTable({ rows, busy, onToggle, onDelete, sort, onSort }: TableProps) {
  if (busy) return <p className="empty">Carregando lançamentos…</p>
  if (!rows.length) return <p className="empty">Nenhum lançamento por aqui.</p>
  const head = (key: SortKey, label: string, className = '') => onSort
    ? <th className={className}><button className="th-button" onClick={() => onSort(key)}>{label}{sort?.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
    : <th className={className}>{label}</th>
  return <div className="table-scroll"><table><thead><tr>
    {head('date', 'Data')}<th>Descrição</th>{head('person', 'Responsável')}<th>Categoria</th><th>Parcela</th><th>Status</th>{head('amount', 'Valor', 'num')}<th />
  </tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
    <td>{formatDate(row.occurred_on)}</td>
    <td className="desc"><b>{row.description}</b></td>
    <td>{row.person?.name || '—'}</td>
    <td>{row.category?.name ? <span className="tag">{row.category.name}</span> : '—'}</td>
    <td>{row.installment_count ? <span className={`tag ${row.installment_number === row.installment_count ? 'last' : ''}`}>{row.installment_number}/{row.installment_count}</span> : <span className="muted">À vista</span>}</td>
    <td><button className={`tag ${row.status === 'paid' ? 'paid' : 'pending'}`} onClick={() => onToggle(row)} title="Clique para alternar">{row.status === 'paid' ? 'Pago' : 'Não pago'}</button></td>
    <td className="num">{money(Number(row.amount))}</td>
    <td><button className="text-button" onClick={() => onDelete(row)} aria-label="Excluir lançamento">Excluir</button></td>
  </tr>)}</tbody></table></div>
}
