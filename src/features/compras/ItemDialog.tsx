import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { Field } from '../../components/ui/Field';
import { repo, toAppError } from '../../db';
import { NO_ESTIMATE, type EstimateFields } from '../../domain/shopping/carry';
import { normalizeText, matchesQuery, similarNames } from '../../domain/shopping/search';
import { centsToInput, parseBrl } from '../../domain/shopping/money';
import { parseContentInput, parseQuantityInput, formatMilli } from '../../domain/shopping/quantity';
import { storeLabel } from '../../domain/shopping/compare';
import { SHOPPING_CATEGORIES, type SaleForm, type SaleUnit, type ShoppingCategory, type ShoppingItem, type ShoppingList } from '../../domain/shopping/types';
import { formatShortDate, todayLocal } from '../../domain/dates';
import { SALE_FORM_LABELS, money, variantText } from './format';
import { useShopping } from './useShopping';
import styles from './compras.module.css';

const NEW_VARIANT = 'new';
const NO_VARIANT = '';

/** Preenchimento vindo do cadastro (escolhido na busca da tela da lista). */
export interface Prefill {
  label: string;
  productId: string;
  variantId: string | null;
}

interface Props {
  list: ShoppingList;
  /** Ausente para adicionar; presente para editar. */
  item?: ShoppingItem;
  prefill?: Prefill;
  origin: HTMLElement | null;
  onClose: () => void;
}

interface Duplicate {
  existing: ShoppingItem;
  qtyMilli: number;
  /** Só permite somar quando a linha existente não tem preço confirmado e o preço não muda. */
  canIncrease: boolean;
}

