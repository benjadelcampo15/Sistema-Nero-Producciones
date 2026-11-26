import "server-only";
import { Document, Font, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { NOMBRE_PRIORIDAD_PAGO, type PrioridadPago } from "@/lib/pagos/tipos";
import { NOMBRE_ESTADO_PROPUESTA, calcularPropuesta, type Propuesta } from "./tipos";

Font.registerHyphenationCallback((palabra) => [palabra]);

const VERDE = "#15803d";
const ROJO = "#b91c1c";
const GRIS = "#e7e5e4";
const SUAVE = "#78716c";
const OSCURO = "#1c1917";
const COLOR_PRIORIDAD: Record<PrioridadPago, string> = { muy_urgente: ROJO, urgente: "#b45309", normal: SUAVE };

const e = StyleSheet.create({
  pagina: { paddingTop: 30, paddingBottom: 42, paddingHorizontal: 30, fontSize: 8.5, fontFamily: "Helvetica", color: OSCURO },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: OSCURO, paddingBottom: 8 },
  etiqueta: { fontSize: 7, color: SUAVE, textTransform: "uppercase", letterSpacing: 0.6 },
  negrita: { fontFamily: "Helvetica-Bold" },
  tarjetas: { flexDirection: "row", gap: 8, marginTop: 12 },
  tarjeta: { flex: 1, borderWidth: 0.8, borderColor: "#d6d3d1", borderRadius: 4, padding: 8 },
  cifra: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  cab: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: OSCURO, paddingVertical: 4, marginTop: 14, backgroundColor: "#ffffff" },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: GRIS, paddingVertical: 4 },
  total: { flexDirection: "row", borderTopWidth: 1.2, borderTopColor: OSCURO, paddingVertical: 5, backgroundColor: "#f5f5f4" },
  nota: { fontSize: 7, color: SUAVE },
  pie: { position: "absolute", bottom: 16, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a8a29e" },
});

// Columnas de la tabla (A4 apaisada).
const C = {
  orden: { width: 20 },
  proveedor: { width: 118, paddingRight: 6 },
  detalle: { flex: 1, paddingRight: 6 },
  evento: { width: 92, paddingRight: 6 },
  alias: { width: 118, paddingRight: 6 },
  prioridad: { width: 56 },
  adeudado: { width: 70, textAlign: "right" },
  importe: { width: 74, textAlign: "right" },
  saldo: { width: 74, textAlign: "right" },
} satisfies Record<string, Style>;

