// Panel de administración: catálogo completo de series, sin importar el progreso de ningún usuario.
import {
  actualizarSerieAdmin, buscarActualizaciones, cargarPropuestas, cargarSeries, cargarVinculos, cerrarSesion,
  iniciarSesion, resolverPropuesta, rolDeSesion, type CambiosDatos, type CambiosSerie, type Propuesta,
} from "./datos";
import { ALERTAS, alertasDe, type CodigoAlerta } from "./alertas";
import { fechaATexto, textoAFecha } from "./fechas";
import { esc, normalizarBusqueda } from "./render";
import type { Serie } from "./types";

type FiltroAdmin = "todas" | "alertas" | CodigoAlerta | "con-proximo" | "sin-proximo";

interface Ganchos {
  alCambiar: (id: string, cambios: CambiosDatos) => void;
}

type Vista = "catalogo" | "propuestas";

const estado = {
  series: [] as Serie[],
  vinculos: {} as Record<string, number | null>, // id de la serie → id en AniList
  propuestas: [] as Propuesta[],
  vista: "catalogo" as Vista,
  q: "",
  filtro: "todas" as FiltroAdmin,
  cargando: false,
  buscando: false,
  avisoBusqueda: "",
  errorBusqueda: false,
};
let raiz: HTMLElement;
let ganchos: Ganchos;

const FILTROS: [FiltroAdmin, string][] = [
  ["todas", "Todas"],
  ["alertas", "Con alertas"],
  ["sin-total", "Sin total"],
  ["vencido", "Próximo vencido"],
  ["incoherente", "Totales incoherentes"],
  ["sin-verificar", "Temporada sin verificar"],
  ["doblaje", "Doblaje sin confirmar"],
  ["con-proximo", "Con próximo episodio"],
  ["sin-proximo", "Sin próximo episodio"],
];

const alertas = new Map<string, CodigoAlerta[]>();
function calcularAlertas(): void {
  const ahora = new Date();
  alertas.clear();
  estado.series.forEach(s => alertas.set(s.id, alertasDe(s, ahora)));
}

const pasa = (s: Serie): boolean => {
  if (estado.q && !normalizarBusqueda(`${s.t} ${s.alt || ""} ${s.id}`).includes(estado.q)) return false;
  const a = alertas.get(s.id) ?? [];
  switch (estado.filtro) {
    case "todas": return true;
    case "alertas": return a.length > 0;
    case "con-proximo": return !!s.nextWhen;
    case "sin-proximo": return !s.nextWhen;
    default: return a.includes(estado.filtro);
  }
};

/** Cuántas series cumplen cada filtro de alerta (sin considerar la búsqueda). */
function contar(f: FiltroAdmin): number | null {
  if (f === "todas" || f === "con-proximo" || f === "sin-proximo") return null;
  return [...alertas.values()].filter(a => (f === "alertas" ? a.length > 0 : a.includes(f))).length;
}

const num = (v: number | null): string => (v == null ? "" : String(v));

function etiquetasAlerta(s: Serie): string {
  const a = alertas.get(s.id) ?? [];
  return a.length
    ? `<div class="adm-alertas">${a.map(c => `<span title="${esc(ALERTAS[c].largo)}">${esc(ALERTAS[c].corto)}</span>`).join("")}</div>`
    : "";
}

function fila(s: Serie): string {
  const id = esc(s.id);
  return `
    <form class="adm-fila" data-id="${id}" novalidate>
      <img class="adm-thumb" src="${esc(s.thumb)}" alt="" loading="lazy">
      <div class="adm-titulo"><b>${esc(s.t)}</b><span>${id}${s.temp ? " · temporada actual" : ""}</span>${etiquetasAlerta(s)}</div>
      <label>Total temporada<input name="total" type="number" min="1" inputmode="numeric" value="${num(s.total)}"></label>
      <label>Total de todas<input name="totalTodas" type="number" min="1" inputmode="numeric" value="${num(s.totalTodas)}"></label>
      <label>Próximo cap.<input name="nextEp" type="number" min="1" inputmode="numeric" value="${num(s.nextEp)}"></label>
      <label class="adm-cuando">Día de emisión<input name="nextWhen" type="date" value="${textoAFecha(s.nextWhen)}"></label>
      <label>ID AniList<input name="anilist_id" type="number" min="1" inputmode="numeric" value="${num(estado.vinculos[s.id] ?? null)}"></label>
      <div class="adm-acciones"><button type="submit">Guardar</button><span class="adm-msg" role="status"></span></div>
    </form>`;
}

