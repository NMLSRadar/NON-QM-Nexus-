// Applies a .sql file to the Supabase Postgres database directly via `pg`,
// since this sandbox has no `psql` binary available. Usage:
//   node scripts/apply-sql.mjs supabase/some-migration.sql
import { Client } from "pg";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const sql = fs.readFileSync(file, "utf8");
try {
  await client.query(sql);
  console.log(`Applied: ${file}`);
} catch (err) {
  console.error(`FAILED applying ${file}:`, err.message);
  process.exit(1);
} finally {
  await client.end();
}
