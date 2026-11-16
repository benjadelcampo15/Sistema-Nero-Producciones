-- Nueva sección de permisos: Tareas (tableros tipo Trello). Va sola: un valor
-- nuevo de enum no se puede usar en la misma transacción en que se agrega.
--   ver    = usar Tareas (ve y trabaja en los tableros donde es integrante)
--   editar = además crea espacios de trabajo
alter type public.seccion add value if not exists 'tareas';
