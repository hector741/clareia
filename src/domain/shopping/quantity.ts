import type { ContentUnit, SaleUnit } from './types';

/**
 * Quantidades em milésimos da unidade (kg, L ou un). "un" usa múltiplos de 1000:
 * 3 unidades = 3000. Conversões: g → kg (1 g = 1 milésimo de kg), ml → L (1 ml = 1 milésimo de L).
 */
export const MILLI = 1000;
export const MAX_QTY_MILLI = 999_999 * MILLI;

export type QuantityResult =
  | { ok: true; milli: number; converted: string | null }
  | { ok: false; message: string };

/** Número pt-BR ("1,25", "1.25", "2") em milésimos, com no máximo três casas. */
function decimalToMilli(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(3, '0'));
  return whole * MILLI + fraction;
}

/**
 * Lê a quantidade digitada. Aceita um sufixo opcional: "500 g", "250 ml", "1,25 kg", "2 L", "3".
 * Conversões são explícitas no resultado (`converted`) para o usuário conferir.
 */
export function parseQuantityInput(input: string, saleUnit: SaleUnit): QuantityResult {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === '') return { ok: false, message: 'Digite uma quantidade.' };
  const match = /^(\d+(?:[.,]\d{1,3})?)\s?(kg|g|l|ml|un|unid|unidades?)?$/.exec(text);
  if (!match) return { ok: false, message: 'Use um número, por exemplo 2, 1,250 kg ou 500 g.' };
  const numeric = match[1] ?? '';
  const suffix = match[2] ?? null;
  const unitSuffix = suffix === null ? null : suffix.startsWith('un') ? 'un' : suffix;

  if (saleUnit === 'un') {
    if (unitSuffix !== null && unitSuffix !== 'un') {
      return { ok: false, message: 'Este item é vendido por unidade. Digite a quantidade em unidades.' };
    }
    if (/[.,]/.test(numeric)) return { ok: false, message: 'Quantidade em unidades deve ser um número inteiro.' };
    const units = Number(numeric);
    if (units <= 0) return { ok: false, message: 'A quantidade precisa ser maior que zero.' };
    if (units * MILLI > MAX_QTY_MILLI) return { ok: false, message: 'Quantidade grande demais.' };
    return { ok: true, milli: units * MILLI, converted: null };
  }

  if (unitSuffix === 'un') return { ok: false, message: 'Este item é vendido por peso ou volume (kg ou L).' };

  if (unitSuffix === 'g' || unitSuffix === 'ml') {
    const wanted = unitSuffix === 'g' ? 'kg' : 'L';
    if (saleUnit !== wanted) {
      return {
        ok: false,
        message: `Este item é vendido em ${saleUnit}. Digite em ${saleUnit} ou em ${wanted === 'kg' ? 'g' : 'ml'} (${wanted === 'kg' ? 'gramas' : 'mililitros'}) para converter.`,
      };
    }
    if (/[.,]/.test(numeric)) {
      return { ok: false, message: `Digite ${unitSuffix === 'g' ? 'gramas' : 'mililitros'} inteiros.` };
    }
    const amount = Number(numeric);
    if (amount <= 0) return { ok: false, message: 'A quantidade precisa ser maior que zero.' };
    if (amount > MAX_QTY_MILLI) return { ok: false, message: 'Quantidade grande demais.' };
    return {
      ok: true,
      milli: amount,
      converted: `${amount} ${unitSuffix} = ${formatMilli(amount)} ${saleUnit}`,
    };
  }

  if (unitSuffix !== null && unitSuffix !== saleUnit) {
    return { ok: false, message: `Este item é vendido em ${saleUnit}.` };
  }
  const milli = decimalToMilli(numeric);
  if (milli === null || milli <= 0) return { ok: false, message: 'A quantidade precisa ser maior que zero, com até três casas decimais.' };
  if (milli > MAX_QTY_MILLI) return { ok: false, message: 'Quantidade grande demais.' };
  return { ok: true, milli, converted: null };
}

/** Milésimos como texto pt-BR, sem zeros à direita: 1250 → "1,25"; 2000 → "2". */
export function formatMilli(milli: number): string {
  const whole = Math.trunc(milli / MILLI);
  const fraction = milli % MILLI;
  if (fraction === 0) return String(whole);
  return `${whole},${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

/** Quantidade com unidade: "3 un", "1,25 kg". */
export function formatQuantity(milli: number, unit: SaleUnit): string {
  return `${formatMilli(milli)} ${unit}`;
}

/** Conteúdo de embalagem: abaixo de 1 kg/L mostra gramas/mililitros ("500 g", "350 ml"). */
export function formatContent(contentMilli: number, unit: ContentUnit): string {
  if (unit === 'kg' && contentMilli < MILLI) return `${contentMilli} g`;
  if (unit === 'L' && contentMilli < MILLI) return `${contentMilli} ml`;
  return `${formatMilli(contentMilli)} ${unit === 'un' ? 'un' : unit}`;
}

/** Lê o conteúdo da embalagem ("500 g", "1 L", "6 un"), convertendo g/ml de forma explícita. */
export function parseContentInput(
  input: string,
): { ok: true; contentMilli: number; contentUnit: ContentUnit } | { ok: false; message: string } {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = /^(\d+(?:[.,]\d{1,3})?)\s?(g|kg|ml|l|un|unid|unidades?)$/.exec(text);
  if (!match) return { ok: false, message: 'Informe o conteúdo com unidade, por exemplo 500 g, 1 L ou 6 un.' };
  const numeric = match[1] ?? '';
  const raw = match[2] ?? '';
  const unit = raw.startsWith('un') ? 'un' : raw;
  if (unit === 'g' || unit === 'ml') {
    if (/[.,]/.test(numeric)) return { ok: false, message: `Digite ${unit === 'g' ? 'gramas' : 'mililitros'} inteiros.` };
    const amount = Number(numeric);
    if (amount <= 0) return { ok: false, message: 'O conteúdo precisa ser maior que zero.' };
    return { ok: true, contentMilli: amount, contentUnit: unit === 'g' ? 'kg' : 'L' };
  }
  if (unit === 'un') {
    if (/[.,]/.test(numeric)) return { ok: false, message: 'Número de unidades deve ser inteiro.' };
    const units = Number(numeric);
    if (units <= 0) return { ok: false, message: 'O conteúdo precisa ser maior que zero.' };
    return { ok: true, contentMilli: units * MILLI, contentUnit: 'un' };
  }
  const milli = decimalToMilli(numeric);
  if (milli === null || milli <= 0) return { ok: false, message: 'O conteúdo precisa ser maior que zero.' };
  return { ok: true, contentMilli: milli, contentUnit: unit === 'l' ? 'L' : 'kg' };
}
