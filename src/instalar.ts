// Instalación como aplicación (PWA).
// Chrome y Edge: el navegador avisa con "beforeinstallprompt" y se muestra un botón.
// iPhone / iPad (Safari): no existe ese aviso, así que se muestra una indicación de una línea.

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CLAVE_TIP_IOS = "cl_tip_ios_v1";

const yaInstalada = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const esIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

function tipYaCerrado(): boolean {
  try { return localStorage.getItem(CLAVE_TIP_IOS) === "1"; } catch { return false; }
}

export function montarInstalacion(): void {
  if (yaInstalada()) return;

  const boton = document.getElementById("btn-instalar") as HTMLButtonElement;
  let pendiente: EventoInstalacion | null = null;

  window.addEventListener("beforeinstallprompt", ev => {
    ev.preventDefault();
    pendiente = ev as EventoInstalacion;
    boton.hidden = false;
  });

  boton.addEventListener("click", async () => {
    if (!pendiente) return;
    await pendiente.prompt();
    await pendiente.userChoice;
    pendiente = null;
    boton.hidden = true;
  });

  window.addEventListener("appinstalled", () => { boton.hidden = true; pendiente = null; });

  if (esIOS() && !tipYaCerrado()) {
    const tip = document.getElementById("tip-ios") as HTMLElement;
    tip.hidden = false;
    document.getElementById("tip-ios-cerrar")!.addEventListener("click", () => {
      tip.hidden = true;
      try { localStorage.setItem(CLAVE_TIP_IOS, "1"); } catch { /* sin almacenamiento */ }
    });
  }
}
