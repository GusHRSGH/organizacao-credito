import GoogleAccountPanel from '../components/GoogleAccount'
import SecurityPanel from '../components/SecurityPanel'
import { Icon } from '../components/Icon'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import { useRef, useState } from 'react'
import { PageHeading, Panel } from '../components/ui'
import { formatDate, messageOf, money } from '../lib/format'
import { downloadText, stamp, toCsv } from '../services/exporters'
import { readWorkbook, type ParsedSheet } from '../services/importXlsx'
import type { LocalSource } from '../services/localSource'
import type { ImportResult, Invoice, SourceKind, Transaction } from '../types'
import { hasSupabaseConfig } from '../lib/supabase'

interface Props {
  kind: SourceKind
  google: GoogleAccount
  local: LocalSource
  invoices: Invoice[]
  transactions: Transaction[]
  onKind: (kind: SourceKind) => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
}

export default function Settings({ kind, google, local, invoices, transactions, onKind, onChanged, notify }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const isLocal = kind === 'local'

  const batchOf = (list: ParsedSheet[], selection: Record<string, boolean>) =>
    list.filter((s) => selection[s.sheetName] && s.period).map((s) => ({ period: s.period!, label: s.label, rows: s.rows }))

  async function refreshPreview(list: ParsedSheet[], selection: Record<string, boolean>) {
    const batch = batchOf(list, selection)
    setPreview(batch.length ? await local.importInvoices(batch, { dryRun: true }) : null)
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setBusy(true); setPreview(null); setSheets([])
    try {
      const parsed = await readWorkbook(file)
      if (!parsed.length) throw new Error('Não encontrei nenhuma aba com as colunas Data, Título e Valor.')
      const selection = Object.fromEntries(parsed.map((s) => [s.sheetName, !!s.period]))
      setSheets(parsed); setPicked(selection); setFileName(file.name)
      await refreshPreview(parsed, selection)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function toggleSheet(name: string) {
    const selection = { ...picked, [name]: !picked[name] }
    setPicked(selection)
    await refreshPreview(sheets, selection)
  }

  async function confirmImport() {
    const batch = batchOf(sheets, picked)
    if (!batch.length) return
    setBusy(true)
    try {
      const result = await local.importInvoices(batch)
      await onChanged()
      setSheets([]); setPreview(null); setFileName('')
      notify('notice', `Importação concluída: ${result.added} lançamentos novos, ${result.duplicates} já existiam.`)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false) }
  }

  async function restore(file: File | undefined) {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!window.confirm('Restaurar este backup substitui TODOS os dados atuais do banco local. Continuar?')) return
      await local.restoreBackup(parsed)
      await onChanged()
      notify('notice', 'Backup restaurado.')
    } catch (cause) { notify('error', cause instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : messageOf(cause)) } finally { if (backupRef.current) backupRef.current.value = '' }
  }

  async function backup() {
    try {
      downloadText(`organizacao-credito-backup-${stamp()}.json`, JSON.stringify(await local.exportBackup(), null, 2), 'application/json')
      notify('notice', 'Backup baixado. Guarde o arquivo em um lugar seguro.')
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function clearAll() {
    if (!window.confirm('Apagar TODOS os dados do banco local? Isso não pode ser desfeito (baixe um backup antes).')) return
    try { await local.clearAll(); await onChanged(); notify('notice', 'Banco local limpo.') } catch (cause) { notify('error', messageOf(cause)) }
  }

  return <>
    <PageHeading title="Dados e configurações" subtitle="Escolha onde ficam os dados, importe sua planilha e faça backups." />

    <Panel title="Fonte de dados" subtitle="Você pode alternar quando quiser; cada fonte guarda seus próprios dados.">
      <div className="source-switch">
        <button className={`source-option ${isLocal ? 'active' : ''}`} onClick={() => onKind('local')}><Icon name="database" size={22} /><b>Banco local</b><span>Neste computador, sem conta e sem internet.</span></button>
        <button className={`source-option ${!isLocal ? 'active' : ''}`} onClick={() => onKind('supabase')} disabled={!hasSupabaseConfig}><Icon name="cloud" size={22} /><b>Nuvem (Supabase)</b><span>{hasSupabaseConfig ? 'Sincroniza entre aparelhos, com login.' : 'Indisponível: falta configurar o Supabase neste build.'}</span></button>
      </div>
      <p className="hint">A integração com Google Sheets entra numa próxima etapa.</p>
    </Panel>

    <SecurityPanel notify={notify} />

    <GoogleAccountPanel google={google} local={isLocal ? local : null} onChanged={onChanged} notify={notify} />

    <Panel title="Exportar" subtitle={`${transactions.length} lançamentos em ${invoices.length} faturas`}>
      <div className="button-row">
        <button className="secondary-button" disabled={!transactions.length} onClick={() => downloadText(`organizacao-credito-${stamp()}.csv`, toCsv(transactions, invoices), 'text/csv')}><Icon name="download" size={16} />Baixar CSV (Excel)</button>
        {isLocal && <button className="secondary-button" onClick={() => void backup()}><Icon name="download" size={16} />Baixar backup (JSON)</button>}
        {isLocal && <button className="secondary-button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={16} />Restaurar backup…</button>}
        <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(event) => void restore(event.target.files?.[0])} />
      </div>
    </Panel>

    {isLocal ? <Panel title="Importar planilha .xlsx" subtitle="O arquivo é lido neste computador; nada é enviado para fora.">
      <div className="button-row"><button className="primary-button" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Escolher arquivo…</button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
        {fileName && <span className="muted">{fileName}</span>}</div>
      {sheets.length > 0 && <div className="import-box">
        <table className="data-table"><thead><tr><th /><th>Aba</th><th>Fatura</th><th className="num">Linhas</th><th className="num">Total</th><th>Resultado</th></tr></thead><tbody>
          {sheets.map((sheet) => {
            const result = preview?.invoices.find((entry) => entry.period === sheet.period)
            const total = sheet.rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
            return <tr key={sheet.sheetName}>
              <td><input type="checkbox" checked={!!picked[sheet.sheetName]} disabled={!sheet.period} onChange={() => void toggleSheet(sheet.sheetName)} aria-label={`Importar ${sheet.sheetName}`} /></td>
              <td>{sheet.sheetName}</td><td>{sheet.period ? sheet.label : <span className="neg">mês não identificado</span>}</td>
              <td className="num">{sheet.rows.length}</td><td className="num">{money(total)}</td>
              <td>{result ? `${result.added} novos · ${result.duplicates} já existentes${result.created ? ' · fatura nova' : ''}` : '—'}</td></tr>
          })}</tbody></table>
        {sheets.some((sheet) => sheet.issues.length) && <details className="issues"><summary>{sheets.reduce((n, s) => n + s.issues.length, 0)} avisos de leitura</summary><ul>{sheets.flatMap((s) => s.issues.map((issue) => <li key={s.sheetName + issue}>{s.sheetName}: {issue}</li>))}</ul></details>}
        <p className="hint">Primeiro lançamento: {sheets[0].rows[0] ? `${formatDate(sheets[0].rows[0].date)} · ${sheets[0].rows[0].description}` : '—'}. Lançamentos idênticos já existentes são ignorados, então reimportar é seguro.</p>
        <div className="button-row"><button className="primary-button" disabled={busy || !preview?.added} onClick={() => void confirmImport()}>Importar {preview?.added ?? 0} lançamentos</button><button className="text-button" onClick={() => { setSheets([]); setPreview(null) }}>Cancelar</button></div>
      </div>}
    </Panel> : <Panel title="Importar planilha .xlsx"><p className="empty">A importação funciona no banco local. Troque a fonte de dados acima.</p></Panel>}

    {isLocal && <Panel title="Zona de perigo"><div className="button-row"><button className="danger-button" onClick={() => void clearAll()}><Icon name="trash" size={16} />Apagar todos os dados locais</button></div></Panel>}
  </>
}
