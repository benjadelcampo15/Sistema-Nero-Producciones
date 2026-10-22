-- Clientes: a quién se le factura (y se le presupuesta).

create table public.clientes (
  id                uuid primary key default gen_random_uuid(),
  razon_social      text not null check (length(trim(razon_social)) > 0),
  -- 80 = CUIT, 96 = DNI, 99 = consumidor final sin identificar.
  doc_tipo          integer not null default 80 check (doc_tipo in (80, 96, 99)),
  doc_nro           text not null default '0',
  -- Condición frente al IVA (códigos de ARCA: 1 RI, 6 Monotributo, 5 Consumidor final, 4 Exento…).
  condicion_iva     integer not null default 1,
  email             text,
  telefono          text,
  domicilio         text,
  notas             text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

-- Un mismo CUIT/DNI no se carga dos veces.
create unique index clientes_documento_unico on public.clientes (doc_tipo, doc_nro) where doc_tipo <> 99;
create index clientes_razon_social_idx on public.clientes (lower(razon_social));

alter table public.comprobantes_emitidos add column cliente_id uuid references public.clientes (id);

create trigger clientes_auditoria
  after insert or update or delete on public.clientes
  for each row execute function public.registrar_auditoria();

alter table public.clientes enable row level security;

create policy "clientes: ver" on public.clientes for select to authenticated
  using ((select public.tiene_permiso('facturar', 'ver')) or (select public.tiene_permiso('presupuestos', 'ver')));
create policy "clientes: crear" on public.clientes for insert to authenticated
  with check ((select public.tiene_permiso('facturar', 'editar')) or (select public.tiene_permiso('presupuestos', 'editar')));
create policy "clientes: editar" on public.clientes for update to authenticated
  using ((select public.tiene_permiso('facturar', 'editar')) or (select public.tiene_permiso('presupuestos', 'editar')))
  with check ((select public.tiene_permiso('facturar', 'editar')) or (select public.tiene_permiso('presupuestos', 'editar')));

revoke all on public.clientes from anon;
revoke delete, truncate on public.clientes from authenticated;

-- Clientes iniciales: los receptores de las facturas reales ya emitidas.
insert into public.clientes (razon_social, doc_tipo, doc_nro, condicion_iva)
select distinct on (doc_tipo, doc_nro) receptor_nombre, doc_tipo, doc_nro, condicion_iva_receptor
from public.comprobantes_emitidos
where entorno = 'produccion' and estado = 'emitido' and doc_tipo <> 99 and receptor_nombre is not null
order by doc_tipo, doc_nro, creado_en desc
on conflict do nothing;

update public.comprobantes_emitidos c set cliente_id = cl.id
from public.clientes cl
where c.entorno = 'produccion' and cl.doc_tipo = c.doc_tipo and cl.doc_nro = c.doc_nro;
