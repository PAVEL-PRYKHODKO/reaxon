#!/usr/bin/env node
/**
 * Мінімальна перевірка репозиторію: синтаксис server/admin-loader, імпорт LiqPay.
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

execSync(`node --check ${JSON.stringify(path.join(root, "server.js"))}`, { stdio: "inherit" });
execSync(`node --check ${JSON.stringify(path.join(root, "admin-runtime-loader.js"))}`, { stdio: "inherit" });
execSync(`node --check ${JSON.stringify(path.join(root, "crm-sales-runtime-loader.js"))}`, {
  stdio: "inherit",
});
execSync(`node ${JSON.stringify(path.join(root, "scripts", "check-admin-crm-boundaries.mjs"))}`, {
  stdio: "inherit",
});
await import(path.join(root, "lib", "liqpay.js"));
console.log(
  "verify: ok (server.js, admin-runtime-loader.js, crm-sales-runtime-loader.js, admin/crm boundaries, lib/liqpay.js)"
);
