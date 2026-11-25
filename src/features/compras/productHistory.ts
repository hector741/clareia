import {
  changeBetween,
  filterObservations,
  lowestObservation,
  observations,
  observedUnitCents,
  type Change,
  type CompareBase,
  type CompareMode,
  type Observation,
} from '../../domain/shopping/compare';
import type { ShoppingPurchase } from '../../domain/shopping/types';

export interface HistoryFilters {
  mode: CompareMode;
  base: CompareBase | null;
  variantId: string | null;
  storeId: string | null;
  from: string | null;
}

export interface HistoryRow {
  observation: Observation;
  /** Compra anterior do mesmo mercado (mesma base e, no modo variante, mesma embalagem). */
  previous: Observation | null;
  change: Change;
}

/** Observações reais de um produto, em ordem cronológica. Nada é inventado: sem compra, sem ponto. */
export function productObservations(purchases: readonly ShoppingPurchase[], productId: string, filters: HistoryFilters): Observation[] {
  const all = observations(purchases, filters.mode).filter((o) => o.productId === productId);
  return filterObservations(all, {
    mode: filters.mode,
    base: filters.base,
    variantId: filters.mode === 'variant' ? filters.variantId : null,
    storeId: filters.storeId,
    from: filters.from,
  });
}

/**
 * Compra anterior no mesmo mercado. Usa o conjunto completo (sem filtros de exibição), para que
 * a variação de uma linha filtrada continue correta. Nunca troca de mercado em silêncio.
 */
export function previousSameStore(all: readonly Observation[], observation: Observation): Observation | null {
  let found: Observation | null = null;
  for (const candidate of all) {
    if (candidate.rootId === observation.rootId) continue;
    if (candidate.productId !== observation.productId || candidate.mode !== observation.mode) continue;
    if (candidate.base !== observation.base) continue;
    if (observation.mode === 'variant' && candidate.variantId !== observation.variantId) continue;
    if (candidate.storeId !== observation.storeId) continue;
    if (candidate.purchasedOn > observation.purchasedOn) continue;
    if (candidate.purchasedOn === observation.purchasedOn && candidate.createdAt >= observation.createdAt) continue;
    found = candidate;
  }
  return found;
}

export function buildRows(all: readonly Observation[], shown: readonly Observation[]): HistoryRow[] {
  return shown.map((observation) => {
    const previous = previousSameStore(all, observation);
    return { observation, previous, change: changeBetween(observation, previous) };
  });
}

export interface HistorySummary {
  last: Observation | null;
  lowest: Observation | null;
  lastChange: Change;
  lastPrevious: Observation | null;
}

/** Último preço confirmado, menor preço com data e mercado, e variação do último em relação ao anterior do mesmo mercado. */
export function summarizeHistory(all: readonly Observation[], shown: readonly Observation[]): HistorySummary {
  const last = shown.length > 0 ? shown[shown.length - 1] ?? null : null;
  const lowest = lowestObservation(shown);
  const lastPrevious = last ? previousSameStore(all, last) : null;
  return {
    last,
    lowest,
    lastChange: changeBetween(last, lastPrevious),
    lastPrevious,
  };
}

/** Valor de uma observação por unidade de comparação, em centavos (arredondado meio para cima). */
export function unitCentsOf(observation: Observation): number {
  return observedUnitCents(observation);
}
