import { itemPriceIssue, purchaseAdjustmentIssue, purchaseLineIssue, purchaseTotals } from './calc';
import type { ShoppingData, ShoppingPurchase } from './types';

/**
 * Invariantes do módulo Compras. Usadas na validação de backups e nos testes. O banco
 * garante as mesmas regras com restrições e nas funções de finalização, correção e anulação.
 */
export function shoppingIntegrityErrors(data: ShoppingData): string[] {
  const errors: string[] = [];
  const add = (message: string) => {
    if (errors.length < 50) errors.push(message);
  };

  const unique = <T extends { id: string }>(label: string, rows: readonly T[]) => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) add(`${label}: ID duplicado (${row.id}).`);
      seen.add(row.id);
    }
    return seen;
  };

  const storeIds = unique('Mercado', data.stores);
  const productIds = unique('Produto', data.products);
  const variantIds = unique('Embalagem', data.variants);
  const listIds = unique('Lista de compras', data.lists);
  unique('Item de compra', data.items);
  unique('Compra', data.purchases);

  for (const variant of data.variants) {
    if (!productIds.has(variant.productId)) add(`Embalagem ${variant.label ?? variant.id}: produto inexistente.`);
  }
  for (const list of data.lists) {
    if (list.storeId !== null && !storeIds.has(list.storeId)) add(`Lista "${list.name}": mercado inexistente.`);
    if (list.status === 'finished' && !data.purchases.some((p) => p.rootId === list.completedPurchaseId)) {
      add(`Lista "${list.name}" está finalizada, mas a compra registrada não existe no arquivo.`);
    }
  }
  for (const item of data.items) {
    if (!listIds.has(item.listId)) add(`Item "${item.label}": lista inexistente.`);
    if (item.productId !== null && !productIds.has(item.productId)) add(`Item "${item.label}": produto inexistente.`);
    if (item.variantId !== null && !variantIds.has(item.variantId)) add(`Item "${item.label}": embalagem inexistente.`);
    const issue = itemPriceIssue(item);
    if (issue) add(`Item "${item.label}": ${issue}`);
  }

  const rootsSeen = new Map<string, ShoppingPurchase[]>();
  for (const purchase of data.purchases) {
    const label = `Compra de ${purchase.purchasedOn} (revisão ${purchase.revision})`;
    if (purchase.storeId !== null && !storeIds.has(purchase.storeId)) add(`${label}: mercado inexistente.`);
    if (purchase.sourceListId !== null && !listIds.has(purchase.sourceListId)) add(`${label}: lista de origem inexistente.`);
    if (purchase.lines.length === 0) add(`${label}: sem itens.`);
    const group = rootsSeen.get(purchase.rootId) ?? [];
    group.push(purchase);
    rootsSeen.set(purchase.rootId, group);

    const lineIds = new Set<string>();
    const positions = new Set<number>();
    let subtotal = 0;
    for (const line of purchase.lines) {
      if (line.purchaseId !== purchase.id) add(`${label}: linha de outra compra.`);
      if (lineIds.has(line.id) || positions.has(line.position)) add(`${label}: linha duplicada.`);
      lineIds.add(line.id);
      positions.add(line.position);
      if (line.productId !== null && !productIds.has(line.productId)) add(`${label}: produto inexistente em uma linha.`);
      if (line.variantId !== null && !variantIds.has(line.variantId)) add(`${label}: embalagem inexistente em uma linha.`);
      const lineIssue = purchaseLineIssue(line);
      if (lineIssue) add(`${label}: ${lineIssue}`);
      subtotal += line.netCents;
    }
    const adjust = purchaseAdjustmentIssue(subtotal, purchase.globalDiscountCents, purchase.extraChargesCents);
    if (adjust) add(`${label}: ${adjust}`);
    const totals = purchaseTotals(purchase.lines, purchase.globalDiscountCents, purchase.extraChargesCents);
    if (totals.subtotalCents !== purchase.subtotalCents || totals.totalCents !== purchase.totalCents) {
      add(`${label}: totais não conferem com as linhas (subtotal ou total).`);
    }
  }

  for (const [rootId, revisions] of rootsSeen) {
    const open = revisions.filter((p) => p.status !== 'superseded');
    if (open.length > 1) add(`Compra ${rootId}: mais de uma revisão ativa ou anulada.`);
    const root = revisions.find((p) => p.id === rootId);
    if (!root) add(`Compra ${rootId}: falta a primeira revisão.`);
    for (const p of revisions) {
      if (p.revision > 1) {
        const previous = revisions.find((x) => x.id === p.supersedesId);
        if (!previous || previous.revision !== p.revision - 1) add(`Compra ${rootId}: revisão ${p.revision} sem anterior.`);
      }
    }
  }

  return errors;
}
