// Vista de calendario: cuadrícula mensual con estrenos y próximos episodios, y el detalle del día elegido.
import { celdasDelMes, diaCorto, eventosDe, fechaHoy, tituloDelDia, tituloDelMes, type Evento, type TipoEvento } from "./calendario";
import { REGLAS } from "./config";
import { totalDe, vistosDe } from "./prioridad";
import { esc } from "./render";
import type { Serie } from "./types";

const SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TIPOS: [TipoEvento, string][] = [["estreno", "Estrenos"], ["episodio", "Próximos episodios"]];
const dos = (n: number): string => String(n).padStart(2, "0");

interface Ganchos {
  /** Series que cuentan para el calendario (sin las descartadas). */
  series: () => Serie[];
}

const estado = { anio: 0, mes: 0, sel: null as string | null, tipos: new Set<TipoEvento>(["estreno", "episodio"]) };
let raiz: HTMLElement;
let ganchos: Ganchos;

function irAHoy(): void {
  const hoy = fechaHoy();
  estado.anio = Number(hoy.slice(0, 4));
  estado.mes = Number(hoy.slice(5, 7));
  estado.sel = hoy;
}

function moverMes(delta: number): void {
  const d = new Date(Date.UTC(estado.anio, estado.mes - 1 + delta, 1));
  estado.anio = d.getUTCFullYear();
  estado.mes = d.getUTCMonth() + 1;
  estado.sel = null;
}

const orden = (a: Evento, b: Evento): number =>
  (a.tipo === b.tipo ? 0 : a.tipo === "estreno" ? -1 : 1) || a.serie.t.localeCompare(b.serie.t, "es");

function tarjeta(e: Evento): string {
  const s = e.serie;
  const vistos = vistosDe(s);
  const den = totalDe(s);
  const progreso = den ? `Capítulo ${vistos} / ${den} · faltan ${Math.max(0, den - vistos)}` : `Capítulo ${vistos} / ?`;
  const etiqueta = e.tipo === "estreno" ? "Estreno" : s.nextEp ? `Episodio ${esc(s.nextEp)}` : "Nuevo episodio";
  return `
    <div class="item cal-item">
      <img class="thumb" src="${esc(s.thumb)}" alt="Póster de ${esc(s.t)}" loading="lazy">
      <div class="info">
        <div class="row">
          <span class="title">${esc(s.t)}</span>
          <span class="tags">
            <span class="cal-tag ${e.tipo}">${etiqueta}</span>
            <span class="tier${s.tier >= 9 ? " baja" : ""}" tabindex="0" role="note" aria-label="Regla ${s.tier}: ${REGLAS[s.tier]}" data-regla="Regla ${s.tier}: ${REGLAS[s.tier]}">P${s.tier}</span>
          </span>
        </div>
        <div class="prog">${progreso}</div>
      </div>
    </div>`;
}

