import { compareRatio, ratio, ratioToCents, ratioToNumber, type Ratio } from './money';
import type { DateString } from '../types';
import type { ShoppingPurchase, ShoppingPurchaseLine } from './types';

/**
 * Histórico de preços derivado somente das compras ativas. Não há tabela de observações:
 * cada consulta lê as linhas das revisões ativas. Correções e anulações mudam o resultado
 * porque mudam quais revisões estão ativas.
 */

/** Mesma variante: preço por unidade vendida. Por conteúdo: preço por kg, L ou unidade de conteúdo. */
export type CompareMode = 'variant' | 'content';
export type CompareBase = 'un' | 'kg' | 'L';

export interface Observation {
  purchaseId: string;
  rootId: string;
  purchasedOn: DateString;
  createdAt: string;
  storeId: string | null;
  storeName: string | null;
  storeBranch: string | null;
  productId: string;
  variantId: string | null;
  productName: string;
  brand: string | null;
  variantLabel: string | null;
  mode: CompareMode;
  base: CompareBase;
  /** Quantidade vendida (variante) ou conteúdo total em milésimos da base (conteúdo). */
  quantityMilli: number;
  netCents: number;
  /** Preço líquido por unidade de comparação, como razão exata (centavos / milésimos). */
  unit: Ratio;
  /** Condições promocionais informadas nas linhas agrupadas. */
  conditions: string[];
  lines: number;
}

/** Base e quantidade de comparação de uma linha, ou `null` se a linha não é comparável. */
export function comparisonOf(line: ShoppingPurchaseLine, mode: CompareMode): { base: CompareBase; quantityMilli: number } | null {
  if (line.variantId === null || line.productId === null) return null;
  if (mode === 'variant') {
    return { base: line.saleUnit, quantityMilli: line.quantityMilli };
  }
  if (line.saleForm === 'package') {
    if (line.contentMilli === null || line.contentUnit === null) return null;
    const total = Math.round((line.quantityMilli * line.contentMilli) / 1000);
    return { base: line.contentUnit === 'un' ? 'un' : line.contentUnit, quantityMilli: total };
  }
  if (line.saleForm === 'loose' || line.saleForm === 'single') {
    return { base: line.saleUnit, quantityMilli: line.quantityMilli };
  }
  return null;
}

/**
 * Observações reais: uma por compra e por base de comparação. Várias linhas comparáveis
 * na mesma compra são somadas (líquido total ÷ quantidade ou conteúdo total), ponderando pela
 * quantidade, nunca por média simples. Ordenadas por data da compra e depois por instante.
 */
