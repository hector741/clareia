import { useMemo, useSyncExternalStore } from 'react';
import { store } from '../../db';
import { summarizeList } from '../../domain/shopping/calc';
import { observations, type Observation } from '../../domain/shopping/compare';
import type { ShoppingData, ShoppingList, ShoppingPurchase } from '../../domain/shopping/types';

const getShopping = () => store.getState().shopping;

/** Dados de Compras da cópia local. Atualiza sozinho quando qualquer gravação muda o estado. */
export function useShopping(): ShoppingData {
  return useSyncExternalStore(store.subscribe, getShopping);
}

/** Compras registradas e ativas (não anuladas nem substituídas). */
export function activePurchases(data: ShoppingData): ShoppingPurchase[] {
  return data.purchases.filter((p) => p.status === 'active');
}

/** Observações por embalagem (modo "mesma variante"), usadas em estimativas e comparações. */
export function useVariantObservations(data: ShoppingData): Observation[] {
  return useMemo(() => observations(activePurchases(data), 'variant'), [data]);
}

export interface ListSummary {
  itemCount: number;
  forecastCents: number;
  unknownLines: number;
  cartCount: number;
  cartUnconfirmed: number;
}

/** Resumo por lista para os cartões da tela inicial. */
export function useListSummaries(data: ShoppingData): Map<string, ListSummary> {
  return useMemo(() => {
    const map = new Map<string, ListSummary>();
    for (const list of data.lists) {
      const items = data.items.filter((i) => i.listId === list.id);
      const summary = summarizeList(items, list.budgetCents);
      map.set(list.id, {
        itemCount: items.filter((i) => i.state !== 'skipped').length,
        forecastCents: summary.forecastCents,
        unknownLines: summary.unknownLines,
        cartCount: summary.cartCount,
        cartUnconfirmed: summary.cartUnconfirmed,
      });
    }
    return map;
  }, [data]);
}

export function purchaseForList(data: ShoppingData, list: ShoppingList): ShoppingPurchase | null {
  if (!list.completedPurchaseId) return null;
  return data.purchases.find((p) => p.id === list.completedPurchaseId) ?? null;
}
