import type { Remote } from '../backend/types';
import { AppError, parseOrThrow, toAppError } from './errors';
import type { DataStore } from './store';
import { observations, referenceFor } from '../domain/shopping/compare';
import { buildPurchaseLines, isConfirmed, itemPriceIssue, purchaseAdjustmentIssue, purchaseLineIssue, purchaseTotals } from '../domain/shopping/calc';
import { duplicateItems, estimateFromReference, isSuggestedEstimate, NO_ESTIMATE, repurchaseItems, type EstimateFields } from '../domain/shopping/carry';
import { grossCents } from '../domain/shopping/money';
import { MAX_QTY_MILLI } from '../domain/shopping/quantity';
import {
  itemInputSchema,
  listInputSchema,
  productInputSchema,
  storeInputSchema,
  type ParsedItemInput,
} from '../domain/shopping/schemas';
import type {
  ItemState,
  SaleForm,
  SaleUnit,
  ShoppingCategory,
  ShoppingItem,
  ShoppingList,
  ShoppingProduct,
  ShoppingPurchaseLine,
  ShoppingStore,
  ShoppingVariant,
  ContentUnit,
} from '../domain/shopping/types';
import { fieldErrors } from '../domain/schemas';

/** Entradas de formulário já validadas pelas funções desta camada. */
export interface StoreInput {
  name: string;
  branch: string | null;
}
export interface ProductInput {
  name: string;
  brand: string | null;
  variation: string | null;
  defaultCategory: ShoppingCategory;
}
export interface VariantInput {
  saleForm: SaleForm;
  /** Obrigatório para embalagens: conteúdo por pacote, na unidade base. */
  content: { contentMilli: number; contentUnit: ContentUnit } | null;
  label: string | null;
}
export interface ListInputValues {
  name: string;
  storeId: string | null;
  budgetCents: number | null;
  plannedFor: string | null;
}
export type ItemInput = ParsedItemInput;

export interface ConfirmInput {
  qtyMilli: number;
  unitPriceCents: number;
  discountCents: number;
  isFree: boolean;
  priceCondition: string | null;
}

export interface FinalizeValues {
  purchasedOn: string;
  storeId: string | null;
  globalDiscountCents: number;
  extraChargesCents: number;
  /** Nome da lista de pendências, se o usuário quer copiá-las; null para deixá-las de fora. */
  nextListName: string | null;
}

export interface CorrectLineValues {
  lineId: string;
  quantityMilli: number;
  unitPriceCents: number;
  discountCents: number;
  priceCondition: string | null;
}

export interface CorrectValues {
  reason: string;
  purchasedOn: string;
  storeId: string | null;
  budgetCents: number | null;
  globalDiscountCents: number;
  extraChargesCents: number;
  lines: CorrectLineValues[];
}

