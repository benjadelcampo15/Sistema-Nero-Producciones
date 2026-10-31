-- Cierre de cajas: además del efectivo, lo cobrado con posnet (tarjetas).
-- Se cruza lo que dice Fudo que se cobró con tarjeta contra el cierre del posnet.

alter table public.cajas_evento
  add column if not exists fudo_posnet numeric(14, 2) check (fudo_posnet is null or fudo_posnet >= 0),
  add column if not exists posnet_cierre numeric(14, 2) check (posnet_cierre is null or posnet_cierre >= 0);
