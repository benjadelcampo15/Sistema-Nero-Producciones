-- Quiénes reciben el mail de cheques por vencer. Lo elige un administrador
-- desde Cheques. Si no hay nadie elegido, se usa lo de antes (la variable
-- CHEQUES_AVISO_PARA o los usuarios con permiso de Cheques).
create table if not exists public.cheques_aviso_destinatarios (
  usuario_id  uuid primary key references public.perfiles (id) on delete cascade,
  creado_en   timestamptz not null default now()
);

drop trigger if exists cheques_aviso_destinatarios_auditoria on public.cheques_aviso_destinatarios;
create trigger cheques_aviso_destinatarios_auditoria after insert or update or delete on public.cheques_aviso_destinatarios
  for each row execute function public.registrar_auditoria();

alter table public.cheques_aviso_destinatarios enable row level security;
drop policy if exists "cheques aviso: ver" on public.cheques_aviso_destinatarios;
create policy "cheques aviso: ver" on public.cheques_aviso_destinatarios for select to authenticated
  using ((select public.tiene_permiso('cheques', 'ver')));
drop policy if exists "cheques aviso: elegir" on public.cheques_aviso_destinatarios;
create policy "cheques aviso: elegir" on public.cheques_aviso_destinatarios for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
revoke all on public.cheques_aviso_destinatarios from anon;
revoke truncate on public.cheques_aviso_destinatarios from authenticated;
