import { formatShortDate, todayLocal } from '../../domain/dates';
import type { Change } from '../../domain/shopping/compare';
import { formatBrl } from '../../domain/shopping/money';
import { formatContent, formatQuantity } from '../../domain/shopping/quantity';
import type { ContentUnit, SaleUnit, ShoppingVariant } from '../../domain/shopping/types';
import type { DateString } from '../../domain/types';

export const money = (cents: number | null): string => (cents === null ? 'Sem preço' : formatBrl(cents));

/** "por un.", "por kg", "por L": a base sempre aparece junto ao preço. */
export function perUnitLabel(base: SaleUnit | ContentUnit): string {
  if (base === 'un') return 'por un.';
  return `por ${base}`;
}

/** Percentual com sinal explícito: "+6,67%", "−4%". Sem sinal para zero. */
export function signedPercent(value: number): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const text = rounded.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (rounded === 0) return `${text}%`;
  return `${value > 0 ? '+' : '−'}${text}%`;
}

export function signedMoney(cents: number): string {
  const text = formatBrl(Math.abs(cents));
  if (cents === 0) return text;
  return `${cents > 0 ? '+' : '−'}${text}`;
}

/** Texto da comparação com unidade, data e mercado. Nunca depende só de cor. */
export function describeChange(
  change: Change,
  base: SaleUnit | ContentUnit,
  reference: { date: DateString; storeLabel: string } | null,
  today: DateString = todayLocal(),
): string {
  if (!reference) return 'Primeira compra registrada para comparação.';
  const when = `${formatShortDate(reference.date, today)} — ${reference.storeLabel}`;
  switch (change.kind) {
    case 'equal':
      return `Mesmo preço ${perUnitLabel(base)} que em ${when}.`;
    case 'up':
      return change.percent === null
        ? `Subiu ${perUnitLabel(base)} em relação a ${when}.`
        : `Subiu ${signedPercent(change.percent)} ${perUnitLabel(base)} (${signedMoney(change.absoluteCents)}) em relação a ${when}.`;
    case 'down':
      return change.percent === null
        ? `Caiu ${perUnitLabel(base)} em relação a ${when}.`
        : `Caiu ${signedPercent(change.percent)} ${perUnitLabel(base)} (${signedMoney(change.absoluteCents)}) em relação a ${when}.`;
    case 'free_previous':
      return `Preço anterior gratuito (${when}): variação percentual não se aplica.`;
    case 'insufficient':
      return 'Sem comparação disponível para esta unidade.';
  }
}

export const quantityText = (milli: number, unit: SaleUnit): string => formatQuantity(milli, unit);

/** Descrição da embalagem: "Café 500 g" ou "Avulso por kg" (variante sem conteúdo). */
export function variantText(variant: ShoppingVariant | null): string {
  if (!variant) return 'Sem embalagem cadastrada';
  if (variant.saleForm === 'package' && variant.contentMilli !== null && variant.contentUnit) {
    return `${formatContent(variant.contentMilli, variant.contentUnit)}${variant.label ? ` · ${variant.label}` : ''}`;
  }
  if (variant.saleForm === 'loose') return `Avulso (por ${variant.saleUnit})`;
  return variant.label ?? 'Unidade';
}

export const SALE_FORM_LABELS = {
  package: 'Embalagem',
  loose: 'Avulso (a granel)',
  single: 'Unidade',
} as const;

export const STATE_LABELS = {
  pending: 'A comprar',
  in_cart: 'No carrinho',
  skipped: 'Desisti',
} as const;

export const LIST_STATUS_LABELS = {
  draft: 'Planejamento',
  shopping: 'Em compras',
  finished: 'Finalizada',
} as const;
