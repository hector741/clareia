import { describe, expect, it } from 'vitest';
import type { Observation } from '../../domain/shopping/compare';
import { ratio } from '../../domain/shopping/money';
import { buildRows, previousSameStore, summarizeHistory } from './productHistory';

/** Observação real de uma compra: preço líquido por unidade vendida, em centavos. */
function obs(id: string, purchasedOn: string, storeId: 's1' | 's2', cents: number, over: Partial<Observation> = {}): Observation {
  return {
    purchaseId: id,
    rootId: id,
    purchasedOn,
    createdAt: `${purchasedOn}T10:00:00.000Z`,
    storeId,
    storeName: storeId === 's1' ? 'Mercado A' : 'Mercado B',
    storeBranch: null,
    productId: 'p1',
    variantId: 'v1',
    productName: 'Café',
    brand: null,
    variantLabel: '500 g',
    mode: 'variant',
    base: 'un',
    quantityMilli: 1000,
    netCents: cents,
    unit: ratio(cents, 1),
    conditions: [],
    lines: 1,
    ...over,
  };
}

describe('histórico de produto: sem pontos inventados', () => {
  it('sem compras não há último preço, menor preço nem variação', () => {
    const summary = summarizeHistory([], []);
    expect(summary.last).toBeNull();
    expect(summary.lowest).toBeNull();
    expect(summary.lastChange.kind).toBe('insufficient');
  });

  it('a primeira compra de um mercado não tem variação (nunca 0,00%)', () => {
    const all = [obs('a1', '2026-11-01', 's1', 500)];
    const [row] = buildRows(all, all);
    expect(row?.previous).toBeNull();
    expect(row?.change.kind).toBe('insufficient');
  });
});

describe('histórico de produto: comparação com o mesmo mercado', () => {
  const all = [
    obs('a1', '2026-11-01', 's1', 500),
    obs('b1', '2026-11-10', 's2', 400),
    obs('a2', '2026-11-20', 's1', 600),
  ];

  it('compara a compra com a anterior do mesmo mercado, nunca com outro mercado', () => {
    expect(previousSameStore(all, all[2]!)?.purchaseId).toBe('a1');
    expect(previousSameStore(all, all[1]!)).toBeNull();
  });

  it('calcula a alta em percentual sobre o preço anterior', () => {
    const rows = buildRows(all, all);
    const last = rows[2]!;
    expect(last.change.kind).toBe('up');
    if (last.change.kind === 'up') {
      expect(last.change.percent).toBeCloseTo(20, 6);
      expect(last.change.absoluteCents).toBe(100);
    }
  });

  it('preços iguais no mesmo mercado são "igual", não uma variação zero', () => {
    const same = [obs('a1', '2026-11-01', 's1', 500), obs('a2', '2026-11-20', 's1', 500)];
    expect(buildRows(same, same)[1]?.change.kind).toBe('equal');
  });

  it('anterior grátis gera o caso próprio, sem percentual', () => {
    const free = [obs('a1', '2026-11-01', 's1', 0), obs('a2', '2026-11-20', 's1', 300)];
    const change = buildRows(free, free)[1]?.change;
    expect(change?.kind).toBe('free_previous');
  });

  it('menor preço informa data e mercado; o último vem da lista exibida', () => {
    const summary = summarizeHistory(all, all);
    expect(summary.last?.purchaseId).toBe('a2');
    expect(summary.lowest?.purchaseId).toBe('b1');
    expect(summary.lowest?.storeName).toBe('Mercado B');
    expect(summary.lowest?.purchasedOn).toBe('2026-11-10');
  });

  it('filtrar a exibição por mercado mantém a variação correta (usa o conjunto completo)', () => {
    const shownOnlyA = all.filter((o) => o.storeId === 's1');
    const summary = summarizeHistory(all, shownOnlyA);
    expect(summary.last?.purchaseId).toBe('a2');
    expect(summary.lastPrevious?.purchaseId).toBe('a1');
    expect(summary.lastChange.kind).toBe('up');
  });

  it('desempata compras do mesmo dia pela ordem de criação', () => {
    const sameDay = [
      obs('a1', '2026-11-20', 's1', 500, { createdAt: '2026-11-20T09:00:00.000Z' }),
      obs('a2', '2026-11-20', 's1', 450, { createdAt: '2026-11-20T12:00:00.000Z' }),
    ];
    expect(previousSameStore(sameDay, sameDay[1]!)?.purchaseId).toBe('a1');
    expect(previousSameStore(sameDay, sameDay[0]!)).toBeNull();
  });
});
