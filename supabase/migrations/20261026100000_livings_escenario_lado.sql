-- Livings VIP: cada espacio es directamente el rectángulo de los livings con
-- reserva (no se dibujan zonas); el escenario se indica por el lado en que está.
-- { "jardin": "arriba" | "abajo" | "izquierda" | "derecha" | "ninguno", "salon": … }
alter table public.planos_livings
  add column escenarios jsonb not null default '{}';
