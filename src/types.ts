// Forma de una serie tal como se guarda en series.data (jsonb).
export type Estado = "new" | "cont" | "aldia" | "fin" | "rew";
export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Serie {
  id: string;            // id de Crunchyroll
  t: string;             // título
  thumb: string;         // ruta relativa de la miniatura
  st: Estado;
  cur: number;           // capítulo que sigues según el watchlist
  vistos: number | null;
  total: number | null;  // episodios de la temporada
  totalTodas: number | null;
  seasons: string[];     // "Temporada 1: 14"
  tier: Tier;
  addedPos: number | null;
  etiqueta: string;
  note: string;
  temp: boolean;         // temporada actual
  fuenteTemp: "fecha" | "manual" | "articulo";
  fechaUlt: string | null;
  estreno: string | null;
  nextEp: number | null;
  nextWhen: string | null;
  alt: string | null;
  dub: boolean;          // el watchlist marca doblaje (cualquier idioma)
  audioES: boolean | null;
  dubES: string | null;  // doblaje al español anunciado
  dubVerif?: boolean;
  vistosVerif?: boolean;
  detalle: boolean;
  avail?: null;
  manual?: boolean;      // el progreso viene de una actualización manual
}

export type Filtro = "all" | "cont" | "prov" | "det" | "dub" | "fin" | "new" | "next";
export type Orden = "prioridad" | "lista" | "add-rec" | "add-ant" | "falta" | "nombre";

/** id de la serie → capítulos vistos */
export type MapaProgreso = Record<string, number>;
