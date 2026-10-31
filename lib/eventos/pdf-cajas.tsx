import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { NOMBRE_CLIENTE } from "@/lib/cliente";
import { BILLETES, TEXTO_RESULTADO, cruceCaja, cruceEfectivo, crucePosnet, totalesCajas, type Caja, type Cruce } from "./cajas";

type Datos = { evento: { nombre: string; fecha: string; lugar: string | null }; cajas: Caja[] };

const COLOR = { ok: "#15803d", falta: "#b91c1c", sobra: "#b45309" } as const;
const FONDO = { ok: "#f0fdf4", falta: "#fef2f2", sobra: "#fffbeb" } as const;
const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

const e = StyleSheet.create({
  pagina: { padding: 32, paddingBottom: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#1c1917" },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: "#1c1917", paddingBottom: 8 },
  chico: { fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  gris: { color: "#57534e" },
  negrita: { fontFamily: "Helvetica-Bold" },
  resumen: { flexDirection: "row", marginTop: 10, borderWidth: 0.5, borderColor: "#d6d3d1" },
  celdaResumen: { flex: 1, padding: 6, borderRightWidth: 0.5, borderRightColor: "#d6d3d1" },
  monto: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 2 },
  caja: { marginTop: 12, borderWidth: 0.8, borderColor: "#a8a29e", borderRadius: 3 },
  cajaTitulo: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1c1917", color: "#ffffff", paddingVertical: 5, paddingHorizontal: 8 },
  filas: { flexDirection: "row", padding: 8 },
  columna: { flex: 1 },
  fila: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  billetes: { width: 190, marginLeft: 14, borderLeftWidth: 0.5, borderLeftColor: "#d6d3d1", paddingLeft: 10 },
  cruce: { marginHorizontal: 8, marginBottom: 8, padding: 6, borderRadius: 3, flexDirection: "row", justifyContent: "space-between" },
  firmas: { flexDirection: "row", marginTop: 34, gap: 40 },
  firma: { flex: 1, borderTopWidth: 0.8, borderTopColor: "#57534e", paddingTop: 3, textAlign: "center", color: "#57534e", fontSize: 8 },
  pie: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a8a29e" },
});

const diferenciaTexto = (n: number) => (n === 0 ? formatoPesos(0) : `${n > 0 ? "+" : "−"}${formatoPesos(Math.abs(n))}`);

function CierresPdf({ evento, cajas }: Datos) {
  const t = totalesCajas(cajas);
  const empresa = process.env.EMISOR_NOMBRE_FANTASIA ?? NOMBRE_CLIENTE;
  return (
    <Document title={`Cierre de cajas - ${evento.nombre}`} author={empresa}>
      <Page size="A4" style={e.pagina}>
        <View style={e.encabezado}>
          <View>
            <Text style={e.chico}>{empresa} · Cierre de cajas</Text>
            <Text style={e.titulo}>{evento.nombre}</Text>
            <Text style={e.gris}>
              {formatoFecha(evento.fecha)}
              {evento.lugar ? ` · ${evento.lugar}` : ""}
            </Text>
          </View>
          <Text style={e.gris}>
            {t.cerradas} de {cajas.length} cajas cerradas
          </Text>
        </View>

        <View style={e.resumen}>
          {[
            ["Inicial (cambio)", formatoPesos(t.inicial)],
            ["Efectivo contado", formatoPesos(t.contado)],
            ["Cierre del posnet", formatoPesos(t.posnet)],
            ["Cierre general", diferenciaTexto(t.diferencia)],
          ].map(([titulo, valor], i) => (
            <View key={titulo} style={[e.celdaResumen, i === 3 ? { borderRightWidth: 0 } : {}]}>
              <Text style={e.chico}>{titulo}</Text>
              <Text style={[e.monto, i === 3 ? { color: t.diferencia < 0 ? COLOR.falta : t.diferencia > 0 ? COLOR.sobra : COLOR.ok } : {}]}>{valor}</Text>
            </View>
          ))}
        </View>

        {cajas.map((c) => {
          const cruce = cruceCaja(c);
          const efectivo = cruceEfectivo(c);
          const posnet = crucePosnet(c);
          const contados = c.billetes ? BILLETES.filter((d) => (c.billetes?.[String(d)] ?? 0) > 0) : [];
          return (
            <View key={c.id} style={e.caja} wrap={false}>
              <View style={e.cajaTitulo}>
                <Text style={e.negrita}>
                  {c.nombre}
                  {c.responsable ? ` · ${c.responsable}` : ""}
                </Text>
                <Text>{c.cerrada_en ? `Cerrada ${fechaHora.format(new Date(c.cerrada_en))}` : "Sin cerrar"}</Text>
              </View>
              <View style={e.filas}>
                <View style={e.columna}>
                  <View style={e.fila}>
                    <Text style={e.gris}>Monto inicial</Text>
                    <Text>{formatoPesos(c.monto_inicial)}</Text>
                  </View>
                  <View style={e.fila}>
                    <Text style={e.gris}>Efectivo según Fudo</Text>
                    <Text>{c.monto_fudo === null ? "—" : formatoPesos(c.monto_fudo)}</Text>
                  </View>
                  <View style={[e.fila, { borderTopWidth: 0.5, borderTopColor: "#d6d3d1", marginTop: 2, paddingTop: 3 }]}>
                    <Text style={e.negrita}>Esperado en caja</Text>
                    <Text style={e.negrita}>{cruce ? formatoPesos(cruce.esperado) : "—"}</Text>
                  </View>
                  <View style={e.fila}>
                    <Text style={e.negrita}>Efectivo contado</Text>
                    <Text style={e.negrita}>{c.efectivo_final === null ? "—" : formatoPesos(c.efectivo_final)}</Text>
                  </View>
                  <Parcial cruce={efectivo} />
                  <View style={[e.fila, { borderTopWidth: 0.5, borderTopColor: "#d6d3d1", marginTop: 4, paddingTop: 3 }]}>
                    <Text style={e.gris}>Tarjetas según Fudo</Text>
                    <Text>{c.fudo_posnet === null ? "—" : formatoPesos(c.fudo_posnet)}</Text>
                  </View>
                  <View style={e.fila}>
                    <Text style={e.negrita}>Cierre del posnet</Text>
                    <Text style={e.negrita}>{c.posnet_cierre === null ? "—" : formatoPesos(c.posnet_cierre)}</Text>
                  </View>
                  <Parcial cruce={posnet} />
                  {c.notas && <Text style={[e.gris, { marginTop: 4 }]}>Notas: {c.notas}</Text>}
                </View>
                {contados.length > 0 && (
                  <View style={e.billetes}>
                    <Text style={[e.chico, { marginBottom: 2 }]}>Conteo por billetes</Text>
                    {contados.map((d) => {
                      const n = c.billetes?.[String(d)] ?? 0;
                      return (
                        <View key={d} style={e.fila}>
                          <Text>
                            {n} × {formatoPesos(d).replace(",00", "")}
                          </Text>
                          <Text>{formatoPesos(n * d)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
              {cruce ? (
                <View style={[e.cruce, { backgroundColor: FONDO[cruce.resultado] }]}>
                  <Text style={[e.negrita, { color: COLOR[cruce.resultado] }]}>Cierre general: {TEXTO_RESULTADO[cruce.resultado]}</Text>
                  <Text style={[e.negrita, { color: COLOR[cruce.resultado] }]}>{diferenciaTexto(cruce.diferencia)}</Text>
                </View>
              ) : (
                <Text style={[e.gris, { marginHorizontal: 8, marginBottom: 8 }]}>Sin cierre: faltan los montos de Fudo, el efectivo contado o el cierre del posnet.</Text>
              )}
            </View>
          );
        })}

        <View style={e.firmas} wrap={false}>
          <Text style={e.firma}>Firma responsable de caja</Text>
          <Text style={e.firma}>Firma de quien controla</Text>
        </View>

        <View style={e.pie} fixed>
          <Text>
            {evento.nombre} · {formatoFecha(evento.fecha)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Hoja ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Resultado de una parte (efectivo o posnet), en chico. */
function Parcial({ cruce }: { cruce: Cruce | null }) {
  if (!cruce) return null;
  return (
    <View style={e.fila}>
      <Text style={{ color: COLOR[cruce.resultado], fontSize: 8 }}>{TEXTO_RESULTADO[cruce.resultado]}</Text>
      <Text style={{ color: COLOR[cruce.resultado], fontSize: 8 }}>{diferenciaTexto(cruce.diferencia)}</Text>
    </View>
  );
}

/** Los cierres de caja del evento, en PDF. */
export function pdfCierres(datos: Datos) {
  return renderToBuffer(<CierresPdf {...datos} />);
}
