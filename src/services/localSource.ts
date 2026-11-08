import type {
  Category, DataSource, EntryInput, ImportInvoice, ImportResult, Invoice, LocalData, Person,
  Transaction, TransactionRow, TransactionStatus,
} from '../types'
import { makeBackup, validateBackup } from './backup'
import { addMonthsToDate, addMonthsToPeriod, isValidPeriod, periodLabel, periodOfDate, splitCents } from './installments'
import { IndexedDbPersistence, type Persistence } from './persistence'

export const LOCAL_USER = 'local'
export const emptyData = (): LocalData => ({ invoices: [], transactions: [], people: [], categories: [] })

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const norm = (value: string) => value.trim().toLocaleLowerCase('pt-BR')
const cents = (value: number) => Math.round(value * 100)

function ensureInvoice(db: LocalData, period: string): Invoice {
  const found = db.invoices.find((invoice) => invoice.period === period)
  if (found) return found
  const invoice: Invoice = { id: uuid(), user_id: LOCAL_USER, period, label: periodLabel(period), status: 'open', created_at: new Date().toISOString() }
  db.invoices.push(invoice)
  return invoice
}

function ensureNamed(list: Person[] | Category[], name: string): string | null {
  const clean = name.trim()
  if (!clean) return null
  const found = list.find((item) => norm(item.name) === norm(clean))
  if (found) return found.id
  const item = { id: uuid(), name: clean }
  list.push(item)
  return item.id
}

