import { supabase } from '../lib/supabase'
import type { EntryInput, Invoice, Transaction } from '../types'

function requireClient() {
  if (!supabase) throw new Error('Supabase não foi configurado. Preencha as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listInvoices(): Promise<Invoice[]> {
  const client = requireClient()
  const { data, error } = await client.from('invoices').select('*').order('period', { ascending: false })
  if (error) throw error
  return data as Invoice[]
}

export async function listTransactions(invoiceId: string): Promise<Transaction[]> {
  const client = requireClient()
  const { data, error } = await client.from('transactions')
    .select('*, person:people(name), category:categories(name)')
    .eq('invoice_id', invoiceId).order('occurred_on', { ascending: false })
  if (error) throw error
  return data as Transaction[]
}

export async function createTransaction(input: EntryInput): Promise<void> {
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

export async function setTransactionStatus(id: string, status: 'pending' | 'paid'): Promise<void> {
  const { error } = await requireClient().from('transactions').update({ status }).eq('id', id)
  if (error) throw error
}

export async function removeTransaction(id: string): Promise<void> {
  const { error } = await requireClient().from('transactions').delete().eq('id', id)
  if (error) throw error
}

