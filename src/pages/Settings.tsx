import GoogleAccountPanel from '../components/GoogleAccount'
import { UpdatePanel } from '../components/SecurityPanel'
import { Icon } from '../components/Icon'
import type { GoogleAccount } from '../hooks/useGoogleAccount'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeading, Panel } from '../components/ui'
import { formatDate, messageOf, money } from '../lib/format'
import { downloadAsset, downloadText, stamp, toCsv } from '../services/exporters'
import { readWorkbook, type ParsedSheet } from '../services/importXlsx'
import { readRawSheets, type RawSheet } from '../services/smartImport'
import ImportAssistant from '../components/ImportAssistant'
import CleanupAssistant from '../components/CleanupAssistant'
import type { CleanupPlan } from '../lib/cleanup'
import type { LocalSource, SnapshotInfo } from '../services/localSource'
import type { ImportResult, Invoice, Transaction } from '../types'
import CloudPanel from '../components/CloudPanel'
import type { CloudState } from '../hooks/useCloud'

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
  onTour: () => void
  onNews: () => void
  onBank: () => void
}

export default function Settings({ google, cloud, local, invoices, transactions, onCheckUpdate, onChanged, notify, onLegal, onTour, onNews, onBank }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [raw, setRaw] = useState<RawSheet[] | null>(null)
  const [cleaning, setCleaning] = useState(false)
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
      const parsed = /\.xlsx$/i.test(file.name) ? await readWorkbook(file) : []
      setFileName(file.name)
      if (!parsed.length) {
        // Formato fora do padrão: o robô tenta entender e a pessoa confirma
        const found = await readRawSheets(file)
        if (!found.length) throw new Error('A planilha está vazia.')
        setRaw(found)
        return
      }
      await acceptParsed(parsed)
    } catch (cause) { notify('error', messageOf(cause)) } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function acceptParsed(parsed: ParsedSheet[]) {
    const selection = Object.fromEntries(parsed.map((s) => [s.sheetName, !!s.period]))
    setSheets(parsed); setPicked(selection)
    await refreshPreview(parsed, selection)
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

  async function applyCleanup(plan: CleanupPlan) {
    setBusy(true)
    try {
      const changed = await local.applyCleanup(plan)
      await onChanged(); await loadSnapshots(); setCleaning(false)
      notify('notice', `Pronto: ${changed} ajustes feitos. Se não gostar, volte pela cópia “antes” em Cópias automáticas.`)
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
      downloadText(`chacun-backup-${stamp()}.json`, JSON.stringify(await local.exportBackup(), null, 2), 'application/json')
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
    {cleaning && <CleanupAssistant transactions={transactions} busy={busy} onApply={(plan) => void applyCleanup(plan)} onCancel={() => setCleaning(false)} />}
    {raw && <ImportAssistant raw={raw} onCancel={() => { setRaw(null); setFileName('') }} onConfirm={(list) => { setRaw(null); setBusy(true); void acceptParsed(list).catch((cause) => notify('error', messageOf(cause))).finally(() => setBusy(false)) }} />}
    <PageHeading title="Dados e backup" subtitle="Conta na nuvem, cópias, exportar, importar e limpeza. O visual, o cartão e os avisos ficam em Configurações." />

    <CloudPanel cloud={cloud} notify={notify} onLegal={onLegal} />

    <UpdatePanel onCheck={onCheckUpdate} />

    <Panel tour="set-copias" icon="shield" title="Cópias automáticas" subtitle="O app guarda sozinho neste aparelho uma cópia por dia e uma antes de restaurar ou limpar. Sem internet, sem conta.">
      {snapshots.length ? <ul className="snapshot-list">{snapshots.map((snapshot) => <li key={snapshot.id}>
        <span><b>{new Date(snapshot.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b> · {snapshot.reason === 'antes' ? 'antes de restaurar/limpar' : 'cópia do dia'} · {snapshot.transactions} lançamentos</span>
        <button className="text-button" onClick={() => void restoreSnapshot(snapshot)}>Voltar para esta</button></li>)}</ul>
        : <p className="hint">Ainda não há cópias. A primeira é criada quando você mexer nos dados.</p>}
      <p className="hint">{lastFile ? `Último backup em arquivo: ${new Date(lastFile).toLocaleDateString('pt-BR')}. ` : 'Você ainda não salvou um backup em arquivo. '}As cópias automáticas ficam no aparelho: se ele for perdido ou formatado, somem junto. Por isso, de vez em quando, use “Baixar backup” e mande o arquivo para você mesmo.</p>
    </Panel>

    <GoogleAccountPanel google={google} local={local} onChanged={onChanged} notify={notify} />

    <Panel tour="set-export" icon="download" title="Exportar" subtitle={`${transactions.length} lançamentos em ${invoices.length} faturas`}>
      <div className="button-row">
        <button className="secondary-button" disabled={!transactions.length} onClick={() => downloadText(`chacun-${stamp()}.csv`, toCsv(transactions, invoices), 'text/csv')}><Icon name="download" size={16} />Baixar CSV (Excel)</button>
        <button className="secondary-button" onClick={() => void backup()}><Icon name="download" size={16} />Baixar backup (JSON)</button>
        <button className="secondary-button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={16} />Restaurar backup…</button>
        <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(event) => void restore(event.target.files?.[0])} />
      </div>
    </Panel>

    <Panel tour="set-import" icon="upload" title="Importar planilha" subtitle="Aceita .xlsx e .csv de qualquer formato. O arquivo é lido neste aparelho; nada é enviado para fora.">
      <div className="button-row"><button className="primary-button" onClick={onBank}><Icon name="upload" size={16} />Importar fatura do banco (Nubank e outros)</button><button className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Outra planilha…</button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <button className="secondary-button" onClick={() => void downloadAsset('modelo-fatura.xlsx', 'modelo-fatura.xlsx').catch((cause) => notify('error', messageOf(cause)))}><Icon name="download" size={16} />Baixar modelo de planilha</button>
        {fileName && <span className="muted">{fileName}</span>}</div>
      <p className="hint">Sem se preocupar com colunas: se a planilha não seguir o modelo, o robô descobre sozinho o que é data, título e valor, e você confere antes de importar. Quer o caminho mais certo? Baixe o modelo (uma aba por fatura, o nome da aba define o mês).</p>
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

    <Panel tour="set-clean" icon="sparkle" title="Robô de limpeza" subtitle="Arruma descrições sujas do banco e junta nomes repetidos. Você aprova antes.">
      <div className="button-row"><button className="secondary-button" disabled={!transactions.length} onClick={() => setCleaning(true)}><Icon name="sparkle" size={16} />Procurar bagunça</button></div>
      <p className="hint">Exemplo: “UBER *TRIP 8842” e “UBER *TRIP 1290” viram “Uber”. “Transporte” e “Transportes” viram uma categoria só.</p>
    </Panel>

    <Panel icon="sparkle" title="Ajuda" subtitle="Um passo a passo rápido de como usar o app."><div className="button-row"><button className="secondary-button" onClick={onTour}>Ver o tutorial</button><button className="secondary-button" onClick={onNews}>Novidades do app</button></div></Panel>

    <Panel icon="trash" title="Zona de perigo"><div className="button-row"><button className="danger-button" onClick={() => void clearAll()}><Icon name="trash" size={16} />Apagar todos os dados locais</button></div></Panel>
  </>
}
