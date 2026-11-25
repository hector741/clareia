import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { routes } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { todayLocal } from '../../domain/dates';
import { buildPurchaseLines, isConfirmed, purchaseAdjustmentIssue, purchaseTotals } from '../../domain/shopping/calc';
import { storeLabel } from '../../domain/shopping/compare';
import { parseBrl } from '../../domain/shopping/money';
import { formatQuantity } from '../../domain/shopping/quantity';
import type { ShoppingList } from '../../domain/shopping/types';
import { money, signedMoney } from './format';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

interface Props {
  list: ShoppingList;
  origin: HTMLElement | null;
  onClose: () => void;
}

/** Revisão antes de registrar a compra. Nada é gravado até confirmar; a gravação é uma só. */
export function FinalizeDialog({ list, origin, onClose }: Props) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const shopping = useShopping();
  const [storeId, setStoreId] = useState(list.storeId ?? '');
  const [purchasedOn, setPurchasedOn] = useState(todayLocal());
  const [globalDiscount, setGlobalDiscount] = useState('');
  const [extraCharges, setExtraCharges] = useState('');
  const [carry, setCarry] = useState<'leave' | 'copy'>('leave');
  const [nextName, setNextName] = useState(`${list.name} — pendências`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const items = useMemo(() => shopping.items.filter((i) => i.listId === list.id), [shopping.items, list.id]);
  const cart = items.filter((i) => i.state === 'in_cart').sort((a, b) => a.position - b.position);
  const unconfirmed = cart.filter((i) => !isConfirmed(i));
  const pendingCount = items.filter((i) => i.state === 'pending').length;
  const skippedCount = items.filter((i) => i.state === 'skipped').length;

  const stores = shopping.stores.filter((s) => s.archivedAt === null || s.id === storeId);

  // Pré-visualização dos totais com os mesmos cálculos usados na gravação.
  const preview = useMemo(() => {
    if (cart.length === 0 || unconfirmed.length > 0) return null;
    const lines = buildPurchaseLines(items, { products: shopping.products, variants: shopping.variants }, 'preview');
    const discount = globalDiscount.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(globalDiscount);
    const extra = extraCharges.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(extraCharges);
    const totals = purchaseTotals(lines, discount.ok ? discount.cents : 0, extra.ok ? extra.cents : 0);
    return { lines, totals, discountOk: discount.ok, extraOk: extra.ok };
  }, [cart.length, unconfirmed.length, items, shopping.products, shopping.variants, globalDiscount, extraCharges]);

  const budget = list.budgetCents;
  const balance = preview && budget !== null ? budget - preview.totals.totalCents : null;

  const blocker =
    cart.length === 0
      ? 'Coloque pelo menos um item no carrinho para finalizar.'
      : unconfirmed.length > 0
        ? `Confirme quantidade e preço antes de finalizar: ${unconfirmed.map((i) => i.label).join(', ')}.`
        : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current || blocker) return;
    const nextErrors: Record<string, string> = {};
    const discount = globalDiscount.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(globalDiscount);
    const extra = extraCharges.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(extraCharges);
    if (!discount.ok) nextErrors.globalDiscount = discount.message;
    if (!extra.ok) nextErrors.extraCharges = extra.message;
    if (discount.ok && extra.ok && preview) {
      const issue = purchaseAdjustmentIssue(preview.totals.subtotalCents, discount.cents, extra.cents);
      if (issue) nextErrors.globalDiscount = issue;
    }
    if (purchasedOn === '') nextErrors.purchasedOn = 'Informe a data da compra.';
    if (carry === 'copy' && nextName.trim() === '') nextErrors.nextName = 'Dê um nome para a lista de pendências.';
    if (Object.keys(nextErrors).length > 0 || !discount.ok || !extra.ok) {
      setErrors(nextErrors);
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await repo.finalizeList(list.id, {
        purchasedOn,
        storeId: storeId === '' ? null : storeId,
        globalDiscountCents: discount.cents,
        extraChargesCents: extra.cents,
        nextListName: carry === 'copy' ? nextName.trim() : null,
      });
      feedback.success('Compra registrada no histórico.');
      onClose();
      navigate(routes.shoppingHistory);
    } catch (error) {
      const appError = toAppError(error);
      setErrors(Object.keys(appError.fields).length > 0 ? appError.fields : { form: appError.message });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const currentStore = shopping.stores.find((s) => s.id === storeId);
  const storeText = currentStore ? storeLabel(currentStore.name, currentStore.branch) : 'Mercado não informado';

  return (
    <Dialog.Root open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content
          className={`${dialogStyles.alertContent} ${styles.wideDialog}`}
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
            <Dialog.Title className={dialogStyles.alertTitle}>Revisar e finalizar compra</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
            {blocker ? (
              <p role="alert" className={styles.warningBox}>
                {blocker}
              </p>
            ) : null}

            <div className={styles.twoCols}>
              <Field label="Mercado" error={errors.storeId}>
                <select className="control" value={storeId} data-autofocus onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">Mercado não informado</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {storeLabel(s.name, s.branch)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data da compra" error={errors.purchasedOn}>
                <input
                  type="date"
                  className="control"
                  value={purchasedOn}
                  onChange={(e) => setPurchasedOn(e.target.value)}
                />
              </Field>
            </div>

            {preview ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Itens da compra</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Qtd.</th>
                      <th scope="col">Preço</th>
                      <th scope="col">Desconto</th>
                      <th scope="col">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.productName}</td>
                        <td>{formatQuantity(line.quantityMilli, line.saleUnit)}</td>
                        <td>{money(line.unitPriceCents)}</td>
                        <td>{line.itemDiscountCents > 0 ? money(line.itemDiscountCents) : '—'}</td>
                        <td>{money(line.netCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className={styles.twoCols}>
              <Field label="Desconto geral (R$)" error={errors.globalDiscount} hint="Opcional. Não pode passar do subtotal.">
                <input
                  type="text"
                  inputMode="decimal"
                  className="control"
                  value={globalDiscount}
                  autoComplete="off"
                  onChange={(e) => {
                    setGlobalDiscount(e.target.value);
                    setErrors({});
                  }}
                />
              </Field>
              <Field label="Despesas extras (R$)" error={errors.extraCharges} hint="Opcional: taxa, sacola, entrega.">
                <input
                  type="text"
                  inputMode="decimal"
                  className="control"
                  value={extraCharges}
                  autoComplete="off"
                  onChange={(e) => {
                    setExtraCharges(e.target.value);
                    setErrors({});
                  }}
                />
              </Field>
            </div>

            {preview ? (
              <dl className={styles.totals} aria-label="Totais da compra">
                <div>
                  <dt>Subtotal dos produtos</dt>
                  <dd>{money(preview.totals.subtotalCents)}</dd>
                </div>
                <div>
                  <dt>Desconto geral</dt>
                  <dd>{preview.totals.globalDiscountCents > 0 ? signedMoney(-preview.totals.globalDiscountCents) : money(0)}</dd>
                </div>
                <div>
                  <dt>Despesas extras</dt>
                  <dd>{preview.totals.extraChargesCents > 0 ? signedMoney(preview.totals.extraChargesCents) : money(0)}</dd>
                </div>
                <div className={styles.totalRow}>
                  <dt>Total pago</dt>
                  <dd>{money(preview.totals.totalCents)}</dd>
                </div>
              </dl>
            ) : null}

            <p className={styles.itemMeta}>
              Mercado: {storeText}. Orçamento:{' '}
              {budget === null
                ? 'sem limite definido.'
                : balance === null
                  ? money(budget)
                  : balance >= 0
                    ? `${money(budget)}; sobra ${money(balance)}.`
                    : `${money(budget)}; acima do orçamento em ${money(-balance)}.`}
            </p>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>E os itens que ficaram de fora?</legend>
              <p className={styles.itemMeta}>
                {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'} e {skippedCount} desistido(s) não entram nesta compra.
              </p>
              <label className={styles.radioRow}>
                <input type="radio" name="carry" checked={carry === 'leave'} onChange={() => setCarry('leave')} />
                <span>Deixar na lista atual (nada copiado)</span>
              </label>
              <label className={styles.radioRow}>
                <input type="radio" name="carry" checked={carry === 'copy'} onChange={() => setCarry('copy')} />
                <span>Copiar os pendentes para uma nova lista</span>
              </label>
              {carry === 'copy' ? (
                <Field label="Nome da nova lista" error={errors.nextName}>
                  <input
                    type="text"
                    className="control"
                    value={nextName}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) => setNextName(e.target.value)}
                  />
                </Field>
              ) : null}
            </fieldset>

            {errors.form ? (
              <p role="alert" className={styles.inlineError}>
                {errors.form}
              </p>
            ) : null}

            <div className={dialogStyles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Voltar
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={saving || blocker !== null} aria-busy={saving}>
                {saving ? 'Registrando…' : 'Registrar compra'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
