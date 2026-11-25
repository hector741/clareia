import { ratioToCents } from './money';
import type { Observation, Reference } from './compare';
import type { DateString } from '../types';
import type { EstimateSource, ShoppingItem, ShoppingPurchase } from './types';

/**
 * Regras de estimativa e de cópia de listas. Uma cópia é sempre uma lista nova e
 * independente: itens pendentes, quantidades planejadas e preços apenas estimados.
 * Nada copiado vira despesa realizada.
 */

/** Campos de estimativa de um item, prontos para gravar. */
export interface EstimateFields {
  estUnitPriceCents: number | null;
  estSource: EstimateSource | null;
  estRefDate: DateString | null;
  estRefStoreName: string | null;
  estRefCondition: string | null;
}

export const NO_ESTIMATE: EstimateFields = {
  estUnitPriceCents: null,
  estSource: null,
  estRefDate: null,
  estRefStoreName: null,
  estRefCondition: null,
};

/**
 * Estimativa a partir de uma referência. O preço base é o efetivo por unidade da compra
 * anterior (já líquido de descontos). O desconto antigo não é reaplicado.
 */
export function estimateFromReference(reference: Reference): EstimateFields {
  if (reference.kind === 'none') return NO_ESTIMATE;
  const observation: Observation = reference.observation;
  return {
    estUnitPriceCents: ratioToCents(observation.unit),
    estSource: reference.kind === 'same_store' ? 'last_purchase' : 'other_store',
    estRefDate: observation.purchasedOn,
    estRefStoreName: observation.storeName ?? null,
    estRefCondition: observation.conditions[0] ?? null,
  };
}

/**
 * Ao trocar o mercado da lista: estimativas sugeridas são atualizadas pelas referências do
 * novo mercado. Estimativas digitadas à mão (`manual`) e cópias são preservadas.
 */
export function isSuggestedEstimate(item: Pick<ShoppingItem, 'estSource'>): boolean {
  return item.estSource === 'last_purchase' || item.estSource === 'other_store';
}

/** Cópia de um item como pendente em outra lista. Confirmações e descontos são zerados. */
export function copyPendingItem(item: ShoppingItem, listId: string, position: number, id: string, now: string): ShoppingItem {
  const price = item.priceConfirmed && item.actualUnitPriceCents !== null ? item.actualUnitPriceCents : item.estUnitPriceCents;
  return {
    ...item,
    id,
    listId,
    position,
    state: 'pending',
    actualQtyMilli: null,
    actualUnitPriceCents: null,
    priceConfirmed: false,
    isFree: false,
    itemDiscountCents: 0,
    priceCondition: null,
    estUnitPriceCents: price,
    estSource: price === null ? null : item.priceConfirmed ? 'copied' : (item.estSource ?? 'manual'),
    createdAt: now,
    updatedAt: now,
  };
}

/** Duplicar lista: copia os itens não descartados (Desisti) como pendentes. */
export function duplicateItems(items: readonly ShoppingItem[], listId: string, newId: () => string, now: string): ShoppingItem[] {
  return items
    .filter((item) => item.state !== 'skipped')
    .sort((a, b) => a.position - b.position)
    .map((item, index) => copyPendingItem(item, listId, index + 1, newId(), now));
}

/** Pendências de uma lista finalizada: só o que ficou pendente, para uma lista nova. */
export function carryOverItems(items: readonly ShoppingItem[], listId: string, newId: () => string, now: string): ShoppingItem[] {
  return items
    .filter((item) => item.state === 'pending')
    .sort((a, b) => a.position - b.position)
    .map((item, index) => copyPendingItem(item, listId, index + 1, newId(), now));
}

/**
 * Recomprar uma compra: cada linha vira um item pendente com a quantidade comprada e o
 * último preço efetivo como estimativa. A compra original não muda.
 */
export function repurchaseItems(purchase: ShoppingPurchase, listId: string, newId: () => string, now: string): ShoppingItem[] {
  return [...purchase.lines]
    .sort((a, b) => a.position - b.position)
    .map((line, index) => ({
      id: newId(),
      listId,
      position: index + 1,
      label: line.productName,
      category: line.category,
      note: '',
      productId: line.productId,
      variantId: line.variantId,
      saleUnit: line.saleUnit,
      plannedQtyMilli: line.quantityMilli,
      // Preço líquido por unidade vendida (já com o desconto individual da compra).
      estUnitPriceCents: ratioToCents({ n: BigInt(line.netCents) * 1000n, d: BigInt(line.quantityMilli) }),
      estSource: 'last_purchase' as const,
      estRefDate: purchase.purchasedOn,
      estRefStoreName: purchase.storeName,
      estRefCondition: line.priceCondition,
      actualQtyMilli: null,
      actualUnitPriceCents: null,
      priceConfirmed: false,
      isFree: false,
      itemDiscountCents: 0,
      priceCondition: null,
      state: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    }));
}
