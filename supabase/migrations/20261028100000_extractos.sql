-- Extractos bancarios y conciliación: se sube el extracto de una cuenta, se
-- leen sus movimientos y cada uno se concilia con un movimiento de Financiero
-- (o se crea, o se ignora, p. ej. una transferencia entre cuentas propias).

-- Empresa por defecto para lo que se cree desde los extractos de la cuenta, y
-- cómo se leen sus extractos en Excel/CSV (qué columna es cada dato).
alter table public.cuentas_bancarias add column if not exists empresa text not null default 'nero';
alter table public.cuentas_bancarias drop constraint if exists cuentas_bancarias_empresa_check;
alter table public.cuentas_bancarias add constraint cuentas_bancarias_empresa_check check (empresa in ('nero', 'ruta'));
alter table public.cuentas_bancarias add column if not exists formato_extracto jsonb;

create table if not exists public.extractos (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references public.cuentas_bancarias (id),
  desde            date not null,
  hasta            date not null check (hasta >= desde),
  saldo_inicial    numeric(14, 2),
  saldo_final      numeric(14, 2),
  archivo_nombre   text not null,
  archivo_path     text,
  origen           text not null check (origen in ('planilla', 'pdf')),
  creado_por       uuid references public.perfiles (id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create table if not exists public.extracto_lineas (
  id              uuid primary key default gen_random_uuid(),
  extracto_id     uuid not null references public.extractos (id) on delete cascade,
  cuenta_id       uuid not null references public.cuentas_bancarias (id),
  orden           integer not null,
  fecha           date not null,
  concepto        text not null default '',
  referencia      text,
  -- Positivo: crédito (entra plata). Negativo: débito.
  monto           numeric(14, 2) not null check (monto <> 0),
  saldo           numeric(14, 2),
  -- Misma cuenta, fecha, monto, concepto y saldo: el mismo movimiento aunque se suba en dos extractos.
  huella          text not null,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'conciliada', 'ignorada')),
  transaccion_id  uuid unique references public.transacciones (id) on delete set null,
  nota            text,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (cuenta_id, huella),
  check ((estado = 'conciliada') = (transaccion_id is not null))
);

create index if not exists extracto_lineas_extracto_idx on public.extracto_lineas (extracto_id, orden);
create index if not exists extractos_cuenta_idx on public.extractos (cuenta_id, hasta desc);

do $$
declare t text;
begin
  foreach t in array array['extractos', 'extracto_lineas'] loop
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

-- Los archivos originales (se suben y leen con la clave secreta, después de verificar permisos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('extractos', 'extractos', false, 10485760, array[
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;
