-- El cron diario (con la clave de servicio) genera los avisos de vencimiento.
grant execute on function public.tareas_generar_vencimientos() to service_role;
