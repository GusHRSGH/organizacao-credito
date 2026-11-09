import GoogleAccountPanel from '../components/GoogleAccount'
import SecurityPanel, { UpdatePanel } from '../components/SecurityPanel'
import { Icon } from '../components/Icon'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeading, Panel } from '../components/ui'
import { formatDate, messageOf, money } from '../lib/format'
import { downloadAsset, downloadText, stamp, toCsv } from '../services/exporters'
import { readWorkbook, type ParsedSheet } from '../services/importXlsx'
import type { LocalSource, SnapshotInfo } from '../services/localSource'
import type { ImportResult, Invoice, Transaction } from '../types'
import CloudPanel from '../components/CloudPanel'
import type { CloudState } from '../hooks/useCloud'
import { useAppearance, type ThemeMode } from '../lib/theme'
import { PALETTES, tokensFor } from '../lib/themes'

interface Props {
  google: GoogleAccount
  cloud: CloudState
  local: LocalSource
  invoices: Invoice[]
  transactions: Transaction[]
  onCheckUpdate: () => void
  onChanged: () => Promise<void>
  notify: (kind: 'notice' | 'error', text: string) => void
  onLegal: () => void
}

function AppearancePanel() {
  const { mode, palette, theme, setMode, setPalette } = useAppearance()
  const modes: { id: ThemeMode; label: string; icon: 'sun' | 'moon' | 'sparkle' }[] = [{ id: 'auto', label: 'Automático', icon: 'sparkle' }, { id: 'light', label: 'Claro', icon: 'sun' }, { id: 'dark', label: 'Escuro', icon: 'moon' }]
  return <Panel icon="sparkle" title="Aparência" subtitle="Escolha o visual do app. A mudança vale na hora e fica salva neste aparelho.">
    <div className="mode-switch" role="radiogroup" aria-label="Modo">
      {modes.map((item) => <button key={item.id} role="radio" aria-checked={mode === item.id} className={mode === item.id ? 'on' : ''} onClick={() => setMode(item.id)}><Icon name={item.icon} size={16} />{item.label}</button>)}
    </div>
    <div className="theme-grid" role="radiogroup" aria-label="Tema">
      {PALETTES.map((item) => {
        const t = tokensFor(item, theme)
        const on = palette === item.id
        return <button key={item.id} role="radio" aria-checked={on} className={`theme-card ${on ? 'on' : ''}`} onClick={() => setPalette(item.id)}>
          <span className="theme-preview" style={{ background: t['--bg'] }}>
            <span className="side" style={{ background: t['--sidebar'] }}><i style={{ background: t['--primary'] }} /><i style={{ background: t['--muted'] }} /><i style={{ background: t['--muted'] }} /></span>
            <span className="body"><span className="row"><i style={{ background: t['--surface'], flex: 1, border: `1px solid ${t['--line']}` }} /><i style={{ background: t['--primary'], width: 22 }} /></span><i style={{ background: t['--bad'], width: '46%' }} /><i style={{ background: t['--surface-2'], width: '70%' }} /></span>
          </span>
          <span className="theme-name">{item.name}{on && <Icon name="check" size={16} />}</span>
        </button>
      })}
    </div>
    <p className="hint">{theme === 'light' && palette === 'amoled' ? 'O preto puro só aparece no modo escuro; no claro, o app usa o branco. ' : ''}O vermelho dos pendentes é sempre o mesmo, em qualquer tema.</p>
  </Panel>
}