function pintarChips(): void {
  raiz.querySelectorAll<HTMLElement>("[data-adm-f]").forEach(chip => {
    const f = chip.dataset.admF as FiltroAdmin;
    const n = contar(f);
    const base = FILTROS.find(x => x[0] === f)![1];
    chip.textContent = n == null ? base : `${base} (${n})`;
  });
}

function pintarLista(): void {
  calcularAlertas();
  pintarChips();
  const items = estado.series.filter(pasa);
  const lista = raiz.querySelector<HTMLElement>("#adm-lista");
  const cuenta = raiz.querySelector<HTMLElement>("#adm-cuenta");
  if (!lista || !cuenta) return;
  cuenta.textContent = `${items.length} de ${estado.series.length} series`;
  lista.innerHTML = items.length
    ? items.map(fila).join("")
    : `<div class="vacio">${estado.cargando ? "Cargando…" : "Ninguna serie coincide."}</div>`;
}

const CATALOGO_HTML = `
    <div class="search">
      <input id="adm-q" type="search" placeholder="Buscar por nombre o id…" aria-label="Buscar serie" autocomplete="off">
    </div>
    <div class="tabs" role="group" aria-label="Filtrar">
      ${FILTROS.map(([f, t]) => `<button class="chip" type="button" data-adm-f="${f}">${t}</button>`).join("")}
    </div>
    <p class="aviso" id="adm-cuenta"></p>
    <div class="adm-lista" id="adm-lista"></div>`;

const textoPropuesta = (p: Propuesta): { actual: string; propuesto: string } => {
  const ep = (e: unknown, d: unknown): string => (e == null && d == null ? "sin próximo episodio" : `E${e ?? "?"} · ${d ?? "sin día"}`);
  if (p.tipo === "vincular") {
    const id = p.propuesto.anilist_id;
    const anio = p.propuesto.anio ? ` (${p.propuesto.anio})` : "";
    return {
      actual: "Sin vincular",
      propuesto: `<a href="https://anilist.co/anime/${esc(id)}" target="_blank" rel="noopener">«${esc(p.propuesto.titulo_anilist)}»${esc(anio)}</a> · id ${esc(id)} · coincidencia <b>${esc(p.propuesto.coincidencia)}</b>`,
    };
  }
  if (p.tipo === "episodio") {
    const soloDia = p.actual.nextWhen ? String(p.actual.nextWhen).split(",")[0] : null; // los datos antiguos traen hora
    return { actual: ep(p.actual.nextEp, soloDia), propuesto: ep(p.propuesto.nextEp, p.propuesto.nextWhen) };
  }
  const partes: string[] = [];
  if ("total" in p.propuesto) partes.push(`total ${esc(p.propuesto.total)} episodios`);
  if ("nextEp" in p.propuesto) partes.push("quitar el próximo episodio");
  return { actual: `total ${esc(p.actual.total ?? "?")} · ${ep(p.actual.nextEp, p.actual.nextWhen)}`, propuesto: `AniList la da por terminada: ${partes.join(" y ")}` };
};

const ETIQUETA_TIPO: Record<Propuesta["tipo"], string> = { vincular: "Vincular con AniList", episodio: "Próximo episodio", finalizada: "Serie terminada" };

