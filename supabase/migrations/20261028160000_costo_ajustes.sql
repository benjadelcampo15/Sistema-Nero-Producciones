-- El costo promedio cuenta también los ajustes que suman con costo (por
-- ejemplo, la carga inicial del stock por Excel), no solo las entradas.
create or replace view public.stock_actual
with (security_invoker = true)
as
select
  m.producto_id,
  m.deposito_id,
  sum(m.cantidad) as cantidad,
  round(
    sum(m.cantidad * m.costo_unitario) filter (where m.tipo in ('entrada', 'ajuste') and m.cantidad > 0 and m.costo_unitario is not null)
    / nullif(sum(m.cantidad) filter (where m.tipo in ('entrada', 'ajuste') and m.cantidad > 0 and m.costo_unitario is not null), 0),
    2
  ) as costo_promedio,
  max(m.fecha) as ultimo_movimiento
from public.movimientos_stock m
group by m.producto_id, m.deposito_id;
