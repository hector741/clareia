import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useData } from '../../app/DataContext';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { useToday } from '../../app/TodayContext';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { DateField } from '../../components/ui/DateField';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { fieldErrors, taskInputSchema, type TaskInput } from '../../domain/schemas';
import { LIMITS, PRIORITIES, PRIORITY_LABELS, type Priority } from '../../domain/types';
import { plannedAfterDue } from '../../domain/today';
import { ChecklistEditor } from './ChecklistEditor';
import styles from './TaskEditorDialog.module.css';

export interface EditorRequest {
  key: number;
  mode: 'new' | 'edit';
  taskId?: string;
  /** Rascunho inicial. */
  initial: TaskInput;
  /** Estado considerado "sem alterações". */
  baseline: TaskInput;
  origin: HTMLElement | null;
}

interface Props {
  request: EditorRequest;
  onClose: () => void;
}

export function TaskEditorDialog({ request, onClose }: Props) {
  const today = useToday();
  const { lists, tasks } = useData();
  const feedback = useFeedback();
  const [draft, setDraft] = useState<TaskInput>(request.initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const editedTask = request.taskId ? tasks.find((t) => t.id === request.taskId) : undefined;
  const missingTask = request.mode === 'edit' && !editedTask;

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(request.baseline),
    [draft, request.baseline],
  );

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key as string]: _removed, ...rest } = current;
      return rest;
    });
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const focusFirstInvalid = () => {
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  };

  const save = async () => {
    if (savingRef.current) return;
    const parsed = taskInputSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (request.mode === 'edit' && request.taskId) {
        const result = await repo.updateTask(request.taskId, draft);
        feedback.success(
          result.unfocused
            ? 'Tarefa salva. Ela saiu do foco de hoje porque Fazer em mudou.'
            : 'Tarefa salva.',
        );
      } else {
        await repo.createTask(draft);
        feedback.success('Tarefa criada.');
      }
      onClose();
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === 'validation') {
        setErrors(appError.fields);
        focusFirstInvalid();
      } else {
        setSaveError(appError.message);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const afterDue = plannedAfterDue(draft);
  const focusWillClear =
    editedTask?.focusDate != null && draft.plannedDate !== editedTask.focusDate && editedTask.focusDate === today;

  const title = request.mode === 'new' ? 'Nova tarefa' : 'Editar tarefa';

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => (!open ? requestClose() : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogStyles.overlay} />
          <Dialog.Content
            className={styles.panel}
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
            <header className={styles.header}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" iconOnly aria-label="Fechar editor" icon={<X size={22} />} />
              </Dialog.Close>
            </header>

            {missingTask ? (
              <div className={styles.body}>
                <p role="alert" className={styles.saveError}>
                  Esta tarefa não existe mais.
                </p>
                <Button variant="secondary" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            ) : (
              <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
                <div className={styles.body}>
                  <Field label="Título" error={errors.title}>
                    <input
                      type="text"
                      className="control"
                      value={draft.title}
                      data-autofocus
                      autoComplete="off"
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </Field>

                  <Field
                    label="Descrição"
                    error={errors.description}
                    hint={`${draft.description.length} de ${LIMITS.description} caracteres`}
                  >
                    <textarea
                      className="control"
                      rows={4}
                      value={draft.description}
                      onChange={(e) => set('description', e.target.value)}
                    />
                  </Field>

                  <div className={styles.row}>
                    <Field label="Lista" error={errors.listId}>
                      <select
                        className="control"
                        value={draft.listId ?? ''}
                        onChange={(e) => set('listId', e.target.value === '' ? null : e.target.value)}
                      >
                        <option value="">Entrada (sem lista)</option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Prioridade" error={errors.priority}>
                      <select
                        className="control"
                        value={draft.priority}
                        onChange={(e) => set('priority', e.target.value as Priority)}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <DateField
                    label="Fazer em"
                    value={draft.plannedDate}
                    onChange={(v) => set('plannedDate', v)}
                    today={today}
                    error={errors.plannedDate}
                    hint="Quando você pretende trabalhar nesta tarefa."
                  />
                  <DateField
                    label="Prazo"
                    value={draft.dueDate}
                    onChange={(v) => set('dueDate', v)}
                    today={today}
                    error={errors.dueDate}
                    hint="Quando a entrega vence."
                  />
                  {afterDue ? (
                    <p role="status" className={styles.notice}>
                      Fazer em é depois do Prazo: você planeja trabalhar nesta tarefa depois de o prazo vencer. Pode
                      salvar assim, mas confira as datas.
                    </p>
                  ) : null}
                  {focusWillClear ? (
                    <p role="status" className={styles.notice}>
                      Esta tarefa está em foco hoje. Se Fazer em deixar de ser hoje, ela sai do foco.
                    </p>
                  ) : null}

                  <ChecklistEditor
                    items={draft.subtasks}
                    errors={errors}
                    onChange={(items) => {
                      setDraft((current) => ({ ...current, subtasks: items }));
                      setErrors((current) => {
                        const rest = Object.fromEntries(Object.entries(current).filter(([k]) => !k.startsWith('subtasks')));
                        return rest;
                      });
                    }}
                  />
                </div>

                <footer className={styles.footer}>
                  {saveError ? (
                    <p role="alert" className={styles.saveError}>
                      {saveError}
                    </p>
                  ) : null}
                  <div className={styles.footerActions}>
                    <Button variant="secondary" onClick={requestClose} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button variant="primary" type="submit" disabled={saving} aria-busy={saving}>
                      {saving ? 'Salvando…' : saveError ? 'Tentar salvar de novo' : 'Salvar'}
                    </Button>
                  </div>
                </footer>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogStyles.overlay} />
          <AlertDialog.Content className={dialogStyles.alertContent}>
            <AlertDialog.Title className={dialogStyles.alertTitle}>Alterações não salvas</AlertDialog.Title>
            <AlertDialog.Description className={dialogStyles.alertDescription}>
              Você mudou esta tarefa e ainda não salvou. Escolha o que fazer com o rascunho.
            </AlertDialog.Description>
            <div className={dialogStyles.actions}>
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Continuar editando</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={onClose}>
                  Descartar alterações
                </Button>
              </AlertDialog.Action>
              <AlertDialog.Action asChild>
                <Button variant="primary" onClick={() => void save()}>
                  Salvar
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