interface Ctx {
  store: DataStore;
  remote: Remote;
  enqueue: <T>(persist: () => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  clock: () => Date;
  newId: () => string;
}

const invalid = (message: string, fields: Record<string, string> = {}) => new AppError('validation', message, fields);

/** Compras: operações sobre listas, itens, cadastros e compras registradas. */
export function createShoppingOps(ctx: Ctx) {
  const { store, remote, enqueue, refresh, clock, newId } = ctx;
  const now = () => clock().toISOString();
  const data = () => store.getState().shopping;

  /** Aplica a mudança na cópia local, grava no servidor e desfaz se a gravação falhar. */
  async function commit(apply: () => void, rollback: () => void, persist: () => Promise<unknown>): Promise<void> {
    apply();
    try {
      await enqueue(persist);
    } catch (error) {
      rollback();
      void refresh().catch(() => undefined);
      throw toAppError(error);
    }
  }

  function requireList(id: string): ShoppingList {
    const list = data().lists.find((l) => l.id === id);
    if (!list) throw new AppError('not_found', 'Esta lista não existe mais.');
    return list;
  }

  function requireEditableList(id: string): ShoppingList {
    const list = requireList(id);
    if (list.status === 'finished') {
      throw new AppError('invalid_state', 'Esta lista já foi finalizada. Ela é só de consulta: para mudar uma compra, use Corrigir.');
    }
    return list;
  }

  function requireItem(id: string): ShoppingItem {
    const item = data().items.find((i) => i.id === id);
    if (!item) throw new AppError('not_found', 'Este item não existe mais. A tela foi atualizada.');
    return item;
  }

  function requireStore(id: string | null): ShoppingStore | null {
    if (id === null) return null;
    const found = data().stores.find((s) => s.id === id);
    if (!found) throw new AppError('not_found', 'O mercado escolhido não existe mais.', { storeId: 'Escolha outro mercado.' });
    return found;
  }

  function requireVariant(id: string | null): ShoppingVariant | null {
    if (id === null) return null;
    const found = data().variants.find((v) => v.id === id);
    if (!found) throw new AppError('not_found', 'A embalagem escolhida não existe mais.');
    return found;
  }

  function nextItemPosition(listId: string): number {
    let max = 0;
    for (const item of data().items) if (item.listId === listId && item.position > max) max = item.position;
    return max + 1;
  }

  /* ------------------------------ Mercados ------------------------------ */

  async function createStore(input: StoreInput): Promise<ShoppingStore> {
    const parsed = parseOrThrow(storeInputSchema, input);
    const ts = now();
    const created: ShoppingStore = { id: newId(), name: parsed.name, branch: parsed.branch, archivedAt: null, createdAt: ts, updatedAt: ts };
    await commit(
      () => store.putShoppingRows('stores', [created]),
      () => store.removeShoppingRow('stores', created.id),
      () => remote.saveShoppingStore(created),
    );
    return created;
  }

  async function setStoreArchived(id: string, archived: boolean): Promise<void> {
    const current = requireStore(id) as ShoppingStore;
    const next = { ...current, archivedAt: archived ? now() : null, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('stores', [next]),
      () => store.putShoppingRows('stores', [current]),
      () => remote.saveShoppingStore(next),
    );
  }

  /* ------------------------------ Produtos e embalagens ------------------------------ */

  async function createProduct(input: ProductInput): Promise<ShoppingProduct> {
    const parsed = parseOrThrow(productInputSchema, input);
    const ts = now();
    const created: ShoppingProduct = {
      id: newId(),
      name: parsed.name,
      brand: parsed.brand,
      variation: parsed.variation,
      defaultCategory: parsed.defaultCategory,
      archivedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    await commit(
      () => store.putShoppingRows('products', [created]),
      () => store.removeShoppingRow('products', created.id),
      () => remote.saveShoppingProduct(created),
    );
    return created;
  }

  async function updateProduct(id: string, input: ProductInput): Promise<ShoppingProduct> {
    const current = data().products.find((p) => p.id === id);
    if (!current) throw new AppError('not_found', 'Este produto não existe mais.');
    const parsed = parseOrThrow(productInputSchema, input);
    const next = { ...current, ...parsed, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('products', [next]),
      () => store.putShoppingRows('products', [current]),
      () => remote.saveShoppingProduct(next),
    );
    return next;
  }

  async function setProductArchived(id: string, archived: boolean): Promise<void> {
    const current = data().products.find((p) => p.id === id);
    if (!current) throw new AppError('not_found', 'Este produto não existe mais.');
    const next = { ...current, archivedAt: archived ? now() : null, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('products', [next]),
      () => store.putShoppingRows('products', [current]),
      () => remote.saveShoppingProduct(next),
    );
  }

  function validateVariant(input: VariantInput): Omit<ShoppingVariant, 'id' | 'productId' | 'archivedAt' | 'createdAt' | 'updatedAt'> {
    const label = input.label?.trim() ? input.label.trim() : null;
    if (input.saleForm === 'package') {
      if (!input.content) throw invalid('Informe o conteúdo de cada pacote, por exemplo 500 g ou 1 L.', { content: 'Informe o conteúdo.' });
      if (input.content.contentMilli <= 0 || input.content.contentMilli > MAX_QTY_MILLI) {
        throw invalid('O conteúdo do pacote está fora do limite.', { content: 'Conteúdo inválido.' });
      }
      return { saleForm: 'package', saleUnit: 'un', contentMilli: input.content.contentMilli, contentUnit: input.content.contentUnit, label };
    }
    if (input.saleForm === 'loose') {
      // Avulso: vendido por kg ou L; a unidade é escolhida pelo tipo de conteúdo informado.
      const unit: SaleUnit = input.content?.contentUnit === 'L' ? 'L' : 'kg';
      return { saleForm: 'loose', saleUnit: unit, contentMilli: null, contentUnit: null, label };
    }
    return { saleForm: 'single', saleUnit: 'un', contentMilli: null, contentUnit: null, label };
  }

  async function createVariant(productId: string, input: VariantInput): Promise<ShoppingVariant> {
    if (!data().products.some((p) => p.id === productId)) throw new AppError('not_found', 'Este produto não existe mais.');
    const values = validateVariant(input);
    const ts = now();
    const created: ShoppingVariant = { id: newId(), productId, ...values, archivedAt: null, createdAt: ts, updatedAt: ts };
    await commit(
      () => store.putShoppingRows('variants', [created]),
      () => store.removeShoppingRow('variants', created.id),
      () => remote.saveShoppingVariant(created),
    );
    return created;
  }

  /**
   * Alterar a embalagem de uma variante já usada em compras cria outra variante: o histórico
   * continua apontando para o conteúdo que foi realmente comprado.
   */
  async function updateVariant(id: string, input: VariantInput): Promise<ShoppingVariant> {
    const current = requireVariant(id) as ShoppingVariant;
    const values = validateVariant(input);
    const changed =
      values.saleForm !== current.saleForm ||
      values.contentMilli !== current.contentMilli ||
      values.contentUnit !== current.contentUnit;
    const used = data().purchases.some((p) => p.lines.some((l) => l.variantId === id));
    if (changed && used) {
      const replacement = await createVariant(current.productId, input);
      await archiveVariant(current.id, true);
      return replacement;
    }
    const ts = now();
    const next: ShoppingVariant = { ...current, ...values, updatedAt: ts };
    await commit(
      () => store.putShoppingRows('variants', [next]),
      () => store.putShoppingRows('variants', [current]),
      () => remote.saveShoppingVariant(next),
    );
    return next;
  }

  async function archiveVariant(id: string, archived: boolean): Promise<void> {
    const current = requireVariant(id) as ShoppingVariant;
    const next = { ...current, archivedAt: archived ? now() : null, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('variants', [next]),
      () => store.putShoppingRows('variants', [current]),
      () => remote.saveShoppingVariant(next),
    );
  }

  /* ------------------------------ Listas ------------------------------ */

  function listPayload(values: ListInputValues, id: string, status: ShoppingList['status'], createdAt: string): ShoppingList {
    return {
      id,
      name: values.name,
      storeId: values.storeId,
      budgetCents: values.budgetCents,
      plannedFor: values.plannedFor,
      status,
      completedPurchaseId: null,
      archivedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  function parseList(input: unknown): ListInputValues {
    const parsed = listInputSchema.safeParse(input);
    if (!parsed.success) {
      const fields = fieldErrors(parsed.error);
      throw invalid(Object.values(fields)[0] ?? 'Dados inválidos.', fields);
    }
    requireStore(parsed.data.storeId);
    return parsed.data;
  }

  async function createShoppingList(input: unknown): Promise<ShoppingList> {
    const values = parseList(input);
    const list = listPayload(values, newId(), 'draft', now());
    await commit(
      () => store.putShoppingRows('lists', [list]),
      () => store.removeShoppingList(list.id),
      () => remote.createShoppingList(list, []),
    );
    return list;
  }

  async function updateShoppingList(id: string, input: unknown): Promise<ShoppingList> {
    const current = requireEditableList(id);
    const values = parseList(input);
    const next: ShoppingList = { ...current, ...values, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('lists', [next]),
      () => store.putShoppingRows('lists', [current]),
      () => remote.saveShoppingList(next),
    );
    return next;
  }

  /** Muda o mercado. Estimativas sugeridas podem ser atualizadas; as digitadas à mão ficam. */
  async function changeListStore(id: string, storeId: string | null, updateSuggestions: boolean): Promise<number> {
    const current = requireEditableList(id);
    requireStore(storeId);
    const next: ShoppingList = { ...current, storeId, updatedAt: now() };
    const observed = observations(data().purchases.filter((p) => p.status === 'active'), 'variant');
    const changedItems: ShoppingItem[] = [];
    if (updateSuggestions) {
      for (const item of data().items) {
        if (item.listId !== id || !isSuggestedEstimate(item) || item.variantId === null) continue;
        // Só o mesmo mercado é aplicado sozinho; outro mercado exige escolha explícita na tela.
        const reference = referenceFor(observed, { variantId: item.variantId, storeId });
        if (reference.kind !== 'same_store') continue;
        changedItems.push({ ...item, ...estimateFromReference(reference), updatedAt: now() });
      }
    }
    const previousItems = data().items.filter((i) => changedItems.some((c) => c.id === i.id));
    await commit(
      () => {
        store.putShoppingRows('lists', [next]);
        store.putShoppingRows('items', changedItems);
      },
      () => {
        store.putShoppingRows('lists', [current]);
        store.putShoppingRows('items', previousItems);
      },
      async () => {
        await remote.saveShoppingList(next);
        if (changedItems.length > 0) await remote.saveShoppingItems(changedItems);
      },
    );
    return changedItems.length;
  }

  /** Iniciar a compra (modo mercado) ou voltar ao planejamento. */
  async function setListMode(id: string, status: 'shopping' | 'draft'): Promise<void> {
    const current = requireEditableList(id);
    if (current.status === status) return;
    const next: ShoppingList = { ...current, status, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('lists', [next]),
      () => store.putShoppingRows('lists', [current]),
      () => remote.saveShoppingList(next),
    );
  }

  async function setListArchived(id: string, archived: boolean): Promise<void> {
    const current = requireList(id);
    const next: ShoppingList = { ...current, archivedAt: archived ? now() : null, updatedAt: now() };
    await commit(
      () => store.putShoppingRows('lists', [next]),
      () => store.putShoppingRows('lists', [current]),
      () => remote.saveShoppingList(next),
    );
  }

  async function deleteShoppingList(id: string): Promise<void> {
    requireEditableList(id);
    const current = requireList(id);
    const items = data().items.filter((i) => i.listId === id);
    store.removeShoppingList(id);
    try {
      await enqueue(() => remote.deleteShoppingList(id));
    } catch (error) {
      store.putShoppingRows('lists', [current]);
      store.putShoppingRows('items', items);
      throw toAppError(error);
    }
  }

  /** Cria uma lista nova com os itens copiados (duplicar ou recomprar). Nunca cria despesa. */
  async function createListWithItems(id: string, name: string, storeId: string | null, items: ShoppingItem[]): Promise<ShoppingList> {
    const values = parseList({ name, storeId, budgetCents: null, plannedFor: null });
    const list = listPayload(values, id, 'draft', now());
    await commit(
      () => {
        store.putShoppingRows('lists', [list]);
        store.putShoppingRows('items', items);
      },
      () => {
        store.removeShoppingList(list.id);
      },
      () => remote.createShoppingList(list, items),
    );
    return list;
  }

  async function duplicateList(sourceId: string, name: string): Promise<ShoppingList> {
    const source = requireList(sourceId);
    const listId = newId();
    const items = duplicateItems(
      data().items.filter((i) => i.listId === sourceId),
      listId,
      newId,
      now(),
    );
    return createListWithItems(listId, name, source.storeId, items);
  }

  /** Recomprar: a partir da compra ativa, cria uma lista de pendências com o último preço efetivo. */
  async function repurchase(rootId: string, name: string): Promise<ShoppingList> {
    const active = data().purchases.find((p) => p.rootId === rootId && p.status === 'active');
    if (!active) throw new AppError('invalid_state', 'Esta compra foi anulada ou substituída. Recompre a revisão atual.');
    const listId = newId();
    const items = repurchaseItems(active, listId, newId, now());
    return createListWithItems(listId, name, active.storeId, items);
  }

  /* ------------------------------ Itens ------------------------------ */

  function parseItem(input: unknown): ItemInput {
    const parsed = itemInputSchema.safeParse(input);
    if (!parsed.success) {
      const fields = fieldErrors(parsed.error);
      throw invalid(Object.values(fields)[0] ?? 'Dados inválidos.', fields);
    }
    const values = parsed.data;
    if (values.variantId) {
      const variant = requireVariant(values.variantId) as ShoppingVariant;
      if (variant.saleUnit !== values.saleUnit) {
        throw invalid('A unidade do item não confere com a embalagem escolhida.', { saleUnit: 'Use a unidade da embalagem.' });
      }
    }
    if (values.productId && !data().products.some((p) => p.id === values.productId)) {
      throw new AppError('not_found', 'Este produto não existe mais.');
    }
    if (values.plannedQtyMilli > MAX_QTY_MILLI) throw invalid('Quantidade grande demais.', { plannedQtyMilli: 'Quantidade grande demais.' });
    if (values.saleUnit === 'un' && values.plannedQtyMilli % 1000 !== 0) {
      throw invalid('Em unidades, a quantidade planejada é um número inteiro.', { plannedQtyMilli: 'Use um número inteiro.' });
    }
    return values;
  }

  /** Sugestão de estimativa para uma embalagem em um mercado (sem gravar nada). */
  function suggestEstimate(variantId: string, storeId: string | null): { estimate: EstimateFields; kind: 'same_store' | 'other_store' | 'none'; storeName: string | null; date: string | null } {
    const observed = observations(data().purchases.filter((p) => p.status === 'active'), 'variant');
    const reference = referenceFor(observed, { variantId, storeId });
    if (reference.kind === 'none') return { estimate: NO_ESTIMATE, kind: 'none', storeName: null, date: null };
    return {
      estimate: estimateFromReference(reference),
      kind: reference.kind,
      storeName: reference.observation.storeName,
      date: reference.observation.purchasedOn,
    };
  }

  async function addItem(listId: string, input: unknown): Promise<ShoppingItem> {
    requireEditableList(listId);
    const values = parseItem(input);
    const ts = now();
    const item: ShoppingItem = {
      id: newId(),
      listId,
      position: nextItemPosition(listId),
      label: values.label,
      category: values.category,
      note: values.note,
      productId: values.productId,
      variantId: values.variantId,
      saleUnit: values.saleUnit,
      plannedQtyMilli: values.plannedQtyMilli,
      estUnitPriceCents: values.estUnitPriceCents,
      estSource: values.estSource,
      estRefDate: values.estRefDate,
      estRefStoreName: values.estRefStoreName,
      estRefCondition: values.estRefCondition,
      actualQtyMilli: null,
      actualUnitPriceCents: null,
      priceConfirmed: false,
      isFree: false,
      itemDiscountCents: 0,
      priceCondition: null,
      state: 'pending',
      createdAt: ts,
      updatedAt: ts,
    };
    await commit(
      () => store.putShoppingRows('items', [item]),
      () => store.removeShoppingRow('items', item.id),
      () => remote.saveShoppingItems([item]),
    );
    return item;
  }

  async function updateItem(id: string, input: unknown): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    const values = parseItem(input);
    return saveItemPatch(current, values);
  }

  async function saveItemPatch(current: ShoppingItem, patch: Partial<ShoppingItem>): Promise<ShoppingItem> {
    const next: ShoppingItem = { ...current, ...patch, updatedAt: now() };
    const issue = itemPriceIssue(next);
    if (issue) throw invalid(issue);
    await commit(
      () => store.putShoppingRows('items', [next]),
      () => store.putShoppingRows('items', [current]),
      () => remote.saveShoppingItems([next]),
    );
    return next;
  }

  /** Marca ou desmarca o item no carrinho. A linha e seus valores são preservados. */
  async function setItemState(id: string, state: ItemState): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    if (current.state === state) return current;
    return saveItemPatch(current, { state });
  }

  async function toggleCart(id: string): Promise<ShoppingItem> {
    const current = requireItem(id);
    return setItemState(id, current.state === 'in_cart' ? 'pending' : 'in_cart');
  }

  /** Confirma quantidade e preço efetivos. Preço zero exige gratuidade explícita. */
  async function confirmItem(id: string, values: ConfirmInput): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    if (values.qtyMilli <= 0) throw invalid('A quantidade efetiva precisa ser maior que zero.', { qty: 'Informe a quantidade.' });
    if (values.unitPriceCents === 0 && !values.isFree) {
      throw invalid('Preço zero: confirme que o item é gratuito, ou informe o preço.', { price: 'Preço zero exige confirmar item gratuito.' });
    }
    const priceCondition = values.priceCondition?.trim() ? values.priceCondition.trim() : null;
    return saveItemPatch(current, {
      actualQtyMilli: values.qtyMilli,
      actualUnitPriceCents: values.unitPriceCents,
      itemDiscountCents: values.discountCents,
      isFree: values.isFree,
      priceConfirmed: true,
      priceCondition,
    });
  }

  /** Usa a estimativa como preço efetivo (ação explícita; reduz a digitação no mercado). */
  async function confirmSuggestedPrice(id: string): Promise<ShoppingItem> {
    const current = requireItem(id);
    if (current.estUnitPriceCents === null) throw invalid('Este item não tem preço sugerido.');
    return confirmItem(id, {
      qtyMilli: current.actualQtyMilli ?? current.plannedQtyMilli,
      unitPriceCents: current.estUnitPriceCents,
      discountCents: 0,
      isFree: current.estUnitPriceCents === 0,
      priceCondition: current.estRefCondition,
    });
  }

  /** Desfaz a confirmação (volta a ser apenas estimativa). */
  async function clearConfirmation(id: string): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    return saveItemPatch(current, {
      actualQtyMilli: null,
      actualUnitPriceCents: null,
      priceConfirmed: false,
      isFree: false,
      itemDiscountCents: 0,
      priceCondition: null,
    });
  }