export function pintarCalendario(): void {
  if (!raiz) return;
  if (!estado.anio) irAHoy();
  const hoy = fechaHoy();
  const prefijo = `${estado.anio}-${dos(estado.mes)}`;
  const todos = eventosDe(ganchos.series()).filter(e => estado.tipos.has(e.tipo));
  const porDia = new Map<string, Evento[]>();
  for (const e of todos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e].sort(orden));
  const delMes = todos.filter(e => e.fecha.startsWith(prefijo));

  if (!estado.sel || !estado.sel.startsWith(prefijo)) {
    estado.sel = hoy.startsWith(prefijo) ? hoy : ([...new Set(delMes.map(e => e.fecha))].sort()[0] ?? null);
  }

  const celdas = celdasDelMes(estado.anio, estado.mes).map(c => {
    const evs = porDia.get(c.fecha) ?? [];
    const textos = evs.slice(0, 2).map(e => `<span class="cal-txt ${e.tipo}">${esc(e.serie.t)}</span>`).join("")
      + (evs.length > 2 ? `<span class="cal-mas">+${evs.length - 2} más</span>` : "");
    const etiqueta = `${tituloDelDia(c.fecha)}, ${evs.length ? `${evs.length} ${evs.length === 1 ? "evento" : "eventos"}` : "sin eventos"}`;
    const clases = ["cal-dia", c.enMes ? "" : "fuera", c.fecha === hoy ? "hoy" : "", c.fecha === estado.sel ? "sel" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${clases}" data-fecha="${c.fecha}" aria-pressed="${c.fecha === estado.sel}" aria-label="${esc(etiqueta)}">
      <span class="cal-num">${c.dia}</span>
      <span class="cal-puntos">${evs.slice(0, 6).map(e => `<i class="pto ${e.tipo}"></i>`).join("")}</span>
      <span class="cal-textos">${textos}</span>
    </button>`;
  }).join("");

  const nEstrenos = delMes.filter(e => e.tipo === "estreno").length;
  const nEpisodios = delMes.filter(e => e.tipo === "episodio").length;
  const delDia = estado.sel ? (porDia.get(estado.sel) ?? []) : [];

  raiz.innerHTML = `
    <div class="cabecera"><h1>Calendario</h1></div>
    <div class="vistas" role="group" aria-label="Vista">
      <button class="chip" type="button" data-vista="lista" aria-pressed="false">Lista</button>
      <button class="chip" type="button" data-vista="calendario" aria-pressed="true">Calendario</button>
    </div>
    <div class="cal-nav">
      <button type="button" class="cal-flecha" data-cal="prev" aria-label="Mes anterior">‹</button>
      <h2 class="cal-titulo">${esc(tituloDelMes(estado.anio, estado.mes))}</h2>
      <button type="button" class="cal-flecha" data-cal="next" aria-label="Mes siguiente">›</button>
      <button type="button" class="cal-hoy" data-cal="hoy">Hoy</button>
    </div>
    <div class="tabs" role="group" aria-label="Qué mostrar">
      ${TIPOS.map(([t, n]) => `<button class="chip cal-chip ${t}" type="button" data-tipo="${t}" aria-pressed="${estado.tipos.has(t)}"><i class="pto ${t}"></i>${n}</button>`).join("")}
    </div>
    <p class="aviso">${nEstrenos} ${nEstrenos === 1 ? "estreno" : "estrenos"} y ${nEpisodios} ${nEpisodios === 1 ? "próximo episodio" : "próximos episodios"} este mes.</p>
    <div class="cal-grid" role="group" aria-label="${esc(tituloDelMes(estado.anio, estado.mes))}">
      ${SEMANA.map(d => `<span class="cal-sem">${d}</span>`).join("")}${celdas}
    </div>
    <section class="cal-detalle" aria-live="polite">
      ${estado.sel
        ? `<h3>${esc(tituloDelDia(estado.sel))}</h3>${delDia.length ? `<div class="list">${delDia.map(tarjeta).join("")}</div>` : `<div class="vacio">No hay estrenos ni episodios el ${esc(diaCorto(estado.sel))}.</div>`}`
        : `<div class="vacio">No hay fechas guardadas este mes.</div>`}
    </section>`;
}

export function montarCalendario(el: HTMLElement, g: Ganchos): void {
  raiz = el;
  ganchos = g;

  raiz.addEventListener("click", ev => {
    const d = ev.target as HTMLElement;
    const nav = d.closest<HTMLElement>("[data-cal]")?.dataset.cal;
    if (nav === "prev") moverMes(-1);
    else if (nav === "next") moverMes(1);
    else if (nav === "hoy") irAHoy();
    else {
      const tipo = d.closest<HTMLElement>("[data-tipo]")?.dataset.tipo as TipoEvento | undefined;
      const fecha = d.closest<HTMLElement>("[data-fecha]")?.dataset.fecha;
      if (tipo) { if (estado.tipos.has(tipo)) estado.tipos.delete(tipo); else estado.tipos.add(tipo); }
      else if (fecha) {
        estado.sel = fecha;
        // un día de otro mes visible en la cuadrícula lleva a ese mes
        if (!fecha.startsWith(`${estado.anio}-${dos(estado.mes)}`)) { estado.anio = Number(fecha.slice(0, 4)); estado.mes = Number(fecha.slice(5, 7)); }
      } else return;
    }
    pintarCalendario();
  });
}
