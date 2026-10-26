-- Livings VIP: un plano por evento con la imagen del jardín, las zonas donde
-- pueden ir livings, un punto de referencia (escenario / zona VIP), los mozos
-- y los livings (cargados desde un Excel) con su posición y mozo asignado.
--
-- Todo el plano se guarda como un documento (jsonb): se edita de a una persona
-- y se guarda entero. Las posiciones van en proporción de la imagen (0 a 1).

create table public.planos_livings (
  id                uuid primary key default gen_random_uuid(),
  evento_id         uuid not null unique references public.eventos (id) on delete cascade,
  imagen_path       text,
  imagen_ancho      integer check (imagen_ancho is null or imagen_ancho > 0),
  imagen_alto       integer check (imagen_alto is null or imagen_alto > 0),
  -- Diámetro de cada living, en proporción del ancho de la imagen.
  tamano_living     numeric(5, 4) not null default 0.04 check (tamano_living between 0.005 and 0.3),
  -- [{ id, x, y, w, h }]
  zonas             jsonb not null default '[]',
  -- { x, y } o null
  referencia        jsonb,
  -- [{ id, nombre }]
  mozos             jsonb not null default '[]',
  -- [{ id, nombre, personas, consumicion, notas, x, y, mozo_id }]
  livings           jsonb not null default '[]',
  creado_por        uuid references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create trigger planos_livings_autoria
  before insert or update on public.planos_livings
  for each row execute function public.marcar_autoria();
create trigger planos_livings_auditoria
  after insert or update or delete on public.planos_livings
  for each row execute function public.registrar_auditoria();

alter table public.planos_livings enable row level security;

create policy "livings: ver" on public.planos_livings for select to authenticated
  using ((select public.tiene_permiso('livings', 'ver')));
create policy "livings: crear" on public.planos_livings for insert to authenticated
  with check ((select public.tiene_permiso('livings', 'editar')));
create policy "livings: editar" on public.planos_livings for update to authenticated
  using ((select public.tiene_permiso('livings', 'editar')))
  with check ((select public.tiene_permiso('livings', 'editar')));

revoke all on public.planos_livings from anon;
revoke delete, truncate on public.planos_livings from authenticated;

-- Imágenes de los planos: bucket privado, solo el servidor sube y firma links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planos', 'planos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
