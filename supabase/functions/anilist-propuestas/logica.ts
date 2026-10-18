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
  totalTodas: number | null;
  nextEp: number | null;
  nextWhen: string | null;
  seasons: string[] | null;
}

export interface Cambios {
  total?: number;
  totalTodas?: number;
  seasons?: string[];
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

const conteoDeTemporada = (t: string): number | null => {
  const m = t.match(/:\s*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

/** Episodios de las temporadas anteriores a la última de la lista ("Temporada 1: 12", ...). null si algún conteo no se entiende. */
export function episodiosPrevios(seasons: string[] | null): number | null {
  const previas = (seasons ?? []).slice(0, -1).map(conteoDeTemporada);
  return previas.some(c => c === null) ? null : previas.reduce<number>((suma, c) => suma + (c as number), 0);
}

/** La lista de temporadas con el conteo de la última reemplazado ("Temporada 3: 3" → "Temporada 3: 4"). */
function conUltimaTemporada(seasons: string[], cuenta: number): string[] {
  const ultima = seasons[seasons.length - 1];
  const i = ultima.lastIndexOf(":");
  return i < 0 ? seasons : [...seasons.slice(0, -1), `${ultima.slice(0, i + 1)} ${cuenta}`];
}

/**
 * Totales que quedan atrasados cuando salen episodios: en una serie en emisión `total` y `totalTodas` cuentan lo ya
 * publicado, y la app los usa para saber cuánto te falta por ver. `publicados` es lo emitido de la temporada vigente
 * (próximo episodio − 1). Solo sube conteos, nunca los baja. Con varias temporadas no se toca `total`: a veces es el
 * de la temporada y a veces la suma, y AniList solo conoce la vigente.
 */
function conteosAlDia(actual: DatosSerie, publicados: number): Cambios {
  const previos = episodiosPrevios(actual.seasons);
  if (previos === null || publicados < 1) return {};
  const cambios: Cambios = {};
  if ((actual.totalTodas ?? 0) < previos + publicados) cambios.totalTodas = previos + publicados;
  const temporadas = actual.seasons ?? [];
  if (temporadas.length <= 1 && (actual.total ?? 0) < publicados) cambios.total = publicados;
  if (temporadas.length && (conteoDeTemporada(temporadas[temporadas.length - 1]) ?? 0) < publicados) {
    const nuevas = conUltimaTemporada(temporadas, publicados);
    if (JSON.stringify(nuevas) !== JSON.stringify(temporadas)) cambios.seasons = nuevas;
  }
  return cambios;
}

/**
 * Qué cambiaría AniList en una serie, o null si ya coincide o si AniList no sabe nada útil.
 * `media` debe ser la temporada vigente.
 * - Con próximo episodio: propone el número y el día, y pone al día los totales de lo ya publicado.
 * - Terminada: propone el total de la temporada y quita el próximo episodio.
 */
export function proponer(actual: DatosSerie, media: MediaAniList, zona: string): PropuestaCalculada | null {
  const siguiente = media.nextAiringEpisode;
  if (siguiente) {
    const dia = diaDeEmision(siguiente.airingAt, zona);
    const conteos = conteosAlDia(actual, siguiente.episode - 1);
    const mismaFecha = actual.nextEp === siguiente.episode && soloDia(actual.nextWhen) === dia;
    if (mismaFecha && Object.keys(conteos).length === 0) return null;
    return { tipo: "episodio", propuesto: { nextEp: siguiente.episode, nextWhen: dia, ...conteos } };
  }
  if (media.status === "FINISHED") {
    const propuesto: Cambios = {};
    const previos = episodiosPrevios(actual.seasons);
    if (media.episodes && previos !== null) {
      const temporadas = actual.seasons ?? [];
      if (actual.totalTodas !== previos + media.episodes) propuesto.totalTodas = previos + media.episodes;
      if (temporadas.length <= 1 && actual.total !== media.episodes) propuesto.total = media.episodes;
      if (temporadas.length && conteoDeTemporada(temporadas[temporadas.length - 1]) !== media.episodes) {
        const nuevas = conUltimaTemporada(temporadas, media.episodes);
        if (JSON.stringify(nuevas) !== JSON.stringify(temporadas)) propuesto.seasons = nuevas;
      }
    }
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
