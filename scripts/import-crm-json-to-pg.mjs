#!/usr/bin/env node
/**
 * Импорт crm-db.json → PostgreSQL (crm_state). Нужен DATABASE_URL.
 * Перезаписывает снимок id=1 (users + leads + meta).
 *
 *   npm run crm:import-json
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "crm-db.json");

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("Задайте DATABASE_URL в .env");
  process.exit(1);
}

const ssl =
  process.env.PGSSLMODE === "require" || url.includes("sslmode=require")
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "0" }
    : undefined;

const raw = fs.readFileSync(jsonPath, "utf-8");
const data = JSON.parse(raw);
if (!Array.isArray(data.users) || !Array.isArray(data.leads) || !data.meta) {
  console.error("crm-db.json: ожидаются users, leads, meta");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl, max: 2 });

const DDL = `
CREATE TABLE IF NOT EXISTS crm_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

async function main() {
  const c = await pool.connect();
  try {
    await c.query(DDL);
    await c.query(
      `INSERT INTO crm_state (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(data)]
    );
  } finally {
    c.release();
  }
  console.log("Готово: crm_state обновлён из", jsonPath);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
