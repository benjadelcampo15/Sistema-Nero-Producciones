import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Cierra la sesión y vuelve al login. Lo usa la página cuando detecta un
 * usuario desactivado (desde una página no se pueden borrar cookies).
 */
export async function GET(request: NextRequest) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  if (request.nextUrl.searchParams.get("motivo") === "inactivo") url.searchParams.set("error", "inactivo");
  return NextResponse.redirect(url);
}
