import type { DateString, IsoInstant } from '../types';

/** Módulo Compras: listas de supermercado. Dinheiro em centavos; quantidades em milésimos. */

export const SALE_UNITS = ['un', 'kg', 'L'] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

/** Base de comparação de conteúdo: massa (kg), volume (L) ou unidade. */
export const CONTENT_UNITS = ['kg', 'L', 'un'] as const;
export type ContentUnit = (typeof CONTENT_UNITS)[number];

/** package: embalagem contada em pacotes; loose: avulso por kg/L; single: unidade avulsa. */
export const SALE_FORMS = ['package', 'loose', 'single'] as const;
export type SaleForm = (typeof SALE_FORMS)[number];

export const LIST_STATUSES = ['draft', 'shopping', 'finished'] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const ITEM_STATES = ['pending', 'in_cart', 'skipped'] as const;
export type ItemState = (typeof ITEM_STATES)[number];

/** Origem da estimativa: digitada, sugerida pela última compra (mesmo mercado ou outro), ou copiada. */
export const ESTIMATE_SOURCES = ['manual', 'last_purchase', 'other_store', 'copied'] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

export const PURCHASE_STATUSES = ['active', 'superseded', 'voided'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const SHOPPING_CATEGORIES = [
  'Hortifruti',
  'Açougue',
  'Laticínios',
  'Mercearia',
  'Bebidas',
  'Padaria',
  'Congelados',
  'Higiene',
  'Limpeza',
  'Outros',
] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export interface ShoppingStore {
  id: string;
  name: string;
  branch: string | null;
  archivedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/** Produto: família do item (ex.: café Marca X). Não funde identidades automaticamente. */
export interface ShoppingProduct {
  id: string;
  name: string;
  brand: string | null;
  variation: string | null;
  defaultCategory: ShoppingCategory;
  archivedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/**
 * Variante: forma de venda e conteúdo por unidade vendida. `contentMilli` é o conteúdo
 * em milésimos da unidade base (500 g = 500 em kg; 6 L = 6000 em L; 12 un = 12000 em un).
 */
export interface ShoppingVariant {
  id: string;
  productId: string;
  saleForm: SaleForm;
  saleUnit: SaleUnit;
  contentMilli: number | null;
  contentUnit: ContentUnit | null;
  label: string | null;
  archivedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ShoppingList {
  id: string;
  name: string;
  storeId: string | null;
  budgetCents: number | null;
  plannedFor: DateString | null;
  status: ListStatus;
  /** Raiz da compra registrada (ao finalizar). */
  completedPurchaseId: string | null;
  archivedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  position: number;
  label: string;
  category: ShoppingCategory;
  note: string;
  productId: string | null;
  variantId: string | null;
  saleUnit: SaleUnit;
  /** Quantidade planejada (estimada) em milésimos da unidade de venda. */
  plannedQtyMilli: number;
  estUnitPriceCents: number | null;
  estSource: EstimateSource | null;
  estRefDate: DateString | null;
  estRefStoreName: string | null;
  estRefCondition: string | null;
  /** Quantidade e preço efetivos (preenchidos na compra). */
  actualQtyMilli: number | null;
  actualUnitPriceCents: number | null;
  priceConfirmed: boolean;
  isFree: boolean;
  itemDiscountCents: number;
  priceCondition: string | null;
  state: ItemState;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ShoppingPurchaseLine {
  id: string;
  purchaseId: string;
  position: number;
  productId: string | null;
  variantId: string | null;
  productName: string;
  brand: string | null;
  variation: string | null;
  variantLabel: string | null;
  category: ShoppingCategory;
  saleForm: SaleForm | null;
  saleUnit: SaleUnit;
  contentMilli: number | null;
  contentUnit: ContentUnit | null;
  quantityMilli: number;
  unitPriceCents: number;
  grossCents: number;
  itemDiscountCents: number;
  netCents: number;
  priceCondition: string | null;
  isFree: boolean;
}

/** Compra registrada. Cada correção é uma nova revisão; só uma revisão `active` por raiz. */
export interface ShoppingPurchase {
  id: string;
  rootId: string;
  sourceListId: string | null;
  revision: number;
  status: PurchaseStatus;
  supersedesId: string | null;
  correctionReason: string | null;
  voidReason: string | null;
  purchasedOn: DateString;
  storeId: string | null;
  storeName: string | null;
  storeBranch: string | null;
  budgetCents: number | null;
  subtotalCents: number;
  globalDiscountCents: number;
  extraChargesCents: number;
  totalCents: number;
  createdAt: IsoInstant;
  lines: ShoppingPurchaseLine[];
}

/** Conjunto completo do módulo, como fica na cópia local e no backup. */
export interface ShoppingData {
  stores: ShoppingStore[];
  products: ShoppingProduct[];
  variants: ShoppingVariant[];
  lists: ShoppingList[];
  items: ShoppingItem[];
  purchases: ShoppingPurchase[];
}

export const EMPTY_SHOPPING: ShoppingData = {
  stores: [],
  products: [],
  variants: [],
  lists: [],
  items: [],
  purchases: [],
};

export const SHOPPING_LIMITS = {
  listName: 80,
  storeName: 80,
  branch: 80,
  productName: 120,
  brand: 80,
  variation: 80,
  variantLabel: 80,
  itemLabel: 200,
  note: 500,
  condition: 80,
  reason: 500,
} as const;
