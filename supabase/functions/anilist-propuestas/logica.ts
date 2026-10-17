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

/** Qué cambiaría AniList en una serie, o null si ya coincide o si AniList no sabe nada útil. */
export function proponer(actual: DatosSerie, media: MediaAniList, zona: string): PropuestaCalculada | null {
  const siguiente = media.nextAiringEpisode;
  if (siguiente) {
    const dia = diaDeEmision(siguiente.airingAt, zona);
    if (actual.nextEp === siguiente.episode && soloDia(actual.nextWhen) === dia) return null;
    return { tipo: "episodio", propuesto: { nextEp: siguiente.episode, nextWhen: dia } };
  }
  if (media.status === "FINISHED") {
    const propuesto: Cambios = {};
    if (media.episodes && actual.total !== media.episodes) propuesto.total = media.episodes;
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
