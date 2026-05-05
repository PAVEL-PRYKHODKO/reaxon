/**
 * Загружает переменные из корня репозитория (рядом с `server.js`), не из `process.cwd()`.
 * Порядок: сначала `.env`, затем `post.env` (если есть) с override — удобно, если вы храните секреты в `post.env`.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const envPath = path.join(root, ".env");
const postEnvPath = path.join(root, "post.env");

function loadFile(filePath, label, override) {
  if (!fs.existsSync(filePath)) return;
  const r = dotenv.config({ path: filePath, override: Boolean(override) });
  if (r.error) console.warn(`[env] ${label} parse/load:`, r.error.message);
}

loadFile(envPath, ".env", false);
loadFile(postEnvPath, "post.env", true);
