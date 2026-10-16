# CrunchyList

Tablero de mi watchlist de Crunchyroll: progreso por serie, prioridad P1–P10, doblaje y emisión.
Vite + TypeScript + Supabase, publicado en GitHub Pages.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm run typecheck  # verificación de tipos (también corre en build)
```

La URL de Supabase y la publishable key están en `.env`. Son públicas: terminan en el bundle del navegador.

## Base de datos

1. Copiar `.env.local.example` a `.env.local` y poner la contraseña de la base de datos (este archivo no se sube a git).
2. Ejecutar `npm run db:apply`, que aplica `supabase/schema.sql` y `supabase/seed.sql` en una sola transacción.

Otra forma: pegar los dos archivos, en ese orden, en el *SQL Editor* de Supabase.

## Despliegue

Cada push a `main` corre `.github/workflows/deploy.yml`, que construye la app y la publica en GitHub Pages.
En el repositorio, ir a *Settings → Pages → Source* y elegir **GitHub Actions**.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `index.html` | Marcado de la página |
| `src/main.ts` | Estado, eventos y arranque |
| `src/types.ts` | Tipos del modelo (`Serie`, filtros, orden) |
| `src/datos.ts` | Supabase y la caché en `localStorage` |
| `src/prioridad.ts` | Reglas P1–P10, estado derivado y ordenamiento |
| `src/render.ts` | Tarjetas, resumen y filtros |
| `src/config.ts` | Temporada en curso y textos de las reglas |
| `public/thumbs135/` | Miniaturas de las series |
| `supabase/` | Esquema y datos iniciales |
| `docs/RELEASES.md` | Plan de releases |

## Reglas de prioridad

| Regla | Situación |
|---|---|
| P1 | Temporada actual, doblada, empezada |
| P2 | Temporada actual, doblada, sin empezar |
| P3 | Temporada actual, sin doblaje |
| P4 | Antigua, doblada, empezada |
| P5 | Antigua, doblada, sin empezar |
| P6 | Antigua, sin doblaje, empezada |
| P7 | Antigua, sin doblaje, sin empezar |
| P8 | Temporada actual, doblaje anunciado |
| P9 | Al día |
| P10 | Finalizada |

Si dos series tienen la misma regla, va primero la que tiene menos episodios pendientes y luego la que se agregó antes.
