import { describe, expect, it } from 'vitest';
import { changeBetween, filterObservations, observations, referenceFor } from './compare';
import { buildPurchaseLines, lineAmounts, purchaseTotals, summarizeList } from './calc';
import { carryOverItems, duplicateItems, estimateFromReference, repurchaseItems } from './carry';
import { formatBrl, grossCents, parseBrl } from './money';
import { formatContent, formatMilli, parseContentInput, parseQuantityInput } from './quantity';
import { normalizeText, similarNames } from './search';
import type { ShoppingItem, ShoppingPurchase, ShoppingPurchaseLine, ShoppingVariant } from './types';
import { shoppingIntegrityErrors } from './integrity';
import { EMPTY_SHOPPING } from './types';
import type { ShoppingProduct } from './types';

const NOW = '2026-11-24T12:00:00.000Z';
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: id(),
    listId: 'list-1',
    position: 1,
    label: 'Item',
    category: 'Mercearia',
    note: '',
    productId: null,
    variantId: null,
    saleUnit: 'un',
    plannedQtyMilli: 1000,
    estUnitPriceCents: null,
    estSource: null,
    estRefDate: null,
    estRefStoreName: null,
    estRefCondition: null,
    actualQtyMilli: null,
    actualUnitPriceCents: null,
    priceConfirmed: false,
    isFree: false,
    itemDiscountCents: 0,
    priceCondition: null,
    state: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function confirmed(qtyMilli: number, unitCents: number, over: Partial<ShoppingItem> = {}): ShoppingItem {
  return item({
    state: 'in_cart',
    actualQtyMilli: qtyMilli,
    actualUnitPriceCents: unitCents,
    priceConfirmed: true,
    isFree: unitCents === 0,
    ...over,
  });
}

function line(over: Partial<ShoppingPurchaseLine>): ShoppingPurchaseLine {
  const quantityMilli = over.quantityMilli ?? 1000;
  const unitPriceCents = over.unitPriceCents ?? 0;
  const gross = grossCents(quantityMilli, unitPriceCents);
  const discount = over.itemDiscountCents ?? 0;
  return {
    id: id(),
    purchaseId: 'p',
    position: 1,
    productId: 'prod-cafe',
    variantId: 'var-500',
    productName: 'Café',
    brand: 'Marca X',
    variation: 'Tradicional',
    variantLabel: '500 g',
    category: 'Mercearia',
    saleForm: 'package',
    saleUnit: 'un',
    contentMilli: 500,
    contentUnit: 'kg',
    quantityMilli,
    unitPriceCents,
    grossCents: gross,
    itemDiscountCents: discount,
    netCents: gross - discount,
    priceCondition: null,
    isFree: unitPriceCents === 0,
    ...over,
  };
}

function purchase(on: string, lines: ShoppingPurchaseLine[], over: Partial<ShoppingPurchase> = {}): ShoppingPurchase {
  const pid = over.id ?? id();
  const withPid = lines.map((l) => ({ ...l, purchaseId: pid }));
  const totals = purchaseTotals(withPid, 0, 0);
  return {
    id: pid,
    rootId: over.rootId ?? pid,
    sourceListId: null,
    revision: 1,
    status: 'active',
    supersedesId: null,
    correctionReason: null,
    voidReason: null,
    purchasedOn: on,
    storeId: 'mercado-a',
    storeName: 'Mercado A',
    storeBranch: null,
    budgetCents: null,
    ...totals,
    createdAt: `${on}T10:00:00.000Z`,
    lines: withPid,
    ...over,
  };
}

