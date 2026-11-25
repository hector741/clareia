import { isConfirmed } from '../domain/shopping/calc';
import { buildPurchaseLines, purchaseAdjustmentIssue, purchaseLineIssue, purchaseTotals } from '../domain/shopping/calc';
import { carryOverItems } from '../domain/shopping/carry';
import { shoppingIntegrityErrors } from '../domain/shopping/integrity';
import type { ShoppingData, ShoppingItem, ShoppingList, ShoppingPurchase } from '../domain/shopping/types';
import type { CorrectInput, FinalizeInput, Remote } from './types';

/**
 * Regras do módulo Compras no servidor simulado, espelhando o banco (migração
 * 20261125100000_shopping.sql): lista finalizada é só de consulta, finalização idempotente,
 * uma revisão aberta por compra, anulação e correção com motivo.
 */

type Write = <T>(fn: (data: { shopping: ShoppingData }) => T) => Promise<T>;

export function dbError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

const FINISHED_FIELDS = ['name', 'storeId', 'budgetCents', 'plannedFor', 'status', 'completedPurchaseId'] as const;

export function createMemoryShopping(write: Write): Pick<
  Remote,
  | 'saveShoppingStore'
  | 'saveShoppingProduct'
  | 'saveShoppingVariant'
  | 'saveShoppingList'
  | 'deleteShoppingList'
  | 'saveShoppingItems'
  | 'deleteShoppingItem'
  | 'createShoppingList'
  | 'finalizeShoppingList'
  | 'correctShoppingPurchase'
  | 'voidShoppingPurchase'
