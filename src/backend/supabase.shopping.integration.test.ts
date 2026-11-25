import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepository } from '../db/repository';
import { DataStore } from '../db/store';
import { createSupabaseAuth, createSupabaseRemote } from './supabase';

/**
 * Compras contra o projeto Supabase real (RPCs, RLS e gatilhos). Roda via
 * `node scripts/integration-test.mjs`, que cria dois usuários temporários e os apaga ao final.
 */
const url = process.env.CLAREIA_IT_URL;
const key = process.env.CLAREIA_IT_KEY;
const users = JSON.parse(process.env.CLAREIA_IT_USERS ?? '[]') as { email: string; password: string }[];

const TODAY = '2026-11-24';
const stamp = Date.now();

const newClient = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

async function device(email: string, password: string) {
  const client = newClient();
  const auth = createSupabaseAuth(client);
  await auth.signIn(email, password);
  const store = new DataStore();
  const remote = createSupabaseRemote(client);
  const repo = createRepository(store, remote);
  await repo.load();
  return { client, auth, store, remote, repo };
}

function itemInput(over: Record<string, unknown> = {}) {
  return {
    label: 'Café',
    category: 'Mercearia',
    note: '',
    productId: null,
    variantId: null,
    saleUnit: 'un',
    plannedQtyMilli: 3000,
    estUnitPriceCents: 499,
    estSource: 'manual',
    estRefDate: null,
    estRefStoreName: null,
    estRefCondition: null,
    ...over,
  };
}

describe.skipIf(!url || users.length < 2)('Supabase real: compras', () => {
  let a: Awaited<ReturnType<typeof device>>;
  let other: Awaited<ReturnType<typeof device>>;
  let listId = '';
  let purchaseId = '';
  let rootId = '';
  let lineId = '';

  beforeAll(async () => {
    a = await device(users[0]!.email, users[0]!.password);
    other = await device(users[1]!.email, users[1]!.password);
  });

  afterAll(async () => {
    await Promise.all([a, other].filter(Boolean).map((d) => d.auth.signOut().catch(() => undefined)));
  });

  it('finaliza a compra uma vez: repetir a finalização devolve a mesma compra', async () => {
    const store = await a.repo.createStore({ name: `Mercado IT ${stamp}`, branch: null });
    const product = await a.repo.createProduct({ name: `Café IT ${stamp}`, brand: null, variation: null, defaultCategory: 'Mercearia' });
    const variant = await a.repo.createVariant(product.id, {
      saleForm: 'package',
      content: { contentMilli: 500, contentUnit: 'kg' },
      label: null,
    });
    const list = await a.repo.createShoppingList({ name: 'Compras IT', storeId: store.id, budgetCents: 5000, plannedFor: null });
    listId = list.id;
    const item = await a.repo.addItem(list.id, itemInput({ productId: product.id, variantId: variant.id }));
    await a.repo.toggleCart(item.id);
    await a.repo.confirmItem(item.id, { qtyMilli: 3000, unitPriceCents: 499, discountCents: 0, isFree: false, priceCondition: null });

    const values = { purchasedOn: TODAY, storeId: store.id, globalDiscountCents: 0, extraChargesCents: 0, nextListName: null };
    purchaseId = await a.repo.finalizeList(list.id, values);
    expect(await a.repo.finalizeList(list.id, values)).toBe(purchaseId);

    const purchase = a.store.getState().shopping.purchases.find((p) => p.id === purchaseId);
    expect(purchase?.totalCents).toBe(1497);
    rootId = purchase!.rootId;
    lineId = purchase!.lines[0]!.id;
  });

  it('a lista finalizada não aceita alteração, nem direta no banco', async () => {
    await expect(a.repo.updateShoppingList(listId, { name: 'Mudou', storeId: null, budgetCents: null, plannedFor: null })).rejects.toBeDefined();
    await a.client.from('shopping_lists').update({ name: 'Mudou direto' }).eq('id', listId);
    const { data } = await a.client.from('shopping_lists').select('name').eq('id', listId).single();
    expect(data?.name).toBe('Compras IT');
  });

  it('outra conta não vê nem altera as compras', async () => {
    await other.repo.load();
    const state = other.store.getState().shopping;
    expect(state.lists.some((l) => l.id === listId)).toBe(false);
    expect(state.purchases.some((p) => p.id === purchaseId)).toBe(false);

    const { data } = await other.client.from('shopping_purchases').select('id').eq('id', purchaseId);
    expect(data ?? []).toHaveLength(0);
    await other.client.from('shopping_purchases').update({ status: 'voided' }).eq('id', purchaseId);
    const { data: still } = await a.client.from('shopping_purchases').select('status').eq('id', purchaseId).single();
    expect(still?.status).toBe('active');
  });

  it('correção cria nova revisão e anulação mantém o registro', async () => {
    const revised = await a.repo.correctPurchase(rootId, {
      reason: 'Preço digitado errado',
      purchasedOn: TODAY,
      storeId: a.store.getState().shopping.purchases.find((p) => p.id === purchaseId)?.storeId ?? null,
      budgetCents: 5000,
      globalDiscountCents: 0,
      extraChargesCents: 0,
      lines: [{ lineId, quantityMilli: 3000, unitPriceCents: 599, discountCents: 0, priceCondition: null }],
    });
    expect(revised).not.toBe(purchaseId);

    await a.repo.load();
    const purchases = a.store.getState().shopping.purchases;
    expect(purchases.find((p) => p.id === purchaseId)?.status).toBe('superseded');
    expect(purchases.find((p) => p.id === revised)).toMatchObject({ status: 'active', revision: 2, totalCents: 1797 });

    await a.repo.voidPurchase(rootId, 'Lançada em duplicidade');
    await a.repo.load();
    const voided = a.store.getState().shopping.purchases.find((p) => p.id === revised);
    expect(voided).toMatchObject({ status: 'voided', voidReason: 'Lançada em duplicidade' });
  });
});
