import { plain } from './quickEntry'

/** Palavras comuns de cada tipo de gasto. O nome do tipo precisa existir entre as categorias da pessoa para ser sugerido. */
const GROUPS: { names: string[]; words: string[] }[] = [
  { names: ['alimentacao', 'mercado', 'comida', 'supermercado'], words: ['mercado', 'supermercado', 'padaria', 'acougue', 'hortifruti', 'atacadao', 'assai', 'carrefour', 'restaurante', 'lanchonete', 'pizza', 'hamburguer', 'ifood', 'rappi', 'cafe', 'sorvete', 'churrasco'] },
  { names: ['transporte', 'locomocao', 'carro'], words: ['uber', '99', 'taxi', 'onibus', 'metro', 'combustivel', 'gasolina', 'posto', 'estacionamento', 'pedagio', 'bilhete', 'sem parar'] },
  { names: ['lazer', 'entretenimento', 'diversao'], words: ['netflix', 'spotify', 'cinema', 'ingresso', 'show', 'bar', 'steam', 'playstation', 'xbox', 'disney', 'hbo', 'prime video', 'youtube', 'viagem', 'hotel'] },
  { names: ['saude', 'farmacia'], words: ['farmacia', 'drogaria', 'drogasil', 'pacheco', 'raia', 'consulta', 'exame', 'dentista', 'plano de saude', 'clinica', 'hospital', 'academia'] },
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
