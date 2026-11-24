import type { z } from 'zod';
import { fieldErrors } from '../domain/schemas';
import { FOCUS_LIMIT_MESSAGE } from '../domain/types';

export type AppErrorCode =
  | 'validation'
  | 'not_found'
  | 'focus_limit'
  | 'quota'
  | 'storage'
  | 'network'
  | 'auth'
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

/** Converte qualquer falha (validação, servidor, rede) em AppError com mensagem em português. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as { name?: string; message?: string; code?: string; status?: number };
  const message = e.message ?? '';
  const code = e.code ?? '';

  if (message.includes('focus_limit')) return new AppError('focus_limit', FOCUS_LIMIT_MESSAGE);
  if (e.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(message)) {
    return new AppError(
      'network',
      'Sem conexão com o servidor. A alteração não foi salva; verifique a internet e tente de novo.',
    );
  }
  if (code === 'PGRST301' || code === 'PGRST303' || e.status === 401 || /jwt/i.test(message)) {
    return new AppError('auth', 'Sua sessão expirou. Entre novamente para continuar.');
  }
  if (code === '23503' || code === 'P0002' || message === 'not_found') {
    return new AppError('not_found', 'Este item não existe mais. A tela foi atualizada.');
  }
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008') {
    return new AppError('validation', 'Os dados foram recusados pelo servidor por estarem fora do formato esperado.');
  }
  if (code === '54000' || code === '53100') {
    return new AppError('quota', 'O espaço da conta está cheio. Nada foi alterado.');
  }
  return new AppError(
    'storage',
    'Não foi possível salvar na sua conta. Seus dados anteriores foram mantidos. Tente novamente.',
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
