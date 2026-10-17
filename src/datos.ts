// Acceso a datos: Supabase como fuente de verdad y localStorage como caché para abrir rápido o sin conexión.
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { MapaDescartadas, MapaProgreso, Serie } from "./types";

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const CLAVE_SERIES = "cl_series_v1";
const CLAVE_PROG = "cl_progreso_v1";
const CLAVE_DESC = "cl_descartadas_v1";

interface FilaSerie { id: string; thumb: string | null; data: Omit<Serie, "id" | "thumb"> }
interface FilaProgreso { id: string; vistos: number }
interface FilaDescartada { id: string; descartada: boolean }

function leerLocal<T>(clave: string): T | null {
  try { return JSON.parse(localStorage.getItem(clave) || "null") as T | null; } catch { return null; }
}
function escribirLocal(clave: string, valor: unknown): void {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

export const seriesEnCache = (): Serie[] => leerLocal<Serie[]>(CLAVE_SERIES) || [];
export const progresoEnCache = (): MapaProgreso => leerLocal<MapaProgreso>(CLAVE_PROG) || {};

export const descartadasEnCache = (): MapaDescartadas => leerLocal<MapaDescartadas>(CLAVE_DESC) || {};

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

export async function cargarDescartadas(): Promise<MapaDescartadas> {
  const { data, error } = await sb.from("descartadas").select("id,descartada").returns<FilaDescartada[]>();
  if (error) throw error;
  const mapa: MapaDescartadas = Object.fromEntries(data.map(d => [d.id, d.descartada]));
  escribirLocal(CLAVE_DESC, mapa);
  return mapa;
}

export async function guardarDescartada(id: string, titulo: string, descartada: boolean): Promise<void> {
  const mapa = descartadasEnCache();
  mapa[id] = descartada;
  escribirLocal(CLAVE_DESC, mapa);
  const { error } = await sb.from("descartadas").upsert({ id, titulo, descartada, actualizado: new Date().toISOString() });
  if (error) throw error;
}

export function escucharDescartadas(alCambiar: (id: string, descartada: boolean) => void): RealtimeChannel {
  return sb
    .channel("descartadas")
    .on<FilaDescartada>("postgres_changes", { event: "*", schema: "public", table: "descartadas" }, p => {
      const fila = p.new as Partial<FilaDescartada>;
      if (fila.id != null && typeof fila.descartada === "boolean") alCambiar(fila.id, fila.descartada);
    })
    .subscribe();
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

export type CambiosDatos = Partial<Pick<Serie, "total" | "totalTodas" | "nextEp" | "nextWhen">>;
export type CambiosSerie = CambiosDatos & { anilist_id?: number | null };

export interface Propuesta {
  id: number;
  serie_id: string;
  tipo: "vincular" | "episodio" | "finalizada";
  propuesto: Record<string, unknown>;
  actual: Record<string, unknown>;
  creada: string;
}

export interface ResumenBusqueda { error?: string; [clave: string]: unknown }

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
  const { anilist_id: _vinculo, ...datos } = cambios; // anilist_id es una columna, no va en series.data
  const cache = seriesEnCache();
  const s = cache.find(x => x.id === id);
  if (s) { Object.assign(s, datos); escribirLocal(CLAVE_SERIES, cache); }
}

/** id de la serie → id en AniList. Aparte de cargarSeries para que la lista pública no dependa de esta columna. */
export async function cargarVinculos(): Promise<Record<string, number | null>> {
  const { data, error } = await sb.from("series").select("id,anilist_id").returns<{ id: string; anilist_id: number | null }[]>();
  if (error) throw error;
  return Object.fromEntries(data.map(d => [d.id, d.anilist_id]));
}

export async function cargarPropuestas(): Promise<Propuesta[]> {
  const { data, error } = await sb.from("propuestas")
    .select("id,serie_id,tipo,propuesto,actual,creada").eq("estado", "pendiente").order("creada", { ascending: false })
    .returns<Propuesta[]>();
  if (error) throw error;
  return data;
}

export async function resolverPropuesta(id: number, aceptar: boolean): Promise<void> {
  const { error } = await sb.rpc("admin_resolver_propuesta", { p_id: id, p_aceptar: aceptar });
  if (error) throw error;
}

/** Ejecuta la Edge Function que consulta AniList y escribe propuestas. Puede tardar un minuto. */
export async function buscarActualizaciones(accion: "todo" | "actualizar" | "vincular"): Promise<ResumenBusqueda> {
  const { data, error } = await sb.functions.invoke<ResumenBusqueda>("anilist-propuestas", { body: { accion } });
  if (error) {
    let detalle = error.message;
    try { detalle = (await (error as { context?: Response }).context?.json())?.error ?? detalle; } catch { /* sin cuerpo */ }
    throw new Error(detalle);
  }
  return data ?? {};
}