describe('dinheiro e quantidades (valores exatos)', () => {
  it('3 unidades a R$ 4,99 = R$ 14,97', () => {
    expect(grossCents(3000, 499)).toBe(1497);
    expect(formatBrl(1497)).toBe('R$ 14,97');
  });

  it('1,250 kg a R$ 8,99/kg = R$ 11,24 (meio centavo arredondado para cima)', () => {
    expect(grossCents(1250, 899)).toBe(1124);
  });

  it('carrinho de R$ 26,21 e pendente estimado em R$ 17,90 dão previsão de R$ 44,11, sem duplicar', () => {
    const cafe = item({ label: 'Café', plannedQtyMilli: 1000, estUnitPriceCents: 1790 });
    const items = [confirmed(3000, 499, { label: 'Pão' }), confirmed(1250, 899, { label: 'Carne', saleUnit: 'kg' }), cafe];
    const summary = summarizeList(items, null);
    expect(summary.confirmedCents).toBe(2621);
    expect(formatBrl(summary.confirmedCents)).toBe('R$ 26,21');
    expect(summary.forecastCents).toBe(4411);
    expect(formatBrl(summary.forecastCents)).toBe('R$ 44,11');
    expect(summary.estimatedLines).toBe(1);
    expect(summary.unknownLines).toBe(0);
  });

  it('subtotal R$ 100, desconto geral R$ 10 e despesas R$ 2 dão total R$ 92, sem desconto individual', () => {
    const lines = [line({ quantityMilli: 1000, unitPriceCents: 10000, variantId: 'v1', productId: 'p1' })];
    const totals = purchaseTotals(lines, 1000, 200);
    expect(totals.subtotalCents).toBe(10000);
    expect(totals.totalCents).toBe(9200);
    expect(lines[0]?.itemDiscountCents).toBe(0);
  });

  it('preço zero sem confirmação de gratuidade não é aceito; gratuito confirmado vale zero', () => {
    expect(lineAmounts(confirmed(1000, 0))?.netCents).toBe(0);
    expect(lineAmounts(item({ actualQtyMilli: 1000, actualUnitPriceCents: 0 }))).toBeNull();
  });

  it('valores digitados em pt-BR são lidos sem ponto flutuante', () => {
    expect(parseBrl('12,50')).toEqual({ ok: true, cents: 1250 });
    expect(parseBrl('R$ 1.234,56')).toEqual({ ok: true, cents: 123456 });
    expect(parseBrl('15.90')).toEqual({ ok: true, cents: 1590 });
    expect(parseBrl('0')).toEqual({ ok: true, cents: 0 });
    expect(parseBrl('12,555').ok).toBe(false);
    expect(parseBrl('').ok).toBe(false);
  });
});

describe('quantidades e conversões', () => {
  it('g e ml convertem explicitamente para kg e L; massa não vira volume', () => {
    expect(parseQuantityInput('500 g', 'kg')).toMatchObject({ ok: true, milli: 500 });
    expect(parseQuantityInput('250 ml', 'L')).toMatchObject({ ok: true, milli: 250 });
    expect(parseQuantityInput('1,250', 'kg')).toMatchObject({ ok: true, milli: 1250 });
    expect(parseQuantityInput('500 g', 'L').ok).toBe(false);
    expect(parseQuantityInput('250 ml', 'kg').ok).toBe(false);
  });

  it('unidades aceitam só inteiros positivos; decimais em kg têm até três casas', () => {
    expect(parseQuantityInput('3', 'un')).toMatchObject({ ok: true, milli: 3000 });
    expect(parseQuantityInput('1,5', 'un').ok).toBe(false);
    expect(parseQuantityInput('0', 'un').ok).toBe(false);
    expect(parseQuantityInput('1,2345', 'kg').ok).toBe(false);
    expect(formatMilli(1250)).toBe('1,25');
    expect(formatMilli(2000)).toBe('2');
  });

  it('conteúdo de embalagem: 500 g e 1 L são normalizados; formato legível', () => {
    expect(parseContentInput('500 g')).toEqual({ ok: true, contentMilli: 500, contentUnit: 'kg' });
    expect(parseContentInput('1 L')).toEqual({ ok: true, contentMilli: 1000, contentUnit: 'L' });
    expect(parseContentInput('6 un')).toEqual({ ok: true, contentMilli: 6000, contentUnit: 'un' });
    expect(formatContent(500, 'kg')).toBe('500 g');
    expect(formatContent(1500, 'kg')).toBe('1,5 kg');
  });
});

