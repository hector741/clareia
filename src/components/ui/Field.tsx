import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Controle (input, select, textarea). Recebe id, aria-invalid e aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  actions?: ReactNode;
}

export function Field({ label, error, hint, children, actions }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {actions}
      </div>
      {control}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
