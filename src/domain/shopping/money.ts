/**
 * Aritmética exata para dinheiro e razões. Valores são inteiros (centavos) e os cálculos
 * usam BigInt, então não há erro de ponto flutuante. Arredondamento: meio para cima.
 */

export const MAX_CENTS = 1_000_000_000_00; // R$ 1 bilhão: limite de sanidade para entradas.

export type ParseResult = { ok: true; cents: number } | { ok: false; message: string };

/** Aceita "15", "15,5", "15,50", "1.234,56", "R$ 9,90" e "15.90". Zero é válido (item gratuito). */
export function parseBrl(input: string): ParseResult {
  const compact = input.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (compact === '') return { ok: false, message: 'Digite um valor em reais.' };
  let reais: string;
  let centavos: string;
  if (compact.includes(',')) {
    const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/.exec(compact);
    if (!match) return { ok: false, message: 'Use o formato 12,50.' };
    reais = (match[1] ?? '').replace(/\./g, '');
    centavos = (match[2] ?? '').padEnd(2, '0');
  } else if (/^\d+\.\d{1,2}$/.test(compact)) {
    [reais, centavos] = compact.split('.') as [string, string];
    centavos = centavos.padEnd(2, '0');
  } else if (/^\d+$/.test(compact)) {
    reais = compact;
    centavos = '00';
  } else {
    return { ok: false, message: 'Use o formato 12,50.' };
  }
  const cents = Number(reais) * 100 + Number(centavos);
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { ok: false, message: 'Este valor é grande demais.' };
  return { ok: true, cents };
}

/** Formata centavos inteiros como "R$ 1.234,56" (sem depender de Intl para valores exatos). */
export function formatBrl(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** Valor em centavos para campos de edição, no formato pt-BR sem símbolo ("12,50"). */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

/** Divisão inteira de inteiros não negativos com arredondamento meio para cima. */
export function roundedDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominador deve ser positivo');
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Bruto de uma linha: quantidade (em milésimos) × preço unitário, arredondado para centavos. */
export function grossCents(qtyMilli: number, unitCents: number): number {
  return Number(roundedDiv(BigInt(qtyMilli) * BigInt(unitCents), 1000n));
}

/** Razão exata n/d (ex.: centavos por quilo). Comparações usam multiplicação cruzada. */
export interface Ratio {
  n: bigint;
  d: bigint;
}

export function ratio(n: number | bigint, d: number | bigint): Ratio {
  if (BigInt(d) <= 0n) throw new RangeError('denominador deve ser positivo');
  return { n: BigInt(n), d: BigInt(d) };
}

/** Sinal de a − b: -1, 0 ou 1. */
export function compareRatio(a: Ratio, b: Ratio): -1 | 0 | 1 {
  const diff = a.n * b.d - b.n * a.d;
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

/** Valor da razão em centavos, arredondado para exibição (meio para cima). */
export function ratioToCents(r: Ratio): number {
  return Number(roundedDiv(r.n, r.d));
}

export function ratioToNumber(r: Ratio): number {
  return Number(r.n) / Number(r.d);
}
