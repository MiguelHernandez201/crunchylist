// Edge Function: consulta AniList y escribe PROPUESTAS en public.propuestas. No modifica el catálogo:
// un administrador las acepta o rechaza desde el panel.
//
// Acciones (cuerpo JSON {"accion": ...}):
//   "actualizar"  series con anilist_id → propone próximo episodio (solo el día) o cierre de serie terminada.
//   "vincular"    series sin anilist_id → propone la mejor coincidencia por título (hasta `limite` por llamada).
//   "todo"        las dos anteriores (por defecto).
import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluarCoincidencia, proponer, type MediaAniList } from "./logica.ts";

const URL_ANILIST = "https://graphql.anilist.co";
// Zona en la que se calcula el "día de emisión". Se puede cambiar con el secreto ZONA_HORARIA.
const ZONA = Deno.env.get("ZONA_HORARIA") ?? "America/Bogota";
const CLAVE_SERVICIO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAUSA_ENTRE_BUSQUEDAS_MS = 2200; // AniList limita las peticiones por minuto

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, CLAVE_SERVICIO, { auth: { persistSession: false } });

interface FilaSerie {
  id: string;
  titulo: string;
  anilist_id: number | null;
  data: { total?: number | null; nextEp?: number | null; nextWhen?: string | null };
}

interface Deseada {
  serie_id: string;
  tipo: "episodio" | "finalizada";
  propuesto: Record<string, unknown>;
  actual: Record<string, unknown>;
}

class LimiteDeAniList extends Error {}

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const dormir = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch(URL_ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (r.status === 429) throw new LimiteDeAniList("AniList pidió esperar (límite de peticiones).");
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok || !cuerpo || cuerpo.errors) {
    throw new Error(`AniList respondió ${r.status}: ${JSON.stringify(cuerpo?.errors ?? "")}`.slice(0, 300));
  }
  return cuerpo.data as T;
}

const CAMPOS = "id status episodes format seasonYear title { romaji english native } nextAiringEpisode { episode airingAt }";
const Q_POR_IDS = `query ($ids: [Int], $n: Int) { Page(perPage: $n) { media(id_in: $ids, type: ANIME) { ${CAMPOS} } } }`;
const Q_BUSCAR = `query ($q: String) { Page(perPage: 3) { media(search: $q, type: ANIME, sort: SEARCH_MATCH) { ${CAMPOS} } } }`;

/** Solo pasan el service role (tareas programadas) o un usuario que esté en public.admins. */
async function esAutorizado(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === CLAVE_SERVICIO) return true;
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u.user) return false;
  const { data: a } = await sb.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
  return !!a;
}

/** Deja en la tabla exactamente las propuestas pendientes de estos tipos que hay en `deseadas`. */
async function sincronizar(tipos: string[], deseadas: Deseada[]): Promise<{ nuevas: number; actualizadas: number; retiradas: number }> {
  const { data: existentes, error } = await sb.from("propuestas")
    .select("id,serie_id,tipo,propuesto,actual").eq("estado", "pendiente").in("tipo", tipos);
  if (error) throw error;
  const clave = (serie: string, tipo: string) => `${serie}|${tipo}`;
  const porClave = new Map(existentes.map(e => [clave(e.serie_id, e.tipo), e]));
  const vigentes = new Set(deseadas.map(d => clave(d.serie_id, d.tipo)));
  let nuevas = 0, actualizadas = 0, retiradas = 0;

  const obsoletas = existentes.filter(e => !vigentes.has(clave(e.serie_id, e.tipo))).map(e => e.id);
  if (obsoletas.length) {
    const { error: e } = await sb.from("propuestas").delete().in("id", obsoletas);
    if (e) throw e;
    retiradas = obsoletas.length;
  }
  for (const d of deseadas) {
    const previa = porClave.get(clave(d.serie_id, d.tipo));
    if (!previa) {
      const { error: e } = await sb.from("propuestas").insert(d);
      if (e) throw e;
      nuevas++;
    } else if (JSON.stringify(previa.propuesto) !== JSON.stringify(d.propuesto) || JSON.stringify(previa.actual) !== JSON.stringify(d.actual)) {
      const { error: e } = await sb.from("propuestas").update({ propuesto: d.propuesto, actual: d.actual, creada: new Date().toISOString() }).eq("id", previa.id);
      if (e) throw e;
      actualizadas++;
    }
  }
  return { nuevas, actualizadas, retiradas };
}

