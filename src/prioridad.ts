// Reglas de prioridad P1–P10, estado derivado del progreso y ordenamiento.
import type { Estado, Orden, Serie, Tier } from "./types";

export const totalDe = (s: Serie): number | null => s.totalTodas || s.total || null;
export const vistosDe = (s: Serie): number => (s.vistos != null ? s.vistos : s.cur);

export const faltan = (s: Serie): number | null => {
  const den = totalDe(s);
  if (!den) return null;
  return Math.max(0, den - vistosDe(s));
};

// desempate: menos pendientes primero; los de total desconocido van al final
const cmpFaltan = (a: Serie, b: Serie): number => {
  const fa = faltan(a), fb = faltan(b);
  if (fa === fb) return 0;
  if (fa === null) return 1;
  if (fb === null) return -1;
  return fa - fb;
};

export function ordenar(items: Serie[], orden: Orden): Serie[] {
  const c = [...items];
  if (orden === "prioridad") c.sort((a, b) => (a.tier - b.tier) || cmpFaltan(a, b) || ((b.addedPos ?? 0) - (a.addedPos ?? 0)));
  else if (orden === "add-rec") c.sort((a, b) => (a.addedPos ?? 9999) - (b.addedPos ?? 9999));
  else if (orden === "add-ant") c.sort((a, b) => (b.addedPos ?? 9999) - (a.addedPos ?? 9999));
  else if (orden === "falta") c.sort((a, b) => cmpFaltan(b, a));
  else if (orden === "nombre") c.sort((a, b) => a.t.localeCompare(b.t, "es"));
  return c;
}

// Estado tras una actualización manual: el del watchlist queda viejo en cuanto cambias el progreso.
export function estadoDesdeVistos(s: Serie): Estado {
  const den = totalDe(s);
  const v = vistosDe(s);
  if (v === 0) return "new";
  if (den && v >= den) return s.temp === true ? "aldia" : "fin";
  return "cont";
}

export function recalcularPrioridades(series: Serie[]): void {
  series.forEach(s => {
    if (s.manual) s.st = estadoDesdeVistos(s);
    const den = totalDe(s);
    if (!den) return;
    const v = s.vistos != null ? s.vistos : 0;
    const empezada = v > 0;
    const completa = v >= den;
    const actual = s.temp === true;
    const dub = s.audioES === true;
    const anunciado = !dub && !!s.dubES;
    let t: Tier;
    if (completa) t = actual ? 9 : 10;
    else if (actual) t = dub ? (empezada ? 1 : 2) : (anunciado ? 8 : 3);
    else t = dub ? (empezada ? 4 : 5) : (empezada ? 6 : 7);
    s.tier = t;
  });
}
