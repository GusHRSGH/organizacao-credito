# Arquitetura proposta

## Stack inicial

- **Frontend:** React + TypeScript + Vite. A mesma interface atende ao site pessoal e ao aplicativo Windows empacotado com Electron; a geração do instalador usa electron-builder/NSIS.
- **Backend:** Supabase, usando PostgreSQL como fonte única de dados, Supabase Auth para login e Row Level Security (RLS) para garantir que cada usuário só veja os próprios registros.
- **Hospedagem do frontend:** Vercel, com deploy conectado ao GitHub.
- **Automação:** GitHub Actions para checagem de tipos, lint e build a cada pull request.
- **Testes:** Vitest para funções de domínio e Playwright para fluxos críticos do navegador, introduzidos junto com as respectivas funcionalidades.

## Por que essa composição

O sistema é pessoal e os dados são relacionais: faturas contêm lançamentos e cada lançamento pode conter responsável, categoria, status e dados de parcela. PostgreSQL acomoda essas relações e os relatórios mensais com clareza. Supabase reduz o trabalho inicial de operar API, banco e autenticação separados. A aplicação falará com o Supabase por um módulo de acesso a dados; as regras financeiras ficarão em funções de domínio, sem depender dos componentes React.

## Ambientes

1. **Local:** frontend Vite; backend local Supabase quando CLI/Docker estiverem disponíveis. Para interface sem credenciais, usar dados fictícios em um adaptador de demonstração.
2. **Preview:** deploy Vercel ligado a um projeto Supabase de desenvolvimento e dados sintéticos.
3. **Produção:** deploy Vercel e projeto Supabase próprios, com acesso privado, RLS habilitado, backups e chaves apenas em variáveis de ambiente. Nunca incluir `.env` com segredos no Git.

## Custo: requisito de R$ 0

O produto será desenvolvido e publicado somente dentro de planos gratuitos. Não compraremos domínio, não habilitaremos add-ons, não faremos upgrade automático e não cadastraremos cartão para permitir cobrança. Usaremos o endereço `*.vercel.app` e a chave publicável do Supabase. O app não precisa de armazenamento de arquivos pagos: importação/exportação deve acontecer no navegador.

- **Código e CI:** GitHub Free oferece repositórios privados ilimitados e 2.000 minutos mensais incluídos para Actions; o workflow deste projeto deve permanecer dentro da cota e pode ser desativado se atingir o limite.
- **Aplicação web:** Vercel Hobby é gratuito para uso pessoal e não comercial. Ao atingir cotas, deployments/recursos podem pausar até o próximo período; não habilitar consumo pago.
- **Banco e login:** Supabase Free inclui cotas de banco, Auth e tráfego suficientes para começar um app pessoal. O serviço pode pausar projetos com pouca atividade por uma semana; no plano gratuito não há backup automático diário. Import/export e cópia de segurança manual baixada pelo usuário são, portanto, requisitos antes de guardar dados reais.
- **E-mail:** usar o envio incluído do Supabase Auth para link mágico, sem contratar SMTP. O envio padrão aceita apenas endereços da equipe do projeto e tem limite atual de 2 mensagens por hora; para este app, a conta proprietária precisa ser o usuário autorizado. Se essa regra impedir o acesso, não contrataremos SMTP: vamos trocar para uma alternativa de autenticação gratuita compatível ou repensar o backend.
- **Backup:** Supabase Free não oferece backup automático para restauração. A aplicação deverá exportar um backup JSON completo que você baixa para seu próprio computador. Não haverá backup agendado em nuvem dentro deste orçamento.

Esse conjunto não garante operação contínua ou cotas imutáveis: políticas e limites dos planos gratuitos podem mudar. Se um provedor exigir cobrança para continuar, paramos o deploy/uso e escolhemos alternativa gratuita, sem autorizar upgrade. Sem domínio próprio, o site usa o subdomínio gratuito do Vercel. O instalador Windows é compilado sem custo com electron-builder/NSIS; pode ser distribuído como artefato do GitHub Actions (retenção de 14 dias) dentro da cota. Sem assinatura de código paga, o Windows pode alertar sobre editor desconhecido.

## Modelo de dados inicial

Todas as tabelas de domínio têm `user_id` e políticas RLS que comparam esse campo ao usuário autenticado.

### `profiles`

- `id uuid primary key references auth.users`
- `display_name text`
- `created_at timestamptz`

### `people`

- `id uuid primary key`
- `user_id uuid not null references auth.users`
- `name text not null`
- `short_name text`
- `created_at timestamptz`
- unique (`user_id`, `name`)

### `categories`

- `id uuid primary key`
- `user_id uuid not null references auth.users`
- `name text not null`
- `created_at timestamptz`
- unique (`user_id`, `name`)

### `invoices`

- `id uuid primary key`
- `user_id uuid not null references auth.users`
- `period date not null` (primeiro dia do mês da fatura)
- `label text not null`
- `status text not null check (status in ('open','closed','paid'))`
- `created_at timestamptz`
- unique (`user_id`, `period`)

