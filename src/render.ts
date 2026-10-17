import { REGLAS, LABEL, CLS, TEMPORADA } from "./config";
import { totalDe, vistosDe } from "./prioridad";
import type { Filtro, Serie } from "./types";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (x: unknown): string => String(x ?? "").replace(/[&<>"']/g, c => ESC[c]);

export const normalizarBusqueda = (x: string): string =>
  x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const coincide = (s: Serie, q: string): boolean => {
  if (!q) return true;
  const campos = [s.t, s.alt || "", (s.seasons || []).join(" ")].join(" ");
  return normalizarBusqueda(campos).includes(q);
};

const pasaFiltro = (s: Serie, filter: Filtro): boolean =>
  filter === "all" ||
  (filter === "cont" && s.st !== "new" && s.st !== "fin") ||
  (filter === "fin" && s.st === "fin") ||
  (filter === "dub" && (s.audioES === true || !!s.dubES)) ||
  (filter === "det" && s.detalle) ||
  (filter === "prov" && s.fuenteTemp === "articulo") ||
  (filter === "new" && s.st === "new") ||
  (filter === "next" && !!s.nextWhen);

// Las descartadas solo se ven en su filtro; en el resto no cuentan ni se priorizan.
export const filtrar = (series: Serie[], { filter, q }: { filter: Filtro; q: string }): Serie[] =>
  series.filter(s => coincide(s, q) && (filter === "desc" ? !!s.descartada : !s.descartada && pasaFiltro(s, filter)));

function tarjeta(s: Serie, editando: string | null): string {
  const vistos = vistosDe(s);
  const den = totalDe(s);
  const pct = den ? Math.min(100, Math.round((vistos / den) * 100)) : 0;
  const pend = den ? Math.max(0, den - vistos) : null;
  const progText = den
    ? `Capítulo ${vistos} / ${den}`
    : (s.detalle ? `Capítulo ${vistos} / ?` : esc(s.etiqueta));
  const nextText = s.nextWhen
    ? `<span class="next">Próximo: E${esc(s.nextEp)} · ${esc(s.nextWhen)}</span>`
    : `<span class="unk">Sin episodio esta semana</span>`;
  const altText = s.alt ? `<div class="alt">Emite ahora: ${esc(s.alt)}</div>` : "";
  const tempText = (s.seasons && s.seasons.length)
    ? `<div class="temps">${s.seasons.map(x => { const i = x.lastIndexOf(":"); return `<span>${esc(x.slice(0, i))} <b>${esc(x.slice(i + 1).trim())}</b></span>`; }).join("")}</div>`
    : "";
  const dubText = s.dubES
    ? `<div class="alt">Doblaje al español anunciado para ${TEMPORADA.nombre} · ${esc(s.dubES)}${s.dub ? "" : " (aún no disponible)"}</div>`
    : "";
  const dubTag = s.audioES === true ? '<span class="dub">DOB ES</span>'
    : (s.audioES === false ? ""
    : (s.dub ? '<span class="dub pend" title="El watchlist marca doblaje, pero falta confirmar si es al español">DOB?</span>' : ""));
  const id = esc(s.id);
  const edicion = s.descartada
    ? `<div class="row upd-row"><button class="restaurar" data-id="${id}">Restaurar a mi lista</button></div>`
    : editando === s.id
      ? `<div class="row upd-row"><input class="upd-in" type="number" min="0" inputmode="numeric" value="${vistos}" aria-label="Capítulos vistos"> <button class="upd-ok" data-id="${id}">Guardar</button> <button class="upd-cancel">Cancelar</button></div>`
      : `<div class="row upd-row"><button class="upd" data-id="${id}">Actualizar progreso</button> <button class="descartar" data-id="${id}" title="Quitarla de mi lista y de la priorización">Descartar</button></div>`;
  return `
    <div class="item${s.st === "fin" || s.descartada ? " done" : ""}">
      <img class="thumb" src="${esc(s.thumb)}" alt="Póster de ${esc(s.t)}" loading="lazy">
      <div class="info">
        <div class="row">
          <span class="title">${esc(s.t)}</span>
          <span class="tags">
            ${s.fuenteTemp === "articulo" ? '<span class="prov" title="Temporada deducida del artículo de la temporada; falta verificar con la fecha de emisión">sin verificar</span>' : ""}
            <span class="tier${s.tier >= 9 ? " baja" : ""}" tabindex="0" role="note" aria-label="Regla ${s.tier}: ${REGLAS[s.tier]}" data-regla="Regla ${s.tier}: ${REGLAS[s.tier]}">P${s.tier}</span>
            ${s.addedPos ? `<span class="pos" title="Posición en tu watchlist por fecha de agregado">#${s.addedPos}</span>` : ""}
            ${dubTag}
            ${s.descartada ? '<span class="badge">Descartada</span>' : `<span class="badge ${CLS[s.st]}">${LABEL[s.st]}</span>`}
          </span>
        </div>
        <div class="row prog"><span>${progText}${pend != null ? ` · faltan ${pend}` : ""}</span>${nextText}</div>
        ${edicion}
        ${den ? `<div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ""}
        <div class="regla">${REGLAS[s.tier]}</div>
        ${tempText}
        ${dubText}
        ${altText}
        <div class="meta">${esc(s.note)}${s.estreno ? ` Estrenó el ${esc(s.estreno)} de ${TEMPORADA.anio}.` : ""}</div>
      </div>
    </div>`;
}

export function renderLista(
  el: HTMLElement,
  items: Serie[],
  { editando, q, cargando }: { editando: string | null; q: string; cargando: boolean },
): void {
  if (!items.length) {
    el.innerHTML = cargando
      ? `<div class="vacio">Cargando…</div>`
      : q
        ? `<div class="vacio">Ninguna serie coincide con <b>“${esc(q)}”</b>.</div>`
        : `<div class="vacio">No hay series en este filtro.</div>`;
    return;
  }
  el.innerHTML = items.map(s => tarjeta(s, editando)).join("");
}

export function renderResumen(el: HTMLElement, series: Serie[]): void {
  const n = (f: (s: Serie) => boolean) => series.filter(f).length;
  const stats: [number, string][] = [
    [series.length, "Series en la lista"],
    [n(s => s.st === "fin"), "Finalizadas"],
    [n(s => s.audioES === true), "Doblaje ES confirmado"],
    [n(s => s.detalle), "Con detalle"],
    [n(s => s.fuenteTemp === "fecha"), "Temporada verificada"],
    [n(s => s.st !== "new" && s.st !== "fin"), "Con progreso"],
    [n(s => s.st === "new"), "Sin empezar"],
    [n(s => !!s.nextWhen), "Emiten esta semana"],
  ];
  el.innerHTML = stats.map(([v, t]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join("");
}
