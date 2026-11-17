-- Livings: medidas reales de cada espacio (en metros) y forma de la VIP común
-- (rectángulo o en L con una franja extra). Vacío = las medidas por defecto:
-- Jardines 10 × 4 m y VIP común 16 × 4 m (en L, + franja de 2 × 16 m).
alter table public.planos_livings add column if not exists medidas jsonb not null default '{}';
