-- Tarjetas de crédito: se sube el resumen mensual (PDF del banco), se leen
-- los consumos y los impuestos/cargos, y cada consumo se asigna a una empresa
-- (reglas aprendidas por descripción). Los cargos generales se reparten entre
-- las dos empresas (50/50 por defecto). A Financiero pasa solo cuando se confirma.

create table if not exists public.tarjeta_resumenes (
  id                uuid primary key default gen_random_uuid(),
  -- Nombre de la tarjeta ("BBVA Visa"): los resúmenes y los repetidos se agrupan por tarjeta.
  tarjeta           text not null check (length(trim(tarjeta)) > 0),
  fecha_cierre      date not null,
  vencimiento       date,
  -- Pesos por dólar para pasar los consumos en dólares a pesos.
  cotizacion_usd    numeric(12, 4) check (cotizacion_usd > 0),
  -- Lo que dice el PDF, para controlar que no falte ni sobre nada.
  saldo_anterior_ars numeric(14, 2),
  saldo_anterior_usd numeric(14, 2),
  saldo_actual_ars  numeric(14, 2),
  saldo_actual_usd  numeric(14, 2),
  total_consumos_ars numeric(14, 2),
  total_consumos_usd numeric(14, 2),
  archivo_nombre    text,
  archivo_path      text,
  -- Movimientos de Financiero creados al confirmar (vacío = todavía no pasó).
  transacciones     uuid[] not null default '{}',
  financiero_en     timestamptz,
  creado_por        uuid references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  unique (tarjeta, fecha_cierre)
);

create table if not exists public.tarjeta_movimientos (
  id              uuid primary key default gen_random_uuid(),
  resumen_id      uuid not null references public.tarjeta_resumenes (id) on delete cascade,
  tarjeta         text not null,
  orden           integer not null,
  fecha           date,
  descripcion     text not null default '',
  cupon           text,
  cuota           smallint check (cuota > 0),
  cuotas          smallint check (cuotas > 0),
  -- Consumos y cargos en positivo; pagos y devoluciones en negativo.
  pesos           numeric(14, 2) not null default 0,
  dolares         numeric(14, 2) not null default 0,
  tipo            text not null default 'consumo' check (tipo in ('consumo', 'cargo', 'pago')),
  -- null = sin asignar.
  empresa         text check (empresa in ('nero', 'ruta')),
  detalle         text,
  -- Cargos generales: qué parte paga la primera empresa (el resto, la segunda).
  reparto_nero    numeric(5, 2) not null default 50 check (reparto_nero between 0 and 100),
  -- Misma tarjeta, fecha, importes, descripción, cupón y cuota: el mismo movimiento aunque venga en otro resumen.
  huella          text not null,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (tarjeta, huella),
  check (pesos <> 0 or dolares <> 0)
);

create index if not exists tarjeta_movimientos_resumen_idx on public.tarjeta_movimientos (resumen_id, orden);
create index if not exists tarjeta_resumenes_cierre_idx on public.tarjeta_resumenes (fecha_cierre desc);

-- Reglas aprendidas: si la descripción empieza con la clave, va a esa empresa y detalle.
create table if not exists public.tarjeta_reglas (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique check (length(clave) > 0),
  empresa         text check (empresa in ('nero', 'ruta')),
  detalle         text,
  -- El comercio se usó para las dos empresas: no se asigna solo.
  ambigua         boolean not null default false,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['tarjeta_resumenes', 'tarjeta_movimientos', 'tarjeta_reglas'] loop
    execute format('drop trigger if exists %1$s_autoria on public.%1$s', t);
    execute format('create trigger %1$s_autoria before insert or update on public.%1$s for each row execute function public.marcar_autoria()', t);
    execute format('drop trigger if exists %1$s_auditoria on public.%1$s', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "%1$s: ver" on public.%1$s', t);
    execute format('create policy "%1$s: ver" on public.%1$s for select to authenticated using ((select public.tiene_permiso(''financiero'', ''ver'')))', t);
    execute format('drop policy if exists "%1$s: crear" on public.%1$s', t);
    execute format('create policy "%1$s: crear" on public.%1$s for insert to authenticated with check ((select public.tiene_permiso(''financiero'', ''editar'')))', t);
    execute format('drop policy if exists "%1$s: editar" on public.%1$s', t);
    execute format('create policy "%1$s: editar" on public.%1$s for update to authenticated using ((select public.tiene_permiso(''financiero'', ''editar''))) with check ((select public.tiene_permiso(''financiero'', ''editar'')))', t);
    execute format('drop policy if exists "%1$s: borrar" on public.%1$s', t);
    execute format('create policy "%1$s: borrar" on public.%1$s for delete to authenticated using ((select public.tiene_permiso(''financiero'', ''editar'')))', t);
    execute format('revoke all on public.%s from anon', t);
    execute format('revoke truncate on public.%s from authenticated', t);
  end loop;
end
$$;

-- Los PDF originales (se suben y leen con la clave secreta, después de verificar permisos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tarjetas', 'tarjetas', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
