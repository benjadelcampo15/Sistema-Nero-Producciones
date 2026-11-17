import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";
import type { DocumentoPresupuesto } from "./presupuesto";

const e = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  encabezado: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1c1917", paddingBottom: 10 },
  empresa: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  chico: { fontSize: 8, color: "#57534e" },
  titulo: { fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 },
  numero: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right" },
  evento: { borderBottomWidth: 1, borderBottomColor: "#d6d3d1", paddingVertical: 10 },
  negrita: { fontFamily: "Helvetica-Bold" },
  cabecera: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#1c1917", paddingVertical: 5, marginTop: 12, backgroundColor: "#ffffff" },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e7e5e4", paddingVertical: 5 },
  servicio: { flex: 1, paddingRight: 8 },
  monto: { width: 90, textAlign: "right" },
  iva: { width: 80, textAlign: "right" },
  extra: { fontSize: 7.5, color: "#78716c" },
  totales: { marginTop: 12, marginLeft: "auto", width: 260 },
  lineaTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  general: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#1c1917", paddingTop: 5, marginTop: 3, fontSize: 11.5, fontFamily: "Helvetica-Bold" },
  pie: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#a8a29e" },
});

/** Presupuesto para Quilmes en A4. Recibe solo los datos comerciales (lista blanca). */
function PresupuestoPdf({ d }: { d: DocumentoPresupuesto }) {
  const numero = d.numero ? `N° ${String(d.numero).padStart(4, "0")}` : "";
  return (
    <Document title={`Presupuesto Quilmes - ${d.evento.nombre}`} author={d.emisor} creator={d.emisor} producer={d.emisor} subject="Presupuesto" keywords="">
      <Page size="A4" style={e.pagina}>
        <View style={e.encabezado}>
          <View>
            <Text style={e.empresa}>{d.emisor}</Text>
            {d.razon_social && <Text style={e.chico}>{d.razon_social}</Text>}
          </View>
          <View>
            <Text style={[e.titulo, { textAlign: "right" }]}>Presupuesto Quilmes</Text>
            <Text style={e.numero}>{numero}</Text>
            <Text style={[e.chico, { textAlign: "right" }]}>
              {d.version ? `Versión ${d.version} · ` : ""}Emisión: {d.emitido_en ? formatoFechaHora(d.emitido_en).split(" ")[0] : ""}
            </Text>
          </View>
        </View>

        <View style={e.evento}>
          <Text style={e.titulo}>Evento / proyecto</Text>
          <Text style={e.negrita}>{d.evento.nombre}</Text>
          <Text>
            {formatoFecha(d.evento.fecha)}
            {d.evento.lugar ? ` · ${d.evento.lugar}` : ""}
          </Text>
        </View>

        {/* Encabezado de columnas: se repite en cada página. */}
        <View style={e.cabecera} fixed>
          <Text style={[e.servicio, e.titulo]}>Servicio</Text>
          <Text style={[e.monto, e.titulo]}>Precio neto</Text>
          <Text style={[e.iva, e.titulo]}>IVA</Text>
          <Text style={[e.monto, e.titulo]}>Total</Text>
        </View>
        {d.items.map((i, k) => (
          <View key={k} style={e.fila} wrap={false}>
            <View style={e.servicio}>
              <Text>{i.detalle}</Text>
              <Text style={e.extra}>{i.tratamiento}</Text>
            </View>
            <Text style={e.monto}>{formatoPesos(i.neto)}</Text>
            <View style={e.iva}>
              <Text>{formatoPesos(i.iva)}</Text>
              {i.alicuota > 0 && <Text style={e.extra}>{String(i.alicuota).replace(".", ",")}%</Text>}
            </View>
            <Text style={[e.monto, e.negrita]}>{formatoPesos(i.total)}</Text>
          </View>
        ))}

        <View style={e.totales} wrap={false}>
          <View style={e.lineaTotal}><Text>Subtotal neto</Text><Text>{formatoPesos(d.totales.neto)}</Text></View>
          <View style={e.lineaTotal}><Text>IVA</Text><Text>{formatoPesos(d.totales.iva)}</Text></View>
          <View style={e.general}><Text>TOTAL GENERAL PRESUPUESTADO</Text><Text>{formatoPesos(d.totales.total)}</Text></View>
        </View>

        <View style={e.pie} fixed>
          <Text>{d.emisor} · Presupuesto Quilmes {numero}{d.version ? ` · v${d.version}` : ""}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function pdfPresupuestoQuilmes(d: DocumentoPresupuesto) {
  return renderToBuffer(<PresupuestoPdf d={d} />);
}
