import { z } from 'zod';
import { isValidDateString } from './dates';
import {
  LIMITS,
  LIST_COLORS,
  PRIORITIES,
  SCHEMA_VERSION,
  TASK_STATUSES,
  type Settings,
  type Subtask,
  type Task,
  type TaskList,
} from './types';

z.config(z.locales.pt());

const MSG = {
  titleRequired: 'Escreva um título para a tarefa.',
  titleTooLong: `O título pode ter no máximo ${LIMITS.taskTitle} caracteres.`,
  descriptionTooLong: `A descrição pode ter no máximo ${LIMITS.description} caracteres.`,
  stepRequired: 'Escreva um título para a etapa ou remova-a.',
  stepTooLong: `O título da etapa pode ter no máximo ${LIMITS.subtaskTitle} caracteres.`,
  listNameRequired: 'Escreva um nome para a lista.',
  listNameTooLong: `O nome pode ter no máximo ${LIMITS.listName} caracteres.`,
  invalidDate: 'Escolha uma data válida.',
} as const;

export const dateStringSchema = z.string().refine(isValidDateString, MSG.invalidDate);
const nullableDate = dateStringSchema.nullable();
const isoInstant = z.iso.datetime({ offset: true });
const uuid = z.uuid();
const finiteNumber = z.number().finite();

/** Valor persistido: o título já deve estar aparado (sem espaços nas pontas). */
function storedText(max: number, requiredMsg: string, tooLongMsg: string) {
  return z
    .string()
    .refine((v) => v.trim() === v && v.length > 0, requiredMsg)
    .refine((v) => v.length <= max, tooLongMsg);
}

export const subtaskSchema: z.ZodType<Subtask> = z.strictObject({
  id: uuid,
  title: storedText(LIMITS.subtaskTitle, MSG.stepRequired, MSG.stepTooLong),
  completed: z.boolean(),
  position: finiteNumber,
});

export const taskSchema: z.ZodType<Task> = z
  .strictObject({
    id: uuid,
    title: storedText(LIMITS.taskTitle, MSG.titleRequired, MSG.titleTooLong),
    description: z.string().max(LIMITS.description, MSG.descriptionTooLong),
    listId: uuid.nullable(),
    priority: z.enum(PRIORITIES),
    status: z.enum(TASK_STATUSES),
    plannedDate: nullableDate,
    dueDate: nullableDate,
    focusDate: nullableDate,
    position: finiteNumber,
    subtasks: z.array(subtaskSchema),
    createdAt: isoInstant,
    updatedAt: isoInstant,
    completedAt: isoInstant.nullable(),
    completedOn: nullableDate,
    deletedAt: isoInstant.nullable(),
  })
  .superRefine((task, ctx) => {
    if (task.status === 'pending') {
      if (task.completedAt !== null || task.completedOn !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Tarefa pendente não pode ter dados de conclusão.',
        });
      }
    } else {
      if (task.completedAt === null || task.completedOn === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Tarefa concluída precisa de completedAt e completedOn.',
        });
      }
      if (task.focusDate !== null) {
        ctx.addIssue({ code: 'custom', path: ['focusDate'], message: 'Tarefa concluída não pode estar em foco.' });
      }
    }
    if (task.deletedAt !== null && task.focusDate !== null) {
      ctx.addIssue({ code: 'custom', path: ['focusDate'], message: 'Tarefa excluída não pode estar em foco.' });
    }
    const seen = new Set<string>();
    for (const [i, s] of task.subtasks.entries()) {
      if (seen.has(s.id)) {
        ctx.addIssue({ code: 'custom', path: ['subtasks', i, 'id'], message: 'IDs de etapas duplicados.' });
      }
      seen.add(s.id);
    }
  });

export const taskListSchema: z.ZodType<TaskList> = z.strictObject({
  id: uuid,
  name: storedText(LIMITS.listName, MSG.listNameRequired, MSG.listNameTooLong),
  color: z.enum(LIST_COLORS),
  position: finiteNumber,
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

export const settingsSchema: z.ZodType<Settings> = z.strictObject({
  id: z.literal('app'),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  lastExportGeneratedAt: isoInstant.optional(),
});

/* ---------- Entradas de formulário (aparam e validam) ---------- */

const inputTitle = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, MSG.titleRequired).max(LIMITS.taskTitle, MSG.titleTooLong));

export const subtaskInputSchema = z.object({
  id: uuid,
  title: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, MSG.stepRequired).max(LIMITS.subtaskTitle, MSG.stepTooLong)),
  completed: z.boolean(),
});

export const taskInputSchema = z.object({
  title: inputTitle,
  description: z.string().max(LIMITS.description, MSG.descriptionTooLong),
  listId: uuid.nullable(),
  priority: z.enum(PRIORITIES),
  plannedDate: nullableDate,
  dueDate: nullableDate,
  subtasks: z.array(subtaskInputSchema),
});

export type TaskInput = z.input<typeof taskInputSchema>;
export type ParsedTaskInput = z.output<typeof taskInputSchema>;

export const listInputSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, MSG.listNameRequired).max(LIMITS.listName, MSG.listNameTooLong)),
  color: z.enum(LIST_COLORS, { error: 'Escolha uma cor da paleta.' }),
});

export type ListInput = z.input<typeof listInputSchema>;
export type ParsedListInput = z.output<typeof listInputSchema>;

export const quickTitleSchema = inputTitle;

/** Converte problemas do Zod em um mapa caminho -> primeira mensagem. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
