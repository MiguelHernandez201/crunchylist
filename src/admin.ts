// Panel de administración: catálogo completo de series, sin importar el progreso de ningún usuario.
import {
  actualizarSerieAdmin, cargarSeries, cerrarSesion, iniciarSesion, rolDeSesion, type CambiosSerie,
} from "./datos";
import { calendarioATexto, textoACalendario } from "./fechas";
import { esc, normalizarBusqueda } from "./render";
import type { Serie } from "./types";

type FiltroAdmin = "todas" | "sin-total" | "con-proximo" | "sin-proximo";

interface Ganchos {
  alCambiar: (id: string, cambios: CambiosSerie) => void;
}

const estado = { series: [] as Serie[], q: "", filtro: "todas" as FiltroAdmin, cargando: false };
let raiz: HTMLElement;
let ganchos: Ganchos;

const FILTROS: [FiltroAdmin, string][] = [
  ["todas", "Todas"],
  ["sin-total", "Sin total de episodios"],
  ["con-proximo", "Con próximo episodio"],
  ["sin-proximo", "Sin próximo episodio"],
];

const pasa = (s: Serie): boolean => {
  if (estado.q && !normalizarBusqueda(`${s.t} ${s.alt || ""} ${s.id}`).includes(estado.q)) return false;
  switch (estado.filtro) {
    case "sin-total": return !s.total && !s.totalTodas;
    case "con-proximo": return !!s.nextWhen;
    case "sin-proximo": return !s.nextWhen;
    default: return true;
  }
};

const num = (v: number | null): string => (v == null ? "" : String(v));

function fila(s: Serie): string {
  const id = esc(s.id);
  return `
    <form class="adm-fila" data-id="${id}" novalidate>
      <img class="adm-thumb" src="${esc(s.thumb)}" alt="" loading="lazy">
      <div class="adm-titulo"><b>${esc(s.t)}</b><span>${id}${s.temp ? " · temporada actual" : ""}</span></div>
      <label>Total temporada<input name="total" type="number" min="1" inputmode="numeric" value="${num(s.total)}"></label>
      <label>Total de todas<input name="totalTodas" type="number" min="1" inputmode="numeric" value="${num(s.totalTodas)}"></label>
      <label>Próximo cap.<input name="nextEp" type="number" min="1" inputmode="numeric" value="${num(s.nextEp)}"></label>
      <label class="adm-cuando">Cuándo<input name="nextWhen" type="datetime-local" value="${textoACalendario(s.nextWhen)}"></label>
      <div class="adm-acciones"><button type="submit">Guardar</button><span class="adm-msg" role="status"></span></div>
    </form>`;
}

function pintarLista(): void {
  const items = estado.series.filter(pasa);
  const lista = raiz.querySelector<HTMLElement>("#adm-lista");
  const cuenta = raiz.querySelector<HTMLElement>("#adm-cuenta");
  if (!lista || !cuenta) return;
  cuenta.textContent = `${items.length} de ${estado.series.length} series`;
  lista.innerHTML = items.length
    ? items.map(fila).join("")
    : `<div class="vacio">${estado.cargando ? "Cargando…" : "Ninguna serie coincide."}</div>`;
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
    <div class="search">
      <input id="adm-q" type="search" placeholder="Buscar por nombre o id…" aria-label="Buscar serie" autocomplete="off" value="${esc(estado.q)}">
    </div>
    <div class="tabs" role="group" aria-label="Filtrar">
      ${FILTROS.map(([f, t]) => `<button class="chip" type="button" data-adm-f="${f}" aria-pressed="${f === estado.filtro}">${t}</button>`).join("")}
    </div>
    <p class="aviso" id="adm-cuenta"></p>
    <div class="adm-lista" id="adm-lista"></div>`;
  pintarLista();
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
  pintarLista();
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
  const nextWhen = calendarioATexto(campo("nextWhen"));
  if ((nextEp == null) !== (nextWhen == null)) return "El próximo capítulo y su fecha van juntos: llena los dos o deja ambos vacíos.";
  if (typeof total === "number" && typeof totalTodas === "number" && totalTodas < total) {
    return "El total de todas las temporadas no puede ser menor que el de la temporada.";
  }
  const nuevo = { total, totalTodas, nextEp, nextWhen } as CambiosSerie;
  const cambios: Record<string, unknown> = {};
  (Object.keys(nuevo) as (keyof CambiosSerie)[]).forEach(k => { if (nuevo[k] !== (s[k] ?? null)) cambios[k] = nuevo[k]; });
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
    Object.assign(s, cambios);
    ganchos.alCambiar(s.id, cambios);
    msg.textContent = "Guardado.";
  } catch (e) {
    console.error(e);
    msg.textContent = "No se pudo guardar (¿sesión vencida o sin permisos?).";
    msg.classList.add("error");
  } finally {
    boton.disabled = false;
  }
}

export function montarAdmin(el: HTMLElement, g: Ganchos & { volver: () => void }): void {
  raiz = el;
  ganchos = g;

  raiz.addEventListener("click", async ev => {
    const d = ev.target as HTMLElement;
    if (d.closest("#adm-volver")) { g.volver(); return; }
    if (d.closest("#adm-salir")) { await cerrarSesion(); pintarLogin("Sesión cerrada."); return; }
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
