-- Fase 6: emisión de facturas electrónicas con ARCA (WSAA + WSFEv1).

-- ─── Acceso de ARCA (token + sign del WSAA, válido ~12 h) ─────────────────
-- ARCA no entrega un acceso nuevo mientras el anterior siga vigente, por eso
-- se guarda. Solo lo usa el servidor con la clave secreta: RLS sin políticas.
create table public.arca_accesos (
  servicio  text not null,
  entorno   text not null check (entorno in ('homologacion', 'produccion')),
  token     text not null,
  sign      text not null,
  expira    timestamptz not null,
  primary key (servicio, entorno)
);
alter table public.arca_accesos enable row level security;
revoke all on public.arca_accesos from anon, authenticated;

-- ─── Comprobantes emitidos ────────────────────────────────────────────────
create type public.estado_comprobante as enum ('emitido', 'rechazado');

create table public.comprobantes_emitidos (
  id                      uuid primary key default gen_random_uuid(),
  entorno                 text not null check (entorno in ('homologacion', 'produccion')),
  estado                  public.estado_comprobante not null,
  -- Códigos de ARCA: 1 = Factura A, 6 = B, 11 = C (3/8/13 = notas de crédito).
  tipo_cbte               integer not null,
  punto_venta             integer not null,
  numero                  bigint,
  fecha                   date not null,
  -- 1 = productos, 2 = servicios, 3 = productos y servicios.
  concepto                integer not null,
  fecha_servicio_desde    date,
  fecha_servicio_hasta    date,
  fecha_vto_pago          date,
  -- Receptor: doc_tipo 80 = CUIT, 96 = DNI, 99 = consumidor final.
  doc_tipo                integer not null,
  doc_nro                 text not null,
  receptor_nombre         text,
  condicion_iva_receptor  integer not null,
  items                   jsonb not null,
  neto                    numeric(14, 2) not null,
  iva                     numeric(14, 2) not null,
  total                   numeric(14, 2) not null,
  cae                     text,
  cae_vto                 date,
  -- Observaciones o errores devueltos por ARCA.
  mensajes                jsonb,
  evento_id               uuid references public.eventos (id),
  transaccion_id          uuid references public.transacciones (id),
  creado_por              uuid references public.perfiles (id),
  creado_en               timestamptz not null default now()
);

create unique index comprobantes_emitidos_numero_unico
  on public.comprobantes_emitidos (entorno, tipo_cbte, punto_venta, numero)
  where estado = 'emitido';
create index comprobantes_emitidos_creado_idx on public.comprobantes_emitidos (creado_en desc);

-- creado_por y creado_en los pone la base.
create trigger comprobantes_emitidos_marcar
  before insert on public.comprobantes_emitidos
  for each row execute function public.marcar_movimiento_stock();

create trigger comprobantes_emitidos_auditoria
  after insert or update or delete on public.comprobantes_emitidos
  for each row execute function public.registrar_auditoria();

alter table public.comprobantes_emitidos enable row level security;

create policy "comprobantes: ver" on public.comprobantes_emitidos for select to authenticated
  using ((select public.tiene_permiso('facturar', 'ver')));
create policy "comprobantes: crear" on public.comprobantes_emitidos for insert to authenticated
  with check ((select public.tiene_permiso('facturar', 'editar')));
-- Solo se actualiza para vincular el ingreso creado en Financiero.
create policy "comprobantes: editar" on public.comprobantes_emitidos for update to authenticated
  using ((select public.tiene_permiso('facturar', 'editar')))
  with check ((select public.tiene_permiso('facturar', 'editar')));

revoke all on public.comprobantes_emitidos from anon;
revoke delete, truncate on public.comprobantes_emitidos from authenticated;