### `transactions`

- `id uuid primary key`
- `user_id uuid not null references auth.users`
- `invoice_id uuid not null references invoices`
- `occurred_on date not null`
- `description text not null`
- `amount numeric(12,2) not null check (amount > 0)`
- `person_id uuid references people`
- `category_id uuid references categories`
- `status text not null check (status in ('pending','paid'))`
- `installment_group uuid null`
- `installment_number smallint null`
- `installment_count smallint null`
- `created_at timestamptz`

Valores monetários são armazenados em `numeric(12,2)`, nunca em ponto flutuante. Para parcelas, o grupo identifica a compra original e número/total identificam cada parcela. A distribuição automática futura entre faturas deve ser uma regra de domínio explícita, em transação no banco, evitando criar parcelas duplicadas.

## Contrato funcional da API

O cliente usa o Supabase SDK autenticado. Uma camada de serviço encapsula as consultas; não há chave de serviço no navegador.

- `GET /invoices?from=YYYY-MM&to=YYYY-MM` — lista faturas próprias com total, pago, pendente e contagem.
- `POST /invoices` — cria uma fatura para um período.
- `GET /invoices/:id/transactions?query=&person=&category=&status=` — lista lançamentos paginados e filtrados.
- `POST /invoices/:id/transactions` — cria um lançamento validado.
- `PATCH /transactions/:id` — altera campos permitidos, inclusive status.
- `DELETE /transactions/:id` — remove um lançamento próprio.
- `GET /reports/monthly?from=&to=` — totais por mês e variação.
- `GET /reports/breakdown?month=&by=person|category` — composição do mês.

Esses caminhos descrevem o contrato da aplicação. Com Supabase, as chamadas concretas serão consultas PostgreSQL sob RLS ou funções RPC para operações agregadas/parcelamento; não se pretende expor uma API REST caseira sem necessidade.

## Regras e segurança

- Sessão autenticada obrigatória para dados financeiros.
- RLS com `auth.uid() = user_id` em leitura, inserção, atualização e exclusão; chaves de `service_role` só podem existir em funções de servidor protegidas.
- Validar UUIDs e relacionamentos, valor positivo, datas, status e parcela no cliente e no banco.
- Não armazenar dados de cartão, credenciais bancárias ou números de conta.
- Importação da planilha deve ser uma etapa separada: pré-visualização, validação de colunas, relatório de erros e confirmação antes de gravar. Dados pessoais da planilha não entram em fixtures, commits, logs ou previews públicos.
- Exportação/backup e exclusão de dados próprios devem ser oferecidos antes do uso cotidiano.

## Organização do código alvo

```text
src/
  app/                 rotas, layout e sessão
  components/          componentes de interface reutilizáveis
  features/
    dashboard/         resumos e gráficos
    invoices/          faturas e lançamentos
    installments/      grupos e cronograma de parcelas
    reports/            relatórios
  domain/              tipos e regras puras de negócio
  lib/supabase/        cliente e configuração pública
  services/            repositórios/consultas usados pelas features
supabase/
  migrations/          esquema e políticas RLS versionados
  seed.sql             dados exclusivamente fictícios
```

## Decisões originalmente em aberto (agora resolvidas abaixo)

1. Login por e-mail com link mágico ou senha.
2. Se dados devem sincronizar entre aparelhos desde a primeira versão.
3. Qual significado de `Responsável`: pessoa que fez a compra, pessoa que deve pagar ou pessoa a quem o gasto pertence.
4. Regra de vencimento/fechamento e distribuição de parcelas entre meses.

## Decisões agora adotadas

1. Login por link mágico de e-mail; signup desabilitado. A conta inicial é provisionada manualmente no painel Supabase.
2. Sincronização entre aparelhos vinculada à conta, usando Supabase como fonte de dados.
3. `Responsável` é a pessoa a quem o gasto é atribuído.
4. O valor digitado para compra parcelada é o total da compra. Dividir em parcelas mensais iguais em centavos, ajustar resto na última e criar as faturas futuras na mesma transação SQL. A primeira parcela fica no mês da data da compra.
5. O cartão é único na primeira versão; não armazenaremos número ou credenciais do cartão.

Vencimento/fechamento da fatura ainda não está definido pela planilha; o MVP usa mês como período e status aberta/fechada/paga.

## Estado real da implementação

Há um esqueleto React/TypeScript/Vite com interface autenticada, consultas de fatura/lançamentos, filtros, status e cadastro de compras parceladas. A camada Electron e o empacotamento NSIS foram configurados; o retorno por deep link do login está implementado, mas depende da allowlist Supabase e de validação em um Windows com npm. A migration e a função RPC estão escritas, mas **não foram aplicadas nem verificadas num projeto Supabase**. Importação XLSX com prévia, exportação integral e backup/restauração JSON continuam pendentes. O build não foi executado; esta máquina tem Node, mas não npm.

O protótipo HTML isolado foi apenas um estudo visual e não é fonte de verdade nem está incluído no repositório.
