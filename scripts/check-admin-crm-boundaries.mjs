#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasScriptTag(html, scriptName) {
  const pattern = new RegExp(
    `<script\\s+[^>]*src=["'][^"']*${scriptName.replace(".", "\\.")}[^"']*["']`,
    "i"
  );
  return pattern.test(html);
}

const adminHtml = read("admin-panel.html");
const crmHtml = read("crm.html");
const crmSalesHtml = read("crm-sales.html");
const serverJs = read("server.js");

// 1) Единый портал admin-panel должен загружать только runtime-loader.
assert(
  hasScriptTag(adminHtml, "admin-runtime-loader.js"),
  "admin-panel.html должен подключать admin-runtime-loader.js"
);
assert(
  !hasScriptTag(adminHtml, "admin-panel.js"),
  "admin-panel.html не должен подключать admin-panel.js напрямую"
);
assert(
  !hasScriptTag(adminHtml, "admin-product-cards.js"),
  "admin-panel.html не должен подключать admin-product-cards.js напрямую"
);

// 2) CRM workspace (sales) должен загружаться только через runtime-loader.
assert(
  hasScriptTag(crmSalesHtml, "crm-sales-runtime-loader.js"),
  "crm-sales.html должен подключать crm-sales-runtime-loader.js"
);
assert(
  !hasScriptTag(crmSalesHtml, "crm-sales.js"),
  "crm-sales.html не должен подключать crm-sales.js напрямую"
);

// 3) Классическая CRM-страница для non-admin ролей должна оставаться самостоятельной.
assert(hasScriptTag(crmHtml, "crm.js"), "crm.html должен подключать crm.js");
assert(!hasScriptTag(crmHtml, "admin-panel.js"), "crm.html не должен подключать admin-panel.js");

// 4) Сервер должен блокировать прямой static-доступ к админским рантаймам.
assert(
  /app\.get\(\s*\[\s*"\/admin-panel\.js"\s*,\s*"\/admin-product-cards\.js"\s*,\s*"\/crm-sales\.js"\s*\]/.test(
    serverJs
  ),
  "server.js должен блокировать прямой static-доступ к admin-panel.js/admin-product-cards.js/crm-sales.js"
);

console.log("boundaries: ok (admin/crm runtime boundaries are enforced)");
