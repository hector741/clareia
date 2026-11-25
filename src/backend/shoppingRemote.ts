import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShoppingData, ShoppingPurchase, ShoppingPurchaseLine } from '../domain/shopping/types';
import {
  itemFromRow,
  itemToRow,
  lineToRow,
  listFromShoppingRow,
  listToShoppingRow,
  productFromRow,
  productToRow,
  purchaseFromRow,
  purchaseToRow,
  storeFromRow,
  storeToRow,
  variantFromRow,
  variantToRow,
  type ItemRow,
  type LineRow,
  type ProductRow,
  type PurchaseRow,
  type ShoppingListRow,
  type StoreRow,
  type VariantRow,
} from './shoppingMapping';
import { focusSessionToRow, listToRow, taskToRow } from './mapping';
import type { CorrectInput, FinalizeInput, RestoreInput, Remote } from './types';
import type { ShoppingItem, ShoppingList, ShoppingProduct, ShoppingStore, ShoppingVariant } from '../domain/shopping/types';

export type ShoppingReadTable =
  | 'shopping_stores'
  | 'shopping_products'
  | 'shopping_variants'
  | 'shopping_lists'
  | 'shopping_items'
  | 'shopping_purchases'
  | 'shopping_purchase_lines';

type FetchRows = <T>(table: ShoppingReadTable) => Promise<T[]>;
type Check = (error: unknown) => void;

/** Operações do módulo Compras no Supabase. Escritas simples são upserts; as compostas são funções no banco. */
export function createShoppingRemote(client: SupabaseClient, fetchRows: FetchRows, check: Check) {
  const upsert = async (table: string, rows: object | object[]) => {
    const { error } = await client.from(table).upsert(rows, { onConflict: 'user_id,id' });
    check(error);
  };

  async function fetchShopping(): Promise<ShoppingData> {
    const [stores, products, variants, lists, items, purchases, lines] = await Promise.all([
      fetchRows<StoreRow>('shopping_stores'),
      fetchRows<ProductRow>('shopping_products'),
      fetchRows<VariantRow>('shopping_variants'),
      fetchRows<ShoppingListRow>('shopping_lists'),
      fetchRows<ItemRow>('shopping_items'),
      fetchRows<PurchaseRow>('shopping_purchases'),
      fetchRows<LineRow>('shopping_purchase_lines'),
    ]);
    return {
      stores: stores.map(storeFromRow),
      products: products.map(productFromRow),
      variants: variants.map(variantFromRow),
      lists: lists.map(listFromShoppingRow),
      items: items.map((r) => itemFromRow(r)),
      purchases: purchases.map((p) => purchaseFromRow(p, lines)),
    };
  }

  return {
    fetchShopping,
    methods: {
      async saveShoppingStore(store: ShoppingStore) {
        await upsert('shopping_stores', storeToRow(store));
      },
      async saveShoppingProduct(product: ShoppingProduct) {
        await upsert('shopping_products', productToRow(product));
      },
      async saveShoppingVariant(variant: ShoppingVariant) {
        await upsert('shopping_variants', variantToRow(variant));
      },
      async saveShoppingList(list: ShoppingList) {
        await upsert('shopping_lists', listToShoppingRow(list));
      },
      async deleteShoppingList(id: string) {
        const { error } = await client.from('shopping_lists').delete().eq('id', id);
        check(error);
      },
      async saveShoppingItems(items: ShoppingItem[]) {
        if (items.length === 0) return;
        await upsert('shopping_items', items.map(itemToRow));
      },
      async deleteShoppingItem(id: string) {
        const { error } = await client.from('shopping_items').delete().eq('id', id);
        check(error);
      },
      async createShoppingList(list: ShoppingList, items: ShoppingItem[]) {
        const { error } = await client.rpc('shopping_create_list', {
          p_list: listToShoppingRow(list),
          p_items: items.map(itemToRow),
        });
        check(error);
      },
      async finalizeShoppingList(input: FinalizeInput): Promise<string> {
        const { data, error } = await client.rpc('shopping_finalize', {
          p_list_id: input.listId,
          p_purchase_id: input.purchaseId,
          p_purchased_on: input.purchasedOn,
          p_store_id: input.storeId,
          p_budget_cents: input.budgetCents,
          p_global_discount_cents: input.globalDiscountCents,
          p_extra_charges_cents: input.extraChargesCents,
          p_next_list_id: input.nextList?.id ?? null,
          p_next_list_name: input.nextList?.name ?? null,
        });
        check(error);
        return String(data);
      },
      async correctShoppingPurchase(input: CorrectInput): Promise<string> {
        const { data, error } = await client.rpc('shopping_correct', {
          p_purchase_id: input.purchaseId,
          p_new_id: input.newId,
          p_reason: input.reason,
          p_purchased_on: input.purchasedOn,
          p_store_id: input.storeId,
          p_budget_cents: input.budgetCents,
          p_global_discount_cents: input.globalDiscountCents,
          p_extra_charges_cents: input.extraChargesCents,
          p_lines: input.lines.map((l) => lineToRow({ ...l, purchaseId: input.newId })),
        });
        check(error);
        return String(data);
      },
      async voidShoppingPurchase(purchaseId: string, reason: string) {
        const { error } = await client.rpc('shopping_void', { p_purchase_id: purchaseId, p_reason: reason });
        check(error);
      },
      async restoreBackup(input: RestoreInput) {
        const shopping = input.shopping;
        const { error } = await client.rpc('restore_backup', {
          p_lists: input.lists.map(listToRow),
          p_tasks: input.tasks.map(taskToRow),
          p_sessions: input.focusSessions.map(focusSessionToRow),
          p_shopping: shopping
            ? {
                stores: shopping.stores.map(storeToRow),
                products: shopping.products.map(productToRow),
                variants: shopping.variants.map(variantToRow),
                lists: shopping.lists.map(listToShoppingRow),
                items: shopping.items.map(itemToRow),
                purchases: shopping.purchases.map((p: ShoppingPurchase) => purchaseToRow(p)),
                lines: shopping.purchases.flatMap((p) => p.lines.map((l: ShoppingPurchaseLine) => lineToRow(l))),
              }
            : null,
        });
        check(error);
      },
    } satisfies Partial<Remote>,
  };
}
