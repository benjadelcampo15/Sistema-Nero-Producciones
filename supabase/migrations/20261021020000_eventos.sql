-- Fase 3: Eventos.

-- Balance por evento. security_invoker: respeta el RLS de quien consulta,
-- así cada usuario solo suma los movimientos que tiene permitido ver.
create view public.balance_eventos
with (security_invoker = true)
as
select
  e.id as evento_id,
  coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric(14, 2) as ingresos,
  coalesce(sum(t.monto) filter (where t.tipo = 'egreso'), 0)::numeric(14, 2) as egresos,
  count(t.id) as movimientos
from public.eventos e
left join public.transacciones t
  on t.evento_id = e.id and t.eliminado_en is null
group by e.id;

revoke all on public.balance_eventos from anon;
grant select on public.balance_eventos to authenticated;

-- Categoría propia de los eventos de vino.
insert into public.categorias (nombre, tipo)
values ('Vinos y bebidas', 'egreso')
on conflict (nombre, tipo) do nothing;
