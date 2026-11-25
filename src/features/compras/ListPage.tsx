import { Archive, Copy, Pencil, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useConfirm } from '../../app/ConfirmContext';
import { useFeedback } from '../../app/feedback';
import { routes } from '../../app/routes';
import { usePageTitle } from '../../app/usePageTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { repo, toAppError } from '../../db';
import { formatShortDate, todayLocal } from '../../domain/dates';
import { summarizeList } from '../../domain/shopping/calc';
import { storeLabel } from '../../domain/shopping/compare';
import { formatMilli } from '../../domain/shopping/quantity';
import { matchesQuery, normalizeText, similarNames } from '../../domain/shopping/search';
import { SHOPPING_CATEGORIES, type ShoppingItem, type ShoppingList } from '../../domain/shopping/types';
import { FinalizeDialog } from './FinalizeDialog';
import { ItemDialog, type Prefill } from './ItemDialog';
import { ItemRow, type RowMode } from './ItemRow';
import { LIST_STATUS_LABELS, money } from './format';
import { ListDialog } from './ListDialog';
import { useShopping, useVariantObservations } from './useShopping';
import styles from './compras.module.css';

export function ListPage() {
  const { id = '' } = useParams();
  const shopping = useShopping();
  const list = shopping.lists.find((l) => l.id === id);
  usePageTitle(list ? list.name : 'Lista não encontrada');

  if (!list) {
    return (
      <div className={styles.page}>
        <EmptyState title="Esta lista não existe" tone="danger">
          <p>Ela pode ter sido excluída ou ainda não chegou neste aparelho.</p>
          <p>
            <Link to={routes.shopping}>Voltar para Compras</Link>
          </p>
        </EmptyState>
      </div>
    );
  }
  return <ListView key={list.id} list={list} />;
}

type Dialog =
  | { kind: 'edit'; origin: HTMLElement | null }
  | { kind: 'add'; origin: HTMLElement | null; prefill?: Prefill }
  | { kind: 'finish'; origin: HTMLElement | null }
  | null;

