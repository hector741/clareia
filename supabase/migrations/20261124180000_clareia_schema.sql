-- Clareia: listas, tarefas e configurações por usuário.
-- Cada linha pertence a um usuário (user_id = auth.uid()) e só ele a enxerga (RLS).

create schema if not exists private;
grant usage on schema private to authenticated;

/* ------------------------------------------------------------------ Listas */

create table public.lists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  color text not null check (color in ('green', 'blue', 'violet', 'amber', 'pink', 'gray')),
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

/* ----------------------------------------------------------------- Tarefas */

create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  list_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'high')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  planned_date date,
  due_date date,
  focus_date date,
  position double precision not null,
  subtasks jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_on date,
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, list_id) references public.lists (user_id, id) on delete set null (list_id),
  constraint tasks_completion_consistent
    check ((status = 'completed') = (completed_at is not null and completed_on is not null)),
  constraint tasks_focus_consistent
    check (focus_date is null or (status = 'pending' and deleted_at is null and planned_date = focus_date))
);

create index tasks_user_list_idx on public.tasks (user_id, list_id);
create index tasks_user_focus_idx on public.tasks (user_id, focus_date) where focus_date is not null;

/* ----------------------------------------------------------- Configurações */

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  last_export_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

/* --------------------------------------------------------------------- RLS */

alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.lists, public.tasks, public.user_settings from anon;
grant select, insert, update, delete on public.lists, public.tasks, public.user_settings to authenticated;

create policy "lists: dono lê" on public.lists for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "lists: dono cria" on public.lists for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "lists: dono altera" on public.lists for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lists: dono exclui" on public.lists for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "tasks: dono lê" on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "tasks: dono cria" on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "tasks: dono altera" on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks: dono exclui" on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "settings: dono lê" on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "settings: dono cria" on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "settings: dono altera" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

/* ------------------------------------------------ Limite de 3 tarefas em foco */

-- Serializa por usuário (advisory lock) para que gravações simultâneas, de qualquer
-- aparelho, nunca passem de três tarefas em foco no mesmo dia.
create function private.enforce_focus_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.focus_date is not null
     and (tg_op = 'INSERT' or new.focus_date is distinct from old.focus_date) then
    perform pg_advisory_xact_lock(hashtextextended('clareia-focus:' || new.user_id::text, 0));
    if (
      select count(*) from public.tasks t
      where t.user_id = new.user_id
        and t.focus_date = new.focus_date
        and t.id <> new.id
        and t.status = 'pending'
        and t.deleted_at is null
    ) >= 3 then
      raise exception 'focus_limit' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_focus_limit
  before insert or update of focus_date on public.tasks
  for each row execute function private.enforce_focus_limit();

/* ---------------------------------------------------- Operações compostas */

-- Exclui a lista e move TODAS as suas tarefas para a Entrada, ao final da ordem.
create function public.delete_list(p_list_id uuid) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_max double precision;
  v_moved integer;
begin
  if not exists (select 1 from public.lists where user_id = v_uid and id = p_list_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(max(position), 0) into v_max from public.tasks where user_id = v_uid and list_id is null;
  with ordered as (
    select id, row_number() over (order by position, created_at, id) as rn
    from public.tasks where user_id = v_uid and list_id = p_list_id
  )
  update public.tasks t
     set list_id = null, position = v_max + ordered.rn, updated_at = now()
    from ordered
   where t.user_id = v_uid and t.id = ordered.id;
  get diagnostics v_moved = row_count;
  delete from public.lists where user_id = v_uid and id = p_list_id;
  return v_moved;
end;
$$;

-- Grava a ordem manual (posição = índice + 1) de uma vez.
create function public.set_task_positions(p_ids uuid[]) returns void
language sql
security invoker
set search_path = ''
as $$
  update public.tasks t
     set position = ord.n::double precision, updated_at = now()
    from unnest(p_ids) with ordinality as ord(id, n)
   where t.user_id = auth.uid() and t.id = ord.id and t.position <> ord.n;
$$;

-- Importa listas e tarefas numa única transação.
-- p_replace = true: substitui tudo (restaurar backup). false: acrescenta sem sobrescrever.
create function public.import_data(p_lists jsonb, p_tasks jsonb, p_replace boolean) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_replace then
    delete from public.tasks where user_id = v_uid;
    delete from public.lists where user_id = v_uid;
  end if;

  insert into public.lists (user_id, id, name, color, position, created_at, updated_at)
  select v_uid, x.id, x.name, x.color, x.position, x.created_at, x.updated_at
    from jsonb_to_recordset(p_lists) as x(
      id uuid, name text, color text, position double precision, created_at timestamptz, updated_at timestamptz)
  on conflict (user_id, id) do nothing;

  insert into public.tasks (
    user_id, id, list_id, title, description, priority, status, planned_date, due_date, focus_date,
    position, subtasks, created_at, updated_at, completed_at, completed_on, deleted_at)
  select v_uid, x.id, x.list_id, x.title, x.description, x.priority, x.status, x.planned_date, x.due_date,
         x.focus_date, x.position, x.subtasks, x.created_at, x.updated_at, x.completed_at, x.completed_on,
         x.deleted_at
    from jsonb_to_recordset(p_tasks) as x(
      id uuid, list_id uuid, title text, description text, priority text, status text, planned_date date,
      due_date date, focus_date date, position double precision, subtasks jsonb, created_at timestamptz,
      updated_at timestamptz, completed_at timestamptz, completed_on date, deleted_at timestamptz)
  on conflict (user_id, id) do nothing;
end;
$$;

revoke execute on function public.delete_list(uuid) from public, anon;
revoke execute on function public.set_task_positions(uuid[]) from public, anon;
revoke execute on function public.import_data(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.delete_list(uuid) to authenticated;
grant execute on function public.set_task_positions(uuid[]) to authenticated;
grant execute on function public.import_data(jsonb, jsonb, boolean) to authenticated;
