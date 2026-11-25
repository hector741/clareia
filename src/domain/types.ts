/** Data de calendário sem horário, no formato YYYY-MM-DD (data civil do usuário). */
export type DateString = string;
/** Instante em ISO 8601. */
export type IsoInstant = string;

import type { ShoppingData } from './shopping/types';

export const PRIORITIES = ['normal', 'important', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_STATUSES = ['pending', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const LIST_COLORS = ['green', 'blue', 'violet', 'amber', 'pink', 'gray'] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  listId: string | null;
  priority: Priority;
  status: TaskStatus;
  plannedDate: DateString | null;
  dueDate: DateString | null;
  focusDate: DateString | null;
  position: number;
  subtasks: Subtask[];
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  completedAt: IsoInstant | null;
  completedOn: DateString | null;
  deletedAt: IsoInstant | null;
}

export interface TaskList {
  id: string;
  name: string;
  color: ListColor;
  position: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/** `pomodoro`: sessão de foco completa. `extra`: tempo adicional mais curto, pedido ao continuar. */
export const FOCUS_KINDS = ['pomodoro', 'extra'] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];

/** Sessão de foco que chegou ao fim (sessões encerradas antes da hora não são registradas). */
export interface FocusSession {
  id: string;
  taskId: string;
  kind: FocusKind;
  durationSeconds: number;
  endedAt: IsoInstant;
}

export interface Settings {
  id: 'app';
  schemaVersion: number;
  lastExportGeneratedAt?: IsoInstant;
}

export interface BackupFile {
  app: 'clareia';
  /** 1: tarefas e Pomodoro. 2: acrescenta o bloco `shopping` (módulo Compras). */
  schemaVersion: 1 | 2;
  exportedAt: IsoInstant;
  lists: TaskList[];
  tasks: Task[];
  /** Ausente em backups anteriores ao Pomodoro. */
  focusSessions?: FocusSession[];
  /** Presente a partir da versão 2 do formato. Ausente em backups antigos (não apaga compras atuais). */
  shopping?: ShoppingData;
  settings: Settings;
}

/** Versão do formato de backup escrita por esta versão do app. */
export const BACKUP_VERSION = 2;
/** Versões do formato de backup que esta versão do app aceita. */
export const SUPPORTED_BACKUP_VERSIONS: readonly number[] = [1, 2];

export const SCHEMA_VERSION = 1;
export const MAX_FOCUS = 3;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export const LIMITS = {
  taskTitle: 200,
  description: 4000,
  subtaskTitle: 200,
  listName: 80,
} as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: 'Normal',
  important: 'Importante',
  high: 'Alta',
};

export const LIST_COLOR_LABELS: Record<ListColor, string> = {
  green: 'Verde',
  blue: 'Azul',
  violet: 'Violeta',
  amber: 'Âmbar',
  pink: 'Rosa',
  gray: 'Cinza',
};

export const FOCUS_LIMIT_MESSAGE = 'Você já tem 3 tarefas em foco. Retire uma para escolher outra.';
