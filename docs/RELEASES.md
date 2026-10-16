# Plan de releases

Estado: **v0.1 en curso**. Las versiones siguientes son propuestas y hay que evaluarlas antes de empezar cada una.

## v0.1 — Migración desde el artefacto (actual)

- Proyecto Vite + TypeScript estricto (sin framework) desplegado en GitHub Pages con GitHub Actions.
- Supabase como fuente de verdad. Tablas `series` (catálogo, datos en `jsonb`) y `progreso` (capítulos vistos).
- **Escritura con el link:** cualquiera que tenga la URL puede actualizar el progreso. No puede borrar ni tocar el catálogo. Fue una decisión consciente para no meter login todavía.
- Los datos de las series son la foto que se sacó con Claude (138 series, octubre de 2026). No se actualizan solos.
- Caché en `localStorage` para abrir al instante y sin conexión. Realtime para ver cambios hechos en otro dispositivo.
- Correcciones respecto al artefacto:
  - El estado se recalcula al cambiar el progreso.
  - Los textos de la temporada pasan a `src/config.ts`.
  - El HTML se escapa antes de pintarlo.

## v0.2 — Login (un solo usuario)

Objetivo: que solo tú puedas escribir.

- Iniciar sesión con Supabase Auth: enlace mágico por email o GitHub OAuth (falta decidir cuál).
- Cerrar el registro público en Supabase (*Auth → Sign In / Providers → Allow new users to sign up = off*).
- Cambiar las políticas de `progreso` de `anon` a `authenticated` y amarrarlas a tu `auth.uid()`.
- La lectura sigue pública, salvo que se decida otra cosa.

## v0.3 — Actualización del catálogo de series

Es un proceso **independiente del usuario**: episodios nuevos, fechas de emisión, doblaje, temporada actual.

- Separar el modelo de datos:
  - `series`: datos globales (`t`, `total`, `totalTodas`, `seasons`, `nextEp`, `nextWhen`, `fechaUlt`, `temp`, `audioES`, `dubES`, `estreno`…).
  - `watchlist`: datos de cada usuario (`addedPos`, `st`, `cur`, `vistos`, `etiqueta`).
- Pasar a columnas reales los campos que se filtran u ordenan (y dejar de guardarlos en `jsonb`).
- Calcular `temp` a partir de `fechaUlt` y de la fecha de inicio de temporada, en vez de guardarlo fijo.
- Alternativas que hay que evaluar:
  1. **Manual asistido.** Claude revisa Crunchyroll, genera un JSON y un script lo sube (upsert). Es lo que existe hoy, pero formalizado.
  2. **API pública de terceros.** Por ejemplo, la API GraphQL de AniList para episodios y fechas de emisión. Sirve para el calendario, pero no trae el doblaje al español de Crunchyroll.
  3. **Tarea programada** (GitHub Action con cron o Supabase Edge Function con `pg_cron`) que lee Crunchyroll. Crunchyroll no tiene API pública, así que esto es frágil (Cloudflare, cambios de HTML) y está en zona gris de sus términos de uso.
  4. **Combinada.** AniList para episodios y fechas de forma automática, y revisión manual para el doblaje.
- Las miniaturas podrían pasar a Supabase Storage para no redesplegar al agregar series.

## v0.4 — Multiusuario

- Agregar `user_id` en `watchlist` y `progreso`, con políticas por fila `user_id = auth.uid()`.
- Abrir el registro, o hacerlo por invitación.
- **Actualización del watchlist, por usuario** (un proceso distinto al del catálogo): agregar y quitar series, y quizá importar el watchlist de Crunchyroll (exportación manual o pegando una lista).
- Pensar si el catálogo se comparte entre usuarios (recomendado) o es propio de cada uno.

## Backlog (sin versión asignada)

- Tests unitarios de las reglas de prioridad (`src/prioridad.ts`) con Vitest.
- PWA: que se pueda instalar en el teléfono y usar sin conexión.
- Botones +1 / −1 para actualizar el progreso más rápido.
- Generar `supabase/seed.sql` a partir de un JSON con un script, en vez de mantenerlo a mano.
