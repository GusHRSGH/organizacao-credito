import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { createTransaction, listInvoices, listTransactions, removeTransaction, setTransactionStatus } from './services/finance'
import type { Invoice, Transaction } from './types'

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const invoiceName = (period: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${period.slice(0, 7)}-02T12:00:00`)).replace(/^\w/, (c) => c.toUpperCase())
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<'dashboard' | 'invoices'>('dashboard')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [invoiceId, setInvoiceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_event, current) => setSession(current))
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true); setError('')
    try {
      const rows = await listInvoices()
      setInvoices(rows)
      const selected = rows.find((row) => row.id === invoiceId) ?? rows[0]
      setInvoiceId(selected?.id ?? '')
      setTransactions(selected ? await listTransactions(selected.id) : [])
    } catch (cause) { setError(messageOf(cause)) }
    finally { setLoading(false) }
  }, [session, invoiceId])

  useEffect(() => { void refresh() }, [session, refresh])

  async function changeInvoice(id: string) {
    setInvoiceId(id); setError('')
    try { setTransactions(await listTransactions(id)) } catch (cause) { setError(messageOf(cause)) }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    const data = new FormData(event.currentTarget)
    const date = String(data.get('date'))
    const count = Number(data.get('installments'))
    try {
      await createTransaction({ invoiceId, occurredOn: date, description: String(data.get('description')), amount: Number(data.get('amount')), personName: String(data.get('person')), categoryName: String(data.get('category')), installmentCount: count })
      event.currentTarget.reset(); setShowForm(false); setNotice(count > 1 ? `Compra registrada em ${count} parcelas.` : 'Lançamento salvo.')
      await refresh()
    } catch (cause) { setError(messageOf(cause)) }
  }

  async function toggleStatus(row: Transaction) {
    try { await setTransactionStatus(row.id, row.status === 'paid' ? 'pending' : 'paid'); await refresh() }
    catch (cause) { setError(messageOf(cause)) }
  }

  async function deleteRow(row: Transaction) {
    if (!window.confirm('Excluir este lançamento?')) return
    try { await removeTransaction(row.id); await refresh() } catch (cause) { setError(messageOf(cause)) }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    const email = String(new FormData(event.currentTarget).get('email'))
    if (!supabase) return
    const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (authError) setError(authError.message)
    else setNotice('Enviamos um link de acesso para seu e-mail.')
  }

  if (!ready) return <main className="center-screen">Carregando…</main>
  if (!hasSupabaseConfig) return <main className="center-screen"><section className="auth-card"><span className="brand-mark">◒</span><h1>Organização do Crédito</h1><p>Base do aplicativo pronta. Configure o projeto Supabase para ativar login e armazenamento sincronizado.</p><div className="setup-warning"><b>Configuração necessária</b><br/>Crie um arquivo <code>.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>. Use valores do ambiente de desenvolvimento; nunca coloque a chave service role no frontend.</div></section></main>
  if (!session) return <main className="center-screen"><section className="auth-card"><span className="brand-mark">◒</span><h1>Organização do Crédito</h1><p>Acesse sua área privada. Enviaremos um link de entrada para seu e-mail.</p><form onSubmit={sendMagicLink} className="auth-form"><label>E-mail<input type="email" name="email" required autoComplete="email" placeholder="voce@exemplo.com"/></label><button className="primary-button">Enviar link de acesso</button></form>{error&&<p className="error">{error}</p>}{notice&&<p className="notice">{notice}</p>}<small>Os dados são privados e protegidos pelo usuário autenticado.</small></section></main>

  const visible = transactions.filter((row) => (!query || `${row.description} ${row.person?.name ?? ''} ${row.category?.name ?? ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))) && (!status || row.status === status))
  const total = transactions.reduce((sum, row) => sum + Number(row.amount), 0)
  const paid = transactions.filter((row) => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount), 0)
  const pending = total - paid
  const people = Object.entries(transactions.reduce<Record<string, number>>((acc, row) => { const name = row.person?.name ?? 'Sem responsável'; acc[name] = (acc[name] ?? 0) + Number(row.amount); return acc }, {})).sort((a, b) => b[1] - a[1])
  const categories = Object.entries(transactions.reduce<Record<string, number>>((acc, row) => { const name = row.category?.name ?? 'Sem categoria'; acc[name] = (acc[name] ?? 0) + Number(row.amount); return acc }, {})).sort((a, b) => b[1] - a[1])

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">◒</span><span>Organização<br/>do Crédito</span></div><div className="nav-label">Workspace</div><button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>▦　Visão geral</button><button className={`nav-item ${page === 'invoices' ? 'active' : ''}`} onClick={() => setPage('invoices')}>▤　Faturas e lançamentos</button><div className="sidebar-note">Responsável significa a pessoa a quem o gasto é atribuído.</div><div className="sidebar-footer"><span className="avatar">{session.user.email?.[0].toUpperCase()}</span><span>{session.user.email}<br/><small>Área privada</small></span></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{page === 'dashboard' ? 'Visão geral' : 'Faturas'}</b></div><button className="text-button" onClick={() => void supabase?.auth.signOut()}>Sair</button></header>
      <div className="page-heading"><div><h1>{page === 'dashboard' ? 'Visão geral' : 'Faturas e lançamentos'}</h1><p>{page === 'dashboard' ? 'Acompanhe os gastos e pagamentos da fatura selecionada.' : 'Cadastre compras, acompanhe pagamentos e filtre os lançamentos.'}</p></div><div className="heading-actions"><select value={invoiceId} onChange={(event) => void changeInvoice(event.target.value)} aria-label="Fatura">{invoices.length ? invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>) : <option value="">Nenhuma fatura</option>}</select>{page === 'invoices'&&<button className="primary-button" onClick={() => setShowForm(!showForm)}>＋ Novo lançamento</button>}</div></div>
      {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert notice">{notice}</div>}
      {showForm&&<section className="panel form-panel"><div className="panel-heading"><h2>Nova compra</h2><button className="text-button" onClick={() => setShowForm(false)}>Fechar</button></div><form className="entry-form" onSubmit={saveEntry}><label>Descrição<input name="description" maxLength={160} required/></label><label>Valor total (R$)<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Data da compra<input name="date" type="date" required/></label><label>Responsável<input name="person" maxLength={80} required placeholder="Pessoa a quem o gasto é atribuído"/></label><label>Categoria<input name="category" maxLength={60} required/></label><label>Parcelas<select name="installments">{Array.from({length:48},(_,i)=><option key={i+1} value={i+1}>{i+1===1?'À vista':`${i+1} parcelas`}</option>)}</select></label><button className="primary-button">Salvar compra</button></form><p className="hint">O valor informado é dividido em parcelas mensais iguais; diferenças de centavos ficam na última. Parcelas e faturas futuras são criadas em uma única operação no banco.</p></section>}
      {page==='dashboard'&&<><section className="metric-grid"><Metric label="Total da fatura" value={money(total)}/><Metric label="Já pago" value={money(paid)} foot={`${total ? (paid/total*100).toFixed(1).replace('.',',') : '0,0'}% do total`}/><Metric label="Pendente" value={money(pending)} warning/><Metric label="Lançamentos" value={String(transactions.length)} foot="na fatura selecionada"/></section><div className="panel-grid"><section className="panel"><div className="panel-heading"><h2>Por responsável</h2></div><RankList rows={people} total={total}/></section><section className="panel"><div className="panel-heading"><h2>Por categoria</h2></div><RankList rows={categories} total={total}/></section></div><section className="panel"><div className="panel-heading"><h2>Últimos lançamentos</h2><button className="text-button" onClick={() => setPage('invoices')}>Ver todos →</button></div><TransactionTable rows={transactions.slice(0,6)} busy={loading} onToggle={toggleStatus} onDelete={deleteRow}/></section></>}
      {page==='invoices'&&<><section className="invoice-strip">{invoices.slice(0,4).map((invoice) => <button key={invoice.id} className={`invoice-card ${invoiceId===invoice.id?'selected':''}`} onClick={() => void changeInvoice(invoice.id)}><span>{invoice.label}</span><b>{invoice.status==='open'?'Em andamento':invoice.status==='closed'?'Fechada':'Paga'}</b></button>)}</section><div className="toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento"/><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos os status</option><option value="paid">Pago</option><option value="pending">Pendente</option></select><span className="count-pill">{visible.length} lançamentos</span></div><section className="panel"><TransactionTable rows={visible} busy={loading} onToggle={toggleStatus} onDelete={deleteRow}/></section></>}
    </main></div>
}

