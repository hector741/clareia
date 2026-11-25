import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFeedback } from '../../app/feedback';
import { routes } from '../../app/routes';
import { usePageTitle } from '../../app/usePageTitle';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { repo, toAppError } from '../../db';
import { matchesQuery } from '../../domain/shopping/search';
import { storeLabel } from '../../domain/shopping/compare';
import { SHOPPING_CATEGORIES, type ShoppingCategory } from '../../domain/shopping/types';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

export function ProductsPage() {
  usePageTitle('Produtos e mercados');
  const shopping = useShopping();
  const feedback = useFeedback();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const products = useMemo(
    () =>
      shopping.products
        .filter((p) => (showArchived ? p.archivedAt !== null : p.archivedAt === null))
        .filter((p) => query.trim() === '' || matchesQuery(`${p.name} ${p.brand ?? ''} ${p.variation ?? ''}`, query))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [shopping.products, query, showArchived],
  );

  const variantCount = (productId: string) => shopping.variants.filter((v) => v.productId === productId && v.archivedAt === null).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Produtos e mercados"
        subtitle="Cadastros reutilizados nas listas. Produtos parecidos não são unidos automaticamente."
        actions={
          <Link className={styles.linkButton} to={routes.shoppingHistory}>
            Ver histórico
          </Link>
        }
      />

      <StoresPanel />

      <section className={styles.card} aria-labelledby="products-title">
        <h2 id="products-title" className={styles.groupTitle}>
          Produtos
        </h2>
        <Field label="Buscar produto">
          <input
            type="search"
            className="control"
            value={query}
            autoComplete="off"
            placeholder="Ex.: café, arroz"
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>Mostrar arquivados</span>
        </label>
        {products.length === 0 ? (
          <EmptyState title={query ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}>
            <p>Produtos são criados ao identificar itens nas listas. Nenhum preço é inventado aqui.</p>
          </EmptyState>
        ) : (
          <ul className={styles.plainList} aria-label="Produtos">
            {products.map((p) => (
              <li key={p.id}>
                <Link className={styles.productLink} to={routes.shoppingProduct(p.id)}>
                  <strong>{p.name}</strong>
                  <span className={styles.itemMeta}>
                    {[p.brand, p.variation].filter(Boolean).join(' · ') || p.defaultCategory} · {variantCount(p.id)}{' '}
                    {variantCount(p.id) === 1 ? 'embalagem' : 'embalagens'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <NewProductForm onCreated={() => feedback.success('Produto cadastrado.')} />
      </section>
    </div>
  );
}

function StoresPanel() {
  const shopping = useShopping();
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await repo.createStore({ name, branch: branch.trim() === '' ? null : branch });
      feedback.success('Mercado cadastrado.');
      setName('');
      setBranch('');
      setErrors({});
    } catch (error) {
      const appError = toAppError(error);
      setErrors(Object.keys(appError.fields).length > 0 ? appError.fields : { form: appError.message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, archived: boolean) => {
    try {
      await repo.setStoreArchived(id, archived);
    } catch (error) {
      feedback.error(toAppError(error).message);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="stores-title">
      <h2 id="stores-title" className={styles.groupTitle}>
        Mercados
      </h2>
      {shopping.stores.length === 0 ? (
        <p className={styles.itemMeta}>Nenhum mercado cadastrado. Você também pode cadastrar na hora, ao criar uma lista.</p>
      ) : (
        <ul className={styles.plainList}>
          {shopping.stores.map((s) => (
            <li key={s.id} className={styles.variantRow}>
              <span>
                {storeLabel(s.name, s.branch)}
                {s.archivedAt ? ' · arquivado' : ''}
              </span>
              <Button variant="ghost" onClick={() => void toggle(s.id, s.archivedAt === null)}>
                {s.archivedAt === null ? 'Arquivar' : 'Reativar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate>
        <div className={styles.twoCols}>
          <Field label="Nome do mercado" error={errors.name}>
            <input type="text" className="control" value={name} autoComplete="off" maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Unidade ou filial (opcional)" error={errors.branch}>
            <input type="text" className="control" value={branch} autoComplete="off" maxLength={80} onChange={(e) => setBranch(e.target.value)} />
          </Field>
        </div>
        {errors.form ? (
          <p role="alert" className={styles.inlineError}>
            {errors.form}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            Cadastrar mercado
          </Button>
        </div>
      </form>
    </section>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [variation, setVariation] = useState('');
  const [category, setCategory] = useState<ShoppingCategory>('Outros');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await repo.createProduct({
        name,
        brand: brand.trim() === '' ? null : brand,
        variation: variation.trim() === '' ? null : variation,
        defaultCategory: category,
      });
      setName('');
      setBrand('');
      setVariation('');
      setErrors({});
      onCreated();
    } catch (error) {
      const appError = toAppError(error);
      setErrors(Object.keys(appError.fields).length > 0 ? appError.fields : { form: appError.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className={styles.formStack} noValidate aria-label="Novo produto">
      <h3 className={styles.groupTitle}>Novo produto</h3>
      <div className={styles.twoCols}>
        <Field label="Nome" error={errors.name}>
          <input type="text" className="control" value={name} autoComplete="off" maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Marca (opcional)" error={errors.brand}>
          <input type="text" className="control" value={brand} autoComplete="off" maxLength={80} onChange={(e) => setBrand(e.target.value)} />
        </Field>
      </div>
      <div className={styles.twoCols}>
        <Field label="Tipo ou variação (opcional)" error={errors.variation}>
          <input type="text" className="control" value={variation} autoComplete="off" maxLength={80} onChange={(e) => setVariation(e.target.value)} />
        </Field>
        <Field label="Categoria padrão">
          <select className="control" value={category} onChange={(e) => setCategory(e.target.value as ShoppingCategory)}>
            {SHOPPING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {errors.form ? (
        <p role="alert" className={styles.inlineError}>
          {errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" disabled={saving}>
          Cadastrar produto
        </Button>
      </div>
    </form>
  );
}
