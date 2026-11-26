/**
 * Gera o backup de exemplo usado nos prints do README (pessoas e valores fictícios).
 * Uso: npx vite-node scripts/demo-backup.ts  →  e2e/fixtures/demo-backup.json
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { LocalSource } from '../src/services/localSource'
import { MemoryPersistence } from '../src/services/persistence'
import { MAIN_WALLET, setActiveWallet } from '../src/lib/wallet'

const source = new LocalSource(new MemoryPersistence())
type Buy = [description: string, amount: number, date: string, person: string, category: string, count?: number]
async function buy(period: string, list: Buy[]) {
  for (const [description, amount, occurredOn, personName, categoryName, count = 1] of list) {
    await source.createPurchase({ invoiceId: '', description, amount, occurredOn, personName, categoryName, installmentCount: count, period })
  }
}

await source.saveWallet({ id: MAIN_WALLET, name: 'Nubank', kind: 'card' })
await buy('2026-10-01', [
  ['Supermercado Bom Preço', 412.35, '2026-09-08', 'Ana', 'Mercado'],
  ['Posto Avenida', 180, '2026-09-12', 'Bruno', 'Transporte'],
  ['Farmácia Central', 64.9, '2026-09-15', 'Carla', 'Saúde'],
  ['Netflix', 55.9, '2026-09-20', 'Diego', 'Assinaturas'],
  ['Restaurante Sabor', 96.4, '2026-09-25', 'Ana', 'Lazer'],
])
await buy('2026-11-01', [
  ['Supermercado Bom Preço', 389.7, '2026-10-07', 'Ana', 'Mercado'],
  ['Posto Avenida', 200, '2026-10-11', 'Bruno', 'Transporte'],
  ['Netflix', 55.9, '2026-10-20', 'Diego', 'Assinaturas'],
  ['Loja de Roupas Estilo', 239.8, '2026-10-22', 'Carla', 'Vestuário'],
  ['Academia Forma', 99.9, '2026-10-25', 'Bruno', 'Saúde'],
])
await buy('2026-12-01', [
  ['Supermercado Bom Preço', 455.12, '2026-11-06', 'Ana', 'Mercado'],
  ['Notebook Loja Tech', 3600, '2026-11-08', 'Diego', 'Eletrônicos', 6],
  ['Posto Avenida', 190, '2026-11-10', 'Bruno', 'Transporte'],
  ['Farmácia Central', 48.5, '2026-11-14', 'Carla', 'Saúde'],
  ['Netflix', 55.9, '2026-11-20', 'Diego', 'Assinaturas'],
  ['Cinema Shopping', 72, '2026-11-21', 'Ana', 'Lazer'],
  ['Padaria Trigo', 38.6, '2026-11-23', 'Carla', 'Mercado'],
])
const [dec] = (await source.listInvoices()).filter((invoice) => invoice.period === '2026-12-01')
await source.saveFee({ invoice_id: dec.id, name: 'Anuidade', mode: 'fixed', value: 32, excluded: [], overrides: {}, paid: [] })

await source.saveWallet({ id: 'inter', name: 'Inter', kind: 'card' })
setActiveWallet('inter')
await buy('2026-12-01', [
  ['Mercado Livre', 189.9, '2026-11-09', 'Ana', 'Casa', 3],
  ['Uber', 34.7, '2026-11-17', 'Carla', 'Transporte'],
  ['iFood', 58.3, '2026-11-19', 'Carla', 'Lazer'],
])
setActiveWallet(MAIN_WALLET)
await source.createLoan('Moto do Bruno', { person: 'Bruno', installment: 450, count: 10, start: '2026-11-01', dueDay: 15, extraPct: 2 }, 'moto')
await source.saveRecurring({ id: 'netflix', description: 'Netflix', amount: 55.9, person: 'Diego', category: 'Assinaturas', wallet: MAIN_WALLET, day: 20, active: true, start: '2027-01-01', last: '2026-12-01' })
await source.addCredit('Carla', 15, 'Pagou a mais em Novembro 2026')

// Outubro e novembro pagos, com datas de pagamento (para o histórico de quem paga em dia).
const backup = await source.exportBackup()
const periodOf = new Map(backup.data.invoices.map((invoice) => [invoice.id, invoice.period]))
const paidOn: Record<string, Record<string, string>> = {
  '2026-10-01': { Ana: '2026-10-08', Bruno: '2026-10-16', Carla: '2026-10-09', Diego: '2026-10-10' },
  '2026-11-01': { Ana: '2026-11-09', Bruno: '2026-11-13', Carla: '2026-11-10', Diego: '2026-11-10' },
}
const people = new Map(backup.data.people.map((person) => [person.id, person.name]))
for (const row of backup.data.transactions) {
  const when = paidOn[periodOf.get(row.invoice_id) ?? '']?.[people.get(row.person_id ?? '') ?? '']
  if (when) { row.status = 'paid'; row.paid_at = `${when}T15:00:00.000Z` }
}
mkdirSync('e2e/fixtures', { recursive: true })
writeFileSync('e2e/fixtures/demo-backup.json', JSON.stringify(backup, null, 1))
console.log(`ok: ${backup.data.transactions.length} lançamentos`)
