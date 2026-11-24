import { useCallback, useState } from 'react';
import type { SortMode } from '../../domain/sort';
import styles from './SortToggle.module.css';

/** Preferência de interface (não faz parte dos dados exportados). */
export function useSortMode(key: string): [SortMode, (mode: SortMode) => void] {
  const storageKey = `clareia.sort.${key}`;
  const [mode, setMode] = useState<SortMode>(() => {
    try {
      return window.localStorage.getItem(storageKey) === 'manual' ? 'manual' : 'auto';
    } catch {
      return 'auto';
    }
  });
  const update = useCallback(
    (next: SortMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* armazenamento indisponível: mantém só em memória */
      }
    },
    [storageKey],
  );
  return [mode, update];
}

interface SortToggleProps {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
}

export function SortToggle({ mode, onChange }: SortToggleProps) {
  return (
    <div className={styles.wrap}>
      <div role="group" aria-label="Ordenação" className={styles.group}>
        <button
          type="button"
          className={`${styles.option} ${mode === 'auto' ? styles.active : ''}`}
          aria-pressed={mode === 'auto'}
          onClick={() => onChange('auto')}
        >
          Ordem automática
        </button>
        <button
          type="button"
          className={`${styles.option} ${mode === 'manual' ? styles.active : ''}`}
          aria-pressed={mode === 'manual'}
          onClick={() => onChange('manual')}
        >
          Ordem manual
        </button>
      </div>
      <p className={styles.hint}>
        {mode === 'auto'
          ? 'Prioridade, prazo e Fazer em decidem a ordem.'
          : 'Use o menu de cada tarefa para mover para cima ou para baixo.'}
      </p>
    </div>
  );
}
