import type { Invoice } from '../types'

/** Opções da lista de faturas: as do dia a dia primeiro e as quitadas num grupo separado no fim. */
export function invoiceOptions(invoices: Invoice[], settled: Set<string>) {
  const open = invoices.filter((invoice) => !settled.has(invoice.id))
  const done = invoices.filter((invoice) => settled.has(invoice.id))
  return <>
    {open.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}
    {done.length > 0 && <optgroup label="Faturas quitadas">{done.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label} ✓</option>)}</optgroup>}
  </>
}

