-- Ajustes según la planilla de Nero: estado del movimiento (caja real vs
-- comprometida), cheques, datos fiscales y categorías propias.

-- ─── Estado del movimiento ────────────────────────────────────────────────
-- real: ya se cobró/pagó · pendiente: comprometido · proyectado: estimación.
create type public.estado_movimiento as enum ('real', 'pendiente', 'proyectado');

alter table public.transacciones
  add column estado public.estado_movimiento not null default 'real',
  add column facturado boolean not null default false,
  add column iva numeric(14, 2) check (iva is null or iva >= 0),
  add column iibb numeric(14, 2) check (iibb is null or iibb >= 0);

create index transacciones_estado_idx on public.transacciones (estado) where eliminado_en is null;

-- ─── Cheques como medios de pago ──────────────────────────────────────────
alter type public.medio_pago add value if not exists 'cheque_emitido';
alter type public.medio_pago add value if not exists 'cheque_a_emitir';
alter type public.medio_pago add value if not exists 'cheque_a_cobrar';

-- ─── Categorías de la planilla ────────────────────────────────────────────
-- Se quitan las iniciales que no se usan en ningún movimiento.
delete from public.categorias c
where not exists (select 1 from public.transacciones t where t.categoria_id = c.id);

insert into public.categorias (nombre, tipo) values
  ('Eventos', 'egreso'),
  ('Técnica', 'egreso'),
  ('Artística', 'egreso'),
  ('Sueldos', 'egreso'),
  ('Impuestos', 'egreso'),
  ('Logística', 'egreso'),
  ('Proveedores', 'egreso'),
  ('Producción', 'egreso'),
  ('Deuda financiera', 'egreso'),
  ('Marketing', 'egreso'),
  ('Otros gastos', 'egreso'),
  ('Staff', 'egreso'),
  ('Activaciones', 'egreso'),
  ('Tickets', 'egreso'),
  ('Eventos', 'ingreso'),
  ('Otros ingresos', 'ingreso'),
  ('Activaciones', 'ingreso'),
  ('Sponsor', 'ingreso'),
  ('Revoleo de mercadería', 'ingreso')
on conflict (nombre, tipo) do update set activa = true;