function pintarPropuestas(): void {
  const cont = raiz.querySelector<HTMLElement>("#adm-contenido");
  if (!cont) return;
  const filas = estado.propuestas.map(p => {
    const serie = estado.series.find(x => x.id === p.serie_id);
    const t = textoPropuesta(p);
    return `
      <div class="adm-prop" data-pid="${p.id}">
        <div class="adm-prop-cab"><b>${esc(serie?.t ?? p.serie_id)}</b><span class="adm-prop-tipo">${ETIQUETA_TIPO[p.tipo]}</span></div>
        <div class="adm-prop-cmp"><span>Ahora</span><div>${t.actual}</div><span>Propuesta</span><div>${t.propuesto}</div></div>
        <div class="adm-acciones"><button type="button" class="adm-aceptar" data-pid="${p.id}">Aceptar</button><button type="button" class="adm-rechazar" data-pid="${p.id}">Rechazar</button><span class="adm-msg" role="status"></span></div>
      </div>`;
  }).join("");
  cont.innerHTML = `
    <p class="sub">Los datos vienen de AniList. <b>Nada cambia en el catálogo hasta que aceptes una propuesta.</b> Solo se propone el día de emisión, sin hora. El doblaje no se toca: sigue siendo manual.</p>
    <div class="adm-buscar">
      <button type="button" id="adm-buscar"${estado.buscando ? " disabled" : ""}>${estado.buscando ? "Consultando AniList…" : "Buscar actualizaciones en AniList"}</button>
      <span class="aviso${estado.errorBusqueda ? " error" : ""}" role="status">${esc(estado.avisoBusqueda)}</span>
    </div>
    <div class="adm-lista">${filas || '<div class="vacio">No hay propuestas pendientes.</div>'}</div>`;
}

function pintarContenido(): void {
  const cont = raiz.querySelector<HTMLElement>("#adm-contenido");
  if (!cont) return;
  raiz.querySelectorAll("[data-adm-vista]").forEach(b => {
    b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.admVista === estado.vista));
    if ((b as HTMLElement).dataset.admVista === "propuestas") {
      b.textContent = estado.propuestas.length ? `Propuestas (${estado.propuestas.length})` : "Propuestas";
    }
  });
  if (estado.vista === "propuestas") { pintarPropuestas(); return; }
  cont.innerHTML = CATALOGO_HTML;
  raiz.querySelector<HTMLInputElement>("#adm-q")!.value = estado.q;
  raiz.querySelectorAll("[data-adm-f]").forEach(c => c.setAttribute("aria-pressed", String((c as HTMLElement).dataset.admF === estado.filtro)));
  pintarLista();
}

function pintarPanel(): void {
  raiz.innerHTML = `
    <div class="adm-barra">
      <h2>Administración del catálogo</h2>
      <span class="adm-barra-botones">
        <button type="button" id="adm-volver">Volver a la lista</button>
        <button type="button" id="adm-salir">Cerrar sesión</button>
      </span>
    </div>
    <p class="sub">Datos globales de cada serie, independientes del progreso de cualquier usuario. Los cambios se ven en la lista de todos.</p>
    <div class="tabs" role="group" aria-label="Vista">
      <button class="chip" type="button" data-adm-vista="catalogo">Catálogo</button>
      <button class="chip" type="button" data-adm-vista="propuestas">Propuestas</button>
    </div>
    <div id="adm-contenido"></div>`;
  pintarContenido();
}

function pintarLogin(mensaje = "", error = false): void {
  raiz.innerHTML = `
    <div class="adm-barra"><h2>Administración</h2>
      <button type="button" id="adm-volver">Volver a la lista</button></div>
    <form class="adm-login" id="adm-login">
      <label>Correo<input name="email" type="email" autocomplete="username" required></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Entrar</button>
      <p class="aviso${error ? " error" : ""}" role="status">${esc(mensaje)}</p>
    </form>`;
}

export async function abrirAdmin(): Promise<void> {
  pintarLogin("Comprobando sesión…");
  try {
    const rol = await rolDeSesion();
    if (rol === "sin-sesion") { pintarLogin(); return; }
    if (rol === "sin-permiso") { pintarLogin("Esta cuenta no tiene permisos de administrador.", true); return; }
  } catch (e) {
    console.error(e);
    pintarLogin("No se pudo comprobar la sesión.", true);
    return;
  }
  estado.cargando = true;
  pintarPanel();
  try {
    estado.series = await cargarSeries();
  } catch (e) {
    console.error(e);
    pintarLogin("No se pudo cargar el catálogo.", true);
    return;
  }
  estado.cargando = false;
  // Vínculos y propuestas dependen de la parte nueva del esquema: si aún no está aplicada, el catálogo sigue funcionando.
  const [vinculos, propuestas] = await Promise.all([
    cargarVinculos().catch(e => { console.error("anilist_id no disponible:", e); return {} as Record<string, number | null>; }),
    cargarPropuestas().catch(e => { console.error("propuestas no disponibles:", e); return [] as Propuesta[]; }),
  ]);
  estado.vinculos = vinculos;
  estado.propuestas = propuestas;
  pintarContenido();
}

