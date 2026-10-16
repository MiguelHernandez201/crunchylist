// Acceso a datos: Supabase como fuente de verdad y localStorage como caché para abrir rápido o sin conexión.
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { MapaProgreso, Serie } from "./types";

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

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

// --- Administración (requiere sesión de un usuario listado en public.admins) ---

export type CambiosSerie = Partial<Pick<Serie, "total" | "totalTodas" | "nextEp" | "nextWhen">>;

export type RolSesion = "admin" | "sin-permiso" | "sin-sesion";

export async function rolDeSesion(): Promise<RolSesion> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return "sin-sesion";
  const { data, error } = await sb.from("admins").select("user_id").maybeSingle();
  if (error) throw error;
  return data ? "admin" : "sin-permiso";
}

export async function iniciarSesion(email: string, password: string): Promise<void> {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion(): Promise<void> {
  await sb.auth.signOut();
}

export async function actualizarSerieAdmin(id: string, cambios: CambiosSerie): Promise<void> {
  const { error } = await sb.rpc("admin_actualizar_serie", { p_id: id, p_cambios: cambios });
  if (error) throw error;
  const cache = seriesEnCache();
  const s = cache.find(x => x.id === id);
  if (s) { Object.assign(s, cambios); escribirLocal(CLAVE_SERIES, cache); }
}