export default function Settings({ google, cloud, local, invoices, transactions, onCheckUpdate, onChanged, notify, onLegal }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [lastFile, setLastFile] = useState<string | null>(() => { try { return localStorage.getItem('orc-last-file-backup') } catch { return null } })
  const loadSnapshots = useCallback(async () => { try { setSnapshots(await local.listSnapshots()) } catch { setSnapshots([]) } }, [local])
  useEffect(() => { void loadSnapshots() }, [loadSnapshots, transactions.length])

  async function restoreSnapshot(snapshot: SnapshotInfo) {
    const when = new Date(snapshot.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    if (!window.confirm(`Voltar para a cópia de ${when} (${snapshot.transactions} lançamentos)? Os dados atuais são guardados antes, então dá para desfazer.`)) return
    try { await local.restoreSnapshot(snapshot.id); await onChanged(); await loadSnapshots(); notify('notice', 'Cópia restaurada. Os dados de antes ficaram guardados na lista.') } catch (cause) { notify('error', messageOf(cause)) }
  }

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
      const now = new Date().toISOString()
      try { localStorage.setItem('orc-last-file-backup', now) } catch { /* sem armazenamento: só não lembra a data */ }
      setLastFile(now)
      notify('notice', 'Backup salvo. Guarde o arquivo em um lugar seguro (WhatsApp, e-mail, pen drive…).')
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  async function clearAll() {
    if (!window.confirm('Apagar TODOS os dados do banco local? Isso não pode ser desfeito (baixe um backup antes).')) return
    try { await local.clearAll(); await onChanged(); notify('notice', 'Banco local limpo.') } catch (cause) { notify('error', messageOf(cause)) }
  }

  return <>
    <PageHeading title="Dados e configurações" subtitle="Conta, aparência, backups e importação da sua planilha." />

    <AppearancePanel />

    <CloudPanel cloud={cloud} notify={notify} onLegal={onLegal} />

    <SecurityPanel notify={notify} />
    <UpdatePanel onCheck={onCheckUpdate} />

    <Panel icon="shield" title="Cópias automáticas" subtitle="O app guarda sozinho neste aparelho uma cópia por dia e uma antes de restaurar ou limpar. Sem internet, sem conta.">
      {snapshots.length ? <ul className="snapshot-list">{snapshots.map((snapshot) => <li key={snapshot.id}>
        <span><b>{new Date(snapshot.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b> · {snapshot.reason === 'antes' ? 'antes de restaurar/limpar' : 'cópia do dia'} · {snapshot.transactions} lançamentos</span>
        <button className="text-button" onClick={() => void restoreSnapshot(snapshot)}>Voltar para esta</button></li>)}</ul>
        : <p className="hint">Ainda não há cópias. A primeira é criada quando você mexer nos dados.</p>}
      <p className="hint">{lastFile ? `Último backup em arquivo: ${new Date(lastFile).toLocaleDateString('pt-BR')}. ` : 'Você ainda não salvou um backup em arquivo. '}As cópias automáticas ficam no aparelho: se ele for perdido ou formatado, somem junto. Por isso, de vez em quando, use “Baixar backup” e mande o arquivo para você mesmo.</p>
    </Panel>

    <GoogleAccountPanel google={google} local={local} onChanged={onChanged} notify={notify} />

    <Panel icon="download" title="Exportar" subtitle={`${transactions.length} lançamentos em ${invoices.length} faturas`}>
      <div className="button-row">
        <button className="secondary-button" disabled={!transactions.length} onClick={() => downloadText(`organizacao-credito-${stamp()}.csv`, toCsv(transactions, invoices), 'text/csv')}><Icon name="download" size={16} />Baixar CSV (Excel)</button>
        <button className="secondary-button" onClick={() => void backup()}><Icon name="download" size={16} />Baixar backup (JSON)</button>
        <button className="secondary-button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={16} />Restaurar backup…</button>
        <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(event) => void restore(event.target.files?.[0])} />
      </div>
    </Panel>

    <Panel icon="upload" title="Importar planilha .xlsx" subtitle="O arquivo é lido neste computador; nada é enviado para fora.">
      <div className="button-row"><button className="primary-button" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Escolher arquivo…</button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <button className="secondary-button" onClick={() => void downloadAsset('modelo-fatura.xlsx', 'modelo-fatura.xlsx').catch((cause) => notify('error', messageOf(cause)))}><Icon name="download" size={16} />Baixar modelo de planilha</button>
        {fileName && <span className="muted">{fileName}</span>}</div>
      <p className="hint">Não tem planilha ainda? Baixe o modelo, preencha e importe. Uma aba por fatura; o nome da aba define o mês.</p>
      {sheets.length > 0 && <div className="import-box">
        <div className="import-list"><table className="data-table import-table"><thead><tr><th /><th>Aba</th><th>Fatura</th><th className="num">Linhas</th><th className="num">Total</th><th>Resultado</th></tr></thead><tbody>
          {sheets.map((sheet) => {
            const result = preview?.invoices.find((entry) => entry.period === sheet.period)
            const total = sheet.rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
            return <tr key={sheet.sheetName}>
              <td><input type="checkbox" checked={!!picked[sheet.sheetName]} disabled={!sheet.period} onChange={() => void toggleSheet(sheet.sheetName)} aria-label={`Importar ${sheet.sheetName}`} /></td>
              <td data-label="Aba">{sheet.sheetName}</td><td data-label="Fatura">{sheet.period ? sheet.label : <span className="neg">mês não identificado</span>}</td>
              <td className="num" data-label="Linhas">{sheet.rows.length}</td><td className="num" data-label="Total">{money(total)}</td>
              <td data-label="Resultado">{result ? `${result.added} novos · ${result.duplicates} já existentes${result.created ? ' · fatura nova' : ''}` : '—'}</td></tr>
          })}</tbody></table></div>
        {sheets.some((sheet) => sheet.issues.length) && <details className="issues"><summary>{sheets.reduce((n, s) => n + s.issues.length, 0)} avisos de leitura</summary><ul>{sheets.flatMap((s) => s.issues.map((issue) => <li key={s.sheetName + issue}>{s.sheetName}: {issue}</li>))}</ul></details>}
        <p className="hint">Primeiro lançamento: {sheets[0].rows[0] ? `${formatDate(sheets[0].rows[0].date)} · ${sheets[0].rows[0].description}` : '—'}. Lançamentos idênticos já existentes são ignorados, então reimportar é seguro.</p>
        <div className="button-row"><button className="primary-button" disabled={busy || !preview?.added} onClick={() => void confirmImport()}>Importar {preview?.added ?? 0} lançamentos</button><button className="text-button" onClick={() => { setSheets([]); setPreview(null) }}>Cancelar</button></div>
      </div>}
    </Panel>

    <Panel icon="trash" title="Zona de perigo"><div className="button-row"><button className="danger-button" onClick={() => void clearAll()}><Icon name="trash" size={16} />Apagar todos os dados locais</button></div></Panel>
  </>
}
