#!/usr/bin/env node
/**
 * Smoke-check for core runtime flow before deploy:
 * 1) auth login
 * 2) read products + admin site-content
 * 3) upload pack image
 * 4) verify image URL returns 200
 * 5) cleanup uploaded pack image
 */

const API_BASE = String(process.env.SMOKE_API_BASE || "http://localhost:3000").replace(/\/+$/, "");
const LOGIN_EMAIL = String(process.env.SMOKE_ADMIN_EMAIL || "pavel@dp-coatings.local").trim();
const LOGIN_PASSWORD = String(process.env.SMOKE_ADMIN_PASSWORD || "123456");
const PACK_KEY = String(process.env.SMOKE_PACK_KEY || "bucket:18").trim();

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=";

async function asJson(res) {
  return await res.json().catch(() => ({}));
}

async function mustOk(res, context) {
  if (res.ok) return;
  const body = await asJson(res);
  const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
  throw new Error(`${context}: ${msg}`);
}

function pickProductId(products) {
  const rows = Array.isArray(products) ? products : [];
  const preferred = rows.find((p) => String(p.id || "").startsWith("price-"));
  const fallback = rows.find((p) => String(p.id || "").trim());
  return String(preferred?.id || fallback?.id || "").trim();
}

async function main() {
  console.log(`[smoke] API base: ${API_BASE}`);
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  await mustOk(loginRes, "login failed");
  const loginData = await asJson(loginRes);
  const token = String(loginData?.token || "").trim();
  if (!token) throw new Error("login failed: empty token");

  const productsRes = await fetch(`${API_BASE}/api/site/products`, { cache: "no-store" });
  await mustOk(productsRes, "products fetch failed");
  const productsData = await asJson(productsRes);
  const productId = pickProductId(productsData?.products);
  if (!productId) throw new Error("products fetch failed: no product id available");
  console.log(`[smoke] product id: ${productId}`);

  const uploadRes = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(productId)}/image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      imageBase64: `data:image/png;base64,${tinyPngBase64}`,
      catalogPackKey: PACK_KEY,
    }),
  });
  await mustOk(uploadRes, "pack image upload failed");
  const uploadData = await asJson(uploadRes);
  const imageUrl = String(uploadData?.imageUrl || "").trim();
  if (!imageUrl) throw new Error("pack image upload failed: empty imageUrl");

  const imageRes = await fetch(`${API_BASE}${imageUrl}`);
  if (!imageRes.ok) throw new Error(`uploaded image url is not reachable: ${imageRes.status}`);
  console.log(`[smoke] image ok: ${imageUrl}`);

  const cleanupRes = await fetch(
    `${API_BASE}/api/admin/products/${encodeURIComponent(productId)}/image?catalogPackKey=${encodeURIComponent(PACK_KEY)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  await mustOk(cleanupRes, "cleanup failed");
  console.log("[smoke] cleanup ok");

  console.log("smoke-check: ok");
}

main().catch((err) => {
  console.error(`smoke-check: fail - ${err?.message || err}`);
  process.exit(1);
});

