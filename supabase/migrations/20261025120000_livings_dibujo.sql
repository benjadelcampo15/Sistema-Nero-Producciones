-- Livings VIP: el jardín se puede dibujar en la app (pasto verde con escenario,
-- barras, caminos, etc.) sin subir una imagen.
alter table public.planos_livings
  -- [{ id, tipo, x, y, w, h }]
  add column elementos jsonb not null default '[]',
  -- Alto / ancho del jardín dibujado (con imagen manda la imagen).
  add column proporcion numeric(4, 3) not null default 0.667 check (proporcion between 0.2 and 3);