function ListView({ list }: { list: ShoppingList }) {
  const shopping = useShopping();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const today = todayLocal();
  const observed = useVariantObservations(shopping);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ShoppingItem | null>(null);
  const busyRef = useRef(false);

  const finished = list.status === 'finished';
  const mode: RowMode = finished ? 'readonly' : list.status === 'shopping' ? 'market' : 'plan';
  const items = useMemo(
    () => shopping.items.filter((i) => i.listId === list.id).sort((a, b) => a.position - b.position),
    [shopping.items, list.id],
  );
  const summary = useMemo(() => summarizeList(items, list.budgetCents), [items, list.budgetCents]);
  const purchase = shopping.purchases.find((p) => p.id === list.completedPurchaseId) ?? null;
  const store = shopping.stores.find((s) => s.id === list.storeId);
  const storeText = store ? storeLabel(store.name, store.branch) : 'Mercado não informado';

  // Autocompletar só com o cadastro local: busca sem acento e sem diferença de maiúsculas.
  const query = quick.trim();
  const catalog = useMemo(() => {
    if (query.length === 0 || finished) return { matches: [], similar: [] };
    const products = shopping.products.filter((p) => p.archivedAt === null);
    const matches = products
      .filter((p) => matchesQuery(`${p.name} ${p.brand ?? ''} ${p.variation ?? ''}`, query))
      .slice(0, 5);
    const similar = matches.length === 0 ? similarNames(query, products, 3) : [];
    return { matches, similar };
  }, [query, shopping.products, finished]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, { pending: ShoppingItem[]; cart: ShoppingItem[] }>();
    for (const category of SHOPPING_CATEGORIES) byCategory.set(category, { pending: [], cart: [] });
    const skipped: ShoppingItem[] = [];
    for (const item of items) {
      if (item.state === 'skipped') {
        skipped.push(item);
        continue;
      }
      const bucket = byCategory.get(item.category) ?? byCategory.get('Outros');
      if (!bucket) continue;
      // No modo mercado, o que ainda não está no carrinho vem antes do que já foi marcado.
      if (mode === 'market' && item.state === 'in_cart') bucket.cart.push(item);
      else bucket.pending.push(item);
    }
    const categories = [...byCategory.entries()]
      .filter(([, g]) => g.pending.length + g.cart.length > 0)
      .map(([category, g]) => ({ category, rows: [...g.pending, ...g.cart] }));
    return { categories, skipped };
  }, [items, mode]);

  /** Executa uma gravação com trava contra duplo clique; devolve o resultado ou null em caso de erro. */
  const run = async <T,>(action: () => Promise<T>, success?: string): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (success) feedback.success(success);
      return result;
    } catch (error) {
      feedback.error(toAppError(error).message);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const addPlain = async (label: string) => {
    const created = await run(
      () =>
        repo.addItem(list.id, {
          label,
          category: 'Outros',
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
        }),
      'Item adicionado. Ajuste categoria e preço em Editar, se quiser.',
    );
    if (created) {
      setQuick('');
      setQuickError(null);
      setDuplicate(null);
    }
  };

  const addQuick = (event: FormEvent) => {
    event.preventDefault();
    if (query === '') {
      setQuickError('Digite o nome do item.');
      return;
    }
    const same = items.find(
      (i) => i.state !== 'skipped' && i.variantId === null && normalizeText(i.label) === normalizeText(query),
    );
    if (same) {
      setDuplicate(same);
      return;
    }
    void addPlain(query);
  };

  const increaseDuplicate = async () => {
    if (!duplicate) return;
    const updated = await run(
      () =>
        repo.updateItem(duplicate.id, {
          label: duplicate.label,
          category: duplicate.category,
          note: duplicate.note,
          productId: duplicate.productId,
          variantId: duplicate.variantId,
          saleUnit: duplicate.saleUnit,
          plannedQtyMilli: duplicate.plannedQtyMilli + 1000,
          estUnitPriceCents: duplicate.estUnitPriceCents,
          estSource: duplicate.estSource,
          estRefDate: duplicate.estRefDate,
          estRefStoreName: duplicate.estRefStoreName,
          estRefCondition: duplicate.estRefCondition,
        }),
      'Quantidade aumentada.',
    );
    if (updated) {
      setQuick('');
      setDuplicate(null);
    }
  };

  const onDelete = async (origin: HTMLElement) => {
    const ok = await confirm({
      title: 'Excluir esta lista?',
      description: (
        <>
          A lista <strong>{list.name}</strong> e seus {items.length} itens serão removidos. Compras já registradas no histórico não são apagadas.
        </>
      ),
      confirmLabel: 'Excluir lista',
      tone: 'danger',
    });
    if (!ok) {
      origin.focus();
      return;
    }
    const deleted = await run(() => repo.deleteShoppingList(list.id), 'Lista excluída.');
    if (deleted !== null) navigate(routes.shopping);
  };

  const duplicateThis = async () => {
    const created = await run(() => repo.duplicateList(list.id, `${list.name} (cópia)`), 'Lista duplicada.');
    if (created) navigate(routes.shoppingList(created.id));
  };

  const repurchase = async () => {
    if (!purchase) return;
    const created = await run(() => repo.repurchase(purchase.rootId, `Recompra — ${list.name}`), 'Lista de recompra criada.');
    if (created) navigate(routes.shoppingList(created.id));
  };

  const archive = async () => {
    const done = await run(() => repo.setListArchived(list.id, true), 'Lista arquivada.');
    if (done !== null) navigate(routes.shopping);
  };

  const hasCart = summary.cartCount > 0;
  const budget = list.budgetCents;
  const budgetPercent = budget !== null && budget > 0 ? Math.min(100, (summary.confirmedCents / budget) * 100) : null;
  const overBudget = budget !== null && summary.confirmedCents > budget;

  return (
    <div className={styles.page}>
      <PageHeader
        title={list.name}
        subtitle={
          <>
            {LIST_STATUS_LABELS[list.status]} · {storeText}
            {list.plannedFor ? ` · prevista para ${formatShortDate(list.plannedFor, today)}` : ''}
          </>
        }
        actions={
          <div className={styles.headerActions}>
            {!finished ? (
              <>
                <Button variant="secondary" icon={<Pencil size={18} />} onClick={(e) => setDialog({ kind: 'edit', origin: e.currentTarget })}>
                  Editar lista
                </Button>
                <Button variant="secondary" icon={<Copy size={18} />} disabled={busy} onClick={() => void duplicateThis()}>
                  Duplicar
                </Button>
                <Button variant="secondary" icon={<Archive size={18} />} disabled={busy} onClick={() => void archive()}>
                  Arquivar
                </Button>
                <Button variant="danger" icon={<Trash2 size={18} />} disabled={busy} onClick={(e) => void onDelete(e.currentTarget)}>
                  Excluir
                </Button>
              </>
            ) : (
              <>
                <Link className={styles.linkButton} to={routes.shoppingHistory}>
                  <Receipt size={18} aria-hidden="true" /> Ver no histórico
                </Link>
                <Button variant="secondary" icon={<RotateCcw size={18} />} disabled={busy || !purchase} onClick={() => void repurchase()}>
                  Recomprar
                </Button>
                <Button variant="secondary" icon={<Copy size={18} />} disabled={busy} onClick={() => void duplicateThis()}>
                  Duplicar
                </Button>
              </>
            )}
          </div>
        }
      />

      {!finished ? (
        <div className={styles.modeSwitch} role="group" aria-label="Modo da lista">
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'plan' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'plan'}
            disabled={busy || mode === 'plan'}
            onClick={() => void run(() => repo.setListMode(list.id, 'draft'))}
          >
            Planejar
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'market' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'market'}
            disabled={busy || mode === 'market'}
            onClick={() => void run(() => repo.setListMode(list.id, 'shopping'))}
          >
            Ir às compras
          </button>
        </div>
      ) : null}

      <section className={styles.summary} aria-label="Resumo da compra">
        <div className={styles.summaryGrid}>
          <div>
            <p className={styles.summaryLabel}>Previsão final</p>
            <p className={styles.summaryValue}>{money(summary.forecastCents)}</p>
            <p className={styles.itemMeta}>
              {summary.estimatedLines} com estimativa
              {summary.unknownLines > 0 ? `, ${summary.unknownLines} sem preço (fora da soma)` : ''}
            </p>
          </div>
          <div>
            <p className={styles.summaryLabel}>No carrinho (confirmado)</p>
            <p className={styles.summaryValue}>{money(summary.confirmedCents)}</p>
            <p className={styles.itemMeta}>
              {summary.cartCount} {summary.cartCount === 1 ? 'item' : 'itens'}
              {summary.cartUnconfirmed > 0 ? ` · ${summary.cartUnconfirmed} sem preço confirmado` : ''}
            </p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Orçamento</p>
            {budget === null ? (
              <p className={styles.summaryValue}>Sem limite definido</p>
            ) : (
              <>
                <p className={styles.summaryValue}>{money(budget)}</p>
                <p className={`${styles.itemMeta} ${overBudget ? styles.warning : ''}`}>
                  {summary.cartBalanceCents !== null && summary.cartBalanceCents >= 0
                    ? `Saldo no carrinho: ${money(summary.cartBalanceCents)}`
                    : `Acima do orçamento em ${money(-(summary.cartBalanceCents ?? 0))}`}
                  {summary.projectedBalanceCents !== null && summary.projectedBalanceCents < 0
                    ? ` · a previsão passa do limite em ${money(-summary.projectedBalanceCents)}`
                    : ''}
                </p>
                {budgetPercent === null ? (
                  <p className={styles.itemMeta}>Orçamento zero: qualquer gasto passa do limite.</p>
                ) : (
                  <div
                    className={styles.budgetBar}
                    role="progressbar"
                    aria-label="Gasto confirmado em relação ao orçamento"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(budgetPercent)}
                    aria-valuetext={`${Math.round(budgetPercent)}% do orçamento no carrinho`}
                  >
                    <span style={{ width: `${budgetPercent}%` }} className={overBudget ? styles.budgetOver : ''} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {finished && purchase ? (
          <p className={styles.itemMeta}>
            Compra de {formatShortDate(purchase.purchasedOn, today)} · total {money(purchase.totalCents)} ·{' '}
            {storeLabel(purchase.storeName, purchase.storeBranch)}
          </p>
        ) : null}
      </section>

      {!finished ? (
        <section className={styles.card} aria-label="Adicionar item">
          <form onSubmit={addQuick} className={styles.quickForm} noValidate>
            <div className={styles.quickField}>
              <label htmlFor={`quick-${list.id}`} className={styles.label}>
                Adicionar item
              </label>
              <input
                id={`quick-${list.id}`}
                className="control"
                type="text"
                value={quick}
                autoComplete="off"
                maxLength={200}
                placeholder="Ex.: arroz, café, leite"
                aria-invalid={quickError ? true : undefined}
                aria-describedby={quickError ? `quick-error-${list.id}` : undefined}
                onChange={(e) => {
                  setQuick(e.target.value);
                  setQuickError(null);
                  setDuplicate(null);
                }}
              />
              {quickError ? (
                <p id={`quick-error-${list.id}`} className={styles.inlineError}>
                  {quickError}
                </p>
              ) : null}
            </div>
            <div className={styles.quickButtons}>
              <Button type="submit" variant="primary" disabled={busy || query === ''}>
                Adicionar
              </Button>
              <Button variant="secondary" onClick={(e) => setDialog({ kind: 'add', origin: e.currentTarget })}>
                Com detalhes
              </Button>
            </div>
          </form>

          {catalog.matches.length > 0 ? (
            <div className={styles.suggestions} aria-label="Cadastros que combinam">
              <p className={styles.itemMeta}>Cadastrados:</p>
              {catalog.matches.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  onClick={(e) =>
                    setDialog({ kind: 'add', origin: e.currentTarget, prefill: { label: p.name, productId: p.id, variantId: null } })
                  }
                >
                  {p.name}
                  {p.brand ? ` · ${p.brand}` : ''}
                </Button>
              ))}
            </div>
          ) : catalog.similar.length > 0 ? (
            <p className={styles.itemMeta}>
              Parecidos (não são o mesmo produto automaticamente): {catalog.similar.map((p) => p.name).join(', ')}.
            </p>
          ) : null}

          {duplicate ? (
            <div role="alert" className={styles.subPanel}>
              <p>
                Já existe na lista: <strong>{duplicate.label}</strong> ({formatMilli(duplicate.plannedQtyMilli)} {duplicate.saleUnit}).
                {duplicate.priceConfirmed ? ' Ele tem preço confirmado: não somo automaticamente.' : ''}
              </p>
              <div className={styles.actionsRow}>
                {duplicate.priceConfirmed ? null : (
                  <Button variant="primary" disabled={busy} onClick={() => void increaseDuplicate()}>
                    Aumentar para {formatMilli(duplicate.plannedQtyMilli + 1000)} {duplicate.saleUnit}
                  </Button>
                )}
                <Button variant="secondary" disabled={busy} onClick={() => void addPlain(query)}>
                  Manter linha separada
                </Button>
                <Button variant="ghost" onClick={() => setDuplicate(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
          <p className={styles.itemMeta}>Quantidade 1 e categoria “Outros” por padrão. Use Editar para embalagem, preço e categoria.</p>
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="Nenhum item nesta lista">
          <p>Adicione o primeiro item acima. Nada é comprado nem cobrado sem você confirmar.</p>
        </EmptyState>
      ) : null}

      {groups.categories.map((group) => (
        <section key={group.category} className={styles.group} aria-labelledby={`cat-${list.id}-${group.category}`}>
          <h2 id={`cat-${list.id}-${group.category}`} className={styles.groupTitle}>
            {group.category}
          </h2>
          <ul className={styles.itemList}>
            {group.rows.map((item) => (
              <ItemRow key={item.id} item={item} list={list} mode={mode} observed={observed} />
            ))}
          </ul>
        </section>
      ))}

      {groups.skipped.length > 0 ? (
        <section className={styles.group} aria-labelledby={`skip-${list.id}`}>
          <h2 id={`skip-${list.id}`} className={styles.groupTitle}>
            Desistidos (fora da previsão)
          </h2>
          <ul className={styles.itemList}>
            {groups.skipped.map((item) => (
              <ItemRow key={item.id} item={item} list={list} mode={mode} observed={observed} />
            ))}
          </ul>
        </section>
      ) : null}

      {!finished ? (
        <div className={styles.finishBar}>
          <p className={styles.itemMeta}>
            {hasCart
              ? `${summary.cartCount} no carrinho${summary.cartUnconfirmed > 0 ? `, ${summary.cartUnconfirmed} sem preço confirmado` : ''}.`
              : 'Para finalizar, marque itens no carrinho no modo “Ir às compras”.'}
          </p>
          <Button variant="primary" disabled={!hasCart || busy} onClick={(e) => setDialog({ kind: 'finish', origin: e.currentTarget })}>
            Revisar e finalizar
          </Button>
        </div>
      ) : null}

      {dialog?.kind === 'edit' ? <ListDialog list={list} origin={dialog.origin} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'add' ? (
        <ItemDialog list={list} origin={dialog.origin} prefill={dialog.prefill} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'finish' ? (
        <FinalizeDialog list={list} origin={dialog.origin} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
