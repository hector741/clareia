import { SCHEMA_VERSION, MAX_FOCUS, type FocusSession, type Settings, type Task, type TaskList } from '../domain/types';
import { EMPTY_SHOPPING, type ShoppingData } from '../domain/shopping/types';
import { authFailure } from './authErrors';
import { assertShoppingIntegrity, createMemoryShopping } from './memoryShopping';
import type { AuthApi, AuthEvent, AuthUser, Backend, Remote, Snapshot } from './types';
import { readUrlIntent } from './urlIntent';

/**
 * Servidor simulado, com as mesmas regras do banco (limite de foco, lista existente,
 * exclusão de lista movendo tarefas). Usado nos testes; nunca em produção.
 */

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKeyValue(): KeyValue {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

export interface MemoryControls {
  /** Quando verdadeiro, toda gravação falha como se não houvesse conexão. */
  failWrites: boolean;
}

interface Data {
  tasks: Task[];
  lists: TaskList[];
  focusSessions: FocusSession[];
  settings: Settings;
  shopping: ShoppingData;
}

const emptyData = (): Data => ({
  tasks: [],
  lists: [],
  focusSessions: [],
  settings: { id: 'app', schemaVersion: SCHEMA_VERSION },
  shopping: structuredClone(EMPTY_SHOPPING),
});

function dbError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export function createMemoryRemote(kv: KeyValue, userId: () => string, controls: MemoryControls): Remote {
  const key = () => `clareia-memory:data:${userId()}`;
  const load = (): Data => {
    const raw = kv.get(key());
    if (!raw) return emptyData();
    const saved = JSON.parse(raw) as Partial<Data>;
    return { ...emptyData(), ...saved, shopping: { ...structuredClone(EMPTY_SHOPPING), ...(saved.shopping ?? {}) } };
  };
  const sessionTaskExists = (data: Data, session: FocusSession) => {
    if (!data.tasks.some((t) => t.id === session.taskId)) {
      throw dbError('insert or update on table "focus_sessions" violates foreign key constraint', '23503');
    }
  };
  const store = (data: Data) => kv.set(key(), JSON.stringify(data));
  const write = async <T>(fn: (data: Data) => T): Promise<T> => {
    await Promise.resolve();
    if (controls.failWrites) throw new TypeError('Failed to fetch');
    const data = structuredClone(load());
    const result = fn(data);
    store(data);
    return result;
  };

  const assertTask = (data: Data, task: Task) => {
    if (task.listId !== null && !data.lists.some((l) => l.id === task.listId)) {
      throw dbError('insert or update on table "tasks" violates foreign key constraint', '23503');
    }
    if (task.focusDate !== null) {
      const previous = data.tasks.find((t) => t.id === task.id);
      if (previous?.focusDate !== task.focusDate) {
        const others = data.tasks.filter(
          (t) => t.id !== task.id && t.focusDate === task.focusDate && t.status === 'pending' && t.deletedAt === null,
        );
        if (others.length >= MAX_FOCUS) throw dbError('focus_limit', 'P0001');
      }
    }
  };

  const shoppingOps = createMemoryShopping(write);

  return {
    ...shoppingOps,
    async fetchAll(): Promise<Snapshot> {
      await Promise.resolve();
      const data = load();
      return { ...data, lists: [...data.lists].sort((a, b) => a.position - b.position) };
    },
    saveTask: (task) =>
      write((data) => {
        assertTask(data, task);
        const i = data.tasks.findIndex((t) => t.id === task.id);
        if (i >= 0) data.tasks[i] = task;
        else data.tasks.push(task);
      }),
    deleteTask: (id) =>
      write((data) => {
        data.tasks = data.tasks.filter((t) => t.id !== id);
        data.focusSessions = data.focusSessions.filter((s) => s.taskId !== id);
      }),
    saveFocusSession: (session) =>
      write((data) => {
        if (data.focusSessions.some((s) => s.id === session.id)) return;
        sessionTaskExists(data, session);
        data.focusSessions.push(session);
      }),
    saveList: (list) =>
      write((data) => {
        const i = data.lists.findIndex((l) => l.id === list.id);
        if (i >= 0) data.lists[i] = list;
        else data.lists.push(list);
      }),
    deleteList: (id) =>
      write((data) => {
        if (!data.lists.some((l) => l.id === id)) throw dbError('not_found', 'P0002');
        let max = Math.max(0, ...data.tasks.filter((t) => t.listId === null).map((t) => t.position));
        const moved = data.tasks
          .filter((t) => t.listId === id)
          .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
        const now = new Date().toISOString();
        for (const t of moved) {
          max += 1;
          Object.assign(t, { listId: null, position: max, updatedAt: now });
        }
        data.lists = data.lists.filter((l) => l.id !== id);
        return moved.length;
      }),
    setPositions: (ids) =>
      write((data) => {
        ids.forEach((id, index) => {
          const t = data.tasks.find((x) => x.id === id);
          if (t) t.position = index + 1;
        });
      }),
    importData: (lists, tasks, replace, focusSessions = []) =>
      write((data) => {
        if (replace) {
          data.tasks = [];
          data.lists = [];
          data.focusSessions = [];
        }
        for (const l of lists) if (!data.lists.some((x) => x.id === l.id)) data.lists.push(l);
        for (const t of tasks) {
          if (data.tasks.some((x) => x.id === t.id)) continue;
          assertTask(data, t);
          data.tasks.push(t);
        }
        for (const s of focusSessions) {
          if (data.focusSessions.some((x) => x.id === s.id)) continue;
          sessionTaskExists(data, s);
          data.focusSessions.push(s);
        }
      }),
    saveSettings: (settings) =>
      write((data) => {
        data.settings = settings;
      }),
    restoreBackup: ({ lists, tasks, focusSessions, shopping }) =>
      write((data) => {
        for (const task of tasks) {
          if (task.listId !== null && !lists.some((l) => l.id === task.listId)) {
            throw dbError('insert or update on table "tasks" violates foreign key constraint', '23503');
          }
        }
        if (shopping) assertShoppingIntegrity(shopping);
        data.tasks = structuredClone(tasks);
        data.lists = structuredClone(lists);
        data.focusSessions = structuredClone(focusSessions);
        if (shopping) data.shopping = structuredClone(shopping);
      }),
  };
}

interface MemoryUser {
  id: string;
  password: string;
  confirmed: boolean;
}

const USERS = 'clareia-memory:users';
const SESSION = 'clareia-memory:session';

export function createMemoryAuth(kv: KeyValue): AuthApi & { current(): AuthUser | null } {
  const listeners = new Set<(event: AuthEvent, user: AuthUser | null) => void>();
  const users = (): Record<string, MemoryUser> => JSON.parse(kv.get(USERS) ?? '{}') as Record<string, MemoryUser>;
  const saveUsers = (u: Record<string, MemoryUser>) => kv.set(USERS, JSON.stringify(u));
  const current = (): AuthUser | null => {
    const raw = kv.get(SESSION);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  };
  const emit = (event: AuthEvent, user: AuthUser | null) => listeners.forEach((l) => l(event, user));
  const startSession = (email: string, event: AuthEvent = 'signed_in') => {
    const u = users()[email];
    if (!u) throw authFailure('invalid_credentials');
    const user = { id: u.id, email };
    kv.set(SESSION, JSON.stringify(user));
    emit(event, user);
  };
  const normalize = (email: string) => email.trim().toLowerCase();
  const tick = () => new Promise((r) => setTimeout(r, 0));

  return {
    current,
    async getUser() {
      await tick();
      return current();
    },
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async signIn(email, password) {
      await tick();
      const u = users()[normalize(email)];
      if (!u || u.password !== password) throw authFailure('invalid_credentials');
      if (!u.confirmed) throw authFailure('email_not_confirmed');
      startSession(normalize(email));
    },
    async signUp(email, password) {
      await tick();
      const e = normalize(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw authFailure('invalid_email');
      if (password.length < 8) throw authFailure('weak_password');
      const all = users();
      if (!all[e]) {
        all[e] = { id: crypto.randomUUID(), password, confirmed: false };
        saveUsers(all);
      }
      return { needsConfirmation: true };
    },
    async resendConfirmation() {
      await tick();
    },
    async requestPasswordReset() {
      await tick();
    },
    async updatePassword(password) {
      await tick();
      const user = current();
      if (!user) throw authFailure('session_missing');
      const all = users();
      const u = all[user.email];
      if (!u) throw authFailure('session_missing');
      if (u.password === password) throw authFailure('same_password');
      u.password = password;
      saveUsers(all);
      emit('user_updated', user);
    },
    /** No simulador, o "token" do link é `memory:<email>`. */
    async verifyLink(tokenHash, type) {
      await tick();
      const email = tokenHash.startsWith('memory:') ? tokenHash.slice('memory:'.length) : '';
      const all = users();
      const u = all[email];
      if (!u) throw authFailure('link_invalid');
      u.confirmed = true;
      saveUsers(all);
      startSession(email, type === 'recovery' ? 'password_recovery' : 'signed_in');
    },
    async signOut() {
      await tick();
      kv.remove(SESSION);
      emit('signed_out', null);
    },
  };
}

export function createMemoryBackend(kv: KeyValue, controls: MemoryControls = { failWrites: false }): Backend {
  const auth = createMemoryAuth(kv);
  const remote = createMemoryRemote(kv, () => auth.current()?.id ?? 'anon', controls);
  const initialIntent = typeof window === 'undefined' ? ({ kind: 'none' } as const) : readUrlIntent(window.location);
  return { kind: 'memory', auth, remote, initialIntent };
}
