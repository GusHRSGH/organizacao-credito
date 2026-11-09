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

export interface SnapshotInfo { id: string; savedAt: string; reason: 'auto' | 'antes'; invoices: number; transactions: number }

const KEEP = { auto: 7, antes: 5 } as const
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const hasContent = (data: LocalData) => data.invoices.length > 0 || data.transactions.length > 0

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

  /** Cópia automática guardada neste aparelho: uma por dia (estado antes da 1ª alteração) e uma antes de restaurar/limpar. Falhar aqui nunca impede o uso. */
  private async snapshot(data: LocalData, reason: 'auto' | 'antes') {
    try {
      if (!hasContent(data)) return
      const now = new Date()
      const id = reason === 'auto' ? `auto-${localDay(now)}` : `antes-${now.getTime()}`
      const all = await this.persistence.listSnapshots()
      if (reason === 'auto' && all.some((record) => record.id === id)) return
      await this.persistence.putSnapshot({ id, savedAt: now.toISOString(), reason, data: structuredClone(data) })
      const same = [...all.filter((record) => record.reason === reason), { id, savedAt: now.toISOString() }].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      for (const old of same.slice(KEEP[reason])) await this.persistence.removeSnapshot(old.id)
    } catch { /* cópia automática é um bônus */ }
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    return (await this.persistence.listSnapshots())
      .map((record) => ({ id: record.id, savedAt: record.savedAt, reason: record.reason, invoices: record.data.invoices.length, transactions: record.data.transactions.length }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  async restoreSnapshot(id: string) {
    const record = (await this.persistence.listSnapshots()).find((item) => item.id === id)
    if (!record) throw new Error('Esta cópia automática não existe mais.')
    const data = validateBackup({ app: 'organizacao-credito', version: 1, data: record.data })
    await this.snapshot(await this.read(), 'antes')
    return this.mutate((db) => { Object.assign(db, data) })
  }

  /** Altera uma cópia, grava e só então troca o cache: falha de gravação não corrompe nada. */
  private mutate<T>(change: (draft: LocalData) => T): Promise<T> {
    const run = async () => {
      this.cache ??= (await this.persistence.load()) ?? emptyData()
      await this.snapshot(this.cache, 'auto')
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
      const start = input.period ?? db.invoices.find((invoice) => invoice.id === input.invoiceId)?.period ?? periodOfDate(input.occurredOn)
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

  /** Lança o mesmo gasto (valor cheio, não dividido) em várias faturas, criando as que não existem. A data cai no mesmo dia de cada mês. */
  createRepeated(input: EntryInput, periods: string[]) {
    const description = input.description.trim()
    const total = cents(input.amount)
    const unique = [...new Set(periods)].sort()
    if (description.length < 1 || description.length > 160) return Promise.reject(new Error('A descrição deve ter entre 1 e 160 caracteres.'))
    if (!Number.isFinite(input.amount) || total <= 0) return Promise.reject(new Error('Informe um valor maior que zero.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return Promise.reject(new Error('Informe a data da compra.'))
    if (!unique.length || unique.length > 24 || unique.some((period) => !isValidPeriod(period))) return Promise.reject(new Error('Escolha de 1 a 24 meses válidos.'))
    if (input.personName.trim().length > 80 || input.categoryName.trim().length > 60) return Promise.reject(new Error('Nome de responsável ou categoria muito longo.'))
    return this.mutate((db) => {
      const person = ensureNamed(db.people, input.personName)
      const category = ensureNamed(db.categories, input.categoryName)
      const origin = input.period ?? periodOfDate(input.occurredOn)
      for (const period of unique) {
        const invoice = ensureInvoice(db, period)
        const [fy, fm] = origin.split('-').map(Number)
        const [ty, tm] = period.split('-').map(Number)
        db.transactions.push({
          id: uuid(), user_id: LOCAL_USER, invoice_id: invoice.id, occurred_on: addMonthsToDate(input.occurredOn, (ty - fy) * 12 + (tm - fm)), description, amount: total / 100,
          person_id: person, category_id: category, status: 'pending', installment_group: null, installment_number: null, installment_count: null, created_at: new Date().toISOString(),
        })
      }
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

  /** Aplica a limpeza aprovada: renomeia descrições e junta pessoas/categorias repetidas. Guarda uma cópia antes, então dá para voltar. */
  async applyCleanup(plan: { descriptions: Array<{ from: string[]; to: string }>; people: Array<{ from: string[]; to: string }>; categories: Array<{ from: string[]; to: string }> }) {
    await this.snapshot(await this.read(), 'antes')
    return this.mutate((db) => {
      let changed = 0
      for (const fix of plan.descriptions) {
        const to = fix.to.trim().slice(0, 160)
        if (!to) continue
        const from = new Set(fix.from)
        for (const row of db.transactions) if (from.has(row.description) && row.description !== to) { row.description = to; changed += 1 }
      }
      const merge = (list: Person[] | Category[], key: 'person_id' | 'category_id', fixes: Array<{ from: string[]; to: string }>) => {
        for (const fix of fixes) {
          const target = ensureNamed(list, fix.to)
          if (!target) continue
          const ids = new Set(list.filter((item) => fix.from.some((name) => norm(name) === norm(item.name)) && item.id !== target).map((item) => item.id))
          for (const row of db.transactions) if (row[key] && ids.has(row[key]!)) { row[key] = target; changed += 1 }
          const keep = list.filter((item) => !ids.has(item.id))
          list.length = 0
          list.push(...keep)
        }
      }
      merge(db.people, 'person_id', plan.people)
      merge(db.categories, 'category_id', plan.categories)
      return changed
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

  async restoreBackup(input: unknown) {
    const data = validateBackup(input)
    await this.snapshot(await this.read(), 'antes')
    return this.mutate((db) => { Object.assign(db, data) })
  }

  async clearAll() {
    await this.snapshot(await this.read(), 'antes')
    return this.mutate((db) => { Object.assign(db, emptyData()) })
  }
}
