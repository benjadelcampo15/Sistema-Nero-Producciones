-- Fase 4: Facturas leídas con IA.
--
-- Flujo: subida → procesando → por_revisar (o error) → aprobada | rechazada.
-- Al aprobar se crea la transacción en la misma operación (aprobar_factura).

create type public.estado_factura as enum ('procesando', 'por_revisar', 'aprobada', 'rechazada', 'error');

create table public.facturas (
  id                     uuid primary key default gen_random_uuid(),
  archivo_path           text not null unique,
  archivo_nombre         text not null,
  archivo_tipo           text not null,
  estado                 public.estado_factura not null default 'procesando',
  error                  text,
  -- Respuesta completa de la IA, tal cual vino (para auditar qué leyó).
  datos_ia               jsonb,
  proveedor_ia           text,
  -- Datos del comprobante (los completa la IA y los corrige quien revisa).
  tipo_comprobante       text,
  punto_venta            text,
  numero                 text,
  fecha_emision          date,
  cuit_emisor            text,
  razon_social_emisor    text,
  cuit_receptor          text,
  razon_social_receptor  text,
  neto                   numeric(14, 2),
  iva                    numeric(14, 2),
  total                  numeric(14, 2),
  duplicada_de           uuid references public.facturas (id) on delete set null,
  subida_por             uuid references public.perfiles (id),
  revisada_por           uuid references public.perfiles (id),
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create index facturas_estado_idx on public.facturas (estado, creado_en desc);

-- Una misma factura no se puede aprobar dos veces.
create unique index facturas_comprobante_unico
  on public.facturas (cuit_emisor, tipo_comprobante, punto_venta, numero)
  where estado = 'aprobada';

-- Cada movimiento puede venir de una factura (y una factura genera un solo movimiento).
alter table public.transacciones
  add column factura_id uuid unique references public.facturas (id);

-- subida_por la pone la base; actualizado_en se mantiene solo.
create function public.marcar_factura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.subida_por := auth.uid();
  else
    new.subida_por := old.subida_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end
$$;

create trigger facturas_marcar
  before insert or update on public.facturas
  for each row execute function public.marcar_factura();

create trigger facturas_auditoria
  after insert or update or delete on public.facturas
  for each row execute function public.registrar_auditoria();

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.facturas enable row level security;

create policy "facturas: ver"
  on public.facturas for select to authenticated
  using ((select public.tiene_permiso('facturas', 'ver')));

create policy "facturas: crear"
  on public.facturas for insert to authenticated
  with check ((select public.tiene_permiso('facturas', 'editar')));

create policy "facturas: editar"
  on public.facturas for update to authenticated
  using ((select public.tiene_permiso('facturas', 'editar')))
  with check ((select public.tiene_permiso('facturas', 'editar')));

revoke all on public.facturas from anon;
revoke delete, truncate on public.facturas from authenticated;

-- ─── Aprobación atómica ───────────────────────────────────────────────────
-- security invoker: corre con los permisos de quien aprueba, así el RLS de
-- facturas y de transacciones se aplica igual que desde la app.
create function public.aprobar_factura(p_factura_id uuid, p_factura jsonb, p_transaccion jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaccion_id uuid;
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

  return v_transaccion_id;
end
$$;

revoke execute on function public.aprobar_factura(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.aprobar_factura(uuid, jsonb, jsonb) to authenticated;

-- ─── Almacenamiento de archivos ───────────────────────────────────────────
-- Bucket privado y sin políticas para el navegador: solo el servidor sube
-- (con la clave secreta, tras verificar permisos) y genera links temporales.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
