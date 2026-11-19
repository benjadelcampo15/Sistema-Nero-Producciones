import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoCantidad, r3 } from "./tipos";
import type { DatosStockEvento } from "./por-evento";

const e = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 44, paddingHorizontal: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1c1917" },
  encabezado: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1c1917", paddingBottom: 8 },
  grande: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  chico: { fontSize: 8, color: "#57534e" },
  titulo: { fontSize: 7.5, color: "#78716c", textTransform: "uppercase", letterSpacing: 0.8 },
  negrita: { fontFamily: "Helvetica-Bold" },
  cabecera: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#1c1917", paddingVertical: 4, marginTop: 10, backgroundColor: "#ffffff" },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e7e5e4", paddingVertical: 4, alignItems: "center" },
  producto: { flex: 1, paddingRight: 6 },
  unidad: { width: 46, color: "#57534e" },
  numero: { width: 54, textAlign: "right", paddingRight: 4 },
  check: { width: 26, alignItems: "center" },
  casilla: { width: 10, height: 10, borderWidth: 1, borderColor: "#57534e" },
  falta: { color: "#b91c1c", fontFamily: "Helvetica-Bold" },
  nota: { fontSize: 7.5, color: "#78716c" },
  pie: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a8a29e" },
});

/** Stock de los productos de un evento: por depósito, total, lo previsto y lo que falta. */
function StockEventoPdf({ d, generado }: { d: DatosStockEvento; generado: string }) {
  const filas = d.lista
    .map((i) => ({ i, s: d.stock.find((x) => x.producto.id === i.producto_id) }))
    .filter((x) => x.s);
  const apaisado = d.depositos.length > 3;
  return (
    <Document title={`Stock - ${d.evento.nombre}`} author={NOMBRE_EMPRESA[d.evento.empresa]}>
      <Page size="A4" orientation={apaisado ? "landscape" : "portrait"} style={e.pagina}>
        <View style={e.encabezado}>
          <View>
            <Text style={e.titulo}>Stock para el evento</Text>
            <Text style={e.grande}>{d.evento.nombre}</Text>
            <Text style={e.chico}>
              {NOMBRE_EMPRESA[d.evento.empresa]} · {formatoFecha(d.evento.fecha)}
              {d.evento.lugar ? ` · ${d.evento.lugar}` : ""}
            </Text>
          </View>
          <View>
            <Text style={[e.titulo, { textAlign: "right" }]}>Stock al</Text>
            <Text style={[e.negrita, { textAlign: "right" }]}>{generado}</Text>
            <Text style={[e.chico, { textAlign: "right" }]}>{filas.length} producto{filas.length === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <View style={e.cabecera} fixed>
          <Text style={[e.producto, e.titulo]}>Producto</Text>
          <Text style={[e.unidad, e.titulo]}>Unidad</Text>
          {d.depositos.map((dep) => (
            <Text key={dep.id} style={[e.numero, e.titulo]}>{dep.nombre}</Text>
          ))}
          <Text style={[e.numero, e.titulo]}>Total</Text>
          <Text style={[e.numero, e.titulo]}>Previsto</Text>
          <Text style={[e.numero, e.titulo]}>Falta</Text>
          <Text style={[e.check, e.titulo]}>OK</Text>
        </View>
        {filas.map(({ i, s }) => {
          const falta = i.cantidad !== null ? r3(Math.max(0, i.cantidad - s!.total)) : 0;
          return (
            <View key={i.producto_id} style={e.fila} wrap={false}>
              <View style={e.producto}>
                <Text>{s!.producto.nombre}</Text>
                {i.nota && <Text style={e.nota}>{i.nota}</Text>}
              </View>
              <Text style={e.unidad}>{s!.producto.unidad}</Text>
              {d.depositos.map((dep) => (
                <Text key={dep.id} style={e.numero}>{formatoCantidad(s!.porDeposito[dep.id] ?? 0)}</Text>
              ))}
              <Text style={[e.numero, e.negrita]}>{formatoCantidad(s!.total)}</Text>
              <Text style={e.numero}>{i.cantidad === null ? "—" : formatoCantidad(i.cantidad)}</Text>
              <Text style={[e.numero, falta > 0 ? e.falta : {}]}>{falta > 0 ? formatoCantidad(falta) : "—"}</Text>
              <View style={e.check}>
                <View style={e.casilla} />
              </View>
            </View>
          );
        })}

        <View style={e.pie} fixed>
          <Text>{NOMBRE_EMPRESA[d.evento.empresa]} · Stock para {d.evento.nombre}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function pdfStockEvento(d: DatosStockEvento) {
  return renderToBuffer(<StockEventoPdf d={d} generado={formatoFechaHora(new Date().toISOString())} />);
}
