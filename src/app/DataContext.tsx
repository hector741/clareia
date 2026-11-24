import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db';
import type { Task, TaskList } from '../domain/types';
import { Button } from '../components/ui/Button';
import styles from './DataContext.module.css';

interface DataValue {
  tasks: Task[];
  lists: TaskList[];
  listsById: Map<string, TaskList>;
}

const DataContext = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData fora do DataProvider');
  return value;
}

/**
 * Lê as tabelas por consultas reativas do Dexie. O IndexedDB continua sendo a única
 * fonte de verdade: aqui só existe um resultado derivado, atualizado a cada gravação.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const snapshot = useLiveQuery(async () => ({
    tasks: await db.tasks.toArray(),
    lists: await db.lists.orderBy('position').toArray(),
  }));

  const value = useMemo<DataValue | null>(() => {
    if (!snapshot) return null;
    return {
      tasks: snapshot.tasks,
      lists: snapshot.lists,
      listsById: new Map(snapshot.lists.map((l) => [l.id, l])),
    };
  }, [snapshot]);

  if (!value) {
    return (
      <div className={styles.centered} role="status">
        <p>Carregando suas tarefas…</p>
      </div>
    );
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

type GateState = { status: 'opening' } | { status: 'ready' } | { status: 'error'; message: string };

/** Abre o banco antes de renderizar; em falha, explica e oferece nova tentativa sem apagar nada. */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'opening' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'opening' });
    db.open()
      .then(() => {
        if (!cancelled) setState({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', message: detail });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'opening') {
    return (
      <div className={styles.centered} role="status">
        <p>Abrindo o armazenamento local…</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox} role="alert">
          <h1>Não foi possível abrir o armazenamento deste navegador</h1>
          <p>
            O Clareia guarda suas tarefas no IndexedDB. Isso pode falhar em janelas privativas, com o armazenamento
            bloqueado ou com o disco cheio. Nenhum dado foi apagado.
          </p>
          <p className={styles.detail}>Detalhe técnico: {state.message}</p>
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