async function actualizar(series: FilaSerie[]) {
  const vinculadas = new Map(series.filter(s => s.anilist_id != null).map(s => [s.anilist_id!, s]));
  const ids = [...vinculadas.keys()];
  const deseadas: Deseada[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const d = await anilist<{ Page: { media: MediaAniList[] } }>(Q_POR_IDS, { ids: lote, n: lote.length });
    for (const media of d.Page.media) {
      const s = vinculadas.get(media.id);
      if (!s) continue;
      const actual = { total: s.data.total ?? null, nextEp: s.data.nextEp ?? null, nextWhen: s.data.nextWhen ?? null };
      const p = proponer(actual, media, ZONA);
      if (p) deseadas.push({ serie_id: s.id, tipo: p.tipo, propuesto: p.propuesto as Record<string, unknown>, actual });
    }
  }
  const r = await sincronizar(["episodio", "finalizada"], deseadas);
  return { series_vinculadas: ids.length, propuestas_episodio_o_cierre: deseadas.length, ...r };
}

async function vincular(series: FilaSerie[], limite: number) {
  const { data: previas, error } = await sb.from("propuestas").select("serie_id").eq("tipo", "vincular");
  if (error) throw error;
  const yaProcesadas = new Set(previas.map(p => p.serie_id));
  const usados = new Set(series.filter(s => s.anilist_id != null).map(s => s.anilist_id));
  const sinVincular = series.filter(s => s.anilist_id == null && !yaProcesadas.has(s.id));
  let creadas = 0, sinResultado = 0, hayLimite = false;

  for (const s of sinVincular.slice(0, limite)) {
    try {
      const d = await anilist<{ Page: { media: MediaAniList[] } }>(Q_BUSCAR, { q: s.titulo });
      const media = d.Page.media.find(m => !usados.has(m.id));
      if (!media) {
        // Se anota como rechazada para no volver a buscarla en cada ejecución.
        await sb.from("propuestas").insert({ serie_id: s.id, tipo: "vincular", propuesto: { anilist_id: null, motivo: "sin resultados" }, actual: { anilist_id: null }, estado: "rechazada", resuelta: new Date().toISOString() });
        sinResultado++;
      } else {
        usados.add(media.id);
        const titulo = media.title.english ?? media.title.romaji ?? media.title.native;
        const { error: e } = await sb.from("propuestas").insert({
          serie_id: s.id,
          tipo: "vincular",
          propuesto: { anilist_id: media.id, titulo_anilist: titulo, anio: media.seasonYear ?? null, formato: media.format ?? null, coincidencia: evaluarCoincidencia(s.titulo, media) },
          actual: { anilist_id: null },
        });
        if (e) throw e;
        creadas++;
      }
    } catch (e) {
      if (e instanceof LimiteDeAniList) { hayLimite = true; break; }
      throw e;
    }
    await dormir(PAUSA_ENTRE_BUSQUEDAS_MS);
  }
  return {
    vinculos_propuestos: creadas,
    vinculos_sin_resultado: sinResultado,
    series_sin_vincular_restantes: Math.max(0, sinVincular.length - creadas - sinResultado),
    anilist_pidio_esperar: hayLimite,
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!(await esAutorizado(req))) return json({ error: "No autorizado" }, 403);
    const cuerpo = await req.json().catch(() => ({}));
    const accion = ["vincular", "actualizar", "todo"].includes(cuerpo?.accion) ? cuerpo.accion : "todo";
    const limite = Math.min(Math.max(Number(cuerpo?.limite) || 20, 1), 40);

    const { data: series, error } = await sb.from("series").select("id,titulo,anilist_id,data");
    if (error) throw error;

    const resumen: Record<string, unknown> = { zona_horaria: ZONA };
    if (accion !== "vincular") Object.assign(resumen, await actualizar(series as FilaSerie[]));
    if (accion !== "actualizar") Object.assign(resumen, await vincular(series as FilaSerie[], limite));
    return json(resumen);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
