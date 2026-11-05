-- Base central de Planix: el Centro de Solicitudes de todos los clientes.
--
-- Cada sistema de cliente (Nero, La Finquita…) tiene su propia base; las
-- solicitudes viven acá para que el equipo de Planix las vea todas juntas.
-- Solo se accede desde el servidor de cada sistema, con la clave secreta: el
-- sistema filtra por su empresa y solo el equipo de Planix ve todas.

create table public.solicitudes (
  id                       uuid primary key default gen_random_uuid(),
  numero                   bigint generated always as identity unique,
  -- Sistema de cliente que la mandó ("nero", "finquita"…) y su nombre al crearla.
  empresa                  text not null check (empresa ~ '^[a-z0-9_-]{2,40}$'),
  empresa_nombre           text not null,
  titulo                   text not null check (length(trim(titulo)) between 3 and 140),
  tipo                     text not null check (tipo in ('funcionalidad', 'mejora', 'proceso', 'error', 'otro')),
  descripcion              text not null check (length(trim(descripcion)) between 1 and 8000),
  prioridad_sugerida       text not null check (prioridad_sugerida in ('baja', 'media', 'alta')),
  estado                   text not null default 'recibida' check (estado in ('recibida', 'evaluacion', 'informacion', 'aprobada', 'desarrollo', 'pruebas', 'resuelta', 'rechazada')),
  -- Lo que define el equipo de Planix.
  prioridad_interna        text check (prioridad_interna in ('baja', 'media', 'alta', 'urgente')),
  responsable              text,
  fecha_estimada           date,
  clasificacion            text not null default 'evaluacion' check (clasificacion in ('mantenimiento', 'cotizacion', 'general', 'evaluacion')),
  resolucion               text,
  -- Cotización: si el desarrollo se cobra aparte, el cliente la ve y la aprueba.
  cotizacion_monto         numeric(14, 2) check (cotizacion_monto is null or cotizacion_monto >= 0),
  cotizacion_detalle       text,
  cotizacion_estado        text check (cotizacion_estado in ('pendiente', 'aprobada', 'rechazada')),
  cotizacion_respondida_por text,
  cotizacion_respondida_en timestamptz,
  -- Quién la pidió (usuario del sistema del cliente).
  creado_por_id            uuid not null,
  creado_por_nombre        text not null,
  creado_por_email         text not null,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  -- Para las notificaciones: lo último que hizo cada lado (sin contar notas internas).
  actividad_cliente_en     timestamptz not null default now(),
  actividad_equipo_en      timestamptz
);

create index solicitudes_empresa_idx on public.solicitudes (empresa, creado_en desc);
create index solicitudes_estado_idx on public.solicitudes (estado);

-- Historial: comentarios, notas internas y cada cambio, en orden.
create table public.solicitud_eventos (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  tipo           text not null check (tipo in ('creada', 'comentario', 'nota_interna', 'estado', 'responsable', 'prioridad', 'fecha', 'clasificacion', 'cotizacion', 'cotizacion_respuesta', 'resolucion', 'adjunto')),
  texto          text,
  -- Detalle del cambio: { de, a } o lo que corresponda.
  datos          jsonb,
  -- Las notas internas y lo que hace el equipo sobre ellas no lo ve el cliente.
  interno        boolean not null default false,
  lado           text not null check (lado in ('cliente', 'equipo')),
  autor_nombre   text not null,
  autor_email    text not null,
  creado_en      timestamptz not null default now()
);

create index solicitud_eventos_solicitud_idx on public.solicitud_eventos (solicitud_id, creado_en);

create table public.solicitud_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  evento_id      uuid references public.solicitud_eventos (id) on delete set null,
  nombre         text not null,
  tipo           text not null,
  tamano         integer not null check (tamano > 0),
  path           text not null unique,
  interno        boolean not null default false,
  subido_por     text not null,
  creado_en      timestamptz not null default now()
);

create index solicitud_adjuntos_solicitud_idx on public.solicitud_adjuntos (solicitud_id);

-- Hasta cuándo vio cada usuario cada solicitud (para el aviso de novedades).
create table public.solicitud_vistas (
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  empresa        text not null,
  usuario_id     uuid not null,
  visto_en       timestamptz not null default now(),
  primary key (solicitud_id, empresa, usuario_id)
);

create function public.solicitudes_actualizado() returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end
$$;
create trigger solicitudes_actualizado before update on public.solicitudes
  for each row execute function public.solicitudes_actualizado();

-- Nadie entra directo: solo el servidor de cada sistema, con la clave secreta.
alter table public.solicitudes enable row level security;
alter table public.solicitud_eventos enable row level security;
alter table public.solicitud_adjuntos enable row level security;
alter table public.solicitud_vistas enable row level security;
revoke all on public.solicitudes, public.solicitud_eventos, public.solicitud_adjuntos, public.solicitud_vistas from anon, authenticated;

-- Adjuntos: privados, de hasta 10 MB; se ven con links temporales.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'solicitudes', 'solicitudes', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;
