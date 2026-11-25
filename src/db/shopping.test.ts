import { describe, expect, it } from 'vitest';
import { createMemoryRemote, memoryKeyValue, type KeyValue } from '../backend/memory';
import { parseBackupText } from '../domain/backup';
import { emptyTaskInput } from '../domain/taskInput';
import type { BackupFile } from '../domain/types';
import { AppError } from './errors';
import { createRepository } from './repository';
import { DataStore } from './store';

const TODAY = '2026-11-24';

function setup(kv: KeyValue = memoryKeyValue()) {
  const clockRef = { now: new Date(2026, 10, 24, 10, 0, 0) };
  const remote = createMemoryRemote(kv, () => 'user-1', { failWrites: false });
  const store = new DataStore();
  const repo = createRepository(store, remote, () => clockRef.now);
  return { kv, remote, store, repo };
}

type Ctx = ReturnType<typeof setup>;

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

/** Cria catálogo, uma lista com um item (3 un a R$ 4,99) e finaliza a compra. */
async function buyOne(ctx: Ctx, storeName = 'Mercado A', unitPriceCents = 499) {
  const { repo } = ctx;
  const store = await repo.createStore({ name: storeName, branch: null });
  const product = await repo.createProduct({ name: 'Café', brand: 'Marca X', variation: null, defaultCategory: 'Mercearia' });
  const variant = await repo.createVariant(product.id, {
    saleForm: 'package',
    content: { contentMilli: 500, contentUnit: 'kg' },
    label: '500 g',
  });
  const list = await repo.createShoppingList({ name: 'Compras de hoje', storeId: store.id, budgetCents: 5000, plannedFor: null });
  const item = await repo.addItem(list.id, itemInput({ productId: product.id, variantId: variant.id }));
  await repo.toggleCart(item.id);
  await repo.confirmItem(item.id, { qtyMilli: 3000, unitPriceCents, discountCents: 0, isFree: false, priceCondition: null });
  const purchaseId = await repo.finalizeList(list.id, {
    purchasedOn: TODAY,
    storeId: store.id,
    globalDiscountCents: 0,
    extraChargesCents: 0,
    nextListName: null,
  });
  return { store, product, variant, list, item, purchaseId };
}

