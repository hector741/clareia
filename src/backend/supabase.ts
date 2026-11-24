import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { SCHEMA_VERSION } from '../domain/types';
import { authFailure, toAuthFailure } from './authErrors';
import { listFromRow, listToRow, taskFromRow, taskToRow, type ListRow, type TaskRow } from './mapping';
import type { AuthApi, AuthEvent, AuthUser, Backend, Remote, Snapshot } from './types';
import { readUrlIntent } from './urlIntent';

const PAGE = 1000;

function userOf(session: Session | null): AuthUser | null {
  const user = session?.user;
  return user ? { id: user.id, email: user.email ?? '' } : null;
}

export function createSupabaseRemote(client: SupabaseClient): Remote {
  const check = (error: unknown) => {
    if (error) throw error;
  };

  async function fetchRows<T>(table: 'tasks' | 'lists'): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .order('id')
        .range(from, from + PAGE - 1);
      check(error);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) return rows;
    }
  }

  return {
    async fetchAll(): Promise<Snapshot> {
      const [taskRows, listRows, settingsResult] = await Promise.all([
        fetchRows<TaskRow>('tasks'),
        fetchRows<ListRow>('lists'),
        client.from('user_settings').select('last_export_generated_at').maybeSingle(),
      ]);
      check(settingsResult.error);
      const exported = (settingsResult.data as { last_export_generated_at: string | null } | null)
        ?.last_export_generated_at;
      return {
        tasks: taskRows.map(taskFromRow),
        lists: listRows.map(listFromRow).sort((a, b) => a.position - b.position),
        settings: {
          id: 'app',
          schemaVersion: SCHEMA_VERSION,
          ...(exported ? { lastExportGeneratedAt: new Date(exported).toISOString() } : {}),
        },
      };
    },
    async saveTask(task) {
      const { error } = await client.from('tasks').upsert(taskToRow(task), { onConflict: 'user_id,id' });
      check(error);
    },
    async deleteTask(id) {
      const { error } = await client.from('tasks').delete().eq('id', id);
      check(error);
    },
    async saveList(list) {
      const { error } = await client.from('lists').upsert(listToRow(list), { onConflict: 'user_id,id' });
      check(error);
    },
    async deleteList(id) {
      const { data, error } = await client.rpc('delete_list', { p_list_id: id });
      check(error);
      return Number(data ?? 0);
    },
    async setPositions(ids) {
      const { error } = await client.rpc('set_task_positions', { p_ids: ids });
      check(error);
    },
    async importData(lists, tasks, replace) {
      const { error } = await client.rpc('import_data', {
        p_lists: lists.map(listToRow),
        p_tasks: tasks.map(taskToRow),
        p_replace: replace,
      });
      check(error);
    },
    async saveSettings(settings) {
      const { error } = await client.from('user_settings').upsert(
        { last_export_generated_at: settings.lastExportGeneratedAt ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      check(error);
    },
  };
}

export function createSupabaseAuth(client: SupabaseClient): AuthApi {
  const run = async <R extends { data: unknown; error: unknown }>(fn: () => Promise<R>): Promise<R['data']> => {
    let result: R;
    try {
      result = await fn();
    } catch (error) {
      throw toAuthFailure(error);
    }
    if (result.error) throw toAuthFailure(result.error);
    return result.data;
  };

  return {
    async getUser() {
      const data = await run(() => client.auth.getSession());
      return userOf(data.session);
    },
    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const map: Partial<Record<string, AuthEvent>> = {
          SIGNED_IN: 'signed_in',
          SIGNED_OUT: 'signed_out',
          PASSWORD_RECOVERY: 'password_recovery',
          USER_UPDATED: 'user_updated',
        };
        const mapped = map[event];
        if (mapped) callback(mapped, userOf(session));
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      await run(() => client.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password, redirectTo) {
      const data = await run(() => client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
      return { needsConfirmation: data.session === null };
    },
    async resendConfirmation(email, redirectTo) {
      await run(() => client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } }));
    },
    async requestPasswordReset(email, redirectTo) {
      await run(() => client.auth.resetPasswordForEmail(email, { redirectTo }));
    },
    async updatePassword(password) {
      await run(() => client.auth.updateUser({ password }));
    },
    async verifyLink(tokenHash, type) {
      await run(() => client.auth.verifyOtp({ token_hash: tokenHash, type }));
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw toAuthFailure(error);
    },
  };
}

export function createSupabaseBackend(url: string | undefined, key: string | undefined): Backend {
  if (!url || !key) throw authFailure('unknown');
  // Lido antes de criar o cliente: ele processa e limpa o fragmento do endereço.
  const initialIntent = readUrlIntent(window.location);
  const client = createClient(url, key, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return { kind: 'supabase', auth: createSupabaseAuth(client), remote: createSupabaseRemote(client), initialIntent };
}
