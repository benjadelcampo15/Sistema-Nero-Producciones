-- Fase 5: Stock por depósito.
--
-- El stock no se guarda: se calcula sumando movimientos (como un libro
-- contable). Entradas en positivo, salidas en negativo, ajustes con signo.
-- Una transferencia es una salida en el origen + una entrada en el destino
-- con el mismo transferencia_id. Los movimientos no se editan ni se borran.

-- ─── Tablas ───────────────────────────────────────────────────────────────
create table public.depositos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique check (length(trim(nombre)) > 0),
  direccion  text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table public.productos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique check (length(trim(nombre)) > 0),
  unidad        text not null default 'unidad',
  codigo        text unique,
  stock_minimo  numeric(14, 3) not null default 0 check (stock_minimo >= 0),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create type public.tipo_movimiento_stock as enum ('entrada', 'salida', 'ajuste');

create table public.movimientos_stock (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references public.productos (id),
  deposito_id       uuid not null references public.depositos (id),
  tipo              public.tipo_movimiento_stock not null,
  cantidad          numeric(14, 3) not null check (cantidad <> 0),
  costo_unitario    numeric(14, 2) check (costo_unitario is null or costo_unitario >= 0),
  fecha             date not null default current_date,
  motivo            text,
  factura_id        uuid references public.facturas (id),
  evento_id         uuid references public.eventos (id),
  transferencia_id  uuid,
  creado_por        uuid references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  check (
    (tipo = 'entrada' and cantidad > 0)
    or (tipo = 'salida' and cantidad < 0)
    or tipo = 'ajuste'
  )
);

create index movimientos_stock_producto_idx on public.movimientos_stock (producto_id, deposito_id);
create index movimientos_stock_fecha_idx on public.movimientos_stock (fecha desc, creado_en desc);

create function public.marcar_movimiento_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_por := auth.uid();
  new.creado_en := now();
  return new;
end
$$;

create trigger movimientos_stock_marcar
  before insert on public.movimientos_stock
  for each row execute function public.marcar_movimiento_stock();

create trigger depositos_auditoria
  after insert or update or delete on public.depositos
  for each row execute function public.registrar_auditoria();
create trigger productos_auditoria
  after insert or update or delete on public.productos
  for each row execute function public.registrar_auditoria();
create trigger movimientos_stock_auditoria
  after insert or update or delete on public.movimientos_stock
  for each row execute function public.registrar_auditoria();

-- ─── Stock actual ─────────────────────────────────────────────────────────
-- security_invoker: respeta el RLS de quien consulta.
create view public.stock_actual
with (security_invoker = true)
as
select
  m.producto_id,
  m.deposito_id,
  sum(m.cantidad) as cantidad,
  -- Costo promedio ponderado de las entradas con costo.
  round(
    sum(m.cantidad * m.costo_unitario) filter (where m.tipo = 'entrada' and m.costo_unitario is not null)
    / nullif(sum(m.cantidad) filter (where m.tipo = 'entrada' and m.costo_unitario is not null), 0),
    2
  ) as costo_promedio,
  max(m.fecha) as ultimo_movimiento
from public.movimientos_stock m
group by m.producto_id, m.deposito_id;

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.depositos         enable row level security;
alter table public.productos         enable row level security;
alter table public.movimientos_stock enable row level security;

-- Quien revisa facturas necesita ver depósitos y productos para cargar compras.
create policy "depositos: ver" on public.depositos for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')) or (select public.tiene_permiso('facturas', 'editar')));
create policy "depositos: crear" on public.depositos for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));
create policy "depositos: editar" on public.depositos for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));

create policy "productos: ver" on public.productos for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')) or (select public.tiene_permiso('facturas', 'editar')));
create policy "productos: crear" on public.productos for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')) or (select public.tiene_permiso('facturas', 'editar')));
create policy "productos: editar" on public.productos for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));

create policy "movimientos_stock: ver" on public.movimientos_stock for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
-- Desde una factura aprobada también se puede ingresar mercadería.
create policy "movimientos_stock: crear" on public.movimientos_stock for insert to authenticated
  with check (
    (select public.tiene_permiso('stock', 'editar'))
    or (factura_id is not null and tipo = 'entrada' and (select public.tiene_permiso('facturas', 'editar')))
  );

revoke all on public.depositos, public.productos, public.movimientos_stock, public.stock_actual from anon;
revoke delete, truncate on public.depositos, public.productos from authenticated;
-- Los movimientos son un libro: ni se editan ni se borran (se corrige con un ajuste).
revoke update, delete, truncate on public.movimientos_stock from authenticated;
grant select on public.stock_actual to authenticated;

