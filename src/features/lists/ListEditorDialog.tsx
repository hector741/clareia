import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { fieldErrors, listInputSchema } from '../../domain/schemas';
import { LIST_COLORS, LIST_COLOR_LABELS, type ListColor, type TaskList } from '../../domain/types';
import { ColorDot } from './ColorDot';
import styles from './ListEditorDialog.module.css';

export interface ListEditorRequest {
  key: number;
  list?: TaskList;
  origin: HTMLElement | null;
}

interface Props {
  request: ListEditorRequest;
  onClose: () => void;
  onSaved: (list: TaskList, created: boolean) => void;
}

export function ListEditorDialog({ request, onClose, onSaved }: Props) {
  const feedback = useFeedback();
  const editing = request.list;
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState<ListColor>(editing?.color ?? 'green');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const parsed = listInputSchema.safeParse({ name, color });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = editing
        ? await repo.updateList(editing.id, parsed.data)
        : await repo.createList(parsed.data);
      feedback.success(editing ? 'Lista atualizada.' : 'Lista criada.');
      onSaved(saved, !editing);
      onClose();
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === 'validation') setErrors(appError.fields);
      else setSaveError(appError.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content
          className={dialogStyles.alertContent}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus]')?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus(request.origin);
          }}
        >
          <div className={styles.header}>
            <Dialog.Title className={dialogStyles.alertTitle}>{editing ? 'Editar lista' : 'Nova lista'}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className={styles.form} noValidate>
            <Field label="Nome da lista" error={errors.name}>
              <input
                type="text"
                className="control"
                value={name}
                data-autofocus
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <fieldset className={styles.colors}>
              <legend className={styles.legend}>Cor</legend>
              <div className={styles.colorGrid}>
                {LIST_COLORS.map((c) => (
                  <label key={c} className={styles.colorOption}>
                    <input
                      type="radio"
                      name="list-color"
                      value={c}
                      checked={color === c}
                      onChange={() => setColor(c)}
                      className={styles.radio}
                    />
                    <span className={styles.colorLabel}>
                      <ColorDot color={c} />
                      {LIST_COLOR_LABELS[c]}
                    </span>
                  </label>
                ))}
              </div>
              {errors.color ? <p className={styles.error}>{errors.color}</p> : null}
            </fieldset>
            {saveError ? (
              <p role="alert" className={styles.saveError}>
                {saveError}
              </p>
            ) : null}
            <div className={dialogStyles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? 'Salvando…' : saveError ? 'Tentar salvar de novo' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