/** Descrição sem o sufixo de parcela, para reconhecer parcelas da mesma compra. */
export function purchaseKey(description: string, person: string, count: number) {
  const base = description.replace(/\s*[-–]?\s*(parcela\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, '')
  return `${norm(base)}|${norm(person)}|${count}`
}

function dedupeKey(period: string, row: { date: string; description: string; cents: number; person: string; n: number | null; c: number | null }) {
  return `${period}|${row.date}|${norm(row.description)}|${row.cents}|${norm(row.person)}|${row.n ?? 0}/${row.c ?? 0}`
}

function applyImport(db: LocalData, batch: ImportInvoice[]): ImportResult {
  const result: ImportResult = { invoices: [], added: 0, duplicates: 0, invoicesCreated: 0 }
  const periodById = new Map(db.invoices.map((invoice) => [invoice.id, invoice.period]))
  const personName = new Map(db.people.map((p) => [p.id, p.name]))
  const existing = new Map<string, number>()
  const groups = new Map<string, string>()
  for (const row of db.transactions) {
    const person = row.person_id ? personName.get(row.person_id) ?? '' : ''
    const key = dedupeKey(periodById.get(row.invoice_id) ?? '', { date: row.occurred_on, description: row.description, cents: cents(row.amount), person, n: row.installment_number, c: row.installment_count })
    existing.set(key, (existing.get(key) ?? 0) + 1)
    if (row.installment_group && row.installment_count) groups.set(purchaseKey(row.description, person, row.installment_count), row.installment_group)
  }
  for (const entry of batch) {
    const created = !db.invoices.some((invoice) => invoice.period === entry.period)
    const invoice = ensureInvoice(db, entry.period)
    if (created && entry.label.trim()) invoice.label = entry.label.trim()
    if (created) result.invoicesCreated += 1
    const seen = new Map<string, number>()
    let added = 0
    let duplicates = 0
    for (const row of entry.rows) {
      const key = dedupeKey(entry.period, { date: row.date, description: row.description, cents: cents(row.amount), person: row.person, n: row.installmentNumber, c: row.installmentCount })
      const index = seen.get(key) ?? 0
      seen.set(key, index + 1)
      if ((existing.get(key) ?? 0) > index) { duplicates += 1; continue }
      let group: string | null = null
      if (row.installmentNumber && row.installmentCount) {
        const groupKey = purchaseKey(row.description, row.person, row.installmentCount)
        group = groups.get(groupKey) ?? uuid()
        groups.set(groupKey, group)
      }
      db.transactions.push({
        id: uuid(), user_id: LOCAL_USER, invoice_id: invoice.id, occurred_on: row.date, description: row.description.trim(), amount: cents(row.amount) / 100,
        person_id: ensureNamed(db.people, row.person), category_id: ensureNamed(db.categories, row.category), status: row.status,
        installment_group: group, installment_number: group ? row.installmentNumber : null, installment_count: group ? row.installmentCount : null,
        created_at: new Date().toISOString(),
      })
      added += 1
    }
    result.invoices.push({ period: entry.period, label: invoice.label, created, added, duplicates })
    result.added += added
    result.duplicates += duplicates
  }
  return result
}

/** Banco local: tudo fica neste computador, sem conta nem internet. */
export interface TransactionPatch { description: string; amount: number; occurredOn: string; personName: string; categoryName: string }
export interface PurchasePatch { description: string; total: number; occurredOn: string; personName: string; categoryName: string; installmentCount: number }

function checkPatch(patch: TransactionPatch) {
  const description = patch.description.trim()
  if (description.length < 1 || description.length > 160) return 'A descrição deve ter entre 1 e 160 caracteres.'
  if (!Number.isFinite(patch.amount) || cents(patch.amount) <= 0) return 'Informe um valor maior que zero.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.occurredOn)) return 'Informe a data da compra.'
  if (patch.personName.trim().length < 1 || patch.personName.trim().length > 80 || patch.categoryName.trim().length < 1 || patch.categoryName.trim().length > 60) return 'Informe responsável e categoria (até 80 e 60 caracteres).'
  return null
}

export class LocalSource implements DataSource {
  readonly kind = 'local' as const
  private cache: LocalData | null = null
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly persistence: Persistence = new IndexedDbPersistence()) {}

  private async read(): Promise<LocalData> {
    await this.tail
    this.cache ??= (await this.persistence.load()) ?? emptyData()
    return this.cache
  }

  /** Altera uma cópia, grava e só então troca o cache: falha de gravação não corrompe nada. */
  private mutate<T>(change: (draft: LocalData) => T): Promise<T> {
    const run = async () => {
      this.cache ??= (await this.persistence.load()) ?? emptyData()
      const draft = structuredClone(this.cache)
      const value = change(draft)
      await this.persistence.save(draft)
      this.cache = draft
      return value
    }
    const next = this.tail.then(run)
    this.tail = next.catch(() => undefined)
    return next
  }

  private join(db: LocalData, rows: TransactionRow[]): Transaction[] {
    const people = new Map(db.people.map((p) => [p.id, p.name]))
    const categories = new Map(db.categories.map((c) => [c.id, c.name]))
    return rows.map((row) => ({
      ...row,
      person: row.person_id ? { name: people.get(row.person_id) ?? '' } : null,
      category: row.category_id ? { name: categories.get(row.category_id) ?? '' } : null,
    }))
  }

  async listInvoices() {
    return [...(await this.read()).invoices].sort((a, b) => b.period.localeCompare(a.period))
  }

  async listAllTransactions() {
    const db = await this.read()
    return this.join(db, [...db.transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)))
  }

  async listTransactions(invoiceId: string) {
    const db = await this.read()
    return this.join(db, db.transactions.filter((row) => row.invoice_id === invoiceId).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)))
  }

  createInvoice(period: string) {
    if (!isValidPeriod(period)) return Promise.reject(new Error('Mês inválido.'))
    return this.mutate((db) => { ensureInvoice(db, period) })
  }

  createPurchase(input: EntryInput) {
    const description = input.description.trim()
    const count = input.installmentCount ?? 1
    const total = cents(input.amount)
    if (description.length < 1 || description.length > 160) return Promise.reject(new Error('A descrição deve ter entre 1 e 160 caracteres.'))
    if (!Number.isFinite(input.amount) || total <= 0) return Promise.reject(new Error('Informe um valor maior que zero.'))
    if (!Number.isInteger(count) || count < 1 || count > 48) return Promise.reject(new Error('O número de parcelas deve estar entre 1 e 48.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return Promise.reject(new Error('Informe a data da compra.'))
    if (input.personName.trim().length > 80 || input.categoryName.trim().length > 60) return Promise.reject(new Error('Nome de responsável ou categoria muito longo.'))
    return this.mutate((db) => {
      const start = db.invoices.find((invoice) => invoice.id === input.invoiceId)?.period ?? periodOfDate(input.occurredOn)
      const person = ensureNamed(db.people, input.personName)
      const category = ensureNamed(db.categories, input.categoryName)
      const group = count > 1 ? uuid() : null
      splitCents(total, count).forEach((part, offset) => {
        const invoice = ensureInvoice(db, addMonthsToPeriod(start, offset))
        db.transactions.push({
          id: uuid(), user_id: LOCAL_USER, invoice_id: invoice.id, occurred_on: addMonthsToDate(input.occurredOn, offset), description, amount: part / 100,
          person_id: person, category_id: category, status: 'pending', installment_group: group,
          installment_number: group ? offset + 1 : null, installment_count: group ? count : null, created_at: new Date().toISOString(),
        })
      })
    })
  }

  setTransactionStatus(id: string, status: TransactionStatus) { return this.setStatusMany([id], status) }

  setStatusMany(ids: string[], status: TransactionStatus) {
    const wanted = new Set(ids)
    return this.mutate((db) => { for (const row of db.transactions) if (wanted.has(row.id)) row.status = status })
  }

  removeTransaction(id: string) {
    return this.mutate((db) => { db.transactions = db.transactions.filter((row) => row.id !== id) })
  }

  /** Edita uma única linha (para parcelas, só aquela parcela). */
  updateTransaction(id: string, patch: TransactionPatch) {
    const problem = checkPatch(patch)
    if (problem) return Promise.reject(new Error(problem))
    return this.mutate((db) => {
      const row = db.transactions.find((item) => item.id === id)
      if (!row) throw new Error('Lançamento não encontrado.')
      row.description = patch.description.trim()
      row.amount = cents(patch.amount) / 100
      row.occurred_on = patch.occurredOn
      row.person_id = ensureNamed(db.people, patch.personName)
      row.category_id = ensureNamed(db.categories, patch.categoryName)
    })
  }

  /** Refaz a compra parcelada inteira: o total é dividido de novo, mantendo como paga cada parcela que continua existindo. */
  updatePurchase(group: string, input: PurchasePatch) {
    const problem = checkPatch({ ...input, amount: input.total })
    const count = input.installmentCount
    if (problem) return Promise.reject(new Error(problem))
    if (!Number.isInteger(count) || count < 1 || count > 48) return Promise.reject(new Error('O número de parcelas deve estar entre 1 e 48.'))
    return this.mutate((db) => {
      const old = db.transactions.filter((row) => row.installment_group === group).sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
      if (!old.length) throw new Error('Compra não encontrada.')
      const start = db.invoices.find((invoice) => invoice.id === old[0].invoice_id)?.period ?? periodOfDate(input.occurredOn)
      const paid = new Set(old.filter((row) => row.status === 'paid').map((row) => row.installment_number))
      db.transactions = db.transactions.filter((row) => row.installment_group !== group)
      const person = ensureNamed(db.people, input.personName)
      const category = ensureNamed(db.categories, input.categoryName)
      const next = count > 1 ? group : null
      splitCents(cents(input.total), count).forEach((part, offset) => {
        const invoice = ensureInvoice(db, addMonthsToPeriod(start, offset))
        db.transactions.push({
          id: uuid(), user_id: LOCAL_USER, invoice_id: invoice.id, occurred_on: addMonthsToDate(input.occurredOn, offset), description: input.description.trim(), amount: part / 100,
          person_id: person, category_id: category, status: paid.has(offset + 1) ? 'paid' : 'pending', installment_group: next,
          installment_number: next ? offset + 1 : null, installment_count: next ? count : null, created_at: old[0].created_at,
        })
      })
    })
  }

  /** Troca responsável e/ou categoria de várias linhas de uma vez. */
  updateMany(ids: string[], patch: { personName?: string; categoryName?: string }) {
    const wanted = new Set(ids)
    const person = patch.personName?.trim()
    const category = patch.categoryName?.trim()
    if ((person && person.length > 80) || (category && category.length > 60)) return Promise.reject(new Error('Nome de responsável ou categoria muito longo.'))
    return this.mutate((db) => {
      const personId = person ? ensureNamed(db.people, person) : null
      const categoryId = category ? ensureNamed(db.categories, category) : null
      for (const row of db.transactions) if (wanted.has(row.id)) { if (personId) row.person_id = personId; if (categoryId) row.category_id = categoryId }
    })
  }

  /** Remove e devolve as linhas, para a interface poder oferecer "Desfazer". */
  async removeTransactions(ids: string[]) {
    const wanted = new Set(ids)
    let removed: TransactionRow[] = []
    await this.mutate((db) => { removed = db.transactions.filter((row) => wanted.has(row.id)); db.transactions = db.transactions.filter((row) => !wanted.has(row.id)) })
    return removed
  }

  restoreTransactions(rows: TransactionRow[]) {
    return this.mutate((db) => {
      const known = new Set(db.transactions.map((row) => row.id))
      for (const row of rows) {
        if (known.has(row.id)) continue
        if (!db.invoices.some((invoice) => invoice.id === row.invoice_id)) continue
        db.transactions.push(row)
      }
    })
  }

  /** `dryRun` calcula o que seria importado sem gravar nada (prévia). */
  async importInvoices(batch: ImportInvoice[], options: { dryRun?: boolean } = {}): Promise<ImportResult> {
    if (options.dryRun) return applyImport(structuredClone(await this.read()), batch)
    return this.mutate((db) => applyImport(db, batch))
  }

  async exportBackup() { return makeBackup(await this.read()) }

  restoreBackup(input: unknown) {
    const data = validateBackup(input)
    return this.mutate((db) => { Object.assign(db, data) })
  }

  clearAll() {
    return this.mutate((db) => { Object.assign(db, emptyData()) })
  }
}
