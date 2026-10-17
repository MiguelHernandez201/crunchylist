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

## Propuestas desde AniList

El panel de administración tiene una pestaña **Propuestas**. Una Edge Function de Supabase (`supabase/functions/anilist-propuestas`) consulta AniList y escribe propuestas; **nada cambia en el catálogo hasta que un administrador las acepta**.

- **Vincular:** busca cada serie en AniList por título y propone su id (`series.anilist_id`). Sirve para que las demás propuestas sepan a qué serie de AniList corresponde. Cada coincidencia se marca *exacta* o *aproximada*; las dudosas se rechazan y el id se puede escribir a mano en la fila de la serie.
- **Próximo episodio:** para las series vinculadas propone el número y el **día** de emisión (sin hora), en la zona `America/Bogota`. Se cambia con el secreto `ZONA_HORARIA`.
- **Serie terminada:** si AniList la da por terminada, propone su total de episodios y quitar el próximo episodio.
- El doblaje no se toca: sigue siendo manual.

Puesta en marcha (una sola vez):

1. Ejecutar `supabase/schema.sql` en el *SQL Editor* de Supabase (es idempotente).
2. Iniciar sesión en la CLI: `npx supabase login`
3. Desplegar la función: `npx supabase functions deploy anilist-propuestas --project-ref cvlntgmdnkmynypmmrwy` (si pide Docker, añadir `--use-api`).
4. Opcional, otra zona horaria: `npx supabase secrets set ZONA_HORARIA=America/Mexico_City --project-ref cvlntgmdnkmynypmmrwy`
5. En el panel, pestaña *Propuestas* → *Buscar actualizaciones en AniList*. Cada pulsación vincula hasta 20 series (AniList limita las peticiones por minuto), así que con 138 series hay que repetirlo varias veces.

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
| `supabase/` | Esquema, datos iniciales y Edge Function de AniList |
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
