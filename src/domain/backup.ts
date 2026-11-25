import { z } from 'zod';
import { focusSessionSchema, settingsSchema, taskListSchema, taskSchema } from './schemas';
import { countFocused } from './today';
import {
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  MAX_FOCUS,
  SUPPORTED_BACKUP_VERSIONS,
  type BackupFile,
  type DateString,
} from './types';
import { shoppingIntegrityErrors } from './shopping/integrity';
import { itemSchema, listSchema as shoppingListSchema, productSchema, purchaseSchema, storeSchema, variantSchema } from './shopping/schemas';
import type { ShoppingData } from './shopping/types';

const shoppingDataSchema: z.ZodType<ShoppingData> = z.strictObject({
  stores: z.array(storeSchema),
  products: z.array(productSchema),
  variants: z.array(variantSchema),
  lists: z.array(shoppingListSchema),
  items: z.array(itemSchema),
  purchases: z.array(purchaseSchema),
}) as unknown as z.ZodType<ShoppingData>;

const backupSchema = z
  .strictObject({
    app: z.literal('clareia', { error: 'O arquivo não é um backup do Clareia (campo "app" ausente ou diferente de "clareia").' }),
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    exportedAt: z.iso.datetime({ offset: true }),
    lists: z.array(taskListSchema),
    tasks: z.array(taskSchema),
    focusSessions: z.array(focusSessionSchema).optional(),
    shopping: shoppingDataSchema.optional(),
    settings: settingsSchema,
  })
  .superRefine((backup, ctx) => {
    if (backup.schemaVersion === 2 && backup.shopping === undefined) {
      ctx.addIssue({ code: 'custom', path: ['shopping'], message: 'Backups da versão 2 precisam do bloco "shopping" (pode estar vazio).' });
    }
    if (backup.schemaVersion === 1 && backup.shopping !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['shopping'], message: 'Backups da versão 1 não têm o bloco "shopping".' });
    }
  }) as unknown as z.ZodType<BackupFile>;

export interface ShoppingSummary {
  lists: number;
  activeLists: number;
  finishedLists: number;
  purchases: number;
  voided: number;
}

export interface BackupSummary {
  lists: number;
  pending: number;
  completed: number;
  trashed: number;
  exportedAt: string;
  /** Ausente em backups da versão 1: o módulo Compras é preservado. */
  shopping: ShoppingSummary | null;
}

export type BackupParseResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; errors: string[] };

const MAX_REPORTED_ERRORS = 8;

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return 'arquivo';
  const [root, index, ...rest] = path;
  const rootLabels: Record<string, string> = {
    tasks: 'Tarefa',
    lists: 'Lista',
    focusSessions: 'Sessão de foco',
    shopping: 'Compras',
  };
  const rootLabel = rootLabels[String(root)] ?? String(root);
  if (typeof index === 'number') {
    const tail = rest.length ? ` (${rest.map(String).join('.')})` : '';
    return `${rootLabel} nº ${index + 1}${tail}`;
  }
  return [root, index, ...rest].filter((p) => p !== undefined).map(String).join('.');
}

export function summarize(backup: BackupFile): BackupSummary {
  let pending = 0;
  let completed = 0;
  let trashed = 0;
  for (const task of backup.tasks) {
    if (task.deletedAt !== null) trashed += 1;
    else if (task.status === 'completed') completed += 1;
    else pending += 1;
  }
  const shopping = backup.shopping
    ? {
        lists: backup.shopping.lists.length,
        activeLists: backup.shopping.lists.filter((l) => l.status !== 'finished').length,
        finishedLists: backup.shopping.lists.filter((l) => l.status === 'finished').length,
        purchases: backup.shopping.purchases.filter((p) => p.status === 'active').length,
        voided: backup.shopping.purchases.filter((p) => p.status === 'voided').length,
      }
    : null;
  return { lists: backup.lists.length, pending, completed, trashed, exportedAt: backup.exportedAt, shopping };
}

/** Validação integral do conteúdo de um backup já convertido de JSON. */
export function validateBackup(data: unknown, today: DateString): BackupParseResult {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (
      record.app === 'clareia' &&
      typeof record.schemaVersion === 'number' &&
      !SUPPORTED_BACKUP_VERSIONS.includes(record.schemaVersion) &&
      record.schemaVersion > BACKUP_VERSION
    ) {
      return {
        ok: false,
        errors: [
          `Este arquivo usa a versão ${record.schemaVersion} do formato, mais nova do que esta aplicação entende (versão ${BACKUP_VERSION}). Nada foi alterado.`,
        ],
      };
    }
  }

  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
    return { ok: false, errors: limitErrors(errors) };
  }

  const backup = parsed.data;
  const errors: string[] = [];

  const listIds = new Set<string>();
  for (const [i, list] of backup.lists.entries()) {
    if (listIds.has(list.id)) errors.push(`Lista nº ${i + 1}: ID duplicado (${list.id}).`);
    listIds.add(list.id);
  }
  const taskIds = new Set<string>();
  for (const [i, task] of backup.tasks.entries()) {
    if (taskIds.has(task.id)) errors.push(`Tarefa nº ${i + 1}: ID duplicado (${task.id}).`);
    taskIds.add(task.id);
    if (task.listId !== null && !listIds.has(task.listId)) {
      errors.push(`Tarefa nº ${i + 1} ("${task.title}"): aponta para uma lista que não existe no arquivo.`);
    }
  }
  const sessionIds = new Set<string>();
  for (const [i, session] of (backup.focusSessions ?? []).entries()) {
    if (sessionIds.has(session.id)) errors.push(`Sessão de foco nº ${i + 1}: ID duplicado (${session.id}).`);
    sessionIds.add(session.id);
    if (!taskIds.has(session.taskId)) {
      errors.push(`Sessão de foco nº ${i + 1}: aponta para uma tarefa que não existe no arquivo.`);
    }
  }
  if (countFocused(backup.tasks, today) > MAX_FOCUS) {
    errors.push(`O arquivo tem mais de ${MAX_FOCUS} tarefas pendentes em foco na data de hoje.`);
  }
  if (backup.shopping) {
    errors.push(...shoppingIntegrityErrors(backup.shopping).map((message) => `Compras: ${message}`));
  }

  if (errors.length > 0) return { ok: false, errors: limitErrors(errors) };
  return { ok: true, backup, summary: summarize(backup) };
}

function limitErrors(errors: string[]): string[] {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors;
  return [...errors.slice(0, MAX_REPORTED_ERRORS), `… e mais ${errors.length - MAX_REPORTED_ERRORS} problema(s).`];
}

/** Lê o texto do arquivo, converte o JSON e valida tudo antes de qualquer escrita. */
export function parseBackupText(text: string, today: DateString): BackupParseResult {
  if (text.length > MAX_BACKUP_BYTES) {
    return { ok: false, errors: ['O arquivo é maior que 10 MiB.'] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
  }
  return validateBackup(data, today);
}

export function backupFileName(today: DateString): string {
  return `clareia-backup-${today}.json`;
}
