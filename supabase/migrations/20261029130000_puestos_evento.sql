-- Puestos de trabajo por evento (Barra, Seguridad, Caja…), cada uno con su
-- color. A cada persona convocada se le asigna uno; el PDF del evento lista
-- al personal agrupado por puesto, con esos colores.

create table public.puestos_evento (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventos (id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) between 1 and 60),
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  orden      integer not null default 0,
  creado_en  timestamptz not null default now()
);

create unique index puestos_evento_nombre_idx on public.puestos_evento (evento_id, lower(trim(nombre)));

alter table public.convocados
  add column puesto_id uuid references public.puestos_evento (id) on delete set null;

create index convocados_puesto_idx on public.convocados (puesto_id);

create trigger puestos_evento_auditoria after insert or update or delete on public.puestos_evento
  for each row execute function public.registrar_auditoria();

alter table public.puestos_evento enable row level security;

create policy "puestos_evento: ver" on public.puestos_evento for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
create policy "puestos_evento: crear" on public.puestos_evento for insert to authenticated
  with check ((select public.tiene_permiso('operativa', 'editar')));
create policy "puestos_evento: editar" on public.puestos_evento for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));
create policy "puestos_evento: borrar" on public.puestos_evento for delete to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')));

revoke all on public.puestos_evento from anon;
revoke truncate on public.puestos_evento from authenticated;

-- Los puestos que ya estaban escritos a mano pasan a ser puestos del evento.
with paleta as (
  select array['#dc2626', '#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0d9488', '#db2777', '#ca8a04', '#0284c7', '#57534e'] as colores
),
nombres as (
  select evento_id, min(trim(puesto)) as nombre, lower(trim(puesto)) as clave
  from public.convocados
  where puesto is not null and trim(puesto) <> ''
  group by evento_id, lower(trim(puesto))
),
numerados as (
  select *, row_number() over (partition by evento_id order by nombre) as n from nombres
)
insert into public.puestos_evento (evento_id, nombre, color, orden)
select evento_id, left(nombre, 60), (select colores[((n - 1) % 10) + 1] from paleta), n
from numerados;

update public.convocados c
set puesto_id = p.id
from public.puestos_evento p
where p.evento_id = c.evento_id
  and lower(trim(p.nombre)) = lower(left(trim(c.puesto), 60))
  and c.puesto_id is null;
