# Status do projeto

**Atualizado:** 2026-11-08  
**Fonte de verdade:** repositório privado `GusHRSGH/organizacao-credito` e documentação versionada.  
**Orçamento:** R$ 0. Não autorizar upgrades ou serviços cobrados.

## Atualização 2026-11-08 (versão local)

- O app agora funciona sem login nem internet, usando um banco local (IndexedDB). A nuvem (Supabase) virou fonte opcional, escolhida em "Dados e backup". Google Sheets fica para a próxima etapa.
- Interface comum às duas fontes: `DataSource` em `src/types.ts`; implementações em `src/services/localSource.ts` e `supabaseSource.ts`.
- Implementado e testado (10 testes Vitest, dados sintéticos): parcelas em centavos, importação de .xlsx com prévia e sem duplicar, backup/restauração JSON validado, exportação CSV.
- Telas: Visão geral (comparar dois meses, gráficos, evolução mensal), Faturas e lançamentos (filtros, ordenação, nova fatura), Dados e backup.
- Corrigidos: `electron-builder@^27` (inexistente, agora ^26) e 7 erros de lint/TypeScript.
- Ainda não validado: instalador NSIS no Windows, Supabase real, deep link do link mágico.

## Objetivo

Aplicação web pessoal para organizar despesas e faturas de cartão compartilhado. O usuário traz ideias e requisitos em linguagem natural; a implementação deve priorizar um fluxo simples, dados privados e custo zero.

## Decisões vigentes

- Frontend: React + TypeScript + Vite.
- Aplicativo Windows: Electron + electron-builder/NSIS, compartilhando a interface React; build local ou artefato manual via GitHub Actions, sem assinatura paga.
- Banco/Auth: Supabase PostgreSQL + Supabase Auth, com RLS por usuário.
- Hosting: Vercel Hobby para uso pessoal, sem domínio pago (`*.vercel.app`).
- Repositório: GitHub Free privado; Actions dentro das cotas gratuitas.
- Login: link mágico de e-mail; novos signups desativados. Usuário inicial deve ser provisionado pelo painel Supabase.
- Sincronização: banco em nuvem para dispositivos do mesmo usuário.
- Responsável: pessoa a quem a despesa é atribuída.
- Parcelas: valor informado é o total da compra; dividir igualmente em centavos, diferença de arredondamento na última parcela; criar meses/faturas futuras numa transação SQL.
- A aplicação não guarda número ou credenciais de cartão.
- Manter o custo em zero: sem custom SMTP, domínios, add-ons, billing/upgrade ou cartão de pagamento.
- Sem dados pessoais/financeiros reais em código, fixtures, commits ou issues. Não copiar a planilha de origem ao repositório.

## Implementado no código local

- Esqueleto React/TypeScript/Vite e configurações iniciais para Vercel e GitHub Actions.
- Login por link mágico no cliente Supabase, quando o ambiente está configurado.
- Consultas de faturas e lançamentos, filtros por texto/status, mudança do estado pago/pendente e remoção.
- Formulário de compra à vista/parcelada.
- Migration SQL inicial para perfis, pessoas, categorias, faturas e transações; RLS de propriedade; chaves compostas para impedir relacionamentos cruzados entre usuários; RPC transacional `create_purchase`.
- Documentos de arquitetura/custo em `STACK.md`.
- Invólucro Electron com deep link `organizacao-credito://auth/callback`, preload isolado, navegação restrita e CSP.
- Workflow manual do Windows configurado para publicar o instalador como artefato temporário do GitHub Actions (14 dias).

## Ainda não implementado / verificado

- Repositório GitHub privado: `GusHRSGH/organizacao-credito`. A estrutura e os 24 arquivos do projeto foram enviados ao branch `main` e conferidos na página do repositório.
- A conta Supabase tem a organização `Batata` no plano Free e ainda não havia projetos. O formulário para `organizacao-credito` está preparado em São Paulo (`sa-east-1`), Data API ligada, exposição automática de tabelas desligada e RLS automático ligado. A criação está aguardando o usuário definir a senha do banco e acionar o botão final.
- Projeto Vercel ainda não vinculado.
- Nenhuma migration foi aplicada a um banco remoto.
- Não foi possível instalar dependências ou executar lint/build nesta máquina (Node está disponível, npm não).
- O `.exe` ainda não foi construído nem validado. Para o link mágico funcionar no desktop, adicionar `organizacao-credito://auth/callback` à URL allowlist do Supabase e validar a abertura do aplicativo pelo link no Windows.
- A interface não foi validada num browser com o backend real.
- Importação validada do XLSX, prévia/relatório de erros, exportação completa e backup JSON recuperável ainda faltam.
- O protótipo HTML isolado foi um estudo visual, não é fonte de verdade nem está incluído no repositório.
- Regras de vencimento/fechamento de fatura não foram decididas.

## Próximas etapas

1. Aguardar o GitHub Actions compilar o primeiro instalador Windows e corrigir qualquer falha da pipeline.
2. Criar o projeto Supabase Free, configurar a allowlist do deep link, aplicar e revisar migrations/RLS; manter desativado o cadastro público.
3. Resolver dependências, gerar lockfile, executar lint/build e validar a lógica SQL com dados sintéticos.
4. Implementar importação XLSX com seleção de mês, pré-visualização, validação e proteção contra duplicidade.
5. Implementar exportação CSV e backup/restauração JSON; validar recuperação antes de usar dados reais.
6. Configurar eventual publicação Vercel Hobby se o site também for desejado; sem domínio pago ou cobrança.
7. Só importar dados reais da planilha após acesso privado e backup verificados.

## Limites de custo conhecidos (verificar de novo antes de lançar)

- Supabase Free pode pausar projetos com baixa atividade por uma semana; não inclui backups automáticos e o SMTP padrão só envia para membros da organização e está limitado atualmente a 2 mensagens por hora.
- Vercel Hobby destina-se a uso pessoal/não comercial e pausa/limita recursos ao ultrapassar cotas gratuitas.
- GitHub Free inclui repositórios privados e 2.000 minutos mensais de GitHub Actions.
- Não prometer disponibilidade contínua nem cotas permanentes. Se um serviço exigir pagamento, interromper e procurar alternativa grátis.
