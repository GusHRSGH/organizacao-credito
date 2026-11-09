import { useCallback, useEffect, useMemo, useState } from 'react'
import { messageOf } from './lib/format'
import { useGoogleAccount } from './hooks/useGoogleAccount'
import { useCloud } from './hooks/useCloud'
import { Icon, LogoMark, type IconName } from './components/Icon'
import type { DrillFilter } from './lib/drill'
import Welcome from './components/Welcome'
import { useTheme } from './lib/theme'
import { isNative, registerBack, useBackHandler, watchShortcuts } from './lib/native'
import { buildSuggestions } from './lib/suggest'
import QuickSheet from './components/QuickSheet'
import UpdateBanner from './components/UpdateBanner'
import Legal from './components/Legal'
import Tour from './components/Tour'
import WhatsNew from './components/WhatsNew'
import { ENTRIES, LATEST, pendingEntries, type ChangelogEntry } from './lib/changelog'
import { currentPeriod } from './services/installments'
import { getSource } from './services/source'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import Billing from './pages/Billing'
import Settings from './pages/Settings'
import type { Invoice, Transaction } from './types'

const ENTRY_KEY = 'oc:entry'
const NUDGE_KEY = 'oc:nudge-until'
const TOUR_KEY = 'oc:tour'
const NEWS_KEY = 'oc:news-seen'
const NUDGE_DAYS = 7
type Page = 'dashboard' | 'invoices' | 'billing' | 'settings'
const TITLES: Record<Page, string> = { dashboard: 'Visão geral', invoices: 'Faturas', billing: 'Quem deve quanto', settings: 'Dados' }

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [guest, setGuest] = useState(() => { try { return localStorage.getItem(ENTRY_KEY) === 'guest' } catch { return false } })
  const [offer, setOffer] = useState<{ modifiedTime: string } | null>(null)
  const source = getSource()
  const [page, setPage] = useState<Page>('dashboard')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [focusId, setFocusId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [alert, setAlert] = useState<{ kind: 'notice' | 'error'; text: string } | null>(null)
  const [quickSignal, setQuickSignal] = useState(0)
  const [drill, setDrill] = useState<{ filter: DrillFilter; nonce: number } | null>(null)
  const goDrill = useCallback((filter: DrillFilter) => { setInvoiceId(filter.invoiceId); setDrill({ filter, nonce: Date.now() }); setPage('invoices'); window.scrollTo({ top: 0 }) }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [updateSignal, setUpdateSignal] = useState(0)
  const [legalOpen, setLegalOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [news, setNews] = useState<ChangelogEntry[] | null>(null)
  const [nudgeHidden, setNudgeHidden] = useState(() => { try { return Number(localStorage.getItem(NUDGE_KEY) ?? 0) > Date.now() } catch { return false } })

  const notify = useCallback((type: 'notice' | 'error', text: string) => setAlert({ kind: type, text }), [])
  const localSource = source
  const google = useGoogleAccount({
    makeBackupText: loaded ? async () => (invoices.length || transactions.length ? JSON.stringify(await localSource.exportBackup()) : null) : null,
    dataKey: transactions,
    notify,
  })
  const signedIn = !!google.status?.signedIn
  const empty = loaded && invoices.length === 0 && transactions.length === 0

  useEffect(() => {
    if (!signedIn || !empty) { setOffer(null); return }
    let cancelled = false
    void google.latest().then((info) => { if (!cancelled && info) setOffer({ modifiedTime: info.modifiedTime }) }).catch(() => undefined)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, empty])

  const continueAsGuest = () => { try { localStorage.setItem(ENTRY_KEY, 'guest') } catch { /* ignora */ } setGuest(true) }
  const signOutGoogle = async () => { try { localStorage.removeItem(ENTRY_KEY) } catch { /* ignora */ } setGuest(false); await google.signOut() }

  async function restoreOffer() {
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
  const closeLegal = useCallback(() => setLegalOpen(false), [])
  const closeNews = useCallback(() => { try { localStorage.setItem(NEWS_KEY, String(LATEST)) } catch { /* ignora */ } setNews(null) }, [])
  const closeTour = useCallback(() => { try { localStorage.setItem(TOUR_KEY, 'done') } catch { /* ignora */ } setTourOpen(false) }, [])
  useBackHandler(legalOpen, closeLegal)
  const hideNudge = () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now() + NUDGE_DAYS * 86400000)) } catch { /* ignora */ } setNudgeHidden(true) }
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
    let cancelled = false
    setLoaded(false)
    void refresh().catch((cause) => { if (!cancelled) notify('error', messageOf(cause)) }).finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [refresh, notify])

  const cloud = useCloud({ local: source, dataKey: transactions, loaded, onDownloaded: refresh, notify })

  const entered = guest || signedIn || !!cloud.session
  useEffect(() => {
    if (!entered || !loaded) return
    try {
      const seenRaw = localStorage.getItem(NEWS_KEY)
      const seen = seenRaw === null ? null : Number(seenRaw)
      const firstRun = seen === null && localStorage.getItem(TOUR_KEY) !== 'done' && invoices.length === 0
      if (firstRun) { localStorage.setItem(NEWS_KEY, String(LATEST)); setTourOpen(true); return }
      const pending = pendingEntries(seen)
      if (pending.length) setNews(pending)
      else if (localStorage.getItem(TOUR_KEY) !== 'done') setTourOpen(true)
    } catch { /* ignora */ }
  }, [entered, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), alert.kind === 'notice' ? 5000 : 12000)
    return () => clearTimeout(timer)
  }, [alert])

  const counts = useMemo(() => ({ invoices: invoices.length, rows: transactions.length }), [invoices, transactions])

  if (!google.ready || !cloud.ready) return <main className="center-screen" />
  if (!signedIn && !guest && !cloud.session) return <><Welcome google={google} cloud={cloud} theme={theme} onToggleTheme={toggleTheme} onGuest={continueAsGuest} onLegal={() => setLegalOpen(true)} alert={alert} onDismissAlert={() => setAlert(null)} />{legalOpen && <Legal onClose={closeLegal} />}</>

  const local = source
  const googleUi = { ...google, signOut: signOutGoogle }
  const nav = (id: Page, icon: IconName, label: string) => <button data-tour={`nav-${id}`} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMenuOpen(false) }} aria-current={page === id ? 'page' : undefined}><span className="nav-icon"><Icon name={icon} size={19} /></span><span className="nav-text">{label}</span></button>

  return <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
    <div className="menu-backdrop" onClick={closeMenu} aria-hidden="true" />
    <aside className="sidebar">
      <div className="brand"><LogoMark size={36} /><span>Organização<br />do Crédito</span></div>
      {nav('dashboard', 'dashboard', 'Visão geral')}{nav('invoices', 'invoices', 'Faturas e lançamentos')}{nav('billing', 'users', 'Quem deve quanto')}{nav('settings', 'settings', 'Dados e backup')}
      <div className="sidebar-footer">
        {google.status?.signedIn
          ? <>{google.status.picture ? <img className="avatar-img" src={google.status.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(google.status.email ?? '?')[0].toUpperCase()}</span>}<span>{google.status.name ?? google.status.email}<br /><small>Google conectado · {counts.invoices} faturas</small></span></>
          : cloud.session
            ? <><span className="avatar">{(cloud.session.user.email?.[0] ?? '?').toUpperCase()}</span><span>{cloud.session.user.email}<br /><small>Nuvem · {counts.invoices} faturas</small></span></>
            : <><span className="avatar"><Icon name="database" size={15} /></span><span>Banco local<br /><small>{isNative ? 'Neste aparelho' : 'Neste computador'} · {counts.invoices} faturas</small></span></>}
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Icon name="menu" size={22} /></button><div className="breadcrumb"><b>{TITLES[page]}</b></div></div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}><span key={theme} className="theme-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span></button></div></header>
      <UpdateBanner manualSignal={updateSignal} />
      {guest && !cloud.session && !signedIn && loaded && !nudgeHidden && page !== 'settings' && <div className="restore-offer" role="status"><span><b>Seus dados estão só neste aparelho.</b> Crie uma conta com o e-mail para ter uma cópia segura na nuvem e usar em outros aparelhos.</span><div className="button-row"><button className="primary-button" onClick={() => setPage('settings')}>Criar conta</button><button className="text-button" onClick={hideNudge}>Depois</button></div></div>}
      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={() => setAlert(null)}>Fechar</button></div>}
      {offer && page !== 'settings' && <div className="restore-offer" role="status"><span>Encontramos um backup de <b>{new Date(offer.modifiedTime).toLocaleDateString('pt-BR')}</b> no seu Google Drive. Quer restaurar?</span><div className="button-row"><button className="primary-button" onClick={() => void restoreOffer()}>Restaurar backup</button><button className="text-button" onClick={() => setOffer(null)}>Agora não</button></div></div>}
      {!loaded && page !== 'settings' ? <p className="empty">Carregando…</p> : <>
        {page === 'dashboard' && <Dashboard invoices={invoices} transactions={transactions} focusId={focusId} compareId={compareId} onFocus={setFocusId} onCompare={setCompareId} onGo={setPage} onDrill={goDrill} canImport={!!local} />}
        {page === 'invoices' && <Invoices source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} local={local} quickSignal={quickSignal} drill={drill} />}
        {page === 'billing' && <Billing source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} onDrill={goDrill} />}
        {page === 'settings' && <Settings onCheckUpdate={() => setUpdateSignal((n) => n + 1)} google={googleUi} cloud={cloud} local={local} invoices={invoices} transactions={transactions} onChanged={refresh} notify={notify} onLegal={() => setLegalOpen(true)} onTour={() => setTourOpen(true)} onNews={() => setNews(ENTRIES)} />}
      </>}
    </main>
    <nav className="tabbar" aria-label="Navegação principal">{([['dashboard', 'dashboard', 'Início'], ['invoices', 'invoices', 'Faturas'], ['billing', 'users', 'Cobrança'], ['settings', 'settings', 'Dados']] as [Page, IconName, string][]).map(([id, icon, label]) => <button key={id} data-tour={`nav-${id}`} className={page === id ? 'active' : ''} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={21} /><span>{label}</span></button>)}</nav>
    {!sheetOpen && <button data-tour="fab" className="fab" onClick={() => setSheetOpen(true)} aria-label="Novo gasto"><Icon name="plus" size={26} /></button>}
    {legalOpen && <Legal onClose={closeLegal} />}
    {news && <WhatsNew entries={news} onClose={() => { closeNews(); try { if (localStorage.getItem(TOUR_KEY) !== 'done') setTourOpen(true) } catch { /* ignora */ } }} />}
    {tourOpen && !news && <Tour onClose={closeTour} onPage={setPage} onAction={(action) => { closeTour(); if (action === 'add') setSheetOpen(true); else setPage('settings') }} />}
    <QuickSheet open={sheetOpen} onClose={closeSheet} source={source} invoice={invoices.find((invoice) => invoice.id === invoiceId)} people={people} categories={categories} suggestions={suggestions} onSaved={refresh} notify={notify} />
  </div>
}
