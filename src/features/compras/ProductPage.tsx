import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFeedback } from '../../app/feedback';
import { routes } from '../../app/routes';
import { usePageTitle } from '../../app/usePageTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { repo, toAppError } from '../../db';
import { formatShortDate, todayLocal } from '../../domain/dates';
import type { DateString } from '../../domain/types';
import { observations, storeLabel, type Change, type CompareBase, type CompareMode, type Observation } from '../../domain/shopping/compare';
import { ratioToCents } from '../../domain/shopping/money';
import { formatQuantity, parseContentInput } from '../../domain/shopping/quantity';
import { SALE_FORMS, type SaleForm, type ShoppingVariant } from '../../domain/shopping/types';
import { activePurchases, useShopping } from './useShopping';
import { describeChange, money, perUnitLabel, SALE_FORM_LABELS, variantText } from './format';
import { buildRows, productObservations, summarizeHistory, type HistoryFilters, type HistoryRow } from './productHistory';
import styles from './compras.module.css';

export function ProductPage() {
  const { id = '' } = useParams();
  const shopping = useShopping();
  const product = shopping.products.find((p) => p.id === id);
  usePageTitle(product ? product.name : 'Produto não encontrado');
  if (!product) {
    return (
      <div className={styles.page}>
        <EmptyState title="Este produto não existe" tone="danger">
          <p>
            <Link to={routes.shoppingProducts}>Voltar para produtos</Link>
          </p>
        </EmptyState>
      </div>
    );
  }
  return <ProductView key={product.id} productId={product.id} />;
}