/** Lee el formulario de una fila y devuelve solo lo que cambió, o un texto de error. */
function leerCambios(form: HTMLFormElement, s: Serie): CambiosSerie | string {
  const campo = (n: string): string => (form.elements.namedItem(n) as HTMLInputElement).value.trim();
  const entero = (n: string, etiqueta: string): number | null | string => {
    const t = campo(n);
    if (t === "") return null;
    const v = Number(t);
    return Number.isInteger(v) && v >= 1 ? v : `${etiqueta} debe ser un entero mayor que 0.`;
  };
  const total = entero("total", "Total temporada");
  const totalTodas = entero("totalTodas", "Total de todas");
  const nextEp = entero("nextEp", "Próximo cap.");
  for (const v of [total, totalTodas, nextEp]) if (typeof v === "string") return v;
  const anilistId = entero("anilist_id", "ID AniList");
  if (typeof anilistId === "string") return anilistId;
  // Si el día no se tocó, se conserva el texto original (puede traer hora de datos antiguos).
  const dia = campo("nextWhen");
  const nextWhen = dia === "" ? null : dia === textoAFecha(s.nextWhen) ? s.nextWhen : fechaATexto(dia);
  if ((nextEp == null) !== (nextWhen == null)) return "El próximo capítulo y su fecha van juntos: llena los dos o deja ambos vacíos.";
  if (typeof total === "number" && typeof totalTodas === "number" && totalTodas < total) {
    return "El total de todas las temporadas no puede ser menor que el de la temporada.";
  }
  const nuevo = { total, totalTodas, nextEp, nextWhen, anilist_id: anilistId };
  const actual: Record<string, unknown> = { total: s.total, totalTodas: s.totalTodas, nextEp: s.nextEp, nextWhen: s.nextWhen, anilist_id: estado.vinculos[s.id] };
  const cambios: Record<string, unknown> = {};
  (Object.keys(nuevo) as (keyof typeof nuevo)[]).forEach(k => { if (nuevo[k] !== (actual[k] ?? null)) cambios[k] = nuevo[k]; });
  return cambios as CambiosSerie;
}

async function guardarFila(form: HTMLFormElement): Promise<void> {
  const s = estado.series.find(x => x.id === form.dataset.id);
  const msg = form.querySelector<HTMLElement>(".adm-msg")!;
  const boton = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  if (!s) return;
  const cambios = leerCambios(form, s);
  msg.classList.remove("error");
  if (typeof cambios === "string") { msg.textContent = cambios; msg.classList.add("error"); return; }
  if (!Object.keys(cambios).length) { msg.textContent = "Sin cambios."; return; }
  boton.disabled = true;
  msg.textContent = "Guardando…";
  try {
    await actualizarSerieAdmin(s.id, cambios);
    const { anilist_id: vinculo, ...datos } = cambios;
    if (vinculo !== undefined) estado.vinculos[s.id] = vinculo;
    Object.assign(s, datos);
    ganchos.alCambiar(s.id, datos);
    msg.textContent = "Guardado.";
    calcularAlertas();
    pintarChips();
    const cont = form.querySelector<HTMLElement>(".adm-titulo");
    cont?.querySelector(".adm-alertas")?.remove();
    cont?.insertAdjacentHTML("beforeend", etiquetasAlerta(s));
  } catch (e) {
    console.error(e);
    msg.textContent = "No se pudo guardar (¿sesión vencida o sin permisos?).";
    msg.classList.add("error");
  } finally {
    boton.disabled = false;
  }
}