describe('comparação de preços', () => {
  it('mesma variante: 2 unidades a R$ 5 e depois 4 a R$ 5 não mostram variação', () => {
    const v = 'var-un';
    const a = purchase('2026-11-01', [line({ productId: 'p-un', variantId: v, saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 2000, unitPriceCents: 500 })]);
    const b = purchase('2026-11-10', [line({ productId: 'p-un', variantId: v, saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 4000, unitPriceCents: 500 })]);
    const obs = observations([a, b], 'variant');
    expect(changeBetween(obs[1], obs[0])).toEqual({ kind: 'equal' });
  });

  it('café: 500 g a R$ 15 e 450 g a R$ 14,40 — embalagem cai 4%, mas o kg sobe 6,67%', () => {
    const big = purchase('2026-11-01', [line({ productId: 'prod-cafe', variantId: 'v500', quantityMilli: 1000, unitPriceCents: 1500, contentMilli: 500 })]);
    const small = purchase('2026-11-10', [line({ productId: 'prod-cafe', variantId: 'v450', quantityMilli: 1000, unitPriceCents: 1440, contentMilli: 450, variantLabel: '450 g' })]);
    const byKg = observations([big, small], 'content');
    expect(byKg.map((o) => Math.round(Number(o.unit.n) / Number(o.unit.d)))).toEqual([3000, 3200]);
    const kgChange = changeBetween(byKg[1], byKg[0]);
    expect(kgChange.kind).toBe('up');
    if (kgChange.kind === 'up') expect(kgChange.percent?.toFixed(2)).toBe('6.67');

    const byPackage = observations([big, small], 'variant');
    const packChange = changeBetween(byPackage[1], byPackage[0]);
    expect(packChange.kind).toBe('down');
    if (packChange.kind === 'down') expect(packChange.percent?.toFixed(1)).toBe('-4.0');
  });

  it('preço anterior zero não gera percentual; conteúdo diferente não é comparado', () => {
    const free = purchase('2026-11-01', [line({ productId: 'p1', variantId: 'v1', saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 1000, unitPriceCents: 0 })]);
    const paid = purchase('2026-11-10', [line({ productId: 'p1', variantId: 'v1', saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 1000, unitPriceCents: 300 })]);
    const obs = observations([free, paid], 'variant');
    expect(changeBetween(obs[1], obs[0])).toMatchObject({ kind: 'free_previous' });
    const kg = observations([purchase('2026-11-10', [line({ productId: 'p1', variantId: 'v1', saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 1000, unitPriceCents: 300 })])], 'content');
    expect(kg).toHaveLength(1);
    expect(changeBetween(kg[0], obs[0])).toEqual({ kind: 'insufficient' });
  });

  it('linhas repetidas na mesma compra usam preço ponderado, não média simples', () => {
    const p = purchase('2026-11-01', [
      line({ productId: 'p1', variantId: 'v1', saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 2000, unitPriceCents: 500, position: 1 }),
      line({ productId: 'p1', variantId: 'v1', saleForm: 'single', contentMilli: null, contentUnit: null, quantityMilli: 1000, unitPriceCents: 800, position: 2 }),
    ]);
    const [obs] = observations([p], 'variant');
    expect(obs && Math.round(Number(obs.unit.n) / Number(obs.unit.d))).toBe(600);
  });

  it('referência prefere o mesmo mercado; nunca troca de mercado em silêncio', () => {
    const a = purchase('2026-11-01', [line({ quantityMilli: 1000, unitPriceCents: 1000 })], { storeId: 'mercado-a' });
    const b = purchase('2026-11-05', [line({ quantityMilli: 1000, unitPriceCents: 1200 })], { storeId: 'mercado-b', storeName: 'Mercado B' });
    const obs = observations([a, b], 'variant');
    expect(referenceFor(obs, { variantId: 'var-500', storeId: 'mercado-a' })).toMatchObject({ kind: 'same_store' });
    expect(referenceFor(obs, { variantId: 'var-500', storeId: 'mercado-c' })).toMatchObject({ kind: 'other_store' });
    expect(referenceFor(obs, { variantId: 'var-500', storeId: null })).toMatchObject({ kind: 'other_store' });
    const none = referenceFor(obs, { variantId: 'outra', storeId: 'mercado-a' });
    expect(none.kind).toBe('none');
    expect(estimateFromReference(referenceFor(obs, { variantId: 'var-500', storeId: 'mercado-b' }))).toMatchObject({
      estUnitPriceCents: 1200,
      estSource: 'last_purchase',
      estRefStoreName: 'Mercado B',
    });
  });

  it('compras anuladas e revisões substituídas não aparecem no histórico', () => {
    const voided = purchase('2026-11-02', [line({ unitPriceCents: 9999 })], { status: 'voided' });
    const superseded = purchase('2026-11-03', [line({ unitPriceCents: 8888 })], { status: 'superseded' });
    const ok = purchase('2026-11-04', [line({ unitPriceCents: 700 })]);
    const obs = observations([voided, superseded, ok], 'variant');
    expect(obs).toHaveLength(1);
    expect(obs[0]?.netCents).toBe(700);
    expect(filterObservations(obs, { mode: 'variant', from: '2026-11-05' })).toHaveLength(0);
  });
});

