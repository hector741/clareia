import { Plus, SlidersHorizontal } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useEditor } from '../../app/EditorContext';
import { useFeedback } from '../../app/feedback';
import { Button } from '../../components/ui/Button';
import { repo, toAppError } from '../../db';
import { todayLocal } from '../../domain/dates';
import { quickTitleSchema } from '../../domain/schemas';
import { emptyTaskInput } from '../../domain/taskInput';
import styles from './QuickAddTask.module.css';

export interface QuickAddTarget {
  listId: string | null;
  /** Em Hoje, Fazer em recebe a data local atual. */
  planToday: boolean;
  /** Nome do destino para a mensagem de sucesso. */
  label: string;
}

interface QuickAddTaskProps {
  target: QuickAddTarget;
  autoFocus?: boolean;
}

export function QuickAddTask({ target, autoFocus = false }: QuickAddTaskProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
  const { openNewTask } = useEditor();

  const defaults = () => ({
    listId: target.listId,
    plannedDate: target.planToday ? todayLocal() : null,
  });

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (savingRef.current) return;
    const parsed = quickTitleSchema.safeParse(title);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Escreva um título para a tarefa.');
      inputRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await repo.createTask(emptyTaskInput({ title: parsed.data, ...defaults() }));
      setTitle('');
      feedback.success(`Tarefa adicionada a ${target.label}.`);
    } catch (e) {
      setError(`${toAppError(e).message} O texto foi mantido: toque em Adicionar para tentar de novo.`);
    } finally {
      savingRef.current = false;
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  const moreDetails = () => {
    openNewTask({ defaults: defaults(), title, origin: inputRef.current });
    setTitle('');
    setError(null);
  };

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor={inputId} className="sr-only">
        Nova tarefa
      </label>
      <div className={styles.row}>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className={`control ${styles.input}`}
          value={title}
          placeholder="O que você precisa fazer?"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
        />
        <Button variant="primary" type="submit" icon={<Plus size={18} />} disabled={saving} aria-busy={saving}>
          Adicionar
        </Button>
        <Button variant="ghost" icon={<SlidersHorizontal size={18} />} onClick={moreDetails}>
          Mais detalhes
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
