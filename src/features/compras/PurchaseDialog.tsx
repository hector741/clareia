import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useFeedback } from '../../app/feedback';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import type { CorrectLineValues } from '../../db/shopping';
import { formatLongDate, formatShortDate, todayLocal } from '../../domain/dates';
import { storeLabel } from '../../domain/shopping/compare';
import { centsToInput, parseBrl } from '../../domain/shopping/money';
import { formatMilli, formatQuantity, parseQuantityInput } from '../../domain/shopping/quantity';
import type { SaleUnit, ShoppingPurchase } from '../../domain/shopping/types';
import { budgetText } from './HistoryPage';
import { money, signedMoney } from './format';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

interface Props {
  purchase: ShoppingPurchase;
  onClose: () => void;
  onRepurchased: (listId: string) => void;
}

type Mode = 'view' | 'correct' | 'void' | 'repurchase';

interface LineEdit {
  lineId: string;
  name: string;
  saleUnit: SaleUnit;
  qty: string;
  price: string;
  discount: string;
  condition: string;
  remove: boolean;
}

/** Detalhe de uma compra com as ações explícitas: recomprar, corrigir (nova revisão) e anular. */
export function PurchaseDialog({ purchase, onClose, onRepurchased }: Props) {
  const feedback = useFeedback();
  const shopping = useShopping();
  const today = todayLocal();
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = purchase.status === 'active';
  const store = storeLabel(purchase.storeName, purchase.storeBranch);
  const previous = purchase.supersedesId ? shopping.purchases.find((p) => p.id === purchase.supersedesId) : null;

  const [repurchaseName, setRepurchaseName] = useState(`Recompra de ${formatShortDate(purchase.purchasedOn, today)}`);
  const [voidReason, setVoidReason] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(purchase.purchasedOn);
  const [storeId, setStoreId] = useState(purchase.storeId ?? '');
  const [budget, setBudget] = useState(centsToInput(purchase.budgetCents));
  const [globalDiscount, setGlobalDiscount] = useState(purchase.globalDiscountCents > 0 ? centsToInput(purchase.globalDiscountCents) : '');
  const [extra, setExtra] = useState(purchase.extraChargesCents > 0 ? centsToInput(purchase.extraChargesCents) : '');
  const [lineEdits, setLineEdits] = useState(
    purchase.lines.map((l) => ({
      lineId: l.id,
      name: l.productName,
      saleUnit: l.saleUnit,
      qty: formatMilli(l.quantityMilli),
      price: centsToInput(l.unitPriceCents),
      discount: l.itemDiscountCents > 0 ? centsToInput(l.itemDiscountCents) : '',
      condition: l.priceCondition ?? '',
      remove: false,
    })),
  );

  const finish = onClose;

  const patchLine = (index: number, patch: Partial<LineEdit>) =>
    setLineEdits((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const onRepurchase = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (repurchaseName.trim() === '') {
      setError('Dê um nome para a nova lista.');
      return;
    }
    setBusy(true);
    try {
      const created = await repo.repurchase(purchase.rootId, repurchaseName.trim());
      feedback.success('Lista de recompra criada. Os preços são só estimativas.');
      onRepurchased(created.id);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onVoid = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await repo.voidPurchase(purchase.rootId, voidReason);
      feedback.success('Compra anulada. O registro foi mantido com o motivo.');
      finish();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onCorrect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsedBudget = budget.trim() === '' ? { ok: true as const, cents: null } : parseBrl(budget);
    const parsedDiscount = globalDiscount.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(globalDiscount);
    const parsedExtra = extra.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(extra);
    if (!parsedBudget.ok || !parsedDiscount.ok || !parsedExtra.ok) {
      setError(
        [!parsedBudget.ok ? parsedBudget.message : null, !parsedDiscount.ok ? parsedDiscount.message : null, !parsedExtra.ok ? parsedExtra.message : null]
          .filter(Boolean)
          .join(' '),
      );
      return;
    }
    const lines: CorrectLineValues[] = [];
    for (const edit of lineEdits) {
      if (edit.remove) continue;
      const qty = parseQuantityInput(edit.qty, edit.saleUnit);
      if (!qty.ok) {
        setError(`${edit.name}: ${qty.message}`);
        return;
      }
      const price = parseBrl(edit.price);
      if (!price.ok) {
        setError(`${edit.name}: ${price.message}`);
        return;
      }
      const discount = edit.discount.trim() === '' ? { ok: true as const, cents: 0 } : parseBrl(edit.discount);
      if (!discount.ok) {
        setError(`${edit.name}: ${discount.message}`);
        return;
      }
      lines.push({
        lineId: edit.lineId,
        quantityMilli: qty.milli,
        unitPriceCents: price.cents,
        discountCents: discount.cents,
        priceCondition: edit.condition.trim() === '' ? null : edit.condition.trim(),
      });
    }
    setBusy(true);
    setError(null);
    try {
      await repo.correctPurchase(purchase.rootId, {
        reason,
        purchasedOn: date,
        storeId: storeId === '' ? null : storeId,
        budgetCents: parsedBudget.cents,
        globalDiscountCents: parsedDiscount.cents,
        extraChargesCents: parsedExtra.cents,
        lines,
      });
      feedback.success('Correção registrada. A revisão anterior foi preservada como substituída.');
      finish();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'correct'
      ? 'Corrigir compra'
      : mode === 'void'
        ? 'Anular compra'
        : mode === 'repurchase'
          ? 'Recomprar'
          : `Compra de ${formatLongDate(purchase.purchasedOn)}`;

  return (
    <Dialog.Root open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content
          className={`${dialogStyles.alertContent} ${styles.wideDialog}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus]')?.focus();
          }}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title className={dialogStyles.alertTitle}>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} disabled={busy} />
            </Dialog.Close>
          </div>

          {error ? (
            <p role="alert" className={styles.inlineError}>
              {error}
            </p>
          ) : null}

          {mode === 'view' ? (
            <>
              <p className={styles.itemMeta}>
                {store} · revisão {purchase.revision}
                {purchase.status === 'voided' ? ` · anulada: ${purchase.voidReason ?? ''}` : ''}
              </p>
              {purchase.correctionReason ? (
                <p className={styles.itemMeta}>
                  Correção: {purchase.correctionReason}
                  {previous ? ` (substitui a revisão ${previous.revision})` : ''}
                </p>
              ) : null}
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
                    {purchase.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.productName}
                          {l.priceCondition ? <span className={styles.itemMeta}> · {l.priceCondition}</span> : null}
                        </td>
                        <td>{formatQuantity(l.quantityMilli, l.saleUnit)}</td>
                        <td>{money(l.unitPriceCents)}</td>
                        <td>{l.itemDiscountCents > 0 ? money(l.itemDiscountCents) : '—'}</td>
                        <td>{money(l.netCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className={styles.totals}>
                <div>
                  <dt>Subtotal dos produtos</dt>
                  <dd>{money(purchase.subtotalCents)}</dd>
                </div>
                <div>
                  <dt>Desconto geral</dt>
                  <dd>{purchase.globalDiscountCents > 0 ? signedMoney(-purchase.globalDiscountCents) : money(0)}</dd>
                </div>
                <div>
                  <dt>Despesas extras</dt>
                  <dd>{purchase.extraChargesCents > 0 ? signedMoney(purchase.extraChargesCents) : money(0)}</dd>
                </div>
                <div className={styles.totalRow}>
                  <dt>Total pago</dt>
                  <dd>{money(purchase.totalCents)}</dd>
                </div>
              </dl>
              <p className={styles.itemMeta}>{budgetText(purchase)}</p>

              {active ? (
                <div className={styles.actionsRow}>
                  <Button variant="secondary" onClick={() => setMode('repurchase')}>
                    Recomprar
                  </Button>
                  <Button variant="secondary" onClick={() => setMode('correct')}>
                    Corrigir compra
                  </Button>
                  <Button variant="danger" onClick={() => setMode('void')}>
                    Anular compra
                  </Button>
                </div>
              ) : null}
              <div className={dialogStyles.actions}>
                <Dialog.Close asChild>
                  <Button variant="secondary">Fechar</Button>
                </Dialog.Close>
              </div>
            </>
          ) : null}

          {mode === 'repurchase' ? (
            <form onSubmit={(e) => void onRepurchase(e)} className={styles.formStack} noValidate>
              <p className={styles.itemMeta}>
                Cria uma lista nova com os mesmos itens e o último preço efetivo como estimativa. Nada é cobrado nem confirmado.
              </p>
              <Field label="Nome da nova lista" error={error ?? undefined}>
                <input
                  type="text"
                  className="control"
                  value={repurchaseName}
                  data-autofocus
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) => setRepurchaseName(e.target.value)}
                />
              </Field>
              <div className={dialogStyles.actions}>
                <Button variant="secondary" onClick={() => setMode('view')} disabled={busy}>
                  Voltar
                </Button>
                <Button variant="primary" type="submit" disabled={busy} aria-busy={busy}>
                  Criar lista
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'void' ? (
            <form onSubmit={(e) => void onVoid(e)} className={styles.formStack} noValidate>
              <p className={styles.itemMeta}>
                A compra sai do histórico de preços e dos totais, mas o registro fica visível com o motivo. Esta ação não apaga nada.
              </p>
              <Field label="Motivo da anulação" hint="Pelo menos 3 letras.">
                <input
                  type="text"
                  className="control"
                  value={voidReason}
                  data-autofocus
                  maxLength={300}
                  autoComplete="off"
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </Field>
              <div className={dialogStyles.actions}>
                <Button variant="secondary" onClick={() => setMode('view')} disabled={busy}>
                  Voltar
                </Button>
                <Button variant="dangerSolid" type="submit" disabled={busy} aria-busy={busy}>
                  Anular compra
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'correct' ? (
            <form onSubmit={(e) => void onCorrect(e)} className={styles.formStack} noValidate>
              <p className={styles.itemMeta}>
                A correção cria uma nova revisão. A revisão atual fica preservada como substituída; o histórico usa só a revisão ativa.
              </p>
              <div className={styles.twoCols}>
                <Field label="Data da compra">
                  <input type="date" className="control" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Mercado">
                  <select className="control" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">Mercado não informado</option>
                    {shopping.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {storeLabel(s.name, s.branch)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {lineEdits.map((edit, index) => (
                <fieldset key={edit.lineId} className={styles.fieldset}>
                  <legend className={styles.legend}>{edit.name}</legend>
                  <div className={styles.lineGrid}>
                    <Field label={`Quantidade (${edit.saleUnit})`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="control"
                        value={edit.qty}
                        onChange={(e) => patchLine(index, { qty: e.target.value })}
                      />
                    </Field>
                    <Field label="Preço unitário (R$)">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="control"
                        value={edit.price}
                        onChange={(e) => patchLine(index, { price: e.target.value })}
                      />
                    </Field>
                    <Field label="Desconto (R$)">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="control"
                        value={edit.discount}
                        onChange={(e) => patchLine(index, { discount: e.target.value })}
                      />
                    </Field>
                  </div>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={edit.remove}
                      onChange={(e) => patchLine(index, { remove: e.target.checked })}
                    />
                    <span>Remover esta linha da compra</span>
                  </label>
                </fieldset>
              ))}
              <div className={styles.twoCols}>
                <Field label="Orçamento (R$)" hint="Vazio: sem limite. Zero é válido.">
                  <input type="text" inputMode="decimal" className="control" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </Field>
                <Field label="Desconto geral (R$)">
                  <input type="text" inputMode="decimal" className="control" value={globalDiscount} onChange={(e) => setGlobalDiscount(e.target.value)} />
                </Field>
              </div>
              <Field label="Despesas extras (R$)">
                <input type="text" inputMode="decimal" className="control" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
              <Field label="Motivo da correção" hint="Obrigatório. Pelo menos 3 letras.">
                <input
                  type="text"
                  className="control"
                  value={reason}
                  maxLength={300}
                  autoComplete="off"
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className={dialogStyles.actions}>
                <Button variant="secondary" onClick={() => setMode('view')} disabled={busy}>
                  Voltar
                </Button>
                <Button variant="primary" type="submit" disabled={busy} aria-busy={busy}>
                  Salvar correção
                </Button>
              </div>
            </form>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
