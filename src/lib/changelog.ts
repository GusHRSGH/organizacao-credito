/** Novidades de cada atualização, mostradas ao usuário depois que o app é atualizado. Mais nova primeiro. */
export interface ChangelogEntry { n: number; date: string; title: string; items: string[] }

export const ENTRIES: ChangelogEntry[] = [
  {
    n: 3, date: '2026-11-09', title: 'Tour completo do app',
    items: [
      'O tour agora tem 21 passos e apresenta o app inteiro: Início, Faturas, Cobrança e Dados.',
      'Cada passo acende a parte real da tela e traz um exemplo de uso.',
      'Aprenda o lançamento rápido numa linha (mercado 150,90 3x @ana #casa ontem), os filtros, as ações em lote e a cobrança pelo WhatsApp.',
      'No fim, escolha entre lançar o primeiro gasto ou importar a planilha. Reveja quando quiser em Dados > Ajuda.',
    ],
  },
  {
    n: 2, date: '2026-11-08', title: 'Mais clareza e ajuda no começo',
    items: [
      'Tour interativo na primeira abertura: ele destaca os botões do app na tela e mostra exemplos. Dá para rever em Dados > Ajuda.',
      'Termos de uso e privacidade em linguagem simples.',
      'Aviso para quem usa sem conta, com atalho para criar a conta e guardar os dados na nuvem.',
      'Esta janela de novidades, para você saber o que mudou a cada atualização.',
    ],
  },
  {
    n: 1, date: '2026-11-08', title: 'Conta na nuvem',
    items: [
      'Entre com o e-mail: você recebe um código, sem precisar de senha.',
      'Seus dados ganham uma cópia segura na nuvem e sincronizam entre aparelhos.',
      'O app continua funcionando sem internet; a sincronização acontece sozinha.',
      'Em Dados, você pode sair da conta ou excluí-la quando quiser.',
    ],
  },
]

export const LATEST = ENTRIES[0].n

/** Entradas que a pessoa ainda não viu (no máximo 3, da mais nova para a mais antiga). */
export function pendingEntries(seen: number | null, entries: ChangelogEntry[] = ENTRIES): ChangelogEntry[] {
  return entries.filter((entry) => entry.n > (seen ?? 0)).slice(0, 3)
}
