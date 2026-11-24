import type { ReactNode } from 'react';
import type { Backend } from '../backend';
import { AuthScreen, NewPasswordScreen, VerifyLinkScreen } from '../features/auth/AuthScreen';
import { AuthProvider, useAuth } from './AuthContext';
import { DataProvider } from './DataContext';
import styles from './DataContext.module.css';

function Gate({ children }: { children: ReactNode }) {
  const { status, user, recovery, intent } = useAuth();
  if (intent.kind === 'verify') return <VerifyLinkScreen tokenHash={intent.tokenHash} type={intent.type} />;
  if (status === 'loading') {
    return (
      <div className={styles.centered} role="status">
        <p>Abrindo o Clareia…</p>
      </div>
    );
  }
  if (status === 'signed_out' || !user) return <AuthScreen />;
  if (recovery) return <NewPasswordScreen />;
  return <DataProvider key={user.id}>{children}</DataProvider>;
}

/** Só mostra o app com uma sessão válida; antes disso, as telas de conta. */
export function AuthGate({ backend, children }: { backend: Backend | null; children: ReactNode }) {
  if (!backend) {
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox} role="alert">
          <h1>O Clareia não está configurado</h1>
          <p>
            Faltam as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Veja o README
            para configurar.
          </p>
        </div>
      </div>
    );
  }
  return (
    <AuthProvider auth={backend.auth} initialIntent={backend.initialIntent}>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