> {
  const upsertById = <T extends { id: string }>(rows: T[], row: T) => {
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
  };

  const requireList = (sh: ShoppingData, id: string): ShoppingList => {
    const list = sh.lists.find((l) => l.id === id);
    if (!list) throw dbError('not_found', 'P0002');
    return list;
  };

  const assertEditable = (sh: ShoppingData, listId: string) => {
    if (sh.lists.find((l) => l.id === listId)?.status === 'finished') throw dbError('finished_list', 'P0001');
  };

  return {
    saveShoppingStore: (store) => write(({ shopping }) => void upsertById(shopping.stores, store)),
    saveShoppingProduct: (product) => write(({ shopping }) => void upsertById(shopping.products, product)),
    saveShoppingVariant: (variant) =>
      write(({ shopping }) => {
        if (!shopping.products.some((p) => p.id === variant.productId)) throw dbError('fk', '23503');
        upsertById(shopping.variants, variant);
      }),
    saveShoppingList: (list) =>
      write(({ shopping }) => {
        const current = shopping.lists.find((l) => l.id === list.id);
        if (current?.status === 'finished') {
          const changed = FINISHED_FIELDS.some((f) => current[f] !== list[f]);
          if (changed) throw dbError('finished_list', 'P0001');
        }
        if (list.storeId !== null && !shopping.stores.some((s) => s.id === list.storeId)) throw dbError('fk', '23503');
        upsertById(shopping.lists, list);
      }),
    deleteShoppingList: (id) =>
      write(({ shopping }) => {
        shopping.lists = shopping.lists.filter((l) => l.id !== id);
        shopping.items = shopping.items.filter((i) => i.listId !== id);
      }),
    saveShoppingItems: (items) =>
      write(({ shopping }) => {
        for (const item of items) {
          assertEditable(shopping, item.listId);
          if (!shopping.lists.some((l) => l.id === item.listId)) throw dbError('fk', '23503');
          upsertById(shopping.items, item);
        }
      }),
    deleteShoppingItem: (id) =>
      write(({ shopping }) => {
        shopping.items = shopping.items.filter((i) => i.id !== id);
      }),
    createShoppingList: (list, items) =>
      write(({ shopping }) => {
        if (list.status === 'finished') throw dbError('shopping_invalid', 'P0001');
        if (shopping.lists.some((l) => l.id === list.id)) throw dbError('duplicate', '23505');
        shopping.lists.push(list);
        shopping.items.push(...items);
      }),
    finalizeShoppingList: (input: FinalizeInput) =>
      write(({ shopping }): string => {
        const list = requireList(shopping, input.listId);
        if (list.status === 'finished' && list.completedPurchaseId) return list.completedPurchaseId;
        if (shopping.purchases.some((p) => p.id === input.purchaseId)) return input.purchaseId;

        const cart = shopping.items.filter((i) => i.listId === list.id && i.state === 'in_cart');
        if (cart.length === 0) throw dbError('shopping_empty', 'P0001');
        if (cart.some((i) => !isConfirmed(i))) throw dbError('shopping_incomplete', 'P0001');
        const store = input.storeId ? shopping.stores.find((s) => s.id === input.storeId) : undefined;
        if (input.storeId && !store) throw dbError('not_found', 'P0002');

        const lines = buildPurchaseLines(cart, { products: shopping.products, variants: shopping.variants }, input.purchaseId);
        const totals = purchaseTotals(lines, input.globalDiscountCents, input.extraChargesCents);
        const adjust = purchaseAdjustmentIssue(totals.subtotalCents, input.globalDiscountCents, input.extraChargesCents);
        if (adjust) throw dbError('shopping_totals', 'P0001');

        const purchase: ShoppingPurchase = {
          id: input.purchaseId,
          rootId: input.purchaseId,
          sourceListId: list.id,
          revision: 1,
          status: 'active',
          supersedesId: null,
          correctionReason: null,
          voidReason: null,
          purchasedOn: input.purchasedOn,
          storeId: store?.id ?? null,
          storeName: store?.name ?? null,
          storeBranch: store?.branch ?? null,
          budgetCents: input.budgetCents,
          ...totals,
          createdAt: new Date().toISOString(),
          lines,
        };
        shopping.purchases.push(purchase);
        const now = new Date().toISOString();
        Object.assign(list, { status: 'finished', completedPurchaseId: input.purchaseId, updatedAt: now });

        if (input.nextList) {
          shopping.lists.push({
            id: input.nextList.id,
            name: input.nextList.name,
            storeId: list.storeId,
            budgetCents: null,
            plannedFor: null,
            status: 'draft',
            completedPurchaseId: null,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const pending = shopping.items.filter((i) => i.listId === list.id);
          shopping.items.push(...carryOverItems(pending, input.nextList.id, () => crypto.randomUUID(), now));
        }
        return input.purchaseId;
      }),
    correctShoppingPurchase: (input: CorrectInput) =>
      write(({ shopping }): string => {
        if (shopping.purchases.some((p) => p.id === input.newId)) return input.newId;
        const old = shopping.purchases.find((p) => p.id === input.purchaseId);
        if (!old) throw dbError('not_found', 'P0002');
        if (old.status !== 'active') throw dbError('shopping_stale', 'P0001');
        if (input.reason.trim().length < 3) throw dbError('shopping_reason', 'P0001');
        if (input.lines.length === 0) throw dbError('shopping_empty', 'P0001');
        const lines = input.lines.map((l) => ({ ...l, purchaseId: input.newId }));
        for (const line of lines) {
          const issue = purchaseLineIssue(line);
          if (issue) throw dbError('shopping_invalid', 'P0001');
        }
        const store = input.storeId ? shopping.stores.find((s) => s.id === input.storeId) : undefined;
        if (input.storeId && !store) throw dbError('not_found', 'P0002');
        const totals = purchaseTotals(lines, input.globalDiscountCents, input.extraChargesCents);
        if (purchaseAdjustmentIssue(totals.subtotalCents, input.globalDiscountCents, input.extraChargesCents)) {
          throw dbError('shopping_totals', 'P0001');
        }
        old.status = 'superseded';
        shopping.purchases.push({
          id: input.newId,
          rootId: old.rootId,
          sourceListId: old.sourceListId,
          revision: old.revision + 1,
          status: 'active',
          supersedesId: old.id,
          correctionReason: input.reason.trim(),
          voidReason: null,
          purchasedOn: input.purchasedOn,
          storeId: store?.id ?? null,
          storeName: store?.name ?? null,
          storeBranch: store?.branch ?? null,
          budgetCents: input.budgetCents,
          ...totals,
          createdAt: new Date().toISOString(),
          lines,
        });
        return input.newId;
      }),
    voidShoppingPurchase: (purchaseId, reason) =>
      write(({ shopping }) => {
        const purchase = shopping.purchases.find((p) => p.id === purchaseId);
        if (!purchase) throw dbError('not_found', 'P0002');
        if (purchase.status === 'voided') return;
        if (purchase.status !== 'active') throw dbError('shopping_stale', 'P0001');
        if (reason.trim().length < 3) throw dbError('shopping_reason', 'P0001');
        Object.assign(purchase, { status: 'voided', voidReason: reason.trim() });
      }),
  };
}

/** Valida o módulo inteiro antes de substituí-lo (restauração). Lança erro de validação. */
export function assertShoppingIntegrity(shopping: ShoppingData): void {
  const errors = shoppingIntegrityErrors(shopping);
  if (errors.length > 0) throw Object.assign(new Error(errors[0] ?? 'Dados de compras inválidos.'), { code: 'validation' });
}

export type { ShoppingItem };
