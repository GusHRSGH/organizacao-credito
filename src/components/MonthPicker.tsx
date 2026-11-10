import { useState } from 'react'
import { MONTH_NAMES } from '../services/installments'

interface Props { value: string; onChange: (period: string) => void; existing?: string[] }

/** Escolhe qualquer mês de qualquer ano. Os que já têm fatura aparecem marcados. */
export default function MonthPicker({ value, onChange, existing = [] }: Props) {
  const [year, setYear] = useState(Number(value.slice(0, 4)) || new Date().getFullYear())
  return <div className="month-grid" role="group" aria-label="Escolher mês">
    <div className="month-year"><button type="button" className="icon-button" aria-label="Ano anterior" onClick={() => setYear(year - 1)}>‹</button><b aria-live="polite">{year}</b><button type="button" className="icon-button" aria-label="Próximo ano" onClick={() => setYear(year + 1)}>›</button></div>
    <div className="month-cells">{MONTH_NAMES.map((name, i) => {
      const period = `${year}-${String(i + 1).padStart(2, '0')}-01`
      return <button type="button" key={period} className={`month-chip ${value === period ? 'on' : ''} ${existing.includes(period) ? 'has' : ''}`} aria-pressed={value === period} aria-label={`${name} ${year}${existing.includes(period) ? ', já existe' : ''}`} onClick={() => onChange(period)}>{name.slice(0, 3)}</button>
    })}</div>
  </div>
}
