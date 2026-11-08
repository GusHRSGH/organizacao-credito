# Organização do Crédito

Aplicação pessoal para gerenciar faturas e compras parceladas. Stack: React, TypeScript, Vite e Supabase (PostgreSQL, Auth e RLS); publicação planejada em Vercel.

**Orçamento definido: R$ 0.** Usaremos os planos gratuitos do GitHub, Supabase e Vercel, sem domínio pago, add-ons, serviços externos pagos ou upgrades. Veja cotas e limitações em [STACK.md](STACK.md). Não habilite faturamento pago para este projeto.

Para retomar o trabalho em outra ferramenta, leia [PROJECT_STATUS.md](PROJECT_STATUS.md) e [CLAUDE.md](CLAUDE.md). Atualize `PROJECT_STATUS.md` após cada decisão ou mudança verificada.

## Executar

Requer Node.js 22+ e npm.

```sh
npm install
copy .env.example .env
npm run dev
```

Sem credenciais Supabase, a página apresenta instruções de configuração. Para ativar login e banco, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`, aplique as migrations e cadastre a URL exata da aplicação em Supabase Auth. Novos cadastros estão desabilitados por padrão; crie seu usuário inicial pelo painel Supabase e só permita novos usuários deliberadamente. Nunca use uma chave `service_role` no frontend.

## Implementado nesta base

- Login por link mágico de e-mail, quando Supabase está configurado.
- Faturas e lançamentos autenticados com acesso condicionado por políticas RLS.
- Visão geral por fatura, filtros e status pago/pendente.
- Cadastro de compras à vista e parceladas. Parcelas mensais, faturas e ajustes de centavos são gravados numa única função SQL transacional.
- Interface adaptada para desktop e celular.

As regras adotadas estão descritas em [STACK.md](STACK.md): sincronização entre aparelhos, responsável como pessoa a quem o gasto é atribuído e parcelas futuras geradas no cadastro. O valor digitado para compra parcelada é o total da compra, dividido igualmente; centavos residuais vão para a última parcela.

## Segurança e estado

`supabase/migrations` é a fonte versionada do esquema. RLS restringe todos os registros ao usuário autenticado, inclusive relacionamentos entre faturas, pessoas e categorias. Os dados originais da planilha não estão no repositório. A importação validada, exportação e backup recuperável ainda são trabalho pendente. Antes de inserir informações reais, configure autenticação, URL de produção, backups no projeto Supabase e revise as regras da fatura e do cartão.

## Publicação

`vercel.json` e o workflow de CI estão preparados. O repositório privado é `GusHRSGH/organizacao-credito`. O projeto Supabase e o projeto Vercel ainda não estão vinculados.

