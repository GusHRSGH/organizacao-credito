-- Organização do Crédito: cada conta guarda a própria cópia dos dados.
-- Cole este arquivo inteiro em Supabase > SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (é idempotente).

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_data_payload_size check (pg_column_size(payload) < 4000000)
);

alter table public.user_data enable row level security;

-- Cada pessoa só enxerga a própria linha. Ninguém escreve direto na tabela: só pelas funções abaixo.
drop policy if exists "Ler a própria cópia" on public.user_data;
create policy "Ler a própria cópia" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_data from anon, authenticated;
grant select on public.user_data to authenticated;

-- Salva a cópia com controle de versão: se outro aparelho salvou antes, devolve version_conflict.
create or replace function public.save_user_data(p_payload jsonb, p_expected_version bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_new bigint;
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'app' is distinct from 'organizacao-credito' then
    raise exception 'invalid_payload';
  end if;
  if pg_column_size(p_payload) >= 4000000 then raise exception 'payload_too_large'; end if;

  if coalesce(p_expected_version, 0) = 0 then
    insert into public.user_data(user_id, payload, version) values (v_uid, p_payload, 1)
      on conflict (user_id) do nothing
      returning version into v_new;
  else
    update public.user_data
       set payload = p_payload, version = version + 1, updated_at = now()
     where user_id = v_uid and version = p_expected_version
     returning version into v_new;
  end if;

  if v_new is null then raise exception 'version_conflict'; end if;
  return v_new;
end;
$$;

-- Exclui a conta e tudo que está ligado a ela.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- Batida leve no banco, usada pela rotina que impede o projeto grátis de pausar.
create or replace function public.ping()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select now(); $$;

revoke all on function public.save_user_data(jsonb, bigint) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.ping() from public;
grant execute on function public.save_user_data(jsonb, bigint) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.ping() to anon, authenticated;
