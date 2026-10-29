import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pantallas del ingreso: el usuario va a una sola según su estado. */
const PASOS_INGRESO = ["/login", "/cambiar-contrasena"];

/** Sin sesión: páginas públicas por link con token (/p/) y crons (/api/cron/, se validan con CRON_SECRET). */
const PUBLICAS = /^\/(p|api\/cron)\//;

export async function proxy(request: NextRequest) {
  if (PUBLICAS.test(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [clave, valor] of Object.entries(headers ?? {})) {
            response.headers.set(clave, valor);
          }
        },
      },
    },
  );

  const ruta = request.nextUrl.pathname;

  // Redirige conservando las cookies de sesión que Supabase haya refrescado.
  const ir = (destino: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = destino.split("?");
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    const redireccion = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redireccion.cookies.set(cookie);
    }
    return redireccion;
  };

  // Valida el JWT y refresca la sesión si hace falta.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return ruta === "/login" ? response : ir("/login");
  }

  // Con sesión, navegando la app: no se consulta el perfil acá, para no sumar
  // una consulta a la base en cada navegación. La página lo valida
  // (obtenerUsuario: activo y contraseña) y la base lo exige (RLS).
  if (!PASOS_INGRESO.includes(ruta)) {
    return response;
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo, debe_cambiar_contrasena")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return ir("/login?error=inactivo");
  }

  // Con contraseña temporal, lo único pendiente es cambiarla.
  if (perfil.debe_cambiar_contrasena) {
    return ruta === "/cambiar-contrasena" ? response : ir("/cambiar-contrasena");
  }
  if (PASOS_INGRESO.includes(ruta)) {
    return ir("/");
  }
  return response;
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
