import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { LIMITS } from '../../domain/types';
import styles from './ChecklistEditor.module.css';

export interface DraftStep {
  id: string;
  title: string;
  completed: boolean;
}

interface ChecklistEditorProps {
  items: DraftStep[];
  /** Erros por índice (ex.: "subtasks.2.title"). */
  errors: Record<string, string>;
  onChange: (items: DraftStep[]) => void;
}

export function ChecklistEditor({ items, errors, onChange }: ChecklistEditorProps) {
  const headingId = useId();
  const addRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const el = document.querySelector<HTMLElement>(`[data-step-focus="${pendingFocus}"]`);
    el?.focus();
    setPendingFocus(null);
  }, [pendingFocus, items]);

  const add = () => {
    const title = newTitle.trim();
    if (title.length === 0) {
      setAddError('Escreva o título da etapa.');
      addRef.current?.focus();
      return;
    }
    if (title.length > LIMITS.subtaskTitle) {
      setAddError(`O título da etapa pode ter no máximo ${LIMITS.subtaskTitle} caracteres.`);
      return;
    }
    onChange([...items, { id: crypto.randomUUID(), title, completed: false }]);
    setNewTitle('');
    setAddError(null);
    addRef.current?.focus();
  };

  const update = (id: string, patch: Partial<DraftStep>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
    setPendingFocus(`${moved.id}-${delta === -1 ? 'up' : 'down'}`);
  };

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
    setPendingFocus('add');
  };

  const onAddKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  const done = items.filter((i) => i.completed).length;

  return (
    <section aria-labelledby={headingId} className={styles.checklist}>
      <h3 id={headingId} className={styles.heading}>
        Etapas{items.length > 0 ? <span className={styles.count}> · {done} de {items.length} concluídas</span> : null}
      </h3>
      {items.length > 0 ? (
        <ul className={styles.items}>
          {items.map((item, index) => {
            const error = errors[`subtasks.${index}.title`];
            const errorId = `${item.id}-error`;
            return (
              <li key={item.id} className={styles.item}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(e) => update(item.id, { completed: e.target.checked })}
                    aria-label={`Etapa ${index + 1} concluída`}
                    className={styles.checkInput}
                  />
                  <span className={styles.box} aria-hidden="true" />
                </label>
                <div className={styles.titleCell}>
                  <input
                    type="text"
                    className="control"
                    value={item.title}
                    onChange={(e) => update(item.id, { title: e.target.value })}
                    aria-label={`Título da etapa ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    data-step-focus={`${item.id}-title`}
                  />
                  {error ? (
                    <p id={errorId} className={styles.error}>
                      {error}
                    </p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Mover etapa ${index + 1} para cima`}
                    aria-disabled={index === 0}
                    data-step-focus={`${item.id}-up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Mover etapa ${index + 1} para baixo`}
                    aria-disabled={index === items.length - 1}
                    data-step-focus={`${item.id}-down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remover etapa ${index + 1}`}
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>Divida a tarefa em passos pequenos. Etapas não concluem a tarefa sozinhas.</p>
      )}
      <div className={styles.addRow}>
        <div className={styles.addField}>
          <label htmlFor={`${headingId}-new`} className={styles.addLabel}>
            Nova etapa
          </label>
          <input
            id={`${headingId}-new`}
            ref={addRef}
            type="text"
            className="control"
            value={newTitle}
            data-step-focus="add"
            placeholder="Ex.: Reservar sala"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${headingId}-add-error` : undefined}
            onChange={(e) => {
              setNewTitle(e.target.value);
              if (addError) setAddError(null);
            }}
            onKeyDown={onAddKeyDown}
          />
        </div>
        <Button variant="secondary" icon={<Plus size={18} />} onClick={add}>
          Adicionar etapa
        </Button>
      </div>
      {addError ? (
        <p id={`${headingId}-add-error`} className={styles.error}>
          {addError}
        </p>
      ) : null}
    </section>
  );
}
