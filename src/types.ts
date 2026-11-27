import type { Loan, Wallet } from './lib/wallet'
export type InvoiceStatus = 'open' | 'closed' | 'paid'
export type TransactionStatus = 'pending' | 'paid'
export type SourceKind = 'local'

export interface Invoice {
  id: string
  /** Carteira (cartão) da fatura; sem valor é a carteira principal. */
  wallet_id?: string
  user_id: string
  period: string
  label: string
  status: InvoiceStatus
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  invoice_id: string
  occurred_on: string
  description: string
  amount: number
  person_id: string | null
  category_id: string | null
  status: TransactionStatus
  installment_group: string | null
  installment_number: number | null
  installment_count: number | null
  created_at: string
  /** Quando foi marcado como pago (para o histórico de quem paga em dia). */
  paid_at?: string
  person?: { name: string } | null
  category?: { name: string } | null
}

export interface Person { id: string; name: string }
export interface Category { id: string; name: string }

export type TransactionRow = Omit<Transaction, 'person' | 'category'>

export interface LocalData {
  invoices: Invoice[]
  transactions: TransactionRow[]
  people: Person[]
  categories: Category[]
  /** Taxa de uso do cartão de cada fatura (só entra na cobrança, não vira lançamento). */
  fees?: CardFee[]
  /** Lançamentos de faturas apagadas: somem da tela, mas o robô continua aprendendo com eles. */
  memory?: TransactionRow[]
  /** Carteiras além da principal (cartões e, depois, empréstimos). */
  wallets?: Wallet[]
  /** Crédito de quem pagou a mais: entradas positivas (sobrou) e negativas (usado). */
  credits?: CreditEntry[]
  /** Despesas fixas que o app lança sozinho todo mês. */
  recurring?: Recurring[]
}

export interface CreditEntry { id: string; person: string; amount: number; created_at: string; note: string }

export interface Recurring {
  id: string
  description: string
  amount: number
  person: string
  category: string
  /** Carteira onde lança. */
  wallet: string
  /** Dia do mês da compra. */
  day: number
  active: boolean
  /** Primeiro mês (AAAA-MM-01) em que lança e o último já lançado. */
  start: string
  last?: string
}

/**
 * Taxa discreta, por pessoa. `embedded`: entra no total sem linha de taxa. `rounded`: o total arredonda para cima
 * (múltiplo de R$ 5) até cobrir a taxa. `style` diz como a mensagem mostra: compras com nota, valor diluído nas compras ou só o total.
 */
export interface FeeDisplay { mode: 'embedded' | 'rounded'; style: 'note' | 'spread' | 'total' }

export interface CardFee {
  invoice_id: string
  /** Nome que aparece na cobrança, escolhido pela pessoa. */
  name: string
  /** Valor fixo dividido pelo gasto de cada um, ou porcentagem do gasto de cada um. */
  mode: 'fixed' | 'percent'
  value: number
  /** Quem não entra nesta fatura (por nome). Quem aparece depois entra sozinho. */
  excluded: string[]
  /** Partes ajustadas na mão (nome: valor); o resto se recalcula para manter o total. */
  overrides: Record<string, number>
  /** Quem já pagou a taxa desta fatura. */
  paid: string[]
  /** Limite de gasto de cada pessoa na fatura (nome: valor). Sem limite = nunca paga extra. */
  limits?: Record<string, number>
  /** Como a taxa aparece para cada pessoa (nome: jeito). Sem entrada = linha da taxa à vista. */
  display?: Record<string, FeeDisplay>
  /** % extra sobre todo o gasto de quem passou do próprio limite (a mesma para todos). */
  extraPct?: number
}

export interface BackupFile {
  app: 'organizacao-credito'
  version: 1
  exportedAt: string
  data: LocalData
}

export interface EntryInput {
  invoiceId: string
  occurredOn: string
  description: string
  amount: number
  personName: string
  categoryName: string
  installmentCount?: number
  /** Fatura (AAAA-MM-01) onde a compra começa; se faltar, vale a fatura indicada ou o mês da data. */
  period?: string
}

export interface ImportRow {
  date: string
  description: string
  amount: number
  person: string
  category: string
  status: TransactionStatus
  installmentNumber: number | null
  installmentCount: number | null
}

export interface ImportInvoice { period: string; label: string; rows: ImportRow[] }

export interface ImportInvoiceResult { period: string; label: string; created: boolean; added: number; duplicates: number }

export interface ImportResult { invoices: ImportInvoiceResult[]; added: number; duplicates: number; invoicesCreated: number }

/** Contrato único usado pela interface; cada fonte de dados o implementa. */
export interface DataSource {
  readonly kind: SourceKind
  listInvoices(): Promise<Invoice[]>
  listTransactions(invoiceId: string): Promise<Transaction[]>
  listAllTransactions(): Promise<Transaction[]>
  createInvoice(period: string): Promise<void>
  createPurchase(input: EntryInput): Promise<void>
  /** O mesmo gasto, com o valor cheio, em cada uma das faturas (meses) escolhidas. */
  createRepeated(input: EntryInput, periods: string[]): Promise<void>
  setTransactionStatus(id: string, status: TransactionStatus): Promise<void>
  setStatusMany(ids: string[], status: TransactionStatus): Promise<void>
  removeTransaction(id: string): Promise<void>
  listFees(): Promise<CardFee[]>
  saveFee(fee: CardFee): Promise<void>
  listCredits(): Promise<CreditEntry[]>
  addCredit(person: string, amount: number, note: string): Promise<void>
  /** Marca como pago lançamentos e partes da taxa de qualquer carteira, de uma vez. */
  settleAcross(rowIds: string[], fees: Array<{ invoice_id: string; name: string }>): Promise<void>
  listRecurring(): Promise<Recurring[]>
  saveRecurring(item: Recurring): Promise<void>
  removeRecurring(id: string): Promise<void>
  /** Lança as despesas fixas que ainda não foram lançadas até o mês `upTo`. Devolve quantas lançou. */
  launchRecurring(upTo: string): Promise<number>
  /** Apaga a fatura e os lançamentos dela (com cópia automática antes). */
  removeInvoice(id: string): Promise<void>
  /** O que o robô lembra de faturas apagadas. */
  listMemory(): Promise<Transaction[]>
  listWallets(): Promise<Wallet[]>
  saveWallet(wallet: Wallet): Promise<void>
  removeWallet(id: string): Promise<void>
  createLoan(name: string, loan: Loan, id?: string): Promise<string>
  removeLoan(id: string): Promise<void>
  listEverything(): Promise<{ wallets: Wallet[]; invoices: Invoice[]; transactions: Transaction[]; fees: CardFee[] }>
}
