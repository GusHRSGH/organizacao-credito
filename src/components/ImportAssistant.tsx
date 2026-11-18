import { useEffect, useMemo, useRef, useState } from 'react'
import AskWizard, { type AskStep } from './AskWizard'
import { formatDate, money } from '../lib/format'
import { readCard } from '../lib/card'
import { analyzeSheet, applyMapping, FIELD_LABELS, guessSheetMonth, type Confidence, type Field, type Proposal, type RawSheet } from '../services/smartImport'
import type { ParsedSheet } from '../services/importXlsx'
import { periodLabel } from '../services/installments'

interface Props { raw: RawSheet[]; onConfirm: (sheets: ParsedSheet[]) => void; onCancel: () => void }

const FIELDS = Object.keys(FIELD_LABELS) as Field[]
const BADGE: Record<Confidence, string> = { alta: 'pelo título', media: 'pelo conteúdo', baixa: 'palpite, confira' }

/** Mostra como o robô interpretou cada aba e deixa a pessoa corrigir antes de importar. */
export default function ImportAssistant({ raw, onConfirm, onCancel }: Props) {
  const initial = useMemo(() => raw.map((sheet) => ({ sheet, proposal: analyzeSheet(sheet.name, sheet.data) })).filter((item): item is { sheet: RawSheet; proposal: Proposal } => item.proposal !== null), [raw])
  const [fields, setFields] = useState<Record<string, Field[]>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.fields])))
  const [header, setHeader] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.headerIndex >= 0])))
  // Planilha sem data (orçamento do mês): o mês escolhido vale para todas as linhas.
  const [noDate, setNoDate] = useState<Record<string, string>>({})
  const [monthOk, setMonthOk] = useState<Record<string, boolean>>({})
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map(({ proposal }) => [proposal.sheetName, proposal.ok])))

  const current = initial.map(({ sheet, proposal }) => {
    const mine: Proposal = { ...proposal, fields: fields[proposal.sheetName], headerIndex: header[proposal.sheetName] ? Math.max(proposal.headerIndex, 0) : -1, fixedPeriod: !fields[proposal.sheetName].includes('date') ? noDate[proposal.sheetName] : undefined }
    const parsed = applyMapping(mine, sheet.data, readCard())
    const count = parsed.reduce((n, s) => n + s.rows.length, 0)
    const total = parsed.reduce((sum, s) => sum + s.rows.reduce((t, r) => t + Math.round(r.amount * 100), 0), 0) / 100
    const missing = (['date', 'desc', 'amount'] as Field[]).filter((f) => !mine.fields.includes(f) && !(f === 'date' && mine.fixedPeriod))
    return { sheet, proposal, mine, parsed, count, total, missing }
  })
  const chosen = current.filter((item) => on[item.proposal.sheetName] && !item.missing.length && item.count > 0)

  // O robô só pergunta o que não sabe: colunas lidas por palpite e campos obrigatórios que ele não achou.
  const [colAnswers, setColAnswers] = useState<Record<string, string>>({})
  const sample = (sheet: RawSheet, headerIndex: number, column: number) => sheet.data.slice(Math.max(headerIndex + 1, 0)).map((row) => row?.[column]).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').slice(0, 3)
    .map((value) => (value instanceof Date ? formatDate(value.toISOString().slice(0, 10)) : String(value).slice(0, 24))).join(' · ')
  const steps: AskStep[] = current.flatMap(({ sheet, proposal, mine, missing }) => {
    const name = proposal.sheetName
    const label = (c: number) => proposal.headers[c]?.trim() || `Coluna ${c + 1}`
    const many = current.length > 1 ? ` (aba ${name})` : ''
    const unsure: AskStep[] = proposal.fields.flatMap((field, c) => field === 'ignore' || proposal.confidence[c] !== 'baixa' ? [] : [{
      key: `col|${name}|${c}`, tag: 'Coluna', title: `A coluna “${label(c)}”${many} é ${FIELD_LABELS[field].toLowerCase()}?`, meta: sample(sheet, mine.headerIndex, c) || undefined,
      hint: 'Li pelo conteúdo, mas não tenho certeza.', answer: colAnswers[`col|${name}|${c}`],
      options: [{ value: field, label: `Sim, ${FIELD_LABELS[field].toLowerCase()}`, primary: true }, ...FIELDS.filter((f) => f !== field).map((f) => ({ value: f, label: f === 'ignore' ? 'Ignorar coluna' : FIELD_LABELS[f] }))],
    }])
    const dateless = !mine.fields.includes('date')
    const absent: AskStep[] = [...missing, ...(dateless && mine.fixedPeriod ? ['date' as Field] : [])].map((f) => ({
      key: `miss|${name}|${f}`, tag: 'Coluna', title: `Qual coluna${many} tem ${FIELD_LABELS[f].toLowerCase()}?`, answer: f === 'date' && mine.fixedPeriod ? 'sem-data' : undefined,
      hint: f === 'date' ? 'Não encontrei sozinho. Toque na coluna certa, ou diga que a planilha não tem data.' : 'Não encontrei sozinho. Toque na coluna certa.',
      options: [...proposal.headers.map((_, c) => ({ value: String(c), label: label(c), note: sample(sheet, mine.headerIndex, c) || undefined })),
        ...(f === 'date' ? [{ value: 'sem-data', label: 'Não tem data', note: 'Tudo entra em um mês só' }] : [])],
    }))
    // Sem coluna de data, a pergunta do mês já fica na fila logo depois (some se a pessoa indicar uma coluna).
    const month = dateless ? noDate[name] ?? guessSheetMonth(name, sheet.data, new Date().toISOString().slice(0, 10)) : undefined
    const shift = (iso: string, by: number) => { const [y, m] = iso.split('-').map(Number); const t = y * 12 + m - 1 + by; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01` }
    const asked: AskStep[] = month ? [{
      key: `mes|${name}`, tag: 'Mês', title: `De que mês são esses valores${many}?`, hint: 'Sem data na planilha, todas as linhas entram nesse mês.',
      answer: monthOk[name] && noDate[name] ? month : undefined,
      options: [shift(month, -1), month, shift(month, 1)].map((iso) => ({ value: iso, label: periodLabel(iso), primary: iso === month })),
      other: { placeholder: 'Outro mês, ex.: 03/2027', button: 'Usar' },
    }] : []
    return [...unsure, ...absent, ...asked]
  })
  function onAnswer(key: string, value: string) {
    const [kind, sheetName, rest] = key.split('|')
    // Respondeu o que faltava: a aba passa a entrar na importação.
    if (kind !== 'col') setOn((all) => ({ ...all, [sheetName]: true }))
    if (kind === 'col') { setField(sheetName, Number(rest), value as Field); setColAnswers((all) => ({ ...all, [key]: value })) }
    else if (kind === 'mes') {
      const typed = value.match(/^(\d{1,2})\s*[/-]\s*(\d{4})$/)
      const iso = typed ? `${typed[2]}-${typed[1].padStart(2, '0')}-01` : value
      if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(iso)) return
      setNoDate((all) => ({ ...all, [sheetName]: iso })); setMonthOk((all) => ({ ...all, [sheetName]: true }))
    } else if (value === 'sem-data') {
      const item = initial.find((entry) => entry.proposal.sheetName === sheetName)
      if (item) setNoDate((all) => ({ ...all, [sheetName]: guessSheetMonth(sheetName, item.sheet.data, new Date().toISOString().slice(0, 10)) }))
    } else setField(sheetName, Number(value), rest as Field)
  }
  // Tudo lido com segurança: segue direto para a conferência de quem é cada compra.
  const sure = !steps.length && chosen.length > 0 && current.every((item) => item.proposal.ok && !item.mine.fixedPeriod)
  const sent = useRef(false)
  useEffect(() => { if (sure && !sent.current) { sent.current = true; onConfirm(chosen.flatMap((item) => item.parsed)) } }, [sure, chosen, onConfirm])

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
      <AskWizard steps={steps} onAnswer={onAnswer} summary={<>
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
      </>} />
    </div>
  </div>
}
