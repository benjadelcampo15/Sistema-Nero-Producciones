-- Los cheques también son de Nero o de Ruta. Los cargados desde un movimiento toman la empresa del movimiento.
alter table public.cheques add column if not exists empresa text not null default 'nero';
alter table public.cheques drop constraint if exists cheques_empresa_check;
alter table public.cheques add constraint cheques_empresa_check check (empresa in ('nero', 'ruta'));

update public.cheques c set empresa = t.empresa
from public.transacciones t
where c.transaccion_id = t.id and c.empresa <> t.empresa;
