import type { z } from 'zod';
import { fieldErrors } from '../domain/schemas';

export type AppErrorCode =
  | 'validation'
  | 'not_found'
  | 'focus_limit'
  | 'quota'
  | 'storage'
  | 'invalid_state';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fields: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

/** Converte qualquer falha em AppError com mensagem em português. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = (error as { name?: string } | null)?.name ?? '';
  const inner = (error as { inner?: unknown } | null)?.inner;
  const innerName = (inner as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError' || innerName === 'QuotaExceededError') {
    return new AppError(
      'quota',
      'O armazenamento do navegador está cheio. Libere espaço ou exporte seus dados e tente de novo. Nada foi apagado.',
    );
  }
  return new AppError(
    'storage',
    'Não foi possível gravar no armazenamento do navegador. Seus dados anteriores foram mantidos. Tente novamente.',
  );
}

export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    const first = Object.values(fields)[0] ?? 'Dados inválidos.';
    throw new AppError('validation', first, fields);
  }
  return result.data;
}
