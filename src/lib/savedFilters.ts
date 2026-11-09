export interface SavedFilter { id: string; name: string; person: string; category: string; status: string; query: string }
export type FilterValues = Omit<SavedFilter, 'id' | 'name'>

const KEY = 'oc:filtros'
const MAX = 12

export const isActive = (values: FilterValues) => !!(values.person || values.category || values.status || values.query.trim())

export function readFilters(): SavedFilter[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedFilter => !!item && typeof item === 'object' && typeof (item as SavedFilter).id === 'string' && typeof (item as SavedFilter).name === 'string') : []
  } catch { return [] }
}

export function writeFilters(list: SavedFilter[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch { /* ignora */ } }

/** Nome sugerido a partir do filtro, como "Pendentes · Ana · Lazer". */
export function suggestName(values: FilterValues): string {
  const parts = [values.status === 'pending' ? 'Pendentes' : values.status === 'paid' ? 'Pagos' : '', values.person, values.category, values.query.trim() ? `“${values.query.trim()}”` : '']
  return parts.filter(Boolean).join(' · ').slice(0, 40) || 'Meu filtro'
}

/** Adiciona (ou troca, se o nome já existe) e devolve a nova lista. */
export function addFilter(list: SavedFilter[], name: string, values: FilterValues, id: string): SavedFilter[] {
  const clean = name.trim().slice(0, 40)
  if (!clean) return list
  const rest = list.filter((item) => item.name.toLocaleLowerCase('pt-BR') !== clean.toLocaleLowerCase('pt-BR'))
  return [{ id, name: clean, ...values }, ...rest].slice(0, MAX)
}

export const removeFilter = (list: SavedFilter[], id: string) => list.filter((item) => item.id !== id)
