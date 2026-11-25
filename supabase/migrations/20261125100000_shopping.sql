-- Clareia: módulo Compras (listas de supermercado, compras registradas e histórico de preços).
-- Migração aditiva: não altera nem apaga tarefas, listas de tarefas, foco ou sessões de Pomodoro.
-- Dinheiro em centavos (bigint); quantidades em milésimos da unidade (bigint).
-- Compras registradas só mudam por funções (revisões, anulação); o histórico é derivado delas.

/* ------------------------------------------------------------------ Tabelas */

create table public.shopping_stores (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  branch text check (branch is null or char_length(branch) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.shopping_products (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  brand text check (brand is null or char_length(brand) between 1 and 80),
  variation text check (variation is null or char_length(variation) between 1 and 80),
  default_category text not null check (default_category in
    ('Hortifruti', 'Açougue', 'Laticínios', 'Mercearia', 'Bebidas', 'Padaria', 'Congelados', 'Higiene', 'Limpeza', 'Outros')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.shopping_variants (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  sale_form text not null check (sale_form in ('package', 'loose', 'single')),
  sale_unit text not null check (sale_unit in ('un', 'kg', 'L')),
  content_milli bigint check (content_milli is null or content_milli between 1 and 999999000),
  content_unit text check (content_unit is null or content_unit in ('kg', 'L', 'un')),
  label text check (label is null or char_length(label) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, product_id) references public.shopping_products (user_id, id) on delete cascade,
  constraint shopping_variants_form_consistent check (
    (sale_form = 'package' and sale_unit = 'un' and content_milli is not null and content_unit is not null)
    or (sale_form = 'loose' and sale_unit in ('kg', 'L') and content_milli is null and content_unit is null)
    or (sale_form = 'single' and sale_unit = 'un' and content_milli is null and content_unit is null)
  )
);

create table public.shopping_lists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  store_id uuid,
  budget_cents bigint check (budget_cents is null or budget_cents >= 0),
  planned_for date,
  status text not null default 'draft' check (status in ('draft', 'shopping', 'finished')),
  completed_purchase_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, store_id) references public.shopping_stores (user_id, id) on delete set null (store_id),
  constraint shopping_lists_completion check ((status = 'finished') = (completed_purchase_id is not null))
);

create table public.shopping_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  list_id uuid not null,
  position double precision not null,
  label text not null check (char_length(label) between 1 and 200),
  category text not null check (category in
    ('Hortifruti', 'Açougue', 'Laticínios', 'Mercearia', 'Bebidas', 'Padaria', 'Congelados', 'Higiene', 'Limpeza', 'Outros')),
  note text not null default '' check (char_length(note) <= 500),
  product_id uuid,
  variant_id uuid,
  sale_unit text not null check (sale_unit in ('un', 'kg', 'L')),
  planned_qty_milli bigint not null check (planned_qty_milli between 1 and 999999000),
  est_unit_price_cents bigint check (est_unit_price_cents is null or est_unit_price_cents >= 0),
  est_source text check (est_source is null or est_source in ('manual', 'last_purchase', 'other_store', 'copied')),
  est_ref_date date,
  est_ref_store_name text check (est_ref_store_name is null or char_length(est_ref_store_name) <= 80),
  est_ref_condition text check (est_ref_condition is null or char_length(est_ref_condition) <= 80),
  actual_qty_milli bigint check (actual_qty_milli is null or actual_qty_milli between 1 and 999999000),
  actual_unit_price_cents bigint check (actual_unit_price_cents is null or actual_unit_price_cents >= 0),
  price_confirmed boolean not null default false,
  is_free boolean not null default false,
  item_discount_cents bigint not null default 0 check (item_discount_cents >= 0),
  price_condition text check (price_condition is null or char_length(price_condition) between 1 and 80),
  state text not null default 'pending' check (state in ('pending', 'in_cart', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, list_id) references public.shopping_lists (user_id, id) on delete cascade,
  foreign key (user_id, product_id) references public.shopping_products (user_id, id) on delete set null (product_id),
  foreign key (user_id, variant_id) references public.shopping_variants (user_id, id) on delete set null (variant_id),
  constraint shopping_items_unit_integer check (
    sale_unit <> 'un' or (planned_qty_milli % 1000 = 0 and (actual_qty_milli is null or actual_qty_milli % 1000 = 0))
  ),
  constraint shopping_items_confirmed check (
    not price_confirmed or (
      actual_qty_milli is not null
      and actual_unit_price_cents is not null
      and is_free = (actual_unit_price_cents = 0)
      and item_discount_cents <= (actual_qty_milli * actual_unit_price_cents + 500) / 1000
    )
  ),
  constraint shopping_items_discount_needs_price check (price_confirmed or item_discount_cents = 0)
);

create table public.shopping_purchases (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  root_id uuid not null,
  source_list_id uuid,
  revision integer not null check (revision >= 1),
  status text not null check (status in ('active', 'superseded', 'voided')),
  supersedes_id uuid,
  correction_reason text check (correction_reason is null or char_length(correction_reason) between 1 and 500),
  void_reason text check (void_reason is null or char_length(void_reason) between 1 and 500),
  purchased_on date not null,
  -- Snapshot do mercado: a compra continua legível mesmo que o mercado seja arquivado.
  store_id uuid,
  store_name text check (store_name is null or char_length(store_name) <= 80),
  store_branch text check (store_branch is null or char_length(store_branch) <= 80),
  budget_cents bigint check (budget_cents is null or budget_cents >= 0),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  global_discount_cents bigint not null default 0 check (global_discount_cents >= 0),
  extra_charges_cents bigint not null default 0 check (extra_charges_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  voided_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, source_list_id) references public.shopping_lists (user_id, id) on delete set null (source_list_id),
  foreign key (user_id, supersedes_id) references public.shopping_purchases (user_id, id),
  constraint shopping_purchases_totals check (
    global_discount_cents <= subtotal_cents
    and total_cents = subtotal_cents - global_discount_cents + extra_charges_cents
  ),
  constraint shopping_purchases_superseded check ((status = 'superseded') = (superseded_at is not null)),
  constraint shopping_purchases_voided check ((status = 'voided') = (voided_at is not null))
);

-- Uma só revisão aberta (ativa ou anulada) por compra lógica; cada revisão é única.
create unique index shopping_purchases_one_open_per_root
  on public.shopping_purchases (user_id, root_id) where status <> 'superseded';
create unique index shopping_purchases_revision_unique
  on public.shopping_purchases (user_id, root_id, revision);
create index shopping_purchases_date_idx on public.shopping_purchases (user_id, purchased_on);
create index shopping_items_list_idx on public.shopping_items (user_id, list_id, position);

create table public.shopping_purchase_lines (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  purchase_id uuid not null,
  position integer not null check (position >= 1),
  -- Identidade no momento da compra; sem chave estrangeira para que o histórico não mude com o catálogo.
  product_id uuid,
  variant_id uuid,
  product_name text not null check (char_length(product_name) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 80),
  variation text check (variation is null or char_length(variation) <= 80),
  variant_label text check (variant_label is null or char_length(variant_label) <= 80),
  category text not null check (category in
    ('Hortifruti', 'Açougue', 'Laticínios', 'Mercearia', 'Bebidas', 'Padaria', 'Congelados', 'Higiene', 'Limpeza', 'Outros')),
  sale_form text check (sale_form is null or sale_form in ('package', 'loose', 'single')),
  sale_unit text not null check (sale_unit in ('un', 'kg', 'L')),
  content_milli bigint check (content_milli is null or content_milli between 1 and 999999000),
  content_unit text check (content_unit is null or content_unit in ('kg', 'L', 'un')),
  quantity_milli bigint not null check (quantity_milli between 1 and 999999000),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  gross_cents bigint not null check (gross_cents >= 0),
  item_discount_cents bigint not null default 0 check (item_discount_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),
  price_condition text check (price_condition is null or char_length(price_condition) <= 80),
  is_free boolean not null default false,
  primary key (user_id, id),
  foreign key (user_id, purchase_id) references public.shopping_purchases (user_id, id) on delete cascade,
  unique (user_id, purchase_id, position),
  constraint shopping_lines_money check (
    gross_cents = (quantity_milli * unit_price_cents + 500) / 1000
    and item_discount_cents <= gross_cents
    and net_cents = gross_cents - item_discount_cents
    and is_free = (unit_price_cents = 0)
    and (sale_unit <> 'un' or quantity_milli % 1000 = 0)
    and ((content_milli is null) = (content_unit is null))
  )
);

create index shopping_lines_purchase_idx on public.shopping_purchase_lines (user_id, purchase_id);

/* --------------------------------------------------------- Regras de estado */

-- Lista finalizada é só de consulta: nada além de arquivar/desarquivar muda depois.
create function private.shopping_list_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'finished' and (
       new.name is distinct from old.name
    or new.store_id is distinct from old.store_id
    or new.budget_cents is distinct from old.budget_cents
    or new.planned_for is distinct from old.planned_for
    or new.status is distinct from old.status
    or new.completed_purchase_id is distinct from old.completed_purchase_id
  ) then
    raise exception 'finished_list' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shopping_lists_guard
  before update on public.shopping_lists
  for each row execute function private.shopping_list_guard();

-- Itens de lista finalizada não mudam.
create function private.shopping_item_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.shopping_lists l
    where l.user_id = old.user_id and l.id = old.list_id and l.status = 'finished'
  ) then
    raise exception 'finished_list' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shopping_items_guard
  before update on public.shopping_items
  for each row execute function private.shopping_item_guard();

/* --------------------------------------------------------------------- RLS */

alter table public.shopping_stores enable row level security;
alter table public.shopping_products enable row level security;
alter table public.shopping_variants enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
alter table public.shopping_purchases enable row level security;
alter table public.shopping_purchase_lines enable row level security;

revoke all on public.shopping_stores, public.shopping_products, public.shopping_variants,
  public.shopping_lists, public.shopping_items, public.shopping_purchases, public.shopping_purchase_lines from anon;

-- Cadastros e listas: o dono lê e altera diretamente (cada operação é uma linha).
grant select, insert, update, delete on public.shopping_stores, public.shopping_products,
  public.shopping_variants, public.shopping_lists, public.shopping_items to authenticated;
-- Compras registradas: somente leitura direta; escrita só pelas funções abaixo.
grant select on public.shopping_purchases, public.shopping_purchase_lines to authenticated;

create policy "shopping_stores: dono" on public.shopping_stores for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_products: dono" on public.shopping_products for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_variants: dono" on public.shopping_variants for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_lists: dono" on public.shopping_lists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_items: dono" on public.shopping_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_purchases: dono lê" on public.shopping_purchases for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "shopping_purchase_lines: dono lê" on public.shopping_purchase_lines for select to authenticated
  using ((select auth.uid()) = user_id);

/* ---------------------------------------------------------- Operações atômicas */

-- Cria uma lista com seus itens numa só transação (cópias e recompras).
create function public.shopping_create_list(p_list jsonb, p_items jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_list->>'id')::uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(p_list->>'status', 'draft') not in ('draft', 'shopping') then
    raise exception 'shopping_invalid' using errcode = 'P0001';
  end if;
  insert into public.shopping_lists (user_id, id, name, store_id, budget_cents, planned_for, status, archived_at, created_at, updated_at)
  values (
    v_uid, v_id, p_list->>'name', nullif(p_list->>'storeId', '')::uuid, nullif(p_list->>'budgetCents', '')::bigint,
    nullif(p_list->>'plannedFor', '')::date, coalesce(p_list->>'status', 'draft'), null,
    now(), now()
  );
  insert into public.shopping_items
  select (jsonb_populate_record(null::public.shopping_items, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x(value);
  return v_id;
end;
$$;

-- Finaliza a lista: lê os itens do carrinho no banco, grava a compra (revisão 1) e, se pedido,
-- cria a lista de pendências. Idempotente: uma lista já finalizada devolve a compra registrada.
create function public.shopping_finalize(
  p_list_id uuid,
  p_purchase_id uuid,
  p_purchased_on date,
  p_store_id uuid,
  p_budget_cents bigint,
  p_global_discount_cents bigint,
  p_extra_charges_cents bigint,
  p_next_list_id uuid,
  p_next_list_name text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_list public.shopping_lists%rowtype;
  v_store_name text;
  v_store_branch text;
  v_subtotal bigint;
  v_cart_count integer;
  v_unconfirmed integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_list from public.shopping_lists where user_id = v_uid and id = p_list_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_list.status = 'finished' then return v_list.completed_purchase_id; end if;
  if exists (select 1 from public.shopping_purchases where user_id = v_uid and id = p_purchase_id) then
    return p_purchase_id;
  end if;

  select count(*), count(*) filter (where not price_confirmed)
    into v_cart_count, v_unconfirmed
  from public.shopping_items where user_id = v_uid and list_id = p_list_id and state = 'in_cart';
  if v_cart_count = 0 then raise exception 'shopping_empty' using errcode = 'P0001'; end if;
  if v_unconfirmed > 0 then raise exception 'shopping_incomplete' using errcode = 'P0001'; end if;

  if p_store_id is not null then
    select s.name, s.branch into v_store_name, v_store_branch
    from public.shopping_stores s where s.user_id = v_uid and s.id = p_store_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;

  select coalesce(sum(((i.actual_qty_milli * i.actual_unit_price_cents + 500) / 1000) - i.item_discount_cents), 0)
    into v_subtotal
  from public.shopping_items i where i.user_id = v_uid and i.list_id = p_list_id and i.state = 'in_cart';

  insert into public.shopping_purchases (
    user_id, id, root_id, source_list_id, revision, status, purchased_on, store_id, store_name, store_branch,
    budget_cents, subtotal_cents, global_discount_cents, extra_charges_cents, total_cents, created_at)
  values (
    v_uid, p_purchase_id, p_purchase_id, p_list_id, 1, 'active', p_purchased_on, p_store_id, v_store_name, v_store_branch,
    p_budget_cents, v_subtotal, coalesce(p_global_discount_cents, 0), coalesce(p_extra_charges_cents, 0),
    v_subtotal - coalesce(p_global_discount_cents, 0) + coalesce(p_extra_charges_cents, 0), now());

  insert into public.shopping_purchase_lines (
    user_id, id, purchase_id, position, product_id, variant_id, product_name, brand, variation, variant_label,
    category, sale_form, sale_unit, content_milli, content_unit, quantity_milli, unit_price_cents, gross_cents,
    item_discount_cents, net_cents, price_condition, is_free)
  select v_uid, gen_random_uuid(), p_purchase_id, row_number() over (order by c.position, c.id),
         c.product_id, c.variant_id, c.label, pr.brand, pr.variation, va.label,
         c.category, va.sale_form, c.sale_unit, va.content_milli, va.content_unit,
         c.actual_qty_milli, c.actual_unit_price_cents, c.gross, c.item_discount_cents,
         c.gross - c.item_discount_cents, c.price_condition, c.is_free
  from (
    select i.*, (i.actual_qty_milli * i.actual_unit_price_cents + 500) / 1000 as gross
    from public.shopping_items i
    where i.user_id = v_uid and i.list_id = p_list_id and i.state = 'in_cart'
  ) c
  left join public.shopping_products pr on pr.user_id = v_uid and pr.id = c.product_id
  left join public.shopping_variants va on va.user_id = v_uid and va.id = c.variant_id;

  update public.shopping_lists
     set status = 'finished', completed_purchase_id = p_purchase_id, updated_at = now()
   where user_id = v_uid and id = p_list_id;

  if p_next_list_id is not null then
    insert into public.shopping_lists (user_id, id, name, store_id, status, created_at, updated_at)
    values (v_uid, p_next_list_id, p_next_list_name, v_list.store_id, 'draft', now(), now());
    insert into public.shopping_items (
      user_id, id, list_id, position, label, category, note, product_id, variant_id, sale_unit, planned_qty_milli,
      est_unit_price_cents, est_source, est_ref_date, est_ref_store_name, est_ref_condition,
      price_confirmed, is_free, item_discount_cents, state, created_at, updated_at)
    select v_uid, gen_random_uuid(), p_next_list_id, row_number() over (order by p.position, p.id),
           p.label, p.category, p.note, p.product_id, p.variant_id, p.sale_unit, p.planned_qty_milli,
           case when p.price_confirmed then p.actual_unit_price_cents else p.est_unit_price_cents end,
           case when (case when p.price_confirmed then p.actual_unit_price_cents else p.est_unit_price_cents end) is null then null
                when p.price_confirmed then 'copied' else coalesce(p.est_source, 'manual') end,
           p.est_ref_date, p.est_ref_store_name, p.est_ref_condition,
           false, false, 0, 'pending', now(), now()
    from public.shopping_items p
    where p.user_id = v_uid and p.list_id = p_list_id and p.state = 'pending';
  end if;

  return p_purchase_id;
end;
$$;

-- Correção: nova revisão com as linhas enviadas; a anterior fica substituída. Totais são recalculados.
create function public.shopping_correct(
  p_purchase_id uuid,
  p_new_id uuid,
  p_reason text,
  p_purchased_on date,
  p_store_id uuid,
  p_budget_cents bigint,
  p_global_discount_cents bigint,
  p_extra_charges_cents bigint,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.shopping_purchases%rowtype;
  v_store_name text;
  v_store_branch text;
  v_subtotal bigint;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.shopping_purchases where user_id = v_uid and id = p_new_id) then
    return p_new_id;
  end if;

  select * into v_old from public.shopping_purchases where user_id = v_uid and id = p_purchase_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_old.status <> 'active' then raise exception 'shopping_stale' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'shopping_reason' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'shopping_empty' using errcode = 'P0001'; end if;

  if p_store_id is not null then
    select s.name, s.branch into v_store_name, v_store_branch
    from public.shopping_stores s where s.user_id = v_uid and s.id = p_store_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;

  select coalesce(sum((r->>'net_cents')::bigint), 0) into v_subtotal
  from jsonb_array_elements(p_lines) as r;

  update public.shopping_purchases
     set status = 'superseded', superseded_at = now()
   where user_id = v_uid and id = p_purchase_id;

  insert into public.shopping_purchases (
    user_id, id, root_id, source_list_id, revision, status, supersedes_id, correction_reason, purchased_on,
    store_id, store_name, store_branch, budget_cents, subtotal_cents, global_discount_cents, extra_charges_cents,
    total_cents, created_at)
  values (
    v_uid, p_new_id, v_old.root_id, v_old.source_list_id, v_old.revision + 1, 'active', v_old.id, trim(p_reason),
    p_purchased_on, p_store_id, v_store_name, v_store_branch, p_budget_cents, v_subtotal,
    coalesce(p_global_discount_cents, 0), coalesce(p_extra_charges_cents, 0),
    v_subtotal - coalesce(p_global_discount_cents, 0) + coalesce(p_extra_charges_cents, 0), now());

  insert into public.shopping_purchase_lines
  select (jsonb_populate_record(null::public.shopping_purchase_lines,
           jsonb_build_object('user_id', v_uid, 'purchase_id', p_new_id) || x.value)).*
  from jsonb_array_elements(p_lines) as x(value);

  return p_new_id;
end;
$$;

-- Anulação: a compra some das análises, mas o registro e o motivo continuam.
create function public.shopping_void(p_purchase_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select status into v_status from public.shopping_purchases where user_id = v_uid and id = p_purchase_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status = 'voided' then return; end if;
  if v_status <> 'active' then raise exception 'shopping_stale' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'shopping_reason' using errcode = 'P0001'; end if;
  update public.shopping_purchases
     set status = 'voided', void_reason = trim(p_reason), voided_at = now()
   where user_id = v_uid and id = p_purchase_id;
end;
$$;

-- Restaura o backup numa transação. p_shopping nulo: o módulo Compras é preservado (backup antigo).
create function public.restore_backup(p_lists jsonb, p_tasks jsonb, p_sessions jsonb, p_shopping jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  delete from public.tasks where user_id = v_uid;
  delete from public.lists where user_id = v_uid;
  insert into public.lists (user_id, id, name, color, position, created_at, updated_at)
  select v_uid, x.id, x.name, x.color, x.position, x.created_at, x.updated_at
    from jsonb_to_recordset(coalesce(p_lists, '[]'::jsonb)) as x(
      id uuid, name text, color text, position double precision, created_at timestamptz, updated_at timestamptz);
  insert into public.tasks (
    user_id, id, list_id, title, description, priority, status, planned_date, due_date, focus_date,
    position, subtasks, created_at, updated_at, completed_at, completed_on, deleted_at)
  select v_uid, x.id, x.list_id, x.title, x.description, x.priority, x.status, x.planned_date, x.due_date,
         x.focus_date, x.position, x.subtasks, x.created_at, x.updated_at, x.completed_at, x.completed_on,
         x.deleted_at
    from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as x(
      id uuid, list_id uuid, title text, description text, priority text, status text, planned_date date,
      due_date date, focus_date date, position double precision, subtasks jsonb, created_at timestamptz,
      updated_at timestamptz, completed_at timestamptz, completed_on date, deleted_at timestamptz);
  insert into public.focus_sessions (user_id, id, task_id, kind, duration_seconds, ended_at)
  select v_uid, x.id, x.task_id, x.kind, x.duration_seconds, x.ended_at
    from jsonb_to_recordset(coalesce(p_sessions, '[]'::jsonb)) as x(
      id uuid, task_id uuid, kind text, duration_seconds integer, ended_at timestamptz);

  if p_shopping is null then return; end if;

  delete from public.shopping_purchases where user_id = v_uid;
  delete from public.shopping_items where user_id = v_uid;
  delete from public.shopping_lists where user_id = v_uid;
  delete from public.shopping_variants where user_id = v_uid;
  delete from public.shopping_products where user_id = v_uid;
  delete from public.shopping_stores where user_id = v_uid;

  insert into public.shopping_stores
  select (jsonb_populate_record(null::public.shopping_stores, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'stores', '[]'::jsonb)) as x(value);
  insert into public.shopping_products
  select (jsonb_populate_record(null::public.shopping_products, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'products', '[]'::jsonb)) as x(value);
  insert into public.shopping_variants
  select (jsonb_populate_record(null::public.shopping_variants, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'variants', '[]'::jsonb)) as x(value);
  insert into public.shopping_lists
  select (jsonb_populate_record(null::public.shopping_lists, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'lists', '[]'::jsonb)) as x(value);
  insert into public.shopping_items
  select (jsonb_populate_record(null::public.shopping_items, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'items', '[]'::jsonb)) as x(value);
  insert into public.shopping_purchases
  select (jsonb_populate_record(null::public.shopping_purchases, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'purchases', '[]'::jsonb)) as x(value)
  order by (x.value->>'revision')::int;
  insert into public.shopping_purchase_lines
  select (jsonb_populate_record(null::public.shopping_purchase_lines, jsonb_build_object('user_id', v_uid) || x.value)).*
  from jsonb_array_elements(coalesce(p_shopping->'lines', '[]'::jsonb)) as x(value);
end;
$$;

revoke execute on function public.shopping_create_list(jsonb, jsonb) from public, anon;
revoke execute on function public.shopping_finalize(uuid, uuid, date, uuid, bigint, bigint, bigint, uuid, text) from public, anon;
revoke execute on function public.shopping_correct(uuid, uuid, text, date, uuid, bigint, bigint, bigint, jsonb) from public, anon;
revoke execute on function public.shopping_void(uuid, text) from public, anon;
revoke execute on function public.restore_backup(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.shopping_create_list(jsonb, jsonb) to authenticated;
grant execute on function public.shopping_finalize(uuid, uuid, date, uuid, bigint, bigint, bigint, uuid, text) to authenticated;
grant execute on function public.shopping_correct(uuid, uuid, text, date, uuid, bigint, bigint, bigint, jsonb) to authenticated;
grant execute on function public.shopping_void(uuid, text) to authenticated;
grant execute on function public.restore_backup(jsonb, jsonb, jsonb, jsonb) to authenticated;
