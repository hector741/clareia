import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { routes } from '../../app/routes';
import { usePageTitle } from '../../app/usePageTitle';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatLongDate, formatShortDate, todayLocal } from '../../domain/dates';
import { storeLabel } from '../../domain/shopping/compare';
import type { ShoppingPurchase } from '../../domain/shopping/types';
import { money } from './format';
import { PurchaseDialog } from './PurchaseDialog';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

/** Diferença entre o total e o orçamento da própria compra (orçamento zero é válido). */
export function budgetText(purchase: Pick<ShoppingPurchase, 'budgetCents' | 'totalCents'>): string {
  if (purchase.budgetCents === null) return 'Sem limite definido';
  const diff = purchase.budgetCents - purchase.totalCents;
  return diff >= 0
    ? `Dentro do orçamento (${money(purchase.budgetCents)}): sobra ${money(diff)}`
    : `Acima do orçamento (${money(purchase.budgetCents)}) em ${money(-diff)}`;
}

export function HistoryPage() {
  usePageTitle('Histórico de compras');
  const shopping = useShopping();
  const navigate = useNavigate();
  const today = todayLocal();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [openRoot, setOpenRoot] = useState<string | null>(null);

  const purchases = useMemo(() => {
    return shopping.purchases
      .filter((p) => p.status === 'active' || (showVoided && p.status === 'voided'))
      .filter((p) => (from === '' || p.purchasedOn >= from) && (to === '' || p.purchasedOn <= to))
      .filter((p) => storeFilter === '' || (storeFilter === 'none' ? p.storeId === null : p.storeId === storeFilter))
      .sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn) || b.createdAt.localeCompare(a.createdAt));
  }, [shopping.purchases, from, to, storeFilter, showVoided]);

  const activeInFilter = purchases.filter((p) => p.status === 'active');
  const total = activeInFilter.reduce((sum, p) => sum + p.totalCents, 0);
  const selected = openRoot ? shopping.purchases.find((p) => p.rootId === openRoot && p.status !== 'superseded') ?? null : null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Histórico de compras"
        subtitle="Só compras finalizadas e ativas entram nas comparações de preço. Estimativas e itens pendentes não entram."
        actions={
          <Link className={styles.linkButton} to={routes.shoppingProducts}>
            Produtos e mercados
          </Link>
        }
      />

      <section className={styles.card} aria-label="Filtros do histórico">
        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span className={styles.label}>De</span>
            <input type="date" className="control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Até</span>
            <input type="date" className="control" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Mercado</span>
            <select className="control" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">Todos os mercados</option>
              <option value="none">Mercado não informado</option>
              {shopping.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {storeLabel(s.name, s.branch)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          <span>Mostrar compras anuladas</span>
        </label>
        <p className={styles.summaryValue} aria-live="polite">
          Total gasto no período: {money(total)}{' '}
          <span className={styles.itemMeta}>
            ({activeInFilter.length} {activeInFilter.length === 1 ? 'compra' : 'compras'})
          </span>
        </p>
      </section>

      {purchases.length === 0 ? (
        <EmptyState title="Nenhuma compra registrada ainda">
          <p>
            Quando você finalizar uma lista, a compra aparece aqui. <Link to={routes.shopping}>Ir para Compras</Link>
          </p>
        </EmptyState>
      ) : (
        <ul className={styles.purchaseList} aria-label="Compras">
          {purchases.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.purchaseRow}
                onClick={() => setOpenRoot(p.rootId)}
                aria-label={`Compra de ${formatLongDate(p.purchasedOn)}, ${storeLabel(p.storeName, p.storeBranch)}, total ${money(p.totalCents)}${p.status === 'voided' ? ', anulada' : ''}`}
              >
                <span className={styles.purchaseDate}>{formatShortDate(p.purchasedOn, today)}</span>
                <span className={styles.purchaseMain}>
                  <strong>{storeLabel(p.storeName, p.storeBranch)}</strong>
                  <span className={styles.itemMeta}>
                    {p.lines.length} {p.lines.length === 1 ? 'item' : 'itens'} · {budgetText(p)}
                  </span>
                  {p.status === 'voided' ? <span className={styles.badgeNone}>Anulada: {p.voidReason}</span> : null}
                  {p.revision > 1 ? <span className={styles.itemMeta}>Revisão {p.revision} (corrigida)</span> : null}
                </span>
                <span className={styles.purchaseTotal}>{money(p.totalCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <PurchaseDialog
          purchase={selected}
          onClose={() => setOpenRoot(null)}
          onRepurchased={(listId) => {
            setOpenRoot(null);
            navigate(routes.shoppingList(listId));
          }}
        />
      ) : null}
    </div>
  );
}
