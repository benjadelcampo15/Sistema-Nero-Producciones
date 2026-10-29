-- Contabilidad: plan de cuentas, imputación de Financiero y asientos manuales.
--
-- Los asientos automáticos no se guardan: se arman al consultar a partir de
-- los movimientos de Financiero (y de los cheques vinculados), así siempre
-- coinciden con lo cargado. Acá se guarda el plan de cuentas, a qué cuenta va
-- cada categoría / medio de pago / cuenta bancaria, y los asientos manuales
-- (apertura, ajustes, amortizaciones, cierre).
-- Usa el permiso de la sección Financiero.

-- ─── Plan de cuentas ─────────────────────────────────────────────────────────
-- El código define la jerarquía y el tipo (primer dígito): 1 activo, 2 pasivo,
-- 3 patrimonio neto, 4 ingresos, 5 egresos. Las cuentas imputables reciben
-- asientos; las otras agrupan (rubros).
create table if not exists public.cuentas_contables (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique check (codigo ~ '^[1-5](\.[0-9]{1,3})*$'),
  nombre          text not null check (length(trim(nombre)) > 0),
  imputable       boolean not null default true,
  activa          boolean not null default true,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- A qué cuenta va cada categoría de Financiero y cada cuenta bancaria.
alter table public.categorias add column if not exists cuenta_contable_id uuid references public.cuentas_contables (id);
alter table public.cuentas_bancarias add column if not exists cuenta_contable_id uuid references public.cuentas_contables (id);

-- Cuentas para el resto de la imputación automática (medios de pago, deudores,
-- proveedores, IVA, cheques y lo que no tiene cuenta asignada).
create table if not exists public.imputaciones (
  clave      text primary key check (clave in (
    'efectivo', 'transferencia', 'mercado_pago', 'otro', 'tarjeta_ingreso', 'tarjeta_egreso',
    'cheques_en_cartera', 'cheques_a_pagar', 'deudores', 'proveedores', 'iva_credito', 'iva_debito',
    'ingresos_a_clasificar', 'egresos_a_clasificar'
  )),
  cuenta_id  uuid not null references public.cuentas_contables (id)
);

-- ─── Asientos manuales ───────────────────────────────────────────────────────
create table if not exists public.asientos (
  id              uuid primary key default gen_random_uuid(),
  empresa         text not null check (empresa in ('nero', 'ruta')),
  fecha           date not null,
  descripcion     text not null check (length(trim(descripcion)) > 0),
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.asiento_lineas (
  id         uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references public.asientos (id) on delete cascade,
  orden      integer not null,
  cuenta_id  uuid not null references public.cuentas_contables (id),
  debe       numeric(14, 2) not null default 0 check (debe >= 0),
  haber      numeric(14, 2) not null default 0 check (haber >= 0),
  detalle    text,
  check ((debe > 0) <> (haber > 0))
);

create index if not exists asientos_empresa_fecha_idx on public.asientos (empresa, fecha);
create index if not exists asiento_lineas_asiento_idx on public.asiento_lineas (asiento_id);
create index if not exists asiento_lineas_cuenta_idx on public.asiento_lineas (cuenta_id);

-- ─── Autoría y auditoría ─────────────────────────────────────────────────────
drop trigger if exists cuentas_contables_autoria on public.cuentas_contables;
create trigger cuentas_contables_autoria before insert or update on public.cuentas_contables
  for each row execute function public.marcar_autoria();
drop trigger if exists cuentas_contables_auditoria on public.cuentas_contables;
create trigger cuentas_contables_auditoria after insert or update or delete on public.cuentas_contables
  for each row execute function public.registrar_auditoria();

drop trigger if exists asientos_autoria on public.asientos;
create trigger asientos_autoria before insert or update on public.asientos
  for each row execute function public.marcar_autoria();
drop trigger if exists asientos_auditoria on public.asientos;
create trigger asientos_auditoria after insert or update or delete on public.asientos
  for each row execute function public.registrar_auditoria();
drop trigger if exists asiento_lineas_auditoria on public.asiento_lineas;
create trigger asiento_lineas_auditoria after insert or update or delete on public.asiento_lineas
  for each row execute function public.registrar_auditoria();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.cuentas_contables enable row level security;
alter table public.imputaciones enable row level security;
alter table public.asientos enable row level security;
alter table public.asiento_lineas enable row level security;

drop policy if exists "cuentas contables: ver" on public.cuentas_contables;
create policy "cuentas contables: ver" on public.cuentas_contables for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
drop policy if exists "cuentas contables: crear" on public.cuentas_contables;
create policy "cuentas contables: crear" on public.cuentas_contables for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
drop policy if exists "cuentas contables: editar" on public.cuentas_contables;
create policy "cuentas contables: editar" on public.cuentas_contables for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));

