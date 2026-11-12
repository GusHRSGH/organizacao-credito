import { historyKey } from './suggest'
import type { Transaction } from '../types'

/** Chave para perguntar uma vez só por compras parecidas: "Mercado Livre - Parcela 2/3" e "Mercado Livre" são a mesma pergunta. */
export function questionKey(description: string): string {
  const key = historyKey(description).replace(/[\s-]*parcela[\s-]*$/, '').replace(/[\s-]+$/, '').trim()
  // Pix e boleto no crédito: quem recebe é o que identifica a compra, então o nome inteiro entra na chave.
  if (/^(pix|boleto) no credito\b/.test(key)) return key
  return key.split(' ').slice(0, 2).join(' ')
}

export interface AskRow { id: number; qkey: string; description: string; amount: number; category: string; person: string; personFrom: string; /** IOF de uma compra internacional: o nome do grupo é o da compra. */ iof?: boolean }
export interface Question {
  key: string
  label: string
  rowIds: number[]
  total: number
  suggestion: { person: string; reason: string } | null
  /** O robô já tinha atribuído pelo histórico; a pergunta só confirma. */
  fromHistory?: boolean
}

type Counts = Map<string, number>
const bump = (map: Map<string, Counts>, key: string, person: string) => {
  const counts = map.get(key) ?? new Map<string, number>()
  counts.set(person, (counts.get(person) ?? 0) + 1)
  map.set(key, counts)
}
const top = (counts: Counts | undefined) => {
  if (!counts) return null
  const total = [...counts.values()].reduce((s, n) => s + n, 0)
  const [person, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { person, n, total, share: n / total }
}

/** Estatísticas do seu histórico: quem costuma pagar o quê, por nome parecido, por valor e por categoria. */
export function learnPatterns(history: Transaction[]) {
  const byFamily = new Map<string, Counts>(), byAmount = new Map<string, Counts>(), byCategory = new Map<string, Counts>()
  for (const row of history) {
    const person = row.person?.name
    if (!person) continue
    bump(byFamily, questionKey(row.description), person)
    bump(byAmount, String(Math.round(Number(row.amount) * 100)), person)
    if (row.category?.name) bump(byCategory, row.category.name, person)
  }
  return { byFamily, byAmount, byCategory }
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Agrupa as compras sem responsável por padrão e, para cada grupo, propõe quem costuma ser (ou nada, se não há base). */
export function buildQuestions(rows: AskRow[], history: Transaction[]): Question[] {
  const patterns = learnPatterns(history)
  const groups = new Map<string, AskRow[]>()
  for (const row of rows) {
    if (row.person.trim() && row.personFrom !== 'histórico') continue
    groups.set(row.qkey, [...(groups.get(row.qkey) ?? []), row])
  }
  const questions: Question[] = []
  for (const [key, list] of groups) {
    const first = list.find((row) => !row.iof) ?? list[0]
    const baseLabel = first.description.replace(/\s*[(-]?\s*(?:parcela\s*)?\d{1,2}\/\d{1,2}\)?$/i, '').trim() || first.description
    const split = key.includes('|')
    const label = split ? `${baseLabel} (${brl(first.amount)})` : baseLabel
    let suggestion: Question['suggestion'] = null

    // O robô já atribuiu pelo histórico: a pergunta só pede para confirmar ou corrigir.
    const decided = list.filter((row) => row.personFrom === 'histórico' && row.person.trim())
    if (decided.length === list.length) {
      const counts: Counts = new Map()
      for (const row of decided) counts.set(row.person, (counts.get(row.person) ?? 0) + 1)
      const [person, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
      questions.push({ key, label, rowIds: list.map((row) => row.id), total: list.reduce((s, row) => s + Math.round(row.amount * 100), 0) / 100, suggestion: { person, reason: n === list.length ? `Pelo seu histórico, “${baseLabel}” é de ${person}.` : `Pelo seu histórico, “${baseLabel}” costuma ser de ${person}.` }, fromHistory: true })
      continue
    }

    const family = top(patterns.byFamily.get(key.split('|')[0]))
    if (family && family.share === 1) suggestion = { person: family.person, reason: `Você já lançou “${baseLabel}” ${family.n === 1 ? 'uma vez' : `${family.n} vezes`} para ${family.person}.` }

    if (!suggestion && list.filter((row) => !row.iof).every((row) => row.amount === first.amount)) {
      const same = top(patterns.byAmount.get(String(Math.round(first.amount * 100))))
      if (same && same.n >= 2 && same.share >= 0.8) suggestion = { person: same.person, reason: `O valor de ${brl(first.amount)} já apareceu ${same.n} vezes para ${same.person}.` }
    }

    if (!suggestion) {
      const byCat = first.category ? top(patterns.byCategory.get(first.category)) : null
      if (byCat && byCat.total >= 3 && byCat.share >= 0.6) suggestion = { person: byCat.person, reason: `Em ${byCat.n} de ${byCat.total} compras de ${first.category} no seu histórico, o responsável é ${byCat.person}.` }
    }

    questions.push({ key, label, rowIds: list.map((row) => row.id), total: list.reduce((s, row) => s + Math.round(row.amount * 100), 0) / 100, suggestion })
  }
  // Primeiro o que tem palpite (um clique resolve), depois o maior valor.
  return questions.sort((a, b) => Number(!!b.suggestion) - Number(!!a.suggestion) || b.total - a.total)
}

export interface Refund { rowId: number; credit: { date: string; description: string; amount: number } }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/** Compras que têm um crédito de mesmo valor (até 3 dias de diferença): provável estorno ou cancelamento. */
export function findRefunds(rows: Array<{ id: number; date: string; amount: number }>, credits: Array<{ date: string; description: string; amount: number }>): Refund[] {
  const used = new Set<number>()
  const found: Refund[] = []
  for (const row of rows) {
    const index = credits.findIndex((credit, i) => !used.has(i) && Math.round(credit.amount * 100) === Math.round(row.amount * 100) && dayDiff(credit.date, row.date) <= 3)
    if (index < 0) continue
    used.add(index)
    found.push({ rowId: row.id, credit: credits[index] })
  }
  return found
}