function Metric({ label, value, foot, warning = false }: { label: string; value: string; foot?: string; warning?: boolean }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{foot&&<div className={`metric-foot ${warning?'warning':''}`}>{foot}</div>}</article> }
function RankList({ rows, total }: { rows: [string, number][]; total: number }) { return rows.length ? <div className="rank-list">{rows.map(([name, amount])=><div className="rank-row" key={name}><span className="rank-icon">{name[0]?.toUpperCase()}</span><div className="rank-main"><b>{name}</b><div className="progress"><i style={{width:`${total?Math.min(100,amount/total*100):0}%`}}/></div></div><strong>{money(amount)}</strong></div>)}</div> : <p className="empty">Sem lançamentos nesta fatura.</p> }
function TransactionTable({ rows, busy, onToggle, onDelete }: { rows: Transaction[]; busy: boolean; onToggle: (row: Transaction) => void; onDelete: (row: Transaction) => void }) { if (busy) return <p className="empty">Carregando lançamentos…</p>; if (!rows.length) return <p className="empty">Nenhum lançamento ainda. Cadastre uma compra para começar.</p>; return <div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Responsável</th><th>Categoria</th><th>Parcela</th><th>Status</th><th>Valor</th><th/></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${row.occurred_on}T12:00:00`))}</td><td><b>{row.description}</b></td><td>{row.person?.name??'—'}</td><td><span className="tag">{row.category?.name??'—'}</span></td><td>{row.installment_count?`${row.installment_number} / ${row.installment_count}`:'À vista'}</td><td><button className={`tag ${row.status==='paid'?'paid':'pending'}`} onClick={()=>onToggle(row)}>{row.status==='paid'?'Pago':'Pendente'}</button></td><td>{money(Number(row.amount))}</td><td><button className="text-button" onClick={()=>onDelete(row)} aria-label="Excluir lançamento">Excluir</button></td></tr>)}</tbody></table></div> }

