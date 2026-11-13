/**
 * "Pagou um valor": a pessoa devia 1689 e mandou 1600. Em vez de procurar quais compras somam 1600,
 * o robô procura o que SOBROU (1689 menos 1600 = 89): a combinação de lançamentos que dá perto disso
 * fica pendente e o resto vira pago. Se a conta não fecha certinho, a diferença aparece para o usuário confirmar.
 */
export interface SettleRow { id: string; amount: number; date: string; group: string | null }

export interface SettleOption {
  kind: 'exata' | 'perto' | 'antigas'
  /** Lançamentos que continuam pendentes. */
  leftIds: string[]
  /** Lançamentos que serão marcados como pagos. */
  paidIds: string[]
  leftTotal: number
  paidTotal: number
  /** Quanto os lançamentos pagos somam a mais (positivo) ou a menos (negativo) do que a pessoa mandou. Zero é conta certa. */
  diff: number
}

const cents = (value: number) => Math.round(Number(value) * 100)
const NODE_CAP = 300_000
const FOUND_CAP = 5_000

export function suggestSettlement(rows: SettleRow[], received: number): SettleOption[] {
  const paidCents = cents(received)
  if (!rows.length || !(paidCents > 0)) return []
  const items = rows.map((row) => ({ ...row, c: cents(row.amount) })).filter((row) => row.c > 0)
  const total = items.reduce((sum, row) => sum + row.c, 0)
  const build = (leftSet: Set<string>, kind: SettleOption['kind']): SettleOption => {
    const left = items.filter((row) => leftSet.has(row.id))
    const paid = items.filter((row) => !leftSet.has(row.id))
    const leftTotal = left.reduce((sum, row) => sum + row.c, 0)
    const paidTotal = total - leftTotal
    return { kind, leftIds: left.map((row) => row.id), paidIds: paid.map((row) => row.id), leftTotal: leftTotal / 100, paidTotal: paidTotal / 100, diff: (paidTotal - paidCents) / 100 }
  }
  if (paidCents >= total) return [build(new Set(), 'exata')]

  const remainder = total - paidCents
  const tolerance = Math.min(5000, Math.max(200, Math.round(remainder * 0.03)))
  const sorted = [...items].sort((a, b) => b.c - a.c)
  const suffix: number[] = new Array(sorted.length + 1).fill(0)
  for (let i = sorted.length - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] + sorted[i].c
  const found: Array<{ ids: string[]; sum: number }> = []
  let nodes = 0
  const pick: string[] = []
  const walk = (index: number, sum: number) => {
    if (nodes++ > NODE_CAP || found.length >= FOUND_CAP) return
    if (pick.length && sum >= remainder - tolerance && sum <= remainder + tolerance) found.push({ ids: [...pick], sum })
    if (index >= sorted.length || sum > remainder + tolerance || sum + suffix[index] < remainder - tolerance) return
    pick.push(sorted[index].id)
    walk(index + 1, sum + sorted[index].c)
    pick.pop()
    walk(index + 1, sum)
  }
  walk(0, 0)

  const byDate = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const age = new Map(byDate.map((row, index) => [row.id, items.length - index]))
  const score = (candidate: { ids: string[]; sum: number }) => {
    const left = new Set(candidate.ids)
    const gap = Math.abs(candidate.sum - remainder)
    const paidMore = candidate.sum < remainder ? 1 : 0
    const touched = new Map<string, { left: number; paid: number }>()
    for (const row of items) {
      if (!row.group) continue
      const slot = touched.get(row.group) ?? { left: 0, paid: 0 }
      if (left.has(row.id)) slot.left += 1; else slot.paid += 1
      touched.set(row.group, slot)
    }
    const splits = [...touched.values()].filter((slot) => slot.left && slot.paid).length
    const older = candidate.ids.reduce((sum, id) => sum + (age.get(id) ?? 0), 0)
    return [gap, paidMore, splits, candidate.ids.length, older]
  }
  const ranked = found.map((candidate) => ({ candidate, key: score(candidate) })).sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]
    return 0
  })
  const options = ranked.slice(0, 3).map(({ candidate }) => build(new Set(candidate.ids), candidate.sum === remainder ? 'exata' : 'perto'))
  if (options.length) return options

  // Sem combinação parecida: paga do mais antigo para o mais novo até onde o valor alcança.
  let budget = paidCents
  const leftSet = new Set<string>()
  for (const row of byDate) { if (row.c <= budget) budget -= row.c; else leftSet.add(row.id) }
  return [build(leftSet, 'antigas')]
}
