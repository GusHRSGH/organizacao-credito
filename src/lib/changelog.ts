/** Novidades de cada atualização, mostradas ao usuário depois que o app é atualizado. Mais nova primeiro. */
export interface ChangelogEntry { n: number; date: string; title: string; items: string[] }

export const ENTRIES: ChangelogEntry[] = [
  {
    n: 12, date: '2026-11-09', title: 'Fatura em PDF ou foto',
    items: [
      'Em Faturas > Colar fatura, anexe o PDF da fatura do banco ou tire uma foto dela. O app lê o texto no próprio aparelho, sem enviar nada para fora.',
      'PDF escaneado ou foto também funcionam: o leitor de imagens reconhece o texto (na primeira vez pode levar alguns segundos).',
      'O texto lido cai na tela de conferência: você vê cada linha, desmarca o que não for gasto e só então importa. Datas como “05 NOV” e parcelas como “02/05” são entendidas.',
    ],
  },
  {
    n: 11, date: '2026-11-09', title: 'Radar e assinaturas',
    items: [
      'Novo Radar do mês na Visão geral: avisa cobrança duplicada, valor bem acima do seu normal, gasto novo e caro, e categoria que disparou. Toque em Ver para abrir os lançamentos, ou em Ignorar.',
      'Novo painel de Assinaturas e custos fixos: o app descobre sozinho o que se repete todo mês, soma o custo fixo e avisa quando uma assinatura sobe de preço ou para de ser cobrada.',
    ],
  },
  {
    n: 10, date: '2026-11-09', title: 'Robô de limpeza',
    items: [
      'Novo em Dados: o robô de limpeza acha descrições sujas do banco (“UBER *TRIP 8842” vira “Uber”) e tira códigos e letras maiúsculas.',
      'Ele também junta responsáveis e categorias repetidas, como “Transporte” e “Transportes”.',
      'Você vê tudo antes, desmarca o que não quiser e edita o nome novo. O app guarda uma cópia antes de mexer.',
    ],
  },
  {
    n: 9, date: '2026-11-09', title: 'Entrada que entende você',
    items: [
      'O lançamento rápido agora entende frases: “gastei 50 reais no mercado ontem com a Ana”, “notebook 2,5 mil em 10 vezes”, “farmácia 40 sexta”, “padaria 12 dia 5”.',
      'Colar do banco agora também lê notificações (“Compra aprovada de R$ 45,90 em PADARIA hoje”) e conversas do WhatsApp, usando quem mandou a mensagem como responsável.',
      'Tudo passa por uma conferência antes de entrar: você vê o que o robô entendeu e desmarca o que não quiser.',
    ],
  },
  {
    n: 8, date: '2026-11-09', title: 'Pix na cobrança e acerto de contas',
    items: [
      'Em Cobrança, informe sua chave Pix e um recado. Eles vão no fim de toda cobrança copiada, e ficam só neste aparelho.',
      'Com o seu nome preenchido, cada cobrança leva o Pix copia e cola já com o valor exato de cada pessoa.',
      'Novo “Tudo em aberto”: soma as faturas pendentes de cada pessoa em uma cobrança só, separada por mês.',
      'Novo “Copiar acerto do grupo”: uma mensagem com quanto cada um deve, pronta para a conversa.',
    ],
  },
  {
    n: 7, date: '2026-11-09', title: 'Robô de importação',
    items: [
      'Importe planilhas .xlsx ou .csv de qualquer formato, sem arrumar colunas: o robô descobre sozinho o que é data, título, valor, responsável e parcela.',
      'Antes de importar, você vê como ele entendeu e corrige qualquer coluna. Estornos e pagamentos são ignorados, e planilhas com vários meses viram uma fatura por mês.',
      'O resumo em texto da Visão geral agora pode ser ocultado (× nele ou em Dados > Aparência).',
    ],
  },
  {
    n: 6, date: '2026-11-09', title: 'Resumo em texto e categoria sozinha',
    items: [
      'A Visão geral agora tem uma frase que resume o mês: quanto gastou, como está contra o outro mês e o que puxou a diferença.',
      'Ao digitar um gasto novo, o app sugere a categoria sozinho: primeiro pelo seu histórico, depois por palavras comuns (mercado, uber, farmácia...).',
    ],
  },
  {
    n: 5, date: '2026-11-09', title: 'Busca global e filtros salvos',
    items: [
      'Nova lupa no topo (ou Ctrl+K e /): busca em todas as faturas de uma vez, por nome, pessoa, categoria, mês ou valor.',
      'Toque num resultado para abrir a fatura dele, já filtrada.',
      'Em Faturas, salve qualquer combinação de filtros e reuse com um toque. Exemplo: “Pendentes · Ana”.',
    ],
  },
  {
    n: 4, date: '2026-11-09', title: 'Mais leve e mais seguro',
    items: [
      'O app abre mais rápido: o pacote principal ficou quase metade do tamanho.',
      'Se algo inesperado acontecer, uma tela amigável permite recarregar ou baixar um backup, sem perder dados.',
      'Ao voltar a ter internet, a sincronização da conta retoma sozinha.',
      'Bastidores: testes automáticos que abrem o app no celular e no computador a cada alteração.',
    ],
  },
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
