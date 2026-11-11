import { plain } from './quickEntry'

/** Palavras comuns de cada tipo de gasto. O nome do tipo precisa existir entre as categorias da pessoa para ser sugerido. */
const GROUPS: { names: string[]; words: string[] }[] = [
  { names: ['compras', 'vestuario', 'roupas'], words: ['mercado livre', 'shopee', 'shein', 'amazon', 'magalu', 'aliexpress', 'americanas'] },
  { names: ['assinaturas', 'servicos'], words: ['anthropic', 'claude', 'openai', 'chatgpt', 'google one', 'icloud', 'apple', 'adobe', 'microsoft'] },
  { names: ['alimentacao', 'mercado', 'comida', 'supermercado'], words: ['mercado', 'supermercado', 'padaria', 'acougue', 'hortifruti', 'atacadao', 'assai', 'carrefour', 'restaurante', 'lanchonete', 'lanches', 'lanche', 'pizza', 'hamburguer', 'ifood', 'rappi', 'cafe', 'sorvete', 'churrasco'] },
  { names: ['transporte', 'locomocao', 'carro'], words: ['uber', '99', 'taxi', 'onibus', 'metro', 'combustivel', 'gasolina', 'posto', 'auto posto', 'autozone', 'auto pecas', 'oficina', 'mecanica', 'estacionamento', 'pedagio', 'bilhete', 'sem parar'] },
  { names: ['lazer', 'entretenimento', 'diversao'], words: ['netflix', 'spotify', 'cinema', 'ingresso', 'show', 'bar', 'steam', 'playstation', 'xbox', 'disney', 'hbo', 'prime video', 'youtube', 'viagem', 'hotel'] },
  { names: ['saude', 'farmacia'], words: ['farmacia', 'drogaria', 'drogasil', 'pacheco', 'raia', 'med', 'medico', 'medica', 'consulta', 'exame', 'dentista', 'plano de saude', 'clinica', 'hospital', 'academia'] },
  { names: ['educacao', 'estudos'], words: ['curso', 'faculdade', 'mensalidade', 'escola', 'livro', 'udemy', 'alura', 'livraria'] },
  { names: ['casa', 'moradia', 'contas'], words: ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'internet', 'gas', 'iptu', 'leroy', 'telhanorte', 'enel', 'sabesp'] },
  { names: ['compras', 'vestuario', 'roupas'], words: ['amazon', 'shopee', 'mercado livre', 'magalu', 'shein', 'renner', 'riachuelo', 'c&a', 'zara', 'americanas', 'aliexpress', 'loja'] },
  { names: ['assinaturas', 'servicos'], words: ['assinatura', 'mensal', 'anuidade', 'plano'] },
]

const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text)

/** Sugere uma das categorias que a pessoa já tem a partir de palavras da descrição; null se não houver certeza. */
export function guessCategory(description: string, categories: string[]): string | null {
  const text = plain(description)
  if (!text) return null
  const mine = new Map(categories.map((name) => [plain(name), name]))
  for (const group of GROUPS) {
    if (!group.words.some((word) => hasWord(text, word))) continue
    const found = group.names.find((name) => mine.has(name))
    if (found) return mine.get(found) ?? null
  }
  return null
}

/** Categorias que os bancos usam (Nubank etc.) e os nomes que a pessoa costuma dar. Procura entre as categorias que ela já tem. */
const BANK_CATEGORIES: Record<string, string[]> = {
  restaurante: ['alimentacao', 'restaurante', 'comida', 'mercado'], supermercado: ['mercado', 'supermercado', 'alimentacao', 'comida'], alimentacao: ['alimentacao', 'comida', 'mercado'],
  transporte: ['transporte', 'locomocao', 'carro'], veiculo: ['transporte', 'carro', 'locomocao'], lazer: ['lazer', 'entretenimento', 'diversao'], entretenimento: ['lazer', 'entretenimento', 'diversao'],
  saude: ['saude', 'farmacia'], educacao: ['educacao', 'estudos'], casa: ['casa', 'moradia', 'contas'], vestuario: ['vestuario', 'roupas', 'compras'], compras: ['compras', 'vestuario', 'roupas'],
  servicos: ['assinaturas', 'servicos'], assinatura: ['assinaturas', 'servicos'], viagem: ['viagem', 'lazer'], eletronicos: ['eletronicos', 'compras'], outros: ['outros'],
}

export function matchCategoryName(label: string, categories: string[]): string | null {
  const key = plain(label)
  if (!key) return null
  const mine = new Map(categories.map((name) => [plain(name), name]))
  if (mine.has(key)) return mine.get(key) ?? null
  const stem = key.replace(/s$/, '')
  for (const [name, original] of mine) if (name.replace(/s$/, '') === stem) return original
  for (const candidate of BANK_CATEGORIES[key] ?? BANK_CATEGORIES[stem] ?? []) if (mine.has(candidate)) return mine.get(candidate) ?? null
  return null
}
