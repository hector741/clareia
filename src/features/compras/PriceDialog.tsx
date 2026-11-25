import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { formatShortDate, todayLocal } from '../../domain/dates';
import { centsToInput, parseBrl } from '../../domain/shopping/money';
import { formatMilli, parseQuantityInput } from '../../domain/shopping/quantity';
import type { ShoppingItem } from '../../domain/shopping/types';
import { money, perUnitLabel } from './format';
import styles from './compras.module.css';

interface Props {
  item: ShoppingItem;
  origin: HTMLElement | null;
  onClose: () => void;
}

/** Informa ou corrige quantidade e preço efetivos. Só a confirmação conta para o total final. */
export function PriceDialog({ item, origin, onClose }: Props) {
  const feedback = useFeedback();
  const today = todayLocal();
  const [qty, setQty] = useState(formatMilli(item.actualQtyMilli ?? item.plannedQtyMilli));
  const [isFree, setIsFree] = useState(item.isFree);
  const [price, setPrice] = useState(centsToInput(item.actualUnitPriceCents ?? item.estUnitPriceCents));
  const [discount, setDiscount] = useState(item.itemDiscountCents > 0 ? centsToInput(item.itemDiscountCents) : '');
  const [condition, setCondition] = useState(item.priceCondition ?? item.estRefCondition ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const estimateNote =
    item.estUnitPriceCents !== null
      ? `Estimativa: ${money(item.estUnitPriceCents)} ${perUnitLabel(item.saleUnit)}${
          item.estRefDate ? ` (última compra em ${formatShortDate(item.estRefDate, today)})` : ''
        }. A estimativa não é confirmação.`
      : 'Sem estimativa para este item.';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const nextErrors: Record<string, string> = {};
    const parsedQty = parseQuantityInput(qty, item.saleUnit);
    if (!parsedQty.ok) nextErrors.qty = parsedQty.message;
    let unitPriceCents = 0;
    if (!isFree) {
      const parsedPrice = parseBrl(price);
      if (!parsedPrice.ok) nextErrors.price = parsedPrice.message;
      else unitPriceCents = parsedPrice.cents;
    }
    let discountCents = 0;
    if (discount.trim() !== '') {
      const parsedDiscount = parseBrl(discount);
      if (!parsedDiscount.ok) nextErrors.discount = parsedDiscount.message;
      else discountCents = parsedDiscount.cents;
    }
    if (Object.keys(nextErrors).length > 0 || !parsedQty.ok) {
      setErrors(nextErrors);
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await repo.confirmItem(item.id, {
        qtyMilli: parsedQty.milli,
        unitPriceCents,
        discountCents,
        isFree,
        priceCondition: condition,
      });
      feedback.success('Preço confirmado.');
      onClose();
    } catch (error) {
      const appError = toAppError(error);
      setErrors(appError.code === 'validation' && Object.keys(appError.fields).length > 0 ? appError.fields : { form: appError.message });
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
            <Dialog.Title className={dialogStyles.alertTitle}>Preço de {item.label}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
            <p className={styles.itemMeta}>{estimateNote}</p>
            <Field label={`Quantidade efetiva (${item.saleUnit})`} error={errors.qty} hint="Quantidade realmente levada.">
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={qty}
                data-autofocus
                autoComplete="off"
                onChange={(e) => {
                  setQty(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => {
                  setIsFree(e.target.checked);
                  setErrors({});
                }}
              />
              <span>Item gratuito (confirmo que o preço é zero)</span>
            </label>
            <Field label={`Preço por ${item.saleUnit === 'un' ? 'unidade' : item.saleUnit} (R$)`} error={errors.price}>
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={isFree ? '0,00' : price}
                disabled={isFree}
                autoComplete="off"
                onChange={(e) => {
                  setPrice(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <Field label="Desconto neste item (R$)" error={errors.discount} hint="Opcional. Valor total do desconto desta linha.">
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={discount}
                autoComplete="off"
                onChange={(e) => {
                  setDiscount(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
            <Field label="Condição do preço (opcional)" hint="Ex.: promoção, cartão, clube.">
              <input
                type="text"
                className="control"
                value={condition}
                autoComplete="off"
                maxLength={120}
                onChange={(e) => setCondition(e.target.value)}
              />
            </Field>
            {errors.form ? (
              <p role="alert" className={styles.inlineError}>
                {errors.form}
              </p>
            ) : null}
            <div className={dialogStyles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? 'Salvando…' : 'Confirmar preço'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
