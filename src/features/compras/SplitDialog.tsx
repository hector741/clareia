import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { formatMilli, formatQuantity, parseQuantityInput } from '../../domain/shopping/quantity';
import type { ShoppingItem } from '../../domain/shopping/types';
import styles from './compras.module.css';

interface Props {
  item: ShoppingItem;
  origin: HTMLElement | null;
  onClose: () => void;
}

/** Divide a linha quando só parte foi levada: o restante vira um item pendente separado. */
export function SplitDialog({ item, origin, onClose }: Props) {
  const feedback = useFeedback();
  const planned = item.plannedQtyMilli;
  const [taken, setTaken] = useState(formatMilli(item.saleUnit === 'un' ? 1000 : Math.floor(planned / 2)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = parseQuantityInput(taken, item.saleUnit);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.milli <= 0 || parsed.milli >= planned) {
      setError(`Use uma quantidade maior que zero e menor que ${formatQuantity(planned, item.saleUnit)}.`);
      return;
    }
    setSaving(true);
    try {
      await repo.splitItem(item.id, parsed.milli);
      feedback.success('Linha dividida. O restante ficou como item separado.');
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const remainder = parseQuantityInput(taken, item.saleUnit);
  const restText = remainder.ok && remainder.milli > 0 && remainder.milli < planned
    ? formatQuantity(planned - remainder.milli, item.saleUnit)
    : null;

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
            <Dialog.Title className={dialogStyles.alertTitle}>Dividir {item.label}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
            <p className={styles.itemMeta}>Planejado: {formatQuantity(planned, item.saleUnit)}.</p>
            <Field
              label={`Quantidade que você está levando (${item.saleUnit})`}
              error={error ?? undefined}
              hint={restText ? `O restante (${restText}) continua na lista como item pendente.` : undefined}
            >
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={taken}
                data-autofocus
                autoComplete="off"
                onChange={(e) => {
                  setTaken(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <div className={dialogStyles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? 'Dividindo…' : 'Dividir linha'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
