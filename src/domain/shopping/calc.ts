import { grossCents } from './money';
import type { ShoppingItem, ShoppingProduct, ShoppingPurchaseLine, ShoppingVariant } from './types';

/**
 * Funções de cálculo do módulo Compras. Toda tela, a finalização e a validação de
 * backups usam estas funções; nenhum total é guardado calculado de outra forma.
 */

export interface LineAmounts {
  grossCents: number;
  discountCents: number;
  netCents: number;
}

/** Um item tem preço confirmado quando quantidade e preço efetivos foram informados e confirmados. */
export function isConfirmed(item: ShoppingItem): boolean {
  return item.priceConfirmed && item.actualQtyMilli !== null && item.actualUnitPriceCents !== null;
}

/** Valores de uma linha confirmada; `null` se ainda não há preço confirmado. */
export function lineAmounts(item: ShoppingItem): LineAmounts | null {
  if (!isConfirmed(item)) return null;
  const gross = grossCents(item.actualQtyMilli ?? 0, item.actualUnitPriceCents ?? 0);
  return { grossCents: gross, discountCents: item.itemDiscountCents, netCents: gross - item.itemDiscountCents };
}

/** Mensagem de erro do preço/quantidade efetivos, ou `null` se estiverem consistentes. */
export function itemPriceIssue(item: ShoppingItem): string | null {
  if (item.actualQtyMilli !== null && item.actualQtyMilli <= 0) return 'A quantidade efetiva precisa ser maior que zero.';
  if (item.saleUnit === 'un' && item.actualQtyMilli !== null && item.actualQtyMilli % 1000 !== 0) {
    return 'Em unidades, a quantidade efetiva é um número inteiro.';
  }
  if (item.actualUnitPriceCents !== null && item.actualUnitPriceCents < 0) return 'O preço não pode ser negativo.';
  if (item.priceConfirmed) {
    if (item.actualQtyMilli === null || item.actualUnitPriceCents === null) {
      return 'Informe a quantidade e o preço efetivos antes de confirmar.';
    }
    if (item.isFree && item.actualUnitPriceCents !== 0) return 'Item gratuito precisa ter preço zero.';
    if (!item.isFree && item.actualUnitPriceCents === 0) return 'Preço zero exige confirmar o item como gratuito.';
    const gross = grossCents(item.actualQtyMilli, item.actualUnitPriceCents);
    if (item.itemDiscountCents < 0) return 'O desconto não pode ser negativo.';
    if (item.itemDiscountCents > gross) return 'O desconto não pode ser maior que o valor do item.';
  }
  return null;
}

/** Resumo do carrinho e da previsão final, com contagens de valores ainda desconhecidos. */
export interface CartSummary {
  /** Soma dos líquidos confirmados dos itens no carrinho. */
  confirmedCents: number;
  cartCount: number;
  /** Itens no carrinho sem quantidade/preço confirmados. */
  cartUnconfirmed: number;
  /** Previsão final: confirmado quando existe; senão estimativa; itens sem nenhum preço ficam de fora e são contados. */
  forecastCents: number;
  estimatedLines: number;
  unknownLines: number;
  budgetCents: number | null;
  /** Orçamento menos carrinho confirmado. Pode ser negativo (acima do orçamento). */
  cartBalanceCents: number | null;
  /** Orçamento menos previsão final. */
  projectedBalanceCents: number | null;
}

/** Quantidade usada na previsão: a efetiva, se existir; senão a planejada. */
function forecastQty(item: ShoppingItem): number {
  return item.actualQtyMilli ?? item.plannedQtyMilli;
}

export function summarizeList(items: readonly ShoppingItem[], budgetCents: number | null): CartSummary {
  let confirmedCents = 0;
  let cartCount = 0;
  let cartUnconfirmed = 0;
  let forecastCents = 0;
  let estimatedLines = 0;
  let unknownLines = 0;

  for (const item of items) {
    if (item.state === 'skipped') continue;
    if (item.state === 'in_cart') {
      cartCount += 1;
      if (!isConfirmed(item)) cartUnconfirmed += 1;
    }
    const amounts = lineAmounts(item);
    if (amounts) {
      forecastCents += amounts.netCents;
      if (item.state === 'in_cart') confirmedCents += amounts.netCents;
    } else if (item.estUnitPriceCents !== null) {
      forecastCents += grossCents(forecastQty(item), item.estUnitPriceCents);
      estimatedLines += 1;
    } else {
      unknownLines += 1;
    }
  }

  return {
    confirmedCents,
    cartCount,
    cartUnconfirmed,
    forecastCents,
    estimatedLines,
    unknownLines,
    budgetCents,
    cartBalanceCents: budgetCents === null ? null : budgetCents - confirmedCents,
    projectedBalanceCents: budgetCents === null ? null : budgetCents - forecastCents,
  };
}

