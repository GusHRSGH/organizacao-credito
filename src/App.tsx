import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { messageOf } from './lib/format'
import { useGoogleAccount } from './hooks/useGoogleAccount'
import { useSupabaseAuth } from './hooks/useSupabaseAuth'
import { Icon, Logo, LogoMark, type IconName } from './components/Icon'
import type { DrillFilter } from './lib/drill'
import Welcome from './components/Welcome'
import { useTheme } from './lib/theme'
import { isNative, registerBack, useBackHandler, watchShortcuts } from './lib/native'
import { buildSuggestions } from './lib/suggest'
import QuickSheet from './components/QuickSheet'
import UpdateBanner from './components/UpdateBanner'
import { currentPeriod } from './services/installments'
import { getSource, getStoredKind, isLocalSource, storeKind } from './services/source'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import Billing from './pages/Billing'
import Settings from './pages/Settings'
import type { Invoice, SourceKind, Transaction } from './types'

const ENTRY_KEY = 'oc:entry'
type Page = 'dashboard' | 'invoices' | 'billing' | 'settings'
const TITLES: Record<Page, string> = { dashboard: 'Visão geral', invoices: 'Faturas', billing: 'Quem deve quanto', settings: 'Dados' }

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [guest, setGuest] = useState(() => { try { return localStorage.getItem(ENTRY_KEY) === 'guest' } catch { return false } })
  const [offer, setOffer] = useState<{ modifiedTime: string } | null>(null)
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
  const [quickSignal, setQuickSignal] = useState(0)
  const [drill, setDrill] = useState<{ filter: DrillFilter; nonce: number } | null>(null)
  const goDrill = useCallback((filter: DrillFilter) => { setInvoiceId(filter.invoiceId); setDrill({ filter, nonce: Date.now() }); setPage('invoices'); window.scrollTo({ top: 0 }) }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [updateSignal, setUpdateSignal] = useState(0)

  const active = kind === 'local' || !!session
  const notify = useCallback((type: 'notice' | 'error', text: string) => setAlert({ kind: type, text }), [])
  const localSource = isLocalSource(source) ? source : null
  const google = useGoogleAccount({
    makeBackupText: localSource && loaded ? async () => (invoices.length || transactions.length ? JSON.stringify(await localSource.exportBackup()) : null) : null,
    dataKey: transactions,
    notify,
  })
  const signedIn = !!google.status?.signedIn
  const empty = loaded && invoices.length === 0 && transactions.length === 0

  useEffect(() => {
    if (!signedIn || !empty || !localSource) { setOffer(null); return }
    let cancelled = false
    void google.latest().then((info) => { if (!cancelled && info) setOffer({ modifiedTime: info.modifiedTime }) }).catch(() => undefined)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, empty])

  const continueAsGuest = () => { try { localStorage.setItem(ENTRY_KEY, 'guest') } catch { /* ignora */ } setGuest(true) }
  const signOutGoogle = async () => { try { localStorage.removeItem(ENTRY_KEY) } catch { /* ignora */ } setGuest(false); await google.signOut() }

  async function restoreOffer() {
    if (!localSource) return
    try {
      const parsed: unknown = JSON.parse(await google.restoreText())
      await localSource.restoreBackup(parsed)
      await refresh()
      setOffer(null)
      notify('notice', 'Backup do Google Drive restaurado.')
    } catch (cause) { notify('error', messageOf(cause)) }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); setPage('invoices'); setQuickSignal((n) => n + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  useBackHandler(menuOpen, closeMenu)
  useEffect(() => {
    if (page === 'dashboard') return
    return registerBack(() => { setPage('dashboard'); return true })
  }, [page])
  useEffect(() => watchShortcuts((target) => {
    if (target === 'novo') { setPage('invoices'); setSheetOpen(true) }
    if (target === 'cobranca') setPage('billing')
  }), [])
  useEffect(() => {
    let startX = -1, startY = 0
    const down = (event: TouchEvent) => { startX = event.touches[0].clientX; startY = event.touches[0].clientY }
    const up = (event: TouchEvent) => {
      if (startX < 0 || window.innerWidth > 820) return
      const dx = event.changedTouches[0].clientX - startX, dy = Math.abs(event.changedTouches[0].clientY - startY)
      if (dy < 60 && dx > 70 && startX < 28) setMenuOpen(true)
      if (dy < 60 && dx < -70) setMenuOpen(false)
      startX = -1
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    return () => { document.removeEventListener('touchstart', down); document.removeEventListener('touchend', up) }
  }, [])
  const suggestions = useMemo(() => buildSuggestions(transactions), [transactions])
  const people = useMemo(() => [...new Set(transactions.map((row) => row.person?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])
  const categories = useMemo(() => [...new Set(transactions.map((row) => row.category?.name).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [transactions])

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

  if (kind === 'local' && google.ready && !signedIn && !guest) return <Welcome google={google} theme={theme} onToggleTheme={toggleTheme} onGuest={continueAsGuest} alert={alert} onDismissAlert={() => setAlert(null)} />
  if (kind === 'local' && !google.ready) return <main className="center-screen" />
  if (kind === 'supabase' && !ready) return <main className="center-screen">Carregando…</main>
  if (kind === 'supabase' && !hasSupabaseConfig) return <main className="center-screen"><section className="auth-card"><h1>Nuvem não configurada</h1><p>Este build não tem credenciais do Supabase.</p><button className="primary-button" onClick={() => changeKind('local')}>Usar banco local</button></section></main>
  if (kind === 'supabase' && !session) return <main className="center-screen"><section className="auth-card"><Logo size={52} /><h1>Organização do Crédito</h1><p>Acesse sua área privada. Enviaremos um link de entrada para seu e-mail.</p>
    <form onSubmit={(event) => void sendMagicLink(event)} className="auth-form"><label>E-mail<input type="email" name="email" required autoComplete="email" placeholder="voce@exemplo.com" /></label><button className="primary-button">Enviar link de acesso</button></form>
    {(authError || alert?.kind === 'error') && <p className="error">{authError || alert?.text}</p>}{authNotice && <p className="notice">{authNotice}</p>}
    <button className="text-button" onClick={() => changeKind('local')}>Voltar ao banco local</button></section></main>

  const local = isLocalSource(source) ? source : null
  const googleUi = { ...google, signOut: signOutGoogle }
  const nav = (id: Page, icon: IconName, label: string) => <button className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMenuOpen(false) }} aria-current={page === id ? 'page' : undefined}><span className="nav-icon"><Icon name={icon} size={19} /></span><span className="nav-text">{label}</span></button>

  return <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
    <div className="menu-backdrop" onClick={closeMenu} aria-hidden="true" />
    <aside className="sidebar">
      <div className="brand"><LogoMark size={36} /><span>Organização<br />do Crédito</span></div>
      {nav('dashboard', 'dashboard', 'Visão geral')}{nav('invoices', 'invoices', 'Faturas e lançamentos')}{nav('billing', 'users', 'Quem deve quanto')}{nav('settings', 'settings', 'Dados e backup')}
      <div className="sidebar-footer">
        {kind === 'local' && google.status?.signedIn
          ? <>{google.status.picture ? <img className="avatar-img" src={google.status.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(google.status.email ?? '?')[0].toUpperCase()}</span>}<span>{google.status.name ?? google.status.email}<br /><small>Google conectado · {counts.invoices} faturas</small></span></>
          : <><span className="avatar">{kind === 'local' ? <Icon name="database" size={15} /> : (session?.user.email?.[0] ?? '?').toUpperCase()}</span><span>{kind === 'local' ? 'Banco local' : session?.user.email}<br /><small>{kind === 'local' ? (isNative ? 'Neste aparelho' : 'Neste computador') : 'Nuvem'} · {counts.invoices} faturas</small></span></>}
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Icon name="menu" size={22} /></button><div className="breadcrumb"><b>{TITLES[page]}</b></div></div>
        <div className="topbar-actions">{kind === 'supabase' && <button className="text-button" onClick={() => void supabase?.auth.signOut()}>Sair</button>}
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}><span key={theme} className="theme-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span></button></div></header>
      <UpdateBanner manualSignal={updateSignal} />
      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={() => setAlert(null)}>Fechar</button></div>}
      {offer && page !== 'settings' && <div className="restore-offer" role="status"><span>Encontramos um backup de <b>{new Date(offer.modifiedTime).toLocaleDateString('pt-BR')}</b> no seu Google Drive. Quer restaurar?</span><div className="button-row"><button className="primary-button" onClick={() => void restoreOffer()}>Restaurar backup</button><button className="text-button" onClick={() => setOffer(null)}>Agora não</button></div></div>}
      {!loaded && page !== 'settings' ? <p className="empty">Carregando…</p> : <>
        {page === 'dashboard' && <Dashboard invoices={invoices} transactions={transactions} focusId={focusId} compareId={compareId} onFocus={setFocusId} onCompare={setCompareId} onGo={setPage} onDrill={goDrill} canImport={!!local} />}
        {page === 'invoices' && <Invoices source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} local={local} quickSignal={quickSignal} drill={drill} />}
        {page === 'billing' && <Billing source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} onDrill={goDrill} />}
        {page === 'settings' && (local ? <Settings onCheckUpdate={() => setUpdateSignal((n) => n + 1)} kind={kind} google={googleUi} local={local} invoices={invoices} transactions={transactions} onKind={changeKind} onChanged={refresh} notify={notify} /> : <Settings onCheckUpdate={() => setUpdateSignal((n) => n + 1)} kind={kind} google={googleUi} local={getSource('local') as never} invoices={invoices} transactions={transactions} onKind={changeKind} onChanged={refresh} notify={notify} />)}
      </>}
    </main>
    <nav className="tabbar" aria-label="Navegação principal">{([['dashboard', 'dashboard', 'Início'], ['invoices', 'invoices', 'Faturas'], ['billing', 'users', 'Cobrança'], ['settings', 'settings', 'Dados']] as [Page, IconName, string][]).map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={21} /><span>{label}</span></button>)}</nav>
    {!sheetOpen && <button className="fab" onClick={() => setSheetOpen(true)} aria-label="Novo gasto"><Icon name="plus" size={26} /></button>}
    <QuickSheet open={sheetOpen} onClose={closeSheet} source={source} invoice={invoices.find((invoice) => invoice.id === invoiceId)} people={people} categories={categories} suggestions={suggestions} onSaved={refresh} notify={notify} />
  </div>
}
