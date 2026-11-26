import "server-only";
import { Circle, Document, Font, G, Line, Page, Path, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { NOMBRE_ESTADO_MOVIMIENTO } from "@/lib/financiero/tipos";
import { formatoPesos } from "@/lib/formato";
import { MESES_LARGOS, type Cuadro, type Fila } from "./calculo";

// Sin cortar palabras con guiones ("Septiem-bre").
Font.registerHyphenationCallback((palabra) => [palabra]);

const VERDE = "#15803d";
const ROJO = "#b91c1c";
const GRIS = "#e7e5e4";
const SUAVE = "#78716c";
const OSCURO = "#1c1917";

const e = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 46, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: OSCURO },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  h2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  nota: { fontSize: 7.5, color: SUAVE },
  negrita: { fontFamily: "Helvetica-Bold" },
  tarjetas: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tarjeta: { width: "23.9%", borderWidth: 0.6, borderColor: "#d6d3d1", borderRadius: 4, padding: 6 },
  etiqueta: { fontSize: 6.5, color: SUAVE, textTransform: "uppercase", letterSpacing: 0.4 },
  cifra: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tabla: { borderTopWidth: 1, borderTopColor: OSCURO },
  cab: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: OSCURO, paddingVertical: 3 },
  fila: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: GRIS, paddingVertical: 2.5 },
  total: { flexDirection: "row", borderTopWidth: 1, borderTopColor: OSCURO, paddingVertical: 3 },
  pie: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a8a29e" },
});

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const varTexto = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`);
const colorDe = (n: number) => (n > 0 ? VERDE : n < 0 ? ROJO : SUAVE);
function corto(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",")}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}k`;
  return `${s}$${Math.round(a)}`;
}
function escala(min: number, max: number) {
  const rango = Math.max(max - Math.min(min, 0), 1);
  const bruto = rango / 4;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto) ?? bruto;
  const bajo = Math.min(0, Math.floor(min / paso) * paso);
  const alto = Math.max(paso, Math.ceil(max / paso) * paso);
  const ticks: number[] = [];
  for (let v = bajo; v <= alto + paso / 2; v += paso) ticks.push(v);
  return { bajo, alto, ticks };
}

/** Celdas de una tabla (anchos en %). */
function Celdas({ valores, anchos, estilos }: { valores: (string | number)[]; anchos: number[]; estilos?: (Style | undefined)[] }) {
  return (
    <>
      {valores.map((v, i) => (
        <Text key={i} style={[{ width: `${anchos[i]}%`, textAlign: i ? "right" : "left", paddingRight: 3 }, estilos?.[i] ?? {}]}>{String(v)}</Text>
      ))}
    </>
  );
}

function GraficoMensual({ meses }: { meses: Cuadro["meses"] }) {
  const W = 523;
  const H = 170;
  const izq = 44;
  const abajo = 16;
  const max = Math.max(...meses.flatMap((m) => [m.ingresos, m.egresos]), 1);
  const s = escala(0, max);
  const y = (v: number) => 6 + (H - 6 - abajo) * (1 - (v - s.bajo) / (s.alto - s.bajo));
  const ancho = (W - izq) / 12;
  const b = ancho * 0.32;
  return (
    <Svg width={W} height={H}>
      {s.ticks.map((t) => (
        <G key={t}>
          <Line x1={izq} x2={W} y1={y(t)} y2={y(t)} stroke={GRIS} strokeWidth={0.6} />
          <Text x={izq - 4} y={y(t) + 2.5} style={{ fontSize: 6.5 }} fill={SUAVE} textAnchor="end">{corto(t)}</Text>
        </G>
      ))}
      {meses.map((m, i) => {
        const x = izq + i * ancho + ancho / 2;
        return (
          <G key={m.mes}>
            <Rect x={x - b - 0.7} y={y(m.ingresos)} width={b} height={Math.max(0, y(0) - y(m.ingresos))} fill={VERDE} />
            <Rect x={x + 0.7} y={y(m.egresos)} width={b} height={Math.max(0, y(0) - y(m.egresos))} fill={ROJO} />
            <Text x={x} y={H - 4} style={{ fontSize: 7 }} fill={SUAVE} textAnchor="middle">{m.nombre}</Text>
          </G>
        );
      })}
    </Svg>
  );
}

