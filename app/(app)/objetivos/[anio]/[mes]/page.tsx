import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { mesesDelAnio } from "@/lib/objetivos/consultas";
import { MESES, MES_VACIO, calcularMes } from "@/lib/objetivos/tipos";
import { SinAcceso } from "../../../sin-acceso";
import { EditorMes } from "./editor-mes";
import { MesRuta } from "./mes-ruta";
import { EtiquetaEmpresa } from "@/components/empresa";
import { leerEmpresa } from "@/lib/empresas";

export default async function PaginaMesObjetivos({ params, searchParams }: PageProps<"/objetivos/[anio]/[mes]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "objetivos", "ver")) return <SinAcceso />;

  const { anio: a, mes: m } = await params;
  const empresa = leerEmpresa((await searchParams).empresa);
  const anio = Number(a);
  const mes = Number(m);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound();
  if (empresa === "ruta") return <MesRuta anio={anio} mes={mes} editable={puede(usuario, "objetivos", "editar")} />;

  const meses = await mesesDelAnio(empresa, anio);
  // Rentabilidad acumulada del año hasta el mes anterior (la del mes se suma en pantalla).
  let acumuladoAnterior = 0;
  for (let i = 1; i < mes; i++) {
    const d = meses.get(i);
    if (d) acumuladoAnterior += calcularMes(d).final;
  }
  // Para "Copiar del mes anterior" (diciembre del año anterior no se busca).
  const anterior = mes > 1 ? (meses.get(mes - 1) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/objetivos?empresa=${empresa}&anio=${anio}`} className="text-sm text-stone-500 hover:text-stone-900">← Objetivos {anio}</Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">{MESES[mes - 1]} {anio} <EtiquetaEmpresa empresa={empresa} /></h1>
        </div>
        <div className="flex gap-2 text-sm">
          {mes > 1 && <Link href={`/objetivos/${anio}/${mes - 1}?empresa=${empresa}`} className="boton-secundario">← {MESES[mes - 2]}</Link>}
          {mes < 12 && <Link href={`/objetivos/${anio}/${mes + 1}?empresa=${empresa}`} className="boton-secundario">{MESES[mes]} →</Link>}
        </div>
      </div>
      <EditorMes
        key={`${empresa}-${anio}-${mes}`}
        empresa={empresa}
        anio={anio}
        mes={mes}
        inicial={meses.get(mes) ?? MES_VACIO}
        anterior={anterior}
        acumuladoAnterior={acumuladoAnterior}
        editable={puede(usuario, "objetivos", "editar")}
      />
    </div>
  );
}
