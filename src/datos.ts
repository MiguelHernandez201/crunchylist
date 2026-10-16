// Acceso a datos: Supabase como fuente de verdad y localStorage como caché para abrir rápido o sin conexión.
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { MapaProgreso, Serie } from "./types";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const CLAVE_SERIES = "cl_series_v1";
const CLAVE_PROG = "cl_progreso_v1";

interface FilaSerie { id: string; thumb: string | null; data: Omit<Serie, "id" | "thumb"> }
interface FilaProgreso { id: string; vistos: number }

function leerLocal<T>(clave: string): T | null {
  try { return JSON.parse(localStorage.getItem(clave) || "null") as T | null; } catch { return null; }
}
function escribirLocal(clave: string, valor: unknown): void {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

export const seriesEnCache = (): Serie[] => leerLocal<Serie[]>(CLAVE_SERIES) || [];
export const progresoEnCache = (): MapaProgreso => leerLocal<MapaProgreso>(CLAVE_PROG) || {};

export async function cargarSeries(): Promise<Serie[]> {
  const { data, error } = await sb.from("series").select("id,thumb,data").returns<FilaSerie[]>();
  if (error) throw error;
  const series = data
    .map(r => ({ ...r.data, id: r.id, thumb: r.thumb ?? "" }))
    .sort((a, b) => (a.addedPos ?? 9999) - (b.addedPos ?? 9999));
  escribirLocal(CLAVE_SERIES, series);
  return series;
}

export async function cargarProgreso(): Promise<MapaProgreso> {
  const { data, error } = await sb.from("progreso").select("id,vistos").returns<FilaProgreso[]>();
  if (error) throw error;
  const mapa: MapaProgreso = Object.fromEntries(data.map(d => [d.id, d.vistos]));
  escribirLocal(CLAVE_PROG, mapa);
  return mapa;
}

export async function guardarProgreso(id: string, titulo: string, vistos: number): Promise<void> {
  const mapa = progresoEnCache();
  mapa[id] = vistos;
  escribirLocal(CLAVE_PROG, mapa);
  const { error } = await sb.from("progreso").upsert({ id, titulo, vistos, actualizado: new Date().toISOString() });
  if (error) throw error;
}

export function escucharProgreso(alCambiar: (id: string, vistos: number) => void): RealtimeChannel {
  return sb
    .channel("progreso")
    .on<FilaProgreso>("postgres_changes", { event: "*", schema: "public", table: "progreso" }, p => {
      const fila = p.new as Partial<FilaProgreso>;
      if (fila.id != null && typeof fila.vistos === "number") alCambiar(fila.id, fila.vistos);
    })
    .subscribe();
}
