// Alertas de calidad del catálogo: datos que faltan o que ya se quedaron viejos.
import { textoACalendario } from "./fechas";
import type { Serie } from "./types";

export type CodigoAlerta = "sin-total" | "vencido" | "sin-verificar" | "doblaje" | "incoherente";

export const ALERTAS: Record<CodigoAlerta, { corto: string; largo: string }> = {
  "sin-total": { corto: "Sin total", largo: "No se sabe cuántos episodios tiene" },
  "vencido": { corto: "Próximo vencido", largo: "La fecha del próximo episodio ya pasó: hay que avanzarla" },
  "sin-verificar": { corto: "Temporada sin verificar", largo: "La temporada sale del artículo, falta confirmarla con la fecha de emisión" },
  "doblaje": { corto: "Doblaje sin confirmar", largo: "No se sabe si tiene audio en español" },
  "incoherente": { corto: "Totales incoherentes", largo: "El total de todas las temporadas es menor que el de la temporada" },
};

/** Alertas que tiene una serie en el instante `ahora`. */
export function alertasDe(s: Serie, ahora: Date = new Date()): CodigoAlerta[] {
  const out: CodigoAlerta[] = [];
  if (!s.total && !s.totalTodas) out.push("sin-total");
  if (s.total && s.totalTodas && s.totalTodas < s.total) out.push("incoherente");
  const cuando = textoACalendario(s.nextWhen);
  if (cuando && new Date(cuando) < ahora) out.push("vencido");
  if (s.fuenteTemp === "articulo") out.push("sin-verificar");
  if (s.audioES == null) out.push("doblaje");
  return out;
}
