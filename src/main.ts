import "./style.css";
import { abrirAdmin, montarAdmin } from "./admin";
import { TEMPORADA } from "./config";
import { ordenar, recalcularPrioridades } from "./prioridad";
import { filtrar, normalizarBusqueda, renderLista, renderResumen } from "./render";
import {
  seriesEnCache, progresoEnCache, cargarSeries, cargarProgreso, guardarProgreso, escucharProgreso,
} from "./datos";
import type { Filtro, MapaProgreso, Orden, Serie } from "./types";

interface Estado {
  series: Serie[];
  filter: Filtro;
  q: string;
  orden: Orden;
  editando: string | null;
  cargando: boolean;
}

const estado: Estado = {
  series: [],
  filter: "all",
  q: "",
  orden: "prioridad",
  editando: null,
  cargando: true,
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const aviso = (texto: string, error = false): void => {
  $("aviso").textContent = texto;
  $("aviso").classList.toggle("error", error);
};

function aplicarProgreso(mapa: MapaProgreso): void {
  estado.series.forEach(s => {
    if (mapa[s.id] != null) { s.vistos = mapa[s.id]; s.cur = mapa[s.id]; s.manual = true; }
  });
  recalcularPrioridades(estado.series);
}

function render(): void {
  const items = ordenar(filtrar(estado.series, estado), estado.orden);
  renderLista($("list"), items, estado);
  renderResumen($("summary"), estado.series);
  if (estado.series.length) {
    $("sub").textContent = `Las ${estado.series.length} series de tu watchlist. El chip DOB ES marca doblaje al español disponible.`;
  }
}

async function iniciar(): Promise<void> {
  $("temp-desde").textContent = TEMPORADA.desde;

  // 1. Pintar lo que haya en caché para abrir al instante
  const cache = seriesEnCache();
  if (cache.length) {
    estado.series = cache;
    aplicarProgreso(progresoEnCache());
  }
  render();

  // 2. Refrescar desde Supabase
  try {
    const [series, progreso] = await Promise.all([cargarSeries(), cargarProgreso()]);
    estado.series = series;
    aplicarProgreso(progreso);
    aviso("");
  } catch (e) {
    console.error(e);
    aviso(estado.series.length
      ? "Sin conexión con la base de datos: mostrando la última copia guardada."
      : "No se pudo cargar la lista desde la base de datos.", true);
  }
  estado.cargando = false;
  render();

  // 3. Cambios hechos desde otro dispositivo
  escucharProgreso((id, vistos) => {
    aplicarProgreso({ [id]: vistos });
    render();
  });
}

// --- Vista de administración (#admin) ---

function aplicarVista(): void {
  const admin = location.hash === "#admin";
  $("vista-lista").hidden = admin;
  $("vista-admin").hidden = !admin;
  if (admin) void abrirAdmin();
}

montarAdmin($("vista-admin"), {
  volver: () => { location.hash = ""; },
  alCambiar: (id, cambios) => {
    const s = estado.series.find(x => x.id === id);
    if (s) { Object.assign(s, cambios); recalcularPrioridades(estado.series); }
  },
});
$("btn-admin").addEventListener("click", () => { location.hash = "admin"; });
window.addEventListener("hashchange", () => { aplicarVista(); if (location.hash !== "#admin") render(); });

// --- Eventos ---

document.addEventListener("click", async ev => {
  const destino = ev.target as HTMLElement;

  const abrir = destino.closest<HTMLElement>(".upd");
  if (abrir) { estado.editando = abrir.dataset.id ?? null; render(); return; }

  const ok = destino.closest<HTMLElement>(".upd-ok");
  if (ok) {
    const s = estado.series.find(x => x.id === ok.dataset.id);
    const inp = ok.closest(".item")!.querySelector<HTMLInputElement>(".upd-in")!;
    const n = parseInt(inp.value, 10);
    if (!s || isNaN(n) || n < 0) { inp.classList.add("error"); return; }
    aplicarProgreso({ [s.id]: n });
    estado.editando = null;
    render();
    try {
      await guardarProgreso(s.id, s.t, n);
      aviso(`Guardado: ${s.t} → capítulo ${n}.`);
    } catch (e) {
      console.error(e);
      aviso("No se pudo guardar en la base de datos; quedó guardado solo en este navegador.", true);
    }
    return;
  }

  if (destino.closest(".upd-cancel")) { estado.editando = null; render(); }
});

const inputQ = $<HTMLInputElement>("q");
const btnLimpiar = $<HTMLButtonElement>("limpiar");

function limpiarBusqueda(): void {
  inputQ.value = "";
  estado.q = "";
  btnLimpiar.hidden = true;
  inputQ.focus();
  render();
}

inputQ.addEventListener("input", () => {
  estado.q = normalizarBusqueda(inputQ.value.trim());
  btnLimpiar.hidden = !inputQ.value;
  render();
});
inputQ.addEventListener("keydown", e => {
  if (e.key === "Escape" && inputQ.value) { e.preventDefault(); limpiarBusqueda(); }
});
btnLimpiar.addEventListener("click", limpiarBusqueda);

$<HTMLSelectElement>("sort").addEventListener("change", e => {
  estado.orden = (e.target as HTMLSelectElement).value as Orden;
  render();
});

document.querySelectorAll<HTMLButtonElement>(".chip").forEach(b => b.addEventListener("click", () => {
  estado.filter = b.dataset.f as Filtro;
  document.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  render();
}));

aplicarVista();
iniciar();
