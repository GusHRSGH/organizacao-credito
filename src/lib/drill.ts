/** Atalho do painel para a lista de lançamentos: abre a fatura já filtrada. */
export interface DrillFilter {
  invoiceId: string
  person?: string
  category?: string
  status?: 'paid' | 'pending'
  /** Texto para a busca da lista (usado pela busca global). */
  query?: string
}

export const NO_PERSON = '__sem_responsavel__'
export const NO_CATEGORY = '__sem_categoria__'
export const personToken = (name: string) => (name === 'Sem responsável' ? NO_PERSON : name)
export const categoryToken = (name: string) => (name === 'Sem categoria' ? NO_CATEGORY : name)
