import type { UrlIntent } from './types';

/**
 * Interpreta o endereço de abertura vindo dos e-mails de conta:
 * - `?token_hash=…&type=email|recovery`: link próprio do app; confirma só após um toque do usuário.
 * - `#access_token=…&type=signup|recovery`: link padrão do Supabase (sessão já no fragmento).
 * - `#error=…`: link expirado ou já usado.
 */
export function readUrlIntent(location: Pick<Location, 'search' | 'hash'>): UrlIntent {
  const query = new URLSearchParams(location.search);
  const tokenHash = query.get('token_hash');
  const queryType = query.get('type');
  if (tokenHash && (queryType === 'email' || queryType === 'signup' || queryType === 'recovery')) {
    return { kind: 'verify', tokenHash, type: queryType === 'recovery' ? 'recovery' : 'email' };
  }

  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (hash.startsWith('/') || hash === '') return { kind: 'none' };
  const params = new URLSearchParams(hash);
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    const code = params.get('error_code') ?? '';
    return {
      kind: 'error',
      message:
        code === 'otp_expired'
          ? 'O link expirou ou já foi usado. Peça um novo.'
          : 'Não foi possível usar este link. Peça um novo e tente de novo.',
    };
  }
  if (params.has('access_token')) {
    return params.get('type') === 'recovery' ? { kind: 'recovery' } : { kind: 'confirmed' };
  }
  return { kind: 'none' };
}

/** Remove do endereço os parâmetros de autenticação, mantendo o app na rota inicial. */
export function clearAuthParamsFromUrl(): void {
  const { pathname, hash } = window.location;
  const route = hash.startsWith('#/') ? hash : '#/hoje';
  window.history.replaceState(null, '', `${pathname}${route}`);
}
