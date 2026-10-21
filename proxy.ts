import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pantallas del ingreso: el usuario va a una sola según su estado. */
const PASOS_INGRESO = ["/login", "/cambiar-contrasena", "/mfa/configurar", "/mfa/verificar"];

export async function proxy(request: NextRequest) {
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

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo, debe_cambiar_contrasena")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return ir("/login?error=inactivo");
  }

  // Orden del ingreso:
  //   con 2FA configurado → verificar código → (cambiar contraseña si hace falta)
  //   sin 2FA            → cambiar contraseña temporal → configurar 2FA
  // Con 2FA configurado, Supabase exige verificarlo antes de cambiar la contraseña.
  let pasoPendiente: string | null = null;
  if (claims.aal !== "aal2") {
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.nextLevel === "aal2") {
      pasoPendiente = "/mfa/verificar";
    } else if (perfil.debe_cambiar_contrasena) {
      pasoPendiente = "/cambiar-contrasena";
    } else {
      pasoPendiente = "/mfa/configurar";
    }
  } else if (perfil.debe_cambiar_contrasena) {
    pasoPendiente = "/cambiar-contrasena";
  }

  if (pasoPendiente) {
    return ruta === pasoPendiente ? response : ir(pasoPendiente);
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