drop policy if exists "imputaciones: ver" on public.imputaciones;
create policy "imputaciones: ver" on public.imputaciones for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
drop policy if exists "imputaciones: crear" on public.imputaciones;
create policy "imputaciones: crear" on public.imputaciones for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
drop policy if exists "imputaciones: editar" on public.imputaciones;
create policy "imputaciones: editar" on public.imputaciones for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));

drop policy if exists "asientos: ver" on public.asientos;
create policy "asientos: ver" on public.asientos for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
drop policy if exists "asientos: crear" on public.asientos;
create policy "asientos: crear" on public.asientos for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
drop policy if exists "asientos: editar" on public.asientos;
create policy "asientos: editar" on public.asientos for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));
drop policy if exists "asientos: borrar" on public.asientos;
create policy "asientos: borrar" on public.asientos for delete to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')));

drop policy if exists "lineas: ver" on public.asiento_lineas;
create policy "lineas: ver" on public.asiento_lineas for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
drop policy if exists "lineas: crear" on public.asiento_lineas;
create policy "lineas: crear" on public.asiento_lineas for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
drop policy if exists "lineas: borrar" on public.asiento_lineas;
create policy "lineas: borrar" on public.asiento_lineas for delete to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')));

revoke all on public.cuentas_contables, public.imputaciones, public.asientos, public.asiento_lineas from anon;
revoke delete, truncate on public.cuentas_contables, public.imputaciones from authenticated;
revoke truncate on public.asientos, public.asiento_lineas from authenticated;

-- ─── Guardar un asiento (cabecera y líneas juntas) ───────────────────────────
-- Valida que balancee y que las cuentas sean imputables y estén activas.
-- security invoker: se aplica el RLS de quien guarda.
create or replace function public.guardar_asiento(p_id uuid, p_asiento jsonb, p_lineas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_debe numeric;
  v_haber numeric;
begin
  if jsonb_array_length(p_lineas) < 2 then
    raise exception 'El asiento necesita al menos dos líneas';
  end if;

  select coalesce(sum((l ->> 'debe')::numeric), 0), coalesce(sum((l ->> 'haber')::numeric), 0)
    into v_debe, v_haber
  from jsonb_array_elements(p_lineas) l;
  if v_debe <> v_haber or v_debe = 0 then
    raise exception 'El asiento no balancea: debe % y haber %', v_debe, v_haber;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
    left join public.cuentas_contables c on c.id = (l ->> 'cuenta_id')::uuid
    where c.id is null or not c.imputable or not c.activa
  ) then
    raise exception 'Hay una cuenta que no existe, no es imputable o está desactivada';
  end if;

  if v_id is null then
    insert into public.asientos (empresa, fecha, descripcion)
    values (p_asiento ->> 'empresa', (p_asiento ->> 'fecha')::date, p_asiento ->> 'descripcion')
    returning id into v_id;
  else
    update public.asientos set
      empresa = p_asiento ->> 'empresa',
      fecha = (p_asiento ->> 'fecha')::date,
      descripcion = p_asiento ->> 'descripcion'
    where id = v_id;
    if not found then
      raise exception 'El asiento no existe o no tenés permiso';
    end if;
    delete from public.asiento_lineas where asiento_id = v_id;
  end if;

  insert into public.asiento_lineas (asiento_id, orden, cuenta_id, debe, haber, detalle)
  select v_id, (o - 1)::integer, (l ->> 'cuenta_id')::uuid, (l ->> 'debe')::numeric, (l ->> 'haber')::numeric, nullif(trim(l ->> 'detalle'), '')
  from jsonb_array_elements(p_lineas) with ordinality as x(l, o);

  return v_id;
end
$$;

