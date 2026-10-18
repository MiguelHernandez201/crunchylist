// Fechas del catálogo convertidas a eventos de calendario y cuadrícula mensual. Sin DOM.
import { anioDeMes, fechaATexto, mesDeNombre, textoAFecha } from "./fechas";
import type { Serie } from "./types";

export type TipoEvento = "estreno" | "episodio";

export interface Evento {
  fecha: string; // YYYY-MM-DD
  tipo: TipoEvento;
  serie: Serie;
}

export interface Celda {
  fecha: string;
  dia: number;
  enMes: boolean;
}

const dos = (n: number): string => String(n).padStart(2, "0");
const iso = (d: Date): string => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;

/** "4 de octubre" → "2026-10-04". Vacío si no se entiende. */
export function fechaDeEstreno(texto: string | null): string {
  const m = (texto ?? "").trim().toLowerCase().match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)/);
  if (!m) return "";
  const mes = mesDeNombre(m[2]);
  const dia = Number(m[1]);
  if (!mes || dia < 1 || dia > 31) return "";
  return `${anioDeMes(mes)}-${dos(mes)}-${dos(dia)}`;
}

/** Estrenos (series.estreno) y próximos episodios (series.nextWhen) con fecha reconocible. */
export function eventosDe(series: Serie[]): Evento[] {
  const eventos: Evento[] = [];
  for (const serie of series) {
    const estreno = fechaDeEstreno(serie.estreno);
    if (estreno) eventos.push({ fecha: estreno, tipo: "estreno", serie });
    const proximo = textoAFecha(serie.nextWhen);
    if (proximo) eventos.push({ fecha: proximo, tipo: "episodio", serie });
  }
  return eventos;
}

/** Celdas del mes (mes 1-12) con semanas completas de lunes a domingo. */
export function celdasDelMes(anio: number, mes: number): Celda[] {
  const primero = Date.UTC(anio, mes - 1, 1);
  const desfase = (new Date(primero).getUTCDay() + 6) % 7; // lunes = 0
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const total = Math.ceil((desfase + diasDelMes) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(primero + (i - desfase) * 86_400_000);
    return { fecha: iso(d), dia: d.getUTCDate(), enMes: d.getUTCMonth() === mes - 1 };
  });
}

/** Hoy en la hora local del dispositivo, como YYYY-MM-DD. */
export function fechaHoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const formato = (opciones: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es", { ...opciones, timeZone: "UTC" });
const FMT_MES = formato({ month: "long", year: "numeric" });
const FMT_DIA = formato({ weekday: "long", day: "numeric", month: "long" });
const mayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

export const tituloDelMes = (anio: number, mes: number): string => mayuscula(FMT_MES.format(new Date(Date.UTC(anio, mes - 1, 1))));
export const tituloDelDia = (fecha: string): string => mayuscula(FMT_DIA.format(new Date(`${fecha}T00:00:00Z`)));
/** "jue 15 oct", igual que el texto del catálogo. */
export const diaCorto = (fecha: string): string => fechaATexto(fecha) ?? fecha;
