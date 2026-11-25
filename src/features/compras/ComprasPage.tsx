import { History, Package, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '../../app/routes';
import { usePageTitle } from '../../app/usePageTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatShortDate, todayLocal } from '../../domain/dates';
import { storeLabel } from '../../domain/shopping/compare';
import { matchesQuery } from '../../domain/shopping/search';
import type { ShoppingList } from '../../domain/shopping/types';
import { LIST_STATUS_LABELS, money } from './format';
import { ListDialog } from './ListDialog';
import { purchaseForList, useListSummaries, useShopping } from './useShopping';
import styles from './compras.module.css';

export function ComprasPage() {
  usePageTitle('Compras');
  const shopping = useShopping();
  const summaries = useListSummaries(shopping);
  const today = todayLocal();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState<{ origin: HTMLElement | null } | null>(null);

  const visible = useMemo(
    () =>
      shopping.lists
        .filter((l) => (showArchived ? l.archivedAt !== null : l.archivedAt === null))
        .filter((l) => query.trim() === '' || matchesQuery(l.name, query))
        .sort((a, b) => (b.plannedFor ?? b.createdAt).localeCompare(a.plannedFor ?? a.createdAt)),
    [shopping.lists, query, showArchived],
  );
  const open = visible.filter((l) => l.status !== 'finished');
  const finished = visible.filter((l) => l.status === 'finished');

  const newButton = (
    <Button variant="primary" icon={<Plus size={18} />} onClick={(e) => setCreating({ origin: e.currentTarget })}>
      Nova lista
    </Button>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Compras"
        subtitle="Planeje a lista, confirme os preços no mercado e acompanhe o histórico. Tudo fica na sua conta."
        actions={
          <div className={styles.headerActions}>
            <Link className={styles.linkButton} to={routes.shoppingHistory}>
              <History size={18} aria-hidden="true" /> Histórico
            </Link>
            <Link className={styles.linkButton} to={routes.shoppingProducts}>
              <Package size={18} aria-hidden="true" /> Produtos e mercados
            </Link>
            {newButton}
          </div>
        }
      />

      {shopping.lists.length === 0 ? (
        <EmptyState title="Nenhuma lista de compras ainda" action={newButton}>
          <p>
            Crie a primeira lista para planejar a próxima compra. Nada começa preenchido: sem compras antigas, preços ou valores inventados.
          </p>
        </EmptyState>
      ) : (
        <>
          <section className={styles.card} aria-label="Buscar listas">
            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Buscar lista</span>
                <input
                  type="search"
                  className="control"
                  value={query}
                  autoComplete="off"
                  placeholder="Ex.: Compras de hoje"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              <span>Mostrar arquivadas</span>
            </label>
          </section>

          <section aria-labelledby="open-lists" className={styles.group}>
            <h2 id="open-lists" className={styles.groupTitle}>
              Em andamento
            </h2>
            {open.length === 0 ? (
              <p className={styles.itemMeta}>Nenhuma lista em andamento.</p>
            ) : (
              <ul className={styles.cardList}>
                {open.map((list) => (
                  <ListCard key={list.id} list={list} today={today} summary={summaries.get(list.id)} storeName={storeNameOf(shopping, list)} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="finished-lists" className={styles.group}>
            <h2 id="finished-lists" className={styles.groupTitle}>
              Finalizadas
            </h2>
            {finished.length === 0 ? (
              <p className={styles.itemMeta}>Nenhuma compra finalizada ainda.</p>
            ) : (
              <ul className={styles.cardList}>
                {finished.map((list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    today={today}
                    summary={summaries.get(list.id)}
                    storeName={storeNameOf(shopping, list)}
                    total={purchaseForList(shopping, list)?.totalCents ?? null}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {creating ? <ListDialog origin={creating.origin} onClose={() => setCreating(null)} /> : null}
    </div>
  );
}

function storeNameOf(shopping: ReturnType<typeof useShopping>, list: ShoppingList): string {
  const store = shopping.stores.find((s) => s.id === list.storeId);
  return store ? storeLabel(store.name, store.branch) : 'Mercado não informado';
}

interface CardProps {
  list: ShoppingList;
  today: string;
  summary: ReturnType<ReturnType<typeof useListSummaries>['get']>;
  storeName: string;
  total?: number | null;
}

function ListCard({ list, today, summary, storeName, total }: CardProps) {
  const details: string[] = [];
  if (summary) {
    details.push(`${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'itens'}`);
    if (list.status !== 'finished') {
      details.push(
        summary.unknownLines > 0 && summary.itemCount > 0
          ? `previsão ${money(summary.forecastCents)} (${summary.unknownLines} sem preço)`
          : `previsão ${money(summary.forecastCents)}`,
      );
    }
  }
  if (total !== undefined && total !== null) details.push(`total ${money(total)}`);
  if (list.budgetCents !== null) details.push(`orçamento ${money(list.budgetCents)}`);
  return (
    <li>
      <Link className={styles.listCard} to={routes.shoppingList(list.id)}>
        <span className={styles.listCardTitle}>{list.name}</span>
        <span className={styles.itemMeta}>
          {LIST_STATUS_LABELS[list.status]} · {storeName}
          {list.plannedFor ? ` · ${formatShortDate(list.plannedFor, today)}` : ''}
          {list.archivedAt ? ' · arquivada' : ''}
        </span>
        <span className={styles.itemMeta}>{details.join(' · ') || 'Sem itens ainda'}</span>
      </Link>
    </li>
  );
}
