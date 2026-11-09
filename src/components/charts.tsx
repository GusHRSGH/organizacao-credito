import { useId } from 'react'
import { useReveal } from '../hooks/useReveal'
import { money, moneyShort, pct } from '../lib/format'

import { GREEN, RED, type Series } from './palette'

const press = (action?: () => void, label?: string) => action
  ? { 'data-pickable': true, role: 'button', tabIndex: 0, 'aria-label': label, onClick: action, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() } } }
  : {}
const Hint = ({ show }: { show: boolean }) => (show ? <p className="drill-hint">Toque numa parte do gráfico para ver os lançamentos →</p> : null)
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return <div className="chart-legend">{items.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}</div>
}

export function ChartEmpty({ children = 'Sem dados para mostrar.' }: { children?: string }) {
  return <p className="empty chart-empty">{children}</p>
}

interface HBarProps {
  rows: { label: string; values: number[] }[]
  series: Series[]
  stacked?: boolean
  onPick?: (rowLabel: string, seriesIndex: number) => void
}

export function HBarChart({ rows, series, stacked = false, onPick }: HBarProps) {
  const uid = useId().replace(/:/g, '')
  const [reveal, shown] = useReveal<HTMLDivElement>()
  const W = 620
  const labelW = 112
  const right = 78
  const barH = stacked ? 20 : 13
  const groupH = stacked ? barH : series.length * barH + (series.length - 1) * 3
  const rowH = groupH + 16
  const max = Math.max(0, ...rows.map((row) => (stacked ? row.values.reduce((a, b) => a + b, 0) : Math.max(...row.values))))
  if (!rows.length || max === 0) return <ChartEmpty />
  const scale = (W - labelW - right) / max
  const H = 8 + rows.length * rowH
  return <div ref={reveal} className={`reveal ${shown ? 'in' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Gráfico de barras por responsável">
      <defs>{series.map((s, i) => <linearGradient key={s.name + i} id={`${uid}g${i}`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={s.light} /><stop offset="1" stopColor={s.color} /></linearGradient>)}</defs>
      {rows.map((row, r) => {
        const y0 = 8 + r * rowH
        let cursor = labelW
        return <g key={row.label}>
          <text x={labelW - 12} y={y0 + groupH / 2 + 4} textAnchor="end" className="chart-label" {...press(onPick && (() => onPick(row.label, 0)), `Ver lançamentos de ${row.label}`)}>{clip(row.label, 17)}</text>
          {stacked ? <>
            {row.values.map((value, i) => {
              const width = value * scale
              const x = cursor
              cursor += width
              if (value <= 0) return null
              return <g key={i} {...press(onPick && (() => onPick(row.label, i)), `Ver lançamentos de ${row.label}: ${series[i]?.name ?? ''}`)}>
                <rect className="grow-x" style={{ animationDelay: `${r * 60}ms` }} x={x} y={y0} width={Math.max(width - 1.5, 1)} height={barH} rx={4} fill={`url(#${uid}g${i})`} />
                {width > 52 && <text x={x + width / 2} y={y0 + barH / 2 + 3.5} textAnchor="middle" className="chart-inside">{moneyShort(value)}</text>}
              </g>
            })}
            <text x={cursor + 8} y={y0 + barH / 2 + 4} className="chart-value">{moneyShort(row.values.reduce((a, b) => a + b, 0))}</text>
          </> : row.values.map((value, i) => {
            const y = y0 + i * (barH + 3)
            const width = value * scale
            return <g key={i} {...press(onPick && (() => onPick(row.label, i)), `Ver lançamentos de ${row.label}: ${series[i]?.name ?? ''}`)}>
              <rect className="grow-x" style={{ animationDelay: `${r * 60 + i * 40}ms` }} x={labelW} y={y} width={value > 0 ? Math.max(width, 3) : 0} height={barH} rx={4} fill={`url(#${uid}g${i})`} />
              {value > 0 && <text x={labelW + Math.max(width, 3) + 6} y={y + barH - 2.5} className="chart-value">{moneyShort(value)}</text>}
            </g>
          })}
        </g>
      })}
    </svg>
    <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    <Hint show={!!onPick} />
  </div>
}

export interface Slice { name: string; value: number; color: string }

