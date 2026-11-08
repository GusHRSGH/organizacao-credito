import { supabase } from '../lib/supabase'
import { periodLabel } from './installments'
import type { DataSource, EntryInput, Invoice, Transaction, TransactionStatus } from '../types'

function requireClient() {
  if (!supabase) throw new Error('Supabase não foi configurado. Preencha as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

const SELECT = '*, person:people(name), category:categories(name)'

/** Fonte em nuvem (opcional). Ainda não validada contra um projeto Supabase real. */
export class SupabaseSource implements DataSource {
  readonly kind = 'supabase' as const

  async listInvoices(): Promise<Invoice[]> {
    const { data, error } = await requireClient().from('invoices').select('*').order('period', { ascending: false })
    if (error) throw error
    return data as Invoice[]
  }

  async listTransactions(invoiceId: string): Promise<Transaction[]> {
    const { data, error } = await requireClient().from('transactions').select(SELECT).eq('invoice_id', invoiceId).order('occurred_on', { ascending: false })
    if (error) throw error
    return data as Transaction[]
  }

  async listAllTransactions(): Promise<Transaction[]> {
    const { data, error } = await requireClient().from('transactions').select(SELECT).order('occurred_on', { ascending: false }).range(0, 4999)
    if (error) throw error
    return data as Transaction[]
  }

  async createInvoice(period: string): Promise<void> {
    const client = requireClient()
    const { data: auth, error: authError } = await client.auth.getUser()
    if (authError || !auth.user) throw authError ?? new Error('Sessão expirada. Entre novamente.')
    const { error } = await client.from('invoices').upsert({ user_id: auth.user.id, period, label: periodLabel(period) }, { onConflict: 'user_id,period' })
    if (error) throw error
  }

  /** A função SQL `create_purchase` lança a 1ª parcela no mês da data da compra. */
  async createPurchase(input: EntryInput): Promise<void> {
    const { error } = await requireClient().rpc('create_purchase', {
      p_occurred_on: input.occurredOn,
      p_description: input.description.trim(),
      p_total_amount: input.amount,
      p_person_name: input.personName.trim(),
      p_category_name: input.categoryName.trim(),
      p_installment_count: input.installmentCount ?? 1,
    })
    if (error) throw error
  }

  async setTransactionStatus(id: string, status: TransactionStatus): Promise<void> {
    return this.setStatusMany([id], status)
  }

  async setStatusMany(ids: string[], status: TransactionStatus): Promise<void> {
    const { error } = await requireClient().from('transactions').update({ status }).in('id', ids)
    if (error) throw error
  }

  async removeTransaction(id: string): Promise<void> {
    const { error } = await requireClient().from('transactions').delete().eq('id', id)
    if (error) throw error
  }
}