export function ItemDialog({ list, item, prefill, origin, onClose }: Props) {
  const feedback = useFeedback();
  const shopping = useShopping();
  const editing = item !== undefined;
  const today = todayLocal();

  const products = useMemo(() => shopping.products.filter((p) => p.archivedAt === null), [shopping.products]);
  const [label, setLabel] = useState(item?.label ?? prefill?.label ?? '');
  const [productId, setProductId] = useState<string | null>(item?.productId ?? prefill?.productId ?? null);
  const [variantChoice, setVariantChoice] = useState<string>(item?.variantId ?? prefill?.variantId ?? NO_VARIANT);
  const [category, setCategory] = useState<ShoppingCategory>(item?.category ?? 'Outros');
  const [unitChoice, setUnitChoice] = useState<SaleUnit>(item?.saleUnit ?? 'un');
  const [qty, setQty] = useState(item ? formatMilli(item.plannedQtyMilli) : '1');
  const [newForm, setNewForm] = useState<SaleForm>('package');
  const [newContent, setNewContent] = useState('');
  const [newLooseUnit, setNewLooseUnit] = useState<'kg' | 'L'>('kg');
  const [newVariantLabel, setNewVariantLabel] = useState('');
  const [note, setNote] = useState(item?.note ?? '');
  const [priceText, setPriceText] = useState(centsToInput(item?.estUnitPriceCents ?? null));
  const [origin0, setOrigin0] = useState<EstimateFields>(
    item
      ? {
          estUnitPriceCents: item.estUnitPriceCents,
          estSource: item.estSource,
          estRefDate: item.estRefDate,
          estRefStoreName: item.estRefStoreName,
          estRefCondition: item.estRefCondition,
        }
      : NO_ESTIMATE,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const chosenVariant = variantChoice !== NO_VARIANT && variantChoice !== NEW_VARIANT
    ? shopping.variants.find((v) => v.id === variantChoice) ?? null
    : null;
  const productVariants = useMemo(
    () => shopping.variants.filter((v) => v.productId === productId && v.archivedAt === null),
    [shopping.variants, productId],
  );

  // Unidade efetiva: a da embalagem escolhida, ou a da embalagem nova; senão a escolhida manualmente.
  const effectiveUnit: SaleUnit = chosenVariant
    ? chosenVariant.saleUnit
    : variantChoice === NEW_VARIANT
      ? newForm === 'loose'
        ? newLooseUnit
        : 'un'
      : unitChoice;
  const unitLocked = chosenVariant !== null || (variantChoice === NEW_VARIANT && newForm !== 'loose');

  const suggestions = useMemo(() => {
    const query = label.trim();
    if (query.length === 0 || productId !== null) return { matches: [], similar: [] };
    const matches = products.filter((p) => matchesQuery(`${p.name} ${p.brand ?? ''} ${p.variation ?? ''}`, query)).slice(0, 5);
    const similar = matches.length === 0 ? similarNames(query, products, 3) : [];
    return { matches, similar };
  }, [label, productId, products]);

  // Estimativa sugerida para a embalagem escolhida neste mercado (só leitura).
  const suggestion = chosenVariant ? repo.suggestEstimate(chosenVariant.id, list.storeId) : null;

  const choose = (product: { id: string; name: string; defaultCategory: ShoppingCategory }) => {
    setProductId(product.id);
    setLabel(product.name);
    setCategory(product.defaultCategory);
    setVariantChoice(NO_VARIANT);
    setErrors({});
  };

  const useSuggestion = () => {
    if (!suggestion || suggestion.kind === 'none') return;
    setPriceText(centsToInput(suggestion.estimate.estUnitPriceCents));
    setOrigin0(suggestion.estimate);
  };

  const focusInvalid = () => {
    window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
  };

  const submitValues = async (skipDuplicateCheck: boolean): Promise<void> => {
    const parsedQty = parseQuantityInput(qty, effectiveUnit);
    if (!parsedQty.ok) {
      setErrors({ qty: parsedQty.message });
      focusInvalid();
      return;
    }
    let cents: number | null = null;
    if (priceText.trim() !== '') {
      const parsedPrice = parseBrl(priceText);
      if (!parsedPrice.ok) {
        setErrors({ price: parsedPrice.message });
        focusInvalid();
        return;
      }
      cents = parsedPrice.cents;
    }
    if (label.trim() === '') {
      setErrors({ label: 'Informe o nome do item.' });
      focusInvalid();
      return;
    }

    // Estimativa: se o preço não mudou, mantém a origem (sugestão ou última compra); senão é digitada.
    const estimate: EstimateFields =
      cents === null
        ? NO_ESTIMATE
        : cents === origin0.estUnitPriceCents
          ? origin0
          : { estUnitPriceCents: cents, estSource: 'manual', estRefDate: null, estRefStoreName: null, estRefCondition: null };

    let variantId = chosenVariant?.id ?? null;
    let resolvedProductId = productId;
    let resolvedUnit = effectiveUnit;

    // Duplicidade: mesma embalagem (ou mesmo nome sem embalagem) já na lista.
    if (!editing && !skipDuplicateCheck) {
      const existing = shopping.items.find(
        (i) =>
          i.listId === list.id &&
          i.state !== 'skipped' &&
          (variantId !== null ? i.variantId === variantId : i.variantId === null && normalizeText(i.label) === normalizeText(label)),
      );
      if (existing) {
        const samePrice = existing.estUnitPriceCents === cents;
        setDuplicate({
          existing,
          qtyMilli: parsedQty.milli,
          canIncrease: !existing.priceConfirmed && samePrice && existing.saleUnit === effectiveUnit,
        });
        return;
      }
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (variantChoice === NEW_VARIANT) {
        if (resolvedProductId === null) {
          const created = await repo.createProduct({ name: label.trim(), brand: null, variation: null, defaultCategory: category });
          resolvedProductId = created.id;
        }
        let content: { contentMilli: number; contentUnit: 'kg' | 'L' | 'un' } | null = null;
        if (newForm === 'package') {
          const parsedContent = parseContentInput(newContent);
          if (!parsedContent.ok) {
            setErrors({ newContent: parsedContent.message });
            focusInvalid();
            return;
          }
          content = { contentMilli: parsedContent.contentMilli, contentUnit: parsedContent.contentUnit };
        } else if (newForm === 'loose') {
          content = { contentMilli: 1000, contentUnit: newLooseUnit };
        }
        const variant = await repo.createVariant(resolvedProductId, {
          saleForm: newForm,
          content,
          label: newVariantLabel.trim() || null,
        });
        variantId = variant.id;
        resolvedUnit = variant.saleUnit;
      }
      const payload = {
        label: label.trim(),
        category,
        note: note.trim(),
        productId: resolvedProductId,
        variantId,
        saleUnit: resolvedUnit,
        plannedQtyMilli: parsedQty.milli,
        estUnitPriceCents: estimate.estUnitPriceCents,
        estSource: estimate.estSource,
        estRefDate: estimate.estRefDate,
        estRefStoreName: estimate.estRefStoreName,
        estRefCondition: estimate.estRefCondition,
      };
      if (editing) {
        await repo.updateItem(item.id, payload);
        feedback.success('Item atualizado.');
      } else {
        await repo.addItem(list.id, payload);
        feedback.success('Item adicionado.');
      }
      onClose();
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === 'validation') setErrors(appError.fields);
      else setErrors({ form: appError.message });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    void submitValues(false);
  };

  const increaseExisting = async () => {
    if (!duplicate || savingRef.current) return;
    const { existing, qtyMilli } = duplicate;
    savingRef.current = true;
    setSaving(true);
    try {
      await repo.updateItem(existing.id, {
        label: existing.label,
        category: existing.category,
        note: existing.note,
        productId: existing.productId,
        variantId: existing.variantId,
        saleUnit: existing.saleUnit,
        plannedQtyMilli: existing.plannedQtyMilli + qtyMilli,
        estUnitPriceCents: existing.estUnitPriceCents,
        estSource: existing.estSource,
        estRefDate: existing.estRefDate,
        estRefStoreName: existing.estRefStoreName,
        estRefCondition: existing.estRefCondition,
      });
      feedback.success('Quantidade aumentada na linha existente.');
      onClose();
    } catch (error) {
      setErrors({ form: toAppError(error).message });
      setDuplicate(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const keepSeparate = () => {
    setDuplicate(null);
    void submitValues(true);
  };

  const currentStore = shopping.stores.find((s) => s.id === list.storeId);
  const storeName = currentStore ? storeLabel(currentStore.name, currentStore.branch) : 'Mercado não informado';

  return (
    <Dialog.Root open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content
          className={`${dialogStyles.alertContent} ${styles.wideDialog}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus]')?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus(origin);
          }}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title className={dialogStyles.alertTitle}>{editing ? 'Editar item' : 'Adicionar item'}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
            </Dialog.Close>
          </div>
          <form ref={formRef} onSubmit={onSubmit} className={styles.formStack} noValidate>
            <Field label="Nome do item" error={errors.label}>
              <input
                type="text"
                className="control"
                value={label}
                data-autofocus
                autoComplete="off"
                maxLength={200}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setProductId(null);
                  setVariantChoice(NO_VARIANT);
                  setErrors({});
                  setDuplicate(null);
                }}
              />
            </Field>
            {suggestions.matches.length > 0 ? (
              <div className={styles.suggestions} aria-label="Produtos cadastrados que combinam">
                <p className={styles.itemMeta}>Usar cadastro:</p>
                {suggestions.matches.map((p) => (
                  <Button key={p.id} variant="secondary" onClick={() => choose(p)}>
                    {p.name}
                    {p.brand ? ` · ${p.brand}` : ''}
                  </Button>
                ))}
              </div>
            ) : null}
            {suggestions.similar.length > 0 ? (
              <div className={styles.suggestions}>
                <p className={styles.itemMeta}>
                  Parecidos (não são o mesmo produto automaticamente). Use só se for este:
                </p>
                {suggestions.similar.map((p) => (
                  <Button key={p.id} variant="secondary" onClick={() => choose(p)}>
                    {p.name}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className={styles.twoCols}>
              <Field label="Embalagem" error={errors.variantId}>
                <select
                  className="control"
                  value={variantChoice}
                  onChange={(e) => {
                    setVariantChoice(e.target.value);
                    const picked = shopping.variants.find((v) => v.id === e.target.value);
                    if (picked) setUnitChoice(picked.saleUnit);
                    setErrors({});
                  }}
                >
                  <option value={NO_VARIANT}>Sem embalagem definida</option>
                  {productVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {variantText(v)}
                    </option>
                  ))}
                  <option value={NEW_VARIANT}>Nova embalagem…</option>
                </select>
              </Field>
              <Field label="Categoria" error={errors.category}>
                <select className="control" value={category} onChange={(e) => setCategory(e.target.value as ShoppingCategory)}>
                  {SHOPPING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {variantChoice === NEW_VARIANT ? (
              <div className={styles.subPanel}>
                <div className={styles.twoCols}>
                  <Field label="Tipo de venda" error={errors.saleForm}>
                    <select className="control" value={newForm} onChange={(e) => setNewForm(e.target.value as SaleForm)}>
                      {(Object.keys(SALE_FORM_LABELS) as SaleForm[]).map((f) => (
                        <option key={f} value={f}>
                          {SALE_FORM_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {newForm === 'package' ? (
                    <Field
                      label="Conteúdo do pacote"
                      error={errors.newContent}
                      hint="Ex.: 500 g, 1 kg, 350 ml, 1 L, 12 un."
                    >
                      <input
                        type="text"
                        className="control"
                        value={newContent}
                        autoComplete="off"
                        placeholder="500 g"
                        onChange={(e) => {
                          setNewContent(e.target.value);
                          setErrors({});
                        }}
                      />
                    </Field>
                  ) : newForm === 'loose' ? (
                    <Field label="Vendido por">
                      <select className="control" value={newLooseUnit} onChange={(e) => setNewLooseUnit(e.target.value as 'kg' | 'L')}>
                        <option value="kg">Quilo (kg)</option>
                        <option value="L">Litro (L)</option>
                      </select>
                    </Field>
                  ) : null}
                </div>
                <Field label="Identificação da embalagem (opcional)" hint="Ex.: marca, versão, sem glúten.">
                  <input
                    type="text"
                    className="control"
                    value={newVariantLabel}
                    autoComplete="off"
                    maxLength={80}
                    onChange={(e) => setNewVariantLabel(e.target.value)}
                  />
                </Field>
                <p className={styles.itemMeta}>
                  Sem produto escolhido, o nome do item vira o cadastro do produto. Quantidades em gramas e mililitros são convertidas para kg e L.
                </p>
              </div>
            ) : null}

            <div className={styles.twoCols}>
              <Field
                label={unitLocked ? `Quantidade (${effectiveUnit})` : 'Quantidade'}
                error={errors.qty}
                hint={
                  effectiveUnit === 'un'
                    ? 'Em unidades: número inteiro.'
                    : `Em ${effectiveUnit}: até 3 casas. Também aceita ${effectiveUnit === 'kg' ? 'gramas (ex.: 500 g)' : 'mililitros (ex.: 350 ml)'}.`
                }
              >
                <input
                  type="text"
                  inputMode="decimal"
                  className="control"
                  value={qty}
                  autoComplete="off"
                  onChange={(e) => {
                    setQty(e.target.value);
                    setErrors({});
                  }}
                />
              </Field>
              <Field label="Unidade de venda">
                <select
                  className="control"
                  value={effectiveUnit}
                  disabled={unitLocked}
                  onChange={(e) => setUnitChoice(e.target.value as SaleUnit)}
                >
                  <option value="un">Unidade (un)</option>
                  <option value="kg">Quilo (kg)</option>
                  <option value="L">Litro (L)</option>
                </select>
              </Field>
            </div>

            <Field
              label="Preço estimado por unidade de venda (R$)"
              error={errors.price}
              hint="Opcional. É uma estimativa: não vira preço confirmado."
            >
              <input
                type="text"
                inputMode="decimal"
                className="control"
                value={priceText}
                placeholder="Ex.: 4,99"
                autoComplete="off"
                onChange={(e) => {
                  setPriceText(e.target.value);
                  setErrors({});
                }}
              />
            </Field>

            {suggestion ? (
              <div className={styles.subPanel} aria-label="Sugestão de preço">
                {suggestion.kind === 'same_store' ? (
                  <>
                    <p>
                      Última compra em {formatShortDate(suggestion.date ?? today, today)} — {suggestion.storeName ?? 'Mercado não informado'}:{' '}
                      <strong>{money(suggestion.estimate.estUnitPriceCents)}</strong> por {effectiveUnit}.
                    </p>
                    <Button variant="secondary" onClick={useSuggestion}>
                      Usar este preço como estimativa
                    </Button>
                  </>
                ) : suggestion.kind === 'other_store' ? (
                  <>
                    <p>
                      Sem compra anterior neste mercado ({storeName}). Em {suggestion.storeName ?? 'outro mercado'} (
                      {formatShortDate(suggestion.date ?? today, today)}): {money(suggestion.estimate.estUnitPriceCents)} por {effectiveUnit}.
                    </p>
                    <Button variant="secondary" onClick={useSuggestion}>
                      Usar referência de outro mercado
                    </Button>
                  </>
                ) : (
                  <p>Sem histórico desta embalagem: informe o preço, se souber.</p>
                )}
              </div>
            ) : null}

            <Field label="Observação (opcional)" error={errors.note}>
              <input
                type="text"
                className="control"
                value={note}
                autoComplete="off"
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {duplicate ? (
              <div role="alert" className={styles.subPanel}>
                <p>
                  Já existe na lista: <strong>{duplicate.existing.label}</strong> ({formatMilli(duplicate.existing.plannedQtyMilli)}{' '}
                  {duplicate.existing.saleUnit}).{' '}
                  {duplicate.canIncrease
                    ? 'Você pode aumentar a quantidade dessa linha ou manter uma linha separada.'
                    : 'Preço, unidade ou confirmação diferentes: não somo automaticamente. Mantenha uma linha separada.'}
                </p>
                <div className={styles.actionsRow}>
                  {duplicate.canIncrease ? (
                    <Button variant="primary" disabled={saving} onClick={() => void increaseExisting()}>
                      Aumentar para {formatMilli(duplicate.existing.plannedQtyMilli + duplicate.qtyMilli)} {duplicate.existing.saleUnit}
                    </Button>
                  ) : null}
                  <Button variant="secondary" disabled={saving} onClick={keepSeparate}>
                    Manter linha separada
                  </Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setDuplicate(null)}>
                    Voltar e editar
                  </Button>
                </div>
              </div>
            ) : null}

            {errors.form ? (
              <p role="alert" className={styles.inlineError}>
                {errors.form}
              </p>
            ) : null}

            <div className={dialogStyles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={saving || duplicate !== null} aria-busy={saving}>
                {saving ? 'Salvando…' : editing ? 'Salvar item' : 'Adicionar item'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}