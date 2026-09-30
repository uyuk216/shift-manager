-- Supabase の SQL Editor に貼り付けて実行する
create table if not exists public.settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb
);
create table if not exists public.workplaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  wage integer not null default 1100,
  transport integer,
  color text not null default '#4f8cff',
  weekday_wages jsonb not null default '{}'::jsonb
);
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  workplace_id uuid not null references public.workplaces on delete cascade,
  break_min integer,
  note text not null default ''
);
create index if not exists shifts_user_date on public.shifts (user_id, date);
create index if not exists shifts_workplace on public.shifts (workplace_id);
create index if not exists workplaces_user on public.workplaces (user_id);

alter table public.settings enable row level security;
alter table public.workplaces enable row level security;
alter table public.shifts enable row level security;

do $$ declare t text; begin
  foreach t in array array['settings','workplaces','shifts'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
