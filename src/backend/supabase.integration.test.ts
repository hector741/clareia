import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepository } from '../db/repository';
import { DataStore } from '../db/store';
import { emptyTaskInput } from '../domain/taskInput';
import { createSupabaseAuth, createSupabaseRemote } from './supabase';

/**
 * Contra o projeto Supabase real. Só roda via `node scripts/integration-test.mjs`,
 * que cria dois usuários temporários confirmados e os apaga ao final.
 */
const url = process.env.CLAREIA_IT_URL;
const key = process.env.CLAREIA_IT_KEY;
const users = JSON.parse(process.env.CLAREIA_IT_USERS ?? '[]') as { email: string; password: string }[];

const newClient = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

async function device(email: string, password: string) {
  const client = newClient();
  const auth = createSupabaseAuth(client);
  await auth.signIn(email, password);
  const store = new DataStore();
  const remote = createSupabaseRemote(client);
  const repo = createRepository(store, remote);
  await repo.load();
  return { client, auth, store, remote, repo };
}

describe.skipIf(!url || users.length < 2)('Supabase real', () => {
  let a: Awaited<ReturnType<typeof device>>;
  let b: Awaited<ReturnType<typeof device>>;
  let other: Awaited<ReturnType<typeof device>>;

  beforeAll(async () => {
    a = await device(users[0]!.email, users[0]!.password);
    b = await device(users[0]!.email, users[0]!.password);
    other = await device(users[1]!.email, users[1]!.password);
  });

  afterAll(async () => {
    await Promise.all([a, b, other].filter(Boolean).map((d) => d.auth.signOut().catch(() => undefined)));
  });

  it('senha errada e usuário anônimo são recusados', async () => {
    const auth = createSupabaseAuth(newClient());
    await expect(auth.signIn(users[0]!.email, 'errada-123')).rejects.toMatchObject({ code: 'invalid_credentials' });
    const anon: SupabaseClient = newClient();
    const { data, error } = await anon.from('tasks').select('*');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const rpc = await anon.rpc('import_data', { p_lists: [], p_tasks: [], p_replace: true });
    expect(rpc.error).not.toBeNull();
  });

  it('grava e lê tarefas, listas, etapas e configurações na conta', async () => {
    const list = await a.repo.createList({ name: 'Integração', color: 'violet' });
    const task = await a.repo.createTask(
      emptyTaskInput({
        title: 'Tarefa real',
        listId: list.id,
        dueDate: '2026-12-31',
        subtasks: [{ id: crypto.randomUUID(), title: 'etapa', completed: true }],
      }),
    );
    await a.repo.markExported('2026-11-24T13:00:00.000Z');
    await b.repo.refresh();
    const seen = b.store.getTask(task.id);
    expect(seen).toEqual(task);
    expect(b.store.getList(list.id)).toEqual(list);
    expect(b.store.getState().settings.lastExportGeneratedAt).toBe('2026-11-24T13:00:00.000Z');
  });

  it('outro usuário não vê nem altera os dados (RLS)', async () => {
    const mine = a.store.getState().tasks[0]!;
    await other.repo.refresh();
    expect(other.store.getState().tasks).toHaveLength(0);
    expect(other.store.getState().lists).toHaveLength(0);
    const upd = await other.client.from('tasks').update({ title: 'invadido' }).eq('id', mine.id).select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await other.client.from('tasks').delete().eq('id', mine.id).select();
    expect(del.data ?? []).toHaveLength(0);
    const forged = await other.client.from('tasks').insert({
      user_id: (await a.client.auth.getUser()).data.user!.id,
      title: 'forjada',
      position: 1,
    });
    expect(forged.error).not.toBeNull();
    await a.repo.refresh();
    expect(a.store.getTask(mine.id)?.title).toBe(mine.title);
  });

  it('o banco garante no máximo 3 em foco, mesmo entre dois aparelhos', async () => {
    const tasks = [];
    for (let i = 0; i < 6; i++) tasks.push(await a.repo.createTask(emptyTaskInput({ title: `foco ${i}` })));
    await b.repo.refresh();
    const results = await Promise.allSettled(tasks.map((t, i) => (i % 2 === 0 ? a.repo : b.repo).focusTask(t.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => (r.reason as { code: string }).code === 'focus_limit')).toBe(true);
    const { data } = await a.client.from('tasks').select('id').not('focus_date', 'is', null);
    expect(data).toHaveLength(3);
  });

  it('excluir lista move as tarefas para a Entrada; ordem manual e backup funcionam', async () => {
    const list = a.store.getState().lists[0]!;
    const inList = a.store.getState().tasks.filter((t) => t.listId === list.id).length;
    expect(await a.repo.deleteList(list.id)).toEqual({ movedTasks: inList });
    await a.repo.refresh();
    expect(a.store.getState().lists).toHaveLength(0);
    expect(a.store.getState().tasks.every((t) => t.listId === null)).toBe(true);

    const pending = a.store.getState().tasks.filter((t) => t.status === 'pending' && t.deletedAt === null);
    const last = [...pending].sort((x, y) => x.position - y.position).at(-1)!;
    await a.repo.reorderTask(last.id, 'up');
    await b.repo.refresh();
    const order = (s: DataStore) =>
      s
        .getState()
        .tasks.filter((t) => t.status === 'pending' && t.deletedAt === null)
        .sort((x, y) => x.position - y.position)
        .map((t) => t.id);
    expect(order(b.store)).toEqual(order(a.store));

    const backup = await a.repo.exportBackup();
    await a.repo.createTask(emptyTaskInput({ title: 'será substituída' }));
    await a.repo.restoreBackup(backup);
    expect(a.store.getState().tasks.map((t) => t.id).sort()).toEqual(backup.tasks.map((t) => t.id).sort());

    // O mesmo backup pode ser restaurado em outra conta (ids por usuário).
    await other.repo.restoreBackup(backup);
    expect(other.store.getState().tasks).toHaveLength(backup.tasks.length);
  });
});
