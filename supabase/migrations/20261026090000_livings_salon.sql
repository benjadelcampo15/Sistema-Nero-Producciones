-- Livings VIP: además del jardín hay un salón (piso gris). Zonas, elementos y
-- livings llevan su espacio dentro del jsonb; el salón tiene su propia forma.
alter table public.planos_livings
  add column proporcion_salon numeric(4, 3) not null default 0.667 check (proporcion_salon between 0.2 and 3);