describe('compras: finalização', () => {
  it('registra a compra com total em centavos e bloqueia a lista finalizada', async () => {
    const ctx = setup();
    const { list, purchaseId } = await buyOne(ctx);
    const state = ctx.store.getState().shopping;

    expect(state.purchases).toHaveLength(1);
    const purchase = state.purchases[0]!;
    expect(purchase.id).toBe(purchaseId);
    expect(purchase.status).toBe('active');
    expect(purchase.totalCents).toBe(1497);
    expect(purchase.lines[0]?.grossCents).toBe(1497);

    const finished = state.lists.find((l) => l.id === list.id)!;
    expect(finished.status).toBe('finished');
    expect(finished.completedPurchaseId).toBe(purchaseId);

    await expect(ctx.repo.updateShoppingList(list.id, { name: 'Outro nome', storeId: null, budgetCents: null, plannedFor: null })).rejects.toBeInstanceOf(AppError);
  });

  it('repetir a finalização não cria outra compra', async () => {
    const ctx = setup();
    const { list, purchaseId } = await buyOne(ctx);
    const again = await ctx.repo.finalizeList(list.id, {
      purchasedOn: TODAY,
      storeId: ctx.store.getState().shopping.lists[0]!.storeId,
      globalDiscountCents: 0,
      extraChargesCents: 0,
      nextListName: 'Pendências',
    });
    expect(again).toBe(purchaseId);
    expect(ctx.store.getState().shopping.purchases).toHaveLength(1);
  });

  it('recusa finalizar com carrinho vazio ou item sem preço confirmado', async () => {
    const ctx = setup();
    const store = await ctx.repo.createStore({ name: 'Mercado A', branch: null });
    const list = await ctx.repo.createShoppingList({ name: 'Compras', storeId: store.id, budgetCents: null, plannedFor: null });
    const finalize = () =>
      ctx.repo.finalizeList(list.id, { purchasedOn: TODAY, storeId: store.id, globalDiscountCents: 0, extraChargesCents: 0, nextListName: null });

    await expect(finalize()).rejects.toMatchObject({ code: 'validation' });

    const item = await ctx.repo.addItem(list.id, itemInput());
    await ctx.repo.toggleCart(item.id);
    await expect(finalize()).rejects.toMatchObject({ code: 'validation' });
    expect(ctx.store.getState().shopping.purchases).toHaveLength(0);
  });

  it('copia as pendências para uma nova lista quando pedido e não mexe nas tarefas', async () => {
    const ctx = setup();
    await ctx.repo.createTask(emptyTaskInput({ title: 'Pagar contas' }));
    const tasksBefore = JSON.stringify(ctx.store.getState().tasks);

    const store = await ctx.repo.createStore({ name: 'Mercado A', branch: null });
    const list = await ctx.repo.createShoppingList({ name: 'Compras', storeId: store.id, budgetCents: null, plannedFor: null });
    const bought = await ctx.repo.addItem(list.id, itemInput({ label: 'Café' }));
    await ctx.repo.addItem(list.id, itemInput({ label: 'Arroz' }));
    await ctx.repo.toggleCart(bought.id);
    await ctx.repo.confirmItem(bought.id, { qtyMilli: 1000, unitPriceCents: 499, discountCents: 0, isFree: false, priceCondition: null });
    await ctx.repo.finalizeList(list.id, { purchasedOn: TODAY, storeId: store.id, globalDiscountCents: 0, extraChargesCents: 0, nextListName: 'Próximas' });

    const lists = ctx.store.getState().shopping.lists;
    const next = lists.find((l) => l.name === 'Próximas');
    expect(next).toBeDefined();
    expect(next?.status).toBe('draft');
    expect(ctx.store.getState().shopping.items.filter((i) => i.listId === next?.id).map((i) => i.label)).toEqual(['Arroz']);
    expect(JSON.stringify(ctx.store.getState().tasks)).toBe(tasksBefore);
  });
});

describe('compras: estimativas', () => {
  it('sugere o último preço do mesmo mercado e marca o de outro mercado como escolha explícita', async () => {
    const ctx = setup();
    const { variant, store } = await buyOne(ctx, 'Mercado A', 499);
    const other = await ctx.repo.createStore({ name: 'Mercado B', branch: null });

    const same = ctx.repo.suggestEstimate(variant.id, store.id);
    expect(same.kind).toBe('same_store');
    expect(same.estimate.estUnitPriceCents).toBe(499);

    const elsewhere = ctx.repo.suggestEstimate(variant.id, other.id);
    expect(elsewhere.kind).toBe('other_store');
    expect(elsewhere.storeName).toBe('Mercado A');

    const list = await ctx.repo.createShoppingList({ name: 'Compras B', storeId: other.id, budgetCents: null, plannedFor: null });
    const item = await ctx.repo.addItem(list.id, itemInput({ variantId: variant.id, estUnitPriceCents: null, estSource: null }));
    expect(item.estUnitPriceCents).toBeNull();
    const applied = await ctx.repo.applySuggestion(item.id, elsewhere.estimate);
    expect(applied.estUnitPriceCents).toBe(499);
    expect(applied.estRefStoreName).toBe('Mercado A');
  });
});

