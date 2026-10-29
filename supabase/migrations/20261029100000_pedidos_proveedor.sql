-- Pedidos con aclaración y promo por producto, y página para el proveedor.
--
-- * Promo del proveedor por producto, con vigencia opcional:
--     "4+1": por cada 4, 1 de regalo (al recibir, lo bonificado entra con costo 0).
--     "10%": descuento sobre el precio (el precio del pedido ya sale con descuento).
-- * Aclaración por producto en cada pedido (ej. "mitad raspberry y mitad tabasco").
-- * Cada proveedor tiene un link propio (token) donde ve sus pedidos y los
--   confirma o corrige. Lo procesa el servidor con la clave secreta.

alter table public.proveedor_productos
  add column if not exists promo text check (promo is null or promo ~ '^(\d+\+\d+|\d+(\.\d+)?%)$'),
  add column if not exists promo_hasta date;

alter table public.proveedores add column if not exists token text;
update public.proveedores set token = translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_') where token is null;
alter table public.proveedores alter column token set default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
alter table public.proveedores alter column token set not null;
create unique index if not exists proveedores_token_idx on public.proveedores (token);

alter table public.pedido_items
  add column if not exists aclaracion text,
  add column if not exists promo text,
  add column if not exists bonificadas numeric(14, 3) not null default 0 check (bonificadas >= 0),
  -- Respuesta del proveedor: lo que confirma que manda (null: no respondió) y una nota.
  add column if not exists cantidad_confirmada numeric(14, 3) check (cantidad_confirmada is null or cantidad_confirmada >= 0),
  add column if not exists nota_proveedor text,
  add column if not exists bonificadas_recibidas numeric(14, 3) check (bonificadas_recibidas is null or bonificadas_recibidas >= 0);

alter table public.pedidos
  add column if not exists confirmado_en timestamptz,
  add column if not exists respuesta_proveedor text,
  add column if not exists fecha_entrega_confirmada date;

alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check check (estado in ('borrador', 'enviado', 'confirmado', 'recibido', 'cancelado'));

-- Guardar un pedido: si se cambia, la confirmación anterior del proveedor deja de valer.
-- p_items: [{ producto_id, cantidad, precio_unitario?, aclaracion?, promo?, bonificadas? }]
create or replace function public.guardar_pedido(p_id uuid, p_pedido jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  if v_id is null then
    insert into public.pedidos (proveedor_id, deposito_id, fecha, fecha_entrega, estado, notas)
    values (
      (p_pedido ->> 'proveedor_id')::uuid,
      (p_pedido ->> 'deposito_id')::uuid,
      (p_pedido ->> 'fecha')::date,
      nullif(p_pedido ->> 'fecha_entrega', '')::date,
      p_pedido ->> 'estado',
      nullif(trim(p_pedido ->> 'notas'), '')
    )
    returning id into v_id;
  else
    update public.pedidos set
      proveedor_id = (p_pedido ->> 'proveedor_id')::uuid,
      deposito_id = (p_pedido ->> 'deposito_id')::uuid,
      fecha = (p_pedido ->> 'fecha')::date,
      fecha_entrega = nullif(p_pedido ->> 'fecha_entrega', '')::date,
      estado = p_pedido ->> 'estado',
      notas = nullif(trim(p_pedido ->> 'notas'), ''),
      confirmado_en = null,
      respuesta_proveedor = null,
      fecha_entrega_confirmada = null
    where id = v_id and estado in ('borrador', 'enviado', 'confirmado');
    if not found then
      raise exception 'El pedido no existe o ya se recibió o canceló';
    end if;
    delete from public.pedido_items where pedido_id = v_id;
  end if;

  insert into public.pedido_items (pedido_id, orden, producto_id, cantidad, precio_unitario, aclaracion, promo, bonificadas)
  select
    v_id,
    (o - 1)::integer,
    (i ->> 'producto_id')::uuid,
    (i ->> 'cantidad')::numeric,
    nullif(i ->> 'precio_unitario', '')::numeric,
    nullif(trim(i ->> 'aclaracion'), ''),
    nullif(i ->> 'promo', ''),
    coalesce(nullif(i ->> 'bonificadas', '')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as x(i, o);

  return v_id;
end
$$;

-- Recibir: lo pagado entra con su costo y lo bonificado con costo 0.
-- p_items: [{ producto_id, cantidad_recibida, bonificadas_recibidas?, costo_unitario? }]
create or replace function public.recibir_pedido(p_id uuid, p_fecha date, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deposito uuid;
  v_numero bigint;
begin
  update public.pedidos set estado = 'recibido', recibido_en = p_fecha
  where id = p_id and estado in ('borrador', 'enviado', 'confirmado')
  returning deposito_id, numero into v_deposito, v_numero;
  if not found then
    raise exception 'El pedido no existe o ya se recibió o canceló';
  end if;

  update public.pedido_items pi set
    cantidad_recibida = (i ->> 'cantidad_recibida')::numeric,
    bonificadas_recibidas = coalesce(nullif(i ->> 'bonificadas_recibidas', '')::numeric, 0)
  from jsonb_array_elements(p_items) i
  where pi.pedido_id = p_id and pi.producto_id = (i ->> 'producto_id')::uuid;

  insert into public.movimientos_stock (producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, pedido_id)
  select (i ->> 'producto_id')::uuid, v_deposito, 'entrada', (i ->> 'cantidad_recibida')::numeric,
         nullif(i ->> 'costo_unitario', '')::numeric, p_fecha, 'Pedido N° ' || v_numero, p_id
  from jsonb_array_elements(p_items) i
  where (i ->> 'cantidad_recibida')::numeric > 0;

  insert into public.movimientos_stock (producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, pedido_id)
  select (i ->> 'producto_id')::uuid, v_deposito, 'entrada', (i ->> 'bonificadas_recibidas')::numeric,
         0, p_fecha, 'Pedido N° ' || v_numero || ' · bonificación', p_id
  from jsonb_array_elements(p_items) i
  where coalesce(nullif(i ->> 'bonificadas_recibidas', '')::numeric, 0) > 0;
end
$$;
