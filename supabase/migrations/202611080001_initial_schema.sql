create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  short_name text,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  label text not null check (length(trim(label)) between 1 and 80),
  status text not null default 'open' check (status in ('open', 'closed', 'paid')),
  created_at timestamptz not null default now(),
  unique (user_id, period),
  unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  occurred_on date not null,
  description text not null check (length(trim(description)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0),
  person_id uuid,
  category_id uuid,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  installment_group uuid,
  installment_number smallint,
  installment_count smallint,
  created_at timestamptz not null default now(),
  foreign key (user_id, invoice_id) references public.invoices(user_id, id) on delete cascade,
  foreign key (user_id, person_id) references public.people(user_id, id) on delete restrict,
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  check ((installment_group is null and installment_number is null and installment_count is null)
      or (installment_group is not null and installment_number between 1 and installment_count and installment_count between 2 and 48))
);

create index invoices_user_period_idx on public.invoices(user_id, period desc);
create index transactions_user_invoice_date_idx on public.transactions(user_id, invoice_id, occurred_on desc);
create index transactions_installment_group_idx on public.transactions(user_id, installment_group) where installment_group is not null;

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.categories enable row level security;
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;

create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users can manage own people" on public.people for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can manage own categories" on public.categories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can manage own invoices" on public.invoices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can manage own transactions" on public.transactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.people, public.categories, public.invoices, public.transactions to authenticated;

create or replace function public.create_purchase(
  p_occurred_on date,
  p_description text,
  p_total_amount numeric,
  p_person_name text,
  p_category_name text,
  p_installment_count smallint default 1
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_person_id uuid;
  v_category_id uuid;
  v_group_id uuid;
  v_invoice_id uuid;
  v_first_id uuid;
  v_period date;
  v_label text;
  v_count integer := coalesce(p_installment_count, 1);
  v_cents bigint := round(p_total_amount * 100)::bigint;
  v_base_cents bigint;
  v_day integer;
  v_offset integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_occurred_on is null or length(trim(p_description)) not between 1 and 160 then raise exception 'Invalid date or description'; end if;
  if p_total_amount is null or p_total_amount <= 0 or p_total_amount > 9999999999.99 then raise exception 'Invalid amount'; end if;
  if v_count < 1 or v_count > 48 then raise exception 'Installment count must be between 1 and 48'; end if;
  if length(trim(p_person_name)) not between 1 and 80 or length(trim(p_category_name)) not between 1 and 60 then raise exception 'Person and category are required'; end if;

  insert into public.people(user_id, name) values (v_user_id, trim(p_person_name))
    on conflict (user_id, name) do update set name = excluded.name returning id into v_person_id;
  insert into public.categories(user_id, name) values (v_user_id, trim(p_category_name))
    on conflict (user_id, name) do update set name = excluded.name returning id into v_category_id;
  if v_count > 1 then v_group_id := gen_random_uuid(); end if;
  v_base_cents := v_cents / v_count;
  v_day := extract(day from p_occurred_on)::integer;

  for v_offset in 0..(v_count - 1) loop
    v_period := (date_trunc('month', p_occurred_on)::date + make_interval(months => v_offset))::date;
    v_label := initcap(to_char(v_period, 'TMMonth YYYY'));
    insert into public.invoices(user_id, period, label, status)
      values (v_user_id, v_period, v_label, 'open')
      on conflict (user_id, period) do update set period = excluded.period
      returning id into v_invoice_id;
    if v_first_id is null then v_first_id := v_invoice_id; end if;
    insert into public.transactions(user_id, invoice_id, occurred_on, description, amount, person_id, category_id, status, installment_group, installment_number, installment_count)
      values (v_user_id, v_invoice_id,
        (v_period + (least(v_day, extract(day from ((v_period + interval '1 month') - interval '1 day'))::integer) - 1)),
        trim(p_description), ((case when v_offset = v_count - 1 then v_cents - v_base_cents * v_offset else v_base_cents end)::numeric / 100),
        v_person_id, v_category_id, 'pending', v_group_id,
        case when v_group_id is null then null else v_offset + 1 end,
        case when v_group_id is null then null else v_count end);
  end loop;
  return v_first_id;
end;
$$;

revoke all on function public.create_purchase(date, text, numeric, text, text, smallint) from public;
grant execute on function public.create_purchase(date, text, numeric, text, text, smallint) to authenticated;

