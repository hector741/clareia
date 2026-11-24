-- Pomodoro: registro das sessões de foco que chegaram ao fim, por tarefa.
-- Só inserção e exclusão: uma sessão registrada não muda (o id vem do app, o que evita duplicar).

create table public.focus_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  task_id uuid not null,
  kind text not null check (kind in ('pomodoro', 'extra')),
  duration_seconds integer not null check (duration_seconds between 60 and 14400),
  ended_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade
);

create index focus_sessions_user_task_idx on public.focus_sessions (user_id, task_id);

alter table public.focus_sessions enable row level security;

revoke all on public.focus_sessions from anon;
grant select, insert, delete on public.focus_sessions to authenticated;

create policy "focus_sessions: dono lê" on public.focus_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "focus_sessions: dono cria" on public.focus_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "focus_sessions: dono exclui" on public.focus_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- import_data passa a levar também as sessões de foco (backups antigos mandam lista vazia).
drop function public.import_data(jsonb, jsonb, boolean);

create function public.import_data(p_lists jsonb, p_tasks jsonb, p_replace boolean, p_sessions jsonb default '[]'::jsonb)
returns void
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

  insert into public.focus_sessions (user_id, id, task_id, kind, duration_seconds, ended_at)
  select v_uid, x.id, x.task_id, x.kind, x.duration_seconds, x.ended_at
    from jsonb_to_recordset(coalesce(p_sessions, '[]'::jsonb)) as x(
      id uuid, task_id uuid, kind text, duration_seconds integer, ended_at timestamptz)
  on conflict (user_id, id) do nothing;
end;
$$;

revoke execute on function public.import_data(jsonb, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.import_data(jsonb, jsonb, boolean, jsonb) to authenticated;
