-- Livings VIP: un solo plano (el jardín es siempre el mismo), no uno por evento.
alter table public.planos_livings alter column evento_id drop not null;
alter table public.planos_livings
  add column unico boolean not null default true unique check (unico);
