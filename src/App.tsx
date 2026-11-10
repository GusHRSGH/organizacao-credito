import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { messageOf } from './lib/format'
import { applySettings, updateSettings, useSettings } from './lib/settings'
import Reminders from './components/Reminders'
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
const Legal = lazy(() => import('./components/Legal'))
const Tour = lazy(() => import('./components/Tour'))
const WhatsNew = lazy(() => import('./components/WhatsNew'))
const SearchOverlay = lazy(() => import('./components/SearchOverlay'))
const BankImport = lazy(() => import('./components/BankImport'))
import { ENTRIES, LATEST, pendingEntries, type ChangelogEntry } from './lib/changelog'
import { currentPeriod, periodLabel } from './services/installments'
import type { Subscription } from './lib/watch'
import { getSource } from './services/source'
import Dashboard from './pages/Dashboard'
const Invoices = lazy(() => import('./pages/Invoices'))
const Billing = lazy(() => import('./pages/Billing'))
const Settings = lazy(() => import('./pages/Settings'))
const Goals = lazy(() => import('./pages/Goals'))
const Config = lazy(() => import('./pages/Config'))
import type { Invoice, Transaction } from './types'

const ENTRY_KEY = 'oc:entry'
const NUDGE_KEY = 'oc:nudge-until'
const TOUR_KEY = 'oc:tour'
const NEWS_KEY = 'oc:news-seen'
const NUDGE_DAYS = 7
type Page = 'dashboard' | 'invoices' | 'billing' | 'goals' | 'config' | 'settings'
const TITLES: Record<Page, string> = { dashboard: 'Visão geral', invoices: 'Faturas', billing: 'Quem deve quanto', goals: 'Metas e limites', config: 'Configurações', settings: 'Dados e backup' }

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [guest, setGuest] = useState(() => { try { return localStorage.getItem(ENTRY_KEY) === 'guest' } catch { return false } })
  const [offer, setOffer] = useState<{ modifiedTime: string } | null>(null)
  const source = getSource()
  const [prefs] = useSettings()
  const [page, setPage] = useState<Page>(() => { const start = prefs.startPage; return (start === 'billing' && !prefs.showBilling) || (start === 'goals' && !prefs.showGoals) ? 'dashboard' : start })
  useEffect(() => { applySettings() }, [])
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [focusId, setFocusId] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
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
  const [searchOpen, setSearchOpen] = useState(false)
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
      const typing = event.target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable)
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey)) { event.preventDefault(); setSearchOpen(true); return }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'h') { event.preventDefault(); updateSettings({ hideValues: !prefsRef.current.hideValues }); return }
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
  const launchSubs = useCallback(async (period: string, subs: Subscription[]) => {
    try {
      for (const sub of subs) {
        const last = transactions.find((row) => row.id === sub.ids[sub.ids.length - 1])
        const day = Math.min(28, Number(last?.occurred_on.slice(8, 10) ?? 1))
        await source.createRepeated({ invoiceId: '', occurredOn: `${period.slice(0, 7)}-${String(day).padStart(2, '0')}`, description: sub.name, amount: sub.monthly, personName: last?.person?.name ?? '', categoryName: last?.category?.name ?? '' }, [period])
      }
      await refresh()
      notify('notice', `${subs.length === 1 ? 'Assinatura lançada' : `${subs.length} assinaturas lançadas`} na fatura de ${periodLabel(period)}.`)
    } catch (cause) { notify('error', messageOf(cause)) }
  }, [transactions, source, refresh, notify])

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
  if (!signedIn && !guest && !cloud.session) return <><Welcome google={google} cloud={cloud} theme={theme} onToggleTheme={toggleTheme} onGuest={continueAsGuest} onLegal={() => setLegalOpen(true)} alert={alert} onDismissAlert={() => setAlert(null)} /><Suspense fallback={null}>{legalOpen && <Legal onClose={closeLegal} />}</Suspense></>

  const local = source
  const googleUi = { ...google, signOut: signOutGoogle }
  const nav = (id: Page, icon: IconName, label: string) => <button data-tour={`nav-${id}`} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMenuOpen(false) }} aria-current={page === id ? 'page' : undefined}><span className="nav-icon"><Icon name={icon} size={19} /></span><span className="nav-text">{label}</span></button>

  return <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
    <div className="menu-backdrop" onClick={closeMenu} aria-hidden="true" />
    <aside className="sidebar">
      <div className="brand"><LogoMark size={36} /><span>Organização<br />do Crédito</span></div>
      {nav('dashboard', 'dashboard', 'Visão geral')}{nav('invoices', 'invoices', 'Faturas e lançamentos')}{prefs.showBilling && nav('billing', 'users', 'Quem deve quanto')}{prefs.showGoals && nav('goals', 'trend-up', 'Metas e limites')}
      <div className="nav-section">Preferências</div>
      {nav('config', 'sparkle', 'Configurações')}{nav('settings', 'database', 'Dados e backup')}
      <div className="nav-section">Ajuda</div>
      <button className="nav-item" onClick={() => { setTourOpen(true); setMenuOpen(false) }}><span className="nav-icon"><Icon name="search" size={19} /></span><span className="nav-text">Tutorial</span></button>
      <button className="nav-item" onClick={() => { setNews(ENTRIES); setMenuOpen(false) }}><span className="nav-icon"><Icon name="sparkle" size={19} /></span><span className="nav-text">Novidades</span></button>
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
          <button className="theme-toggle" onClick={() => updateSettings({ hideValues: !prefs.hideValues })} aria-label={prefs.hideValues ? 'Mostrar os valores' : 'Ocultar os valores'} aria-pressed={prefs.hideValues} title={prefs.hideValues ? 'Mostrar valores (Ctrl+H)' : 'Ocultar valores (Ctrl+H)'}><Icon name="lock" size={18} /></button>
          <button className="theme-toggle" data-tour="search" onClick={() => setSearchOpen(true)} aria-label="Buscar em todas as faturas" title="Buscar (Ctrl+K ou /)"><Icon name="search" size={18} /></button>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}><span key={theme} className="theme-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></span></button></div></header>
      <UpdateBanner manualSignal={updateSignal} />
      {guest && !cloud.session && !signedIn && loaded && !nudgeHidden && page !== 'settings' && <div className="restore-offer" role="status"><span><b>Seus dados estão só neste aparelho.</b> Crie uma conta com o e-mail para ter uma cópia segura na nuvem e usar em outros aparelhos.</span><div className="button-row"><button className="primary-button" onClick={() => setPage('settings')}>Criar conta</button><button className="text-button" onClick={hideNudge}>Depois</button></div></div>}
      {alert && <div className={`alert ${alert.kind}`} role="status">{alert.text}<button className="text-button" onClick={() => setAlert(null)}>Fechar</button></div>}
      {offer && page !== 'settings' && <div className="restore-offer" role="status"><span>Encontramos um backup de <b>{new Date(offer.modifiedTime).toLocaleDateString('pt-BR')}</b> no seu Google Drive. Quer restaurar?</span><div className="button-row"><button className="primary-button" onClick={() => void restoreOffer()}>Restaurar backup</button><button className="text-button" onClick={() => setOffer(null)}>Agora não</button></div></div>}
      {loaded && page !== 'settings' && page !== 'config' && <Reminders invoices={invoices} transactions={transactions} onGo={(next) => { setPage(next); window.scrollTo({ top: 0 }) }} />}
      {!loaded && page !== 'settings' ? <p className="empty">Carregando…</p> : <Suspense fallback={<p className="empty">Carregando…</p>}>
        {page === 'dashboard' && <Dashboard invoices={invoices} transactions={transactions} focusId={focusId} compareId={compareId} onFocus={setFocusId} onCompare={setCompareId} onGo={setPage} onDrill={goDrill} canImport={!!local} onLaunchSubs={launchSubs} />}
        {page === 'invoices' && <Invoices source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} local={local} onBank={() => setBankOpen(true)} quickSignal={quickSignal} drill={drill} />}
        {page === 'billing' && <Billing source={source} invoices={invoices} transactions={transactions} invoiceId={invoiceId} onInvoice={setInvoiceId} onChanged={refresh} notify={notify} onDrill={goDrill} />}
        {page === 'goals' && <Goals invoices={invoices} transactions={transactions} invoiceId={invoiceId || focusId} onInvoice={setInvoiceId} notify={notify} onDrill={goDrill} />}
        {page === 'config' && <Config people={people} categories={categories} notify={notify} />}
        {page === 'settings' && <Settings onCheckUpdate={() => setUpdateSignal((n) => n + 1)} google={googleUi} cloud={cloud} local={local} invoices={invoices} transactions={transactions} onChanged={refresh} notify={notify} onLegal={() => setLegalOpen(true)} onTour={() => setTourOpen(true)} onNews={() => setNews(ENTRIES)} onBank={() => setBankOpen(true)} />}
      </Suspense>}
    </main>
    <nav className="tabbar" aria-label="Navegação principal">{([['dashboard', 'dashboard', 'Início'], ['invoices', 'invoices', 'Faturas'], ...(prefs.showBilling ? [['billing', 'users', 'Cobrança']] : []), ...(prefs.showGoals ? [['goals', 'trend-up', 'Metas']] : [])] as [Page, IconName, string][]).map(([id, icon, label]) => <button key={id} data-tour={`nav-${id}`} className={page === id ? 'active' : ''} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={21} /><span>{label}</span></button>)}<button data-tour="nav-more" className={page === 'config' || page === 'settings' ? 'active' : ''} onClick={() => setMenuOpen(true)} aria-label="Mais opções"><Icon name="menu" size={21} /><span>Mais</span></button></nav>
    {!sheetOpen && <button data-tour="fab" className="fab" onClick={() => setSheetOpen(true)} aria-label="Novo gasto"><Icon name="plus" size={26} /></button>}
    <Suspense fallback={null}>
    {legalOpen && <Legal onClose={closeLegal} />}
    {searchOpen && <SearchOverlay transactions={transactions} invoices={invoices} onClose={() => setSearchOpen(false)} onPick={(hit) => { setSearchOpen(false); goDrill({ invoiceId: hit.row.invoice_id, query: hit.row.description }) }} />}
    {bankOpen && <BankImport local={local} invoices={invoices} transactions={transactions} people={people} categories={categories} suggestions={suggestions} notify={notify} onClose={() => setBankOpen(false)}
      onDone={async (period, where) => {
        await refresh()
        const created = (await local.listInvoices()).find((item) => item.period === period)
        setBankOpen(false)
        if (created) { setFocusId(created.id); setInvoiceId(created.id) }
        setPage(where); window.scrollTo({ top: 0 })
      }} />}
    {news && <WhatsNew entries={news} onClose={() => { closeNews(); try { if (localStorage.getItem(TOUR_KEY) !== 'done') setTourOpen(true) } catch { /* ignora */ } }} />}
    {tourOpen && !news && <Tour onClose={closeTour} onPage={setPage} onAction={(action) => { closeTour(); if (action === 'add') setSheetOpen(true); else setPage('settings') }} />}
    </Suspense>
    <QuickSheet open={sheetOpen} onClose={closeSheet} source={source} invoice={invoices.find((invoice) => invoice.id === invoiceId)} people={people} categories={categories} suggestions={suggestions} onSaved={refresh} notify={notify} />
  </div>
}
