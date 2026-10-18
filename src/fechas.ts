// Conversión entre el texto de series.data.nextWhen ("dom 18 oct") y el valor de <input type="date">.
// El catálogo antiguo trae también la hora ("dom 18 oct, 10:00"): al leer se ignora, solo cuenta el día.
import { TEMPORADA } from "./config";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dos = (n: number): string => String(n).padStart(2, "0");

/** "octubre", "oct", "sept." → 10. 0 si no se entiende. */
export function mesDeNombre(texto: string): number {
  const n = texto.trim().toLowerCase().replace(/\.$/, "");
  if (n === "set" || n === "setiembre") return 9;
  if (n.length < 3) return 0;
  return NOMBRES_MES.findIndex(m => m.startsWith(n)) + 1;
}

// Mes en que empieza la temporada en curso ("4 de octubre de 2026" → 10).
const MES_INICIO_TEMPORADA = mesDeNombre(TEMPORADA.desde.split(" de ")[1] ?? "") || 1;

/** Año de una fecha guardada sin año: el de la temporada, salvo que caiga más de 6 meses antes o después de su inicio. */
export function anioDeMes(mes: number): number {
  if (mes + 6 < MES_INICIO_TEMPORADA) return TEMPORADA.anio + 1;
  if (mes - MES_INICIO_TEMPORADA > 6) return TEMPORADA.anio - 1;
  return TEMPORADA.anio;
}

/** "dom 18 oct" o "dom 18 oct, 10:00" → "2026-10-18" (el año sale de la temporada en curso). Vacío si no se entiende. */
export function textoAFecha(texto: string | null): string {
  const m = (texto ?? "").trim().toLowerCase().match(/^(?:\S+\s+)?(\d{1,2})\s+(\S+?)\.?(?:,\s*\d{1,2}:\d{2})?$/);
  if (!m) return "";
  const mes = MESES.indexOf(m[2]);
  if (mes < 0) return "";
  return `${anioDeMes(mes + 1)}-${dos(mes + 1)}-${dos(Number(m[1]))}`;
}

/** "2026-10-18" → "dom 18 oct" (mismo formato que ya usa el catálogo). null si está vacío o es inválido. */
export function fechaATexto(valor: string): string | null {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[dow]} ${dia} ${MESES[mes - 1]}`;
}
