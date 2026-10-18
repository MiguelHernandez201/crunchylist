import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base relativa: funciona en GitHub Pages sin importar el nombre del repositorio
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate", // la versión nueva se activa sola; src/pwa.ts la registra y recarga o avisa
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CrunchyList",
        short_name: "CrunchyList",
        description: "Tablero de mi watchlist de Crunchyroll: progreso, prioridad, doblaje y emisión.",
        lang: "es",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#f6f5f2",
        theme_color: "#d9641e",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // La app (HTML, JS, CSS e íconos) se guarda al instalar. Las 138 miniaturas pesan ~7 MB: se guardan solo al verlas.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["thumbs135/**"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // La versión nueva se activa en cuanto se descarga y toma el control de las ventanas abiertas (ver src/pwa.ts).
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/thumbs135/"),
            handler: "CacheFirst",
            options: {
              cacheName: "miniaturas",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Las llamadas a Supabase no se interceptan: la propia app ya guarda su copia en localStorage.
      },
    }),
  ],
});
