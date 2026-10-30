-- Proveedores y clientes por empresa, y sus cuentas corrientes.
--
-- Cada ficha es de Nero, de Ruta o de las dos (empresa null). La cuenta
-- corriente sale de Financiero: lo que se le debe (o nos debe) son los
-- movimientos pendientes de sus facturas. Un pago (o cobro) se imputa a esos
-- movimientos: si cubre uno entero, pasa a real con la fecha y el medio del
-- pago; si lo cubre en parte, el movimiento se divide en la parte pagada (real)
-- y el resto (sigue pendiente). Así Financiero y la cuenta corriente siempre
-- coinciden.

-- ─── Empresa de cada ficha ────────────────────────────────────────────────
alter table public.proveedores add column if not exists empresa text check (empresa in ('nero', 'ruta'));
alter table public.clientes add column if not exists empresa text check (empresa in ('nero', 'ruta'));

-- Las que hasta ahora trabajaron con una sola empresa quedan en esa.
update public.proveedores p
set empresa = x.empresa
from (
  select regexp_replace(cuit_emisor, '[^0-9]', '', 'g') as cuit, min(empresa) as empresa
  from public.facturas
  where estado = 'aprobada' and cuit_emisor is not null
  group by 1
  having count(distinct empresa) = 1
) x
where x.cuit = p.cuit and p.empresa is null;

update public.clientes c
set empresa = x.empresa
from (
  select cliente_id, min(empresa) as empresa
  from public.comprobantes_emitidos
  where cliente_id is not null
  group by cliente_id
  having count(distinct empresa) = 1
) x
where x.cliente_id = c.id and c.empresa is null;

-- ─── Pagos a proveedores y cobros a clientes ──────────────────────────────
create table public.pagos_cuenta (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null check (empresa in ('nero', 'ruta')),
  tipo          text not null check (tipo in ('pago', 'cobro')),
  proveedor_id  uuid references public.proveedores (id),
  cliente_id    uuid references public.clientes (id),
  fecha         date not null,
  monto         numeric(14, 2) not null check (monto > 0),
  medio_pago    public.medio_pago not null,
  notas         text,
  anulado_en    timestamptz,
  creado_por    uuid references public.perfiles (id) default auth.uid(),
  creado_en     timestamptz not null default now(),
  check ((tipo = 'pago' and proveedor_id is not null and cliente_id is null) or (tipo = 'cobro' and cliente_id is not null and proveedor_id is null))
);

create index pagos_cuenta_proveedor_idx on public.pagos_cuenta (proveedor_id, empresa);
create index pagos_cuenta_cliente_idx on public.pagos_cuenta (cliente_id, empresa);

-- A qué movimientos se imputó cada pago (y cómo estaban antes, para poder anularlo).
create table public.pago_aplicaciones (
  id              uuid primary key default gen_random_uuid(),
  pago_id         uuid not null references public.pagos_cuenta (id) on delete cascade,
  transaccion_id  uuid not null references public.transacciones (id),
  monto           numeric(14, 2) not null check (monto > 0),
  dividida_de     uuid references public.transacciones (id),
  fecha_anterior  date,
  medio_anterior  public.medio_pago not null
);

create index pago_aplicaciones_pago_idx on public.pago_aplicaciones (pago_id);

-- La parte pagada de un movimiento dividido apunta al movimiento de la factura.
alter table public.transacciones
  add column if not exists parte_de uuid references public.transacciones (id),
  add column if not exists pago_id uuid references public.pagos_cuenta (id);

create index if not exists transacciones_parte_de_idx on public.transacciones (parte_de) where parte_de is not null;

create trigger pagos_cuenta_auditoria after insert or update or delete on public.pagos_cuenta
  for each row execute function public.registrar_auditoria();

alter table public.pagos_cuenta enable row level security;
alter table public.pago_aplicaciones enable row level security;

create policy "pagos_cuenta: ver" on public.pagos_cuenta for select to authenticated
  using (
    (select public.tiene_permiso('financiero', 'ver'))
    or (tipo = 'pago' and (select public.tiene_permiso('facturas', 'ver')))
    or (tipo = 'cobro' and (select public.tiene_permiso('facturar', 'ver')))
  );
