import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatoFecha } from "@/lib/formato";
import { NOMBRE_CLIENTE } from "@/lib/cliente";
import { colorSuave, nombreCompleto, type Puesto } from "./tipos";
import type { Convocado } from "./consultas";

type Datos = { evento: { nombre: string; fecha: string; lugar: string | null }; convocados: Convocado[]; puestos: Puesto[] };

const SIN_PUESTO = { id: "", nombre: "Sin puesto", color: "#a8a29e", orden: 9999 };

const e = StyleSheet.create({
  pagina: { padding: 32, paddingBottom: 44, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: "#1c1917", paddingBottom: 8 },
  empresa: { fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 },
  evento: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  chico: { fontSize: 9, color: "#57534e" },
  total: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  resumen: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginBottom: 4 },
  ficha: { flexDirection: "row", alignItems: "center", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },
  punto: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  banda: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8, marginTop: 14, borderRadius: 3 },
  bandaTexto: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  bandaCuenta: { color: "#ffffff", fontSize: 9 },
  fila: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#e7e5e4" },
  numero: { width: 22, color: "#78716c" },
  nombre: { flex: 1, fontFamily: "Helvetica-Bold" },
  dni: { width: 80, fontFamily: "Courier" },
  telefono: { width: 100 },
  presente: { width: 46, alignItems: "center" },
  casilla: { width: 9, height: 9, borderWidth: 0.8, borderColor: "#57534e" },
  titulos: { fontSize: 7, color: "#78716c", textTransform: "uppercase", letterSpacing: 0.5 },
  pie: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a8a29e" },
});

function PuestosPdf({ evento, convocados, puestos }: Datos) {
  const grupos = [...puestos, SIN_PUESTO]
    .map((p) => ({ puesto: p, gente: convocados.filter((c) => (c.puesto_id ?? "") === p.id) }))
    .filter((g) => g.gente.length > 0);
  const empresa = process.env.EMISOR_NOMBRE_FANTASIA ?? NOMBRE_CLIENTE;

  return (
    <Document title={`Personal por puestos - ${evento.nombre}`} author={empresa}>
      <Page size="A4" style={e.pagina}>
        <View style={e.encabezado}>
          <View>
            <Text style={e.empresa}>{empresa} · Personal por puestos</Text>
            <Text style={e.evento}>{evento.nombre}</Text>
            <Text style={e.chico}>
              {formatoFecha(evento.fecha)}
              {evento.lugar ? ` · ${evento.lugar}` : ""}
            </Text>
          </View>
          <View>
            <Text style={e.total}>{convocados.length}</Text>
            <Text style={[e.chico, { textAlign: "right" }]}>{convocados.length === 1 ? "persona" : "personas"}</Text>
          </View>
        </View>

        <View style={e.resumen}>
          {grupos.map(({ puesto, gente }) => (
            <View key={puesto.id || "sin"} style={[e.ficha, { backgroundColor: colorSuave(puesto.color) }]}>
              <View style={[e.punto, { backgroundColor: puesto.color }]} />
              <Text style={{ fontSize: 8 }}>
                {puesto.nombre}: {gente.length}
              </Text>
            </View>
          ))}
        </View>

        {grupos.map(({ puesto, gente }) => (
          <View key={puesto.id || "sin"}>
            {/* La banda del puesto nunca queda sola al final de una hoja. */}
            <View style={[e.banda, { backgroundColor: puesto.color }]} wrap={false} minPresenceAhead={40}>
              <Text style={e.bandaTexto}>{puesto.nombre}</Text>
              <Text style={e.bandaCuenta}>
                {gente.length} {gente.length === 1 ? "persona" : "personas"}
              </Text>
            </View>
            <View style={[e.fila, { borderBottomColor: puesto.color }]}>
              <Text style={[e.numero, e.titulos]}>#</Text>
              <Text style={[e.nombre, e.titulos]}>Apellido y nombre</Text>
              <Text style={[e.dni, e.titulos]}>DNI</Text>
              <Text style={[e.telefono, e.titulos]}>Teléfono</Text>
              <Text style={[e.presente, e.titulos]}>Presente</Text>
            </View>
            {gente.map((c, i) => (
              <View key={c.id} style={[e.fila, { backgroundColor: i % 2 ? "#ffffff" : colorSuave(puesto.color, 0.92) }]} wrap={false}>
                <Text style={e.numero}>{i + 1}</Text>
                <Text style={e.nombre}>{nombreCompleto(c.persona)}</Text>
                <Text style={e.dni}>{c.persona.dni}</Text>
                <Text style={e.telefono}>{c.persona.telefono ?? ""}</Text>
                <View style={e.presente}>
                  <View style={e.casilla} />
                </View>
              </View>
            ))}
          </View>
        ))}

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

/** El personal del evento agrupado por puesto, cada puesto con su color. */
export function pdfPuestos(datos: Datos) {
  return renderToBuffer(<PuestosPdf {...datos} />);
}
