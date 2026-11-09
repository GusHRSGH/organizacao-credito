import { useMemo, useState } from 'react'
import { formatDate, money } from '../lib/format'
import { analyzeSheet, applyMapping, FIELD_LABELS, type Confidence, type Field, type Proposal, type RawSheet } from '../services/smartImport'
import type { ParsedSheet } from '../services/importXlsx'

interface Props { raw: RawSheet[]; onConfirm: (sheets: ParsedSheet[]) => void; onCancel: () => void }

const FIELDS = Object.keys(FIELD_LABELS) as Field[]
const BADGE: Record<Confidence, string> = { alta: 'pelo título', media: 'pelo conteúdo', baixa: 'palpite, confira' }

/** Mostra como o robô interpretou cada aba e deixa a pessoa corrigir antes de importar. */
export default function ImportAssistant({ raw, onConfirm, onCancel }: Props) {
  const initial = useMemo(() => raw.map((sheet) => ({ sheet, proposal: analyzeSheet(sheet.name, sheet.data) })).filter((item): item is { sheet: RawSheet; proposal: Proposal } => item.proposal !== null), [raw])
  const [fields, setFields] = useState<Record<string, Field[]>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.fields])))
  const [header, setHeader] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.headerIndex >= 0])))
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.ok])))

  const current = initial.map(({ sheet, proposal }) => {
    const mine: Proposal = { ...proposal, fields: fields[proposal.sheetName], headerIndex: header[proposal.sheetName] ? Math.max(proposal.headerIndex, 0) : -1 }
    const parsed = applyMapping(mine, sheet.data)
    const count = parsed.reduce((n, s) => n + s.rows.length, 0)
    const total = parsed.reduce((sum, s) => sum + s.rows.reduce((t, r) => t + Math.round(r.amount * 100), 0), 0) / 100
    const missing = (['date', 'desc', 'amount'] as Field[]).filter((f) => !mine.fields.includes(f))
    return { sheet, proposal, mine, parsed, count, total, missing }
  })
  const chosen = current.filter((item) => on[item.proposal.sheetName] && !item.missing.length && item.count > 0)

  function setField(sheetName: string, column: number, field: Field) {
    setFields((all) => {
      const next = [...all[sheetName]]
      if (field !== 'ignore') next.forEach((value, i) => { if (value === field) next[i] = 'ignore' })
      next[column] = field
      return { ...all, [sheetName]: next }
    })
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <div className="modal assistant" role="dialog" aria-modal="true" aria-label="Robô de importação">
      <h2>Entendi sua planilha assim</h2>
      <p className="hint">O robô olhou os títulos e o conteúdo de cada coluna. Confira o que ele leu. Se algo estiver errado, troque a coluna na lista; nada é importado antes de você confirmar.</p>
      {!current.length && <p className="empty">Não consegui encontrar uma tabela nessa planilha.</p>}
      {current.map(({ sheet, proposal, mine, count, total, missing }) => {
        const name = proposal.sheetName
        const start = Math.max(mine.headerIndex + 1, 0)
        const preview = sheet.data.slice(start, start + 4)
        return <section key={name} className="assistant-sheet">
          <label className="assistant-head"><input type="checkbox" checked={!!on[name]} disabled={!!missing.length || !count} onChange={() => setOn({ ...on, [name]: !on[name] })} aria-label={`Importar ${name}`} />
            <b>{name}</b><span className="muted">{count} lançamentos · {money(total)}</span></label>
          {missing.length > 0 && <p className="neg">Falta indicar: {missing.map((f) => FIELD_LABELS[f]).join(', ')}.</p>}
          <div className="assistant-scroll"><table className="data-table assistant-table">
            <thead><tr>{proposal.fields.map((_, c) => <th key={c}>
              <select value={mine.fields[c]} onChange={(event) => setField(name, c, event.target.value as Field)} aria-label={`Coluna ${proposal.headers[c]} de ${name}`}>{FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select>
              <small>{mine.fields[c] === 'ignore' ? proposal.headers[c] : `${proposal.headers[c]} · ${fields[name][c] === proposal.fields[c] ? BADGE[proposal.confidence[c]] : 'ajustado por você'}`}</small></th>)}</tr></thead>
            <tbody>{preview.map((row, r) => <tr key={r}>{proposal.fields.map((_, c) => <td key={c}>{row?.[c] instanceof Date ? formatDate((row[c] as Date).toISOString().slice(0, 10)) : String(row?.[c] ?? '')}</td>)}</tr>)}</tbody>
          </table></div>
          <label className="check"><input type="checkbox" checked={!!header[name]} onChange={() => setHeader({ ...header, [name]: !header[name] })} />A primeira linha é o cabeçalho</label>
        </section>
      })}
      <div className="button-row"><button className="primary-button" disabled={!chosen.length} onClick={() => onConfirm(chosen.flatMap((item) => item.parsed))}>Está certo, continuar</button><button className="text-button" onClick={onCancel}>Cancelar</button></div>
    </div>
  </div>
}
