import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearAuthParamsFromUrl, type AuthApi, type AuthUser, type UrlIntent } from '../backend';

type Status = 'loading' | 'signed_out' | 'signed_in';

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  auth: AuthApi;
  /** Veio de um link de redefinição: pedir a nova senha antes de abrir o app. */
  recovery: boolean;
  endRecovery: () => void;
  /** Link de e-mail ainda não tratado (confirmação por toque, erro ou aviso). */
  intent: UrlIntent;
  clearIntent: () => void;
  /** Endereço para onde os e-mails de conta devem trazer o usuário. */
  redirectTo: string;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth fora do AuthProvider');
  return value;
}

export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser sem sessão');
  return user;
}

export function AuthProvider({ auth, initialIntent, children }: { auth: AuthApi; initialIntent: UrlIntent; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recovery, setRecovery] = useState(initialIntent.kind === 'recovery');
  const [intent, setIntent] = useState<UrlIntent>(initialIntent);

  useEffect(() => {
    let active = true;
    const unsubscribe = auth.onChange((event, next) => {
      if (!active) return;
      if (event === 'password_recovery') setRecovery(true);
      if (event === 'signed_out' || !next) {
        window.history.replaceState(null, '', `${window.location.pathname}#/hoje`);
        setUser(null);
        setStatus('signed_out');
        setRecovery(false);
        return;
      }
      setUser((prev) => (prev?.id === next.id && prev.email === next.email ? prev : next));
      setStatus('signed_in');
    });
    auth
      .getUser()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setStatus(current ? 'signed_in' : 'signed_out');
        if (initialIntent.kind !== 'verify' && initialIntent.kind !== 'none') clearAuthParamsFromUrl();
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('signed_out');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth, initialIntent]);

  const endRecovery = useCallback(() => setRecovery(false), []);
  const clearIntent = useCallback(() => {
    setIntent({ kind: 'none' });
    clearAuthParamsFromUrl();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      auth,
      recovery,
      endRecovery,
      intent,
      clearIntent,
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    }),
    [status, user, auth, recovery, endRecovery, intent, clearIntent],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
