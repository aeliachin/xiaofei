-- 小猫消费 Supabase 初始化 SQL
-- 使用前请把下面两个邮箱改成你们两个人的登录邮箱。

create table if not exists public.money_records (
    id uuid primary key default gen_random_uuid(),

    wallet_type text not null check (wallet_type in ('cash', 'card')),
    action_type text not null check (action_type in ('recharge', 'transfer')),

    amount numeric(12,2) not null check (amount <> 0),
    purpose text not null,
    note text,

    created_by_email text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    deleted boolean not null default false
);

alter table public.money_records enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.money_records to authenticated;

create or replace function public.is_allowed_money_user()
returns boolean
language sql
stable
as $$
    select lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'sillymoon@gmail.com',
        'mendorn@gmail.com'
    );
$$;

drop policy if exists "money_records_select" on public.money_records;
drop policy if exists "money_records_insert" on public.money_records;
drop policy if exists "money_records_update" on public.money_records;

create policy "money_records_select"
on public.money_records
for select
to authenticated
using (
    public.is_allowed_money_user()
);

create policy "money_records_insert"
on public.money_records
for insert
to authenticated
with check (
    public.is_allowed_money_user()
    and lower(created_by_email) = lower(auth.jwt() ->> 'email')
);

create policy "money_records_update"
on public.money_records
for update
to authenticated
using (
    public.is_allowed_money_user()
)
with check (
    public.is_allowed_money_user()
);

alter table public.money_records replica identity full;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'money_records'
    ) then
        alter publication supabase_realtime add table public.money_records;
    end if;
end $$;
