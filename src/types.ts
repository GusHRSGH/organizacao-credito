export type InvoiceStatus = 'open' | 'closed' | 'paid'
export type TransactionStatus = 'pending' | 'paid'

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

export interface EntryInput {
  invoiceId: string
  occurredOn: string
  description: string
  amount: number
  personName: string
  categoryName: string
  installmentCount?: number
}

