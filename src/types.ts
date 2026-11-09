export type InvoiceStatus = 'open' | 'closed' | 'paid'
export type TransactionStatus = 'pending' | 'paid'
export type SourceKind = 'local'

export interface Invoice {
  id: string
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
  setTransactionStatus(id: string, status: TransactionStatus): Promise<void>
  setStatusMany(ids: string[], status: TransactionStatus): Promise<void>
  removeTransaction(id: string): Promise<void>
}