describe('compras: correção e anulação', () => {
  it('correção cria nova revisão, preserva a anterior e exige motivo', async () => {
    const ctx = setup();
    const { purchaseId, list } = await buyOne(ctx);
    const original = ctx.store.getState().shopping.purchases.find((p) => p.id === purchaseId)!;
    const line = original.lines[0]!;

    await expect(
      ctx.repo.correctPurchase(original.rootId, {
        reason: '',
        purchasedOn: TODAY,
        storeId: original.storeId,
        budgetCents: 5000,
        globalDiscountCents: 0,
        extraChargesCents: 0,
        lines: [{ lineId: line.id, quantityMilli: 3000, unitPriceCents: 599, discountCents: 0, priceCondition: null }],
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    const revisedId = await ctx.repo.correctPurchase(original.rootId, {
      reason: 'Preço digitado errado',
      purchasedOn: TODAY,
      storeId: original.storeId,
      budgetCents: 5000,
      globalDiscountCents: 0,
      extraChargesCents: 0,
      lines: [{ lineId: line.id, quantityMilli: 3000, unitPriceCents: 599, discountCents: 0, priceCondition: null }],
    });

    const purchases = ctx.store.getState().shopping.purchases;
    expect(purchases).toHaveLength(2);
    const old = purchases.find((p) => p.id === purchaseId)!;
    const revised = purchases.find((p) => p.id === revisedId)!;
    expect(old.status).toBe('superseded');
    expect(revised.status).toBe('active');
    expect(revised.revision).toBe(2);
    expect(revised.supersedesId).toBe(purchaseId);
    expect(revised.correctionReason).toBe('Preço digitado errado');
    expect(revised.totalCents).toBe(1797);
    expect(ctx.store.getState().shopping.lists.find((l) => l.id === list.id)?.completedPurchaseId).toBe(purchaseId);
  });

  it('anulação mantém o registro com o motivo', async () => {
    const ctx = setup();
    const { purchaseId } = await buyOne(ctx);
    const rootId = ctx.store.getState().shopping.purchases.find((p) => p.id === purchaseId)!.rootId;

    await expect(ctx.repo.voidPurchase(rootId, 'ok')).rejects.toMatchObject({ code: 'validation' });
    await ctx.repo.voidPurchase(rootId, 'Lançada em duplicidade');

    const purchases = ctx.store.getState().shopping.purchases;
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.status).toBe('voided');
    expect(purchases[0]?.voidReason).toBe('Lançada em duplicidade');
  });
});

describe('compras: backup', () => {
  it('v2 preserva compras, listas e revisões ao restaurar', async () => {
    const src = setup();
    await buyOne(src);
    const backup = await src.repo.exportBackup();
    expect(backup.schemaVersion).toBe(2);

    const parsed = parseBackupText(JSON.stringify(backup), TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.shopping).toMatchObject({ purchases: 1 });

    const dst = setup();
    await dst.repo.restoreBackup(parsed.backup);
    expect(dst.store.getState().shopping.purchases).toEqual(src.store.getState().shopping.purchases);
    expect(dst.store.getState().shopping.lists).toEqual(src.store.getState().shopping.lists);
  });

  it('v1 não traz compras: restaurar mantém as compras existentes', async () => {
    const src = setup();
    await buyOne(src);
    const v1 = { ...(await src.repo.exportBackup()), schemaVersion: 1 } as Partial<BackupFile>;
    delete v1.shopping;

    const parsed = parseBackupText(JSON.stringify(v1), TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const dst = setup();
    await buyOne(dst, 'Outro mercado', 650);
    const before = dst.store.getState().shopping.purchases.length;
    await dst.repo.restoreBackup(parsed.backup);
    expect(dst.store.getState().shopping.purchases).toHaveLength(before);
  });

  it('recusa versões futuras e blocos de compras inconsistentes', async () => {
    const src = setup();
    await buyOne(src);
    const backup = await src.repo.exportBackup();

    expect(parseBackupText(JSON.stringify({ ...backup, schemaVersion: 3 }), TODAY).ok).toBe(false);

    const bad = structuredClone(backup);
    const shopping = bad.shopping!;
    shopping.items = [{ ...shopping.items[0]!, listId: crypto.randomUUID() }];
    const parsed = parseBackupText(JSON.stringify(bad), TODAY);
    const dst = setup();
    if (parsed.ok) {
      await expect(dst.repo.restoreBackup(parsed.backup)).rejects.toBeInstanceOf(AppError);
    } else {
      expect(parsed.ok).toBe(false);
    }
    expect(dst.store.getState().shopping.purchases).toHaveLength(0);
  });
});
