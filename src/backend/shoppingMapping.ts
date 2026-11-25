import type { DateString } from '../domain/types';
import type {
  ShoppingItem,
  ShoppingList,
  ShoppingProduct,
  ShoppingPurchase,
  ShoppingPurchaseLine,
  ShoppingStore,
  ShoppingVariant,
} from '../domain/shopping/types';

/** Linhas do PostgREST para o módulo Compras (snake_case). */

export interface StoreRow {
  id: string;
  name: string;
  branch: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  variation: string | null;
  default_category: ShoppingProduct['defaultCategory'];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VariantRow {
  id: string;
  product_id: string;
  sale_form: ShoppingVariant['saleForm'];
  sale_unit: ShoppingVariant['saleUnit'];
  content_milli: number | null;
  content_unit: ShoppingVariant['contentUnit'];
  label: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListRow {
  id: string;
  name: string;
  store_id: string | null;
  budget_cents: number | null;
  planned_for: DateString | null;
  status: ShoppingList['status'];
  completed_purchase_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  list_id: string;
  position: number;
  label: string;
  category: ShoppingItem['category'];
  note: string;
  product_id: string | null;
  variant_id: string | null;
  sale_unit: ShoppingItem['saleUnit'];
  planned_qty_milli: number;
  est_unit_price_cents: number | null;
  est_source: ShoppingItem['estSource'];
  est_ref_date: DateString | null;
  est_ref_store_name: string | null;
  est_ref_condition: string | null;
  actual_qty_milli: number | null;
  actual_unit_price_cents: number | null;
  price_confirmed: boolean;
  is_free: boolean;
  item_discount_cents: number;
  price_condition: string | null;
  state: ShoppingItem['state'];
  created_at: string;
  updated_at: string;
}

export interface PurchaseRow {
  id: string;
  root_id: string;
  source_list_id: string | null;
  revision: number;
  status: ShoppingPurchase['status'];
  supersedes_id: string | null;
  correction_reason: string | null;
  void_reason: string | null;
  purchased_on: DateString;
  store_id: string | null;
  store_name: string | null;
  store_branch: string | null;
  budget_cents: number | null;
  subtotal_cents: number;
  global_discount_cents: number;
  extra_charges_cents: number;
  total_cents: number;
  created_at: string;
}

export interface LineRow {
  id: string;
  purchase_id: string;
  position: number;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  brand: string | null;
  variation: string | null;
  variant_label: string | null;
  category: ShoppingPurchaseLine['category'];
  sale_form: ShoppingPurchaseLine['saleForm'];
  sale_unit: ShoppingPurchaseLine['saleUnit'];
  content_milli: number | null;
  content_unit: ShoppingPurchaseLine['contentUnit'];
  quantity_milli: number;
  unit_price_cents: number;
  gross_cents: number;
  item_discount_cents: number;
  net_cents: number;
  price_condition: string | null;
  is_free: boolean;
}

/** Instantes sempre no formato de `Date#toISOString`, como no restante do app. */
const iso = (value: string): string => new Date(value).toISOString();
const isoOrNull = (value: string | null): string | null => (value === null ? null : iso(value));

export const storeFromRow = (r: StoreRow): ShoppingStore => ({
  id: r.id,
  name: r.name,
  branch: r.branch,
  archivedAt: isoOrNull(r.archived_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const storeToRow = (s: ShoppingStore): StoreRow => ({
  id: s.id,
  name: s.name,
  branch: s.branch,
  archived_at: s.archivedAt,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

export const productFromRow = (r: ProductRow): ShoppingProduct => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  variation: r.variation,
  defaultCategory: r.default_category,
  archivedAt: isoOrNull(r.archived_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const productToRow = (p: ShoppingProduct): ProductRow => ({
  id: p.id,
  name: p.name,
  brand: p.brand,
  variation: p.variation,
  default_category: p.defaultCategory,
  archived_at: p.archivedAt,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

export const variantFromRow = (r: VariantRow): ShoppingVariant => ({
  id: r.id,
  productId: r.product_id,
  saleForm: r.sale_form,
  saleUnit: r.sale_unit,
  contentMilli: r.content_milli,
  contentUnit: r.content_unit,
  label: r.label,
  archivedAt: isoOrNull(r.archived_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const variantToRow = (v: ShoppingVariant): VariantRow => ({
  id: v.id,
  product_id: v.productId,
  sale_form: v.saleForm,
  sale_unit: v.saleUnit,
  content_milli: v.contentMilli,
  content_unit: v.contentUnit,
  label: v.label,
  archived_at: v.archivedAt,
  created_at: v.createdAt,
  updated_at: v.updatedAt,
});

export const listFromShoppingRow = (r: ShoppingListRow): ShoppingList => ({
  id: r.id,
  name: r.name,
  storeId: r.store_id,
  budgetCents: r.budget_cents,
  plannedFor: r.planned_for,
  status: r.status,
  completedPurchaseId: r.completed_purchase_id,
  archivedAt: isoOrNull(r.archived_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const listToShoppingRow = (l: ShoppingList): ShoppingListRow => ({
  id: l.id,
  name: l.name,
  store_id: l.storeId,
  budget_cents: l.budgetCents,
  planned_for: l.plannedFor,
  status: l.status,
  completed_purchase_id: l.completedPurchaseId,
  archived_at: l.archivedAt,
  created_at: l.createdAt,
  updated_at: l.updatedAt,
});

export const itemFromRow = (r: ItemRow, listIdOverride?: string): ShoppingItem => ({
  id: r.id,
  listId: listIdOverride ?? r.list_id,
  position: r.position,
  label: r.label,
  category: r.category,
  note: r.note,
  productId: r.product_id,
  variantId: r.variant_id,
  saleUnit: r.sale_unit,
  plannedQtyMilli: r.planned_qty_milli,
  estUnitPriceCents: r.est_unit_price_cents,
  estSource: r.est_source,
  estRefDate: r.est_ref_date,
  estRefStoreName: r.est_ref_store_name,
  estRefCondition: r.est_ref_condition,
  actualQtyMilli: r.actual_qty_milli,
  actualUnitPriceCents: r.actual_unit_price_cents,
  priceConfirmed: r.price_confirmed,
  isFree: r.is_free,
  itemDiscountCents: r.item_discount_cents,
  priceCondition: r.price_condition,
  state: r.state,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const itemToRow = (i: ShoppingItem): ItemRow => ({
  id: i.id,
  list_id: i.listId,
  position: i.position,
  label: i.label,
  category: i.category,
  note: i.note,
  product_id: i.productId,
  variant_id: i.variantId,
  sale_unit: i.saleUnit,
  planned_qty_milli: i.plannedQtyMilli,
  est_unit_price_cents: i.estUnitPriceCents,
  est_source: i.estSource,
  est_ref_date: i.estRefDate,
  est_ref_store_name: i.estRefStoreName,
  est_ref_condition: i.estRefCondition,
  actual_qty_milli: i.actualQtyMilli,
  actual_unit_price_cents: i.actualUnitPriceCents,
  price_confirmed: i.priceConfirmed,
  is_free: i.isFree,
  item_discount_cents: i.itemDiscountCents,
  price_condition: i.priceCondition,
  state: i.state,
  created_at: i.createdAt,
  updated_at: i.updatedAt,
});

export const purchaseFromRow = (r: PurchaseRow, lines: LineRow[]): ShoppingPurchase => ({
  id: r.id,
  rootId: r.root_id,
  sourceListId: r.source_list_id,
  revision: r.revision,
  status: r.status,
  supersedesId: r.supersedes_id,
  correctionReason: r.correction_reason,
  voidReason: r.void_reason,
  purchasedOn: r.purchased_on,
  storeId: r.store_id,
  storeName: r.store_name,
  storeBranch: r.store_branch,
  budgetCents: r.budget_cents,
  subtotalCents: r.subtotal_cents,
  globalDiscountCents: r.global_discount_cents,
  extraChargesCents: r.extra_charges_cents,
  totalCents: r.total_cents,
  createdAt: iso(r.created_at),
  lines: lines
    .filter((l) => l.purchase_id === r.id)
    .sort((a, b) => a.position - b.position)
    .map(lineFromRow),
});

export const lineFromRow = (r: LineRow): ShoppingPurchaseLine => ({
  id: r.id,
  purchaseId: r.purchase_id,
  position: r.position,
  productId: r.product_id,
  variantId: r.variant_id,
  productName: r.product_name,
  brand: r.brand,
  variation: r.variation,
  variantLabel: r.variant_label,
  category: r.category,
  saleForm: r.sale_form,
  saleUnit: r.sale_unit,
  contentMilli: r.content_milli,
  contentUnit: r.content_unit,
  quantityMilli: r.quantity_milli,
  unitPriceCents: r.unit_price_cents,
  grossCents: r.gross_cents,
  itemDiscountCents: r.item_discount_cents,
  netCents: r.net_cents,
  priceCondition: r.price_condition,
  isFree: r.is_free,
});

export const lineToRow = (l: ShoppingPurchaseLine): LineRow => ({
  id: l.id,
  purchase_id: l.purchaseId,
  position: l.position,
  product_id: l.productId,
  variant_id: l.variantId,
  product_name: l.productName,
  brand: l.brand,
  variation: l.variation,
  variant_label: l.variantLabel,
  category: l.category,
  sale_form: l.saleForm,
  sale_unit: l.saleUnit,
  content_milli: l.contentMilli,
  content_unit: l.contentUnit,
  quantity_milli: l.quantityMilli,
  unit_price_cents: l.unitPriceCents,
  gross_cents: l.grossCents,
  item_discount_cents: l.itemDiscountCents,
  net_cents: l.netCents,
  price_condition: l.priceCondition,
  is_free: l.isFree,
});

export const purchaseToRow = (p: ShoppingPurchase): PurchaseRow => ({
  id: p.id,
  root_id: p.rootId,
  source_list_id: p.sourceListId,
  revision: p.revision,
  status: p.status,
  supersedes_id: p.supersedesId,
  correction_reason: p.correctionReason,
  void_reason: p.voidReason,
  purchased_on: p.purchasedOn,
  store_id: p.storeId,
  store_name: p.storeName,
  store_branch: p.storeBranch,
  budget_cents: p.budgetCents,
  subtotal_cents: p.subtotalCents,
  global_discount_cents: p.globalDiscountCents,
  extra_charges_cents: p.extraChargesCents,
  total_cents: p.totalCents,
  created_at: p.createdAt,
});