revoke execute on function public.guardar_asiento(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_asiento(uuid, jsonb, jsonb) to authenticated;

-- ─── Plan de cuentas inicial ─────────────────────────────────────────────────
insert into public.cuentas_contables (codigo, nombre, imputable) values
  ('1', 'Activo', false),
  ('1.1', 'Activo corriente', false),
  ('1.1.1', 'Caja y bancos', false),
  ('1.1.1.01', 'Caja', true),
  ('1.1.1.02', 'Banco BBVA', true),
  ('1.1.1.03', 'Banco Nación', true),
  ('1.1.1.04', 'Mercado Pago', true),
  ('1.1.1.05', 'Bancos (cuenta sin identificar)', true),
  ('1.1.1.09', 'Fondos a identificar', true),
  ('1.1.2', 'Valores a depositar', false),
  ('1.1.2.01', 'Cheques en cartera', true),
  ('1.1.3', 'Créditos por ventas', false),
  ('1.1.3.01', 'Deudores por ventas', true),
  ('1.1.3.02', 'Cupones de tarjeta a cobrar', true),
  ('1.1.4', 'Créditos fiscales', false),
  ('1.1.4.01', 'IVA crédito fiscal', true),
  ('1.1.4.02', 'Retenciones y percepciones de IIBB', true),
  ('1.1.4.03', 'Retenciones y percepciones de IVA', true),
  ('1.1.4.04', 'Saldo a favor de IVA', true),
  ('1.1.5', 'Otros créditos', false),
  ('1.1.5.01', 'Anticipos a proveedores', true),
  ('1.1.5.02', 'Préstamos al personal', true),
  ('1.1.6', 'Bienes de cambio', false),
  ('1.1.6.01', 'Mercaderías', true),
  ('1.2', 'Activo no corriente', false),
  ('1.2.1', 'Bienes de uso', false),
  ('1.2.1.01', 'Equipos y tecnología', true),
  ('1.2.1.02', 'Muebles y útiles', true),
  ('1.2.1.03', 'Rodados', true),
  ('1.2.1.09', 'Amortizaciones acumuladas', true),
  ('2', 'Pasivo', false),
  ('2.1', 'Pasivo corriente', false),
  ('2.1.1', 'Deudas comerciales', false),
  ('2.1.1.01', 'Proveedores', true),
  ('2.1.1.02', 'Cheques diferidos a pagar', true),
  ('2.1.1.03', 'Tarjetas de crédito a pagar', true),
  ('2.1.2', 'Deudas sociales', false),
  ('2.1.2.01', 'Sueldos a pagar', true),
  ('2.1.2.02', 'Cargas sociales a pagar', true),
  ('2.1.3', 'Deudas fiscales', false),
  ('2.1.3.01', 'IVA débito fiscal', true),
  ('2.1.3.02', 'IVA a pagar', true),
  ('2.1.3.03', 'Ingresos brutos a pagar', true),
  ('2.1.3.04', 'Ganancias a pagar', true),
  ('2.1.4', 'Deudas financieras', false),
  ('2.1.4.01', 'Préstamos y deuda financiera', true),
  ('2.1.5', 'Otras deudas', false),
  ('2.1.5.01', 'Anticipos de clientes', true),
  ('2.1.5.02', 'Cuenta particular de socios', true),
  ('3', 'Patrimonio neto', false),
  ('3.1', 'Capital', false),
  ('3.1.01', 'Capital social', true),
  ('3.2', 'Resultados', false),
  ('3.2.01', 'Resultados no asignados', true),
  ('3.2.02', 'Resultado del ejercicio', true),
  ('4', 'Ingresos', false),
  ('4.1', 'Ingresos por servicios', false),
  ('4.1.01', 'Eventos', true),
  ('4.1.02', 'Fees', true),
  ('4.1.03', 'Activaciones', true),
  ('4.1.04', 'Sponsors', true),
  ('4.1.05', 'Contents', true),
  ('4.1.06', 'Coberturas', true),
  ('4.2', 'Venta de mercadería', false),
  ('4.2.01', 'Venta de mercadería', true),
  ('4.3', 'Otros ingresos', false),
  ('4.3.01', 'Otros ingresos', true),
  ('4.3.02', 'Intereses ganados', true),
  ('4.3.09', 'Ingresos a clasificar', true),
  ('5', 'Egresos', false),
  ('5.1', 'Costo de eventos y servicios', false),
  ('5.1.01', 'Producción', true),
  ('5.1.02', 'Técnica', true),
  ('5.1.03', 'Artística', true),
  ('5.1.04', 'Logística', true),
  ('5.1.05', 'Staff', true),
  ('5.1.06', 'Seguridad', true),
  ('5.1.07', 'Activaciones', true),
  ('5.1.08', 'Contents', true),
  ('5.1.09', 'Coberturas', true),
  ('5.1.10', 'Tickets', true),
  ('5.1.11', 'Mercadería', true),
  ('5.1.12', 'Otros costos de eventos', true),
  ('5.2', 'Gastos de administración', false),
  ('5.2.01', 'Sueldos y cargas sociales', true),
  ('5.2.02', 'Equipo', true),
  ('5.2.03', 'Honorarios', true),
  ('5.2.04', 'Gastos de la sociedad', true),
  ('5.2.05', 'Seguros', true),
  ('5.2.06', 'Mobiliario y equipamiento', true),
  ('5.2.07', 'Gastos administrativos', true),
  ('5.2.08', 'Proveedores varios', true),
  ('5.3', 'Gastos de comercialización', false),
  ('5.3.01', 'Marketing y publicidad', true),
  ('5.3.02', 'Impuesto sobre los ingresos brutos', true),
  ('5.4', 'Impuestos y gastos financieros', false),
  ('5.4.01', 'Impuestos y tasas', true),
  ('5.4.02', 'Comisiones y gastos bancarios', true),
  ('5.4.03', 'Impuesto a los débitos y créditos bancarios', true),
  ('5.4.04', 'Intereses pagados', true),
  ('5.4.05', 'Amortizaciones', true),
  ('5.9', 'Otros egresos', false),
  ('5.9.01', 'Otros gastos', true),
  ('5.9.09', 'Egresos a clasificar', true)
on conflict (codigo) do nothing;

insert into public.imputaciones (clave, cuenta_id)
select v.clave, c.id
from (values
  ('efectivo', '1.1.1.01'),
  ('transferencia', '1.1.1.05'),
  ('mercado_pago', '1.1.1.04'),
  ('otro', '1.1.1.09'),
  ('tarjeta_ingreso', '1.1.3.02'),
  ('tarjeta_egreso', '2.1.1.03'),
  ('cheques_en_cartera', '1.1.2.01'),
  ('cheques_a_pagar', '2.1.1.02'),
  ('deudores', '1.1.3.01'),
  ('proveedores', '2.1.1.01'),
  ('iva_credito', '1.1.4.01'),
  ('iva_debito', '2.1.3.01'),
  ('ingresos_a_clasificar', '4.3.09'),
  ('egresos_a_clasificar', '5.9.09')
) as v (clave, codigo)
join public.cuentas_contables c on c.codigo = v.codigo
on conflict (clave) do nothing;

-- Categorías actuales → cuenta (solo las que todavía no tienen una).
update public.categorias g set cuenta_contable_id = c.id
from (values
  ('ingreso', 'Eventos', '4.1.01'),
  ('ingreso', 'Fee', '4.1.02'),
  ('ingreso', 'Activaciones', '4.1.03'),
  ('ingreso', 'Sponsor', '4.1.04'),
  ('ingreso', 'Contents', '4.1.05'),
  ('ingreso', 'Coberturas', '4.1.06'),
  ('ingreso', 'Mercadería', '4.2.01'),
  ('ingreso', 'Revoleo de mercadería', '4.2.01'),
  ('ingreso', 'Otros ingresos', '4.3.01'),
  ('ingreso', 'Logística', '4.3.01'),
  ('ingreso', 'Impuestos', '4.3.01'),
  ('egreso', 'Producción', '5.1.01'),
  ('egreso', 'Técnica', '5.1.02'),
  ('egreso', 'Artística', '5.1.03'),
  ('egreso', 'Logística', '5.1.04'),
  ('egreso', 'Staff', '5.1.05'),
  ('egreso', 'Seguridad', '5.1.06'),
  ('egreso', 'Activaciones', '5.1.07'),
  ('egreso', 'Contents', '5.1.08'),
  ('egreso', 'Coberturas', '5.1.09'),
  ('egreso', 'Tickets', '5.1.10'),
  ('egreso', 'Mercadería', '5.1.11'),
  ('egreso', 'Eventos', '5.1.12'),
  ('egreso', 'Sponsor', '5.1.12'),
  ('egreso', 'Sueldos', '5.2.01'),
  ('egreso', 'Equipo', '5.2.02'),
  ('egreso', 'Sociedad', '5.2.04'),
  ('egreso', 'Seguros', '5.2.05'),
  ('egreso', 'Mobiliario', '5.2.06'),
  ('egreso', 'Administración', '5.2.07'),
  ('egreso', 'Proveedores', '5.2.08'),
  ('egreso', 'Marketing', '5.3.01'),
  ('egreso', 'Impuestos', '5.4.01'),
  ('egreso', 'Deuda financiera', '2.1.4.01'),
  ('egreso', 'Otros gastos', '5.9.01')
) as v (tipo, nombre, codigo)
join public.cuentas_contables c on c.codigo = v.codigo
where g.tipo::text = v.tipo and g.nombre = v.nombre and g.cuenta_contable_id is null;

-- Cuentas bancarias actuales → cuenta.
update public.cuentas_bancarias b set cuenta_contable_id = c.id
from (values ('EFECTIVO', '1.1.1.01'), ('BBVA', '1.1.1.02'), ('NACION', '1.1.1.03'), ('MP', '1.1.1.04')) as v (nombre, codigo)
join public.cuentas_contables c on c.codigo = v.codigo
where upper(b.nombre) = v.nombre and b.cuenta_contable_id is null;
