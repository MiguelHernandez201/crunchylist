// Aplica supabase/schema.sql y supabase/seed.sql en una sola transacción.
// Uso: crear .env.local con SUPABASE_DB_URL y ejecutar `npm run db:apply`.
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local (ver .env.local.example).");
  process.exit(1);
}

// Se parsea a mano para tolerar contraseñas con "@" sin codificar y los corchetes
// que deja la plantilla de Supabase ("[YOUR-PASSWORD]").
function parsear(cadena) {
  const m = cadena.trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:/]+):(\d+)\/([^?]+)$/);
  if (!m) throw new Error("SUPABASE_DB_URL no tiene el formato postgresql://usuario:password@host:puerto/base");
  let [, user, password, host, port, database] = m;
  if (password.startsWith("[") && password.endsWith("]")) password = password.slice(1, -1);
  try { password = decodeURIComponent(password); } catch { /* se usa tal cual */ }
  return { user, password, host, port: Number(port), database };
}

const archivos = ["supabase/schema.sql", "supabase/seed.sql"];
const client = new pg.Client({ ...parsear(url), ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query("begin");
  for (const f of archivos) {
    await client.query(await readFile(f, "utf8"));
    console.log(`OK  ${f}`);
  }
  await client.query("commit");
  const { rows } = await client.query(
    "select (select count(*) from public.series) as series, (select count(*) from public.progreso) as progreso"
  );
  console.log(`Series: ${rows[0].series} · Progresos: ${rows[0].progreso}`);
} catch (e) {
  await client.query("rollback");
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
