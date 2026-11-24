import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { repo, store, toAppError } from '../db';
import type { FocusSession, Task, TaskList } from '../domain/types';
import { Button } from '../components/ui/Button';
import styles from './DataContext.module.css';

interface DataValue {
  tasks: Task[];
  lists: TaskList[];
  listsById: Map<string, TaskList>;
  focusSessions: FocusSession[];
}

const DataContext = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData fora do DataProvider');
  return value;
}

const REFRESH_MS = 60_000;

/** Mantém a cópia local em dia com o servidor (outros aparelhos), sem atrapalhar gravações. */
function useBackgroundRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') repo.refresh().catch(() => undefined);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);
}

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

/**
 * Carrega os dados da conta ao entrar e os entrega às telas. Deve ser montado
 * uma vez por usuário (use `key={user.id}`); ao desmontar, a cópia local é limpa.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    let cancelled = false;
    repo
      .load()
      .then(() => {
        if (!cancelled) setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: toAppError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => () => store.reset(), []);

  useBackgroundRefresh(load.status === 'ready');

  const value = useMemo<DataValue>(
    () => ({
      tasks: state.tasks,
      lists: state.lists,
      listsById: new Map(state.lists.map((l) => [l.id, l])),
      focusSessions: state.focusSessions,
    }),
    [state.tasks, state.lists, state.focusSessions],
  );

  if (load.status === 'loading') {
    return (
      <div className={styles.centered} role="status">
        <p>Carregando suas tarefas…</p>
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox} role="alert">
          <h1>Não foi possível carregar suas tarefas</h1>
          <p>Verifique sua conexão com a internet. Nenhum dado foi apagado.</p>
          <p className={styles.detail}>{load.message}</p>
          <Button
            variant="primary"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** Usado em Configurações para mostrar a data da última exportação. */
export function useSettings() {
  return useSyncExternalStore(store.subscribe, store.getState).settings;
}