create policy "pago_aplicaciones: ver" on public.pago_aplicaciones for select to authenticated
  using (exists (select 1 from public.pagos_cuenta p where p.id = pago_id));

-- Se escriben solo por las funciones de abajo.
revoke all on public.pagos_cuenta, public.pago_aplicaciones from anon;
revoke insert, update, delete, truncate on public.pagos_cuenta, public.pago_aplicaciones from authenticated;

-- ─── Movimientos que forman la cuenta corriente ───────────────────────────
-- Los de las facturas del proveedor (por CUIT) o los comprobantes del cliente,
-- más las partes en que se dividieron al pagarlos en partes.
create or replace function public.movimientos_de_cuenta(p_tipo text, p_id uuid, p_empresa text)
returns setof public.transacciones
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select t.id
    from public.transacciones t
    join public.facturas f on f.id = t.factura_id
    -- El CUIT de la factura puede tener guiones.
    join public.proveedores p on p.cuit = regexp_replace(f.cuit_emisor, '[^0-9]', '', 'g')
    where p_tipo = 'pago' and p.id = p_id and f.estado = 'aprobada'
    union
    select c.transaccion_id
    from public.comprobantes_emitidos c
    where p_tipo = 'cobro' and c.cliente_id = p_id and c.transaccion_id is not null
  )
  select t.*
  from public.transacciones t
  where (t.id in (select id from base) or t.parte_de in (select id from base))
    and t.eliminado_en is null
    and t.empresa = p_empresa
    and (
      (p_tipo = 'pago' and ((select public.tiene_permiso('facturas', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
      or (p_tipo = 'cobro' and ((select public.tiene_permiso('facturar', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
    );
$$;

revoke execute on function public.movimientos_de_cuenta(text, uuid, text) from public, anon;
grant execute on function public.movimientos_de_cuenta(text, uuid, text) to authenticated;

-- ─── Registrar un pago o cobro ────────────────────────────────────────────
-- p_pago: { tipo, id (proveedor o cliente), empresa, fecha, monto, medio_pago, notas }
-- p_movimientos: a qué movimientos pendientes imputarlo, en orden; si es null,
-- se imputa a los más viejos primero.
create or replace function public.registrar_pago(p_pago jsonb, p_movimientos uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := p_pago ->> 'tipo';
  v_id uuid := (p_pago ->> 'id')::uuid;
  v_empresa text := p_pago ->> 'empresa';
  v_fecha date := (p_pago ->> 'fecha')::date;
  v_monto numeric(14, 2) := (p_pago ->> 'monto')::numeric;
  v_medio public.medio_pago := (p_pago ->> 'medio_pago')::public.medio_pago;
  v_resta numeric(14, 2);
  v_pago_id uuid;
  v_aplica numeric(14, 2);
  v_iva numeric(14, 2);
  v_nueva uuid;
  t public.transacciones;
begin
  if v_tipo not in ('pago', 'cobro') or v_empresa not in ('nero', 'ruta') then
    raise exception 'Datos del pago inválidos';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (v_tipo = 'pago' and (select public.tiene_permiso('facturas', 'editar')))
    or (v_tipo = 'cobro' and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para registrar pagos';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero';
  end if;

  insert into public.pagos_cuenta (empresa, tipo, proveedor_id, cliente_id, fecha, monto, medio_pago, notas)
  values (
    v_empresa, v_tipo,
    case when v_tipo = 'pago' then v_id end,
    case when v_tipo = 'cobro' then v_id end,
    v_fecha, v_monto, v_medio, nullif(trim(p_pago ->> 'notas'), '')
  )
  returning id into v_pago_id;

  v_resta := v_monto;
  for t in
    select m.*
    from public.movimientos_de_cuenta(v_tipo, v_id, v_empresa) m
    where m.estado = 'pendiente'
      and (p_movimientos is null or m.id = any (p_movimientos))
    order by
      case when p_movimientos is null then 0 else array_position(p_movimientos, m.id) end,
      m.fecha nulls last, m.creado_en
  loop
    exit when v_resta <= 0;
    -- Se bloquea la fila para que dos pagos a la vez no la usen.
    perform 1 from public.transacciones where id = t.id and estado = 'pendiente' for update;
    if not found then
      continue;
    end if;
    v_aplica := least(v_resta, t.monto);

    if v_aplica = t.monto then
      insert into public.pago_aplicaciones (pago_id, transaccion_id, monto, fecha_anterior, medio_anterior)
      values (v_pago_id, t.id, v_aplica, t.fecha, t.medio_pago);
      update public.transacciones
      set estado = 'real', fecha = v_fecha, medio_pago = v_medio, pago_id = v_pago_id
      where id = t.id;
    else
      v_iva := case when t.iva is null then null else round(t.iva * v_aplica / t.monto, 2) end;
      update public.transacciones
      set monto = monto - v_aplica, iva = case when iva is null then null else iva - v_iva end
      where id = t.id;
      insert into public.transacciones (
        empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
        medio_pago, estado, facturado, iva, notas, parte_de, pago_id
      ) values (
        t.empresa, t.tipo, v_aplica, v_fecha, t.descripcion, t.categoria_id, t.evento_id, t.contraparte,
        v_medio, 'real', t.facturado, v_iva,
        concat_ws(' · ', nullif(t.notas, ''), case when v_tipo = 'pago' then 'Pago parcial' else 'Cobro parcial' end),
        coalesce(t.parte_de, t.id), v_pago_id
      )
      returning id into v_nueva;
      insert into public.pago_aplicaciones (pago_id, transaccion_id, monto, dividida_de, fecha_anterior, medio_anterior)
      values (v_pago_id, v_nueva, v_aplica, t.id, t.fecha, t.medio_pago);
    end if;
    v_resta := v_resta - v_aplica;
  end loop;

  if v_resta > 0 then
    raise exception 'El % supera lo pendiente: sobran $%', case when v_tipo = 'pago' then 'pago' else 'cobro' end, to_char(v_resta, 'FM999G999G999G990D00');
  end if;
  return v_pago_id;
end
$$;

-- ─── Anular un pago ───────────────────────────────────────────────────────
-- Lo pagado vuelve a quedar pendiente; las partes divididas se vuelven a unir
-- al movimiento original si este sigue pendiente.
create or replace function public.anular_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos_cuenta;
  a public.pago_aplicaciones;
  v_madre public.transacciones;
  v_parte public.transacciones;
begin
  select * into v_pago from public.pagos_cuenta where id = p_pago_id and anulado_en is null for update;
  if not found then
    raise exception 'El pago no existe o ya está anulado';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (v_pago.tipo = 'pago' and (select public.tiene_permiso('facturas', 'editar')))
    or (v_pago.tipo = 'cobro' and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para anular pagos';
  end if;

  for a in select * from public.pago_aplicaciones where pago_id = p_pago_id loop
    select * into v_parte from public.transacciones where id = a.transaccion_id for update;
    if a.dividida_de is not null then
      select * into v_madre from public.transacciones
      where id = a.dividida_de and estado = 'pendiente' and eliminado_en is null
      for update;
      if found then
        update public.transacciones
        set monto = monto + v_parte.monto,
            iva = case when iva is null and v_parte.iva is null then null else coalesce(iva, 0) + coalesce(v_parte.iva, 0) end
        where id = v_madre.id;
        update public.transacciones set eliminado_en = now(), pago_id = null where id = v_parte.id;
        continue;
      end if;
    end if;
    update public.transacciones
    set estado = 'pendiente', fecha = a.fecha_anterior, medio_pago = a.medio_anterior, pago_id = null
    where id = v_parte.id;
  end loop;

  update public.pagos_cuenta set anulado_en = now() where id = p_pago_id;
end
$$;

revoke execute on function public.registrar_pago(jsonb, uuid[]) from public, anon;
revoke execute on function public.anular_pago(uuid) from public, anon;
grant execute on function public.registrar_pago(jsonb, uuid[]) to authenticated;
grant execute on function public.anular_pago(uuid) to authenticated;