describe('listas copiadas e recompras', () => {
  it('copiar lista não traz confirmações nem descontos; preço confirmado vira estimativa copiada', () => {
    const source = [
      confirmed(1000, 500, { id: 'a', position: 1, itemDiscountCents: 50, priceCondition: 'Clube' }),
      item({ id: 'b', position: 2, label: 'Pendente', estUnitPriceCents: 900, estSource: 'manual' }),
      item({ id: 'c', position: 3, state: 'skipped' }),
    ];
    const copy = duplicateItems(source, 'nova', () => id(), NOW);
    expect(copy).toHaveLength(2);
    const first = copy[0] as ShoppingItem;
    expect(first.state).toBe('pending');
    expect(first.priceConfirmed).toBe(false);
    expect(first.itemDiscountCents).toBe(0);
    expect(first.priceCondition).toBeNull();
    expect(first.estUnitPriceCents).toBe(500);
    expect(first.estSource).toBe('copied');
    expect(copy[1]?.estUnitPriceCents).toBe(900);
  });

  it('pendências de uma compra finalizada vão para a lista nova, sem itens do carrinho', () => {
    const carried = carryOverItems([confirmed(1000, 500, { id: 'a' }), item({ id: 'b', label: 'Ficou' })], 'nova', () => id(), NOW);
    expect(carried.map((i) => i.label)).toEqual(['Ficou']);
  });

  it('recomprar gera itens pendentes com a última compra como estimativa e não altera a compra', () => {
    const p = purchase('2026-11-01', [line({ quantityMilli: 2000, unitPriceCents: 1500, itemDiscountCents: 300 })]);
    const items = repurchaseItems(p, 'nova', () => id(), NOW);
    expect(items[0]?.plannedQtyMilli).toBe(2000);
    expect(items[0]?.estUnitPriceCents).toBe(1350);
    expect(items[0]?.estSource).toBe('last_purchase');
    expect(items[0]?.priceConfirmed).toBe(false);
    expect(p.lines[0]?.itemDiscountCents).toBe(300);
  });
});

describe('finalização e integridade', () => {
  const products: ShoppingProduct[] = [
    { id: 'p1', name: 'Café', brand: 'X', variation: null, defaultCategory: 'Mercearia', archivedAt: null, createdAt: NOW, updatedAt: NOW },
  ];
  const variants: ShoppingVariant[] = [
    { id: 'v1', productId: 'p1', saleForm: 'package', saleUnit: 'un', contentMilli: 500, contentUnit: 'kg', label: '500 g', archivedAt: null, createdAt: NOW, updatedAt: NOW },
  ];

  it('só entram na compra os itens do carrinho e todos precisam de preço confirmado', () => {
    const items = [confirmed(1000, 500, { productId: 'p1', variantId: 'v1', label: 'Café' }), item({ label: 'Pendente' })];
    const lines = buildPurchaseLines(items, { products, variants }, 'compra');
    expect(lines.map((l) => l.productName)).toEqual(['Café']);
    expect(lines[0]?.variantLabel).toBe('500 g');
    expect(() => buildPurchaseLines([item({ state: 'in_cart', label: 'Sem preço' })], { products, variants }, 'c')).toThrow(/incomplete/);
  });

  it('desconhecido não vira zero: contagem de itens sem preço e saldo qualificado', () => {
    const items = [confirmed(1000, 1000, { label: 'A' }), item({ label: 'Sem preço', state: 'pending' })];
    const s = summarizeList(items, 5000);
    expect(s.unknownLines).toBe(1);
    expect(s.forecastCents).toBe(1000);
    expect(s.cartBalanceCents).toBe(4000);
    expect(s.projectedBalanceCents).toBe(4000);
    expect(summarizeList(items, 0).cartBalanceCents).toBe(-1000);
    expect(summarizeList(items, null).cartBalanceCents).toBeNull();
  });

  it('itens pulados não entram em totais; mais de um item com o mesmo nome não se funde', () => {
    const s = summarizeList([item({ state: 'skipped', estUnitPriceCents: 999 })], null);
    expect(s.forecastCents).toBe(0);
    expect(similarNames('Café', products.concat({ id: 'p2', name: 'Café torrado', brand: null, variation: null, defaultCategory: 'Mercearia', archivedAt: null, createdAt: NOW, updatedAt: NOW })).map((p) => p.id)).toEqual(['p2']);
    expect(normalizeText('  CAFÉ   Torrado ')).toBe('cafe torrado');
  });

  it('dados de compra inconsistentes são detectados pela integridade', () => {
    const p = purchase('2026-11-01', [line({ quantityMilli: 1000, unitPriceCents: 500 })]);
    const broken = { ...p, totalCents: p.totalCents + 1 };
    const errors = shoppingIntegrityErrors({ ...EMPTY_SHOPPING, purchases: [broken] });
    expect(errors.some((e) => e.includes('totais'))).toBe(true);
    expect(shoppingIntegrityErrors({ ...EMPTY_SHOPPING, purchases: [p] })).toEqual(expect.arrayContaining([expect.stringContaining('produto inexistente')]));
  });

  it('um mesmo rootId não pode ter duas revisões ativas', () => {
    const first = purchase('2026-11-01', [line({ quantityMilli: 1000, unitPriceCents: 500 })]);
    const second = purchase('2026-11-02', [line({ quantityMilli: 1000, unitPriceCents: 500 })], { rootId: first.id, revision: 2, supersedesId: null });
    const errors = shoppingIntegrityErrors({ ...EMPTY_SHOPPING, purchases: [first, second] });
    expect(errors.some((e) => e.includes('revisão ativa'))).toBe(true);
  });
});
