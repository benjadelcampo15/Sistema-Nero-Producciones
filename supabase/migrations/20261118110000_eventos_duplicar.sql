-- Duplicar la planilla de un evento en uno nuevo: de qué evento se copió y una
-- clave por envío (si se toca dos veces "Duplicar", no se crean dos eventos).
-- Quién lo hizo queda en creado_por (lo pone la base) y en auditoría.
alter table public.eventos add column if not exists copiado_de uuid references public.eventos (id) on delete set null;
alter table public.eventos add column if not exists copia_clave uuid;
create unique index if not exists eventos_copia_clave_idx on public.eventos (copia_clave) where copia_clave is not null;