/** Totais de uma compra registrada: subtotal dos líquidos, desconto geral e despesas. */
export interface PurchaseTotals {
  subtotalCents: number;
  globalDiscountCents: number;
  extraChargesCents: number;
  totalCents: number;
}

export function purchaseTotals(
  lines: readonly Pick<ShoppingPurchaseLine, 'netCents'>[],
  globalDiscountCents: number,
  extraChargesCents: number,
): PurchaseTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.netCents, 0);
  return {
    subtotalCents,
    globalDiscountCents,
    extraChargesCents,
    totalCents: subtotalCents - globalDiscountCents + extraChargesCents,
  };
}

/** Erros de desconto geral e despesas. Desconto nunca supera o subtotal. */
export function purchaseAdjustmentIssue(subtotalCents: number, globalDiscountCents: number, extraChargesCents: number): string | null {
  if (!Number.isSafeInteger(globalDiscountCents) || globalDiscountCents < 0) return 'O desconto geral não pode ser negativo.';
  if (!Number.isSafeInteger(extraChargesCents) || extraChargesCents < 0) return 'As despesas não podem ser negativas.';
  if (globalDiscountCents > subtotalCents) return 'O desconto geral não pode ser maior que o subtotal dos produtos.';
  return null;
}

/** Valida uma linha de compra registrada: quantidade, preço, desconto e valores derivados. */
export function purchaseLineIssue(line: ShoppingPurchaseLine): string | null {
  if (line.productName.trim() === '') return 'Linha sem nome de produto.';
  if (!Number.isSafeInteger(line.quantityMilli) || line.quantityMilli <= 0) return `"${line.productName}": quantidade inválida.`;
  if (line.saleUnit === 'un' && line.quantityMilli % 1000 !== 0) return `"${line.productName}": unidades precisam ser inteiras.`;
  if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) return `"${line.productName}": preço inválido.`;
  if (line.isFree !== (line.unitPriceCents === 0)) return `"${line.productName}": gratuidade não confere com o preço.`;
  const gross = grossCents(line.quantityMilli, line.unitPriceCents);
  if (line.grossCents !== gross) return `"${line.productName}": valor bruto não confere com quantidade e preço.`;
  if (line.itemDiscountCents < 0 || line.itemDiscountCents > gross) return `"${line.productName}": desconto fora do limite.`;
  if (line.netCents !== gross - line.itemDiscountCents) return `"${line.productName}": valor líquido não confere.`;
  if ((line.contentMilli === null) !== (line.contentUnit === null)) return `"${line.productName}": conteúdo incompleto.`;
  return null;
}

/**
 * Monta as linhas da compra a partir dos itens no carrinho. Falha se algum item
 * selecionado não tiver quantidade e preço confirmados (a compra não pode ter valor desconhecido).
 */
export function buildPurchaseLines(
  items: readonly ShoppingItem[],
  catalog: { products: readonly ShoppingProduct[]; variants: readonly ShoppingVariant[] },
  purchaseId: string,
): ShoppingPurchaseLine[] {
  const cart = items.filter((item) => item.state === 'in_cart').sort((a, b) => a.position - b.position);
  return cart.map((item, index) => {
    if (!isConfirmed(item)) throw new Error(`incomplete:${item.label}`);
    const amounts = lineAmounts(item) as LineAmounts;
    const product = catalog.products.find((p) => p.id === item.productId) ?? null;
    const variant = catalog.variants.find((v) => v.id === item.variantId) ?? null;
    return {
      id: crypto.randomUUID(),
      purchaseId,
      position: index + 1,
      productId: product?.id ?? null,
      variantId: variant?.id ?? null,
      productName: item.label,
      brand: product?.brand ?? null,
      variation: product?.variation ?? null,
      variantLabel: variant?.label ?? null,
      category: item.category,
      saleForm: variant?.saleForm ?? null,
      saleUnit: item.saleUnit,
      contentMilli: variant?.contentMilli ?? null,
      contentUnit: variant?.contentUnit ?? null,
      quantityMilli: item.actualQtyMilli ?? 0,
      unitPriceCents: item.actualUnitPriceCents ?? 0,
      grossCents: amounts.grossCents,
      itemDiscountCents: amounts.discountCents,
      netCents: amounts.netCents,
      priceCondition: item.priceCondition,
      isFree: item.isFree,
    };
  });
}