function PropuestaPdf({ p, eventos, emitido }: { p: Propuesta; eventos: Map<string, string>; emitido: string }) {
  const c = calcularPropuesta(p.disponible, p.items);
  return (
    <Document title={`Propuesta de pagos - ${p.nombre}`} author="Planix" creator="Planix">
      <Page size="A4" orientation="landscape" style={e.pagina}>
        <View style={e.encabezado}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Svg width={26} height={26} viewBox="0 0 48 48">
              {[[0, 2], [0, 1], [0, 0], [1, 0], [1, 1]].map(([col, fil], i) => (
                <Rect key={i} x={10 + col * 15.5} y={3.75 + fil * 15.5} width={12.5} height={12.5} rx={col === 1 ? 5 : 3} fill={i === 4 ? "#f59e0b" : OSCURO} />
              ))}
            </Svg>
            <View>
              <Text style={[e.negrita, { fontSize: 11, letterSpacing: 3 }]}>PLANIX</Text>
              <Text style={e.nota}>{NOMBRE_EMPRESA[p.empresa]}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={e.etiqueta}>Propuesta de pagos</Text>
            <Text style={[e.negrita, { fontSize: 16 }]}>{p.nombre}</Text>
            <Text style={{ color: "#57534e" }}>
              {NOMBRE_EMPRESA[p.empresa]} · {formatoFecha(p.fecha)} · Propuesta #{p.numero} · {NOMBRE_ESTADO_PROPUESTA[p.estado]}
            </Text>
          </View>
        </View>

        <View style={e.tarjetas}>
          <View style={e.tarjeta}>
            <Text style={e.etiqueta}>Dinero disponible</Text>
            <Text style={e.cifra}>{formatoPesos(p.disponible)}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.etiqueta}>Total de pagos propuestos</Text>
            <Text style={e.cifra}>{formatoPesos(c.total)}</Text>
            <Text style={e.nota}>{p.items.length} pago{p.items.length === 1 ? "" : "s"}</Text>
          </View>
          <View style={[e.tarjeta, { borderColor: c.excedido ? ROJO : VERDE, backgroundColor: c.excedido ? "#fef2f2" : "#f0fdf4" }]}>
            <Text style={e.etiqueta}>Saldo restante</Text>
            <Text style={[e.cifra, { color: c.excedido ? ROJO : VERDE }]}>{formatoPesos(c.saldo)}</Text>
            {c.excedido && <Text style={[e.nota, { color: ROJO }]}>Se supera el disponible por {formatoPesos(-c.saldo)}</Text>}
          </View>
        </View>
        {p.observaciones ? (
          <Text style={{ marginTop: 8 }}>
            <Text style={e.negrita}>Observaciones: </Text>
            {p.observaciones}
          </Text>
        ) : null}

        <View style={e.cab} fixed>
          <Text style={[C.orden, e.etiqueta]}>#</Text>
          <Text style={[C.proveedor, e.etiqueta]}>Proveedor</Text>
          <Text style={[C.detalle, e.etiqueta]}>Concepto</Text>
          <Text style={[C.evento, e.etiqueta]}>Evento</Text>
          <Text style={[C.alias, e.etiqueta]}>Alias / CBU</Text>
          <Text style={[C.prioridad, e.etiqueta]}>Prioridad</Text>
          <Text style={[C.adeudado, e.etiqueta]}>Adeudado</Text>
          <Text style={[C.importe, e.etiqueta]}>A pagar</Text>
          <Text style={[C.saldo, e.etiqueta]}>Saldo</Text>
        </View>
        {c.filas.map((f, i) => {
          const x = f.pago;
          return (
            <View key={x.id} style={[e.fila, f.noAlcanza ? { backgroundColor: "#fef2f2" } : {}]} wrap={false}>
              <Text style={[C.orden, { color: SUAVE }]}>{i + 1}</Text>
              <View style={C.proveedor}>
                <Text style={e.negrita}>{x.proveedor}</Text>
                {x.solicitante ? <Text style={e.nota}>Solicitó {x.solicitante}</Text> : null}
              </View>
              <View style={C.detalle}>
                <Text>{x.detalle || "—"}</Text>
                {x.observaciones ? <Text style={e.nota}>{x.observaciones}</Text> : null}
              </View>
              <Text style={C.evento}>{x.evento_id ? (eventos.get(x.evento_id) ?? "—") : "—"}</Text>
              <Text style={[C.alias, { fontFamily: "Courier", fontSize: 7.5 }]}>{x.alias_cbu || "—"}</Text>
              <Text style={[C.prioridad, { color: COLOR_PRIORIDAD[x.prioridad] }, x.prioridad !== "normal" ? e.negrita : {}]}>{NOMBRE_PRIORIDAD_PAGO[x.prioridad]}</Text>
              <Text style={C.adeudado}>{x.adeudado === null ? "—" : formatoPesos(x.adeudado)}</Text>
              <View style={C.importe}>
                <Text style={e.negrita}>{formatoPesos(x.importe)}</Text>
                {f.parcial ? <Text style={[e.nota, { color: "#b45309" }]}>Parcial</Text> : null}
              </View>
              <Text style={[C.saldo, { color: f.saldoDespues < 0 ? ROJO : SUAVE }]}>{formatoPesos(f.saldoDespues)}</Text>
            </View>
          );
        })}
        {p.items.length === 0 && <Text style={[e.nota, { paddingVertical: 10 }]}>La propuesta no tiene pagos.</Text>}
        <View style={e.total} wrap={false}>
          <Text style={[C.orden]} />
          <Text style={[C.proveedor, e.negrita]}>TOTAL</Text>
          <Text style={[C.detalle, e.nota]}>
            {c.porPrioridad
              .filter((x) => x.cantidad)
              .map((x) => `${NOMBRE_PRIORIDAD_PAGO[x.prioridad]}: ${x.cantidad} (${formatoPesos(x.total)})`)
              .join(" · ")}
          </Text>
          <Text style={C.evento} />
          <Text style={C.alias} />
          <Text style={C.prioridad} />
          <Text style={[C.adeudado, e.negrita]}>{c.adeudado ? formatoPesos(c.adeudado) : "—"}</Text>
          <Text style={[C.importe, e.negrita]}>{formatoPesos(c.total)}</Text>
          <Text style={[C.saldo, e.negrita, { color: c.excedido ? ROJO : VERDE }]}>{formatoPesos(c.saldo)}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 40, marginTop: 36 }} wrap={false}>
          {["Preparó", "Revisó / aprobó"].map((t) => (
            <View key={t} style={{ width: 200, borderTopWidth: 0.8, borderTopColor: SUAVE, paddingTop: 3 }}>
              <Text style={e.nota}>{t}</Text>
            </View>
          ))}
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Text style={[e.nota, { textAlign: "right" }]}>
              {p.creador ? `Creada por ${p.creador}. ` : ""}
              {p.modificador ? `Última modificación: ${p.modificador}.` : ""}
            </Text>
          </View>
        </View>

        <View style={e.pie} fixed>
          <Text>Planificación interna de pagos: no son pagos realizados ni movimientos de Financiero · Emitido el {emitido}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function pdfPropuesta(p: Propuesta, eventos: Map<string, string>, emitido: string) {
  return renderToBuffer(<PropuestaPdf p={p} eventos={eventos} emitido={emitido} />);
}
