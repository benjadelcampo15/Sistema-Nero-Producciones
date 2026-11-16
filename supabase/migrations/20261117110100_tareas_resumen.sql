-- Resumen de cada tarjeta de un tablero, para la cara de la tarjeta (una sola consulta):
-- avance de checklists, adjuntos, comentarios, etiquetas y si el usuario la sigue.
create or replace function public.tareas_resumen_tablero(p_tablero uuid)
returns table (tarjeta_id uuid, items integer, hechos integer, adjuntos integer, comentarios integer, etiquetas uuid[], sigo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
    coalesce((select count(*) from public.tareas_checklist_items i join public.tareas_checklists c on c.id = i.checklist_id where c.tarjeta_id = t.id), 0)::int,
    coalesce((select count(*) from public.tareas_checklist_items i join public.tareas_checklists c on c.id = i.checklist_id where c.tarjeta_id = t.id and i.hecho), 0)::int,
    (select count(*) from public.tareas_adjuntos a where a.tarjeta_id = t.id)::int,
    (select count(*) from public.tareas_comentarios m where m.tarjeta_id = t.id)::int,
    coalesce((select array_agg(te.etiqueta_id) from public.tareas_tarjeta_etiquetas te where te.tarjeta_id = t.id), '{}'),
    exists (select 1 from public.tareas_seguidores s where s.tarjeta_id = t.id and s.usuario_id = auth.uid())
  from public.tareas_tarjetas t
  where t.tablero_id = p_tablero and public.tareas_rol(p_tablero) is not null
$$;
revoke execute on function public.tareas_resumen_tablero(uuid) from public, anon;
grant execute on function public.tareas_resumen_tablero(uuid) to authenticated;
