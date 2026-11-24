import type { ReactNode } from 'react';
import { addDays } from '../../domain/dates';
import { Field } from './Field';
import styles from './DateField.module.css';

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  today: string;
  error?: string | undefined;
  hint?: ReactNode;
}

/**
 * Seleção explícita de data civil (YYYY-MM-DD) com atalhos e opção de limpar.
 * O valor nunca passa por Date/UTC.
 */
export function DateField({ label, value, onChange, today, error, hint }: DateFieldProps) {
  const shortcuts = (
    <div className={styles.shortcuts} role="group" aria-label={`Atalhos para ${label}`}>
      <button type="button" className={styles.chip} onClick={() => onChange(today)}>
        Hoje
      </button>
      <button type="button" className={styles.chip} onClick={() => onChange(addDays(today, 1))}>
        Amanhã
      </button>
      <button
        type="button"
        className={styles.chip}
        onClick={() => onChange(null)}
        disabled={value === null}
        aria-label={`Limpar ${label}`}
      >
        Limpar
      </button>
    </div>
  );
  return (
    <Field label={label} error={error} hint={hint} actions={shortcuts}>
      <input
        type="date"
        className="control"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      />
    </Field>
  );
}
