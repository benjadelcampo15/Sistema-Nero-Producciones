-- Sin verificación en dos pasos: alcanza con la sesión iniciada (usuario y
-- contraseña). Las políticas siguen llamando a sesion_con_mfa(), que ahora
-- solo exige estar logueado; activo, admin y permisos se siguen validando.
create or replace function public.sesion_con_mfa()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.uid() is not null
$$;
