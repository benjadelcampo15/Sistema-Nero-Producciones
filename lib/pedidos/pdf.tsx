import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { describirPromo, totalPedido, type Pedido } from "./tipos";

const e = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  encabezado: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1c1917", paddingBottom: 10 },
  empresa: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  chico: { fontSize: 8, color: "#57534e" },
  titulo: { fontSize: 8, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 },
  numero: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right" },
  datos: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d6d3d1", paddingVertical: 10 },
  columna: { flex: 1 },
  negrita: { fontFamily: "Helvetica-Bold" },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e7e5e4", paddingVertical: 5 },
  cabecera: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#1c1917", paddingVertical: 5, marginTop: 12 },
  producto: { flex: 1, paddingRight: 6 },
  cantidad: { width: 70, textAlign: "right", paddingRight: 6 },
  unidad: { width: 55 },
  precio: { width: 75, textAlign: "right" },
  subtotal: { width: 80, textAlign: "right" },
  extra: { fontSize: 8, color: "#57534e" },
  promo: { fontSize: 8, color: "#b45309", fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: "#1c1917", paddingVertical: 6, marginTop: 2 },
  notas: { marginTop: 14, borderWidth: 0.5, borderColor: "#a8a29e", padding: 8 },
});

function NotaPedidoPdf({ p }: { p: Pedido }) {
  const empresa = process.env.EMISOR_NOMBRE_FANTASIA ?? "Nero Producciones";
  const razonSocial = process.env.EMISOR_RAZON_SOCIAL ?? "IDEAS CON DESTINO SRL";
  const domicilio = process.env.EMISOR_DOMICILIO ?? null;
  const conPrecios = p.items.some((i) => i.precio_unitario !== null);
  const regalos = p.items.reduce((t, i) => t + i.bonificadas, 0);

  return (
    <Document title={`Pedido ${p.numero} - ${empresa}`} author={empresa}>
      <Page size="A4" style={e.pagina}>
        <View style={e.encabezado}>
          <View>
            <Text style={e.empresa}>{empresa}</Text>
            <Text style={e.chico}>{razonSocial}</Text>
            {domicilio && <Text style={e.chico}>{domicilio}</Text>}
          </View>
          <View>
            <Text style={[e.titulo, { textAlign: "right" }]}>Nota de pedido</Text>
            <Text style={e.numero}>N° {String(p.numero).padStart(5, "0")}</Text>
            <Text style={[e.chico, { textAlign: "right" }]}>Fecha: {formatoFecha(p.fecha)}</Text>
          </View>
        </View>

        <View style={e.datos}>
          <View style={e.columna}>
            <Text style={e.titulo}>Para</Text>
            <Text style={e.negrita}>{p.proveedor.razon_social}</Text>
            {p.proveedor.contacto && <Text>{p.proveedor.contacto}</Text>}
          </View>
          <View style={e.columna}>
            <Text style={e.titulo}>Entrega</Text>
            <Text style={e.negrita}>{p.deposito.nombre}</Text>
            {p.fecha_entrega && <Text>Fecha: {formatoFecha(p.fecha_entrega)}</Text>}
          </View>
        </View>

        <View style={e.cabecera} fixed>
          <Text style={[e.producto, e.titulo]}>Producto</Text>
          <Text style={[e.cantidad, e.titulo]}>Cantidad</Text>
          <Text style={[e.unidad, e.titulo]}>Unidad</Text>
          {conPrecios && <Text style={[e.precio, e.titulo]}>Precio unit.</Text>}
          {conPrecios && <Text style={[e.subtotal, e.titulo]}>Subtotal</Text>}
        </View>
        {p.items.map((i) => (
          <View key={i.producto.id} style={e.fila} wrap={false}>
            <View style={e.producto}>
              <Text>{i.producto.nombre}</Text>
              {i.promo && <Text style={e.promo}>Promo {describirPromo(i.promo)}</Text>}
              {i.aclaracion && <Text style={e.extra}>{i.aclaracion}</Text>}
            </View>
            <View style={e.cantidad}>
              <Text style={e.negrita}>{formatoCantidad(i.cantidad)}</Text>
              {i.bonificadas > 0 && <Text style={e.extra}>+{formatoCantidad(i.bonificadas)} de regalo</Text>}
            </View>
            <Text style={[e.unidad, { color: "#57534e" }]}>{i.producto.unidad}</Text>
            {conPrecios && <Text style={e.precio}>{i.precio_unitario !== null ? formatoPesos(i.precio_unitario) : "—"}</Text>}
            {conPrecios && <Text style={e.subtotal}>{i.precio_unitario !== null ? formatoPesos(i.precio_unitario * i.cantidad) : "—"}</Text>}
          </View>
        ))}
        <View style={e.total}>
          <View style={e.producto}>
            <Text style={e.negrita}>
              {p.items.length} {p.items.length === 1 ? "producto" : "productos"}
            </Text>
            {regalos > 0 && <Text style={e.extra}>+{formatoCantidad(regalos)} unidades de regalo por promo</Text>}
          </View>
          {conPrecios && <Text style={[e.subtotal, e.negrita]}>{formatoPesos(totalPedido(p.items))}</Text>}
        </View>

        {p.notas && (
          <View style={e.notas}>
            <Text style={e.titulo}>Notas</Text>
            <Text>{p.notas}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

/** El pedido como archivo PDF (para mandarlo por WhatsApp o bajarlo). */
export function pdfPedido(p: Pedido) {
  return renderToBuffer(<NotaPedidoPdf p={p} />);
}

/** Nombre del archivo: "Pedido 6 - Nero Producciones.pdf". */
export const nombrePdfPedido = (p: Pick<Pedido, "numero">) => `Pedido ${p.numero} - ${process.env.EMISOR_NOMBRE_FANTASIA ?? "Nero Producciones"}.pdf`;