async function buscar(): Promise<void> {
  estado.buscando = true;
  estado.avisoBusqueda = "Consultando AniList… puede tardar hasta un minuto.";
  estado.errorBusqueda = false;
  pintarPropuestas();
  try {
    const r = await buscarActualizaciones("todo");
    const n = (k: string): number => Number(r[k] ?? 0);
    estado.propuestas = await cargarPropuestas();
    const partes = [
      `${n("nuevas") + n("actualizadas")} propuesta(s) de episodio o cierre`,
      `${n("vinculos_propuestos")} vínculo(s) nuevo(s)`,
    ];
    if (n("series_sin_vincular_restantes")) partes.push(`${n("series_sin_vincular_restantes")} serie(s) sin vincular aún: vuelve a buscar`);
    if (r.anilist_pidio_esperar) partes.push("AniList pidió esperar: vuelve a intentar en unos minutos");
    estado.avisoBusqueda = partes.join(" · ");
  } catch (e) {
    console.error(e);
    estado.avisoBusqueda = `No se pudo consultar AniList: ${e instanceof Error ? e.message : "error desconocido"}`;
    estado.errorBusqueda = true;
  }
  estado.buscando = false;
  pintarContenido();
}

async function resolver(id: number, aceptar: boolean, boton: HTMLElement): Promise<void> {
  const p = estado.propuestas.find(x => x.id === id);
  const msg = boton.closest(".adm-prop")?.querySelector<HTMLElement>(".adm-msg");
  if (!p) return;
  boton.closest(".adm-prop")?.querySelectorAll("button").forEach(b => ((b as HTMLButtonElement).disabled = true));
  if (msg) { msg.classList.remove("error"); msg.textContent = "Guardando…"; }
  try {
    await resolverPropuesta(id, aceptar);
  } catch (e) {
    console.error(e);
    boton.closest(".adm-prop")?.querySelectorAll("button").forEach(b => ((b as HTMLButtonElement).disabled = false));
    if (msg) { msg.textContent = "No se pudo guardar la decisión."; msg.classList.add("error"); }
    return;
  }
  estado.propuestas = estado.propuestas.filter(x => x.id !== id);
  if (aceptar) {
    const s = estado.series.find(x => x.id === p.serie_id);
    if (p.tipo === "vincular") estado.vinculos[p.serie_id] = Number(p.propuesto.anilist_id);
    else if (s) { Object.assign(s, p.propuesto); ganchos.alCambiar(s.id, p.propuesto as CambiosDatos); }
  }
  pintarContenido();
}

export function montarAdmin(el: HTMLElement, g: Ganchos & { volver: () => void }): void {
  raiz = el;
  ganchos = g;

  raiz.addEventListener("click", async ev => {
    const d = ev.target as HTMLElement;
    if (d.closest("#adm-volver")) { g.volver(); return; }
    if (d.closest("#adm-salir")) { await cerrarSesion(); pintarLogin("Sesión cerrada."); return; }
    const vista = d.closest<HTMLElement>("[data-adm-vista]");
    if (vista) { estado.vista = vista.dataset.admVista as Vista; pintarContenido(); return; }
    if (d.closest("#adm-buscar")) { await buscar(); return; }
    const aceptar = d.closest<HTMLElement>(".adm-aceptar");
    const rechazar = d.closest<HTMLElement>(".adm-rechazar");
    if (aceptar || rechazar) { await resolver(Number((aceptar ?? rechazar)!.dataset.pid), !!aceptar, (aceptar ?? rechazar)!); return; }
    const chip = d.closest<HTMLElement>("[data-adm-f]");
    if (chip) {
      estado.filtro = chip.dataset.admF as FiltroAdmin;
      raiz.querySelectorAll("[data-adm-f]").forEach(x => x.setAttribute("aria-pressed", String(x === chip)));
      pintarLista();
    }
  });

  raiz.addEventListener("input", ev => {
    const d = ev.target as HTMLElement;
    if (d.id === "adm-q") { estado.q = normalizarBusqueda((d as HTMLInputElement).value.trim()); pintarLista(); }
  });

  raiz.addEventListener("submit", async ev => {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    if (form.id === "adm-login") {
      const datos = new FormData(form);
      pintarLogin("Entrando…");
      try {
        await iniciarSesion(String(datos.get("email")), String(datos.get("password")));
        await abrirAdmin();
      } catch (e) {
        console.error(e);
        pintarLogin("Correo o contraseña incorrectos.", true);
      }
      return;
    }
    if (form.classList.contains("adm-fila")) await guardarFila(form);
  });
}
