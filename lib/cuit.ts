/** Valida un CUIT/CUIL con su dígito verificador. */
export function cuitValido(cuit: string) {
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((t, p, i) => t + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(cuit[10]);
}

/** 30715376098 → 30-71537609-8 */
export function formatoDocumento(docTipo: number, docNro: string) {
  if (docTipo === 99) return "Consumidor final";
  const d = docNro.replace(/\D/g, "");
  if (docTipo === 80 && d.length === 11) return `CUIT ${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  return `${docTipo === 80 ? "CUIT" : "DNI"} ${d}`;
}