  /** Usa uma sugestão de outro mercado como estimativa, identificando a origem. */
  async function applySuggestion(id: string, estimate: EstimateFields): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    return saveItemPatch(current, estimate);
  }

  /** Desisti: o item sai da projeção e dos totais, mas a linha continua visível. */
  async function skipItem(id: string): Promise<ShoppingItem> {
    return setItemState(id, 'skipped');
  }

  async function deleteItem(id: string): Promise<void> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    await commit(
      () => store.removeShoppingRow('items', id),
      () => store.putShoppingRows('items', [current]),
      () => remote.deleteShoppingItem(id),
    );
  }

  /**
   * Dividir a linha: `takenQtyMilli` fica nesta linha (no carrinho quando já marcada) e o
   * restante vira um item pendente separado. As duas linhas são gravadas numa só operação.
   */
  async function splitItem(id: string, takenQtyMilli: number): Promise<ShoppingItem> {
    const current = requireItem(id);
    requireEditableList(current.listId);
    const remaining = current.plannedQtyMilli - takenQtyMilli;
    if (takenQtyMilli <= 0 || remaining <= 0) throw invalid('Divida em duas quantidades positivas.', { qty: 'Use uma quantidade menor que a planejada.' });
    if (current.saleUnit === 'un' && (takenQtyMilli % 1000 !== 0 || remaining % 1000 !== 0)) {
      throw invalid('Em unidades, divida em números inteiros.', { qty: 'Use unidades inteiras.' });
    }
    const ts = now();
    const kept: ShoppingItem = { ...current, plannedQtyMilli: takenQtyMilli, updatedAt: ts };
    const rest: ShoppingItem = {
      ...current,
      id: newId(),
      position: nextItemPosition(current.listId),
      plannedQtyMilli: remaining,
      state: 'pending',
      actualQtyMilli: null,
      actualUnitPriceCents: null,
      priceConfirmed: false,
      isFree: false,
      itemDiscountCents: 0,
      priceCondition: null,
      createdAt: ts,
      updatedAt: ts,
    };
    await commit(
      () => store.putShoppingRows('items', [kept, rest]),
      () => {
        store.putShoppingRows('items', [current]);
        store.removeShoppingRow('items', rest.id);
      },
      () => remote.saveShoppingItems([kept, rest]),
    );
    return kept;
  }

  /* ------------------------------ Finalização, correção e anulação ------------------------------ */

  /** Valores da compra como ficariam registrados (usado na revisão e na validação). */
  function previewPurchase(listId: string, values: { globalDiscountCents: number; extraChargesCents: number; purchasedOn: string; storeId: string | null }) {
    const list = requireList(listId);
    const items = data().items.filter((i) => i.listId === listId);
    const cart = items.filter((i) => i.state === 'in_cart');
    if (cart.length === 0) throw new AppError('validation', 'Coloque pelo menos um item no carrinho antes de finalizar.');
    const unconfirmed = cart.filter((i) => !isConfirmed(i));
    if (unconfirmed.length > 0) {
      throw invalid(`Confirme quantidade e preço de: ${unconfirmed.map((i) => i.label).join(', ')}.`);
    }
    const lines = buildPurchaseLines(items, { products: data().products, variants: data().variants }, 'preview');
    const totals = purchaseTotals(lines, values.globalDiscountCents, values.extraChargesCents);
    const adjust = purchaseAdjustmentIssue(totals.subtotalCents, values.globalDiscountCents, values.extraChargesCents);
    if (adjust) throw invalid(adjust, { globalDiscountCents: adjust });
    requireStore(values.storeId);
    return { list, lines, totals, pending: items.filter((i) => i.state === 'pending').length };
  }

  /**
   * Finaliza a compra numa transação no servidor. Repetir (clique duplo, outra aba) devolve
   * a compra já registrada; não cria outra compra nem outra lista de pendências.
   */
  async function finalizeList(listId: string, values: FinalizeValues): Promise<string> {
    const list = requireList(listId);
    // Já finalizada (clique duplo, outra aba, recarregamento): devolve a compra registrada.
    if (list.status === 'finished' && list.completedPurchaseId) return list.completedPurchaseId;
    previewPurchase(listId, values);
    const purchaseId = newId();
    const nextName = values.nextListName?.trim() ? values.nextListName.trim() : null;
    const nextList = nextName ? { id: newId(), name: nextName } : null;
    if (nextName && nextName.length > 80) throw invalid('O nome da lista pode ter até 80 caracteres.', { nextListName: 'Nome longo demais.' });
    try {
      const id = await remote.finalizeShoppingList({
        listId,
        purchaseId,
        purchasedOn: values.purchasedOn,
        storeId: values.storeId,
        budgetCents: list.budgetCents,
        globalDiscountCents: values.globalDiscountCents,
        extraChargesCents: values.extraChargesCents,
        nextList,
      });
      await refresh();
      return id;
    } catch (error) {
      void refresh().catch(() => undefined);
      throw toAppError(error);
    }
  }

  /**
   * Correção: uma nova revisão com os valores revisados. A revisão anterior fica preservada
   * como substituída. Exige motivo.
   */
  async function correctPurchase(rootId: string, values: CorrectValues): Promise<string> {
    const active = data().purchases.find((p) => p.rootId === rootId && p.status === 'active');
    if (!active) throw new AppError('invalid_state', 'Esta compra não pode ser corrigida (foi anulada ou substituída).');
    if (values.reason.trim().length < 3) throw invalid('Explique o motivo da correção (pelo menos 3 letras).', { reason: 'Informe o motivo.' });
    const newPurchaseId = newId();
    const lines: ShoppingPurchaseLine[] = [];
    values.lines.forEach((edit, index) => {
      const original = active.lines.find((l) => l.id === edit.lineId);
      if (!original) return;
      const gross = grossCents(edit.quantityMilli, edit.unitPriceCents);
      if (edit.discountCents < 0 || edit.discountCents > gross) {
        throw invalid(`"${original.productName}": o desconto não pode ser maior que o valor do item.`);
      }
      const line: ShoppingPurchaseLine = {
        ...original,
        id: newId(),
        purchaseId: newPurchaseId,
        position: index + 1,
        quantityMilli: edit.quantityMilli,
        unitPriceCents: edit.unitPriceCents,
        grossCents: gross,
        itemDiscountCents: edit.discountCents,
        netCents: gross - edit.discountCents,
        priceCondition: edit.priceCondition,
        isFree: edit.unitPriceCents === 0,
      };
      const issue = purchaseLineIssue(line);
      if (issue) throw invalid(issue);
      lines.push(line);
    });
    if (lines.length === 0) throw invalid('A compra precisa de pelo menos um item.');
    const store = requireStore(values.storeId);
    try {
      const id = await remote.correctShoppingPurchase({
        purchaseId: active.id,
        newId: newPurchaseId,
        reason: values.reason.trim(),
        purchasedOn: values.purchasedOn,
        storeId: store?.id ?? null,
        budgetCents: values.budgetCents,
        globalDiscountCents: values.globalDiscountCents,
        extraChargesCents: values.extraChargesCents,
        lines,
      });
      await refresh();
      return id;
    } catch (error) {
      void refresh().catch(() => undefined);
      throw toAppError(error);
    }
  }

  /** Anulação: exige motivo; a compra sai das análises, mas o registro continua visível. */
  async function voidPurchase(rootId: string, reason: string): Promise<void> {
    const active = data().purchases.find((p) => p.rootId === rootId && p.status !== 'superseded');
    if (!active) throw new AppError('not_found', 'Esta compra não existe mais.');
    if (reason.trim().length < 3) throw invalid('Explique o motivo da anulação (pelo menos 3 letras).', { reason: 'Informe o motivo.' });
    try {
      await remote.voidShoppingPurchase(active.id, reason.trim());
      await refresh();
    } catch (error) {
      void refresh().catch(() => undefined);
      throw toAppError(error);
    }
  }

  return {
    createStore,
    setStoreArchived,
    createProduct,
    updateProduct,
    setProductArchived,
    createVariant,
    updateVariant,
    archiveVariant,
    createShoppingList,
    updateShoppingList,
    changeListStore,
    setListMode,
    setListArchived,
    deleteShoppingList,
    duplicateList,
    repurchase,
    addItem,
    updateItem,
    setItemState,
    toggleCart,
    confirmItem,
    confirmSuggestedPrice,
    clearConfirmation,
    applySuggestion,
    skipItem,
    deleteItem,
    splitItem,
    suggestEstimate,
    previewPurchase,
    finalizeList,
    correctPurchase,
    voidPurchase,
  };
}

export type ShoppingOps = ReturnType<typeof createShoppingOps>;
