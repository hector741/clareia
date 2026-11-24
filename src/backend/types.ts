import type { FocusSession, Settings, Task, TaskList } from '../domain/types';

export interface Snapshot {
  tasks: Task[];
  lists: TaskList[];
  focusSessions: FocusSession[];
  settings: Settings;
}

/** Persistência remota da conta. Cada operação é atômica no servidor. */
export interface Remote {
  fetchAll(): Promise<Snapshot>;
  /** Cria ou substitui a tarefa inteira. */
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  saveList(list: TaskList): Promise<void>;
  /** Exclui a lista e move todas as suas tarefas para a Entrada. Devolve quantas foram movidas. */
  deleteList(id: string): Promise<number>;
  /** Grava a ordem manual: posição = índice + 1. */
  setPositions(ids: string[]): Promise<void>;
  /** Importa numa única transação. `replace` apaga tudo antes; senão acrescenta sem sobrescrever. */
  importData(lists: TaskList[], tasks: Task[], replace: boolean, focusSessions?: FocusSession[]): Promise<void>;
  /** Registra uma sessão de foco concluída. Repetir o mesmo `id` não duplica o registro. */
  saveFocusSession(session: FocusSession): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
}

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthEvent = 'signed_in' | 'signed_out' | 'password_recovery' | 'user_updated';

/** Intenção trazida pelo endereço ao abrir o app (links dos e-mails de conta). */
export type UrlIntent =
  | { kind: 'none' }
  | { kind: 'verify'; tokenHash: string; type: 'email' | 'recovery' }
  | { kind: 'confirmed' }
  | { kind: 'recovery' }
  | { kind: 'error'; message: string };

export interface AuthApi {
  /** Sessão atual, depois de processar um eventual link de e-mail no endereço. */
  getUser(): Promise<AuthUser | null>;
  onChange(callback: (event: AuthEvent, user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** `needsConfirmation`: a conta só pode ser usada depois de confirmar o e-mail. */
  signUp(email: string, password: string, redirectTo: string): Promise<{ needsConfirmation: boolean }>;
  resendConfirmation(email: string, redirectTo: string): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  verifyLink(tokenHash: string, type: 'email' | 'recovery'): Promise<void>;
  signOut(): Promise<void>;
}

export interface Backend {
  kind: 'supabase' | 'memory';
  auth: AuthApi;
  remote: Remote;
  /** Lido uma vez, antes que o cliente limpe o endereço. */
  initialIntent: UrlIntent;
}
