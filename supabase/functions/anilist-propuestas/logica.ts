// Lógica pura (sin APIs de Deno) que convierte datos de AniList en propuestas sobre el catálogo.

export interface MediaAniList {
  id: number;
  status: "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS" | null;
  episodes: number | null;
  format?: string | null;
  seasonYear?: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

export interface Relacion {
  relationType: string;
  node: { id: number; type: string | null; format: string | null };
}

export interface MediaConRelaciones extends MediaAniList {
  relations?: { edges: Relacion[] } | null;
}

export interface DatosSerie {
  total: number | null;
  nextEp: number | null;
  nextWhen: string | null;
}

export interface Cambios {
  total?: number;
  nextEp?: number | null;
  nextWhen?: string | null;
}

export interface PropuestaCalculada {
  tipo: "episodio" | "finalizada";
  propuesto: Cambios;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Día de emisión en la zona horaria indicada, con el mismo formato del catálogo: "jue 22 oct". Sin hora. */
export function diaDeEmision(airingAt: number, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(new Date(airingAt * 1000));
  const valor = (tipo: string): number => Number(partes.find(p => p.type === tipo)!.value);
  const anio = valor("year"), mes = valor("month"), dia = valor("day");
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[semana]} ${dia} ${MESES[mes - 1]}`;
}

// El catálogo antiguo guarda "dom 18 oct, 10:00": solo cuenta el día.
const soloDia = (texto: string | null): string => (texto ?? "").split(",")[0].trim();

// AniList registra cada temporada como un anime aparte, unido a la siguiente por una relación SEQUEL.
// Crunchyroll agrupa todas las temporadas en una sola serie, así que hay que seguir esa cadena.
const FORMATOS_TEMPORADA = new Set(["TV", "TV_SHORT", "ONA"]);
const FORMATOS_IGNORADOS = new Set(["MOVIE", "MUSIC"]);
const MAX_SALTOS = 15;

/** Id de la secuela de un anime. Prefiere temporadas de TV/ONA; atraviesa OVAs y especiales; ignora películas. */
export function secuela(media: MediaConRelaciones): number | null {
  const edges = (media.relations?.edges ?? []).filter(e =>
    e.relationType === "SEQUEL" && e.node.type === "ANIME" && !FORMATOS_IGNORADOS.has(e.node.format ?? ""));
  const elegida = edges.find(e => FORMATOS_TEMPORADA.has(e.node.format ?? "")) ?? edges[0];
  return elegida ? elegida.node.id : null;
}

const yaEmite = (m: MediaAniList): boolean => m.status !== "NOT_YET_RELEASED" || m.nextAiringEpisode != null;

/**
 * Para cada id vinculado devuelve la temporada vigente: la última temporada de TV/ONA de su cadena de secuelas
 * que ya empezó a emitirse. La cadena se corta en un id que esté vinculado a otra serie del catálogo.
 * `traer` consulta AniList por lotes de ids.
 */
export async function temporadasVigentes(
  ids: number[],
  traer: (ids: number[]) => Promise<MediaConRelaciones[]>,
): Promise<Map<number, MediaConRelaciones>> {
  const cache = new Map<number, MediaConRelaciones>();
  const cargar = async (faltan: number[]) => {
    const nuevos = [...new Set(faltan)].filter(id => !cache.has(id));
    for (let i = 0; i < nuevos.length; i += 50) {
      for (const m of await traer(nuevos.slice(i, i + 50))) cache.set(m.id, m);
    }
  };
  const vinculados = new Set(ids);
  const cadenas = new Map(ids.map(id => [id, [id]]));
  await cargar(ids);

  let abiertas = [...ids];
  for (let salto = 0; salto < MAX_SALTOS && abiertas.length; salto++) {
    const siguientes = new Map<number, number>();
    for (const origen of abiertas) {
      const cadena = cadenas.get(origen)!;
      const m = cache.get(cadena[cadena.length - 1]);
      const s = m ? secuela(m) : null;
      if (s != null && !cadena.includes(s) && !vinculados.has(s)) siguientes.set(origen, s);
    }
    await cargar([...siguientes.values()]);
    abiertas = [];
    for (const [origen, s] of siguientes) {
      if (!cache.has(s)) continue;
      cadenas.get(origen)!.push(s);
      abiertas.push(origen);
    }
  }

  const vigentes = new Map<number, MediaConRelaciones>();
  for (const [origen, cadena] of cadenas) {
    const original = cache.get(origen);
    if (!original) continue;
    const candidatas = cadena.map(id => cache.get(id)!).filter(m => FORMATOS_TEMPORADA.has(m.format ?? "") && yaEmite(m));
    vigentes.set(origen, candidatas[candidatas.length - 1] ?? original);
  }
  return vigentes;
}

/**
 * Qué cambiaría AniList en una serie, o null si ya coincide o si AniList no sabe nada útil.
 * `media` debe ser la temporada vigente. Con varias temporadas no se propone `total`: el catálogo lo usa
 * a veces como total de la temporada y a veces como suma de todas, y AniList solo da la temporada.
 */
export function proponer(actual: DatosSerie, media: MediaAniList, zona: string, variasTemporadas = false): PropuestaCalculada | null {
  const siguiente = media.nextAiringEpisode;
  if (siguiente) {
    const dia = diaDeEmision(siguiente.airingAt, zona);
    if (actual.nextEp === siguiente.episode && soloDia(actual.nextWhen) === dia) return null;
    return { tipo: "episodio", propuesto: { nextEp: siguiente.episode, nextWhen: dia } };
  }
  if (media.status === "FINISHED") {
    const propuesto: Cambios = {};
    if (!variasTemporadas && media.episodes && actual.total !== media.episodes) propuesto.total = media.episodes;
    if (actual.nextEp != null || actual.nextWhen != null) { propuesto.nextEp = null; propuesto.nextWhen = null; }
    return Object.keys(propuesto).length ? { tipo: "finalizada", propuesto } : null;
  }
  return null;
}

const normalizar = (x: string): string =>
  x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "exacta" si algún título de AniList es igual al del catálogo; si no, "aproximada" y hay que mirarla. */
export function evaluarCoincidencia(titulo: string, media: MediaAniList): "exacta" | "aproximada" {
  const t = normalizar(titulo);
  const titulos = [media.title.romaji, media.title.english, media.title.native];
  return titulos.some(x => !!x && normalizar(x) === t) ? "exacta" : "aproximada";
}
