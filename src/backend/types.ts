import type { DateString, FocusSession, Settings, Task, TaskList } from '../domain/types';
import type {
  ShoppingData,
  ShoppingItem,
  ShoppingList,
  ShoppingProduct,
  ShoppingPurchaseLine,
  ShoppingStore,
  ShoppingVariant,
} from '../domain/shopping/types';

export interface Snapshot {
  tasks: Task[];
  lists: TaskList[];
  focusSessions: FocusSession[];
  settings: Settings;
  shopping: ShoppingData;
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
  /* ------------------------------ Compras ------------------------------ */
  saveShoppingStore(store: ShoppingStore): Promise<void>;
  saveShoppingProduct(product: ShoppingProduct): Promise<void>;
  saveShoppingVariant(variant: ShoppingVariant): Promise<void>;
  /** Cria ou altera a lista (não muda o status para finalizada: isso é feito por finalizeShoppingList). */
  saveShoppingList(list: ShoppingList): Promise<void>;
  /** Exclui uma lista não finalizada e seus itens. */
  deleteShoppingList(id: string): Promise<void>;
  /** Grava vários itens numa só operação atômica. */
  saveShoppingItems(items: ShoppingItem[]): Promise<void>;
  deleteShoppingItem(id: string): Promise<void>;
  /** Cria uma lista com seus itens numa transação (cópias, recompras). */
  createShoppingList(list: ShoppingList, items: ShoppingItem[]): Promise<void>;
  /** Finaliza a lista numa transação. Idempotente: repetir devolve a compra já registrada. */
  finalizeShoppingList(input: FinalizeInput): Promise<string>;
  /** Cria a próxima revisão da compra, marca a anterior como substituída. Idempotente pelo 
ewId. */
  correctShoppingPurchase(input: CorrectInput): Promise<string>;
  voidShoppingPurchase(purchaseId: string, reason: string): Promise<void>;
  /** Restaura o backup numa transação. shopping null: o módulo Compras é preservado. */
  restoreBackup(input: RestoreInput): Promise<void>;
}

export interface FinalizeInput {
  listId: string;
  purchaseId: string;
  purchasedOn: DateString;
  storeId: string | null;
  budgetCents: number | null;
  globalDiscountCents: number;
  extraChargesCents: number;
  /** Lista nova com as pendências, se o usuário escolheu copiá-las. */
  nextList: { id: string; name: string } | null;
}

export interface CorrectInput {
  purchaseId: string;
  newId: string;
  reason: string;
  purchasedOn: DateString;
  storeId: string | null;
  budgetCents: number | null;
  globalDiscountCents: number;
  extraChargesCents: number;
  lines: ShoppingPurchaseLine[];
}

export interface RestoreInput {
  lists: TaskList[];
  tasks: Task[];
  focusSessions: FocusSession[];
  shopping: ShoppingData | null;
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
