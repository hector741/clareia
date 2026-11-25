import { z } from 'zod';
import { dateStringSchema } from '../schemas';
import { MAX_QTY_MILLI } from './quantity';
import {
  CONTENT_UNITS,
  ESTIMATE_SOURCES,
  ITEM_STATES,
  LIST_STATUSES,
  PURCHASE_STATUSES,
  SALE_FORMS,
  SALE_UNITS,
  SHOPPING_CATEGORIES,
  SHOPPING_LIMITS,
  type ShoppingPurchase,
  type ShoppingPurchaseLine,
} from './types';
import { MAX_CENTS } from './money';

const uuid = z.uuid();
const isoInstant = z.iso.datetime({ offset: true });
const money = z.number().int().min(0).max(MAX_CENTS);
const quantityMilli = z.number().int().min(1).max(MAX_QTY_MILLI);
const category = z.enum(SHOPPING_CATEGORIES);
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

/* ------------------------------ Entidades guardadas (backup e servidor) ------------------------------ */

export const storeSchema = z.strictObject({
  id: uuid,
  name: z.string().trim().min(1).max(SHOPPING_LIMITS.storeName),
  branch: nullable(z.string().trim().min(1).max(SHOPPING_LIMITS.branch)),
  archivedAt: nullable(isoInstant),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

export const productSchema = z.strictObject({
  id: uuid,
  name: z.string().trim().min(1).max(SHOPPING_LIMITS.productName),
  brand: nullable(z.string().trim().min(1).max(SHOPPING_LIMITS.brand)),
  variation: nullable(z.string().trim().min(1).max(SHOPPING_LIMITS.variation)),
  defaultCategory: category,
  archivedAt: nullable(isoInstant),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

export const variantSchema = z
  .strictObject({
    id: uuid,
    productId: uuid,
    saleForm: z.enum(SALE_FORMS),
    saleUnit: z.enum(SALE_UNITS),
    contentMilli: nullable(quantityMilli),
    contentUnit: nullable(z.enum(CONTENT_UNITS)),
    label: nullable(z.string().trim().min(1).max(SHOPPING_LIMITS.variantLabel)),
    archivedAt: nullable(isoInstant),
    createdAt: isoInstant,
    updatedAt: isoInstant,
  })
  .superRefine((v, ctx) => {
    const ok =
      (v.saleForm === 'package' && v.saleUnit === 'un' && v.contentMilli !== null && v.contentUnit !== null) ||
      (v.saleForm === 'loose' && (v.saleUnit === 'kg' || v.saleUnit === 'L') && v.contentMilli === null && v.contentUnit === null) ||
      (v.saleForm === 'single' && v.saleUnit === 'un' && v.contentMilli === null && v.contentUnit === null);
    if (!ok) ctx.addIssue({ code: 'custom', message: 'Forma de venda, unidade e conteúdo não combinam.' });
  });

export const listSchema = z
  .strictObject({
    id: uuid,
    name: z.string().trim().min(1).max(SHOPPING_LIMITS.listName),
    storeId: nullable(uuid),
    budgetCents: nullable(money),
    plannedFor: nullable(dateStringSchema),
    status: z.enum(LIST_STATUSES),
    completedPurchaseId: nullable(uuid),
    archivedAt: nullable(isoInstant),
    createdAt: isoInstant,
    updatedAt: isoInstant,
  })
  .superRefine((l, ctx) => {
    if ((l.status === 'finished') !== (l.completedPurchaseId !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Lista finalizada precisa apontar para a compra registrada.' });
    }
  });

export const itemSchema = z.strictObject({
  id: uuid,
  listId: uuid,
  position: z.number().finite(),
  label: z.string().trim().min(1).max(SHOPPING_LIMITS.itemLabel),
  category,
  note: z.string().max(SHOPPING_LIMITS.note),
  productId: nullable(uuid),
  variantId: nullable(uuid),
  saleUnit: z.enum(SALE_UNITS),
  plannedQtyMilli: quantityMilli,
  estUnitPriceCents: nullable(money),
  estSource: nullable(z.enum(ESTIMATE_SOURCES)),
  estRefDate: nullable(dateStringSchema),
  estRefStoreName: nullable(z.string().max(SHOPPING_LIMITS.storeName)),
  estRefCondition: nullable(z.string().max(SHOPPING_LIMITS.condition)),
  actualQtyMilli: nullable(quantityMilli),
  actualUnitPriceCents: nullable(money),
  priceConfirmed: z.boolean(),
  isFree: z.boolean(),
  itemDiscountCents: money,
  priceCondition: nullable(z.string().max(SHOPPING_LIMITS.condition)),
  state: z.enum(ITEM_STATES),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});

export const purchaseLineSchema: z.ZodType<ShoppingPurchaseLine> = z.strictObject({
  id: uuid,
  purchaseId: uuid,
  position: z.number().int().min(1),
  productId: nullable(uuid),
  variantId: nullable(uuid),
  productName: z.string().trim().min(1).max(SHOPPING_LIMITS.itemLabel),
  brand: nullable(z.string().max(SHOPPING_LIMITS.brand)),
  variation: nullable(z.string().max(SHOPPING_LIMITS.variation)),
  variantLabel: nullable(z.string().max(SHOPPING_LIMITS.variantLabel)),
  category,
  saleForm: nullable(z.enum(SALE_FORMS)),
  saleUnit: z.enum(SALE_UNITS),
  contentMilli: nullable(quantityMilli),
  contentUnit: nullable(z.enum(CONTENT_UNITS)),
  quantityMilli,
  unitPriceCents: money,
  grossCents: money,
  itemDiscountCents: money,
  netCents: money,
  priceCondition: nullable(z.string().max(SHOPPING_LIMITS.condition)),
  isFree: z.boolean(),
});

export const purchaseSchema: z.ZodType<ShoppingPurchase> = z.strictObject({
  id: uuid,
  rootId: uuid,
  sourceListId: nullable(uuid),
  revision: z.number().int().min(1),
  status: z.enum(PURCHASE_STATUSES),
  supersedesId: nullable(uuid),
  correctionReason: nullable(z.string().max(SHOPPING_LIMITS.reason)),
  voidReason: nullable(z.string().max(SHOPPING_LIMITS.reason)),
  purchasedOn: dateStringSchema,
  storeId: nullable(uuid),
  storeName: nullable(z.string().max(SHOPPING_LIMITS.storeName)),
  storeBranch: nullable(z.string().max(SHOPPING_LIMITS.branch)),
  budgetCents: nullable(money),
  subtotalCents: money,
  globalDiscountCents: money,
  extraChargesCents: money,
  totalCents: z.number().int().min(0).max(MAX_CENTS),
  createdAt: isoInstant,
  lines: z.array(purchaseLineSchema),
});

/* --------------------------------- Formulários --------------------------------- */

const requiredText = (max: number, requiredMsg: string, tooLongMsg: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, requiredMsg).max(max, tooLongMsg));

/** Texto opcional: aceita vazio ou nulo (campo deixado em branco) e devolve null quando não há texto. */
const optionalText = (max: number, tooLongMsg: string) =>
  z
    .string()
    .nullable()
    .transform((v) => (v ?? '').trim())
    .pipe(z.string().max(max, tooLongMsg))
    .transform((v) => (v === '' ? null : v));

export const storeInputSchema = z.object({
  name: requiredText(SHOPPING_LIMITS.storeName, 'Informe o nome do mercado.', 'O nome pode ter até 80 caracteres.'),
  branch: optionalText(SHOPPING_LIMITS.branch, 'A unidade pode ter até 80 caracteres.'),
});

export const listInputSchema = z.object({
  name: requiredText(SHOPPING_LIMITS.listName, 'Dê um nome para a lista.', 'O nome pode ter até 80 caracteres.'),
  storeId: nullable(uuid),
  budgetCents: nullable(money),
  plannedFor: nullable(dateStringSchema),
});

export const productInputSchema = z.object({
  name: requiredText(SHOPPING_LIMITS.productName, 'Informe o nome do produto.', 'O nome pode ter até 120 caracteres.'),
  brand: optionalText(SHOPPING_LIMITS.brand, 'A marca pode ter até 80 caracteres.'),
  variation: optionalText(SHOPPING_LIMITS.variation, 'O tipo pode ter até 80 caracteres.'),
  defaultCategory: category,
});

export const itemInputSchema = z.object({
  label: requiredText(SHOPPING_LIMITS.itemLabel, 'Informe o nome do item.', 'O nome pode ter até 200 caracteres.'),
  category,
  note: z.string().trim().max(SHOPPING_LIMITS.note, 'A observação pode ter até 500 caracteres.'),
  productId: nullable(uuid),
  variantId: nullable(uuid),
  saleUnit: z.enum(SALE_UNITS),
  plannedQtyMilli: quantityMilli,
  estUnitPriceCents: nullable(money),
  estSource: nullable(z.enum(ESTIMATE_SOURCES)),
  estRefDate: nullable(dateStringSchema),
  estRefStoreName: nullable(z.string().max(SHOPPING_LIMITS.storeName)),
  estRefCondition: nullable(z.string().max(SHOPPING_LIMITS.condition)),
});

export type ParsedItemInput = z.output<typeof itemInputSchema>;