function ProductView({ productId }: { productId: string }) {
  const shopping = useShopping();
  const today = todayLocal();
  const product = shopping.products.find((p) => p.id === productId);
  const variants = shopping.variants.filter((v) => v.productId === productId);
  const purchases = useMemo(() => activePurchases(shopping), [shopping]);

  const [mode, setMode] = useState<CompareMode>('variant');
  const [variantChoice, setVariantChoice] = useState<string | null>(null);
  const [baseChoice, setBaseChoice] = useState<CompareBase | null>(null);
  const [storeFilter, setStoreFilter] = useState('');
  const [from, setFrom] = useState('');

  // Todas as observações do produto no modo escolhido: base das referências e das variações.
  const scoped = useMemo(
    () => observations(purchases, mode).filter((o) => o.productId === productId),
    [purchases, mode, productId],
  );
  const bases = [...new Set(scoped.map((o) => o.base))];
  const firstVariantWithData = scoped.find((o) => o.variantId)?.variantId ?? variants[0]?.id ?? null;
  const selectedVariant = variantChoice ?? firstVariantWithData;
  const selectedBase: CompareBase | null = mode === 'content' ? (baseChoice ?? bases[0] ?? null) : null;

  const filters: HistoryFilters = {
    mode,
    base: selectedBase,
    variantId: selectedVariant,
    storeId: storeFilter === '' ? null : storeFilter,
    from: from === '' ? null : from,
  };
  const shown = productObservations(purchases, productId, filters);
  const rows = buildRows(scoped, shown);
  const summary = summarizeHistory(scoped, shown);
  const unit: CompareBase =
    mode === 'variant' ? (variants.find((v) => v.id === selectedVariant)?.saleUnit ?? 'un') : (selectedBase ?? 'un');

  const storeOptions = shopping.stores.map((s) => ({ id: s.id, label: storeLabel(s.name, s.branch) }));

  if (!product) return null;

  return (
    <div className={styles.page}>
      <PageHeader
        title={product.name}
        subtitle={[product.brand, product.variation].filter(Boolean).join(' · ') || 'Produto sem marca cadastrada'}
        actions={
          <Link className={styles.linkButton} to={routes.shoppingProducts}>
            Todos os produtos
          </Link>
        }
      />

      <section className={styles.card} aria-label="Como comparar">
        <div className={styles.modeSwitch} role="group" aria-label="Modo de comparação">
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'variant' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'variant'}
            onClick={() => setMode('variant')}
          >
            Mesma embalagem
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'content' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'content'}
            onClick={() => setMode('content')}
          >
            Por conteúdo (kg, L ou un)
          </button>
        </div>
        <p className={styles.itemMeta}>
          {mode === 'variant'
            ? 'Preço efetivo por unidade vendida, só entre embalagens iguais.'
            : 'Preço por kg, por L ou por unidade do conteúdo. Massa e volume nunca se misturam.'}
        </p>
        <div className={styles.filterGrid}>
          {mode === 'variant' ? (
            <Field label="Embalagem">
              <select className="control" value={selectedVariant ?? ''} onChange={(e) => setVariantChoice(e.target.value || null)}>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {variantText(v)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Base">
              <select
                className="control"
                value={selectedBase ?? ''}
                disabled={bases.length === 0}
                onChange={(e) => setBaseChoice(e.target.value as CompareBase)}
              >
                {bases.length === 0 ? <option value="">Sem compras com conteúdo</option> : null}
                {bases.map((b) => (
                  <option key={b} value={b}>
                    Por {b}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Mercado">
            <select className="control" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">Todos os mercados</option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="A partir de">
            <input type="date" className="control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
      </section>

      {shown.length === 0 ? (
        <EmptyState title="Ainda não há compras finalizadas com este filtro">
          <p>Estimativas e itens pendentes não aparecem aqui. Quando uma compra for finalizada, o preço entra no histórico.</p>
        </EmptyState>
      ) : (
        <>
          <section className={styles.summaryGrid} aria-label="Resumo do preço">
            <div className={styles.card}>
              <p className={styles.summaryLabel}>Último preço confirmado</p>
              {summary.last ? (
                <>
                  <p className={styles.summaryValue}>
                    {money(ratioToCents(summary.last.unit))} {perUnitLabel(summary.last.base)}
                  </p>
                  <p className={styles.itemMeta}>
                    {formatShortDate(summary.last.purchasedOn, today)} · {storeLabel(summary.last.storeName, summary.last.storeBranch)}
                  </p>
                  <p className={styles.comparison}>{changeText(summary.lastChange, summary.last, summary.lastPrevious, today)}</p>
                </>
              ) : null}
            </div>
            <div className={styles.card}>
              <p className={styles.summaryLabel}>Menor preço registrado</p>
              {summary.lowest ? (
                <>
                  <p className={styles.summaryValue}>
                    {money(ratioToCents(summary.lowest.unit))} {perUnitLabel(summary.lowest.base)}
                  </p>
                  <p className={styles.itemMeta}>
                    {formatShortDate(summary.lowest.purchasedOn, today)} · {storeLabel(summary.lowest.storeName, summary.lowest.storeBranch)}
                  </p>
                </>
              ) : null}
            </div>
          </section>

          <section className={styles.card} aria-labelledby="chart-title">
            <h2 id="chart-title" className={styles.groupTitle}>
              Evolução do preço
            </h2>
            <PriceChart rows={rows} unit={unit} today={today} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  Compras com preço por unidade, mercado, quantidade e variação em relação à compra anterior no mesmo mercado
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Mercado</th>
                    <th scope="col">Quantidade</th>
                    <th scope="col">Preço {perUnitLabel(unit)}</th>
                    <th scope="col">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr key={`${row.observation.purchaseId}-${row.observation.base}-${row.observation.variantId ?? ''}`}>
                        <td>{formatShortDate(row.observation.purchasedOn, today)}</td>
                        <td>{storeLabel(row.observation.storeName, row.observation.storeBranch)}</td>
                        <td>{formatQuantity(row.observation.quantityMilli, row.observation.base)}</td>
                        <td>{money(ratioToCents(row.observation.unit))}</td>
                        <td>{changeText(row.change, row.observation, row.previous, today)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <VariantsPanel productId={productId} variants={variants} />
    </div>
  );
}

function changeText(change: Change, current: Observation, previous: Observation | null, today: DateString): string {
  const reference = previous ? { date: previous.purchasedOn, storeLabel: storeLabel(previous.storeName, previous.storeBranch) } : null;
  return describeChange(change, current.base, reference, today);
}

/** Gráfico só com os pontos reais (sem interpolação); cada ponto tem tooltip com data, mercado e valor. */
function PriceChart({ rows, unit, today }: { rows: HistoryRow[]; unit: CompareBase; today: DateString }) {
  const width = 640;
  const height = 240;
  const pad = 48;
  if (rows.length === 0) return null;
  const values = rows.map((r) => ratioToCents(r.observation.unit));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (rows.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (rows.length - 1));
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2));
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico de preço por ${unit} com ${rows.length} compras. Os valores estão na tabela abaixo.`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className={styles.axis} />
        <text x={4} y={y(max) + 4} className={styles.axisText}>
          {money(max)}
        </text>
        <text x={4} y={y(min) + 4} className={styles.axisText}>
          {money(min)}
        </text>
        {rows.length > 1 ? <polyline points={points} className={styles.line} fill="none" /> : null}
        {rows.map((r, i) => (
          <circle key={`${r.observation.purchaseId}-${i}`} cx={x(i)} cy={y(values[i] ?? 0)} r={6} className={styles.point}>
            <title>
              {`${formatShortDate(r.observation.purchasedOn, today)} — ${storeLabel(r.observation.storeName, r.observation.storeBranch)}: ${money(values[i] ?? 0)} ${perUnitLabel(unit)}`}
            </title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function VariantsPanel({ productId, variants }: { productId: string; variants: ShoppingVariant[] }) {
  const feedback = useFeedback();
  const [form, setForm] = useState<SaleForm>('package');
  const [content, setContent] = useState('');
  const [looseUnit, setLooseUnit] = useState<'kg' | 'L'>('kg');
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    let content_: { contentMilli: number; contentUnit: 'kg' | 'L' | 'un' } | null = null;
    if (form === 'package') {
      const parsed = parseContentInput(content);
      if (!parsed.ok) {
        setErrors({ content: parsed.message });
        return;
      }
      content_ = { contentMilli: parsed.contentMilli, contentUnit: parsed.contentUnit };
    } else if (form === 'loose') {
      content_ = { contentMilli: 1000, contentUnit: looseUnit };
    }
    setSaving(true);
    try {
      await repo.createVariant(productId, { saleForm: form, content: content_, label: label.trim() || null });
      feedback.success('Embalagem cadastrada.');
      setContent('');
      setLabel('');
      setErrors({});
    } catch (error) {
      const appError = toAppError(error);
      setErrors(Object.keys(appError.fields).length > 0 ? appError.fields : { form: appError.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (variant: ShoppingVariant) => {
    try {
      await repo.archiveVariant(variant.id, variant.archivedAt === null);
      feedback.success(variant.archivedAt === null ? 'Embalagem arquivada.' : 'Embalagem reativada.');
    } catch (error) {
      feedback.error(toAppError(error).message);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="variants-title">
      <h2 id="variants-title" className={styles.groupTitle}>
        Embalagens
      </h2>
      {variants.length === 0 ? (
        <p className={styles.itemMeta}>Nenhuma embalagem cadastrada. Ela é criada ao identificar um item na lista.</p>
      ) : (
        <ul className={styles.plainList}>
          {variants.map((v) => (
            <li key={v.id} className={styles.variantRow}>
              <span>
                {variantText(v)} · {SALE_FORM_LABELS[v.saleForm]}
                {v.archivedAt ? ' · arquivada' : ''}
              </span>
              <Button variant="ghost" onClick={() => void toggleArchive(v)}>
                {v.archivedAt === null ? 'Arquivar' : 'Reativar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
        <div className={styles.twoCols}>
          <Field label="Tipo de venda">
            <select className="control" value={form} onChange={(e) => setForm(e.target.value as SaleForm)}>
              {SALE_FORMS.map((f) => (
                <option key={f} value={f}>
                  {SALE_FORM_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          {form === 'package' ? (
            <Field label="Conteúdo do pacote" error={errors.content} hint="Ex.: 500 g, 1 L, 6 un.">
              <input type="text" className="control" value={content} autoComplete="off" onChange={(e) => setContent(e.target.value)} />
            </Field>
          ) : form === 'loose' ? (
            <Field label="Vendido por">
              <select className="control" value={looseUnit} onChange={(e) => setLooseUnit(e.target.value as 'kg' | 'L')}>
                <option value="kg">Quilo (kg)</option>
                <option value="L">Litro (L)</option>
              </select>
            </Field>
          ) : null}
        </div>
        <Field label="Identificação (opcional)" error={errors.label}>
          <input type="text" className="control" value={label} autoComplete="off" maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {errors.form ? (
          <p role="alert" className={styles.inlineError}>
            {errors.form}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            Cadastrar embalagem
          </Button>
        </div>
      </form>
    </section>
  );
}
