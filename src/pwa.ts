// Registro y actualización del service worker de la aplicación instalada.
//
// La versión nueva se descarga y se activa sola (registerType "autoUpdate" en vite.config.js), pero la ventana
// abierta seguiría con el código viejo hasta la próxima apertura. Aquí se cierra ese hueco:
//  - se busca una versión nueva al abrir, al volver a la app y cada 30 minutos (una app instalada puede pasar días abierta);
//  - si la versión nueva toma el control justo al abrir, la página se recarga sola;
//  - si llega más tarde, se avisa con un botón en lugar de recargar y perder lo que se esté escribiendo.

const VENTANA_RECARGA_AUTOMATICA_MS = 15_000;
const REVISION_PERIODICA_MS = 30 * 60 * 1000;

if ("serviceWorker" in navigator) {
  const inicio = Date.now();
  // Sin controlador = primera instalación: el primer cambio de control es el service worker que se adueña de la página, no una actualización.
  let teniaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const eraActualizacion = teniaControlador;
    teniaControlador = true;
    if (!eraActualizacion || recargando) return;
    const aviso = document.getElementById("aviso-version");
    if (Date.now() - inicio < VENTANA_RECARGA_AUTOMATICA_MS || !aviso) {
      recargando = true;
      location.reload();
    } else {
      aviso.hidden = false;
    }
  });

  document.getElementById("aviso-version")?.querySelector("button")?.addEventListener("click", () => {
    recargando = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(registro => {
      const buscar = (): void => { registro.update().catch(() => { /* sin conexión */ }); };
      setInterval(buscar, REVISION_PERIODICA_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscar(); });
      window.addEventListener("online", buscar);
    }).catch(e => console.error("No se pudo registrar el service worker:", e));
  });
}
