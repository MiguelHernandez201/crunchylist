// Conversión entre el texto de series.data.nextWhen ("dom 18 oct") y el valor de <input type="date">.
// El catálogo antiguo trae también la hora ("dom 18 oct, 10:00"): al leer se ignora, solo cuenta el día.
import { TEMPORADA } from "./config";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dos = (n: number): string => String(n).padStart(2, "0");

/** "dom 18 oct" o "dom 18 oct, 10:00" → "2026-10-18" (el año sale de la temporada en curso). Vacío si no se entiende. */
export function textoAFecha(texto: string | null): string {
  const m = (texto ?? "").trim().toLowerCase().match(/^(?:\S+\s+)?(\d{1,2})\s+(\S+?)\.?(?:,\s*\d{1,2}:\d{2})?$/);
  if (!m) return "";
  const mes = MESES.indexOf(m[2]);
  if (mes < 0) return "";
  return `${TEMPORADA.anio}-${dos(mes + 1)}-${dos(Number(m[1]))}`;
}

/** "2026-10-18" → "dom 18 oct" (mismo formato que ya usa el catálogo). null si está vacío o es inválido. */
export function fechaATexto(valor: string): string | null {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[dow]} ${dia} ${MESES[mes - 1]}`;
}