function GraficoResultado({ meses }: { meses: Cuadro["meses"] }) {
  const W = 523;
  const H = 140;
  const izq = 44;
  const abajo = 16;
  const valores = meses.flatMap((m) => [m.resultado, m.acumulado]);
  const s = escala(Math.min(...valores, 0), Math.max(...valores, 1));
  const y = (v: number) => 6 + (H - 6 - abajo) * (1 - (v - s.bajo) / (s.alto - s.bajo));
  const ancho = (W - izq) / 12;
  const x = (i: number) => izq + i * ancho + ancho / 2;
  return (
    <Svg width={W} height={H}>
      {s.ticks.map((t) => (
        <G key={t}>
          <Line x1={izq} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#a8a29e" : GRIS} strokeWidth={0.6} />
          <Text x={izq - 4} y={y(t) + 2.5} style={{ fontSize: 6.5 }} fill={SUAVE} textAnchor="end">{corto(t)}</Text>
        </G>
      ))}
      {meses.map((m, i) => (
        <G key={m.mes}>
          <Rect x={x(i) - ancho * 0.22} y={Math.min(y(m.resultado), y(0))} width={ancho * 0.44} height={Math.max(0.6, Math.abs(y(m.resultado) - y(0)))} fill={m.resultado >= 0 ? VERDE : ROJO} />
          <Text x={x(i)} y={H - 4} style={{ fontSize: 7 }} fill={SUAVE} textAnchor="middle">{m.nombre}</Text>
        </G>
      ))}
      <Path d={meses.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.acumulado)}`).join(" ")} stroke={OSCURO} strokeWidth={1.2} strokeDasharray="4 2" fill="none" />
      {meses.map((m, i) => <Circle key={m.mes} cx={x(i)} cy={y(m.acumulado)} r={1.8} fill={OSCURO} />)}
    </Svg>
  );
}

/** Barras horizontales (categorías) + tabla, sin cortar filas entre páginas. */
function Categorias({ filas, color, anio, conAnterior }: { filas: Fila[]; color: string; anio: number; conAnterior: boolean }) {
  if (!filas.length) return <Text style={e.nota}>Sin movimientos.</Text>;
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <View>
      {filas.slice(0, 10).map((f) => (
        <View key={f.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2.5 }} wrap={false}>
          <Text style={{ width: "30%", fontSize: 7.5 }}>{f.nombre}</Text>
          <View style={{ width: "48%", height: 7, backgroundColor: "#f5f5f4" }}>
            <View style={{ width: `${Math.max(0.5, (f.total / max) * 100)}%`, height: 7, backgroundColor: color }} />
          </View>
          <Text style={{ width: "22%", fontSize: 7.5, textAlign: "right" }}>{pct(f.pct)}</Text>
        </View>
      ))}
      <View style={[e.tabla, { marginTop: 6 }]}>
        <View style={e.cab}>
          <Celdas valores={["Categoría", "Total", "%", "Mov.", ...(conAnterior ? [String(anio - 1), "Var."] : [])]} anchos={conAnterior ? [34, 20, 10, 8, 18, 10] : [46, 26, 14, 14]} estilos={Array(6).fill(e.negrita)} />
        </View>
        {filas.map((f) => (
          <View key={f.id} style={e.fila} wrap={false}>
            <Celdas
              valores={[f.nombre, formatoPesos(f.total), pct(f.pct), f.cantidad, ...(conAnterior ? [f.anterior === null ? "—" : formatoPesos(f.anterior), varTexto(f.variacion)] : [])]}
              anchos={conAnterior ? [34, 20, 10, 8, 18, 10] : [46, 26, 14, 14]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function Pie({ empresa, anio }: { empresa: Empresa; anio: number }) {
  return (
    <View style={e.pie} fixed>
      <Text>Planix · Informe financiero anual · {NOMBRE_EMPRESA[empresa]} {anio}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function InformeAnual({ c, empresa, emitido, filtros }: { c: Cuadro; empresa: Empresa; emitido: string; filtros: string }) {
  const r = c.resumen;
  const estado = c.estado === "todos" ? "Real + pendiente + proyectado" : NOMBRE_ESTADO_MOVIMIENTO[c.estado];
  const hayAnterior = c.interanual !== null;
  const tarjetas: [string, string, string?][] = [
    ["Ingresos reales", formatoPesos(r.ingresosReal), VERDE],
    ["Egresos reales", formatoPesos(r.egresosReal), ROJO],
    ["Resultado real", formatoPesos(r.resultadoReal), colorDe(r.resultadoReal)],
    ["Margen sobre ingresos", pct(r.margen)],
    ["Pendiente de cobrar", formatoPesos(r.pendienteCobrar)],
    ["Pendiente de pagar", formatoPesos(r.pendientePagar)],
    ["Proyectado (neto, no real)", formatoPesos(r.proyectadoIngresos - r.proyectadoEgresos)],
    ["Mejor / peor mes (real)", r.mejorMes && r.peorMes ? `${MESES_LARGOS[r.mejorMes.mes - 1]} / ${MESES_LARGOS[r.peorMes.mes - 1]}` : "—"],
  ];
  const anchosMes = [24, 19, 19, 19, 19];
  return (
    <Document title={`Informe financiero anual ${c.anio} - ${NOMBRE_EMPRESA[empresa]}`} author="Planix" creator="Planix">
      {/* Portada */}
      <Page size="A4" style={[e.pagina, { justifyContent: "center", alignItems: "center" }]}>
        <Svg width={70} height={70} viewBox="0 0 48 48">
          {[[0, 2], [0, 1], [0, 0], [1, 0], [1, 1]].map(([col, fil], i) => (
            <Rect key={i} x={10 + col * 15.5} y={3.75 + fil * 15.5} width={12.5} height={12.5} rx={col === 1 ? 5 : 3} fill={i === 4 ? "#f59e0b" : OSCURO} />
          ))}
        </Svg>
        <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 6, marginTop: 8 }}>PLANIX</Text>
        <Text style={{ fontSize: 20, marginTop: 40 }}>Informe financiero anual</Text>
        <Text style={{ fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 10 }}>{NOMBRE_EMPRESA[empresa]} · {c.anio}</Text>
        <Text style={{ fontSize: 10, color: SUAVE, marginTop: 14 }}>Emitido el {emitido}</Text>
        <Text style={{ fontSize: 9, color: SUAVE, marginTop: 4 }}>Gráficos y categorías: {estado}{filtros ? ` · ${filtros}` : ""}</Text>
        <Text style={{ fontSize: 8, color: "#a8a29e", marginTop: 40, maxWidth: 360, textAlign: "center" }}>
          Fuente: Financiero de Planix. Lo real es lo ya cobrado y pagado; lo pendiente y lo proyectado se informan por separado y no se suman a lo real.
        </Text>
      </Page>

      {/* Resumen y meses */}
      <Page size="A4" style={e.pagina}>
        <Text style={e.h1}>Resumen ejecutivo</Text>
        <View style={e.tarjetas}>
          {tarjetas.map(([t, v, color]) => (
            <View key={t} style={e.tarjeta}>
              <Text style={e.etiqueta}>{t}</Text>
              <Text style={[e.cifra, color ? { color } : {}, { textTransform: "capitalize" }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={e.h2}>Ingresos y egresos por mes ({estado.toLowerCase()})</Text>
        <Text style={[e.nota, { marginBottom: 3 }]}>Barras verdes: ingresos · barras rojas: egresos</Text>
        <GraficoMensual meses={c.meses} />
        <Text style={e.h2}>Resultado mensual y acumulado</Text>
        <Text style={[e.nota, { marginBottom: 3 }]}>Barras: resultado del mes (verde positivo, rojo negativo) · Línea punteada: acumulado del año</Text>
        <GraficoResultado meses={c.meses} />
        <Pie empresa={empresa} anio={c.anio} />
      </Page>

      <Page size="A4" style={e.pagina}>
        <Text style={e.h1}>Cifras por mes ({estado.toLowerCase()})</Text>
        <View style={e.tabla}>
          <View style={e.cab}><Celdas valores={["Mes", "Ingresos", "Egresos", "Resultado", "Acumulado"]} anchos={anchosMes} estilos={Array(5).fill(e.negrita)} /></View>
          {c.meses.map((m) => (
            <View key={m.mes} style={e.fila} wrap={false}>
              <Celdas valores={[MESES_LARGOS[m.mes - 1], formatoPesos(m.ingresos), formatoPesos(m.egresos), formatoPesos(m.resultado), formatoPesos(m.acumulado)]} anchos={anchosMes} estilos={[{ textTransform: "capitalize" }, undefined, undefined, { color: colorDe(m.resultado) }, { color: colorDe(m.acumulado) }]} />
            </View>
          ))}
          <View style={e.total}>
            <Celdas valores={[`Total ${c.anio}`, formatoPesos(c.totalesElegidos.ingresos), formatoPesos(c.totalesElegidos.egresos), formatoPesos(c.totalesElegidos.resultado), ""]} anchos={anchosMes} estilos={[e.negrita, e.negrita, e.negrita, { ...e.negrita, color: colorDe(c.totalesElegidos.resultado) }]} />
          </View>
        </View>

        <Text style={e.h2}>Comparación con {c.anio - 1}</Text>
        {c.interanual ? (
          <View style={e.tabla}>
            <Text style={[e.nota, { marginVertical: 3 }]}>Mismo período: enero a {MESES_LARGOS[c.interanual.hastaMes - 1]} de cada año.</Text>
            <View style={e.cab}><Celdas valores={["", String(c.anio), String(c.anio - 1), "Variación"]} anchos={[28, 24, 24, 24]} estilos={Array(4).fill(e.negrita)} /></View>
            {(["ingresos", "egresos", "resultado"] as const).map((k) => (
              <View key={k} style={e.fila}>
                <Celdas valores={[k[0].toUpperCase() + k.slice(1), formatoPesos(c.interanual!.actual[k]), formatoPesos(c.interanual!.anterior[k]), varTexto(c.interanual!.variacion[k])]} anchos={[28, 24, 24, 24]} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={e.nota}>No hay movimientos de {c.anio - 1} para comparar.</Text>
        )}

        {c.mesesMayorGasto.length > 0 && (
          <>
            <Text style={e.h2}>Meses con más gastos</Text>
            {c.mesesMayorGasto.map((m) => <Text key={m.mes} style={{ textTransform: "capitalize", marginBottom: 1.5 }}>{MESES_LARGOS[m.mes - 1]}: {formatoPesos(m.egresos)}</Text>)}
            {c.subas.length > 0 && <Text style={[e.nota, { marginTop: 3 }]}>Mayores subas contra el mes anterior: {c.subas.map((s) => `${s.desde} → ${s.nombre} +${formatoPesos(s.diferencia)}`).join(" · ")}</Text>}
          </>
        )}
        <Pie empresa={empresa} anio={c.anio} />
      </Page>

      {/* Categorías */}
      <Page size="A4" style={e.pagina}>
        <Text style={e.h1}>Ingresos por categoría ({estado.toLowerCase()})</Text>
        <Categorias filas={c.ingresosCategoria} color={VERDE} anio={c.anio} conAnterior={hayAnterior} />
        <Text style={[e.h1, { marginTop: 18 }]} break={c.ingresosCategoria.length > 14}>Gastos por categoría ({estado.toLowerCase()})</Text>
        <Categorias filas={c.egresosCategoria} color={ROJO} anio={c.anio} conAnterior={hayAnterior} />
        <Pie empresa={empresa} anio={c.anio} />
      </Page>

      {/* Pendientes, sin fecha, eventos y metodología */}
      <Page size="A4" style={e.pagina}>
        <Text style={e.h1}>Pendientes</Text>
        <Text style={e.nota}>Comprometidos pero todavía no cobrados o pagados: no forman parte del resultado real.</Text>
        <Text style={e.h2}>Por cobrar · {formatoPesos(r.pendienteCobrar)}</Text>
        <Categorias filas={c.pendientesCobrar} color="#0369a1" anio={c.anio} conAnterior={false} />
        <Text style={e.h2}>Por pagar · {formatoPesos(r.pendientePagar)}</Text>
        <Categorias filas={c.pendientesPagar} color="#b45309" anio={c.anio} conAnterior={false} />

        <Text style={[e.h1, { marginTop: 18 }]} break>Gastos sin fecha</Text>
        <Text style={e.nota}>Egresos cargados sin fecha: no integran los meses ni el total del año hasta que se les asigne una fecha.</Text>
        {c.sinFecha.cantidad === 0 ? (
          <Text style={{ marginTop: 6 }}>$ 0,00 · Sin pendientes</Text>
        ) : (
          <>
            <Text style={{ marginVertical: 6 }}>
              <Text style={e.negrita}>{c.sinFecha.cantidad}</Text> egresos sin fecha por <Text style={e.negrita}>{formatoPesos(c.sinFecha.total)}</Text>
            </Text>
            <Categorias filas={c.sinFecha.categorias} color="#b45309" anio={c.anio} conAnterior={false} />
          </>
        )}

        {c.eventos.length > 0 && (
          <>
            <Text style={e.h2}>Resultados por evento ({estado.toLowerCase()})</Text>
            <View style={e.tabla}>
              <View style={e.cab}><Celdas valores={["Evento", "Ingresos", "Egresos", "Resultado"]} anchos={[40, 20, 20, 20]} estilos={Array(4).fill(e.negrita)} /></View>
              {c.eventos.map((v) => (
                <View key={v.id} style={e.fila} wrap={false}>
                  <Celdas valores={[v.nombre, formatoPesos(v.ingresos), formatoPesos(v.egresos), formatoPesos(v.resultado)]} anchos={[40, 20, 20, 20]} estilos={[undefined, undefined, undefined, { color: colorDe(v.resultado) }]} />
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={e.h2}>Cómo se calcula</Text>
        <Text style={[e.nota, { fontSize: 8, lineHeight: 1.4 }]}>
          Todo sale de los movimientos de Financiero de {NOMBRE_EMPRESA[empresa]} con fecha en {c.anio} (los eliminados no cuentan). Resultado real = ingresos reales − egresos reales. Lo pendiente y lo proyectado se informan por separado. Los gráficos, las categorías y la tabla mensual usan el estado elegido ({estado.toLowerCase()}). Los porcentajes de cada categoría son sobre el total de su tipo. La comparación con {c.anio - 1} usa el mismo período de cada año. Este informe no modifica datos.
        </Text>
        <Text style={[e.nota, { marginTop: 4 }]}>Emitido el {emitido}</Text>
        <Pie empresa={empresa} anio={c.anio} />
      </Page>
    </Document>
  );
}

export function pdfCuadroAnual(c: Cuadro, empresa: Empresa, emitido: string, filtros: string) {
  return renderToBuffer(<InformeAnual c={c} empresa={empresa} emitido={emitido} filtros={filtros} />);
}
