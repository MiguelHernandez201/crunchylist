import type { Estado, Tier } from "./types";

// Parámetros de la temporada en curso. Cambiar aquí al iniciar una nueva temporada.
export const TEMPORADA = {
  nombre: "otoño 2026",
  desde: "4 de octubre de 2026",
  anio: 2026, // los estrenos guardados no traen año
} as const;

export const REGLAS: Record<Tier, string> = {
  1: "Temporada actual, con doblaje, empezada",
  2: "Temporada actual, con doblaje, sin empezar",
  3: "Temporada actual, sin doblaje ni anuncio",
  4: "Antigua, con doblaje, empezada",
  5: "Antigua, con doblaje, sin empezar",
  6: "Antigua, sin doblaje, empezada",
  7: "Antigua, sin doblaje, sin empezar",
  8: "Temporada actual, doblaje anunciado pero no disponible",
  9: "Al día",
  10: "Finalizada",
};

export const LABEL: Record<Estado, string> = { fin: "Finalizado", aldia: "Al día", cont: "En progreso", rew: "Ver de nuevo", new: "Sin empezar" };
export const CLS: Record<Estado, string> = { fin: "fin", aldia: "aldia", cont: "cont", rew: "rewatch", new: "new" };