export function Donut({ slices, centerLabel, onPick }: { slices: Slice[]; centerLabel: string; onPick?: (name: string) => void }) {
  const [reveal, shown] = useReveal<HTMLDivElement>()
  const visible = slices.filter((slice) => slice.value > 0)
  const total = visible.reduce((sum, slice) => sum + slice.value, 0)
  if (!total) return <ChartEmpty />
  const r = 74
  const C = 2 * Math.PI * r
  let offset = 0
  return <div ref={reveal} className={`donut-wrap reveal ${shown ? 'in' : ''}`}>
    <svg viewBox="0 0 200 200" className="donut-svg" role="img" aria-label="Gráfico de rosca por categoria">
      <circle cx="100" cy="100" r={r} fill="none" className="donut-track" strokeWidth="26" />
      {visible.map((slice) => {
        const length = (slice.value / total) * C
        const gap = visible.length > 1 ? 2.5 : 0
        const shownLength = Math.max(length - gap, 0.5)
        const node = <circle key={slice.name} {...press(onPick && (() => onPick(slice.name)), `Ver lançamentos de ${slice.name}`)} className="donut-seg" style={{ '--len': shownLength, '--c': C, '--d': `${Math.round((offset / C) * 700)}ms` } as React.CSSProperties} cx="100" cy="100" r={r} fill="none" stroke={slice.color} strokeWidth="26" strokeDasharray={`${shownLength} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />
        offset += length
        return node
      })}
      <text x="100" y="94" textAnchor="middle" className="donut-small">{centerLabel}</text>
      <text x="100" y="116" textAnchor="middle" className="donut-total">{moneyShort(total)}</text>
    </svg>
    <ul className="donut-legend">
      {visible.map((slice) => <li key={slice.name} {...press(onPick && (() => onPick(slice.name)), `Ver lançamentos de ${slice.name}`)}><i style={{ background: slice.color }} /><span>{slice.name}</span><b>{pct(slice.value / total, 0)}</b><small>{money(slice.value)}</small></li>)}
    </ul>
    <Hint show={!!onPick} />
  </div>
}

export interface Column { id?: string; label: string; paid: number; pending: number }

export function StackedColumns({ items, onPick }: { items: Column[]; onPick?: (id: string, part: 'paid' | 'pending' | 'all') => void }) {
  const uid = useId().replace(/:/g, '')
  const [reveal, shown] = useReveal<HTMLDivElement>()
  if (!items.length) return <ChartEmpty />
  const W = 760
  const H = 270
  const padT = 30
  const padB = 34
  const padX = 14
  const slot = (W - padX * 2) / items.length
  const barW = Math.min(70, slot * 0.62)
  const max = Math.max(...items.map((item) => item.paid + item.pending), 1)
  const scale = (H - padT - padB) / max
  const base = H - padB
  return <div ref={reveal} className={`reveal ${shown ? 'in' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Evolução das faturas mês a mês">
      <defs>
        <linearGradient id={`${uid}p`} x1="0" x2="0" y1="1" y2="0"><stop offset="0" stopColor={GREEN.color} /><stop offset="1" stopColor={GREEN.light} /></linearGradient>
        <linearGradient id={`${uid}n`} x1="0" x2="0" y1="1" y2="0"><stop offset="0" stopColor={RED.color} /><stop offset="1" stopColor={RED.light} /></linearGradient>
      </defs>
      <line className="chart-axis" x1={padX} x2={W - padX} y1={base} y2={base} />
      {items.map((item, i) => {
        const x = padX + slot * i + (slot - barW) / 2
        const paidH = item.paid * scale
        const pendH = item.pending * scale
        const total = item.paid + item.pending
        return <g key={item.label + i}>
          {item.paid > 0 && <rect {...press(onPick && item.id ? () => onPick(item.id!, 'paid') : undefined, `Ver pagos de ${item.label}`)} className="grow-y" style={{ animationDelay: `${i * 50}ms` }} x={x} y={base - paidH} width={barW} height={paidH} rx={pendH > 0 ? 0 : 6} fill={`url(#${uid}p)`} />}
          {item.pending > 0 && <rect {...press(onPick && item.id ? () => onPick(item.id!, 'pending') : undefined, `Ver pendentes de ${item.label}`)} className="grow-y" style={{ animationDelay: `${i * 50 + 120}ms` }} x={x} y={base - paidH - pendH} width={barW} height={pendH} rx={6} fill={`url(#${uid}n)`} />}
          {paidH > 18 && <text x={x + barW / 2} y={base - paidH / 2 + 3.5} textAnchor="middle" className="chart-inside">{moneyShort(item.paid)}</text>}
          {pendH > 18 && <text x={x + barW / 2} y={base - paidH - pendH / 2 + 3.5} textAnchor="middle" className="chart-inside">{moneyShort(item.pending)}</text>}
          <text x={x + barW / 2} y={base - paidH - pendH - 8} textAnchor="middle" className="chart-total">{moneyShort(total)}</text>
          <text x={x + barW / 2} y={H - 12} textAnchor="middle" className="chart-label" {...press(onPick && item.id ? () => onPick(item.id!, 'all') : undefined, `Ver fatura de ${item.label}`)}>{item.label}</text>
        </g>
      })}
    </svg>
    <Legend items={[{ name: 'Pago', color: GREEN.color }, { name: 'Pendente', color: RED.color }]} />
    <Hint show={!!onPick} />
  </div>
}
