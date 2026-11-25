import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { routes } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { parseBrl, centsToInput } from '../../domain/shopping/money';
import { storeLabel } from '../../domain/shopping/compare';
import type { ShoppingList } from '../../domain/shopping/types';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

export const DEFAULT_LIST_NAME = 'Compras de hoje';

interface Props {
  /** Ausente para criar; presente para editar os dados da lista. */
  list?: ShoppingList;
  origin: HTMLElement | null;
  onClose: () => void;
}

export function ListDialog({ list, origin, onClose }: Props) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const shopping = useShopping();
  const editing = list !== undefined;
  const [name, setName] = useState(list?.name ?? DEFAULT_LIST_NAME);
  const [storeId, setStoreId] = useState(list?.storeId ?? '');
  const [budget, setBudget] = useState(centsToInput(list?.budgetCents ?? null));
  const [plannedFor, setPlannedFor] = useState(list?.plannedFor ?? '');
  const [newStore, setNewStore] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const stores = shopping.stores.filter((s) => s.archivedAt === null || s.id === storeId);

  const addStore = async () => {
    const trimmed = newStore.trim();
    if (!trimmed) {
      setErrors((e) => ({ ...e, newStore: 'Informe o nome do mercado.' }));
      return;
    }
    try {
      const created = await repo.createStore({ name: trimmed, branch: null });
      setStoreId(created.id);
      setNewStore('');
      setErrors((e) => ({ ...e, newStore: '' }));
      feedback.success('Mercado cadastrado.');
    } catch (error) {
      setErrors((e) => ({ ...e, newStore: toAppError(error).message }));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const parsedBudget = budget.trim() === '' ? { ok: true as const, cents: null } : parseBrl(budget);
    if (!parsedBudget.ok) {
      setErrors({ budget: parsedBudget.message });
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const values = {
      name: name.trim(),
      storeId: storeId === '' ? null : storeId,
      budgetCents: parsedBudget.cents,
      plannedFor: plannedFor === '' ? null : plannedFor,
    };
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await repo.updateShoppingList(list.id, values);
        feedback.success('Lista atualizada.');
        onClose();
      } else {
        const created = await repo.createShoppingList(values);
        feedback.success('Lista criada.');
        onClose();
        navigate(routes.shoppingList(created.id));
      }
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
            restoreFocus(origin);
          }}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title className={dialogStyles.alertTitle}>{editing ? 'Editar lista' : 'Nova lista de compras'}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
            <Field label="Nome da lista" error={errors.name}>
              <input
                type="text"
                className="control"
                value={name}
                data-autofocus
                autoComplete="off"
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <Field label="Mercado" error={errors.storeId} hint="Opcional. Sem mercado, as comparações ficam só com a lista.">
              <select
                className="control"
                value={storeId}
                onChange={(e) => {
                  setStoreId(e.target.value);
                  setErrors({});
                }}
              >
                <option value="">Mercado não informado</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {storeLabel(s.name, s.branch)}
                    {s.archivedAt ? ' (arquivado)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className={styles.inlineRow}>
              <Field label="Novo mercado" error={errors.newStore}>
                <input
                  type="text"
                  className="control"
                  value={newStore}
                  autoComplete="off"
                  maxLength={80}
                  onChange={(e) => setNewStore(e.target.value)}
                />
              </Field>
              <Button variant="secondary" onClick={() => void addStore()}>
                Cadastrar mercado
              </Button>
            </div>
            <Field
              label="Orçamento (R$)"
              error={errors.budget}
              hint="Opcional. Zero é um orçamento válido; deixe em branco para não limitar."
            >
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={budget}
                placeholder="Ex.: 300,00"
                autoComplete="off"
                onChange={(e) => {
                  setBudget(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <Field label="Data prevista" error={errors.plannedFor} hint="Opcional.">
              <input
                type="date"
                className="control"
                value={plannedFor}
                onChange={(e) => {
                  setPlannedFor(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            {saveError ? (
              <p role="alert" className={styles.inlineError}>
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
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar lista'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
