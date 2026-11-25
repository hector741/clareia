import { Pencil, Scissors, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../../app/feedback';
import { Button } from '../../components/ui/Button';
import { repo, toAppError } from '../../db';
import { formatShortDate, todayLocal } from '../../domain/dates';
import { estimateFromReference } from '../../domain/shopping/carry';
import { changeBetween, referenceFor, storeLabel, type Observation } from '../../domain/shopping/compare';
import { isConfirmed, lineAmounts } from '../../domain/shopping/calc';
import { ratio, ratioToCents } from '../../domain/shopping/money';
import { formatMilli, formatQuantity } from '../../domain/shopping/quantity';
import type { ShoppingItem, ShoppingList } from '../../domain/shopping/types';
import { describeChange, money, perUnitLabel } from './format';
import { ItemDialog } from './ItemDialog';
import { PriceDialog } from './PriceDialog';
import { SplitDialog } from './SplitDialog';
import styles from './compras.module.css';

/** plan: planejamento; market: modo mercado; readonly: compra finalizada. */
export type RowMode = 'plan' | 'market' | 'readonly';

interface Props {
  item: ShoppingItem;
  list: ShoppingList;
  mode: RowMode;
  observed: Observation[];
}

type OpenDialog = 'edit' | 'price' | 'split' | null;

/** Uma linha de item: planejamento (estimativas e referências) ou modo mercado (carrinho e preço). */
export function ItemRow({ item, list, mode, observed }: Props) {
  const feedback = useFeedback();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayLocal();
  const readonly = mode === 'readonly';
  const confirmed = isConfirmed(item);
  const amounts = lineAmounts(item);

  const openDialog = (kind: Exclude<OpenDialog, null>, element: HTMLElement) => {
    setOrigin(element);
    setDialog(kind);
  };

  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (success) feedback.success(success);
    } catch (error) {
      feedback.error(toAppError(error).message);
    } finally {
      setBusy(false);
    }
  };

  // Referência de preço para o mercado da lista, sempre da mesma embalagem.
  const reference = item.variantId
    ? referenceFor(observed, { variantId: item.variantId, storeId: list.storeId })
    : null;
  const sameStore = reference?.kind === 'same_store' ? reference.observation : null;
  const otherStore = reference?.kind === 'other_store' ? reference.observation : null;

  const estimateText =
    item.estUnitPriceCents === null
      ? 'Sem preço'
      : item.estSource === 'last_purchase' || item.estSource === 'other_store'
        ? `Estimado: ${money(item.estUnitPriceCents)} ${perUnitLabel(item.saleUnit)} · ${
            item.estRefDate ? `última compra em ${formatShortDate(item.estRefDate, today)}` : 'última compra'
          }${item.estRefStoreName ? ` — ${item.estRefStoreName}` : ''}`
        : `Estimado: ${money(item.estUnitPriceCents)} ${perUnitLabel(item.saleUnit)} (digitado)`;

  // Comparação só com item confirmado e referência do mesmo mercado. Outro mercado nunca é comparado em silêncio.
  let comparison: string | null = null;
  if (mode !== 'plan' && confirmed && amounts && item.variantId) {
    const unit = ratio(amounts.netCents * 1000, item.actualQtyMilli ?? 1);
    const change = changeBetween({ mode: 'variant', base: item.saleUnit, unit }, sameStore);
    comparison = sameStore
      ? describeChange(
          change,
          item.saleUnit,
          { date: sameStore.purchasedOn, storeLabel: storeLabel(sameStore.storeName, sameStore.storeBranch) },
          today,
        )
      : otherStore
        ? `Sem histórico neste mercado. Última compra desta embalagem em outro mercado: ${formatShortDate(otherStore.purchasedOn, today)} — ${storeLabel(otherStore.storeName, otherStore.storeBranch)}. Não comparado.`
        : 'Primeira compra desta embalagem: sem comparação.';
  }

  const badge = confirmed ? (
    <span className={`${styles.badge} ${styles.badgeConfirmed}`}>Confirmado</span>
  ) : item.estUnitPriceCents !== null ? (
    <span className={`${styles.badge} ${styles.badgeEstimate}`}>Estimado</span>
  ) : (
    <span className={`${styles.badge} ${styles.badgeNone}`}>Sem preço</span>
  );

  const stateLabel = item.state === 'in_cart' ? 'No carrinho' : item.state === 'skipped' ? 'Desisti' : 'A comprar';

  return (
    <li className={`${styles.item} ${item.state === 'skipped' ? styles.itemSkipped : ''}`}>
      <div className={styles.itemMain}>
        {mode === 'market' ? (
          <label className={styles.cartToggle}>
            <input
              type="checkbox"
              checked={item.state === 'in_cart'}
              disabled={busy || item.state === 'skipped'}
              onChange={() => void run(() => repo.toggleCart(item.id))}
            />
            <span>{stateLabel}</span>
          </label>
        ) : null}
        <div className={styles.itemText}>
          <p className={styles.itemName}>
            {item.label}
            {item.priceCondition ? <span className={styles.itemNote}> · {item.priceCondition}</span> : null}
          </p>
          <p className={styles.itemMeta}>
            {mode === 'plan'
              ? `Quantidade: ${formatQuantity(item.plannedQtyMilli, item.saleUnit)}`
              : `Planejado: ${formatQuantity(item.plannedQtyMilli, item.saleUnit)}`}
            {' · '}
            {item.category}
            {item.note ? ` · ${item.note}` : ''}
          </p>
          <div className={styles.itemPrice}>
            {badge}
            <span className={styles.priceDetails}>
              {mode !== 'plan' && confirmed && amounts ? (
                <>
                  {formatMilli(item.actualQtyMilli ?? 0)} {item.saleUnit} × {money(item.actualUnitPriceCents)}
                  {item.itemDiscountCents > 0 ? ` − desconto ${money(item.itemDiscountCents)}` : ''} ={' '}
                  <strong>{money(amounts.netCents)}</strong>
                  {item.isFree ? ' (gratuito)' : ''}
                </>
              ) : (
                estimateText
              )}
            </span>
          </div>
          {comparison ? (
            <p className={styles.comparison} aria-live="polite">
              {comparison}
            </p>
          ) : null}
          {mode === 'market' && item.state === 'in_cart' && !confirmed ? (
            <p className={styles.warning}>No carrinho sem preço confirmado: a previsão usa a estimativa.</p>
          ) : null}
          {mode === 'plan' && item.variantId && !sameStore ? (
            <p className={styles.itemMeta}>
              {otherStore
                ? `Sem histórico neste mercado. Em ${storeLabel(otherStore.storeName, otherStore.storeBranch)}: ${money(ratioToCents(otherStore.unit))} ${perUnitLabel(item.saleUnit)} em ${formatShortDate(otherStore.purchasedOn, today)}.`
                : 'Sem histórico neste mercado.'}
            </p>
          ) : null}
        </div>
      </div>

      {!readonly ? (
        <div className={styles.itemActions}>
          {mode === 'plan' ? (
            <>
              {otherStore ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    reference
                      ? void run(
                          () => repo.applySuggestion(item.id, estimateFromReference(reference)),
                          'Preço de outro mercado usado como estimativa.',
                        )
                      : undefined
                  }
                >
                  Usar preço de outro mercado
                </Button>
              ) : null}
              <Button
                variant="ghost"
                icon={<Pencil size={18} />}
                aria-label={`Editar ${item.label}`}
                onClick={(e) => openDialog('edit', e.currentTarget)}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                icon={<Trash2 size={18} />}
                aria-label={`Excluir ${item.label}`}
                disabled={busy}
                onClick={() => void run(() => repo.deleteItem(item.id), 'Item excluído.')}
              >
                Excluir
              </Button>
            </>
          ) : (
            <>
              {item.state !== 'skipped' && !confirmed && item.estUnitPriceCents !== null ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => repo.confirmSuggestedPrice(item.id), 'Preço sugerido confirmado.')}
                >
                  Confirmar preço sugerido
                </Button>
              ) : null}
              {item.state !== 'skipped' ? (
                <Button variant="secondary" disabled={busy} onClick={(e) => openDialog('price', e.currentTarget)}>
                  {confirmed ? 'Corrigir preço' : 'Informar preço'}
                </Button>
              ) : null}
              {item.state !== 'skipped' && !confirmed && item.plannedQtyMilli > 1000 ? (
                <Button variant="ghost" icon={<Scissors size={18} />} onClick={(e) => openDialog('split', e.currentTarget)}>
                  Dividir
                </Button>
              ) : null}
              {item.state === 'skipped' ? (
                <Button variant="ghost" disabled={busy} onClick={() => void run(() => repo.setItemState(item.id, 'pending'))}>
                  Voltar à lista
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy} onClick={() => void run(() => repo.skipItem(item.id), 'Item fora da previsão.')}>
                  Desisti
                </Button>
              )}
              {confirmed ? (
                <Button variant="ghost" disabled={busy} onClick={() => void run(() => repo.clearConfirmation(item.id))}>
                  Desfazer confirmação
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {dialog === 'edit' ? <ItemDialog list={list} item={item} origin={origin} onClose={() => setDialog(null)} /> : null}
      {dialog === 'price' ? <PriceDialog item={item} origin={origin} onClose={() => setDialog(null)} /> : null}
      {dialog === 'split' ? <SplitDialog item={item} origin={origin} onClose={() => setDialog(null)} /> : null}
    </li>
  );
}