export function observations(purchases: readonly ShoppingPurchase[], mode: CompareMode): Observation[] {
  const groups = new Map<string, Observation>();
  for (const purchase of purchases) {
    if (purchase.status !== 'active') continue;
    for (const line of purchase.lines) {
      const comparison = comparisonOf(line, mode);
      if (!comparison || line.productId === null || line.variantId === null) continue;
      const key =
        mode === 'variant'
          ? `${purchase.id}|v|${line.variantId}`
          : `${purchase.id}|c|${line.productId}|${comparison.base}`;
      const current = groups.get(key);
      const condition = line.priceCondition;
      if (current) {
        current.netCents += line.netCents;
        current.quantityMilli += comparison.quantityMilli;
        current.lines += 1;
        if (condition && !current.conditions.includes(condition)) current.conditions.push(condition);
        current.unit = ratio(current.netCents * 1000, current.quantityMilli);
      } else {
        groups.set(key, {
          purchaseId: purchase.id,
          rootId: purchase.rootId,
          purchasedOn: purchase.purchasedOn,
          createdAt: purchase.createdAt,
          storeId: purchase.storeId,
          storeName: purchase.storeName,
          storeBranch: purchase.storeBranch,
          productId: line.productId,
          variantId: mode === 'variant' ? line.variantId : null,
          productName: line.productName,
          brand: line.brand,
          variantLabel: line.variantLabel,
          mode,
          base: comparison.base,
          quantityMilli: comparison.quantityMilli,
          netCents: line.netCents,
          unit: ratio(line.netCents * 1000, comparison.quantityMilli),
          conditions: condition ? [condition] : [],
          lines: 1,
        });
      }
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.purchasedOn.localeCompare(b.purchasedOn) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.purchaseId.localeCompare(b.purchaseId),
  );
}

export type Reference =
  | { kind: 'same_store'; observation: Observation }
  | { kind: 'other_store'; observation: Observation }
  | { kind: 'none' };

/**
 * Referência de preço para um item: a última compra anterior no mesmo mercado. Sem ela,
 * a última em outro mercado, identificada como tal. Nunca troca de mercado em silêncio.
 * `excludeRootId` evita comparar uma correção com a própria compra.
 */
export function referenceFor(
  observed: readonly Observation[],
  target: { variantId: string; storeId: string | null; excludeRootId?: string | null; before?: DateString | null },
): Reference {
  const candidates = observed.filter(
    (o) =>
      o.mode === 'variant' &&
      o.variantId === target.variantId &&
      o.rootId !== target.excludeRootId &&
      (target.before == null || o.purchasedOn <= target.before),
  );
  const last = (list: Observation[]) => list[list.length - 1];
  if (target.storeId !== null) {
    const same = last(candidates.filter((o) => o.storeId === target.storeId));
    if (same) return { kind: 'same_store', observation: same };
  }
  const other = last(candidates.filter((o) => o.storeId !== target.storeId || target.storeId === null));
  if (other) return { kind: 'other_store', observation: other };
  return { kind: 'none' };
}

/** Variação entre duas observações da mesma base. Percentual só com referência diferente de zero. */
export type Change =
  | { kind: 'equal' }
  | { kind: 'up' | 'down'; percent: number | null; absoluteCents: number }
  | { kind: 'free_previous'; absoluteCents: number }
  | { kind: 'insufficient' };

type Comparable = Pick<Observation, 'base' | 'mode' | 'unit'>;

/** Aceita observações reais ou um valor ainda não gravado (item confirmado na tela). */
export function changeBetween(current: Comparable | null | undefined, previous: Comparable | null | undefined): Change {
  if (!current || !previous || current.base !== previous.base || current.mode !== previous.mode) {
    return { kind: 'insufficient' };
  }
  const order = compareRatio(current.unit, previous.unit);
  if (order === 0) return { kind: 'equal' };
  const now = ratioToNumber(current.unit);
  const before = ratioToNumber(previous.unit);
  const absoluteCents = now - before;
  if (previous.unit.n === 0n) return { kind: 'free_previous', absoluteCents };
  return {
    kind: order > 0 ? 'up' : 'down',
    percent: (absoluteCents / before) * 100,
    absoluteCents,
  };
}

/** Preço de referência em centavos por unidade de comparação (arredondado meio para cima). */
export function observedUnitCents(observation: Observation): number {
  return ratioToCents(observation.unit);
}

/** Preço mais baixo registrado e a data em que ocorreu (desempate: compra mais antiga). */
export function lowestObservation(observed: readonly Observation[]): Observation | null {
  let best: Observation | null = null;
  for (const o of observed) {
    if (best === null || compareRatio(o.unit, best.unit) < 0) best = o;
  }
  return best;
}

export interface HistoryFilter {
  mode: CompareMode;
  /** Data mínima (inclusive), ou null para todo o período. */
  from?: DateString | null;
  storeId?: string | null;
  variantId?: string | null;
  base?: CompareBase | null;
}

export function filterObservations(observed: readonly Observation[], filter: HistoryFilter): Observation[] {
  return observed.filter(
    (o) =>
      o.mode === filter.mode &&
      (!filter.from || o.purchasedOn >= filter.from) &&
      (!filter.storeId || o.storeId === filter.storeId) &&
      (!filter.variantId || o.variantId === filter.variantId) &&
      (!filter.base || o.base === filter.base),
  );
}

/** Nome do mercado para exibição, sem tratar "não informado" como estabelecimento. */
export function storeLabel(name: string | null, branch: string | null): string {
  if (!name) return 'Mercado não informado';
  return branch ? `${name} · ${branch}` : name;
}
