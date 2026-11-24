export type AuthFailureCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limit'
  | 'link_invalid'
  | 'same_password'
  | 'session_missing'
  | 'network'
  | 'unknown';

/** Falha de autenticação com mensagem pronta para o usuário (pt-BR). */
export class AuthFailure extends Error {
  readonly code: AuthFailureCode;

  constructor(code: AuthFailureCode, message: string) {
    super(message);
    this.name = 'AuthFailure';
    this.code = code;
  }
}

const MESSAGES: Record<AuthFailureCode, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos (veja também o spam).',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  invalid_email: 'Digite um e-mail válido.',
  rate_limit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  link_invalid: 'O link expirou ou já foi usado. Peça um novo.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  session_missing: 'Sua sessão expirou. Entre novamente.',
  network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  unknown: 'Não foi possível concluir agora. Tente de novo em instantes.',
};

export function authFailure(code: AuthFailureCode): AuthFailure {
  return new AuthFailure(code, MESSAGES[code]);
}

/** Converte erros do Supabase Auth (ou de rede) em AuthFailure. */
export function toAuthFailure(error: unknown): AuthFailure {
  if (error instanceof AuthFailure) return error;
  const e = (error ?? {}) as { code?: string; name?: string; message?: string; status?: number };
  const code = e.code ?? '';
  const message = (e.message ?? '').toLowerCase();
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || message.includes('failed to fetch')) {
    return authFailure('network');
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return authFailure('invalid_credentials');
  }
  if (code === 'email_not_confirmed') return authFailure('email_not_confirmed');
  if (code === 'weak_password' || message.includes('password should')) return authFailure('weak_password');
  if (code === 'email_address_invalid' || code === 'validation_failed') return authFailure('invalid_email');
  if (code.startsWith('over_') || e.status === 429) return authFailure('rate_limit');
  if (code === 'otp_expired' || code === 'flow_state_expired' || message.includes('expired') || message.includes('invalid')) {
    return authFailure('link_invalid');
  }
  if (code === 'same_password') return authFailure('same_password');
  if (code === 'session_not_found' || code === 'session_expired' || e.name === 'AuthSessionMissingError') {
    return authFailure('session_missing');
  }
  return authFailure('unknown');
}
