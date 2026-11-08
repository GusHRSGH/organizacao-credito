import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { messageOf } from './lib/format'
import { useGoogleAccount } from './hooks/useGoogleAccount'
import { useSupabaseAuth } from './hooks/useSupabaseAuth'
import { Icon, Logo, type IconName } from './components/Icon'
import { useTheme } from './lib/theme'
import { currentPeriod } from './services/installments'
import { getSource, getStoredKind, isLocalSource, storeKind } from './services/source'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import Settings from './pages/Settings'
import type { Invoice, SourceKind, Transaction } from './types'

type Page = 'dashboard' | 'invoices' | 'settings'
const TITLES: Record<Page, string> = { dashboard: 'Visão geral', invoices: 'Faturas', settings: 'Dados' }

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [kind, setKind] = useState<SourceKind>(getStoredKind)
  const source = getSource(kind)
  const { session, ready, error: authError } = useSupabaseAuth(kind === 'supabase')
  const [page, setPage] = useState<Page>('dashboard')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [focusId, setFocusId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [alert, setAlert] = useState<{ kind: 'notice' | 'error'; text: string } | null>(null)
  const [authNotice, setAuthNotice] = useState('')

  const active = kind === 'local' || !!session
  const notify = useCallback((type: 'notice' | 'error', text: string) => setAlert({ kind: type, text }), [])
  const localSource = isLocalSource(source) ? source : null
  const google = useGoogleAccount({
    makeBackupText: localSource && loaded ? async () => (invoices.length || transactions.length ? JSON.stringify(await localSource.exportBackup()) : null) : null,
    dataKey: transactions,
    notify,
  })

  const refresh = useCallback(async () => {
    const [inv, rows] = await Promise.all([source.listInvoices(), source.listAllTransactions()])
    setInvoices(inv); setTransactions(rows)
    const has = (id: string) => inv.some((invoice) => invoice.id === id)
    const now = currentPeriod()
    const asc = [...inv].sort((x, y) => x.period.localeCompare(y.period))
    const pickIndex = Math.max(0, asc.filter((invoice) => invoice.period <= now).length - 1)
    const defaultFocus = asc[pickIndex]?.id ?? ''
    const defaultCompare = asc[pickIndex - 1]?.id ?? asc[pickIndex + 1]?.id ?? ''
    setFocusId((current) => (has(current) ? current : defaultFocus))
    setCompareId((current) => (has(current) ? current : defaultCompare))
    setInvoiceId((current) => (has(current) ? current : defaultFocus))
  }, [source])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoaded(false)
    void refresh().catch((cause) => { if (!cancelled) notify('error', messageOf(cause)) }).finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [active, refresh, notify])

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), alert.kind === 'notice' ? 5000 : 12000)
    return () => clearTimeout(timer)
  }, [alert])

  const changeKind = (next: SourceKind) => { storeKind(next); setKind(next); setInvoices([]); setTransactions([]); setAlert(null) }
  const counts = useMemo(() => ({ invoices: invoices.length, rows: transactions.length }), [invoices, transactions])

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAlert(null); setAuthNotice('')
    const email = String(new FormData(event.currentTarget).get('email'))
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.desktopAuth?.redirectUrl ?? window.location.origin } })
    if (error) notify('error', error.message)
    else setAuthNotice('Enviamos um link de acesso para seu e-mail.')
  }

  if (kind === 'supabase' && !ready) return <main className="center-screen">Carregando…</main>
  if (kind === 'supabase' && !hasSupabaseConfig) return <main className="center-screen"><section className="auth-card"><h1>Nuvem não configurada</h1><p>Este build não tem credenciais do Supabase.</p><button className="primary-button" onClick={() => changeKind('local')}>Usar banco local</button></section></main>
  if (kind === 'supabase' && !session) return <main className="center-screen"><section className="auth-card"><Logo size={52} /><h1>Organização do Crédito</h1><p>Acesse sua área privada. Enviaremos um link de entrada para seu e-mail.</p>
    <form onSubmit={(event) => void sendMagicLink(event)} className="auth-form"><label>E-mail<input type="email" name="email" required autoComplete="email" placeholder="voce@exemplo.com" /></label><button className="primary-button">Enviar link de acesso</button></form>
    {(authError || alert?.kind === 'error') && <p className="error">{authError || alert?.text}</p>}{authNotice && <p className="notice">{authNotice}</p>}
    <button className="text-button" onClick={() => changeKind('local')}>Voltar ao banco local</button></section></main>

  const local = isLocalSource(source) ? source : null
  const nav = (id: Page, icon: IconName, label: string) => <button className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><span className="nav-icon"><Icon name={icon} size={19} /></span><span className="nav-text">{label}</span></button>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Logo size={38} /><span>Organização<br />do Crédito</span></div>
      <div className="nav-label">Workspace</div>
      {nav('dashboard', 'dashboard', 'Visão geral')}{nav('invoices', 'invoices', 'Faturas e lançamentos')}{nav('settings', 'settings', 'Dados e backup')}
      <div className="sidebar-note">Responsável é a pessoa a quem o gasto é atribuído.</div>
      <div className="sidebar-footer">
        {kind === 'local' && google.status?.signedIn
          ? <>{google.status.picture ? <img className="avatar-img" src={google.status.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(google.status.email ?? '?')[0].toUpperCase()}</span>}<span>{google.status.name ?? google.status.email}<br /><small>Google conectado · {counts.invoices} faturas</small></span></>
          : <><span className="avatar">{kind === 'local' ? <Icon name="database" size={15} /> : (session?.user.email?.[0] ?? '?').toUpperCase()}</span><span>{kind === 'local' ? 'Banco local' : session?.user.email}<br /><small>{kind === 'local' ? 'Neste computador' : 'Nuvem'} · {counts.invoices} faturas</small></span></>}
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{TITLES[page]}</b></div>
        <div className="topbar-actions">{kind === 'supabase' && <button className="text-button" onClick={() => void supabase?.auth.signOut()}>Sair</button>}
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}><span key={theme} className="theme-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span></button></div></header>
      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={() => setAlert(null)}>Fechar</button></div>}
      {!loaded && page !== 'settings' ? <p className="empty">Carregando…</p> : <>
        {page === 'dashboard' && <Dashboard invoices={invoices} transactions={transactions} focusId={focusId} compareId={compareId} onFocus={setFocusId} onCompare={setCompareId} onGo={setPage} canImport={!!local} />}
        {page === 'invoices' && <Invoices source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} />}
        {page === 'settings' && (local ? <Settings kind={kind} google={google} local={local} invoices={invoices} transactions={transactions} onKind={changeKind} onChanged={refresh} notify={notify} /> : <Settings kind={kind} google={google} local={getSource('local') as never} invoices={invoices} transactions={transactions} onKind={changeKind} onChanged={refresh} notify={notify} />)}
      </>}
    </main>
  </div>
}