-- ─── Depósitos iniciales ──────────────────────────────────────────────────
insert into public.depositos (nombre) values ('Isidris'), ('Centro');

-- ─── Aprobar factura + ingreso a stock ────────────────────────────────────
-- p_stock (opcional): { "deposito_id": uuid, "items": [ { "producto_id"?: uuid,
--   "producto_nuevo"?: texto, "unidad"?: texto, "cantidad": n, "costo_unitario"?: n } ] }
drop function public.aprobar_factura(uuid, jsonb, jsonb);

create function public.aprobar_factura(p_factura_id uuid, p_factura jsonb, p_transaccion jsonb, p_stock jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaccion_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_comprobante text;
begin
  update public.facturas set
    tipo_comprobante      = p_factura ->> 'tipo_comprobante',
    punto_venta           = p_factura ->> 'punto_venta',
    numero                = p_factura ->> 'numero',
    fecha_emision         = (p_factura ->> 'fecha_emision')::date,
    cuit_emisor           = p_factura ->> 'cuit_emisor',
    razon_social_emisor   = p_factura ->> 'razon_social_emisor',
    cuit_receptor         = p_factura ->> 'cuit_receptor',
    razon_social_receptor = p_factura ->> 'razon_social_receptor',
    neto                  = (p_factura ->> 'neto')::numeric,
    iva                   = (p_factura ->> 'iva')::numeric,
    total                 = (p_factura ->> 'total')::numeric,
    estado                = 'aprobada',
    revisada_por          = auth.uid()
  where id = p_factura_id and estado in ('por_revisar', 'error');

  if not found then
    raise exception 'La factura no existe, ya fue procesada o no tenés permiso';
  end if;

  insert into public.transacciones (
    tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
    medio_pago, estado, facturado, iva, notas, factura_id
  ) values (
    (p_transaccion ->> 'tipo')::public.tipo_movimiento,
    (p_transaccion ->> 'monto')::numeric,
    (p_transaccion ->> 'fecha')::date,
    p_transaccion ->> 'descripcion',
    (p_transaccion ->> 'categoria_id')::uuid,
    nullif(p_transaccion ->> 'evento_id', '')::uuid,
    nullif(p_transaccion ->> 'contraparte', ''),
    (p_transaccion ->> 'medio_pago')::public.medio_pago,
    (p_transaccion ->> 'estado')::public.estado_movimiento,
    true,
    nullif(p_transaccion ->> 'iva', '')::numeric,
    nullif(p_transaccion ->> 'notas', ''),
    p_factura_id
  )
  returning id into v_transaccion_id;

  if p_stock is not null and jsonb_array_length(coalesce(p_stock -> 'items', '[]'::jsonb)) > 0 then
    if nullif(p_stock ->> 'deposito_id', '') is null then
      raise exception 'Elegí a qué depósito ingresa la mercadería';
    end if;
    v_comprobante := concat_ws(' ', p_factura ->> 'tipo_comprobante',
      nullif(concat_ws('-', p_factura ->> 'punto_venta', p_factura ->> 'numero'), ''));

    for v_item in select * from jsonb_array_elements(p_stock -> 'items') loop
      v_producto_id := nullif(v_item ->> 'producto_id', '')::uuid;
      if v_producto_id is null then
        -- Producto nuevo: si ya existe uno con ese nombre se usa ese.
        select id into v_producto_id from public.productos
        where lower(nombre) = lower(trim(v_item ->> 'producto_nuevo'));
        if v_producto_id is null then
          insert into public.productos (nombre, unidad)
          values (trim(v_item ->> 'producto_nuevo'), coalesce(nullif(v_item ->> 'unidad', ''), 'unidad'))
          returning id into v_producto_id;
        end if;
      end if;

      insert into public.movimientos_stock (
        producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, factura_id
      ) values (
        v_producto_id,
        (p_stock ->> 'deposito_id')::uuid,
        'entrada',
        (v_item ->> 'cantidad')::numeric,
        nullif(v_item ->> 'costo_unitario', '')::numeric,
        (p_transaccion ->> 'fecha')::date,
        'Compra ' || coalesce(nullif(v_comprobante, ''), 'según factura'),
        p_factura_id
      );
    end loop;
  end if;

  return v_transaccion_id;
end
$$;

revoke execute on function public.aprobar_factura(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.aprobar_factura(uuid, jsonb, jsonb, jsonb) to authenticated;
