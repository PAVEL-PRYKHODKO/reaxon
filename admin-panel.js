const token = localStorage.getItem("authToken") || "";
let apBootBlocked = false;
if (!token) {
  apBootBlocked = true;
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
      <section style="max-width:640px;width:100%;background:#111827;border:1px solid #334155;border-radius:14px;padding:22px">
        <h1 style="margin:0 0 10px;font-size:20px">Доступ в админ-панель</h1>
        <p style="margin:0 0 14px;color:#94a3b8;line-height:1.45">
          Сессия не найдена. Войдите под администратором.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a href="auth.html?next=admin.html" style="padding:9px 13px;border-radius:9px;background:#1d4ed8;color:#fff;text-decoration:none">Войти</a>
          <a href="index.html" style="padding:9px 13px;border-radius:9px;border:1px solid #475569;color:#e2e8f0;text-decoration:none">На главную</a>
        </div>
      </section>
    </main>
  `;
}

let authUser = {};
try {
  authUser = JSON.parse(localStorage.getItem("authUser") || "{}");
} catch {
  authUser = {};
}

let apCurrentPermissions = authUser.permissions && typeof authUser.permissions === "object" ? authUser.permissions : {};
let apRolePermissionRoles = [];
let apRolePermissionDefs = [];
let apRolePermissionMatrix = {};

function apCan(permission) {
  const roleNorm = String(authUser?.role || "").trim().toLowerCase();
  return roleNorm === "admin" || Boolean(apCurrentPermissions?.[permission]);
}

function apiUrl(p) {
  return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
}

async function apiAdmin(method, path, body) {
  const opts = {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const url = apiUrl(path);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText;
    const hint = res.status === 404 ? ` Проверьте, что API запущен и доступен по адресу: ${url}` : "";
    throw new Error((msg || "Ошибка запроса") + hint);
  }
  return data;
}

function mediaAbs(url) {
  if (!url || typeof url !== "string") return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = window.DP_API_BASE || "";
  if (!base) return url;
  return `${base.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

let publishedOverrides = {};
let draftOverrides = {};
/** @type {Map<string, { file: File, url: string, dataUrl?: string, dataUrlPromise?: Promise<string> }>} */
const previewBlobById = new Map();
/** Отдельные фото по фасовкам: ключ `${productId}\\x1e${catalogPackKey}` (например jar:19.7). */
const previewPackBlobById = new Map();
/** Регистрируются вызовы DELETE для фасовок до публикации: ключ staging. */
const pendingDeleteCatalogPackImages = new Set();
/** @type {{ file: File, url: string, ids: string[], dataUrl?: string, dataUrlPromise?: Promise<string> } | null} */
let bulkPreview = null;
/** Массовые операции с фото в Каталоге отключены (оставлены только карточечные текстовые/bulk-операции). */
const ENABLE_BULK_PHOTO_IN_CATALOG = false;
/** @type {Set<string>} */
const pendingDeleteImage = new Set();

let apPriceFilterQuery = "";
/** Индекс совпадения для кнопки «Найти позицию» (−1 = сброс при смене запроса). */
let apPriceFindCursor = -1;
const AP_PRICE_IMPORT_HISTORY_KEY = "apPriceImportHistory";
const AP_PRICE_IMPORT_HISTORY_MAX = 10;

let selectedProductId = null;
/** @type {Set<string>} */
const adminBulkSelectedIds = new Set();

/** Старые поля methods/cards не в форме v2 — сохраняем из последней загрузки с сервера. */
const apDeliveryLegacyByLang = { ru: {}, uk: {}, en: {} };

function cloneOverrides(obj) {
  try {
    return JSON.parse(JSON.stringify(obj && typeof obj === "object" ? obj : {}));
  } catch {
    return {};
  }
}

function revokePreviewBlobs() {
  for (const v of previewBlobById.values()) {
    try {
      URL.revokeObjectURL(v.url);
    } catch {
      /* ignore */
    }
  }
  previewBlobById.clear();
  for (const v of previewPackBlobById.values()) {
    try {
      URL.revokeObjectURL(v.url);
    } catch {
      /* ignore */
    }
  }
  previewPackBlobById.clear();
  if (bulkPreview) {
    try {
      URL.revokeObjectURL(bulkPreview.url);
    } catch {
      /* ignore */
    }
    bulkPreview = null;
  }
}

function clearImageStaging() {
  revokePreviewBlobs();
  pendingDeleteImage.clear();
  pendingDeleteCatalogPackImages.clear();
}

function ensureUaVisibilityRows() {
  const cfg = [
    ["ru", "Шапка", "Подвал", "H1 страницы", "Лид"],
    ["uk", "Шапка", "Підвал", "H1", "Лід"],
    ["en", "Utility", "Footer", "H1", "Lead"],
  ];
  for (const [lang, l1, l2, l3, l4] of cfg) {
    const nav = document.getElementById(`ap-delivery-${lang}-navUtility`);
    const fields = nav?.closest(".ap-delivery-fields");
    if (!fields || fields.querySelector(".ap-ua-vis-row")) continue;
    const div = document.createElement("div");
    div.className = "ap-ua-vis-row";
    div.innerHTML = `
      <p class="ap-muted ap-text-compact" style="margin:0 0 0.35rem">Показ элементов на сайте</p>
      <div class="ap-ua-vis-grid">
        <label class="ap-deep-inline"><input type="checkbox" id="ap-delivery-${lang}-navUtilityVis" checked /> ${l1}</label>
        <label class="ap-deep-inline"><input type="checkbox" id="ap-delivery-${lang}-footerLinkVis" checked /> ${l2}</label>
        <label class="ap-deep-inline"><input type="checkbox" id="ap-delivery-${lang}-pageH1Vis" checked /> ${l3}</label>
        <label class="ap-deep-inline"><input type="checkbox" id="ap-delivery-${lang}-pageLeadVis" checked /> ${l4}</label>
      </div>`;
    fields.insertBefore(div, fields.firstChild);
  }
}

function buildApDeliveryV2FormHTML(lang) {
  const L = lang;
  const fq = (i) => `
    <div class="ap-deep-itemrow ap-dv2-faq-row">
      <span class="ap-muted" style="min-width:4rem">FAQ ${i + 1}</span>
      <label class="ap-field-label ap-delivery-card-span">Вопрос <input type="text" id="ap-dv2-${L}-fq${i}-q" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label ap-delivery-card-span">Ответ <textarea id="ap-dv2-${L}-fq${i}-body" class="ap-delivery-textarea" rows="2" maxlength="8000"></textarea></label>
    </div>`;
  return `
<div class="ap-delivery-v2-form" data-ap-dv2-lang="${L}">
  <p class="ap-muted ap-text-compact" style="margin:0 0 0.5rem">Макет delivery.html v2: левая колонка, FAQ, три строки справа. URL картинок — как в каталоге (/uploads/… или assets/…).</p>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">Широкая карточка (Запорожье)</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-w-vis" checked /> Показать блок</label>
      <label class="ap-field-label">Заголовок <input type="text" id="ap-dv2-${L}-w-title" class="ap-search ap-delivery-input" maxlength="240" /></label>
      <label class="ap-field-label">Подзаголовок <input type="text" id="ap-dv2-${L}-w-sub" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <div class="ap-dv2-grid2">
        <label class="ap-field-label">Подпись «от» <input type="text" id="ap-dv2-${L}-w-pfl" class="ap-search ap-delivery-input" maxlength="40" /></label>
        <label class="ap-field-label">Цена от <input type="text" id="ap-dv2-${L}-w-pf" class="ap-search ap-delivery-input" maxlength="80" /></label>
        <label class="ap-field-label">Подпись «до» <input type="text" id="ap-dv2-${L}-w-ptl" class="ap-search ap-delivery-input" maxlength="40" /></label>
        <label class="ap-field-label">Цена до <input type="text" id="ap-dv2-${L}-w-pt" class="ap-search ap-delivery-input" maxlength="80" /></label>
      </div>
      <label class="ap-field-label">Кнопка (текст) <input type="text" id="ap-dv2-${L}-w-cta" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Кнопка (ссылка) <input type="text" id="ap-dv2-${L}-w-href" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Картинка URL <input type="text" id="ap-dv2-${L}-w-img" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Alt картинки <input type="text" id="ap-dv2-${L}-w-alt" class="ap-search ap-delivery-input" maxlength="400" /></label>
    </div>
  </details>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">Узкая карточка (По Украине)</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-c-vis" checked /> Показать блок</label>
      <label class="ap-field-label">Заголовок <input type="text" id="ap-dv2-${L}-c-title" class="ap-search ap-delivery-input" maxlength="240" /></label>
      <label class="ap-field-label">Подзаголовок <input type="text" id="ap-dv2-${L}-c-sub" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Текст <textarea id="ap-dv2-${L}-c-note" class="ap-delivery-textarea" rows="2" maxlength="4000"></textarea></label>
    </div>
  </details>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">FAQ</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-f-vis" checked /> Показать блок</label>
      <label class="ap-field-label">Заголовок секции <input type="text" id="ap-dv2-${L}-f-title" class="ap-search ap-delivery-input" maxlength="240" /></label>
      ${[0, 1, 2, 3, 4].map((i) => fq(i)).join("")}
    </div>
  </details>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">Строка: Запорожье / область</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-rl-vis" checked /> Показать</label>
      <label class="ap-field-label">Картинка URL <input type="text" id="ap-dv2-${L}-rl-img" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Alt <input type="text" id="ap-dv2-${L}-rl-alt" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Заголовок (H3) <input type="text" id="ap-dv2-${L}-rl-h3" class="ap-search ap-delivery-input" maxlength="240" /></label>
      <label class="ap-field-label">Плашка 1 <input type="text" id="ap-dv2-${L}-rl-p1" class="ap-search ap-delivery-input" maxlength="200" /></label>
      <label class="ap-field-label">Плашка 2 <input type="text" id="ap-dv2-${L}-rl-p2" class="ap-search ap-delivery-input" maxlength="200" /></label>
      <label class="ap-field-label">Текст цены (до жирного) <input type="text" id="ap-dv2-${L}-rl-pl" class="ap-search ap-delivery-input" maxlength="120" /></label>
      <label class="ap-field-label">Подпись к 1-й сумме (колонка, как в карточке) <input type="text" id="ap-dv2-${L}-rl-pfl" class="ap-search ap-delivery-input" maxlength="40" /></label>
      <label class="ap-field-label">Подпись ко 2-й сумме <input type="text" id="ap-dv2-${L}-rl-ptl" class="ap-search ap-delivery-input" maxlength="40" /></label>
      <label class="ap-field-label">Жирный фрагмент 1 <input type="text" id="ap-dv2-${L}-rl-pfv" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Текст между жирными <input type="text" id="ap-dv2-${L}-rl-pm" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Жирный фрагмент 2 <input type="text" id="ap-dv2-${L}-rl-pt" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Окончание строки цены <input type="text" id="ap-dv2-${L}-rl-px" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Кнопка (текст) <input type="text" id="ap-dv2-${L}-rl-ct" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Кнопка (href) <input type="text" id="ap-dv2-${L}-rl-ch" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Сайдбар: заголовок 1 <input type="text" id="ap-dv2-${L}-rl-a1t" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Сайдбар: текст 1 <textarea id="ap-dv2-${L}-rl-a1p" class="ap-delivery-textarea" rows="2" maxlength="4000"></textarea></label>
      <label class="ap-field-label">Сайдбар: заголовок 2 <input type="text" id="ap-dv2-${L}-rl-a2t" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Сайдбар: список (строка на пункт) <textarea id="ap-dv2-${L}-rl-a2ul" class="ap-delivery-textarea" rows="3" maxlength="4000"></textarea></label>
    </div>
  </details>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">Строка: По Украине</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-rn-vis" checked /> Показать</label>
      <label class="ap-field-label">Картинка URL <input type="text" id="ap-dv2-${L}-rn-img" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Alt <input type="text" id="ap-dv2-${L}-rn-alt" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Заголовок (H3) <input type="text" id="ap-dv2-${L}-rn-h3" class="ap-search ap-delivery-input" maxlength="240" /></label>
      <label class="ap-field-label">Плашка 1 <input type="text" id="ap-dv2-${L}-rn-p1" class="ap-search ap-delivery-input" maxlength="200" /></label>
      <label class="ap-field-label">Плашка 2 <input type="text" id="ap-dv2-${L}-rn-p2" class="ap-search ap-delivery-input" maxlength="200" /></label>
      <label class="ap-field-label">Текст цены (до жирного) <input type="text" id="ap-dv2-${L}-rn-pl" class="ap-search ap-delivery-input" maxlength="120" /></label>
      <label class="ap-field-label">Жирный 1 <input type="text" id="ap-dv2-${L}-rn-pfv" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Между жирными <input type="text" id="ap-dv2-${L}-rn-pm" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Жирный 2 <input type="text" id="ap-dv2-${L}-rn-pt" class="ap-search ap-delivery-input" maxlength="80" /></label>
      <label class="ap-field-label">Окончание <input type="text" id="ap-dv2-${L}-rn-px" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Кнопка (текст) <input type="text" id="ap-dv2-${L}-rn-ct" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Кнопка (href) <input type="text" id="ap-dv2-${L}-rn-ch" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Сайдбар: заголовок 1 <input type="text" id="ap-dv2-${L}-rn-a1t" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Сайдбар: текст 1 <textarea id="ap-dv2-${L}-rn-a1p" class="ap-delivery-textarea" rows="2" maxlength="4000"></textarea></label>
      <label class="ap-field-label">Сайдбар: заголовок 2 <input type="text" id="ap-dv2-${L}-rn-a2t" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Сайдбар: список (строка на пункт) <textarea id="ap-dv2-${L}-rn-a2ul" class="ap-delivery-textarea" rows="3" maxlength="4000"></textarea></label>
    </div>
  </details>
  <details class="ap-delivery-details ap-dv2-sub" open>
    <summary class="ap-delivery-summary">Строка: Самовывоз</summary>
    <div class="ap-dv2-fields">
      <label class="ap-deep-inline"><input type="checkbox" id="ap-dv2-${L}-rp-vis" checked /> Показать</label>
      <label class="ap-field-label">Картинка URL <input type="text" id="ap-dv2-${L}-rp-img" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Alt <input type="text" id="ap-dv2-${L}-rp-alt" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Заголовок (H3) <input type="text" id="ap-dv2-${L}-rp-h3" class="ap-search ap-delivery-input" maxlength="240" /></label>
      <label class="ap-field-label">Адрес и контакты (несколько строк) <textarea id="ap-dv2-${L}-rp-addr" class="ap-delivery-textarea" rows="4" maxlength="4000"></textarea></label>
      <label class="ap-field-label">Кнопка (текст) <input type="text" id="ap-dv2-${L}-rp-ct" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Кнопка (href) <input type="text" id="ap-dv2-${L}-rp-ch" class="ap-search ap-delivery-input" maxlength="400" /></label>
      <label class="ap-field-label">Сайдбар: заголовок <input type="text" id="ap-dv2-${L}-rp-at" class="ap-search ap-delivery-input" maxlength="160" /></label>
      <label class="ap-field-label">Сайдбар: текст <textarea id="ap-dv2-${L}-rp-ap" class="ap-delivery-textarea" rows="3" maxlength="4000"></textarea></label>
    </div>
  </details>
</div>`;
}

function ensureApDeliveryV2Editors() {
  if (document.getElementById("ap-dv2-ru-w-title")) return;
  for (const lang of ["ru", "uk", "en"]) {
    const mount = document.getElementById(`ap-delivery-v2-mount-${lang}`);
    if (mount) mount.innerHTML = buildApDeliveryV2FormHTML(lang);
  }
}

function fillApDeliveryPageV2(lang, v2) {
  const v = v2 && typeof v2 === "object" ? v2 : {};
  const w = v.wideCard && typeof v.wideCard === "object" ? v.wideCard : {};
  const c = v.sideCard && typeof v.sideCard === "object" ? v.sideCard : {};
  const f = v.faq && typeof v.faq === "object" ? v.faq : {};
  const rows = v.rows && typeof v.rows === "object" ? v.rows : {};
  const rl = rows.local && typeof rows.local === "object" ? rows.local : {};
  const rn = rows.national && typeof rows.national === "object" ? rows.national : {};
  const rp = rows.pickup && typeof rows.pickup === "object" ? rows.pickup : {};

  const set = (id, val) => {
    const el = document.getElementById(`ap-dv2-${lang}-${id}`);
    if (el) el.value = val != null ? String(val) : "";
  };
  const chk = (id, val) => {
    const el = document.getElementById(`ap-dv2-${lang}-${id}`);
    if (el && el instanceof HTMLInputElement) el.checked = val !== false;
  };

  chk("w-vis", w.visible);
  set("w-title", w.title);
  set("w-sub", w.sub);
  set("w-pfl", w.priceFromLabel);
  set("w-pf", w.priceFrom);
  set("w-ptl", w.priceToLabel);
  set("w-pt", w.priceTo);
  set("w-cta", w.ctaLabel);
  set("w-href", w.ctaHref);
  set("w-img", w.imageUrl);
  set("w-alt", w.imageAlt);

  chk("c-vis", c.visible);
  set("c-title", c.title);
  set("c-sub", c.sub);
  set("c-note", c.note);

  chk("f-vis", f.visible);
  set("f-title", f.title);
  const items = Array.isArray(f.items) ? f.items : [];
  for (let i = 0; i < 5; i++) {
    const it = items[i] && typeof items[i] === "object" ? items[i] : {};
    set(`fq${i}-q`, it.q);
    set(`fq${i}-body`, it.body);
  }

  chk("rl-vis", rl.visible);
  set("rl-img", rl.imageUrl);
  set("rl-alt", rl.imageAlt);
  set("rl-h3", rl.title);
  set("rl-p1", rl.pill1);
  set("rl-p2", rl.pill2);
  set("rl-pl", rl.priceLead);
  set("rl-pfl", rl.priceFromLabel);
  set("rl-ptl", rl.priceToLabel);
  set("rl-pfv", rl.priceFrom);
  set("rl-pm", rl.priceMid);
  set("rl-pt", rl.priceTo);
  set("rl-px", rl.priceTrail);
  set("rl-ct", rl.ctaLabel);
  set("rl-ch", rl.ctaHref);
  set("rl-a1t", rl.aside1Title);
  set("rl-a1p", rl.aside1Text);
  set("rl-a2t", rl.aside2Title);
  set("rl-a2ul", rl.aside2List);

  chk("rn-vis", rn.visible);
  set("rn-img", rn.imageUrl);
  set("rn-alt", rn.imageAlt);
  set("rn-h3", rn.title);
  set("rn-p1", rn.pill1);
  set("rn-p2", rn.pill2);
  set("rn-pl", rn.priceLead);
  set("rn-pfv", rn.priceFrom);
  set("rn-pm", rn.priceMid);
  set("rn-pt", rn.priceTo);
  set("rn-px", rn.priceTrail);
  set("rn-ct", rn.ctaLabel);
  set("rn-ch", rn.ctaHref);
  set("rn-a1t", rn.aside1Title);
  set("rn-a1p", rn.aside1Text);
  set("rn-a2t", rn.aside2Title);
  set("rn-a2ul", rn.aside2List);

  chk("rp-vis", rp.visible);
  set("rp-img", rp.imageUrl);
  set("rp-alt", rp.imageAlt);
  set("rp-h3", rp.title);
  set("rp-addr", rp.addressText);
  set("rp-ct", rp.ctaLabel);
  set("rp-ch", rp.ctaHref);
  set("rp-at", rp.asideTitle);
  set("rp-ap", rp.asideText);
}

function collectApDeliveryPageV2(lang) {
  const g = (id) => document.getElementById(`ap-dv2-${lang}-${id}`)?.value ?? "";
  const c = (id) => document.getElementById(`ap-dv2-${lang}-${id}`)?.checked !== false;
  const items = [];
  for (let i = 0; i < 5; i++) {
    items.push({ q: String(g(`fq${i}-q`)), body: String(g(`fq${i}-body`)) });
  }
  return {
    wideCard: {
      visible: c("w-vis"),
      title: String(g("w-title")),
      sub: String(g("w-sub")),
      priceFromLabel: String(g("w-pfl")),
      priceFrom: String(g("w-pf")),
      priceToLabel: String(g("w-ptl")),
      priceTo: String(g("w-pt")),
      ctaLabel: String(g("w-cta")),
      ctaHref: String(g("w-href")),
      imageUrl: String(g("w-img")),
      imageAlt: String(g("w-alt")),
    },
    sideCard: {
      visible: c("c-vis"),
      title: String(g("c-title")),
      sub: String(g("c-sub")),
      note: String(g("c-note")),
    },
    faq: {
      visible: c("f-vis"),
      title: String(g("f-title")),
      items,
    },
    rows: {
      local: {
        visible: c("rl-vis"),
        imageUrl: String(g("rl-img")),
        imageAlt: String(g("rl-alt")),
        title: String(g("rl-h3")),
        pill1: String(g("rl-p1")),
        pill2: String(g("rl-p2")),
        priceLead: String(g("rl-pl")),
        priceFromLabel: String(g("rl-pfl")),
        priceToLabel: String(g("rl-ptl")),
        priceFrom: String(g("rl-pfv")),
        priceMid: String(g("rl-pm")),
        priceTo: String(g("rl-pt")),
        priceTrail: String(g("rl-px")),
        ctaLabel: String(g("rl-ct")),
        ctaHref: String(g("rl-ch")),
        aside1Title: String(g("rl-a1t")),
        aside1Text: String(g("rl-a1p")),
        aside2Title: String(g("rl-a2t")),
        aside2List: String(g("rl-a2ul")),
      },
      national: {
        visible: c("rn-vis"),
        imageUrl: String(g("rn-img")),
        imageAlt: String(g("rn-alt")),
        title: String(g("rn-h3")),
        pill1: String(g("rn-p1")),
        pill2: String(g("rn-p2")),
        priceLead: String(g("rn-pl")),
        priceFrom: String(g("rn-pfv")),
        priceMid: String(g("rn-pm")),
        priceTo: String(g("rn-pt")),
        priceTrail: String(g("rn-px")),
        ctaLabel: String(g("rn-ct")),
        ctaHref: String(g("rn-ch")),
        aside1Title: String(g("rn-a1t")),
        aside1Text: String(g("rn-a1p")),
        aside2Title: String(g("rn-a2t")),
        aside2List: String(g("rn-a2ul")),
      },
      pickup: {
        visible: c("rp-vis"),
        imageUrl: String(g("rp-img")),
        imageAlt: String(g("rp-alt")),
        title: String(g("rp-h3")),
        addressText: String(g("rp-addr")),
        ctaLabel: String(g("rp-ct")),
        ctaHref: String(g("rp-ch")),
        asideTitle: String(g("rp-at")),
        asideText: String(g("rp-ap")),
      },
    },
  };
}

function fillApDeliveryForm(deliveryUkraine) {
  const d = deliveryUkraine && typeof deliveryUkraine === "object" ? deliveryUkraine : {};
  const langs = ["ru", "uk", "en"];
  ensureUaVisibilityRows();
  ensureApDeliveryV2Editors();
  for (const lang of langs) {
    const row = d[lang] && typeof d[lang] === "object" ? d[lang] : {};
    apDeliveryLegacyByLang[lang] = {
      methodsHeading: row.methodsHeading,
      methodsHeadingVisible: row.methodsHeadingVisible,
      methodsIntro: row.methodsIntro,
      methodsIntroVisible: row.methodsIntroVisible,
      cards: Array.isArray(row.cards) ? row.cards : [],
    };
    const setVal = (field, val) => {
      const el = document.getElementById(`ap-delivery-${lang}-${field}`);
      if (el) el.value = val != null ? String(val) : "";
    };
    const setChk = (id, val) => {
      const el = document.getElementById(`ap-delivery-${lang}-${id}`);
      if (el && el instanceof HTMLInputElement) el.checked = val !== false;
    };
    setVal("navUtility", row.navUtility);
    setVal("footerLink", row.footerLink);
    setVal("pageH1", row.pageH1);
    setVal("pageLead", row.pageLead);
    setChk("navUtilityVis", row.navUtilityVisible);
    setChk("footerLinkVis", row.footerLinkVisible);
    setChk("pageH1Vis", row.pageH1Visible);
    setChk("pageLeadVis", row.pageLeadVisible);
    fillApDeliveryPageV2(lang, row.pageV2);
  }
  refreshAllApDeliveryPreviews();
}

function collectApDeliveryLangPayload(lang) {
  const g = (field) => document.getElementById(`ap-delivery-${lang}-${field}`)?.value ?? "";
  const gChk = (id) => document.getElementById(`ap-delivery-${lang}-${id}`)?.checked !== false;
  const leg = apDeliveryLegacyByLang[lang] && typeof apDeliveryLegacyByLang[lang] === "object" ? apDeliveryLegacyByLang[lang] : {};
  const cards = Array.isArray(leg.cards) ? leg.cards : [];
  const cardPayload = [];
  for (let i = 0; i < 12; i++) {
    const c = cards[i] && typeof cards[i] === "object" ? cards[i] : {};
    cardPayload.push({
      badge: String(c.badge ?? ""),
      title: String(c.title ?? ""),
      body: String(c.body ?? ""),
      visible: c.visible !== false,
      icon: String(c.icon ?? ""),
      imageUrl: String(c.imageUrl ?? ""),
    });
  }
  return {
    navUtility: String(g("navUtility")),
    navUtilityVisible: gChk("navUtilityVis"),
    footerLink: String(g("footerLink")),
    footerLinkVisible: gChk("footerLinkVis"),
    pageH1: String(g("pageH1")),
    pageH1Visible: gChk("pageH1Vis"),
    pageLead: String(g("pageLead")),
    pageLeadVisible: gChk("pageLeadVis"),
    methodsHeading: String(leg.methodsHeading ?? ""),
    methodsHeadingVisible: leg.methodsHeadingVisible !== false,
    methodsIntro: String(leg.methodsIntro ?? ""),
    methodsIntroVisible: leg.methodsIntroVisible !== false,
    cards: cardPayload,
    pageV2: collectApDeliveryPageV2(lang),
  };
}

function collectApDeliveryPayload() {
  const langs = ["ru", "uk", "en"];
  const out = {};
  for (const lang of langs) {
    out[lang] = collectApDeliveryLangPayload(lang);
  }
  return out;
}

async function fetchDeliveryCopyPublicFallback() {
  if (typeof window.dpApiUrl !== "function") return null;
  try {
    const r = await fetch(window.dpApiUrl("/api/site/delivery-copy"), { credentials: "same-origin" });
    if (!r.ok) return null;
    const j = await r.json();
    return j.deliveryUkraine && typeof j.deliveryUkraine === "object" ? j.deliveryUkraine : null;
  } catch {
    return null;
  }
}

function bumpApAdminImageCacheToken() {
  window.__AP_IMG_BUST = Date.now();
}

/**
 * URL картинки товара для превью в админке: dpResolveMediaUrl + токен, чтобы после F5 / публикации не тянулся старый кэш.
 */
function adminProductOverrideImageSrc(overridePath) {
  const s = String(overridePath || "").trim();
  if (!s) return "";
  let out;
  if (/^https?:\/\//i.test(s) || s.startsWith("data:")) {
    out = s;
  } else if (typeof window.dpResolveMediaUrl === "function") {
    out = window.dpResolveMediaUrl(s) || mediaAbs(s);
  } else {
    out = mediaAbs(s);
  }
  if (out && /\/uploads\/products\//i.test(out)) {
    const b = window.__AP_IMG_BUST;
    if (b != null && String(b) !== "") {
      out += out.includes("?") ? `&apiv=${encodeURIComponent(String(b))}` : `?apiv=${encodeURIComponent(String(b))}`;
    }
  }
  return out;
}

async function loadPublishedOverridesFromServer() {
  const data = await apiAdmin("GET", "/api/admin/site-content");
  publishedOverrides =
    data.productOverrides && typeof data.productOverrides === "object" ? data.productOverrides : {};
  let du = data.deliveryUkraine && typeof data.deliveryUkraine === "object" ? data.deliveryUkraine : null;
  if (!du) {
    du = await fetchDeliveryCopyPublicFallback();
  }
  fillApDeliveryForm(du || {});
  bumpApAdminImageCacheToken();
}

/** После публикации — актуальный revision для ?v= у /uploads/products/ и overrides в window (как у посетителей). */
async function refreshPublicOverridesAndRevision() {
  if (typeof window.dpApiUrl !== "function") return;
  try {
    const r = await fetch(window.dpApiUrl("/api/site/product-overrides"), { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    if (data && data.productOverrides && typeof data.productOverrides === "object") {
      window.DP_PRODUCT_OVERRIDES = data.productOverrides;
    }
    if (data && data.siteContentRevision != null) {
      window.__DP_SITE_CONTENT_REVISION = data.siteContentRevision;
    }
    bumpApAdminImageCacheToken();
  } catch {
    /* ignore */
  }
}

function resetDraftFromPublished() {
  draftOverrides = cloneOverrides(publishedOverrides);
}

async function loadSiteOverrides() {
  await loadPublishedOverridesFromServer();
  resetDraftFromPublished();
  clearImageStaging();
}

function ensureDraftEntry(id) {
  const sid = String(id);
  if (!draftOverrides[sid]) draftOverrides[sid] = cloneOverrides(publishedOverrides[sid] || {});
}

const AP_DETAIL_KEYS = [
  "detailSpecRows",
  "detailCharacteristicsIntro",
  "detailApplication",
  "detailPrepBase",
  "detailPrepProduct",
  "detailPainting",
  "detailExpertTips",
  "detailTopBadges",
  "detailFiles",
  "detailPackOptions",
];

const AP_DETAIL_ARRAY_KEYS = new Set([
  "detailSpecRows",
  "detailPrepBase",
  "detailPrepProduct",
  "detailPainting",
  "detailExpertTips",
  "detailTopBadges",
  "detailFiles",
  "detailPackOptions",
]);

function productDetailLib() {
  return window.DP_PRODUCT_DETAIL_DEFAULTS || null;
}

function formatSpecRowsTextarea(pairs) {
  if (!Array.isArray(pairs)) return "";
  return pairs.map(([k, v]) => `${String(k).trim()} | ${String(v).trim()}`).join("\n");
}

function parseSpecRowsTextarea(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (line.includes("\t")) {
      const idx = line.indexOf("\t");
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out.push([k, v]);
      continue;
    }
    const spaced = line.indexOf(" | ");
    if (spaced !== -1) {
      const k = line.slice(0, spaced).trim();
      const v = line.slice(spaced + 3).trim();
      if (k) out.push([k, v]);
      continue;
    }
    const pipe = line.indexOf("|");
    if (pipe !== -1) {
      const k = line.slice(0, pipe).trim();
      const v = line.slice(pipe + 1).trim();
      if (k) out.push([k, v]);
    }
  }
  return out;
}

function formatLines(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.map((x) => String(x).trim()).filter(Boolean).join("\n");
}

function parseLinesText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatExpertTipsTextarea(tips) {
  if (!Array.isArray(tips)) return "";
  return tips
    .map((t) => {
      if (!t || typeof t !== "object") return "";
      const title = String(t.title || "").trim();
      const url = String(t.url || "").trim();
      const source = String(t.source || "").trim();
      if (!title || !url) return "";
      return `${title} | ${url} | ${source}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseExpertTipsTextarea(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(" | ").map((s) => s.trim());
    if (parts.length < 2) continue;
    const title = parts[0];
    const url = parts[1];
    const source = parts.slice(2).join(" | ") || "ссылка";
    if (title && /^https?:\/\//i.test(url)) out.push({ title, url, source });
  }
  return out;
}

function formatFilesTextarea(files) {
  if (!Array.isArray(files)) return "";
  return files
    .map((f) => {
      if (!f || typeof f !== "object") return "";
      const label = String(f.label || "").trim();
      const href = String(f.href || "").trim();
      const size = String(f.size || "").trim() || "—";
      if (!label || !href) return "";
      return `${label} | ${href} | ${size}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseFilesTextarea(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(" | ").map((s) => s.trim());
    if (parts.length < 2) continue;
    out.push({
      label: parts[0],
      href: parts[1],
      size: parts.slice(2).join(" | ") || "—",
    });
  }
  return out;
}

function normalizeSpecRowsFromOv(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const out = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      const k = String(row[0]).trim();
      const v = String(row[1]).trim();
      if (k) out.push([k, v]);
    } else if (row && typeof row === "object") {
      const k = String(row.key ?? row.label ?? "").trim();
      const v = String(row.value ?? "").trim();
      if (k) out.push([k, v]);
    }
  }
  return out.length ? out : [];
}

function mergedProductDetailForEditor(product, ov) {
  const lib = productDetailLib();
  const defs =
    lib && typeof lib.getDefaults === "function"
      ? lib.getDefaults(product)
      : {
          specRows: [],
          characteristicsIntro: "",
          applicationText: "",
          prepBase: [],
          prepProduct: [],
          painting: [],
          expertTips: [],
          topBadges: [],
          files: [],
        };
  const o = ov || {};
  const spec = Object.prototype.hasOwnProperty.call(o, "detailSpecRows")
    ? normalizeSpecRowsFromOv(o.detailSpecRows) ?? []
    : defs.specRows;
  const charIntro = Object.prototype.hasOwnProperty.call(o, "detailCharacteristicsIntro")
    ? String(o.detailCharacteristicsIntro ?? "")
    : defs.characteristicsIntro;
  const application = Object.prototype.hasOwnProperty.call(o, "detailApplication")
    ? String(o.detailApplication ?? "")
    : defs.applicationText;
  const prepBase = Object.prototype.hasOwnProperty.call(o, "detailPrepBase")
    ? Array.isArray(o.detailPrepBase)
      ? o.detailPrepBase.map(String)
      : []
    : defs.prepBase.slice();
  const prepProduct = Object.prototype.hasOwnProperty.call(o, "detailPrepProduct")
    ? Array.isArray(o.detailPrepProduct)
      ? o.detailPrepProduct.map(String)
      : []
    : defs.prepProduct.slice();
  const painting = Object.prototype.hasOwnProperty.call(o, "detailPainting")
    ? Array.isArray(o.detailPainting)
      ? o.detailPainting.map(String)
      : []
    : defs.painting.slice();
  const tips = Object.prototype.hasOwnProperty.call(o, "detailExpertTips")
    ? Array.isArray(o.detailExpertTips)
      ? o.detailExpertTips
      : defs.expertTips.map((x) => ({ ...x }))
    : defs.expertTips.map((x) => ({ ...x }));
  const badges = Object.prototype.hasOwnProperty.call(o, "detailTopBadges")
    ? Array.isArray(o.detailTopBadges)
      ? o.detailTopBadges.map(String)
      : []
    : defs.topBadges.slice();
  const files = Object.prototype.hasOwnProperty.call(o, "detailFiles")
    ? Array.isArray(o.detailFiles)
      ? o.detailFiles
      : defs.files.map((x) => ({ ...x }))
    : defs.files.map((x) => ({ ...x }));
  return {
    specRows: spec,
    charIntro,
    application,
    prepBase,
    prepProduct,
    painting,
    tips,
    badges,
    files,
  };
}

function collectPackOptionsFromDom(bodyId = "ap-pack-options-body") {
  const body = document.getElementById(bodyId);
  if (!body) return [];
  const out = [];
  apPackTableDataRows(body).forEach((tr) => {
    const kind = tr.querySelector(".ap-pack-kind")?.value || "jar";
    const jarEl = tr.querySelector(".ap-pack-jar");
    const raw = jarEl?.value;
    const rawTrim = raw != null ? String(raw).trim() : "";
    const n = rawTrim === "" ? NaN : Number(raw);
    let jarKg = null;
    if (kind === "jar") {
      jarKg = Number.isFinite(n) && n > 0 ? n : null;
    } else {
      jarKg = rawTrim === "" ? null : Number.isFinite(n) && n > 0 ? n : null;
    }
    out.push({
      kind,
      jarKg,
      label: String(tr.querySelector(".ap-pack-label")?.value || "").trim(),
      sub: String(tr.querySelector(".ap-pack-sub")?.value || "").trim(),
      hidden: Boolean(tr.querySelector(".ap-pack-hidden")?.checked),
    });
  });
  return typeof window.dpNormalizePackOptionRows === "function" ? window.dpNormalizePackOptionRows(out) : out;
}

/** Строки данных фасовки в порядке tbody (только прямые TR-потомки — как на экране). Не querySelectorAll: он обходит дерево и мог перепутать порядок. */
function apPackTableDataRows(bodyEl) {
  if (!bodyEl) return [];
  return [...bodyEl.children].filter((el) => el instanceof HTMLTableRowElement && el.matches("tr[data-ap-pack-row]"));
}

/** Переставить соседние строки без innerHTML — сохраняется ввод и надёжен любой номер перемещений. */
function apPackTableMoveAdjacent(bodyId, idx, dir) {
  const body = document.getElementById(bodyId);
  if (!body) return false;
  const trs = apPackTableDataRows(body);
  if (idx < 0 || idx >= trs.length) return false;
  if (dir === "up") {
    if (idx <= 0) return false;
    body.insertBefore(trs[idx], trs[idx - 1]);
    return true;
  }
  if (dir === "down") {
    if (idx >= trs.length - 1) return false;
    body.insertBefore(trs[idx + 1], trs[idx]);
    return true;
  }
  return false;
}

/**
 * Перетаскивание строк на любое место (HTML5 DnD). Ручка — .ap-pack-drag-handle.
 */
function apPackBindTbodyDragReorder(tbodyId, onAfterDrop) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody || tbody.dataset.apPackDragBound === "1") return;
  tbody.dataset.apPackDragBound = "1";

  let dragRow = null;

  function clearOver() {
    tbody.querySelectorAll(".ap-pack-row-drag-over").forEach((n) => n.classList.remove("ap-pack-row-drag-over"));
  }

  tbody.addEventListener("dragstart", (e) => {
    const tgt = e.target instanceof Element ? e.target : /** @type {Element|null} */ (e.target?.parentElement);
    const h = tgt?.closest?.(".ap-pack-drag-handle");
    if (!h || !tbody.contains(h)) return;
    const tr = h.closest?.("tr[data-ap-pack-row]");
    if (!(tr instanceof HTMLTableRowElement) || !tbody.contains(tr)) return;
    dragRow = tr;
    tr.classList.add("ap-pack-row--dragging");
    try {
      e.dataTransfer.setData("text/plain", "ap-pack-row");
    } catch {
      /* ignore */
    }
    e.dataTransfer.effectAllowed = "move";
  });

  tbody.addEventListener("dragend", () => {
    tbody.querySelectorAll(".ap-pack-row--dragging").forEach((n) => n.classList.remove("ap-pack-row--dragging"));
    clearOver();
    dragRow = null;
  });

  tbody.addEventListener("dragover", (e) => {
    if (!dragRow) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearOver();
    const hi = apPackDragHoverRow(tbody, dragRow, e.clientX, e.clientY);
    if (hi) hi.classList.add("ap-pack-row-drag-over");
  });

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    clearOver();
    if (!dragRow) return;
    apPackApplyDropPosition(tbody, dragRow, e.clientX, e.clientY);
    dragRow = null;
    if (typeof onAfterDrop === "function") onAfterDrop();
  });
}

/** Вставляет перетаскиваемую строку в позицию по координатам (любое место в списке). */
function apPackApplyDropPosition(tbody, dragRowEl, clientX, clientY) {
  const list = apPackTableDataRows(tbody).filter((r) => r !== dragRowEl);
  if (!list.length) return;

  if (clientY < list[0].getBoundingClientRect().top) {
    tbody.insertBefore(dragRowEl, list[0]);
    return;
  }
  if (clientY > list[list.length - 1].getBoundingClientRect().bottom) {
    tbody.appendChild(dragRowEl);
    return;
  }

  for (let i = 0; i < list.length; i += 1) {
    const tr = list[i];
    const r = tr.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) {
      const mid = r.top + r.height / 2;
      if (clientY < mid) {
        tbody.insertBefore(dragRowEl, tr);
      } else {
        let ns = tr.nextSibling;
        while (ns && ns === dragRowEl) ns = ns.nextSibling;
        if (ns) tbody.insertBefore(dragRowEl, ns);
        else tbody.appendChild(dragRowEl);
      }
      return;
    }
  }

  for (let i = 0; i < list.length - 1; i += 1) {
    const bot = list[i].getBoundingClientRect().bottom;
    const top = list[i + 1].getBoundingClientRect().top;
    if (clientY > bot && clientY < top) {
      tbody.insertBefore(dragRowEl, list[i + 1]);
      return;
    }
  }

  tbody.appendChild(dragRowEl);
}

function apPackDragHoverRow(tbody, dragRowEl, clientX, clientY) {
  const list = apPackTableDataRows(tbody).filter((r) => r !== dragRowEl);
  for (const tr of list) {
    const r = tr.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return tr;
  }
  return null;
}

/** Для массовых действий: без выбранной позиции — таблица ap-bulk-pack-options-body; если позиция открыта — её фасовки. */
function collectPackStagingRowsForBulk() {
  if (selectedProductId) return collectPackOptionsFromDom("ap-pack-options-body");
  return collectPackOptionsFromDom("ap-bulk-pack-options-body");
}

function apSortPackRowsByTypeAndMass(rows) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
  const kindOrder = { jar: 0, bucket: 1, drum: 2 };
  list.sort((a, b) => {
    const ka = String(a?.kind || "jar").toLowerCase();
    const kb = String(b?.kind || "jar").toLowerCase();
    const oa = Object.prototype.hasOwnProperty.call(kindOrder, ka) ? kindOrder[ka] : 9;
    const ob = Object.prototype.hasOwnProperty.call(kindOrder, kb) ? kindOrder[kb] : 9;
    if (oa !== ob) return oa - ob;
    const ma = Number(a?.jarKg);
    const mb = Number(b?.jarKg);
    const wa = Number.isFinite(ma) && ma > 0 ? ma : Number.POSITIVE_INFINITY;
    const wb = Number.isFinite(mb) && mb > 0 ? mb : Number.POSITIVE_INFINITY;
    return wa - wb;
  });
  return list;
}

function apBulkPackPanelFillTemplate() {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  const pool = getProducts();
  let rows =
    typeof window.dpAggregateDefaultPackRowsForCatalog === "function"
      ? window.dpAggregateDefaultPackRowsForCatalog(pool)
      : [];
  rows = apSortPackRowsByTypeAndMass(rows);
  body.innerHTML = rows.map((r) => apPackOptionRowHtml(r)).join("");
  apBulkPackOptionsUpdateHint();
}

function apBulkPackPanelRefreshFromPriceKeepManual() {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  const pool = getProducts();
  const fromPrice =
    typeof window.dpAggregateDefaultPackRowsForCatalog === "function"
      ? window.dpAggregateDefaultPackRowsForCatalog(pool)
      : [];
  const current = collectPackOptionsFromDom("ap-bulk-pack-options-body");
  const byKey = new Map();
  const seenCurrent = new Set();
  if (typeof window.dpPackOptionRowStableKey === "function") {
    for (const row of current) {
      const key = window.dpPackOptionRowStableKey(row);
      if (!key || seenCurrent.has(key)) continue;
      seenCurrent.add(key);
      byKey.set(key, row);
    }
  }
  const out = [];
  const seenOut = new Set();
  for (const row of fromPrice) {
    const key = typeof window.dpPackOptionRowStableKey === "function" ? window.dpPackOptionRowStableKey(row) : "";
    if (!key || seenOut.has(key)) continue;
    seenOut.add(key);
    const cur = byKey.get(key);
    out.push({
      ...row,
      label: cur ? String(cur.label || "").trim() : String(row.label || "").trim(),
      sub: cur ? String(cur.sub || "").trim() : String(row.sub || "").trim(),
      hidden: cur ? Boolean(cur.hidden) : Boolean(row.hidden),
    });
  }
  const sorted = apSortPackRowsByTypeAndMass(out);
  body.innerHTML = sorted.map((r) => apPackOptionRowHtml(r)).join("");
  apBulkPackOptionsUpdateHint();
  setBulkPanelStatus("Таблица обновлена из прайса: оставлены только строки базового набора.", "ok");
}

function apRebuildAllDraftPackOptionsFromCurrentPrice() {
  const pool = getProducts();
  if (!pool.length) {
    setBulkPanelStatus("Нет позиций прайса для пересборки фасовок.", "err");
    return;
  }
  if (typeof window.dpDefaultPackOptionRows !== "function") {
    setBulkPanelStatus("Пересборка недоступна: нет функции фасовок из прайса.", "err");
    return;
  }
  if (
    !window.confirm(
      `Пересобрать фасовки по текущему прайсу для всех ${pool.length} позиций в черновике? Ручные фасовки будут заменены прайсовыми.`
    )
  ) {
    return;
  }
  let changed = 0;
  for (const p of pool) {
    const pid = String(p.id ?? "");
    if (!pid) continue;
    ensureDraftEntry(pid);
    const baseRaw = window.dpDefaultPackOptionRows(p);
    const base =
      typeof window.dpNormalizePackOptionRows === "function"
        ? window.dpNormalizePackOptionRows(baseRaw)
        : Array.isArray(baseRaw)
          ? baseRaw
          : [];
    const prev = JSON.stringify(draftOverrides[pid]?.detailPackOptions || []);
    const next = JSON.stringify(base || []);
    if (prev !== next) changed += 1;
    if (Array.isArray(base) && base.length) draftOverrides[pid].detailPackOptions = base.map((x) => ({ ...x }));
    else delete draftOverrides[pid].detailPackOptions;
  }
  apBulkPackPanelSyncFromDraft();
  apBulkPackOptionsUpdateHint();
  renderProductCatalog();
  if (selectedProductId) {
    const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
    if (p) apPackOptionsRender(p, draftOverrides[String(selectedProductId)] || {});
  }
  updateDraftToolbar();
  setBulkPanelStatus(`Фасовки пересобраны из текущего прайса для ${pool.length} позиций (изменено: ${changed}).`, "ok");
}

function apBulkPackPanelSeedIfEmpty() {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  if (apPackTableDataRows(body).length > 0) return;
  apBulkPackPanelSyncFromDraft();
}

/**
 * Референсная позиция для массовой таблицы фасовок (как при отрисовке панели).
 * Совпадает с логикой apBulkPackPanelSyncFromDraft — иначе «грязь» и публикация расходятся с тем, что видит пользователь.
 */
function apBulkPackResolveRefForMassPanel() {
  const pool = getProducts();
  if (!pool.length) return null;
  let refId = selectedProductId ? String(selectedProductId) : "";
  if (!refId) {
    const withCustom = pool.find((pr) => {
      const oid = String(pr.id);
      const ov = draftOverrides[oid];
      return ov && Array.isArray(ov.detailPackOptions) && ov.detailPackOptions.length > 0;
    });
    if (withCustom) refId = String(withCustom.id);
  }
  if (!refId) refId = String(pool[0].id);
  const product = pool.find((x) => String(x.id) === String(refId));
  return product ? { refId, product } : null;
}

/**
 * Строки массовой таблицы: база — объединение фасовок из прайса;
 * поверх — черновик (подписи/скрытие), плюс ручные строки, добавленные админом.
 */
function apBulkPackMergedRowsForMassPanelUi() {
  const pool = getProducts();
  const aggregate =
    typeof window.dpAggregateDefaultPackRowsForCatalog === "function"
      ? window.dpAggregateDefaultPackRowsForCatalog(pool)
      : [];

  const ref = apBulkPackResolveRefForMassPanel();
  const ov =
    ref && draftOverrides[ref.refId]
      ? draftOverrides[ref.refId]
      : {};
  let draftNorm = [];
  if (ref && ov && Array.isArray(ov.detailPackOptions) && ov.detailPackOptions.length && typeof window.dpNormalizePackOptionRows === "function") {
    draftNorm = window.dpNormalizePackOptionRows(ov.detailPackOptions);
  }

  if (!draftNorm.length) return aggregate;

  if (!aggregate.length || typeof window.dpPackOptionRowStableKey !== "function") {
    return draftNorm;
  }

  const aggOrderKeys = [];
  const aggByKey = new Map();
  for (const r of aggregate) {
    const rk = window.dpPackOptionRowStableKey(r);
    if (!rk || aggByKey.has(rk)) continue;
    aggByKey.set(rk, { ...r });
    aggOrderKeys.push(rk);
  }

  const draftByKey = new Map();
  for (const r of draftNorm) {
    const rk = window.dpPackOptionRowStableKey(r);
    if (rk && !draftByKey.has(rk)) draftByKey.set(rk, r);
  }

  const out = [];
  for (const rk of aggOrderKeys) {
    const base = aggByKey.get(rk);
    const dr = draftByKey.get(rk);
    out.push(
      dr
        ? {
            ...base,
            label: dr.label ?? "",
            sub: dr.sub ?? "",
            hidden: Boolean(dr.hidden),
          }
        : { ...base }
    );
  }
  const normalized =
    typeof window.dpNormalizePackOptionRows === "function"
      ? window.dpNormalizePackOptionRows(out)
      : out;
  return apSortPackRowsByTypeAndMass(normalized);
}

/**
 * Перерисовывает «Фасовки для сайта и каталога (массово)» из draftOverrides.
 * После публикации черновик уже совпадает с сайтом; старый HTML таблицы может остаться — без вызова видны устаревшие строки.
 */
function apBulkPackPanelSyncFromDraft() {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  const pool = getProducts();
  if (!pool.length) {
    body.innerHTML = "";
    apBulkPackOptionsUpdateHint();
    return;
  }
  const ref = apBulkPackResolveRefForMassPanel();
  if (!ref) {
    apBulkPackPanelFillTemplate();
    apBulkPackOptionsUpdateHint();
    return;
  }
  ensureDraftEntry(ref.refId);
  const rows = apBulkPackMergedRowsForMassPanelUi();
  if (!rows.length) {
    apBulkPackPanelFillTemplate();
    apBulkPackOptionsUpdateHint();
    return;
  }
  body.innerHTML = rows.map((r) => apPackOptionRowHtml(r)).join("");
  apBulkPackOptionsUpdateHint();
}

function apBulkPackOptionsUpdateHint() {
  const hint = document.getElementById("ap-bulk-pack-options-hint");
  if (!hint) return;
  const body = document.getElementById("ap-bulk-pack-options-body");
  const n = body ? apPackTableDataRows(body).length : 0;
  hint.textContent = n
    ? `Строк в таблице: ${n}. Цели — отмеченные в каталоге, артикул или серию, фильтры сетки или все позиции.`
    : "Добавьте строки вручную или нажмите «Как из прайса (шаблон)» для перечитывания.";
  updateDraftToolbar();
}

function apBulkPackNormalizeLegacyKinds() {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  const rows = collectPackOptionsFromDom("ap-bulk-pack-options-body");
  if (!rows.length) {
    setBulkPanelStatus("Таблица массовых фасовок пуста — нечего нормализовать.", "err");
    return;
  }
  body.innerHTML = rows.map((r) => apPackOptionRowHtml(r)).join("");
  apBulkPackOptionsUpdateHint();
  setBulkPanelStatus("Legacy-типы фасовок нормализованы в текущей таблице.", "ok");
}

function apMergedPackOptionRows(product, ov) {
  if (!product) return [];
  const o = ov || {};
  if (Array.isArray(o.detailPackOptions) && o.detailPackOptions.length) {
    return typeof window.dpNormalizePackOptionRows === "function"
      ? window.dpNormalizePackOptionRows(o.detailPackOptions)
      : o.detailPackOptions;
  }
  if (typeof window.dpDefaultPackOptionRows === "function") {
    const raw = window.dpDefaultPackOptionRows(product);
    return typeof window.dpNormalizePackOptionRows === "function" ? window.dpNormalizePackOptionRows(raw) : raw;
  }
  return [];
}

/** Ячейка «Кг»: для всех типов — число; у ведра/барабана пустое поле = брать массу из прайса (bucketKg / drumKg) у каждой позиции. */
function apPackOptionRowKgTdFullHtml(kind, jarKgMaybe) {
  const k = String(kind || "jar").toLowerCase();
  const bdNote =
    k === "bucket"
      ? "Необязательно: масса ведра в кг. Пустое поле — из прайса (bucketKg) для каждой позиции."
      : k === "drum"
        ? "Необязательно: масса барабана в кг. Пустое поле — из прайса (drumKg)."
        : "Килограммы банки (только для типа «Банка»).";
  const ariaLabel = k === "jar" ? "Килограммы банки" : k === "bucket" ? "Масса ведра кг" : "Масса барабана кг";
  let val = "";
  let minAttr = ' min="0.01"';
  if (k === "jar") {
    val =
      jarKgMaybe != null && Number.isFinite(Number(jarKgMaybe)) && Number(jarKgMaybe) > 0
        ? String(jarKgMaybe)
        : "1";
  } else if (jarKgMaybe != null && Number.isFinite(Number(jarKgMaybe)) && Number(jarKgMaybe) > 0) {
    val = String(jarKgMaybe);
  }
  const phbd = k === "bucket" || k === "drum" ? ' placeholder="из прайса"' : "";
  const step = 'step="0.01"';
  return `<td class="ap-pack-kg-cell"><input type="number" class="ap-search ap-pack-jar" ${step} ${minAttr} data-ap-pack-field="jarKg"${phbd} value="${escapeHtml(
    val
  )}" title="${escapeHtml(bdNote)}" aria-label="${escapeHtml(ariaLabel)}" /></td>`;
}

/** После смены типа в выпадающем списке: подменить ячейку массы без перерисовки всей строки. */
function apPackRowSyncKgCellToSelectedKind(tr) {
  if (!(tr instanceof HTMLTableRowElement)) return;
  const sel = tr.querySelector(".ap-pack-kind");
  const kind = sel instanceof HTMLSelectElement ? String(sel.value || "jar").toLowerCase() : "jar";
  let preserved = null;
  const inp = tr.querySelector(".ap-pack-jar");
  if (inp instanceof HTMLInputElement && String(inp.value || "").trim() !== "") {
    const n = Number(inp.value);
    if (Number.isFinite(n) && n > 0) preserved = n;
  }
  const tds = tr.querySelectorAll(":scope > td");
  if (tds.length < 3) return;
  let jarArg = preserved;
  if (kind === "jar" && jarArg == null) jarArg = 1;
  tds[2].outerHTML = apPackOptionRowKgTdFullHtml(kind, jarArg);
}

function apPackOptionRowHtml(row) {
  const kind = row.kind || "jar";
  return `<tr data-ap-pack-row="1">
    <td class="ap-pack-drag-cell">
      <span class="ap-pack-drag-handle" draggable="true" title="Перетащите на любое место в списке">⠿</span>
    </td>
    <td><select class="ap-search ap-pack-kind" data-ap-pack-field="kind" aria-label="Тип фасовки">
      <option value="bucket"${kind === "bucket" ? " selected" : ""}>Ведро</option>
      <option value="drum"${kind === "drum" ? " selected" : ""}>Барабан</option>
      <option value="jar"${kind === "jar" ? " selected" : ""}>Банка</option>
    </select></td>
    ${apPackOptionRowKgTdFullHtml(kind, row.jarKg)}
    <td><input type="text" class="ap-search ap-pack-label" data-ap-pack-field="label" value="${escapeHtml(row.label || "")}" placeholder="авто" /></td>
    <td><input type="text" class="ap-search ap-pack-sub" data-ap-pack-field="sub" value="${escapeHtml(row.sub || "")}" placeholder="авто" /></td>
    <td><label class="ap-inline-check"><input type="checkbox" class="ap-pack-hidden" data-ap-pack-field="hidden"${row.hidden ? " checked" : ""} /> скрыть</label></td>
    <td class="ap-pack-row-actions"><button type="button" class="ap-btn ap-btn-ghost ap-btn-sm ap-pack-up" title="Вверх">↑</button><button type="button" class="ap-btn ap-btn-ghost ap-btn-sm ap-pack-down" title="Вниз">↓</button><button type="button" class="ap-btn ap-btn-danger ap-btn-sm ap-pack-del" title="Удалить">×</button></td>
  </tr>`;
}

function apPackOptionsRender(product, ov) {
  const body = document.getElementById("ap-pack-options-body");
  if (!body) return;
  if (!product) {
    body.innerHTML = "";
    apPackOptionsUpdateHint(null);
    return;
  }
  const rows = apMergedPackOptionRows(product, ov);
  body.innerHTML = rows.map((r) => apPackOptionRowHtml(r)).join("");
  apPackOptionsUpdateHint(product);
}

function apPackOptionsUpdateHint(product) {
  const hint = document.getElementById("ap-pack-options-hint");
  if (!hint) return;
  if (!product) {
    hint.textContent = "";
    return;
  }
  const rows = collectPackOptionsFromDom();
  const chips =
    typeof window.dpApplyDetailPackChips === "function"
      ? window.dpApplyDetailPackChips(product, { detailPackOptions: rows })
      : [];
  hint.textContent = `На сайте будет ${chips.length} видимых фасовок с расчётной ценой (остальные скрыты или без цены).`;
}

function apSyncPackOptionsToDraft() {
  if (!selectedProductId) return;
  ensureDraftEntry(selectedProductId);
  draftOverrides[selectedProductId] = {
    ...draftOverrides[selectedProductId],
    detailPackOptions: collectPackOptionsFromDom(),
  };
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p) apPopulatePhotoPackSelect(p);
  updateDraftToolbar();
}

/** Нормализация строки для поиска позиций: регистр, ё→е, разные дефисы, пробелы. */
function apNormalizeProductSearchString(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/\u0451/g, "\u0435")
    .replace(/[‐‑‒–—−﹣－]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Для режима точного совпадения: убираем лишнюю пунктуацию между словами. */
function apNormalizeForExactTitleMatch(s) {
  return apNormalizeProductSearchString(s)
    .replace(/[,;.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function apProductCardTitleResolved(p) {
  const id = String(p.id ?? "");
  const ovD = draftOverrides[id] || {};
  const ovP = publishedOverrides[id] || {};
  if (typeof ovD.cardTitle === "string" && ovD.cardTitle.trim()) return ovD.cardTitle.trim();
  if (typeof ovP.cardTitle === "string" && ovP.cardTitle.trim()) return ovP.cardTitle.trim();
  return "";
}

/** Как на сайте в каталоге: свой заголовок или название из прайса. */
function apProductCatalogDisplayTitleRaw(p) {
  const custom = apProductCardTitleResolved(p);
  if (custom) return custom;
  return String(p.name || "").trim();
}

/**
 * Набор строк для режима «точное совпадение» (нормализованные).
 * Совпадение с любой из них — показываем только эти карточки.
 */
function apProductExactSearchNormSet(p) {
  const set = new Set();
  const code = String(p.code || "").trim();
  const name = String(p.name || "").trim();
  const typeWord = String(p.typeWord || "").trim();
  const add = (s) => {
    const n = apNormalizeForExactTitleMatch(s);
    if (n) set.add(n);
  };
  add(apProductCatalogDisplayTitleRaw(p));
  add(apProductCardTitleResolved(p));
  add(name);
  if (code && name) {
    add(`${code} ${name}`);
    add(`${code} — ${name}`);
    add(`${code}-${name}`);
  }
  if (typeWord && name) {
    add(`${typeWord} ${name}`);
    add(`${typeWord} — ${name}`);
  }
  if (typeWord && code && name) {
    add(`${typeWord} ${code} ${name}`);
    add(`${typeWord} ${code} — ${name}`);
  }
  return set;
}

function apIdsExactTitleMatch(normQExact, products) {
  if (!normQExact) return null;
  const ids = [];
  for (const p of products) {
    if (apProductExactSearchNormSet(p).has(normQExact)) ids.push(String(p.id));
  }
  return ids.length ? ids : null;
}

/** Все слова запроса должны встречаться в id, коде, названии или своём заголовке карточки. */
function apProductMatchesCardPickerFilter(p) {
  const filterRaw = document.getElementById("ap-card-product-filter")?.value ?? "";
  const normQ = apNormalizeProductSearchString(filterRaw);
  if (!normQ) return true;
  const id = String(p.id ?? "");
  const code = apNormalizeProductSearchString(p.code || "");
  const name = apNormalizeProductSearchString(p.name || "");
  const typeWord = apNormalizeProductSearchString(p.typeWord || "");
  const family = apNormalizeProductSearchString(p.family || "");
  const titleN = apNormalizeProductSearchString(apProductCardTitleResolved(p));
  const hay = `${apNormalizeProductSearchString(id)} ${code} ${name} ${typeWord} ${family} ${titleN}`;
  const tokens = normQ.split(" ").filter(Boolean);
  for (const t of tokens) {
    if (!hay.includes(t)) return false;
  }
  return true;
}

function apEnsureCardProductSelect() {
  const sel = document.getElementById("ap-card-product-select");
  if (!sel) return;
  const prev = sel.value;
  const filterRaw = (document.getElementById("ap-card-product-filter")?.value || "").trim();
  const normQExact = apNormalizeForExactTitleMatch(filterRaw);
  const products = getProducts().slice().sort(sortProductsAdmin);

  let matched;
  let exactMode = false;
  if (!filterRaw) {
    matched = products;
  } else {
    const exactIds = apIdsExactTitleMatch(normQExact, products);
    if (exactIds) {
      matched = products.filter((p) => exactIds.includes(String(p.id)));
      exactMode = true;
    } else {
      matched = products.filter(apProductMatchesCardPickerFilter);
    }
  }

  const opts = ['<option value="">— Выберите позицию —</option>'];
  for (const p of matched) {
    const id = String(p.id);
    const label = `${typeof window.dpFormatArticleUi === "function" ? window.dpFormatArticleUi(p.code ?? "") : p.code || "—"} — ${String(p.name || "").slice(0, 80)} (${id})`;
    opts.push(`<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`);
  }
  sel.innerHTML = opts.join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;

  const n = opts.length - 1;
  if (exactMode && n === 1) {
    const onlyId = matched[0] && String(matched[0].id);
    if (onlyId) {
      sel.value = onlyId;
      if (String(selectedProductId) !== onlyId) selectProduct(onlyId);
    }
  }

  const st = document.getElementById("ap-card-filter-status");
  if (st) {
    if (filterRaw && n === 0) {
      st.textContent =
        "Нет совпадений. Для точного совпадения введите строку как заголовок на сайте или «тип + артикул + название»; иначе — поиск по словам.";
    } else if (filterRaw && exactMode) {
      st.textContent =
        n === 1
          ? "Точное совпадение — одна позиция (выбрана в списке)."
          : `Точное совпадение строки: ${n} поз. Уточните запрос, если нужна одна.`;
    } else if (filterRaw) {
      st.textContent = `Поиск по словам: ${n} поз.`;
    } else {
      st.textContent = "";
    }
  }
}

function apSetProductsDraftChromeVisible(on) {
  document.getElementById("ap-shared-products-draft")?.classList.toggle("ap-panel-hidden", !on);
}

function fillProductDetailForm(product, ov) {
  const m = mergedProductDetailForEditor(product, ov);
  const specEl = document.getElementById("ap-product-spec-rows");
  const charEl = document.getElementById("ap-product-char-intro");
  const appEl = document.getElementById("ap-product-application");
  const pbEl = document.getElementById("ap-product-prep-base");
  const ppEl = document.getElementById("ap-product-prep-product");
  const paintEl = document.getElementById("ap-product-painting");
  const tipsEl = document.getElementById("ap-product-expert-tips");
  const badgesEl = document.getElementById("ap-product-top-badges");
  const filesEl = document.getElementById("ap-product-files");
  if (specEl) specEl.value = formatSpecRowsTextarea(m.specRows);
  if (charEl) charEl.value = m.charIntro;
  if (appEl) appEl.value = m.application;
  if (pbEl) pbEl.value = formatLines(m.prepBase);
  if (ppEl) ppEl.value = formatLines(m.prepProduct);
  if (paintEl) paintEl.value = formatLines(m.painting);
  if (tipsEl) tipsEl.value = formatExpertTipsTextarea(m.tips);
  if (badgesEl) badgesEl.value = formatLines(m.badges);
  if (filesEl) filesEl.value = formatFilesTextarea(m.files);
}

function collectDetailPayloadFromDom() {
  return {
    detailSpecRows: parseSpecRowsTextarea(document.getElementById("ap-product-spec-rows")?.value || ""),
    detailCharacteristicsIntro: String(document.getElementById("ap-product-char-intro")?.value ?? "").trimEnd(),
    detailApplication: String(document.getElementById("ap-product-application")?.value ?? "").trimEnd(),
    detailPrepBase: parseLinesText(document.getElementById("ap-product-prep-base")?.value || ""),
    detailPrepProduct: parseLinesText(document.getElementById("ap-product-prep-product")?.value || ""),
    detailPainting: parseLinesText(document.getElementById("ap-product-painting")?.value || ""),
    detailTopBadges: parseLinesText(document.getElementById("ap-product-top-badges")?.value || ""),
    detailExpertTips: parseExpertTipsTextarea(document.getElementById("ap-product-expert-tips")?.value || ""),
    detailFiles: parseFilesTextarea(document.getElementById("ap-product-files")?.value || ""),
    detailPackOptions: collectPackOptionsFromDom(),
  };
}

function pruneDetailEqualToTemplate(product, payload) {
  const lib = productDetailLib();
  if (!lib || typeof lib.getDefaults !== "function") return payload;
  const defs = lib.getDefaults(product);
  if (!defs) return payload;
  const out = { ...payload };
  const sameSpec = JSON.stringify(payload.detailSpecRows || []) === JSON.stringify(defs.specRows || []);
  if (sameSpec) delete out.detailSpecRows;
  if (String(payload.detailCharacteristicsIntro ?? "") === String(defs.characteristicsIntro ?? "")) {
    delete out.detailCharacteristicsIntro;
  }
  if (String(payload.detailApplication ?? "") === String(defs.applicationText ?? "")) {
    delete out.detailApplication;
  }
  if (JSON.stringify(payload.detailPrepBase || []) === JSON.stringify(defs.prepBase || [])) delete out.detailPrepBase;
  if (JSON.stringify(payload.detailPrepProduct || []) === JSON.stringify(defs.prepProduct || [])) {
    delete out.detailPrepProduct;
  }
  if (JSON.stringify(payload.detailPainting || []) === JSON.stringify(defs.painting || [])) delete out.detailPainting;
  if (JSON.stringify(payload.detailExpertTips || []) === JSON.stringify(defs.expertTips || [])) {
    delete out.detailExpertTips;
  }
  if (JSON.stringify(payload.detailTopBadges || []) === JSON.stringify(defs.topBadges || [])) {
    delete out.detailTopBadges;
  }
  if (JSON.stringify(payload.detailFiles || []) === JSON.stringify(defs.files || [])) delete out.detailFiles;
  if (typeof window.dpDefaultPackOptionRows === "function" && typeof window.dpNormalizePackOptionRows === "function") {
    const a = window.dpNormalizePackOptionRows(payload.detailPackOptions || []);
    const b = window.dpNormalizePackOptionRows(window.dpDefaultPackOptionRows(product));
    if (JSON.stringify(a) === JSON.stringify(b)) delete out.detailPackOptions;
  }
  return out;
}

function imagePair(ov) {
  const o = ov || {};
  return `${String(o.cardImageUrl || "")}|${String(o.heroImageUrl || "")}`;
}

function pickTextPatches() {
  const out = {};
  const normFeatures = (arr) => (Array.isArray(arr) ? arr : []);
  const normJson = (v) => JSON.stringify(v === undefined ? null : v);

  for (const id of Object.keys(draftOverrides)) {
    const d = draftOverrides[id] || {};
    const p = publishedOverrides[id] || {};
    const dt = {
      cardTitle: typeof d.cardTitle === "string" ? d.cardTitle : "",
      cardFeatures: normFeatures(d.cardFeatures),
      subtitle: typeof d.subtitle === "string" ? d.subtitle : "",
      description: typeof d.description === "string" ? d.description : "",
    };
    const pt = {
      cardTitle: typeof p.cardTitle === "string" ? p.cardTitle : "",
      cardFeatures: normFeatures(p.cardFeatures),
      subtitle: typeof p.subtitle === "string" ? p.subtitle : "",
      description: typeof p.description === "string" ? p.description : "",
    };
    let baseChanged = JSON.stringify(dt) !== JSON.stringify(pt);
    let detailChanged = false;
    for (const k of AP_DETAIL_KEYS) {
      if (normJson(d[k]) !== normJson(p[k])) {
        detailChanged = true;
        break;
      }
    }
    if (!baseChanged && !detailChanged) continue;

    const patch = {
      cardTitle: dt.cardTitle,
      cardFeatures: dt.cardFeatures,
      subtitle: dt.subtitle,
      description: dt.description,
    };
    for (const k of AP_DETAIL_KEYS) {
      if (normJson(d[k]) === normJson(p[k])) continue;
      // Без явного значения в draft не отправляем "очистку" поля:
      // иначе верхняя публикация может случайно стереть блоки/фасовки и скрыть фото фасовки.
      if (d[k] === undefined) continue;
      patch[k] = d[k];
    }
    out[id] = patch;
  }
  return out;
}

function normCatalogPackImagesMap(m) {
  if (!m || typeof m !== "object") return {};
  const keys = Object.keys(m).sort();
  const o = {};
  for (const k of keys) {
    o[k] = String(m[k] || "")
      .split("?")[0]
      .trim();
  }
  return o;
}

/** Сравнение фасовок для флага «есть изменения». */
function apNormPackRowsJson(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  if (typeof window.dpNormalizePackOptionRows === "function") {
    try {
      return JSON.stringify(window.dpNormalizePackOptionRows(arr));
    } catch {
      return JSON.stringify(arr);
    }
  }
  return JSON.stringify(arr);
}

/**
 * Истина, если таблица массовых фасовок (без выбранной карточки) расходится с её эталонным содержимым —
 * тем же, что отдаёт apBulkPackPanelSyncFromDraft. Раньше сравнивали DOM с merged() для каждого id из
 * resolveBulkDetailTextTargetIds(): при 0 целей, лимите 500 или разных дефолтах у позиций получалось ложное «чисто»
 * и кнопка «Сохранить на сайт» оставалась disabled.
 */
function apBulkPackDomDiffersFromEffectiveDraft() {
  if (selectedProductId) return false;
  if (!document.getElementById("ap-bulk-pack-options-body")) return false;
  const rowsFromDom = collectPackOptionsFromDom("ap-bulk-pack-options-body");
  const domJson = apNormPackRowsJson(rowsFromDom);
  return apNormPackRowsJson(apBulkPackMergedRowsForMassPanelUi()) !== domJson;
}

function isDraftDirty() {
  if (
    previewBlobById.size ||
    previewPackBlobById.size ||
    (ENABLE_BULK_PHOTO_IN_CATALOG && bulkPreview) ||
    pendingDeleteImage.size ||
    pendingDeleteCatalogPackImages.size
  )
    return true;
  if (Object.keys(pickTextPatches()).length) return true;
  if (apBulkPackDomDiffersFromEffectiveDraft()) return true;
  const ids = new Set([...Object.keys(draftOverrides), ...Object.keys(publishedOverrides)]);
  for (const id of ids) {
    if (imagePair(draftOverrides[id]) !== imagePair(publishedOverrides[id])) return true;
    if (
      JSON.stringify(normCatalogPackImagesMap(draftOverrides[id]?.catalogPackImages)) !==
      JSON.stringify(normCatalogPackImagesMap(publishedOverrides[id]?.catalogPackImages))
    )
      return true;
  }
  return false;
}

function updateDraftToolbar() {
  const bar = document.getElementById("ap-products-draft-bar");
  const hint = document.getElementById("ap-draft-hint");
  if (!bar || !hint) return;
  const dirty = isDraftDirty();
  bar.classList.toggle("is-dirty", dirty);
  hint.textContent = dirty
    ? "Есть несохранённые на сайте изменения. На главной и в каталоге для посетителей видна только опубликованная версия."
    : "Черновик совпадает с опубликованным на сайте.";
  const pubBtn = document.getElementById("ap-draft-publish");
  const disBtn = document.getElementById("ap-draft-discard");
  if (pubBtn) pubBtn.disabled = !dirty;
  if (disBtn) disBtn.disabled = !dirty;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

/**
 * После успешного POST /api/admin/products/:id/image — синхронно обновить черновик, published и клиентские overrides без ожидания полного reload.
 */
function mergeAdminProductImageReplyIntoOverrides(productId, resp) {
  if (!resp || typeof resp !== "object") return;
  const id = String(productId);
  ensureDraftEntry(id);
  if (!publishedOverrides[id]) publishedOverrides[id] = {};
  const pub = publishedOverrides[id];
  if (resp.catalogPackImages && typeof resp.catalogPackImages === "object") {
    pub.catalogPackImages = { ...(pub.catalogPackImages || {}), ...resp.catalogPackImages };
    draftOverrides[id].catalogPackImages = { ...(draftOverrides[id].catalogPackImages || {}), ...resp.catalogPackImages };
  }
  if (typeof resp.cardImageUrl === "string" && resp.cardImageUrl.trim()) {
    pub.cardImageUrl = resp.cardImageUrl;
    draftOverrides[id].cardImageUrl = resp.cardImageUrl;
  }
  if (typeof resp.heroImageUrl === "string" && resp.heroImageUrl.trim()) {
    pub.heroImageUrl = resp.heroImageUrl;
    draftOverrides[id].heroImageUrl = resp.heroImageUrl;
  }
  if (typeof window.DP_PRODUCT_OVERRIDES === "object") {
    if (!window.DP_PRODUCT_OVERRIDES[id]) window.DP_PRODUCT_OVERRIDES[id] = {};
    const wo = window.DP_PRODUCT_OVERRIDES[id];
    if (resp.catalogPackImages && typeof resp.catalogPackImages === "object") {
      wo.catalogPackImages = { ...(wo.catalogPackImages || {}), ...resp.catalogPackImages };
    }
    if (typeof resp.cardImageUrl === "string" && resp.cardImageUrl.trim()) wo.cardImageUrl = resp.cardImageUrl;
    if (typeof resp.heroImageUrl === "string" && resp.heroImageUrl.trim()) wo.heroImageUrl = resp.heroImageUrl;
  }
}

/** Data URL для POST: читаем при выборе файла; blob: — когда dataUrlPromise ещё не готов, но окно превью ещё держит blob. */
async function resolveStagedFileDataUrl(entry) {
  if (!entry) return "";
  if (typeof entry.dataUrl === "string" && /^data:image\//i.test(entry.dataUrl)) return entry.dataUrl;
  if (entry.dataUrlPromise) {
    try {
      const du = await entry.dataUrlPromise;
      if (typeof du === "string" && /^data:image\//i.test(du)) {
        entry.dataUrl = du;
        return du;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof entry.url === "string" && /^blob:/i.test(entry.url)) {
    try {
      const blob = await (await fetch(entry.url)).blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result || ""));
        r.onerror = () => reject(r.error || new Error("FileReader"));
        r.readAsDataURL(blob);
      });
      if (/^data:image\//i.test(dataUrl)) {
        entry.dataUrl = dataUrl;
        return dataUrl;
      }
    } catch {
      /* fall through */
    }
  }
  if (entry.file) return readFileAsDataUrl(entry.file);
  return "";
}

async function postBulkProductImages(imageBase64, productIds) {
  const payload = { imageBase64, productIds };
  try {
    return await apiAdmin("POST", "/api/admin/bulk-product-image", payload);
  } catch (e) {
    if (!/not found|404/i.test(String(e.message))) throw e;
    return await apiAdmin("POST", "/api/admin/products/bulk-image", payload);
  }
}

/** Соответствует селектору «Тип покрытия» на products.html (familyKey). */
const AP_CATALOG_FAMILY_OPTIONS = [
  { value: "all", label: "Все типы" },
  { value: "enamel", label: "Эмали" },
  { value: "primer", label: "Грунтовки" },
  { value: "lacquer", label: "Лаки" },
  { value: "paint", label: "Краски" },
  { value: "putty", label: "Шпатлёвки" },
  { value: "other", label: "Прочее" },
];

const ADMIN_CARD_IMAGES = {
  enamel: [
    "https://images.unsplash.com/photo-1523419409543-4e2ccce93f95?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=1200&q=80",
  ],
  primer: [
    "https://images.unsplash.com/photo-1581093804475-577d72e2d6f8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1581093588401-22fb3e5aee3a?auto=format&fit=crop&w=1200&q=80",
  ],
  lacquer: [
    "https://images.unsplash.com/photo-1584433144859-1fc3ab64a957?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1568620435895-d4521f0b2f44?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=80",
  ],
  paint: [
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1523419409543-4e2ccce93f95?auto=format&fit=crop&w=1200&q=80",
  ],
  putty: [
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1581092335878-2d9ff86ca2bf?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=80",
  ],
  other: [
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
  ],
};

function adminFamilyPoolKey(rawFamily = "") {
  const f = String(rawFamily || "").toLowerCase();
  if (f.includes("enamel")) return "enamel";
  if (f.includes("primer")) return "primer";
  if (f.includes("lacquer")) return "lacquer";
  if (f.includes("paint")) return "paint";
  if (f.includes("putty")) return "putty";
  return "other";
}

function adminHashStr(input = "") {
  let h = 0;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Как на странице каталога: interior / facade / industrial. */
function apCatalogMatchPurpose(product, purpose) {
  const text = `${product.name || ""} ${product.code || ""}`.toLowerCase();
  if (purpose === "metal") return /металл|антикор|корроз|гф-|хв-|хс-|эп-|мс-/.test(text);
  if (purpose === "wood") return /дерев|лак|пф-/.test(text);
  if (purpose === "outdoor") return /фасад|атмосфер|пф-|хв-|хс-/.test(text);
  if (purpose === "indoor") return /интер|вд|нц-|пф-223|пф-266/.test(text);
  if (purpose === "anti-corrosion") return /грунт|антикор|гф-|эп-|хс-/.test(text);
  return true;
}

/** Синхронно с фильтром на products.html («Назначение» — дополнительные пункты). */
function apCatalogMatchExtendedPurpose(product, mode) {
  const text = `${product.name || ""} ${product.code || ""}`.toLowerCase();
  const fam = String(product.family || "").toLowerCase();
  if (mode === "wd-dispersion") {
    return (
      /\bвдак\b|\bвдкч\b|водно[\s\-–]*дисперс|воднодисперс|латекс|latex|акрилат/i.test(text) ||
      ((fam.includes("paint") || fam.includes("enamel")) &&
        /\bвдак\b|\bвдкч\b|водно[\s\-–]*дисперс| акрилат/i.test(text))
    );
  }
  if (mode === "wood-protection") {
    return /древес|для\s+дер|дерев(?!ян)|антисепт|пропит|олиф|оксоль|лак[^\n]{0,30}дер/i.test(text);
  }
  if (mode === "fire-retardant") {
    return /огнезащит|огнеупор|огнебио|огнестой|антопирен| огн.?стой/i.test(text);
  }
  if (mode === "surface-prep") {
    const fk = adminFamilyPoolKey(product.family);
    if (fk === "primer" || fk === "putty") return true;
    return /преобразователь\s+ржав|накат\b|выравнивающ|шпатл|шпакл/i.test(text);
  }
  if (mode === "disinfectant") {
    return /дезинфици|микробицид|санитарн.*(?:сред|обработ)|бактерицид|фунгицид.*дез/i.test(text);
  }
  if (mode === "solvents") {
    return /растворит|р[-\u2013\u2014]тель|р\.\s*тель|ксилол|уайт|ацетон|смывк|обезжир|сольвент|углеводород/i.test(text);
  }
  return false;
}

function apCatalogMatchPurposeModes(product, modes) {
  if (!modes || modes.size === 0) return true;
  for (const m of modes) {
    if (m === "interior") {
      if (apCatalogMatchPurpose(product, "indoor") || apCatalogMatchPurpose(product, "wood")) return true;
    } else if (m === "facade") {
      if (apCatalogMatchPurpose(product, "outdoor")) return true;
    } else if (m === "industrial") {
      if (apCatalogMatchPurpose(product, "metal") || apCatalogMatchPurpose(product, "anti-corrosion")) return true;
    } else if (apCatalogMatchExtendedPurpose(product, m)) return true;
  }
  return false;
}

function apCatalogCollectPurposeModes() {
  const set = new Set();
  document.querySelectorAll('#ap-products-panel-catalog input[name="ap-catalog-purpose"]:checked').forEach((el) => {
    if (el.value) set.add(el.value);
  });
  return set;
}

function apCatalogFillFamilySelectIfNeeded() {
  const el = document.getElementById("ap-cat-filter-family");
  if (!el || el.options.length) return;
  el.innerHTML = AP_CATALOG_FAMILY_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
}

function apCatalogPoolAfterFamilyPurpose() {
  const fam = document.getElementById("ap-cat-filter-family")?.value || "all";
  const modes = apCatalogCollectPurposeModes();
  return getProducts().filter((p) => {
    if (fam !== "all" && adminFamilyPoolKey(p.family) !== fam) return false;
    return apCatalogMatchPurposeModes(p, modes);
  });
}

function apCatalogSyncDependentSelects() {
  apCatalogFillFamilySelectIfNeeded();
  const base = apCatalogPoolAfterFamilyPurpose();
  const typeEl = document.getElementById("ap-cat-filter-typeword");
  const codeEl = document.getElementById("ap-cat-filter-code");
  const posEl = document.getElementById("ap-cat-filter-position");
  if (!typeEl || !codeEl || !posEl) return;
  const prevT = typeEl.value;
  const types = [...new Set(base.map((p) => String(p.typeWord || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  typeEl.innerHTML = `<option value="all">Все типы ЛКМ</option>${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}`;
  typeEl.value = prevT !== "all" && types.includes(prevT) ? prevT : "all";

  const tVal = typeEl.value;
  const afterT = tVal === "all" ? base : base.filter((p) => String(p.typeWord || "").trim() === tVal);
  const prevC = codeEl.value;
  const codes = [...new Set(afterT.map((p) => String(p.code || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
    codeEl.innerHTML = `<option value="all">Все артикулы прайса</option>${codes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}`;
  codeEl.value = prevC !== "all" && codes.includes(prevC) ? prevC : "all";

  const cVal = codeEl.value;
  const afterC = cVal === "all" ? afterT : afterT.filter((p) => String(p.code || "").trim() === cVal);
  const prevP = posEl.value;
  const posOpts = afterC.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
  posEl.innerHTML = `<option value="all">Все позиции выборки</option>${posOpts
    .map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(String(p.name || p.code || p.id))}</option>`)
    .join("")}`;
  posEl.value = prevP !== "all" && posOpts.some((p) => String(p.id) === prevP) ? prevP : "all";
}

function apCatalogFilteredProducts() {
  apCatalogSyncDependentSelects();
  const fam = document.getElementById("ap-cat-filter-family")?.value || "all";
  const modes = apCatalogCollectPurposeModes();
  const tVal = document.getElementById("ap-cat-filter-typeword")?.value || "all";
  const cVal = document.getElementById("ap-cat-filter-code")?.value || "all";
  const pVal = document.getElementById("ap-cat-filter-position")?.value || "all";
  const q = (document.getElementById("ap-product-search")?.value || "").trim().toLowerCase();

  const list = getProducts().filter((p) => {
    if (fam !== "all" && adminFamilyPoolKey(p.family) !== fam) return false;
    if (!apCatalogMatchPurposeModes(p, modes)) return false;
    if (tVal !== "all" && String(p.typeWord || "").trim() !== tVal) return false;
    if (cVal !== "all" && String(p.code || "").trim() !== cVal) return false;
    if (pVal !== "all" && String(p.id) !== pVal) return false;
    if (q) {
      const hay = `${p.id || ""} ${String(p.code || "").trim()} ${String(p.name || "").trim()} ${String(p.family || "").trim()}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return list.sort(sortProductsAdmin);
}

function apCatalogFiltersNarrowed() {
  const fam = document.getElementById("ap-cat-filter-family")?.value || "all";
  if (fam !== "all") return true;
  if (apCatalogCollectPurposeModes().size > 0) return true;
  if ((document.getElementById("ap-cat-filter-typeword")?.value || "all") !== "all") return true;
  if ((document.getElementById("ap-cat-filter-code")?.value || "all") !== "all") return true;
  if ((document.getElementById("ap-cat-filter-position")?.value || "all") !== "all") return true;
  if ((document.getElementById("ap-product-search")?.value || "").trim()) return true;
  return false;
}

function resetApCatalogFilters() {
  const fam = document.getElementById("ap-cat-filter-family");
  if (fam) fam.value = "all";
  document.querySelectorAll('#ap-products-panel-catalog input[name="ap-catalog-purpose"]').forEach((el) => {
    if (el instanceof HTMLInputElement) el.checked = false;
  });
  ["ap-cat-filter-typeword", "ap-cat-filter-code", "ap-cat-filter-position"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "all";
  });
  const s = document.getElementById("ap-product-search");
  if (s) s.value = "";
}

function adminStockImageForProduct(p) {
  const poolKey = adminFamilyPoolKey(p.family);
  const pool = ADMIN_CARD_IMAGES[poolKey] || ADMIN_CARD_IMAGES.other;
  const codeSeed = `${p.code || ""}|${p.name || ""}|${p.id || ""}`;
  return pool[adminHashStr(codeSeed) % pool.length];
}

function adminPreviewUrl(p) {
  const id = String(p.id);
  if (pendingDeleteImage.has(id)) return adminStockImageForProduct(p);
  if (previewBlobById.has(id)) return previewBlobById.get(id).url;
  if (ENABLE_BULK_PHOTO_IN_CATALOG && bulkPreview && bulkPreview.ids.includes(id)) return bulkPreview.url;
  const ov = draftOverrides[id] || {};
  const u = ov.cardImageUrl || ov.heroImageUrl;
  if (u) return adminProductOverrideImageSrc(u);
  return adminStockImageForProduct(p);
}

function sortProductsAdmin(a, b) {
  const sa = String(a.code || "").trim();
  const sb = String(b.code || "").trim();
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    const d = Number(sa) - Number(sb);
    if (d !== 0) return d;
  }
  const ca = sa.localeCompare(sb, "ru", { numeric: true });
  if (ca !== 0) return ca;
  return String(a.name || "").localeCompare(String(b.name || ""), "ru");
}

function setStatus(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("err", "ok");
  if (kind === "err") el.classList.add("err");
  if (kind === "ok") el.classList.add("ok");
}

function showView(name) {
  document.querySelectorAll(".ap-view").forEach((v) => v.classList.add("ap-panel-hidden"));
  const map = {
    console: "ap-view-console",
    users: "ap-view-users",
    permissions: "ap-view-permissions",
    catalog: "ap-view-products",
    products: "ap-view-products",
    "product-cards": "ap-view-product-cards",
    prices: "ap-view-prices",
    analytics: "ap-view-analytics",
    delivery: "ap-view-delivery",
    crm: "ap-view-crm",
  };
  if (!apAllowedView(name)) {
    name = Object.keys(map).find((view) => apAllowedView(view)) || "console";
  }
  const id = map[name] || map.console;
  document.getElementById(id)?.classList.remove("ap-panel-hidden");
  document.querySelectorAll(".ap-nav-btn[data-ap-view]").forEach((b) => {
    const nav = b.dataset.apView;
    const on = nav === name || (name === "products" && nav === "catalog");
    b.classList.toggle("is-active", on);
  });
  apSetProductsDraftChromeVisible(name === "catalog" || name === "products");
  if (name === "catalog" || name === "products") {
    renderProductCatalog();
  }
  if (name === "prices") renderApPriceTable();
  if (name === "crm") {
    const ifr = document.getElementById("ap-crm-iframe");
    const CRM_IFRAME_VER = "2";
    if (ifr && ifr.dataset.apCrmIframeVersion !== CRM_IFRAME_VER) {
      /* Полная CRM-воркспейс: склад, прайс, «Фото SKU» по фасовкам (в crm.html этого блока нет). */
      ifr.src = "crm-sales.html?embed=admin#warehouse/catalog-pack-photos";
      ifr.dataset.apCrmIframeVersion = CRM_IFRAME_VER;
      ifr.dataset.apCrmLoaded = "1";
    }
  }
  if (name === "delivery") {
    ensureApDeliveryV2Editors();
    refreshAllApDeliveryPreviews();
  }
  if (name === "users") renderUsersTable();
  if (name === "permissions") renderRolePermissions();
}

function syncHash() {
  const h = (location.hash || "#console").replace(/^#/, "").toLowerCase();
  const allowed = ["console", "users", "permissions", "catalog", "products", "product-cards", "prices", "analytics", "delivery", "crm"];
  let view = allowed.includes(h) ? h : "console";
  if (view === "products") view = "catalog";
  showView(view);
}

async function renderDashboard() {
  const cards = document.getElementById("ap-dashboard-cards");
  const tbody = document.querySelector("#ap-dashboard-paths tbody");
  if (!cards || !tbody) return;
  cards.innerHTML = '<p class="ap-muted">Загрузка…</p>';
  tbody.innerHTML = "";
  try {
    const d = await apiAdmin("GET", "/api/admin/dashboard");
    cards.innerHTML = `
      <div class="ap-stat-card"><strong>${d.leadsLast7Days ?? 0}</strong><span>Новых заявок (7 дн.)</span></div>
      <div class="ap-stat-card"><strong>${d.pageviewsLast7Days ?? 0}</strong><span>Просмотров страниц (7 дн.)</span></div>
      <div class="ap-stat-card"><strong>${d.usersTotal ?? 0}</strong><span>Пользователей</span></div>
      <div class="ap-stat-card"><strong>${d.leadsTotal ?? 0}</strong><span>Всего заявок</span></div>
    `;
    const paths = Array.isArray(d.topPaths) ? d.topPaths : [];
    tbody.innerHTML = paths.length
      ? paths.map((r) => `<tr><td>${escapeHtml(r.path)}</td><td>${r.count}</td></tr>`).join("")
      : `<tr><td colspan="2" class="ap-muted">Нет данных</td></tr>`;
  } catch (e) {
    cards.innerHTML = `<p class="ap-status err">${escapeHtml(e.message)}</p>`;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUserTableCell(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function formatUserTableDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return formatUserTableCell(iso);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return formatUserTableCell(iso);
  }
}

function genderLabelRu(g) {
  const x = String(g || "").toLowerCase();
  if (x === "male") return "муж.";
  if (x === "female") return "жен.";
  if (x === "other") return "другое";
  return g ? formatUserTableCell(g) : "—";
}

function boolRu(b) {
  return b ? "да" : "нет";
}

const AP_USER_ROLES = [
  ["admin", "Администраторы"],
  ["moderator", "Модераторы"],
  ["accountant", "Бухгалтеры"],
  ["manager", "Менеджеры"],
  ["viewer", "Наблюдатели"],
  ["client", "Клиенты"],
];

const AP_USER_ROLE_LABELS = {
  admin: "Администратор",
  moderator: "Модератор",
  accountant: "Бухгалтер",
  manager: "Менеджер",
  viewer: "Наблюдатель",
  client: "Клиент",
};

let apUsersCache = [];

async function loadCurrentPermissions() {
  const roleNorm = String(authUser?.role || "").trim().toLowerCase();
  if (roleNorm === "admin") return;
  try {
    const data = await apiAdmin("GET", "/api/auth/permissions");
    apCurrentPermissions = data.permissions && typeof data.permissions === "object" ? data.permissions : {};
    authUser.permissions = apCurrentPermissions;
    try {
      localStorage.setItem("authUser", JSON.stringify(authUser));
    } catch {
      /* ignore */
    }
  } catch {
    apCurrentPermissions = {};
  }
}

async function refreshAuthUserFromMe() {
  if (!token) return;
  try {
    const me = await apiAdmin("GET", "/api/auth/me");
    if (me && typeof me === "object") {
      authUser = me;
      if (me.permissions && typeof me.permissions === "object") {
        apCurrentPermissions = me.permissions;
      }
      try {
        localStorage.setItem("authUser", JSON.stringify(me));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function renderAdminAccessDenied() {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
      <section style="max-width:640px;width:100%;background:#111827;border:1px solid #334155;border-radius:14px;padding:22px">
        <h1 style="margin:0 0 10px;font-size:20px">Нет доступа к админ-панели</h1>
        <p style="margin:0 0 14px;color:#94a3b8;line-height:1.45">
          У текущей сессии нет прав <code>admin</code> или <code>adminPanel.view</code>.
          Войдите под администратором.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a href="auth.html?next=admin.html" style="padding:9px 13px;border-radius:9px;background:#1d4ed8;color:#fff;text-decoration:none">Войти как админ</a>
          <a href="index.html" style="padding:9px 13px;border-radius:9px;border:1px solid #475569;color:#e2e8f0;text-decoration:none">На главную</a>
        </div>
      </section>
    </main>
  `;
}

function apPermissionViewMap() {
  return {
    console: "analytics.view",
    users: "users.view",
    permissions: "users.editRole",
    catalog: "catalog.view",
    products: "catalog.view",
    "product-cards": "siteContent.edit",
    prices: "catalog.edit",
    analytics: "analytics.view",
    delivery: "siteContent.edit",
    crm: "leads.view",
  };
}

function apAllowedView(name) {
  if (authUser.role === "admin") return true;
  if (name === "permissions") return false;
  const perm = apPermissionViewMap()[name];
  return perm ? apCan(perm) : false;
}

function applyAdminPermissionsUi() {
  document.querySelectorAll(".ap-nav-btn[data-ap-view]").forEach((btn) => {
    const view = btn.dataset.apView;
    btn.hidden = !apAllowedView(view);
  });
  document.getElementById("ap-user-create-form")?.toggleAttribute("hidden", !apCan("users.create"));
  document.getElementById("ap-users-csv")?.toggleAttribute("hidden", !apCan("users.export"));
  document.getElementById("ap-users-clients-xls")?.toggleAttribute("hidden", !apCan("users.export"));
  document.getElementById("ap-permissions-save")?.toggleAttribute("hidden", authUser.role !== "admin");
}

async function renderRolePermissions() {
  const root = document.getElementById("ap-permissions-root");
  const statusEl = document.getElementById("ap-permissions-status");
  if (!root) return;
  if (authUser.role !== "admin") {
    root.innerHTML = '<p class="ap-status err">Редактировать права ролей может только администратор.</p>';
    return;
  }
  root.innerHTML = '<p class="ap-muted">Загрузка прав…</p>';
  setStatus(statusEl, "Загрузка…", null);
  try {
    const data = await apiAdmin("GET", "/api/admin/role-permissions");
    apRolePermissionRoles = Array.isArray(data.roles) ? data.roles : [];
    apRolePermissionDefs = Array.isArray(data.permissions) ? data.permissions : [];
    apRolePermissionMatrix = data.matrix && typeof data.matrix === "object" ? data.matrix : {};
    const head = `<tr><th>Право</th>${apRolePermissionRoles.map((r) => `<th>${escapeHtml(r.label || r.id)}</th>`).join("")}</tr>`;
    const rows = apRolePermissionDefs
      .map((p) => {
        const cells = apRolePermissionRoles
          .map((r) => {
            const checked = Boolean(apRolePermissionMatrix[r.id]?.[p.id]);
            const disabled = r.id === "admin" ? "disabled" : "";
            return `<td><label class="ap-permission-check"><input type="checkbox" data-role="${escapeHtml(r.id)}" data-permission="${escapeHtml(p.id)}" ${checked ? "checked" : ""} ${disabled} /> <span>${checked && r.id === "admin" ? "всегда" : ""}</span></label></td>`;
          })
          .join("");
        return `<tr><th>${escapeHtml(p.label || p.id)}<small>${escapeHtml(p.id)}</small></th>${cells}</tr>`;
      })
      .join("");
    root.innerHTML = `<div class="ap-table-wrap ap-permissions-table-wrap"><table class="ap-table ap-permissions-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    setStatus(statusEl, "Права загружены.", "ok");
  } catch (e) {
    root.innerHTML = `<p class="ap-status err">${escapeHtml(e.message || "Ошибка загрузки прав")}</p>`;
    setStatus(statusEl, e.message || "Ошибка загрузки прав", "err");
  }
}

function collectRolePermissionsMatrix() {
  const matrix = {};
  for (const role of apRolePermissionRoles) {
    matrix[role.id] = { ...(apRolePermissionMatrix[role.id] || {}) };
  }
  document.querySelectorAll("#ap-permissions-root input[data-role][data-permission]").forEach((input) => {
    const role = input.getAttribute("data-role");
    const permission = input.getAttribute("data-permission");
    if (!role || !permission) return;
    if (!matrix[role]) matrix[role] = {};
    matrix[role][permission] = input.checked;
  });
  return matrix;
}

function apUserRoleOptions(selected) {
  return AP_USER_ROLES.map(([role]) => `<option value="${role}" ${role === selected ? "selected" : ""}>${AP_USER_ROLE_LABELS[role]}</option>`).join("");
}

function apUserContactLine(u) {
  const pr = u.profile || {};
  return [u.email, pr.phone, pr.companyName].filter((x) => x && String(x).trim()).map((x) => escapeHtml(String(x).trim())).join(" · ") || "—";
}

function apUserSearchText(u) {
  const pr = u.profile || {};
  return `${u.id || ""} ${u.name || ""} ${u.email || ""} ${u.role || ""} ${pr.phone || ""} ${pr.companyName || ""} ${pr.countryRegion || ""}`.toLowerCase();
}

function apSortedClients(items) {
  const q = (document.getElementById("ap-users-client-search")?.value || "").trim().toLowerCase();
  const sort = document.getElementById("ap-users-client-sort")?.value || "created_desc";
  const filtered = q ? items.filter((u) => apUserSearchText(u).includes(q)) : items.slice();
  filtered.sort((a, b) => {
    const ap = a.profile || {};
    const bp = b.profile || {};
    if (sort === "created_asc") return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (sort === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    if (sort === "company_asc") return String(ap.companyName || "").localeCompare(String(bp.companyName || ""), "ru");
    if (sort === "updated_desc") return String(b.profileUpdatedAt || "").localeCompare(String(a.profileUpdatedAt || ""));
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return filtered;
}

function renderApStaffUserCard(u) {
  const pr = u.profile || {};
  const canEditRole = apCan("users.editRole");
  const canDelete = apCan("users.delete");
  return `<article class="ap-user-card" data-user-id="${escapeHtml(String(u.id))}">
    <div class="ap-user-card-main">
      <strong>${escapeHtml(u.name || "Без имени")}</strong>
      <span>${apUserContactLine(u)}</span>
      <small>ID ${escapeHtml(String(u.id))} · Регистрация: ${escapeHtml(formatUserTableDate(u.createdAt))}</small>
      ${pr.countryRegion ? `<small>Регион: ${escapeHtml(pr.countryRegion)}</small>` : ""}
    </div>
    <div class="ap-user-card-actions">
      <select class="ap-user-role-select" aria-label="Роль пользователя" ${canEditRole ? "" : "disabled"}>${apUserRoleOptions(u.role || "client")}</select>
      <button type="button" class="ap-btn ap-btn-primary ap-btn-sm ap-user-role-save" ${canEditRole ? "" : "disabled"}>Изменить</button>
      <button type="button" class="ap-btn ap-btn-danger ap-btn-sm ap-user-delete" ${canDelete ? "" : "disabled"}>Удалить</button>
    </div>
  </article>`;
}

function renderApClientsTable(items, total) {
    if (!items.length) {
    return `<p class="ap-muted ap-text-compact">Клиенты не найдены по текущему фильтру.</p>`;
  }
  return `<div class="ap-table-wrap ap-users-client-table-wrap">
    <table class="ap-table ap-users-client-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Клиент</th>
          <th>Контакты</th>
          <th>Компания / регион</th>
          <th>Регистрация</th>
          <th>Профиль</th>
          <th>Роль</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        ${items
      .map((u) => {
        const pr = u.profile || {};
            const canEditRole = apCan("users.editRole");
            const canDelete = apCan("users.delete");
            return `<tr data-user-id="${escapeHtml(String(u.id))}">
          <td>${escapeHtml(String(u.id))}</td>
              <td><strong>${escapeHtml(u.name || "Без имени")}</strong><br><span class="ap-muted">${escapeHtml(u.email || "—")}</span></td>
              <td>${escapeHtml(pr.phone || "—")}</td>
              <td>${escapeHtml([pr.companyName, pr.countryRegion].filter(Boolean).join(" · ") || "—")}</td>
          <td>${escapeHtml(formatUserTableDate(u.createdAt))}</td>
          <td>${escapeHtml(formatUserTableDate(u.profileUpdatedAt))}</td>
              <td><select class="ap-user-role-select" aria-label="Роль пользователя" ${canEditRole ? "" : "disabled"}>${apUserRoleOptions(u.role || "client")}</select></td>
              <td class="ap-users-actions-cell">
                <button type="button" class="ap-btn ap-btn-primary ap-btn-sm ap-user-role-save" ${canEditRole ? "" : "disabled"}>Изменить</button>
                <button type="button" class="ap-btn ap-btn-danger ap-btn-sm ap-user-delete" ${canDelete ? "" : "disabled"}>Удалить</button>
              </td>
        </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <p class="ap-muted ap-text-compact ap-users-client-count">Показано клиентов: ${items.length} из ${total}</p>
  </div>`;
}

function renderUsersFromCache() {
  const root = document.getElementById("ap-users-root");
  const statusEl = document.getElementById("ap-users-status");
  if (!root) return;
  const byRole = new Map(AP_USER_ROLES.map(([role]) => [role, []]));
  for (const u of apUsersCache) {
    const role = byRole.has(u.role) ? u.role : "client";
    byRole.get(role).push(u);
  }
  const staffHtml = AP_USER_ROLES.filter(([role]) => role !== "client")
    .map(([role, title]) => {
      const items = byRole.get(role) || [];
      return `<section class="ap-users-role-block">
        <h2>${title} <span>${items.length}</span></h2>
        <div class="ap-users-role-list">${items.length ? items.map(renderApStaffUserCard).join("") : `<p class="ap-muted ap-text-compact">Нет пользователей в этой роли.</p>`}</div>
      </section>`;
      })
      .join("");
  const clients = byRole.get("client") || [];
  const clientItems = apSortedClients(clients);
  root.innerHTML = `${staffHtml}
    <section class="ap-users-role-block ap-users-role-block--clients">
      <h2>Клиенты <span>${clients.length}</span></h2>
      ${renderApClientsTable(clientItems, clients.length)}
    </section>`;
  setStatus(statusEl, `Пользователей: ${apUsersCache.length}`, "ok");
}

async function renderUsersTable() {
  const root = document.getElementById("ap-users-root");
  const statusEl = document.getElementById("ap-users-status");
  if (!root) return;
  root.innerHTML = '<p class="ap-muted">Загрузка пользователей…</p>';
  setStatus(statusEl, "Загрузка…", null);
  try {
    const data = await apiAdmin("GET", "/api/users");
    apUsersCache = Array.isArray(data.items) ? data.items : [];
    renderUsersFromCache();
  } catch (e) {
    setStatus(statusEl, e.message || "Ошибка", "err");
    root.innerHTML = `<p class="ap-status err">${escapeHtml(e.message || "Ошибка")}</p>`;
  }
}

async function downloadUsersCsv() {
  const statusEl = document.getElementById("ap-users-status");
  setStatus(statusEl, "Формируем CSV…", null);
  try {
    const url = apiUrl("/api/users/export.csv");
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || res.statusText);
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    setStatus(statusEl, "CSV скачан.", "ok");
  } catch (e) {
    setStatus(statusEl, e.message || "Ошибка выгрузки", "err");
  }
}

function usersExportDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("ru-RU");
  } catch {
    return String(iso);
  }
}

function usersExportBool(v) {
  return v ? "Да" : "Нет";
}

function usersExportCell(v) {
  return escapeHtml(v == null ? "" : String(v));
}

function buildClientsExportHtml(clients) {
  const rows = clients
    .map((u) => {
      const pr = u.profile || {};
      const pv = pr.privacy || {};
      return `<tr>
        <td>${usersExportCell(u.id)}</td>
        <td>${usersExportCell(u.name || "")}</td>
        <td>${usersExportCell(u.email || "")}</td>
        <td>${usersExportCell(AP_USER_ROLE_LABELS[u.role] || u.role || "")}</td>
        <td>${usersExportCell(usersExportDateTime(u.createdAt))}</td>
        <td>${usersExportCell(usersExportDateTime(u.profileUpdatedAt))}</td>
        <td>${usersExportCell(pr.age ?? "")}</td>
        <td>${usersExportCell(genderLabelRu(pr.gender))}</td>
        <td>${usersExportCell(pr.phone || "")}</td>
        <td>${usersExportCell(pr.companyName || "")}</td>
        <td>${usersExportCell(pr.countryRegion || "")}</td>
        <td>${usersExportCell(pr.legalAddress || "")}</td>
        <td>${usersExportCell(pr.deliveryAddress || "")}</td>
        <td>${usersExportCell(pr.avatarUrl || "")}</td>
        <td>${usersExportCell(usersExportBool(pv.hideEmail))}</td>
        <td>${usersExportCell(usersExportBool(pv.hidePhone))}</td>
        <td>${usersExportCell(usersExportBool(pv.hideLegalAddress))}</td>
        <td>${usersExportCell(usersExportBool(pv.hideDeliveryAddress))}</td>
      </tr>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; margin: 18px; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p.meta { margin: 0 0 14px; color: #475569; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    thead th { background: #dbeafe; color: #1e3a8a; font-weight: 700; border: 1px solid #93c5fd; padding: 7px 8px; text-align: left; white-space: nowrap; }
    tbody td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Клиенты сайта</h1>
  <p class="meta">Выгружено: ${usersExportCell(new Date().toLocaleString("ru-RU"))} · Всего клиентов: ${usersExportCell(clients.length)}</p>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Имя</th>
        <th>Email</th>
        <th>Роль</th>
        <th>Регистрация</th>
        <th>Обновлён профиль</th>
        <th>Возраст</th>
        <th>Пол</th>
        <th>Телефон</th>
        <th>Компания</th>
        <th>Регион/Страна</th>
        <th>Юр. адрес</th>
        <th>Адрес доставки</th>
        <th>Аватар URL</th>
        <th>Скрывать Email</th>
        <th>Скрывать телефон</th>
        <th>Скрывать юр. адрес</th>
        <th>Скрывать адрес доставки</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

async function downloadClientsExcelTable() {
  const statusEl = document.getElementById("ap-users-status");
  if (!apUsersCache.length) {
    await renderUsersTable();
  }
  const clients = apUsersCache.filter((u) => String(u.role || "client") === "client");
  if (!clients.length) {
    setStatus(statusEl, "Клиенты не найдены для выгрузки.", "err");
    return;
  }
  setStatus(statusEl, "Формируем таблицу клиентов…", null);
  const html = buildClientsExportHtml(clients);
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  a.download = `clients-table-${stamp}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
  setStatus(statusEl, `Скачана таблица клиентов: ${clients.length} строк.`, "ok");
}

function formatApDeliveryPreview(row) {
  if (!row || typeof row !== "object") {
    return '<p class="ap-muted">Нет данных</p>';
  }
  const esc = escapeHtml;
  const dl = [
    ["Шапка", row.navUtility],
    ["Подвал", row.footerLink],
    ["H1", row.pageH1],
    ["Лид", row.pageLead],
  ]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || "—")}</dd>`)
    .join("");
  const v2 = row.pageV2 && typeof row.pageV2 === "object" ? row.pageV2 : {};
  const w = v2.wideCard && typeof v2.wideCard === "object" ? v2.wideCard : {};
  const v2Html = `<div class="ap-delivery-preview-cards-h">Макет v2</div>
    <p class="ap-delivery-preview-card-p"><strong>${esc(w.title || "—")}</strong> — ${esc(w.sub || "")}</p>
    <p class="ap-delivery-preview-card-p">${esc(w.priceFromLabel || "")} ${esc(w.priceFrom || "")} / ${esc(w.priceToLabel || "")} ${esc(w.priceTo || "")}</p>`;
  return `<dl class="ap-delivery-preview-dl">${dl}</dl>${v2Html}`;
}

function refreshApDeliveryPreview(lang) {
  const el = document.getElementById(`ap-delivery-preview-${lang}`);
  if (!el) return;
  el.innerHTML = formatApDeliveryPreview(collectApDeliveryLangPayload(lang));
}

function refreshAllApDeliveryPreviews() {
  ["ru", "uk", "en"].forEach((lang) => refreshApDeliveryPreview(lang));
}


/**
 * Числовые артикулы и lineCode совпадают с логикой catalog-pricing (сайт, прайс, каталог).
 */
function apEnsureUnifiedCatalogArticleCodes() {
  const arr = window.PRODUCTS_DATA;
  if (!Array.isArray(arr) || arr.length < 1) return;
  if (typeof window.dpNormalizeCatalogProductsInPlace === "function") {
    window.dpNormalizeCatalogProductsInPlace(arr);
  }
  if (typeof window.dpApplyNumericCodesToCatalogData === "function") {
    window.dpApplyNumericCodesToCatalogData(arr);
  }
}

async function loadAdminProductsCatalog() {
  try {
    const d = await apiAdmin("GET", "/api/admin/products-catalog");
    if (Array.isArray(d.products)) {
      window.PRODUCTS_DATA = d.products;
      apNormalizeExtraColumnsIntoBaseFields();
      apEnsureUnifiedCatalogArticleCodes();
    }
  } catch {
    /* остаётся products-data.js */
  }
}

function setApCatalogDirty(dirty) {
  const bar = document.getElementById("ap-price-draft-bar");
  const btn = document.getElementById("ap-price-save");
  if (bar) bar.classList.toggle("is-dirty", dirty);
  if (btn) btn.disabled = !dirty;
}

function normalizeHeaderCell(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/\s/g, "");
}

function parseCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function apNowLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readApPriceImportHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(AP_PRICE_IMPORT_HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveApPriceImportHistory(items) {
  try {
    localStorage.setItem(AP_PRICE_IMPORT_HISTORY_KEY, JSON.stringify(items.slice(0, AP_PRICE_IMPORT_HISTORY_MAX)));
  } catch {
    /* Если localStorage переполнен, история просто не сохранится. */
  }
}

function renderApPriceImportHistory() {
  const root = document.getElementById("ap-price-import-history");
  if (!root) return;
  const items = readApPriceImportHistory();
  if (!items.length) {
    root.innerHTML = `<p class="ap-muted ap-price-import-history-meta">История пока пустая.</p>`;
    return;
  }
  root.innerHTML = items
    .map((it) => {
      const ok = it.status === "ok";
      const stats = ok
        ? `обновлено ${Number(it.updated || 0)}, добавлено ${Number(it.added || 0)}${it.skipped ? `, пропущено ${Number(it.skipped)}` : ""}${
            it.removedImportDupes ? `, дубл. в файле −${Number(it.removedImportDupes)}` : ""
          }${it.removedCatalogIdDupes ? `, дубл. id −${Number(it.removedCatalogIdDupes)}` : ""}`
        : escapeHtml(it.error || "ошибка импорта");
      return `
        <div class="ap-price-import-history-item${ok ? "" : " is-error"}" data-import-history-id="${escapeHtml(it.id)}">
          <div class="ap-price-import-history-main">
            <p class="ap-price-import-history-title">${escapeHtml(it.fileName || "Файл без имени")}</p>
            <p class="ap-price-import-history-meta">${escapeHtml(apNowLabel(it.createdAt))} · ${ok ? "успешно" : "ошибка"} · ${stats}</p>
          </div>
          ${
            ok && Array.isArray(it.beforeProducts)
              ? `<button type="button" class="ap-btn ap-btn-ghost ap-btn-sm" data-ap-price-rollback="${escapeHtml(it.id)}">Откатить</button>`
              : ""
          }
        </div>`;
    })
    .join("");
}

function setApPriceLastFile(entry) {
  const el = document.getElementById("ap-price-last-file");
  if (!el) return;
  if (!entry) {
    el.textContent = "Файл ещё не загружался.";
    return;
  }
  const prefix = entry.status === "ok" ? "Последний файл" : "Последняя ошибка";
  const detail =
    entry.status === "ok"
      ? `обновлено ${Number(entry.updated || 0)}, добавлено ${Number(entry.added || 0)}`
      : entry.error || "ошибка импорта";
  el.textContent = `${prefix}: ${entry.fileName || "без имени"} · ${apNowLabel(entry.createdAt)} · ${detail}`;
}

function addApPriceImportHistory(entry) {
  const items = readApPriceImportHistory();
  const next = [{ id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), ...entry }, ...items];
  saveApPriceImportHistory(next);
  setApPriceLastFile(next[0]);
  renderApPriceImportHistory();
}

/** Полная очистка каталога: очищает таблицу и сразу сохраняет пустой каталог на сервере. */
async function clearApPriceCatalogLocalData() {
  const status = document.getElementById("ap-price-save-status");
  if (
    !window.confirm(
      "Удалить все позиции прайса и сразу записать пустой каталог на сервер?\n\nПозиции исчезнут в админке, products.html и price.html после сохранения."
    )
  ) {
    return;
  }
  setStatus(status, "Очищаем каталог и сохраняем изменения на сервер...", null);
  window.PRODUCTS_DATA = [];
  saveApPriceImportHistory([]);
  setApPriceLastFile(null);
  renderApPriceImportHistory();
  adminBulkSelectedIds.clear();
  selectProduct(null);
  apPriceFindCursor = -1;
  apClearPriceRowHighlight();
  renderApPriceTable();
  try {
    await apiAdmin("PUT", "/api/admin/products-catalog", { products: [] });
    setApCatalogDirty(false);
    await notifyPublicCatalogUpdated();
    await renderApPriceServerBackups();
    setStatus(status, "Каталог очищен и сохранён на сервере. Данные на сайте обновлены.", "ok");
  } catch (e) {
    setApCatalogDirty(true);
    setStatus(status, `Локально очищено, но не сохранено на сервер: ${e.message || String(e)}`, "err");
  }
}

function rollbackApPriceImport(id) {
  const hit = readApPriceImportHistory().find((it) => it.id === id);
  if (!hit || !Array.isArray(hit.beforeProducts)) return;
  if (!window.confirm(`Откатить каталог к версии до загрузки файла "${hit.fileName || "без имени"}"? После отката нажмите «Сохранить каталог на сервер».`)) return;
  window.PRODUCTS_DATA = hit.beforeProducts.map((p) => ({ ...p }));
  apEnsureUnifiedCatalogArticleCodes();
  renderApPriceTable();
  renderProductCatalog();
  setApCatalogDirty(true);
  const status = document.getElementById("ap-price-save-status");
  setStatus(status, `Каталог откатан к версии до файла "${hit.fileName || "без имени"}". Сохраните каталог на сервер.`, "ok");
}

async function renderApPriceServerBackups() {
  const root = document.getElementById("ap-price-server-backups");
  if (!root) return;
  root.innerHTML = `<p class="ap-muted ap-price-import-history-meta">Загружаем версии...</p>`;
  try {
    const data = await apiAdmin("GET", "/api/admin/products-catalog/backups");
    const items = Array.isArray(data.backups) ? data.backups : [];
    if (!items.length) {
      root.innerHTML = `<p class="ap-muted ap-price-import-history-meta">Пока нет сохранённых резервных версий. Они появятся после первого сохранения каталога.</p>`;
      return;
    }
    root.innerHTML = items
      .map(
        (it) => `
        <div class="ap-price-import-history-item" data-server-backup-id="${escapeHtml(it.id)}">
          <div class="ap-price-import-history-main">
            <p class="ap-price-import-history-title">Версия от ${escapeHtml(apNowLabel(it.createdAt))}</p>
            <p class="ap-price-import-history-meta">${escapeHtml(it.reason || "save")} · позиций: ${Number(it.count || 0)} · id: ${escapeHtml(it.id)}</p>
          </div>
          <button type="button" class="ap-btn ap-btn-ghost ap-btn-sm" data-ap-price-restore="${escapeHtml(it.id)}">Восстановить</button>
        </div>`
      )
      .join("");
  } catch (e) {
    root.innerHTML = `<p class="ap-status err">${escapeHtml(e.message || e)}</p>`;
  }
}

async function restoreApPriceServerBackup(id) {
  if (!id) return;
  if (!window.confirm("Восстановить эту рабочую версию прайс-листа на сервере? Текущая версия тоже будет сохранена как резервная копия.")) return;
  const status = document.getElementById("ap-price-save-status");
  try {
    const data = await apiAdmin("POST", "/api/admin/products-catalog/restore", { id });
    await loadAdminProductsCatalog();
    setApCatalogDirty(false);
    renderApPriceTable();
    renderProductCatalog();
    await notifyPublicCatalogUpdated();
    await renderApPriceServerBackups();
    setStatus(status, `Восстановлена версия прайса (${data.count || 0} позиций).`, "ok");
  } catch (e) {
    setStatus(status, e.message || String(e), "err");
  }
}

const AP_PRICE_IMPORT_FIELDS = ["id", "family", "code", "name", "jarSmallKg", "jarBigKg", "bucketKg", "drumKg", "priceNoNdsPerKg", "priceNdsPerKg"];
let apPriceDynamicColumns = [];
const AP_PRICE_BASE_LABELS_KEY = "dpPriceBaseColumnLabels";
const AP_PRICE_BASE_LABELS_DEFAULT = {
  family: "Тип покрытия",
  code: "Артикул",
  name: "Наименование",
  priceNoNdsPerKg: "Без НДС / кг",
  priceNdsPerKg: "С НДС / кг",
  jarSmallKg: "мал /кг/ банка",
  jarBigKg: "вел /кг/ банка",
  bucketKg: "Вага /кг/ відро",
  drumKg: "Вага /кг/ барабан",
};
let apPriceBaseColumnLabels = { ...AP_PRICE_BASE_LABELS_DEFAULT };
const AP_PRICE_IMPORT_ALIASES = {
  id: ["id", "ид", "ід", "identifier", "sku_id"],
  family: [
    "family",
    "семейство",
    "сімейство",
    "тип покрытия",
    "тип покриття",
    "группа",
    "група",
    "тип",
    "категория",
    "категорія",
  ],
  code: ["code", "код", "артикул", "sku", "номенклатурныйкод", "номенклатурнийкод"],
  name: [
    "name",
    "название",
    "назва",
    "наименование",
    "найменування",
    "найменуванняпродукції",
    "наименованиепродукции",
    "товар",
    "продукция",
    "продукція",
    "номенклатура",
  ],
  jarSmallKg: [
    "jarsmallkg",
    "малкгбанка",
    "мал/кг/банка",
    "малбанка",
    "малабанка",
    "мал",
    "вагакгмалбанка",
    "вагакгмалабанка",
    "вескгмалбанка",
    "вескгмалабанка",
  ],
  jarBigKg: [
    "jarbigkg",
    "велкгбанка",
    "вел/кг/банка",
    "велбанка",
    "великабанка",
    "вел",
    "вагакгвелбанка",
    "вагакгвеликабанка",
    "вескгвелбанка",
    "вескгвеликабанка",
  ],
  bucketKg: ["bucketkg", "ведрокг", "відрокг", "ведро", "відро", "фасовкаведро", "фасуваннявідро", "вагакгвідро", "вагакгведро"],
  drumKg: ["drumkg", "барабанкг", "бочкакг", "барабан", "бочка", "вагакгбарабан", "вагакгбочка"],
  priceNoNdsPerKg: [
    "pricenondsperkg",
    "ценабезндскг",
    "цінабезпдвкг",
    "ціназа1кгбезпдв",
    "ценаза1кгбезндс",
    "безндскг",
    "безпдвкг",
    "грнкгбезндс",
    "грнкгбезпдв",
    "опт",
    "оптовая",
    "оптовакг",
  ],
  priceNdsPerKg: [
    "pricendsperkg",
    "ценасндскг",
    "ціназпдвкг",
    "ціназа1кгзпдв",
    "ценаза1кгсндс",
    "сндскг",
    "зпдвкг",
    "грнкг",
    "грнкгсндс",
    "грнкгзпдв",
    "розница",
    "роздріб",
    "цена",
    "ціна",
  ],
};

const AP_PRICE_IMPORT_ALIAS_NORMALIZED = (() => {
  const byField = {};
  const all = new Set();
  for (const [field, aliases] of Object.entries(AP_PRICE_IMPORT_ALIASES)) {
    const s = new Set();
    for (const a of aliases || []) {
      const n = normalizeImportHeaderCell(a);
      if (!n) continue;
      s.add(n);
      all.add(n);
    }
    byField[field] = s;
  }
  return { byField, all };
})();

function normalizeImportHeaderCell(h) {
  return normalizeHeaderCell(h).replace(/[\s._\-\/\\()[\]№#:+]+/g, "");
}

/** Убирает лишние пробелы, NBSP, переносы строк из импорта — одна строка, единые пробелы. */
function apNormalizeImportCellString(value) {
  let s = String(value ?? "").replace(/\uFEFF/g, "").replace(/\u00A0/g, " ");
  s = s.replace(/[\u2000-\u200B\u202F\u205F\u3000]+/g, " ");
  s = s.trim();
  if (!s) return "";
  return s.replace(/\r\n/g, "\n").replace(/[\t\v\f]/g, " ").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function apPriceNum(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  let s = String(v).trim().replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function apPackRangeLabelByKg(kgRaw) {
  const w = Number(kgRaw);
  if (!Number.isFinite(w) || w <= 0) return "—";
  if (w >= 0.1 && w <= 2.7) return "Банка мал";
  if (w >= 2.8 && w <= 6) return "Банка бол";
  if (w >= 7 && w <= 30) return "Ведро";
  if (w >= 32 && w <= 50) return "Барабан";
  return "Вне диапазона";
}

function apPriceRangeMatch(field, valueRaw) {
  const v = Number(valueRaw);
  if (!Number.isFinite(v) || v <= 0) return true;
  if (field === "jarSmallKg") return v >= 0.1 && v <= 2.7;
  if (field === "jarBigKg") return v >= 2.8 && v <= 6;
  if (field === "bucketKg") return v >= 7 && v <= 30;
  if (field === "drumKg") return v >= 32 && v <= 50;
  return true;
}

function apApplyPriceRangeValidationForRow(tr, p) {
  if (!(tr instanceof HTMLTableRowElement)) return true;
  let ok = true;
  ["jarSmallKg", "jarBigKg", "bucketKg", "drumKg"].forEach((field) => {
    const inp = tr.querySelector(`input[data-ap-field="${field}"]`);
    if (!(inp instanceof HTMLInputElement)) return;
    const valid = apPriceRangeMatch(field, p?.[field]);
    inp.classList.toggle("ap-price-field-invalid", !valid);
    if (!valid) ok = false;
  });
  return ok;
}

function apCollectPriceRangeIssues() {
  const list = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  const issues = [];
  for (const p of list) {
    for (const field of ["jarSmallKg", "jarBigKg", "bucketKg", "drumKg"]) {
      if (!apPriceRangeMatch(field, p?.[field])) issues.push({ id: String(p?.id || ""), field, value: p?.[field] });
    }
  }
  return issues;
}

function apPriceKnownColumnIndexes(idx) {
  const out = new Set();
  for (const key of AP_PRICE_IMPORT_FIELDS) {
    const i = Number(idx[key]);
    if (Number.isFinite(i) && i >= 0) out.add(i);
  }
  return out;
}

function apExtractDynamicColumnsFromHeader(headerCells, idx) {
  const known = apPriceKnownColumnIndexes(idx);
  const cols = [];
  const seen = new Set();
  for (let i = 0; i < headerCells.length; i += 1) {
    if (known.has(i)) continue;
    const raw = String(headerCells[i] || "").trim();
    if (!raw) continue;
    const normalized = normalizeImportHeaderCell(raw);
    if (AP_PRICE_IMPORT_ALIAS_NORMALIZED.all.has(normalized)) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cols.push(raw);
  }
  return cols;
}

function apResolveBaseFieldByDynamicLabel(label) {
  const n = normalizeImportHeaderCell(label);
  for (const [field, set] of Object.entries(AP_PRICE_IMPORT_ALIAS_NORMALIZED.byField)) {
    if (set.has(n)) return field;
  }
  return null;
}

function apNormalizeExtraColumnsIntoBaseFields() {
  const list = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  for (const p of list) {
    const map = p && p.extraPriceColumns && typeof p.extraPriceColumns === "object" ? p.extraPriceColumns : null;
    if (!map) continue;
    const next = {};
    for (const [label, rawVal] of Object.entries(map)) {
      const baseField = apResolveBaseFieldByDynamicLabel(label);
      if (!baseField) {
        next[label] = rawVal;
        continue;
      }
      const parsed = apPriceNum(rawVal);
      const current = apPriceNum(p?.[baseField]);
      if (current == null && parsed != null) p[baseField] = parsed;
    }
    p.extraPriceColumns = next;
  }
}

function apRebuildDynamicColumns(preferred = []) {
  const out = [];
  const seen = new Set();
  for (const c of preferred) {
    const label = String(c || "").trim();
    if (!label) continue;
    if (apResolveBaseFieldByDynamicLabel(label)) continue;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  const list = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  for (const p of list) {
    const map = p && p.extraPriceColumns && typeof p.extraPriceColumns === "object" ? p.extraPriceColumns : null;
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const label = String(key || "").trim();
      if (!label) continue;
      if (apResolveBaseFieldByDynamicLabel(label)) continue;
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(label);
    }
  }
  apPriceDynamicColumns = out;
}

function apLoadPriceBaseColumnLabels() {
  try {
    const raw = JSON.parse(localStorage.getItem(AP_PRICE_BASE_LABELS_KEY) || "{}");
    if (!raw || typeof raw !== "object") return;
    for (const key of Object.keys(AP_PRICE_BASE_LABELS_DEFAULT)) {
      const label = String(raw[key] || "").trim();
      if (label) apPriceBaseColumnLabels[key] = label;
    }
  } catch {
    /* ignore */
  }
}

function apSavePriceBaseColumnLabels() {
  try {
    localStorage.setItem(AP_PRICE_BASE_LABELS_KEY, JSON.stringify(apPriceBaseColumnLabels));
  } catch {
    /* ignore */
  }
}

function apExtractBaseColumnLabels(headerCells, idx) {
  const out = {};
  for (const key of Object.keys(AP_PRICE_BASE_LABELS_DEFAULT)) {
    const i = Number(idx[key]);
    if (!Number.isFinite(i) || i < 0 || i >= headerCells.length) continue;
    const label = String(headerCells[i] || "").trim();
    if (label) out[key] = label;
  }
  return out;
}

function apApplyBaseColumnLabels(labels) {
  if (!labels || typeof labels !== "object") return;
  let changed = false;
  for (const key of Object.keys(AP_PRICE_BASE_LABELS_DEFAULT)) {
    const label = String(labels[key] || "").trim();
    if (!label) continue;
    if (apPriceBaseColumnLabels[key] !== label) {
      apPriceBaseColumnLabels[key] = label;
      changed = true;
    }
  }
  if (changed) apSavePriceBaseColumnLabels();
}

function apPriceInferFamily(row) {
  const text = `${row.family || ""} ${row.name || ""} ${row.code || ""}`.toLowerCase();
  if (/грунт|primer|gf|гф/.test(text)) return "primer";
  if (/эмал|емал|enamel|пф|pf|хв|хс|эп/.test(text)) return "enamel";
  if (/лак|lacquer/.test(text)) return "lacquer";
  if (/краск|фарб|paint/.test(text)) return "paint";
  if (/шпат|шпак|putty/.test(text)) return "putty";
  return String(row.family || "other").trim() || "other";
}

function apExtractProductCode(name) {
  const text = String(name || "").toUpperCase();
  const hit = text.match(/[A-ZА-ЯІЇЄҐ]{1,4}[\s-]*\d{2,4}(?:\s*[A-ZА-ЯІЇЄҐ]{1,3})?/u);
  return hit ? hit[0].replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim() : "";
}

function apImportComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[ії]/g, "и")
    .replace(/є/g, "е")
    .replace(/ґ/g, "г")
    .replace(/ё/g, "е")
    .replace(/жовт\w*/g, "желт")
    .replace(/помаранч\w*/g, "оранж")
    .replace(/червон\w*/g, "красн")
    .replace(/сір\w*/g, "сер")
    .replace(/біл\w*/g, "бел")
    .replace(/чорн\w*/g, "черн")
    .replace(/корич\w*/g, "корич")
    .replace(/крем\w*/g, "крем")
    .replace(/блакит\w*/g, "голуб")
    .replace(/зелен\w*/g, "зелен")
    .replace(/[\s,.;:()/"'«»№]+/g, " ")
    .trim();
}

function apImportTokenSet(value) {
  const text = apImportComparableText(value);
  return new Set(
    text
      .split(/\s+/)
      .map((t) => (t.length > 5 ? t.slice(0, 5) : t))
      .filter((t) => t.length >= 2)
  );
}

function apAliasIndex(header, field) {
  const aliases = AP_PRICE_IMPORT_ALIASES[field] || [];
  return header.findIndex((h) => aliases.includes(h));
}

function apFindPriceHeaderRow(rows) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 20).forEach((row, i) => {
    const header = row.map(normalizeImportHeaderCell);
    let score = 0;
    for (const field of Object.keys(AP_PRICE_IMPORT_ALIASES)) {
      if (apAliasIndex(header, field) !== -1) score += 1;
    }
    if (score > best.score) best = { index: i, score };
  });
  if (best.score < 2) throw new Error("Не найдена строка заголовков. Нужны колонки вроде: code/name/priceNdsPerKg.");
  return best.index;
}

function parseTablePriceCatalog(rawRows) {
  const rows = rawRows
    .map((r) =>
      Array.isArray(r) ? r.map((c) => apNormalizeImportCellString(c == null ? "" : String(c))) : []
    )
    .filter((r) => r.some(Boolean));
  if (rows.length < 2) throw new Error("Нужна строка заголовков и хотя бы одна строка данных.");
  const headerRow = apFindPriceHeaderRow(rows);
  const headerCells = rows[headerRow].map((x) => String(x || "").trim());
  const header = headerCells.map(normalizeImportHeaderCell);
  const idx = {};
  for (const field of Object.keys(AP_PRICE_IMPORT_ALIASES)) idx[field] = apAliasIndex(header, field);
  const dynamicCols = apExtractDynamicColumnsFromHeader(headerCells, idx);
  const baseLabels = apExtractBaseColumnLabels(headerCells, idx);
  const products = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    const cellStr = (field) => {
      const i = idx[field];
      return i >= 0 && cells[i] !== undefined ? String(cells[i]) : "";
    };
    const raw = {
      id: cellStr("id"),
      family: cellStr("family"),
      code: cellStr("code"),
      name: cellStr("name"),
      jarSmallKg: apPriceNum(cellStr("jarSmallKg")),
      jarBigKg: apPriceNum(cellStr("jarBigKg")),
      bucketKg: apPriceNum(cellStr("bucketKg")),
      drumKg: apPriceNum(cellStr("drumKg")),
      priceNoNdsPerKg: apPriceNum(cellStr("priceNoNdsPerKg")),
      priceNdsPerKg: apPriceNum(cellStr("priceNdsPerKg")),
    };
    const extraPriceColumns = {};
    for (const colLabel of dynamicCols) {
      const ci = headerCells.findIndex((h) => String(h || "").trim() === colLabel);
      if (ci < 0 || ci >= cells.length) continue;
      const val = String(cells[ci] || "").trim();
      if (!val) continue;
      extraPriceColumns[colLabel] = val;
    }
    if (Object.keys(extraPriceColumns).length) raw.extraPriceColumns = extraPriceColumns;
    if (!raw.code) raw.code = apExtractProductCode(raw.name);
    const presentFields = AP_PRICE_IMPORT_FIELDS.filter((field) => {
      if (idx[field] < 0) return false;
      if (field === "id" || field === "family" || field === "code" || field === "name") {
        return String(raw[field] || "").length > 0;
      }
      if (field === "jarSmallKg" || field === "jarBigKg" || field === "bucketKg" || field === "drumKg" || field === "priceNoNdsPerKg" || field === "priceNdsPerKg") {
        return raw[field] != null;
      }
      return false;
    });
    if (raw.code && !presentFields.includes("code")) presentFields.push("code");
    if (!raw.id && !raw.code && !raw.name) continue;
    raw.family = raw.family || apPriceInferFamily(raw);
    raw._apPresent = presentFields;
    products.push(raw);
  }
  if (products.length === 0) throw new Error("Не удалось разобрать ни одной строки товара.");
  products._apDynamicColumns = dynamicCols;
  products._apBaseColumnLabels = baseLabels;
  return products;
}

function parseCsvPriceCatalog(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("Нужна строка заголовков и хотя бы одна строка данных.");
  const first = lines[0];
  const delim = first.includes(";") && !first.includes(",") ? ";" : first.includes("\t") ? "\t" : ",";
  return parseTablePriceCatalog(lines.map((line) => parseCsvLine(line, delim)));
}

function parseExcelPriceCatalog(arrayBuffer) {
  if (!window.XLSX) throw new Error("Библиотека чтения Excel не загрузилась. Обновите страницу админки и попробуйте снова.");
  const wb = window.XLSX.read(arrayBuffer, { type: "array" });
  const errors = [];
  for (const sheetName of wb.SheetNames || []) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    try {
      const products = parseTablePriceCatalog(rows);
      products._sheetName = sheetName;
      return products;
    } catch (e) {
      errors.push(`${sheetName}: ${e.message || e}`);
    }
  }
  throw new Error(
    errors.length
      ? `Не удалось найти таблицу прайса ни на одном листе. ${errors.slice(0, 3).join(" | ")}`
      : "В Excel-файле не найден лист с данными."
  );
}

function apNormKey(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function apSlug(v) {
  return (
    String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яёіїєґ]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

function apUniqueProductId(base, used) {
  const clean = apSlug(base);
  let id = `price-${clean}`.slice(0, 110);
  let n = 2;
  while (used.has(id)) {
    const suffix = `-${n++}`;
    id = `price-${clean}`.slice(0, 120 - suffix.length) + suffix;
  }
  used.add(id);
  return id;
}

/** Схлопывает повторяющиеся строки в загружаемом файле: при том же id, коде или наименовании остаётся последняя строка. */
function dedupeImportedPriceCatalogRows(imported) {
  if (!Array.isArray(imported) || imported.length === 0) return { rows: imported, removed: 0 };
  const sheetName = imported._sheetName;
  const byKey = new Map();
  const order = [];
  let anonSeq = 0;
  for (const raw of imported) {
    const id = String(raw.id || "").trim();
    const codeK = apNormKey(raw.code);
    const nameK = apNormKey(raw.name);
    let key;
    if (id) key = `id:${id}`;
    else if (codeK) key = `code:${codeK}`;
    else if (nameK) key = `name:${nameK}`;
    else key = `anon:${anonSeq++}`;
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, raw);
  }
  const unique = order.map((k) => byKey.get(k));
  const removed = imported.length - unique.length;
  const rows = unique;
  if (sheetName !== undefined) rows._sheetName = sheetName;
  return { rows, removed };
}

/** Удаляет вторые и далее вхождения позиций с одинаковым непустым id (после импорта). */
function dedupeCatalogProductsById(products) {
  if (!Array.isArray(products)) return { products, removed: 0 };
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const p of products) {
    const id = String(p.id || "").trim();
    if (id) {
      if (seen.has(id)) {
        removed += 1;
        continue;
      }
      seen.add(id);
    }
    out.push(p);
  }
  return { products: out, removed };
}

function mergeImportedPriceCatalog(imported) {
  const current = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  const next = current.map((p) => ({ ...p }));
  const used = new Set(next.map((p) => String(p.id)));
  const byId = new Map(next.map((p) => [String(p.id), p]));
  const scoreCandidate = (candidate, raw) => {
    let score = 0;
    const rawCode = apNormKey(raw.code);
    const candidateCode = apNormKey(candidate.code);
    const rawName = apNormKey(raw.name);
    const candidateName = apNormKey(candidate.name);
    if (rawCode && candidateCode && rawCode === candidateCode) score += 42;
    if (rawName && candidateName && rawName === candidateName) score += 100;
    const a = apImportTokenSet(`${raw.code || ""} ${raw.name || ""}`);
    const b = apImportTokenSet(`${candidate.code || ""} ${candidate.name || ""}`);
    for (const token of a) {
      if (b.has(token)) score += token.length <= 2 ? 2 : 8;
    }
    return score;
  };
  const findExistingTarget = (raw) => {
    const id = String(raw.id || "").trim();
    if (id && byId.has(id)) return byId.get(id);
    let best = null;
    let bestScore = 0;
    for (const candidate of next) {
      const score = scoreCandidate(candidate, raw);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore >= 58 ? best : null;
  };
  let updated = 0;
  let added = 0;
  let skipped = 0;
  for (const raw of imported) {
    const present = new Set(raw._apPresent || AP_PRICE_IMPORT_FIELDS);
    const id = String(raw.id || "").trim();
    const target = findExistingTarget(raw);
    if (target) {
      for (const field of AP_PRICE_IMPORT_FIELDS) {
        if (field === "id" || !present.has(field)) continue;
        const value = raw[field];
        if ((field === "family" || field === "code" || field === "name") && String(value || "").trim()) target[field] = String(value).trim();
        else if ((field === "bucketKg" || field === "drumKg" || field === "priceNoNdsPerKg" || field === "priceNdsPerKg") && value != null) {
          target[field] = value;
        }
      }
      if (raw.extraPriceColumns && typeof raw.extraPriceColumns === "object") {
        if (!target.extraPriceColumns || typeof target.extraPriceColumns !== "object") target.extraPriceColumns = {};
        for (const [k, v] of Object.entries(raw.extraPriceColumns)) {
          const key = String(k || "").trim();
          if (!key) continue;
          const value = String(v || "").trim();
          if (!value) continue;
          target.extraPriceColumns[key] = value;
        }
      }
      updated += 1;
      continue;
    }
    if (!raw.code && !raw.name) {
      skipped += 1;
      continue;
    }
    const newId = id && !used.has(id) ? id : apUniqueProductId(raw.code || raw.name || id, used);
    if (id && !used.has(id)) used.add(id);
    const p = {
      id: newId,
      family: apPriceInferFamily(raw),
      code: String(raw.code || "").trim(),
      name: String(raw.name || raw.code || "Новая позиция").trim(),
      jarSmallKg: raw.jarSmallKg,
      jarBigKg: raw.jarBigKg,
      bucketKg: raw.bucketKg,
      drumKg: raw.drumKg,
      priceNoNdsPerKg: raw.priceNoNdsPerKg,
      priceNdsPerKg: raw.priceNdsPerKg,
    };
    if (raw.extraPriceColumns && typeof raw.extraPriceColumns === "object" && Object.keys(raw.extraPriceColumns).length) {
      p.extraPriceColumns = { ...raw.extraPriceColumns };
    }
    next.push(p);
    byId.set(p.id, p);
    added += 1;
  }
  return { products: next.map((p) => (typeof window.dpNormalizeCatalogProduct === "function" ? window.dpNormalizeCatalogProduct(p) : p)), updated, added, skipped };
}

function updateApPriceRowCalc(tr, p) {
  const small = tr.querySelector('[data-ap-pack-class="jarSmallKg"]');
  if (small) small.textContent = apPackRangeLabelByKg(p?.jarSmallKg);
  const big = tr.querySelector('[data-ap-pack-class="jarBigKg"]');
  if (big) big.textContent = apPackRangeLabelByKg(p?.jarBigKg);
  const bucketCell = tr.querySelector('[data-ap-pack-class="bucketKg"]');
  if (bucketCell) bucketCell.textContent = apPackRangeLabelByKg(p?.bucketKg);
  const drumCell = tr.querySelector('[data-ap-pack-class="drumKg"]');
  if (drumCell) drumCell.textContent = apPackRangeLabelByKg(p?.drumKg);
  apApplyPriceRangeValidationForRow(tr, p);
}

function apFilteredPriceProducts() {
  const list = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  const q = apPriceFilterQuery.trim().toLowerCase();
  if (!q) return list;
  return list.filter((p) =>
    `${p.id || ""} ${p.code || ""} ${p.lineCode || ""} ${p.name || ""} ${p.family || ""}`.toLowerCase().includes(q)
  );
}

function apPriceInputValue(p, field) {
  const v = p[field];
  if (v == null || v === "") return "";
  return String(v);
}

function apClearPriceRowHighlight() {
  document.querySelectorAll("#ap-price-catalog-body tr.ap-price-row-target").forEach((tr) => tr.classList.remove("ap-price-row-target"));
}

function apFocusPriceRowForEdit(tr) {
  if (!tr) return;
  const inp =
    tr.querySelector("input.ap-price-name-input") ||
    tr.querySelector('input[data-ap-field="priceNdsPerKg"]') ||
    tr.querySelector("input.ap-price-field");
  if (inp) inp.focus();
}

/** Поиск по запросу: фильтр таблицы, затем переход к следующей видимой строке и фокус. */
function apFindNextPricePosition() {
  const searchEl = document.getElementById("ap-price-admin-search");
  const hint = document.getElementById("ap-price-find-hint");
  apPriceFilterQuery = (searchEl && searchEl.value) || "";
  const q = apPriceFilterQuery.trim();
  if (!q) {
    apPriceFindCursor = -1;
    apClearPriceRowHighlight();
    if (hint) hint.textContent = "Введите артикул, id или фрагмент названия, затем нажмите «Найти позицию» (или Enter).";
    renderApPriceTable();
    return;
  }
  renderApPriceTable();
  const body = document.getElementById("ap-price-catalog-body");
  if (!body) return;
  const domRows = [...body.querySelectorAll("tr[data-ap-pid]")];
  if (domRows.length === 0) {
    apPriceFindCursor = -1;
    apClearPriceRowHighlight();
    if (hint) hint.textContent = "Ничего не найдено — уточните запрос.";
    return;
  }
  apPriceFindCursor = (apPriceFindCursor + 1) % domRows.length;
  const tr = domRows[apPriceFindCursor];
  apClearPriceRowHighlight();
  tr.classList.add("ap-price-row-target");
  tr.scrollIntoView({ block: "center", behavior: "smooth" });
  apFocusPriceRowForEdit(tr);
  if (hint) {
    const n = domRows.length;
    hint.textContent =
      n === 1
        ? "Найдена 1 позиция — можно править поля в строке."
        : `Позиция ${apPriceFindCursor + 1} из ${n} по запросу. Повторное нажатие — к следующей.`;
  }
}

function renderApPriceTable() {
  const body = document.getElementById("ap-price-catalog-body");
  if (!body) return;
  apRebuildDynamicColumns();
  const rows = apFilteredPriceProducts();
  const sorted = [...rows].sort(sortProductsAdmin);
  const headRow = document.querySelector("#ap-view-prices .ap-price-edit-table thead tr");
  if (headRow) {
    const dynHead = apPriceDynamicColumns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const h = apPriceBaseColumnLabels;
    headRow.innerHTML = `<th>ID</th><th>${escapeHtml(h.family)}</th><th title="Числовой артикул, единый с каталогом и прайсом на сайте">${escapeHtml(h.code)}</th><th>${escapeHtml(h.name)}</th><th>${escapeHtml(h.priceNoNdsPerKg)}</th><th>${escapeHtml(h.priceNdsPerKg)}</th><th>${escapeHtml(h.jarSmallKg)}</th><th>${escapeHtml(h.jarBigKg)}</th><th>${escapeHtml(h.bucketKg)}</th><th>${escapeHtml(h.drumKg)}</th>${dynHead}`;
  }
  body.innerHTML = sorted
    .map((p) => {
      const id = escapeHtml(p.id);
      const inp = (field, cls = "") =>
        `<input type="text" class="ap-price-field ${cls}" data-ap-pid="${id}" data-ap-field="${field}" value="${escapeHtml(apPriceInputValue(p, field))}" inputmode="text" />`;
      const familyCell =
        typeof window.dpPriceFamilySelectOptionsInnerHtml === "function"
          ? `<select class="ap-price-field ap-price-family-select" data-ap-pid="${id}" data-ap-field="family">${window.dpPriceFamilySelectOptionsInnerHtml(escapeHtml, p.family)}</select>`
          : inp("family");
      const dynCells = apPriceDynamicColumns
        .map((col) => {
          const val = p?.extraPriceColumns && typeof p.extraPriceColumns === "object" ? String(p.extraPriceColumns[col] || "") : "";
          return `<td><input type="text" class="ap-price-field" data-ap-pid="${id}" data-ap-extra-label="${escapeHtml(col)}" value="${escapeHtml(val)}" inputmode="text" /></td>`;
        })
        .join("");
      return `<tr data-ap-pid="${id}">
        <td><code>${id}</code></td>
        <td>${familyCell}</td>
        <td>${inp("code")}</td>
        <td>${inp("name", "ap-price-name-input")}</td>
        <td>${inp("priceNoNdsPerKg")}</td>
        <td>${inp("priceNdsPerKg")}</td>
        <td>${inp("jarSmallKg")}</td>
        <td>${inp("jarBigKg")}</td>
        <td>${inp("bucketKg")}</td>
        <td>${inp("drumKg")}</td>
        ${dynCells}
      </tr>`;
    })
    .join("");
  body.querySelectorAll("tr[data-ap-pid]").forEach((tr) => {
    const pid = tr.getAttribute("data-ap-pid");
    const p = window.PRODUCTS_DATA.find((x) => String(x.id) === pid);
    if (p) updateApPriceRowCalc(tr, p);
  });
}

if (!window.__apDpLangPriceTableBound) {
  window.__apDpLangPriceTableBound = true;
  window.addEventListener("dp-lang-change", () => {
    renderApPriceTable();
  });
}

function downloadApPriceCsvTemplate() {
  const header = "id,family,code,name,jarSmallKg,jarBigKg,bucketKg,drumKg,priceNoNdsPerKg,priceNdsPerKg\n";
  const sample = 'sample-1,enamel,ПФ-000,"Эмаль ПФ-000 условная",0.9,2.8,20,50,50.00,60.00\n';
  const blob = new Blob([`\uFEFF${header}${sample}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "DP-pricelist-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function notifyPublicCatalogUpdated() {
  try {
    if (typeof window.dpReloadSiteProductsFromApi === "function") {
      await window.dpReloadSiteProductsFromApi();
    } else if (typeof window.dpApiUrl === "function") {
      const pr = await fetch(window.dpApiUrl("/api/site/products"));
      if (pr.ok) {
        const d = await pr.json();
        if (Array.isArray(d.products)) {
          window.PRODUCTS_DATA = d.products;
          if (typeof window.dpNormalizeCatalogProductsInPlace === "function") {
            window.dpNormalizeCatalogProductsInPlace(window.PRODUCTS_DATA);
          }
          apEnsureUnifiedCatalogArticleCodes();
          window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "admin" } }));
        }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem("dp_catalog_rev", String(Date.now()));
  } catch {
    /* ignore */
  }
}

async function saveApProductsCatalog() {
  const status = document.getElementById("ap-price-save-status");
  try {
    const issues = apCollectPriceRangeIssues();
    if (issues.length) {
      renderApPriceTable();
      const preview = issues
        .slice(0, 8)
        .map((it) => `${it.field}: id=${it.id || "?"}, значение=${it.value}`)
        .join("\n");
      const force = window.confirm(
        `Есть значения фасовок вне диапазонов (${issues.length}).\n\nПервые примеры:\n${preview}${
          issues.length > 8 ? `\n... и ещё ${issues.length - 8}` : ""
        }\n\nНажмите OK, чтобы сохранить каталог всё равно, или Отмена — чтобы исправить подсвеченные поля.`
      );
      if (!force) {
        setStatus(status, `Есть значения фасовок вне диапазонов (${issues.length}). Исправьте подсвеченные поля.`, "err");
        return;
      }
    }
    if (typeof window.dpNormalizeCatalogProductsInPlace === "function") {
      window.dpNormalizeCatalogProductsInPlace(window.PRODUCTS_DATA);
    }
    await apiAdmin("PUT", "/api/admin/products-catalog", { products: window.PRODUCTS_DATA });
    setStatus(
      status,
      "Сохранено. Главная и «Продукция» обновятся на открытых вкладках; при необходимости обновите страницу вручную.",
      "ok"
    );
    setApCatalogDirty(false);
    await notifyPublicCatalogUpdated();
    await renderApPriceServerBackups();
  } catch (e) {
    setStatus(status, e.message, "err");
  }
}

function apRangeFieldByWeight(vRaw) {
  const v = Number(vRaw);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 0.1 && v <= 2.7) return "jarSmallKg";
  if (v >= 2.8 && v <= 6) return "jarBigKg";
  if (v >= 7 && v <= 30) return "bucketKg";
  if (v >= 32 && v <= 50) return "drumKg";
  return null;
}

function apAutoFixPackRanges() {
  const status = document.getElementById("ap-price-save-status");
  const list = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  if (!list.length) {
    setStatus(status, "Каталог пуст: нечего автоисправлять.", null);
    return;
  }
  let changedProducts = 0;
  let movedValues = 0;
  let outOfRangeValues = 0;
  let duplicateRangeValues = 0;
  for (const p of list) {
    const fields = ["jarSmallKg", "jarBigKg", "bucketKg", "drumKg"];
    const values = fields
      .map((field) => ({ field, value: apPriceNum(p?.[field]) }))
      .filter((x) => Number.isFinite(x.value) && x.value > 0);
    const next = { jarSmallKg: null, jarBigKg: null, bucketKg: null, drumKg: null };
    const prev = {
      jarSmallKg: apPriceNum(p?.jarSmallKg),
      jarBigKg: apPriceNum(p?.jarBigKg),
      bucketKg: apPriceNum(p?.bucketKg),
      drumKg: apPriceNum(p?.drumKg),
    };
    let productChanged = false;
    for (const item of values) {
      const targetField = apRangeFieldByWeight(item.value);
      if (!targetField) {
        outOfRangeValues += 1;
        continue;
      }
      if (next[targetField] == null) {
        next[targetField] = item.value;
      } else {
        duplicateRangeValues += 1;
      }
      if (item.field !== targetField) {
        movedValues += 1;
        productChanged = true;
      }
    }
    for (const f of fields) {
      if (next[f] !== prev[f]) {
        productChanged = true;
      }
      p[f] = next[f];
    }
    if (productChanged) changedProducts += 1;
  }
  renderApPriceTable();
  setApCatalogDirty(true);
  const tail = [
    outOfRangeValues ? `вне диапазона: ${outOfRangeValues}` : "",
    duplicateRangeValues ? `дубликаты в одном диапазоне: ${duplicateRangeValues}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  setStatus(
    status,
    `Автоисправление завершено: позиций изменено ${changedProducts}, перемещено значений ${movedValues}.${tail ? ` ${tail}.` : ""} Проверьте и сохраните каталог на сервер.`,
    "ok"
  );
}

function getProducts() {
  return Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
}

function adminCardDisplayTitle(p) {
  const ov = draftOverrides[String(p.id)] || {};
  const t = typeof ov.cardTitle === "string" ? ov.cardTitle.trim() : "";
  return t || String(p.name || p.code || "Без названия");
}

function renderProductCard(p) {
  const id = String(p.id);
  const sel = id === String(selectedProductId) ? " is-selected" : "";
  const bulkPick = adminBulkSelectedIds.has(id) ? " is-bulk-picked" : "";
  const checked = adminBulkSelectedIds.has(id) ? " checked" : "";
  const ov = draftOverrides[id] || {};
  const pub = publishedOverrides[id] || {};
  const hasPublishedCustom = Boolean(pub.cardImageUrl || pub.heroImageUrl);
  const hasDraftCustom = Boolean(ov.cardImageUrl || ov.heroImageUrl);
  const hasStaging =
    (ENABLE_BULK_PHOTO_IN_CATALOG && bulkPreview?.ids?.includes(id)) ||
    previewBlobById.has(id) ||
    (pendingDeleteImage.has(id) && hasPublishedCustom);
  const hasCustom = hasStaging || (hasDraftCustom && !pendingDeleteImage.has(id));
  const imgUrl = adminPreviewUrl(p);
  const code =
    typeof window.dpFormatArticleUi === "function"
      ? window.dpFormatArticleUi(p.code ?? "")
      : p.code != null && String(p.code).trim() !== ""
        ? String(p.code)
        : "—";
  const draftVisual =
    hasStaging ||
    pendingDeleteImage.has(id) ||
    (typeof ov.cardTitle === "string" && ov.cardTitle.trim() !== (typeof pub.cardTitle === "string" ? pub.cardTitle.trim() : "")) ||
    imagePair(ov) !== imagePair(pub) ||
    JSON.stringify(ov.cardFeatures || []) !== JSON.stringify(pub.cardFeatures || []) ||
    (ov.subtitle || "") !== (pub.subtitle || "") ||
    (ov.description || "") !== (pub.description || "");
  const flag = draftVisual
    ? `<span class="ap-product-card-flag ap-product-card-flag--draft" title="Изменения только в черновике">Черновик</span>`
    : hasPublishedCustom
      ? `<span class="ap-product-card-flag" title="На сайте своё фото">Сайт</span>`
      : "";
  const lineTitle = adminCardDisplayTitle(p);
  const siteHref = `product.html?id=${encodeURIComponent(id)}`;
  return `
    <div class="ap-product-card${sel}${bulkPick}" role="button" tabindex="0" data-id="${escapeHtml(id)}" aria-label="Редактировать: ${escapeHtml(lineTitle)}">
      <div class="ap-product-card-media">
        <label class="ap-product-card-pick" title="В массовые операции">
          <input type="checkbox" class="ap-product-card-checkbox" data-ap-bulk-pick="${escapeHtml(id)}"${checked} aria-label="Отметить для массовых операций" />
        </label>
        <img src="${escapeHtml(imgUrl)}" alt="" loading="lazy" decoding="async" />
        ${flag}
      </div>
      <div class="ap-product-card-body">
        <span class="ap-product-card-code">${escapeHtml(code)}</span>
        <span class="ap-product-card-name">${escapeHtml(lineTitle)}</span>
        ${hasCustom ? `<span class="ap-product-card-tag">Превью / своё</span>` : `<span class="ap-product-card-tag ap-product-card-tag--muted">Авто</span>`}
        <a href="${escapeHtml(siteHref)}" class="ap-product-card-site" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">На сайте →</a>
        <div class="ap-product-card-actions" onclick="event.stopPropagation();">
          <label class="ap-btn ap-btn-ghost ap-btn-sm ap-card-photo-label">
            Фото…
            <input type="file" class="ap-card-photo-input" accept="image/jpeg,image/png,image/webp" data-ap-card-photo="${escapeHtml(id)}" aria-label="Заменить фото" />
          </label>
          <button type="button" class="ap-btn ap-btn-ghost ap-btn-sm ap-card-clear-photo" data-ap-card-clear="${escapeHtml(id)}">Сбросить фото</button>
        </div>
      </div>
    </div>`;
}

function getBulkCodeRaw() {
  return String(document.getElementById("ap-bulk-code")?.value || "").trim();
}

function getBulkMatchMode() {
  return document.getElementById("ap-bulk-match")?.value === "contains" ? "contains" : "exact";
}

function productMatchesBulkCode(p, raw, mode) {
  if (!raw) return false;
  const c = String(p.code || "").trim();
  if (!c) return false;
  const r = raw.toLowerCase();
  if (mode === "contains") return c.toLowerCase().includes(r);
  return c.toLowerCase() === r;
}

function getBulkMatchedProducts() {
  const raw = getBulkCodeRaw();
  const mode = getBulkMatchMode();
  if (!raw) return [];
  return getProducts().filter((p) => productMatchesBulkCode(p, raw, mode));
}

function setBulkPanelStatus(text, kind) {
  setStatus(document.getElementById("ap-bulk-status"), text, kind);
}

function updateBulkSelectionUi() {
  const el = document.getElementById("ap-bulk-selection-count");
  if (!el) return;
  const n = adminBulkSelectedIds.size;
  el.textContent = n
    ? `Отмечено: ${n}. «В черновик» — превью в этой панели; на сайт — кнопка «Сохранить на сайт».`
    : "";
}

function getVisibleCatalogProductIds() {
  return apCatalogFilteredProducts().map((p) => String(p.id));
}

function renderProductCatalog() {
  const root = document.getElementById("ap-product-catalog");
  if (!root) return;
  const filtered = apCatalogFilteredProducts();
  const countEl = document.getElementById("ap-catalog-filter-count");
  if (countEl) {
    countEl.textContent = filtered.length
      ? `Показано позиций: ${filtered.length}.`
      : "Нет позиций по текущим фильтрам.";
  }
  const cards = filtered.map((p) => renderProductCard(p)).join("");
  root.innerHTML = cards.length
    ? `<div class="ap-product-grid">${cards}</div>`
    : `<p class="ap-muted">Ничего не найдено — измените фильтры или поиск.</p>`;
  updateBulkSelectionUi();
  updateDraftToolbar();
}

function setProductEditorMode(hasSelection) {
  const empty = document.getElementById("ap-product-editor-empty");
  const form = document.getElementById("ap-product-editor");
  const toolbar = document.getElementById("ap-page-editor-toolbar");
  const packPanel = document.getElementById("ap-picker-pack-panel");
  const bulkPackPanel = document.getElementById("ap-bulk-pack-panel");
  if (empty) empty.classList.toggle("ap-panel-hidden", Boolean(hasSelection));
  if (form) form.classList.toggle("ap-panel-hidden", !hasSelection);
  if (toolbar) toolbar.classList.toggle("ap-panel-hidden", !hasSelection);
  if (packPanel) packPanel.classList.toggle("ap-panel-hidden", !hasSelection);
  if (bulkPackPanel) bulkPackPanel.classList.toggle("ap-panel-hidden", Boolean(hasSelection));
}

function savePackOptionsDraftOnly() {
  const pickerStatusEl = document.getElementById("ap-product-save-picker-status");
  const statusEl = document.getElementById("ap-product-status");
  if (!selectedProductId) {
    setStatus(pickerStatusEl, "Выберите позицию в поле «Позиция».", "err");
    return;
  }
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (!p) return;
  ensureDraftEntry(selectedProductId);
  const detailPayload = collectDetailPayloadFromDom();
  const pruned = pruneDetailEqualToTemplate(p, detailPayload);
  if (Object.prototype.hasOwnProperty.call(pruned, "detailPackOptions")) {
    draftOverrides[selectedProductId].detailPackOptions = pruned.detailPackOptions;
  } else {
    delete draftOverrides[selectedProductId].detailPackOptions;
  }
  setStatus(pickerStatusEl, "Фасовки записаны в черновик. Для посетителей сайта — «Опубликовать на сайте» ниже или «Сохранить на сайт» вверху.", "ok");
  setStatus(statusEl, "Фасовки записаны в черновик.", "ok");
  const p2 = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p2) apPackOptionsUpdateHint(p2);
  if (p2) apPopulatePhotoPackSelect(p2);
  renderProductCatalog();
  updateDraftToolbar();
}

function setAdminProductPreview(imageUrl) {
  const preview = document.getElementById("ap-product-preview");
  const frame = document.getElementById("ap-product-preview-frame");
  if (!preview) return;
  const prevSrc = preview.getAttribute("src");
  if (prevSrc && prevSrc.startsWith("blob:")) URL.revokeObjectURL(prevSrc);
  if (imageUrl) {
    const s = String(imageUrl);
    let src;
    if (/^blob:|^data:|^https?:/i.test(s)) {
      src = s;
    } else {
      src = adminProductOverrideImageSrc(s) || mediaAbs(s);
    }
    preview.src = src;
    preview.classList.remove("ap-panel-hidden");
    frame?.classList.remove("ap-panel-hidden");
  } else {
    preview.removeAttribute("src");
    preview.classList.add("ap-panel-hidden");
    frame?.classList.add("ap-panel-hidden");
  }
}

function previewPackStagingKey(productId, packKey) {
  return `${String(productId)}\x1e${String(packKey)}`;
}

function formatCatalogPackKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function resolveCatalogPackKey(rawKey) {
  const raw = String(rawKey || "").trim();
  if (!raw) return "";
  if (/^[\w.:_-]{1,48}$/.test(raw)) return raw;
  const sel = document.getElementById("ap-product-photo-pack-target");
  const selectedOptionText = String(sel?.selectedOptions?.[0]?.textContent || "").toLowerCase();
  const inferKindFromLabel = () => {
    if (/ведр|bucket/i.test(selectedOptionText)) return "bucket";
    if (/барабан|drum/i.test(selectedOptionText)) return "drum";
    return "jar";
  };
  const optionValues = sel
    ? [...sel.options]
        .map((o) => String(o.value || "").trim())
        .filter(Boolean)
    : [];
  const matchKg = raw.toLowerCase().replace(/\s+/g, "").match(/(\d+(?:[.,]\d+)?)(?:кг|kg)?$/);
  if (matchKg) {
    const kgNum = formatCatalogPackKg(matchKg[1].replace(",", "."));
    if (kgNum) {
      const suffix = `:${kgNum}`;
      const matched = optionValues.filter((v) => v.endsWith(suffix));
      if (matched.length === 1) return matched[0];
      const inferredKind = inferKindFromLabel();
      const byKind = matched.find((v) => v.startsWith(`${inferredKind}:`));
      if (byKind) return byKind;
      return `${inferredKind}:${kgNum}`;
    }
  }
  return raw.replace(/[^\w.:_-]/g, "").slice(0, 48);
}

function hasStagedImageEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.file) return true;
  if (typeof entry.dataUrl === "string" && /^data:image\//i.test(entry.dataUrl)) return true;
  if (typeof entry.url === "string" && /^blob:/i.test(entry.url)) return true;
  return false;
}

/**
 * Файл чаще выбирают до смены селекта «Общее / тара»: тогда staging лежит в previewBlobById,
 * а нужный ключ для API — previewPackStagingKey(..., jar:…). Перекладываем blob при смене тары или после гидрации.
 */
function reconcileStagedProductPhotoWithPackTarget(productId) {
  const id = String(productId || "");
  if (!id) return false;
  const sel = document.getElementById("ap-product-photo-pack-target");
  const pkRaw = String(sel?.value || "").trim();
  const pk = resolveCatalogPackKey(pkRaw);
  if (pk && pk !== pkRaw && sel && [...sel.options].some((o) => o.value === pk)) {
    sel.value = pk;
  }
  const pref = `${id}\x1e`;
  const packKeys = [...previewPackBlobById.keys()].filter((k) => String(k).startsWith(pref));
  const gen = previewBlobById.get(id);

  if (pk) {
    const dest = previewPackStagingKey(id, pk);
    const atDest = previewPackBlobById.get(dest);

    if (hasStagedImageEntry(gen) && !hasStagedImageEntry(atDest)) {
      previewPackBlobById.set(dest, gen);
      previewBlobById.delete(id);
      pendingDeleteImage.delete(id);
      return true;
    }
    if (packKeys.length === 1 && packKeys[0] !== dest) {
      const ent = previewPackBlobById.get(packKeys[0]);
      const occupied = previewPackBlobById.get(dest);
      if (!hasStagedImageEntry(ent)) return false;
      if (occupied && occupied !== ent) {
        try {
          URL.revokeObjectURL(occupied.url);
        } catch {
          /* ignore */
        }
      }
      previewPackBlobById.delete(packKeys[0]);
      previewPackBlobById.set(dest, ent);
      return true;
    }
    return false;
  }

  /**
   * Селект «Общее» после перестройки опций (без ключа активного черновика) —
   * не переводить pack-фото в «общее» (иначе POST уйдёт без catalogPackKey, фасовка на сайте пустая).
   * Восстанавливаем выбранную фасовку и опцию в списке.
   */
  if (!pk && packKeys.length === 1 && !hasStagedImageEntry(gen)) {
    const ent = previewPackBlobById.get(packKeys[0]);
    if (!hasStagedImageEntry(ent)) return false;
    const sel = document.getElementById("ap-product-photo-pack-target");
    const keyPart = String(packKeys[0]).slice(pref.length);
    if (!keyPart || !sel) return false;
    if (![...sel.options].some((o) => o.value === keyPart)) {
      const o = document.createElement("option");
      o.value = keyPart;
      o.textContent = `Фасовка ${keyPart} (черновик)`;
      sel.appendChild(o);
    }
    sel.value = keyPart;
    pendingDeleteImage.delete(id);
    return true;
  }
  return false;
}

function apPopulatePhotoPackSelect(product) {
  const sel = document.getElementById("ap-product-photo-pack-target");
  if (!sel || !product) return;
  const prevRaw = sel.value;
  const prev = resolveCatalogPackKey(prevRaw);
  sel.innerHTML = `<option value="">Общее (по умолчанию для всех фасовок)</option>`;
  const ov = draftOverrides[String(product.id)] || {};
  let rows = [];
  if (typeof window.dpApplyDetailPackChips === "function") {
    rows = window.dpApplyDetailPackChips(product, { detailPackOptions: apMergedPackOptionRows(product, ov) });
  }
  for (const chip of rows) {
    const key =
      typeof window.dpCatalogPackImageKey === "function" ? window.dpCatalogPackImageKey(chip) : "";
    if (!key) continue;
    const lbl = `${chip.label || "?"}`.trim();
    const sub = `${chip.sub || ""}`.trim();
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = sub ? `${lbl} (${sub})` : lbl;
    sel.appendChild(opt);
  }
  const sid = String(product.id);
  const stagingPref = `${sid}\x1e`;
  for (const stagingKeyFull of previewPackBlobById.keys()) {
    if (!String(stagingKeyFull).startsWith(stagingPref)) continue;
    const keyRest = String(stagingKeyFull).slice(stagingPref.length);
    if (!keyRest || [...sel.options].some((o) => o.value === keyRest)) continue;
    const o = document.createElement("option");
    o.value = keyRest;
    o.textContent = `Фасовка ${keyRest} (черновик фото)`;
    sel.appendChild(o);
  }
  if (prev && ![...sel.options].some((o) => o.value === prev)) {
    const o = document.createElement("option");
    o.value = prev;
    o.textContent = `Фасовка ${prev} (ещё есть в черновике)`;
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function apRefreshProductPhotoPreview(p, productId) {
  const sid = String(productId);
  const ov = draftOverrides[sid] || {};
  const pt = resolveCatalogPackKey(document.getElementById("ap-product-photo-pack-target")?.value?.trim() || "");
  if (pt) {
    const stk = previewPackStagingKey(sid, pt);
    const st = previewPackBlobById.get(stk);
    if (st && st.url) {
      setAdminProductPreview(st.url);
      return;
    }
    const map = ov.catalogPackImages && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
    const pu = typeof map[pt] === "string" ? map[pt].trim() : "";
    if (pu) {
      setAdminProductPreview(pu);
      return;
    }
    setAdminProductPreview(null);
    return;
  }
  if (previewBlobById.has(sid)) {
    setAdminProductPreview(previewBlobById.get(sid).url);
    return;
  }
  if (pendingDeleteImage.has(sid)) {
    setAdminProductPreview(null);
    return;
  }
  const imgUrl = ov.cardImageUrl || ov.heroImageUrl;
  if (imgUrl) setAdminProductPreview(imgUrl);
  else setAdminProductPreview(null);
}

/**
 * Заполняет поля редактора из draftOverrides (то же, что при выборе позиции в каталоге).
 * Нужно при повторном входе во вкладку: иначе видны старые значения в полях при актуальном черновике.
 */
function apHydrateProductCardTabFromDraft(id) {
  const sid = String(id);
  const p = getProducts().find((x) => String(x.id) === sid);
  const title = document.getElementById("ap-product-editor-title");
  const cardTitleEl = document.getElementById("ap-product-card-title");
  const features = document.getElementById("ap-product-features");
  const subtitle = document.getElementById("ap-product-subtitle");
  const description = document.getElementById("ap-product-description");
  const statusEl = document.getElementById("ap-product-status");
  const pickerStatusEl = document.getElementById("ap-product-save-picker-status");
  const fileInput = document.getElementById("ap-product-file");
  ensureDraftEntry(sid);
  const ov = draftOverrides[sid] || {};
  if (title) {
    if (!p) title.textContent = sid;
    else {
      const formatted =
        typeof window.dpFormatArticleUi === "function"
          ? window.dpFormatArticleUi(p.code ?? "")
          : String(p.code ?? "").trim() || "—";
      const nm = String(p.name || "").trim();
      const showCode = formatted && formatted !== "—";
      title.textContent =
        showCode && nm ? `${formatted} — ${nm}` : showCode ? formatted : nm || sid;
    }
  }
  if (cardTitleEl) cardTitleEl.value = typeof ov.cardTitle === "string" ? ov.cardTitle : "";
  if (features) features.value = Array.isArray(ov.cardFeatures) ? ov.cardFeatures.join("\n") : "";
  if (subtitle) subtitle.value = ov.subtitle || "";
  if (description) description.value = ov.description || "";
  setStatus(statusEl, "", null);
  setStatus(pickerStatusEl, "", null);
  if (fileInput) fileInput.value = "";
  if (p) {
    fillProductDetailForm(p, ov);
    apPackOptionsRender(p, ov);
    apPopulatePhotoPackSelect(p);
  } else {
    apPackOptionsRender(null);
    const psel = document.getElementById("ap-product-photo-pack-target");
    if (psel) psel.innerHTML = `<option value="">Общее (по умолчанию для всех фасовок)</option>`;
  }
  setStatus(document.getElementById("ap-product-photo-status"), "", null);
  apRefreshProductPhotoPreview(p, sid);
}

function selectProduct(id) {
  const editor = document.getElementById("ap-product-editor");
  const pickerStatusEl = document.getElementById("ap-product-save-picker-status");
  if (!editor) return;
  if (!id) {
    selectedProductId = null;
    setProductEditorMode(false);
    const csel = document.getElementById("ap-card-product-select");
    if (csel) csel.value = "";
    setStatus(pickerStatusEl, "", null);
    apPackOptionsRender(null);
    apBulkPackPanelSeedIfEmpty();
    apBulkPackOptionsUpdateHint();
    renderProductCatalog();
    return;
  }
  selectedProductId = id;
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  if (h !== "catalog" && h !== "products") {
    location.hash = "catalog";
  }
  setProductEditorMode(true);
  apHydrateProductCardTabFromDraft(id);
  const csel = document.getElementById("ap-card-product-select");
  if (csel) csel.value = String(id);
  renderProductCatalog();
}

function buildCardTextPayloadForSelectedProduct() {
  const featuresRaw = document.getElementById("ap-product-features")?.value || "";
  const cardFeatures = featuresRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const detailRaw = collectDetailPayloadFromDom();
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  const detailPruned = p ? pruneDetailEqualToTemplate(p, detailRaw) : detailRaw;
  return {
    cardTitle: document.getElementById("ap-product-card-title")?.value?.trim() || "",
    cardFeatures,
    subtitle: document.getElementById("ap-product-subtitle")?.value?.trim() || "",
    description: document.getElementById("ap-product-description")?.value?.trim() || "",
    ...detailPruned,
  };
}

function saveProductTextToDraft() {
  const statusEl = document.getElementById("ap-product-status");
  if (!selectedProductId) return;
  ensureDraftEntry(selectedProductId);
  draftOverrides[selectedProductId] = {
    ...draftOverrides[selectedProductId],
    ...buildCardTextPayloadForSelectedProduct(),
  };
  const pickerStatusEl = document.getElementById("ap-product-save-picker-status");
  setStatus(statusEl, "Текст сохранён в черновике.", "ok");
  setStatus(pickerStatusEl, "Текст сохранён в черновике.", "ok");
  const p2 = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p2) apPackOptionsUpdateHint(p2);
  renderProductCatalog();
  updateDraftToolbar();
}

function resetSelectedProductDetailToTemplate() {
  const statusEl = document.getElementById("ap-product-status");
  if (!selectedProductId) return;
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (!p) return;
  ensureDraftEntry(selectedProductId);
  const id = selectedProductId;
  for (const k of AP_DETAIL_KEYS) {
    delete draftOverrides[id][k];
  }
  fillProductDetailForm(p, draftOverrides[id]);
  apPackOptionsRender(p, draftOverrides[id]);
  setStatus(statusEl, "Расширенные блоки сброшены к шаблону (в черновике).", "ok");
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * Цели для массового копирования блоков страницы товара (detail*-поля из формы вкладки «Страница товара»).
 * Приоритет: 1) чекбоксы; 2) артикул в поле поиска серии; 3) видимые в сетке при сужении фильтров каталога; 4) все карточки каталога.
 */
function resolveBulkDetailTextTargetIds() {
  const validIds = new Set(getProducts().map((pr) => String(pr.id)));
  const picked = [...adminBulkSelectedIds].filter((pid) => validIds.has(pid));
  if (picked.length) {
    return { ids: picked, mode: "picked" };
  }
  const codeRaw = getBulkCodeRaw();
  if (codeRaw) {
    const list = getBulkMatchedProducts();
    const ids = [...new Set(list.map((pr) => String(pr.id)).filter((id) => validIds.has(id)))];
    return { ids, mode: "code" };
  }
  if (apCatalogFiltersNarrowed()) {
    const ids = getVisibleCatalogProductIds().filter((pid) => validIds.has(pid));
    return { ids, mode: "group" };
  }
  const allIds = getProducts()
    .map((pr) => String(pr.id))
    .filter((id) => validIds.has(id));
  return allIds.length ? { ids: allIds, mode: "all" } : { ids: [], mode: "none" };
}

function stageBulkDetailTextCopy() {
  const payload = collectDetailPayloadFromDom();
  const { ids, mode } = resolveBulkDetailTextTargetIds();
  if (!ids.length) {
    if (getBulkCodeRaw() && mode === "code") {
      setBulkPanelStatus("Нет позиций по указанному артикулу (проверьте режим «Точно» / «Содержит»).", "err");
    } else if (mode === "group") {
      setBulkPanelStatus("По текущим фильтрам каталога нет позиций — ослабьте фильтры или поиск.", "err");
    } else {
      setBulkPanelStatus(
        "Нет целей: отметьте чекбоксами, либо укажите артикул или серию, либо сузьте фильтры слева (тип, назначение, артикул, позиция, поиск) — тогда подставятся все видимые карточки.",
        "err"
      );
    }
    return;
  }
  if (ids.length > 500) {
    setBulkPanelStatus("Не более 500 позиций за раз.", "err");
    return;
  }
  for (const pid of ids) {
    ensureDraftEntry(pid);
    const p = getProducts().find((x) => String(x.id) === String(pid));
    const pruned = p ? pruneDetailEqualToTemplate(p, { ...payload }) : { ...payload };
    draftOverrides[pid] = { ...draftOverrides[pid], ...pruned };
  }
  const modeRu =
    mode === "picked"
      ? "по чекбоксам"
      : mode === "code"
        ? "по артикулу серии"
        : mode === "group"
          ? "по фильтрам каталога"
          : "по всем карточкам";
  setBulkPanelStatus(
    `Поля страницы товара (характеристика, применение, списки, советы, файлы) в черновик: ${ids.length} поз. (${modeRu}).`,
    "ok"
  );
  renderProductCatalog();
  updateDraftToolbar();
}

/** Снимок строк таблицы фасовки — как после «Применить в черновик». */
function apSnapshotPackRowsForDraft(rows) {
  return rows.map((r) => ({
    kind: r.kind || "jar",
    jarKg: r.jarKg,
    label: String(r.label || "").trim(),
    sub: String(r.sub || "").trim(),
    hidden: Boolean(r.hidden),
  }));
}

function apFilterSnapshotToProductBaseRows(product, snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) return [];
  if (!product || typeof window.dpDefaultPackOptionRows !== "function" || typeof window.dpPackOptionRowStableKey !== "function") {
    return snapshot;
  }
  const baseRowsRaw = window.dpDefaultPackOptionRows(product);
  const baseRows =
    typeof window.dpNormalizePackOptionRows === "function"
      ? window.dpNormalizePackOptionRows(baseRowsRaw)
      : Array.isArray(baseRowsRaw)
      ? baseRowsRaw
      : [];
  if (!baseRows.length) return [];
  const allowed = new Set();
  for (const row of baseRows) {
    const key = window.dpPackOptionRowStableKey(row);
    if (key) allowed.add(key);
  }
  return snapshot.filter((row) => {
    const key = window.dpPackOptionRowStableKey(row);
    return Boolean(key && allowed.has(key));
  });
}

function apClearPackValidationUi() {
  ["ap-bulk-pack-options-body", "ap-pack-options-body"].forEach((id) => {
    const body = document.getElementById(id);
    if (!body) return;
    body.querySelectorAll(".ap-pack-row-invalid").forEach((el) => el.classList.remove("ap-pack-row-invalid"));
    body.querySelectorAll(".ap-pack-field-invalid").forEach((el) => el.classList.remove("ap-pack-field-invalid"));
  });
}

/**
 * Валидация таблицы фасовок перед массовым применением:
 * у каждой строки должен собираться стабильный ключ (тип + масса).
 */
function apValidatePackRowsForApply(rows, bodyId) {
  apClearPackValidationUi();
  if (!Array.isArray(rows) || !rows.length) return null;
  const body = document.getElementById(bodyId);
  const domRows = body ? apPackTableDataRows(body) : [];
  const validKinds = new Set(["jar", "bucket", "drum"]);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const tr = domRows[i] || null;
    const kindEl = tr?.querySelector?.(".ap-pack-kind");
    const jarEl = tr?.querySelector?.(".ap-pack-jar");
    const kind = String(row.kind || "").toLowerCase();
    if (!validKinds.has(kind)) {
      tr?.classList?.add("ap-pack-row-invalid");
      if (kindEl instanceof HTMLElement) kindEl.classList.add("ap-pack-field-invalid");
      return `Строка ${i + 1}: выберите корректный тип фасовки (Банка/Ведро/Барабан).`;
    }
    if (typeof window.dpPackOptionRowStableKey === "function") {
      const key = window.dpPackOptionRowStableKey(row);
      if (!key) {
        tr?.classList?.add("ap-pack-row-invalid");
        if (jarEl instanceof HTMLElement) jarEl.classList.add("ap-pack-field-invalid");
        return `Строка ${i + 1}: укажите массу фасовки больше 0.`;
      }
    } else {
      const jarKg = Number(row.jarKg);
      if (!Number.isFinite(jarKg) || jarKg <= 0) {
        tr?.classList?.add("ap-pack-row-invalid");
        if (jarEl instanceof HTMLElement) jarEl.classList.add("ap-pack-field-invalid");
        return `Строка ${i + 1}: укажите массу фасовки больше 0.`;
      }
    }
  }
  return null;
}

/**
 * Перенести строки массовой таблицы из DOM в draftOverrides целей (только когда карточка позиции не открыта).
 * Вызывать только после того, как пользователь подтвердил «Сохранить на сайт» — до подтверждения черновик не менять.
 * Если целей массовых операций нет, берётся референсная позиция панели фасовок.
 */
function apMergeBulkPackDomIntoDraftBeforePublish() {
  if (selectedProductId) return;
  const rows = collectPackOptionsFromDom("ap-bulk-pack-options-body");
  if (!rows.length) return;
  const snapshot = apSnapshotPackRowsForDraft(rows);
  let ids = resolveBulkDetailTextTargetIds().ids;
  if (!ids.length) {
    const ref = apBulkPackResolveRefForMassPanel();
    if (ref) ids = [ref.refId];
  }
  if (!ids.length) return;
  for (const pid of ids) {
    const product = getProducts().find((x) => String(x.id) === String(pid));
    const scoped = apFilterSnapshotToProductBaseRows(product, snapshot);
    ensureDraftEntry(pid);
    draftOverrides[pid].detailPackOptions = scoped.map((x) => ({ ...x }));
  }
}

/**
 * Копирует строки «Фасовки в корзину» из текущей формы редактора в черновик для целей
 * resolveBulkDetailTextTargetIds() — как массовое фото и «Остальные поля карточки».
 */
function stageBulkPackOptionsApply() {
  const rows = collectPackStagingRowsForBulk();
  if (!rows.length) {
    setBulkPanelStatus(
      "В таблице массовых фасовок нет строк — добавьте строки в блоке «Фасовки для сайта и каталога (массово)» или задайте их у выбранной позиции.",
      "err"
    );
    return;
  }
  const validationBodyId = selectedProductId ? "ap-pack-options-body" : "ap-bulk-pack-options-body";
  const validationError = apValidatePackRowsForApply(rows, validationBodyId);
  if (validationError) {
    setBulkPanelStatus(validationError, "err");
    return;
  }
  const snapshot = apSnapshotPackRowsForDraft(rows);
  const { ids, mode } = resolveBulkDetailTextTargetIds();
  if (!ids.length) {
    if (getBulkCodeRaw() && mode === "code") {
      setBulkPanelStatus("Нет позиций по указанному артикулу (проверьте режим «Точно» / «Содержит»).", "err");
    } else if (mode === "group") {
      setBulkPanelStatus("По текущим фильтрам каталога нет позиций — ослабьте фильтры или поиск.", "err");
    } else {
      setBulkPanelStatus(
        "Нет целей: отметьте чекбоксами, либо укажите артикул или серию, либо сузьте фильтры слева — иначе подставятся все видимые карточки.",
        "err"
      );
    }
    return;
  }
  if (ids.length > 500) {
    setBulkPanelStatus("Не более 500 позиций за раз.", "err");
    return;
  }
  if (mode === "all" && ids.length > 1) {
    if (!window.confirm(`Подставить эту таблицу фасовок всем ${ids.length} позициям каталога (черновик)?`)) {
      return;
    }
  }
  let removedOutsideBase = 0;
  for (const pid of ids) {
    const product = getProducts().find((x) => String(x.id) === String(pid));
    const scoped = apFilterSnapshotToProductBaseRows(product, snapshot);
    removedOutsideBase += Math.max(0, snapshot.length - scoped.length);
    ensureDraftEntry(pid);
    draftOverrides[pid].detailPackOptions = scoped.map((x) => ({ ...x }));
  }
  const modeRu =
    mode === "picked"
      ? "по чекбоксам"
      : mode === "code"
        ? "по артикулу серии"
        : mode === "group"
          ? "по фильтрам каталога"
          : "по всем карточкам";
  setBulkPanelStatus(
    `Фасовки в корзину в черновик: ${ids.length} поз. (${modeRu}).${
      removedOutsideBase ? ` Удалено вне базового набора: ${removedOutsideBase}.` : ""
    }`,
    "ok"
  );
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * Быстрая локальная проверка фасовок до публикации:
 * показывает, какие чипы реально попадут на сайт для текущего контекста.
 */
function previewPackOptionsBeforePublish() {
  const rows = collectPackStagingRowsForBulk();
  if (!rows.length) {
    setBulkPanelStatus("Таблица фасовок пуста — добавьте хотя бы одну строку.", "err");
    return;
  }
  const validationBodyId = selectedProductId ? "ap-pack-options-body" : "ap-bulk-pack-options-body";
  const validationError = apValidatePackRowsForApply(rows, validationBodyId);
  if (validationError) {
    setBulkPanelStatus(validationError, "err");
    return;
  }
  const product = selectedProductId
    ? getProducts().find((x) => String(x.id) === String(selectedProductId))
    : apBulkPackResolveRefForMassPanel()?.product || null;
  if (!product || typeof window.dpApplyDetailPackChips !== "function") {
    setBulkPanelStatus("Не удалось построить превью фасовок (нет опорной позиции).", "err");
    return;
  }
  const chips = window.dpApplyDetailPackChips(product, { detailPackOptions: rows });
  const hiddenRows = rows.filter((r) => r && r.hidden === true).length;
  let noPriceRows = 0;
  if (typeof window.dpResolvePackOptionRow === "function") {
    for (const row of rows) {
      if (!row || row.hidden === true) continue;
      const resolved = window.dpResolvePackOptionRow(product, row);
      if (!resolved || resolved.disabled) noPriceRows += 1;
    }
  }
  const metaParts = [];
  if (hiddenRows > 0) metaParts.push(`скрыто: ${hiddenRows}`);
  if (noPriceRows > 0) metaParts.push(`без цены: ${noPriceRows}`);
  const metaText = metaParts.length ? ` (${metaParts.join(", ")})` : "";
  if (!chips.length) {
    setBulkPanelStatus(`Превью: после фильтрации нет видимых фасовок${metaText}.`, "ok");
    return;
  }
  const labels = chips
    .slice(0, 6)
    .map((c) => String(c.label || "").trim())
    .filter(Boolean);
  const tail = chips.length > labels.length ? ` + ещё ${chips.length - labels.length}` : "";
  const labelPart = labels.length ? ` ${labels.join(",")}${tail}.` : "";
  setBulkPanelStatus(`Превью: на сайте будет ${chips.length} фасовок${metaText}.${labelPart}`, "ok");
}

/** Удаляет detailPackOptions из черновика для выбранных целей (на сайте — расчёт фасовок из прайса). */
function stageBulkPackOptionsReset() {
  const { ids, mode } = resolveBulkDetailTextTargetIds();
  if (!ids.length) {
    if (getBulkCodeRaw() && mode === "code") {
      setBulkPanelStatus("Нет позиций по указанному артикулу (проверьте режим «Точно» / «Содержит»).", "err");
    } else if (mode === "group") {
      setBulkPanelStatus("По текущим фильтрам каталога нет позиций — ослабьте фильтры или поиск.", "err");
    } else {
      setBulkPanelStatus(
        "Нет целей: отметьте чекбоксами, либо укажите артикул или серию, либо сузьте фильтры слева — иначе подставятся все видимые карточки.",
        "err"
      );
    }
    return;
  }
  if (ids.length > 500) {
    setBulkPanelStatus("Не более 500 позиций за раз.", "err");
    return;
  }
  if (
    !window.confirm(
      `Сбросить сохранённые фасовки в черновике для ${ids.length} поз.? На сайте снова будут стандартные фасовки из прайса (до «Сохранить на сайт» только черновик).`
    )
  ) {
    return;
  }
  for (const pid of ids) {
    ensureDraftEntry(pid);
    delete draftOverrides[pid].detailPackOptions;
  }
  const modeRu =
    mode === "picked"
      ? "по чекбоксам"
      : mode === "code"
        ? "по артикулу серии"
        : mode === "group"
          ? "по фильтрам каталога"
          : "по всем карточкам";
  setBulkPanelStatus(`Фасовки сброшены в черновике: ${ids.length} поз. (${modeRu}).`, "ok");
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * Массово задаёт `cardTitle` в черновике (заголовок в сетке каталога на сайте).
 * Цели: как у фото и «Поля карточки массово» — resolveBulkDetailTextTargetIds().
 * @param {string} rawTitle пустая строка — сброс своего заголовка (имя из прайса)
 */
function stageBulkCardTitleFromString(rawTitle) {
  let title = String(rawTitle ?? "").trim().slice(0, 320);
  const { ids, mode } = resolveBulkDetailTextTargetIds();
  if (!ids.length) {
    if (getBulkCodeRaw() && mode === "code") {
      setBulkPanelStatus("Нет позиций по указанному артикулу (проверьте режим «Точно» / «Содержит»).", "err");
    } else if (mode === "group") {
      setBulkPanelStatus("По текущим фильтрам каталога нет позиций — ослабьте фильтры или поиск.", "err");
    } else {
      setBulkPanelStatus(
        "Нет целей: отметьте чекбоксами, либо укажите артикул или серию, либо сузьте фильтры — иначе подставятся все позиции каталога.",
        "err"
      );
    }
    return;
  }
  if (ids.length > 500) {
    setBulkPanelStatus("Не более 500 позиций за раз.", "err");
    return;
  }
  if (!title) {
    if (
      !window.confirm(
        `Очистить свой заголовок карточки в черновике для ${ids.length} поз.? На сайте снова будет название из прайса (до «Сохранить на сайт» только в черновике).`
      )
    ) {
      return;
    }
  } else if (mode === "all" && ids.length > 1) {
    if (!window.confirm(`Подставить заголовок «${title.slice(0, 80)}${title.length > 80 ? "…" : ""}» всем ${ids.length} позициям каталога (черновик)?`)) {
      return;
    }
  }
  for (const pid of ids) {
    ensureDraftEntry(pid);
    if (title) draftOverrides[pid].cardTitle = title;
    else delete draftOverrides[pid].cardTitle;
  }
  const modeRu =
    mode === "picked"
      ? "по чекбоксам"
      : mode === "code"
        ? "по артикулу серии"
        : mode === "group"
          ? "по фильтрам каталога"
          : "по всем карточкам";
  const statusText = title
    ? `Заголовок карточки в черновике: ${ids.length} поз. (${modeRu}).`
    : `Сброс заголовка карточки в черновике: ${ids.length} поз. (${modeRu}).`;
  setBulkPanelStatus(statusText, "ok");
  const pc = document.getElementById("ap-view-products");
  const edStatus = document.getElementById("ap-product-status");
  if (pc && !pc.classList.contains("ap-panel-hidden") && edStatus) {
    setStatus(edStatus, statusText, "ok");
  }
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * Массово задаёт `cardFeatures` в черновике (буллеты карточки в каталоге).
 * Пустой список = сброс своих пунктов (вернутся дефолтные по family на сайте).
 * @param {string} rawFeatures
 */
function stageBulkCardFeaturesFromString(rawFeatures) {
  const features = String(rawFeatures ?? "")
    .split(/\r?\n/)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const { ids, mode } = resolveBulkDetailTextTargetIds();
  if (!ids.length) {
    if (getBulkCodeRaw() && mode === "code") {
      setBulkPanelStatus("Нет позиций по указанному артикулу (проверьте режим «Точно» / «Содержит»).", "err");
    } else if (mode === "group") {
      setBulkPanelStatus("По текущим фильтрам каталога нет позиций — ослабьте фильтры или поиск.", "err");
    } else {
      setBulkPanelStatus(
        "Нет целей: отметьте чекбоксами, либо укажите артикул или серию, либо сузьте фильтры — иначе подставятся все позиции каталога.",
        "err"
      );
    }
    return;
  }
  if (ids.length > 500) {
    setBulkPanelStatus("Не более 500 позиций за раз.", "err");
    return;
  }
  if (!features.length) {
    if (!window.confirm(`Очистить свои пункты карточки в черновике для ${ids.length} поз.?`)) return;
  } else if (mode === "all" && ids.length > 1) {
    if (!window.confirm(`Подставить ${features.length} пунктов карточки всем ${ids.length} позициям каталога (черновик)?`)) return;
  }
  for (const pid of ids) {
    ensureDraftEntry(pid);
    if (features.length) draftOverrides[pid].cardFeatures = [...features];
    else delete draftOverrides[pid].cardFeatures;
  }
  const modeRu =
    mode === "picked"
      ? "по чекбоксам"
      : mode === "code"
        ? "по артикулу серии"
        : mode === "group"
          ? "по фильтрам каталога"
          : "по всем карточкам";
  const statusText = features.length
    ? `Пункты карточки (для всех фасовок позиции) в черновике: ${ids.length} поз. (${modeRu}).`
    : `Сброс пунктов карточки (для всех фасовок позиции) в черновике: ${ids.length} поз. (${modeRu}).`;
  setBulkPanelStatus(statusText, "ok");
  const pc = document.getElementById("ap-view-products");
  const edStatus = document.getElementById("ap-product-status");
  if (pc && !pc.classList.contains("ap-panel-hidden") && edStatus) {
    setStatus(edStatus, statusText, "ok");
  }
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * @param {string} productId
 * @param {File} file
 * @param {{ statusMessage?: boolean }} [options] если false — не трогать строку статуса редактора (для карточки не в фокусе)
 */
function detachProductIdFromBulkPreview(productId) {
  const id = String(productId);
  if (!bulkPreview || !bulkPreview.ids.some((x) => String(x) === id)) return;
  bulkPreview.ids = bulkPreview.ids.filter((x) => String(x) !== id);
  if (!bulkPreview.ids.length) {
    try {
      URL.revokeObjectURL(bulkPreview.url);
    } catch {
      /* ignore */
    }
    bulkPreview = null;
  }
}

function stageProductImageForId(productId, file, options = {}) {
  if (!productId || !file) return false;
  const id = String(productId);
  const pkRaw = String(options.catalogPackKey || "").trim();
  ensureDraftEntry(id);
  detachProductIdFromBulkPreview(id);
  const prefPack = `${id}\x1e`;

  if (pkRaw) {
    // Для фото конкретной фасовки всегда снимаем общий pending-delete этого товара.
    // Иначе верхняя «Сохранить на сайт» может отправить DELETE /image и стереть только что загруженное pack-фото.
    pendingDeleteImage.delete(id);
    const prevGeneral = previewBlobById.get(id);
    if (prevGeneral) {
      try {
        URL.revokeObjectURL(prevGeneral.url);
      } catch {
        /* ignore */
      }
      previewBlobById.delete(id);
    }
    const sp = previewPackStagingKey(id, pkRaw);
    const prevP = previewPackBlobById.get(sp);
    if (prevP) {
      try {
        URL.revokeObjectURL(prevP.url);
      } catch {
        /* ignore */
      }
    }
    const entry = { file, url: URL.createObjectURL(file), catalogPackKey: pkRaw };
    entry.dataUrlPromise = readFileAsDataUrl(file).then((du) => {
      if (previewPackBlobById.get(sp) === entry && typeof du === "string") entry.dataUrl = du;
      return du;
    });
    previewPackBlobById.set(sp, entry);
    pendingDeleteCatalogPackImages.delete(sp);
    if (String(selectedProductId) === id) {
      setAdminProductPreview(entry.url);
      const statusEl = document.getElementById("ap-product-status");
      if (statusEl && options.statusMessage !== false) {
        setStatus(statusEl, "Фото фасовки в черновике. Нажмите «Сохранить на сайт», чтобы выложить.", "ok");
      }
    }
    return true;
  }

  for (const k of [...previewPackBlobById.keys()]) {
    if (!String(k).startsWith(prefPack)) continue;
    const prevPk = previewPackBlobById.get(k);
    if (prevPk) {
      try {
        URL.revokeObjectURL(prevPk.url);
      } catch {
        /* ignore */
      }
    }
    previewPackBlobById.delete(k);
  }

  const prev = previewBlobById.get(id);
  if (prev) {
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      /* ignore */
    }
  }
  const entry = { file, url: URL.createObjectURL(file) };
  entry.dataUrlPromise = readFileAsDataUrl(file).then((du) => {
    if (previewBlobById.get(id) === entry && typeof du === "string") entry.dataUrl = du;
    return du;
  });
  previewBlobById.set(id, entry);
  pendingDeleteImage.delete(id);
  if (String(selectedProductId) === id) {
    setAdminProductPreview(previewBlobById.get(id).url);
    const statusEl = document.getElementById("ap-product-status");
    if (statusEl && options.statusMessage !== false) {
      setStatus(statusEl, "Фото в черновике. Нажмите «Сохранить на сайт», чтобы выложить.", "ok");
    }
  }
  return true;
}

function stageProductImageFromFile(file) {
  if (!file) return;
  const statusEl = document.getElementById("ap-product-photo-status");
  if (!selectedProductId) {
    setStatus(statusEl, "Сначала выберите позицию в списке «Позиция».", "err");
    return;
  }
  readFileAsDataUrl(file)
    .then((du) => {
      if (typeof du === "string" && /^data:image\//i.test(du)) {
        setAdminProductPreview(du);
      }
      const pk = resolveCatalogPackKey(document.getElementById("ap-product-photo-pack-target")?.value || "");
      if (pk) setStatus(statusEl, `Файл выбран для фасовки ${pk}. Нажмите «Опубликовать фото».`, "ok");
      else setStatus(statusEl, "Файл выбран для общего фото. Нажмите «Опубликовать фото».", "ok");
    })
    .catch(() => setStatus(statusEl, "Не удалось прочитать выбранный файл.", "err"));
}

function stageBulkProductImages() {
  if (!ENABLE_BULK_PHOTO_IN_CATALOG) {
    setBulkPanelStatus("Массовые операции с фото в разделе «Каталог» отключены.", "err");
    return;
  }
  const summaryEl = document.getElementById("ap-bulk-summary");
  const fileInput = document.getElementById("ap-bulk-file");
  const validIds = new Set(getProducts().map((p) => String(p.id)));
  const pickedRaw = [...adminBulkSelectedIds].filter((id) => validIds.has(id));
  const productIdsFromPick = [...new Set(pickedRaw)];
  let productIds;
  if (productIdsFromPick.length) {
    productIds = productIdsFromPick;
  } else if (getBulkCodeRaw()) {
    const list = getBulkMatchedProducts();
    if (!list.length) {
      if (summaryEl) summaryEl.textContent = "Нет позиций с таким кодом.";
      setBulkPanelStatus("Нет позиций для обновления.", "err");
      return;
    }
    productIds = [...new Set(list.map((p) => String(p.id)).filter(Boolean))];
  } else {
    const vis = getVisibleCatalogProductIds().filter((id) => validIds.has(id));
    if (!vis.length) {
      if (summaryEl) summaryEl.textContent = "";
      setBulkPanelStatus("Отметьте карточки, либо укажите артикул или серию, либо сузьте фильтры каталога.", "err");
      return;
    }
    productIds = vis;
  }
  if (productIds.length > 500) {
    setBulkPanelStatus("Больше 500 позиций за раз нельзя — снимите часть отметок или уточните артикул.", "err");
    return;
  }
  const f = fileInput?.files?.[0];
  if (!f) {
    setBulkPanelStatus("Выберите файл изображения (JPEG, PNG или WebP, до 2,3 МБ).", "err");
    return;
  }
  if (bulkPreview) {
    try {
      URL.revokeObjectURL(bulkPreview.url);
    } catch {
      /* ignore */
    }
  }
  for (const pid of productIds) {
    previewBlobById.delete(pid);
    pendingDeleteImage.delete(pid);
    for (const k of [...previewPackBlobById.keys()]) {
      if (!k.startsWith(`${pid}\x1e`)) continue;
      const prev = previewPackBlobById.get(k);
      if (prev) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          /* ignore */
        }
      }
      previewPackBlobById.delete(k);
    }
  }
  const bulk = { file: f, url: URL.createObjectURL(f), ids: productIds };
  bulk.dataUrlPromise = readFileAsDataUrl(f).then((du) => {
    if (bulkPreview === bulk && typeof du === "string") bulk.dataUrl = du;
    return du;
  });
  bulkPreview = bulk;
  const modeHint = productIdsFromPick.length
    ? "отмеченным"
    : getBulkCodeRaw()
      ? "по артикулу серии"
      : "по текущей выборке фильтров";
  if (summaryEl) summaryEl.textContent = `Черновик: одно фото на ${productIds.length} поз. (${modeHint}).`;
  setBulkPanelStatus("Превью обновлено в сетке. Опубликуйте кнопкой «Сохранить на сайт».", "ok");
  renderProductCatalog();
  updateDraftToolbar();
}

/**
 * @param {string} productId
 * @param {{ skipConfirm?: boolean }} [options]
 * @returns {boolean}
 */
function stageClearProductImageForId(productId, options = {}) {
  const id = String(productId);
  if (!id) return false;
  if (!options.skipConfirm && !window.confirm("Убрать фото в черновике? На сайте изменится только после «Сохранить на сайт».")) {
    return false;
  }
  ensureDraftEntry(id);
  const prev = previewBlobById.get(id);
  if (prev) {
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      /* ignore */
    }
  }
  previewBlobById.delete(id);
  for (const k of [...previewPackBlobById.keys()]) {
    if (!k.startsWith(`${id}\x1e`)) continue;
    const prevP = previewPackBlobById.get(k);
    if (prevP) {
      try {
        URL.revokeObjectURL(prevP.url);
      } catch {
        /* ignore */
      }
    }
    previewPackBlobById.delete(k);
  }
  pendingDeleteImage.add(id);
  delete draftOverrides[id].cardImageUrl;
  delete draftOverrides[id].heroImageUrl;
  delete draftOverrides[id].catalogPackImages;
  if (String(selectedProductId) === id) {
    const p = getProducts().find((x) => String(x.id) === String(id));
    apRefreshProductPhotoPreview(p, id);
    const statusEl = document.getElementById("ap-product-status");
    if (statusEl) setStatus(statusEl, "Удаление фото в черновике.", "ok");
  }
  return true;
}

function stageClearProductImage() {
  if (!selectedProductId) return;
  if (!stageClearProductImageForId(selectedProductId, { skipConfirm: false })) return;
  renderProductCatalog();
  updateDraftToolbar();
}

function stageBulkClearPhotos() {
  if (!ENABLE_BULK_PHOTO_IN_CATALOG) {
    setBulkPanelStatus("Массовые операции с фото в разделе «Каталог» отключены.", "err");
    return;
  }
  const validIds = new Set(getProducts().map((p) => String(p.id)));
  const pickedRaw = [...adminBulkSelectedIds].filter((pid) => validIds.has(pid));
  const productIdsFromPick = [...new Set(pickedRaw)];
  let productIds;
  if (productIdsFromPick.length) {
    productIds = productIdsFromPick;
  } else if (getBulkCodeRaw()) {
    const list = getBulkMatchedProducts();
    if (!list.length) {
      setBulkPanelStatus("Нет позиций по артикулу для сброса фото.", "err");
      return;
    }
    productIds = [...new Set(list.map((p) => String(p.id)).filter(Boolean))];
  } else {
    const vis = getVisibleCatalogProductIds().filter((pid) => validIds.has(pid));
    if (!vis.length) {
      setBulkPanelStatus("Отметьте карточки, либо укажите артикул или серию, либо сузьте фильтры каталога.", "err");
      return;
    }
    productIds = vis;
  }
  if (productIds.length > 500) {
    setBulkPanelStatus("Больше 500 позиций за раз нельзя.", "err");
    return;
  }
  if (!window.confirm(`Сбросить фото в черновике для ${productIds.length} поз.? Публикация — кнопка «Сохранить на сайт».`)) return;
  if (bulkPreview) {
    try {
      URL.revokeObjectURL(bulkPreview.url);
    } catch {
      /* ignore */
    }
    bulkPreview = null;
  }
  for (const pid of productIds) {
    stageClearProductImageForId(pid, { skipConfirm: true });
  }
  const fi = document.getElementById("ap-bulk-file");
  if (fi) fi.value = "";
  setBulkPanelStatus(`Сброс фото в черновике: ${productIds.length} поз.`, "ok");
  renderProductCatalog();
  updateDraftToolbar();
}

function discardProductDraft() {
  if (!isDraftDirty()) return;
  if (!window.confirm("Сбросить все несохранённые на сайте изменения в этом разделе?")) return;
  resetDraftFromPublished();
  clearImageStaging();
  adminBulkSelectedIds.clear();
  resetApCatalogFilters();
  setBulkPanelStatus("", null);
  const fi = document.getElementById("ap-bulk-file");
  const pf = document.getElementById("ap-product-file");
  if (fi) fi.value = "";
  if (pf) pf.value = "";
  if (selectedProductId) selectProduct(selectedProductId);
  else renderProductCatalog();
  apBulkPackPanelSyncFromDraft();
  updateDraftToolbar();
}

async function publishProductDraftToSite() {
  const statusEl = document.getElementById("ap-products-publish-status");
  // Важно: верхняя публикация не должна молча подтягивать несохранённые поля из текущей формы
  // выбранной карточки. Иначе можно случайно перетереть контент/фасовки при публикации фото.
  // Здесь публикуем только уже записанный в draftOverrides черновик.
  if (!isDraftDirty()) {
    setStatus(statusEl, "Нет изменений для публикации.", null);
    return;
  }
  if (!window.confirm("Опубликовать изменения на сайт для всех посетителей?")) return;
  apMergeBulkPackDomIntoDraftBeforePublish();
  setStatus(statusEl, "Публикация…", null);
  const prevSel = selectedProductId;
  const textPatches = pickTextPatches();
  const fileInput = document.getElementById("ap-bulk-file");
  try {
    // Фото публикуются отдельной кнопкой «Опубликовать фото».
    // Верхняя «Сохранить на сайт» не должна выполнять image POST/DELETE по карточке, чтобы не перетирать результат.
    const bulkIds = ENABLE_BULK_PHOTO_IN_CATALOG && bulkPreview && bulkPreview.ids.length ? [...bulkPreview.ids] : [];
    const bulkStaged =
      ENABLE_BULK_PHOTO_IN_CATALOG && bulkPreview && bulkPreview.ids.length ? bulkPreview : null;
    if (bulkStaged && bulkIds.length) {
      const imageBase64 = await resolveStagedFileDataUrl(bulkStaged);
      if (!imageBase64) throw new Error("Не удалось прочитать файл массового фото");
      await postBulkProductImages(imageBase64, bulkIds);
    }
    if (Object.keys(textPatches).length) {
      await apiAdmin("PATCH", "/api/admin/site-content", { productOverrides: textPatches });
    }
    // После верхней публикации чистим только legacy image-staging, чтобы кнопка не «доделывала» фото повторно.
    clearImageStaging();
    await loadPublishedOverridesFromServer();
    resetDraftFromPublished();
    await refreshPublicOverridesAndRevision();
    adminBulkSelectedIds.clear();
    if (fileInput) fileInput.value = "";
    if (prevSel) selectProduct(prevSel);
    else renderProductCatalog();
    apBulkPackPanelSyncFromDraft();
    setStatus(statusEl, "Изменения опубликованы на сайте.", "ok");
    try {
      const crmIframe = document.getElementById("ap-crm-iframe");
      if (
        crmIframe &&
        typeof crmIframe.src === "string" &&
        crmIframe.src &&
        crmIframe.src !== "about:blank"
      ) {
        crmIframe.contentWindow?.location?.reload?.();
      }
    } catch {
      /* cross-origin или не загружена — игнорируем */
    }
    setBulkPanelStatus("", null);
  } catch (e) {
    setStatus(statusEl, e.message, "err");
  }
  updateDraftToolbar();
}

/** После загрузки overrides с сервера — подтянуть в черновик только поля изображений для списка id. */
function mergePublishedImagesIntoDraftFromServerForIds(ids) {
  for (const pid of ids) {
    const pub = publishedOverrides[pid];
    if (!pub || typeof pub !== "object") continue;
    ensureDraftEntry(pid);
    const dr = draftOverrides[pid] || {};
    if (pub.cardImageUrl !== undefined) dr.cardImageUrl = pub.cardImageUrl;
    if (pub.heroImageUrl !== undefined) dr.heroImageUrl = pub.heroImageUrl;
    if (pub.catalogPackImages !== undefined && typeof pub.catalogPackImages === "object") {
      dr.catalogPackImages = {
        ...(dr.catalogPackImages && typeof dr.catalogPackImages === "object" ? dr.catalogPackImages : {}),
        ...pub.catalogPackImages,
      };
    }
    draftOverrides[pid] = dr;
  }
}

/**
 * Публикация только фото блока «Каталог, шапка…» (без полного черновика карточки).
 * Учитывается только текущая выбранная позиция и выбранная тара / общее фото — без тиража на другие товары.
 */
async function publishProductCardHeaderPhotoToSite() {
  const statusEl = document.getElementById("ap-product-photo-status");
  if (!selectedProductId) {
    setStatus(statusEl, "Выберите позицию в списке «Позиция».", "err");
    return;
  }
  const id = String(selectedProductId);
  const sel = document.getElementById("ap-product-photo-pack-target");
  const pk = resolveCatalogPackKey(sel?.value || "");
  const fileInput = document.getElementById("ap-product-file");
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus(statusEl, "Выберите файл изображения перед публикацией.", "err");
    return;
  }
  const imageBase64 = await readFileAsDataUrl(file).catch(() => "");
  if (!imageBase64 || !/^data:image\//i.test(imageBase64)) {
    setStatus(statusEl, "Не удалось прочитать файл изображения.", "err");
    return;
  }
  const packLabel = (() => {
    if (!pk || !sel) return "";
    const o = [...sel.options].find((x) => x.value === pk);
    return o ? o.textContent.trim() : pk;
  })();
  const confirmMsg = pk
    ? `Опубликовать фото для тары «${packLabel || pk}» (${pk})?`
    : "Опубликовать общее фото карточки?";
  if (!window.confirm(confirmMsg)) return;
  setStatus(statusEl, "Публикация фото…", null);
  try {
    const resp = await apiAdmin("POST", `/api/admin/products/${encodeURIComponent(id)}/image`, {
      imageBase64,
      ...(pk ? { catalogPackKey: pk } : {}),
    });
    mergeAdminProductImageReplyIntoOverrides(id, resp);
    await loadPublishedOverridesFromServer();
    mergePublishedImagesIntoDraftFromServerForIds([id]);
    await refreshPublicOverridesAndRevision();
    if (fileInput) fileInput.value = "";
    const p = getProducts().find((x) => String(x.id) === id);
    apRefreshProductPhotoPreview(p, id);
    renderProductCatalog();
    bumpApAdminImageCacheToken();
    setStatus(statusEl, pk ? `Фото фасовки ${pk} опубликовано.` : "Общее фото опубликовано.", "ok");
  } catch (e) {
    setStatus(statusEl, e.message || String(e), "err");
  }
}

async function deleteProductCardHeaderPhotoFromSite() {
  const statusEl = document.getElementById("ap-product-photo-status");
  if (!selectedProductId) {
    setStatus(statusEl, "Выберите позицию в списке «Позиция».", "err");
    return;
  }
  const id = String(selectedProductId);
  const sel = document.getElementById("ap-product-photo-pack-target");
  const pk = resolveCatalogPackKey(sel?.value || "");
  const confirmMsg = pk
    ? `Удалить фото только для фасовки ${pk}?`
    : "Удалить общее фото карточки (и фото фасовок) для этой позиции?";
  if (!window.confirm(confirmMsg)) return;
  setStatus(statusEl, "Удаление фото…", null);
  try {
    const path = pk
      ? `/api/admin/products/${encodeURIComponent(id)}/image?catalogPackKey=${encodeURIComponent(pk)}`
      : `/api/admin/products/${encodeURIComponent(id)}/image`;
    await apiAdmin("DELETE", path);
    await loadPublishedOverridesFromServer();
    mergePublishedImagesIntoDraftFromServerForIds([id]);
    await refreshPublicOverridesAndRevision();
    const p = getProducts().find((x) => String(x.id) === id);
    apRefreshProductPhotoPreview(p, id);
    renderProductCatalog();
    setStatus(statusEl, pk ? `Фото фасовки ${pk} удалено.` : "Общее фото удалено.", "ok");
  } catch (e) {
    setStatus(statusEl, e.message || String(e), "err");
  }
}

async function loadAnalytics() {
  const daysInput = document.getElementById("ap-analytics-days");
  const chart = document.getElementById("ap-analytics-chart");
  const summary = document.getElementById("ap-analytics-summary");
  const tbody = document.querySelector("#ap-analytics-paths tbody");
  const days = Math.min(90, Math.max(1, Number(daysInput?.value) || 14));
  if (daysInput) daysInput.value = String(days);
  if (chart) chart.innerHTML = '<span class="ap-muted">Загрузка…</span>';
  if (tbody) tbody.innerHTML = "";
  try {
    const d = await apiAdmin("GET", `/api/admin/analytics/summary?days=${days}`);
    const series = Array.isArray(d.series) ? d.series : [];
    const maxPv = Math.max(1, ...series.map((x) => x.pageviews || 0));
    if (chart) {
      chart.innerHTML = "";
      if (!series.length) {
        chart.innerHTML = '<span class="ap-muted">Нет данных за период</span>';
      } else {
        series.forEach((row) => {
          const h = Math.round(((row.pageviews || 0) / maxPv) * 100);
          const col = document.createElement("div");
          col.className = "ap-chart-col";
          col.style.height = `${Math.max(4, h)}%`;
          col.title = `${row.date}: ${row.pageviews} просмотров, уник. ~${row.uniqueVisitors}`;
          const lab = document.createElement("span");
          lab.textContent = row.date.slice(5);
          col.appendChild(lab);
          chart.appendChild(col);
        });
      }
    }
    if (summary) {
      summary.innerHTML = `
        <li>Всего просмотров: <strong>${d.totalPageviews ?? 0}</strong></li>
        <li>Событий в хранилище: <strong>${d.totalEventsStored ?? 0}</strong></li>
        <li>Период: <strong>${d.days}</strong> дн.</li>
      `;
    }
    const paths = Array.isArray(d.topPaths) ? d.topPaths : [];
    if (tbody) {
      tbody.innerHTML = paths.length
        ? paths.map((r) => `<tr><td>${escapeHtml(r.path)}</td><td>${r.count}</td></tr>`).join("")
        : `<tr><td colspan="2" class="ap-muted">Нет данных</td></tr>`;
    }
    const evEl = document.getElementById("ap-analytics-events");
    if (evEl) {
      const te = Array.isArray(d.topEvents) ? d.topEvents : [];
      evEl.innerHTML = te.length
        ? `<ul style="margin:0;padding-left:1.2rem;line-height:1.7">${te.map((ev) => `<li><strong>${escapeHtml(ev.name)}</strong> — ${ev.count}</li>`).join("")}</ul>`
        : "Пока нет событий (кроме просмотров страниц).";
    }
  } catch (e) {
    if (chart) chart.innerHTML = `<span class="ap-status err">${escapeHtml(e.message)}</span>`;
  }
}

document.querySelectorAll(".ap-nav-btn[data-ap-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.apView;
    location.hash = v === "console" ? "console" : v;
  });
});

document.getElementById("ap-users-refresh")?.addEventListener("click", () => renderUsersTable());
document.getElementById("ap-users-csv")?.addEventListener("click", () => downloadUsersCsv());
document.getElementById("ap-users-clients-xls")?.addEventListener("click", () => downloadClientsExcelTable());
document.getElementById("ap-users-client-search")?.addEventListener("input", () => renderUsersFromCache());
document.getElementById("ap-users-client-sort")?.addEventListener("change", () => renderUsersFromCache());
document.getElementById("ap-permissions-refresh")?.addEventListener("click", () => renderRolePermissions());
document.getElementById("ap-permissions-save")?.addEventListener("click", async () => {
  const statusEl = document.getElementById("ap-permissions-status");
  const btn = document.getElementById("ap-permissions-save");
  if (authUser.role !== "admin") return;
  if (btn) btn.disabled = true;
  setStatus(statusEl, "Сохранение…", null);
  try {
    const data = await apiAdmin("PATCH", "/api/admin/role-permissions", { matrix: collectRolePermissionsMatrix() });
    apRolePermissionMatrix = data.matrix && typeof data.matrix === "object" ? data.matrix : apRolePermissionMatrix;
    setStatus(statusEl, "Права ролей сохранены.", "ok");
    await renderRolePermissions();
  } catch (e) {
    setStatus(statusEl, e.message || "Ошибка сохранения прав", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById("ap-users-root")?.addEventListener("click", async (e) => {
  const saveBtn = e.target.closest(".ap-user-role-save");
  const delBtn = e.target.closest(".ap-user-delete");
  if (!saveBtn && !delBtn) return;
  const row = e.target.closest("[data-user-id]");
  if (!row) return;
  const id = Number(row.getAttribute("data-user-id"));
  if (!Number.isFinite(id)) return;
  const statusEl = document.getElementById("ap-users-status");
  if (saveBtn) {
    const role = row.querySelector(".ap-user-role-select")?.value || "client";
    saveBtn.disabled = true;
    try {
      await apiAdmin("PATCH", `/api/users/${id}`, { role });
      setStatus(statusEl, `Роль пользователя #${id} обновлена.`, "ok");
      await renderUsersTable();
    } catch (err) {
      setStatus(statusEl, err.message || "Ошибка изменения роли", "err");
    } finally {
      saveBtn.disabled = false;
    }
    return;
  }
  if (delBtn) {
    const user = apUsersCache.find((u) => Number(u.id) === id);
    const label = user ? `${user.name || "Без имени"} (${user.email || `#${id}`})` : `#${id}`;
    if (!window.confirm(`Удалить пользователя ${label}? Это действие нельзя отменить.`)) return;
    delBtn.disabled = true;
    try {
      await apiAdmin("DELETE", `/api/users/${id}`);
      setStatus(statusEl, `Пользователь #${id} удалён.`, "ok");
      await renderUsersTable();
    } catch (err) {
      setStatus(statusEl, err.message || "Ошибка удаления пользователя", "err");
    } finally {
      delBtn.disabled = false;
    }
  }
});

document.getElementById("ap-user-create-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("ap-users-status");
  const form = e.currentTarget;
  const name = document.getElementById("ap-user-new-name")?.value.trim() || "";
  const email = document.getElementById("ap-user-new-email")?.value.trim() || "";
  const password = document.getElementById("ap-user-new-password")?.value || "";
  const role = document.getElementById("ap-user-new-role")?.value || "client";
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await apiAdmin("POST", "/api/users", { name, email, password, role });
    form.reset();
    const roleSel = document.getElementById("ap-user-new-role");
    if (roleSel) roleSel.value = "client";
    setStatus(statusEl, `Пользователь ${email} добавлен.`, "ok");
    await renderUsersTable();
  } catch (err) {
    setStatus(statusEl, err.message || "Ошибка добавления пользователя", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
});

function onApDeliveryFieldActivity(e) {
  const t = e.target;
  const id = t.id || "";
  let m = id.match(/^ap-delivery-(ru|uk|en)-/);
  if (!m) m = id.match(/^ap-dv2-(ru|uk|en)-/);
  if (m) refreshApDeliveryPreview(m[1]);
}

document.getElementById("ap-view-delivery")?.addEventListener("input", onApDeliveryFieldActivity);
document.getElementById("ap-view-delivery")?.addEventListener("change", onApDeliveryFieldActivity);

document.getElementById("ap-delivery-save")?.addEventListener("click", async () => {
  const statusEl = document.getElementById("ap-delivery-status");
  setStatus(statusEl, "Сохранение…", null);
  try {
    const deliveryUkraine = collectApDeliveryPayload();
    const data = await apiAdmin("PATCH", "/api/admin/site-content", {
      deliveryUkraine,
    });
    if (data.deliveryUkraine && typeof data.deliveryUkraine === "object") {
      fillApDeliveryForm(data.deliveryUkraine);
    }
    refreshAllApDeliveryPreviews();
    setStatus(statusEl, "Доставка сохранена на сайте.", "ok");
  } catch (e) {
    setStatus(statusEl, e.message || "Ошибка сохранения", "err");
  }
});

window.addEventListener("hashchange", syncHash);

document.getElementById("ap-card-product-select")?.addEventListener("change", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLSelectElement)) return;
  const v = t.value;
  if (v) selectProduct(v);
  else selectProduct(null);
});

document.getElementById("ap-card-product-filter")?.addEventListener("input", () => {
  apEnsureCardProductSelect();
});

document.getElementById("ap-bulk-pack-options-add")?.addEventListener("click", () => {
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!body) return;
  const rows = collectPackOptionsFromDom("ap-bulk-pack-options-body");
  rows.push({ kind: "jar", jarKg: 1, label: "", sub: "", hidden: false });
  const sorted = apSortPackRowsByTypeAndMass(rows);
  body.innerHTML = sorted.map((r) => apPackOptionRowHtml(r)).join("");
  apBulkPackOptionsUpdateHint();
});

document.getElementById("ap-bulk-pack-options-fill-template")?.addEventListener("click", () => {
  apBulkPackPanelFillTemplate();
});
document.getElementById("ap-bulk-pack-options-refresh-keep-manual")?.addEventListener("click", () => {
  apBulkPackPanelRefreshFromPriceKeepManual();
});
document.getElementById("ap-bulk-pack-options-rebuild-all")?.addEventListener("click", () => {
  apRebuildAllDraftPackOptionsFromCurrentPrice();
});
document.getElementById("ap-bulk-pack-options-selftest")?.addEventListener("click", () => {
  previewPackOptionsBeforePublish();
});
document.getElementById("ap-bulk-pack-normalize-legacy")?.addEventListener("click", () => {
  apBulkPackNormalizeLegacyKinds();
});

document.getElementById("ap-bulk-pack-apply-table")?.addEventListener("click", () => stageBulkPackOptionsApply());
document.getElementById("ap-bulk-pack-reset-table")?.addEventListener("click", () => stageBulkPackOptionsReset());

document.getElementById("ap-bulk-pack-revert-table")?.addEventListener("click", () => {
  if (selectedProductId) return;
  if (!apBulkPackDomDiffersFromEffectiveDraft()) {
    setBulkPanelStatus(
      "Изменений в таблице нет или они совпадают с последней записью в черновик (для этой таблицы).",
      null
    );
    return;
  }
  if (
    !window.confirm(
      "Отменить несохранённые правки в таблице фасовок? Будет восстановлен последний сохранённый в черновике вид («Таблицу фасовок в черновик», отдельно от общего «Сохранить на сайт»)."
    )
  )
    return;
  apBulkPackPanelSyncFromDraft();
  apBulkPackOptionsUpdateHint();
  updateDraftToolbar();
});

document.getElementById("ap-bulk-pack-panel")?.addEventListener("input", () => {
  apClearPackValidationUi();
  apBulkPackOptionsUpdateHint();
});

document.getElementById("ap-bulk-pack-panel")?.addEventListener("change", (e) => {
  apClearPackValidationUi();
  const t = e.target;
  if (t instanceof HTMLSelectElement && t.classList.contains("ap-pack-kind")) {
    const tr = t.closest("tr");
    apPackRowSyncKgCellToSelectedKind(tr);
    if (t.value === "jar") {
      const jar = tr?.querySelector(".ap-pack-jar");
      if (jar instanceof HTMLInputElement && !String(jar.value || "").trim()) {
        jar.value = "1";
      }
    }
  }
  apBulkPackOptionsUpdateHint();
});

document.getElementById("ap-bulk-pack-panel")?.addEventListener("click", (e) => {
  const up = e.target.closest?.(".ap-pack-up");
  const down = e.target.closest?.(".ap-pack-down");
  const del = e.target.closest?.(".ap-pack-del");
  if (!up && !down && !del) return;
  const tr = e.target.closest?.("tr");
  const body = document.getElementById("ap-bulk-pack-options-body");
  if (!tr || !body || tr.parentElement !== body || !tr.matches("tr[data-ap-pack-row]")) return;
  const trs = apPackTableDataRows(body);
  const idx = trs.indexOf(tr);
  if (idx < 0) return;
  if (del) {
    tr.remove();
    apBulkPackOptionsUpdateHint();
    return;
  }
  const moved =
    up ? apPackTableMoveAdjacent("ap-bulk-pack-options-body", idx, "up") : down ? apPackTableMoveAdjacent("ap-bulk-pack-options-body", idx, "down") : false;
  if (moved) apBulkPackOptionsUpdateHint();
});

document.getElementById("ap-pack-options-add")?.addEventListener("click", () => {
  const body = document.getElementById("ap-pack-options-body");
  if (!body || !selectedProductId) return;
  body.insertAdjacentHTML(
    "beforeend",
    apPackOptionRowHtml({ kind: "jar", jarKg: 1, label: "", sub: "", hidden: false })
  );
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p) apPackOptionsUpdateHint(p);
  apSyncPackOptionsToDraft();
});
document.getElementById("ap-pack-options-selftest")?.addEventListener("click", () => {
  previewPackOptionsBeforePublish();
});

document.getElementById("ap-pack-options-reset")?.addEventListener("click", () => {
  if (!selectedProductId) return;
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (!p || typeof window.dpDefaultPackOptionRows !== "function") return;
  ensureDraftEntry(selectedProductId);
  draftOverrides[selectedProductId].detailPackOptions = window.dpNormalizePackOptionRows
    ? window.dpNormalizePackOptionRows(window.dpDefaultPackOptionRows(p))
    : window.dpDefaultPackOptionRows(p);
  apPackOptionsRender(p, draftOverrides[selectedProductId]);
  updateDraftToolbar();
});

document.getElementById("ap-pack-save-draft")?.addEventListener("click", () => {
  savePackOptionsDraftOnly();
});

document.getElementById("ap-pack-publish-site")?.addEventListener("click", () => {
  void publishProductDraftToSite();
});

document.getElementById("ap-pack-options-section")?.addEventListener("input", () => {
  apClearPackValidationUi();
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p) apPackOptionsUpdateHint(p);
  apSyncPackOptionsToDraft();
});

document.getElementById("ap-pack-options-section")?.addEventListener("click", (e) => {
  const up = e.target.closest?.(".ap-pack-up");
  const down = e.target.closest?.(".ap-pack-down");
  const del = e.target.closest?.(".ap-pack-del");
  if (!up && !down && !del) return;
  const tr = e.target.closest?.("tr");
  const body = document.getElementById("ap-pack-options-body");
  if (!tr || !body || tr.parentElement !== body || !tr.matches("tr[data-ap-pack-row]")) return;
  const trs = apPackTableDataRows(body);
  const idx = trs.indexOf(tr);
  if (idx < 0) return;
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (!p) return;

  if (del) {
    tr.remove();
    apSyncPackOptionsToDraft();
    if (p) apPackOptionsUpdateHint(p);
    return;
  }

  const moved =
    up ? apPackTableMoveAdjacent("ap-pack-options-body", idx, "up") : down ? apPackTableMoveAdjacent("ap-pack-options-body", idx, "down") : false;
  if (!moved) return;
  apSyncPackOptionsToDraft();
  if (p) apPackOptionsUpdateHint(p);
});

document.getElementById("ap-pack-options-section")?.addEventListener("change", (e) => {
  const t = e.target;
  if (t instanceof HTMLSelectElement && t.classList.contains("ap-pack-kind")) {
    const tr = t.closest("tr");
    apPackRowSyncKgCellToSelectedKind(tr);
    if (t.value === "jar") {
      const jar = tr?.querySelector(".ap-pack-jar");
      if (jar instanceof HTMLInputElement && !String(jar.value || "").trim()) {
        jar.value = "1";
      }
    }
  }
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p) apPackOptionsUpdateHint(p);
  apSyncPackOptionsToDraft();
});

document.getElementById("ap-products-panel-catalog")?.addEventListener("change", (e) => {
  const t = e.target;
  if (t instanceof HTMLSelectElement) {
    if (
      t.id === "ap-cat-filter-family" ||
      t.id === "ap-cat-filter-typeword" ||
      t.id === "ap-cat-filter-code" ||
      t.id === "ap-cat-filter-position"
    ) {
      renderProductCatalog();
    }
  } else if (t instanceof HTMLInputElement && t.name === "ap-catalog-purpose") {
    renderProductCatalog();
  }
});

document.getElementById("ap-catalog-filters-reset")?.addEventListener("click", () => {
  resetApCatalogFilters();
  renderProductCatalog();
});

document.getElementById("ap-product-catalog")?.addEventListener("click", (e) => {
  const clr = e.target.closest?.(".ap-card-clear-photo");
  if (clr) {
    e.preventDefault();
    e.stopPropagation();
    const id = clr.getAttribute("data-ap-card-clear");
    if (id && stageClearProductImageForId(id)) {
      setBulkPanelStatus(`Фото сброшено в черновике (${id}).`, "ok");
      renderProductCatalog();
      updateDraftToolbar();
    }
    return;
  }
  if (e.target.closest("a.ap-product-card-site")) return;
  if (e.target.closest(".ap-product-card-pick")) return;
  if (e.target.closest(".ap-product-card-actions")) return;
  const card = e.target.closest?.(".ap-product-card[data-id]");
  if (!card) return;
  selectProduct(card.getAttribute("data-id"));
});

document.getElementById("ap-product-catalog")?.addEventListener("change", (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.classList.contains("ap-card-photo-input")) {
    const id = t.getAttribute("data-ap-card-photo");
    const f = t.files?.[0];
    t.value = "";
    if (!id || !f) return;
    stageProductImageForId(id, f, { statusMessage: String(selectedProductId) === String(id) });
    if (String(selectedProductId) !== String(id)) {
      setBulkPanelStatus(`Фото в черновик для позиции ${id}. Опубликуйте «Сохранить на сайт».`, "ok");
    }
    renderProductCatalog();
    updateDraftToolbar();
    return;
  }
  if (!(t instanceof HTMLInputElement) || !t.classList.contains("ap-product-card-checkbox")) return;
  const id = t.getAttribute("data-ap-bulk-pick");
  if (!id) return;
  if (t.checked) adminBulkSelectedIds.add(id);
  else adminBulkSelectedIds.delete(id);
  t.closest(".ap-product-card")?.classList.toggle("is-bulk-picked", t.checked);
  updateBulkSelectionUi();
  updateDraftToolbar();
});

document.getElementById("ap-product-catalog")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest("a.ap-product-card-site")) return;
  if (e.target.closest(".ap-product-card-pick")) return;
  if (e.target.closest(".ap-product-card-actions")) return;
  const card = e.target.closest?.(".ap-product-card[data-id]");
  if (!card) return;
  e.preventDefault();
  selectProduct(card.getAttribute("data-id"));
});

document.getElementById("ap-product-search")?.addEventListener("input", () => {
  renderProductCatalog();
});

document.getElementById("ap-bulk-scan")?.addEventListener("click", () => {
  const summaryEl = document.getElementById("ap-bulk-summary");
  const raw = getBulkCodeRaw();
  if (!raw) {
    if (summaryEl) summaryEl.textContent = "Введите артикул или серию.";
    setBulkPanelStatus("", null);
    return;
  }
  const list = getBulkMatchedProducts();
  if (summaryEl) {
    summaryEl.textContent = list.length
      ? `Найдено позиций: ${list.length}.`
      : "Нет позиций с таким артикулом (проверьте режим совпадения).";
  }
  setBulkPanelStatus("", null);
});

document.getElementById("ap-bulk-filter-grid")?.addEventListener("click", () => {
  const raw = getBulkCodeRaw();
  const searchEl = document.getElementById("ap-product-search");
  const summaryEl = document.getElementById("ap-bulk-summary");
  if (!raw) {
    if (summaryEl) summaryEl.textContent = "Введите артикул или серию.";
    return;
  }
  if (searchEl) searchEl.value = raw;
  renderProductCatalog();
  if (summaryEl) {
    summaryEl.textContent = `В сетке показаны позиции по поиску «${raw}» (артикул, название, id).`;
  }
  setBulkPanelStatus("", null);
});

document.getElementById("ap-bulk-apply-card-title")?.addEventListener("click", () => {
  const bulkInp = document.getElementById("ap-bulk-card-title");
  stageBulkCardTitleFromString(bulkInp?.value ?? "");
});
document.getElementById("ap-bulk-apply-card-features")?.addEventListener("click", () => {
  const bulkInp = document.getElementById("ap-bulk-card-features");
  stageBulkCardFeaturesFromString(bulkInp?.value ?? "");
});

document.getElementById("ap-bulk-copy-card-title")?.addEventListener("click", () => {
  const raw = document.getElementById("ap-product-card-title")?.value ?? "";
  stageBulkCardTitleFromString(raw);
});

document.getElementById("ap-bulk-copy-detail")?.addEventListener("click", () => stageBulkDetailTextCopy());

document.getElementById("ap-bulk-pack-apply-toolbar")?.addEventListener("click", () => stageBulkPackOptionsApply());
document.getElementById("ap-bulk-pack-reset-toolbar")?.addEventListener("click", () => stageBulkPackOptionsReset());

apPackBindTbodyDragReorder("ap-bulk-pack-options-body", () => {
  apBulkPackOptionsUpdateHint();
});
apPackBindTbodyDragReorder("ap-pack-options-body", () => {
  if (!selectedProductId) return;
  apSyncPackOptionsToDraft();
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (p) {
    apPopulatePhotoPackSelect(p);
    apPackOptionsUpdateHint(p);
  }
});

document.getElementById("ap-draft-publish")?.addEventListener("click", () => publishProductDraftToSite());

document.getElementById("ap-draft-discard")?.addEventListener("click", () => discardProductDraft());

document.getElementById("ap-bulk-select-visible")?.addEventListener("click", () => {
  for (const id of getVisibleCatalogProductIds()) adminBulkSelectedIds.add(id);
  renderProductCatalog();
});

document.getElementById("ap-bulk-clear-selection")?.addEventListener("click", () => {
  adminBulkSelectedIds.clear();
  renderProductCatalog();
});

document.getElementById("ap-product-save")?.addEventListener("click", () => saveProductTextToDraft());
document.getElementById("ap-product-save-from-picker")?.addEventListener("click", () => saveProductTextToDraft());
document.getElementById("ap-product-detail-reset")?.addEventListener("click", () => resetSelectedProductDetailToTemplate());

document.getElementById("ap-product-clear-image")?.addEventListener("click", () => {
  void deleteProductCardHeaderPhotoFromSite();
});

document.getElementById("ap-product-file")?.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) stageProductImageFromFile(f);
});

document.getElementById("ap-product-photo-save-site")?.addEventListener("click", () => {
  void publishProductCardHeaderPhotoToSite();
});

document.getElementById("ap-product-photo-delete-site")?.addEventListener("click", () => {
  void deleteProductCardHeaderPhotoFromSite();
});

document.getElementById("ap-product-photo-pack-target")?.addEventListener("change", () => {
  const p = getProducts().find((x) => String(x.id) === String(selectedProductId));
  if (selectedProductId) apRefreshProductPhotoPreview(p, selectedProductId);
  const statusEl = document.getElementById("ap-product-photo-status");
  if (statusEl) setStatus(statusEl, "", null);
});

document.getElementById("ap-analytics-refresh")?.addEventListener("click", () => loadAnalytics());

function apSyncProductsDataFromCatalogFieldControl(t) {
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) return false;
  if (t instanceof HTMLInputElement && t.classList.contains("ap-pack-back")) return false;
  if (t instanceof HTMLSelectElement && t.getAttribute("data-ap-field") !== "family") return false;
  const pid = t.getAttribute("data-ap-pid");
  const field = t.getAttribute("data-ap-field");
  const extraLabel = t.getAttribute("data-ap-extra-label");
  if (!pid || (!field && !extraLabel)) return false;
  const p = window.PRODUCTS_DATA.find((x) => String(x.id) === pid);
  if (!p) return false;
  if (extraLabel) {
    const key = String(extraLabel || "").trim();
    if (!key) return false;
    if (!p.extraPriceColumns || typeof p.extraPriceColumns !== "object") p.extraPriceColumns = {};
    const v = String(t.value || "").trim();
    if (v) p.extraPriceColumns[key] = v;
    else delete p.extraPriceColumns[key];
  } else if (field === "name" || field === "code" || field === "family") {
    p[field] = t.value.trim();
  } else if (field === "priceNdsPerKg" || field === "priceNoNdsPerKg" || field === "jarSmallKg" || field === "jarBigKg" || field === "bucketKg" || field === "drumKg") {
    const n = Number(String(t.value).replace(",", "."));
    p[field] = Number.isFinite(n) && n >= 0 ? n : null;
  }
  const tr = t.closest("tr");
  if (tr) updateApPriceRowCalc(tr, p);
  setApCatalogDirty(true);
  return true;
}

document.getElementById("ap-price-catalog-body")?.addEventListener("input", (e) => {
  apSyncProductsDataFromCatalogFieldControl(e.target);
});

document.getElementById("ap-price-catalog-body")?.addEventListener("change", (e) => {
  if (e.target instanceof HTMLSelectElement && e.target.closest("#ap-price-catalog-body")) {
    const t = e.target;
    if (t.classList.contains("ap-pack-back")) return;
    if (t.getAttribute("data-ap-field") === "family") apSyncProductsDataFromCatalogFieldControl(t);
  }
});

document.getElementById("ap-price-catalog-body")?.addEventListener("change", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !t.classList.contains("ap-pack-back")) return;
  const pid = t.getAttribute("data-ap-pid");
  const kg = Number(t.getAttribute("data-kg"));
  const total = Number(String(t.value).replace(",", "."));
  const p = window.PRODUCTS_DATA.find((x) => String(x.id) === pid);
  const tr = t.closest("tr");
  if (!p || !tr) return;
  const fn = window.dpPerKgFromPackTotal;
  if (typeof fn === "function" && total > 0 && kg > 0) {
    const per = fn(total, kg);
    if (per != null) {
      p.priceNdsPerKg = per;
      const mainInp = tr.querySelector('[data-ap-field="priceNdsPerKg"]');
      if (mainInp) mainInp.value = String(per);
      updateApPriceRowCalc(tr, p);
      setApCatalogDirty(true);
    }
  }
  t.value = "";
});

document.getElementById("ap-price-save")?.addEventListener("click", () => saveApProductsCatalog());
document.getElementById("ap-price-autofix-ranges")?.addEventListener("click", () => apAutoFixPackRanges());

document.getElementById("ap-price-reload")?.addEventListener("click", async () => {
  const status = document.getElementById("ap-price-save-status");
  try {
    await loadAdminProductsCatalog();
    setApCatalogDirty(false);
    renderApPriceTable();
    renderProductCatalog();
    apBulkPackPanelSyncFromDraft();
    setStatus(status, "Каталог перезагружен с сервера.", "ok");
  } catch (e) {
    setStatus(status, e.message, "err");
  }
});

document.getElementById("ap-price-clear-catalog")?.addEventListener("click", () => clearApPriceCatalogLocalData());

document.getElementById("ap-price-csv-file")?.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const status = document.getElementById("ap-price-save-status");
  const beforeProducts = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA.map((p) => ({ ...p })) : [];
  const fileName = f.name || "файл без имени";
  const fileMeta = `${fileName} (${Math.max(1, Math.round(f.size / 1024))} КБ)`;
  setApPriceLastFile({ status: "pending", fileName: fileMeta, createdAt: new Date().toISOString(), error: "чтение файла..." });
  setStatus(status, `Читаем файл: ${fileMeta}`, null);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(f.name || "");
      const imported = isExcel ? parseExcelPriceCatalog(reader.result) : parseCsvPriceCatalog(reader.result);
      apRebuildDynamicColumns(imported._apDynamicColumns || []);
      apApplyBaseColumnLabels(imported._apBaseColumnLabels || {});
      const dedupRows = dedupeImportedPriceCatalogRows(imported);
      const merged = mergeImportedPriceCatalog(dedupRows.rows);
      const dedupIds = dedupeCatalogProductsById(merged.products);
      merged.products = dedupIds.products;
      const dupFileLine = dedupRows.removed ? `\nДубликатов в файле схлопнуто: ${dedupRows.removed}` : "";
      const dupIdLine = dedupIds.removed ? `\nПовторяющихся id в каталоге удалено: ${dedupIds.removed}` : "";
      if (
        !window.confirm(
          `Импортировать файл?\n\nБудет обновлено: ${merged.updated}\nБудет добавлено новых позиций: ${merged.added}${
            merged.skipped ? `\nПропущено строк: ${merged.skipped}` : ""
          }${dupFileLine}${dupIdLine}\n\nПосле этого нажмите «Сохранить каталог на сервер».`
        )
      ) {
        return;
      }
      window.PRODUCTS_DATA = merged.products;
      apNormalizeExtraColumnsIntoBaseFields();
      apEnsureUnifiedCatalogArticleCodes();
      renderApPriceTable();
      renderProductCatalog();
      apBulkPackPanelSyncFromDraft();
      setApCatalogDirty(true);
      const entry = {
        status: "ok",
        fileName: fileMeta,
        updated: merged.updated,
        added: merged.added,
        skipped: merged.skipped,
        removedImportDupes: dedupRows.removed || 0,
        removedCatalogIdDupes: dedupIds.removed || 0,
        beforeProducts,
        afterCount: merged.products.length,
      };
      addApPriceImportHistory(entry);
      const dupTail = [
        dedupRows.removed ? `дубл. в файле: ${dedupRows.removed}` : "",
        dedupIds.removed ? `дубл. id: ${dedupIds.removed}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      setStatus(
        status,
        `Файл загружен: ${fileMeta}. Обновлено ${merged.updated}, добавлено ${merged.added}.${dupTail ? ` ${dupTail}.` : ""} Сохраните каталог на сервер.`,
        "ok"
      );
    } catch (err) {
      const message = err.message || String(err);
      addApPriceImportHistory({ status: "error", fileName: fileMeta, error: message });
      setStatus(status, `Ошибка импорта файла ${fileMeta}: ${message}`, "err");
    }
  };
  reader.onerror = () => {
    const message = "Не удалось прочитать файл браузером.";
    addApPriceImportHistory({ status: "error", fileName: fileMeta, error: message });
    setStatus(status, `Ошибка импорта файла ${fileMeta}: ${message}`, "err");
  };
  if (/\.(xlsx|xls)$/i.test(f.name || "")) reader.readAsArrayBuffer(f);
  else reader.readAsText(f, "UTF-8");
  e.target.value = "";
});

document.getElementById("ap-price-csv-template")?.addEventListener("click", () => downloadApPriceCsvTemplate());

document.getElementById("ap-price-import-history")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ap-price-rollback]");
  if (!btn) return;
  rollbackApPriceImport(btn.getAttribute("data-ap-price-rollback"));
});

document.getElementById("ap-price-server-backups")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ap-price-restore]");
  if (!btn) return;
  void restoreApPriceServerBackup(btn.getAttribute("data-ap-price-restore"));
});

document.getElementById("ap-price-backups-refresh")?.addEventListener("click", () => {
  void renderApPriceServerBackups();
});

document.getElementById("ap-price-admin-search")?.addEventListener("input", (e) => {
  apPriceFilterQuery = e.target.value || "";
  apPriceFindCursor = -1;
  apClearPriceRowHighlight();
  const hint = document.getElementById("ap-price-find-hint");
  if (hint) hint.textContent = "";
  renderApPriceTable();
});

document.getElementById("ap-price-find-btn")?.addEventListener("click", () => apFindNextPricePosition());

document.getElementById("ap-price-admin-search")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    apFindNextPricePosition();
  }
});

(async function init() {
  if (apBootBlocked) return;
  await refreshAuthUserFromMe();
  await loadCurrentPermissions();
  const roleNorm = String(authUser?.role || "").trim().toLowerCase();
  if (roleNorm !== "admin" && !apCan("adminPanel.view")) {
    renderAdminAccessDenied();
    return;
  }
  applyAdminPermissionsUi();
  const newRoleSel = document.getElementById("ap-user-new-role");
  if (newRoleSel) {
    newRoleSel.innerHTML = apUserRoleOptions("client");
    newRoleSel.value = "client";
  }
  if (apCan("siteContent.edit") || apCan("catalog.view") || apCan("catalog.edit")) {
  try {
    await loadSiteOverrides();
  } catch {
    publishedOverrides = {};
    draftOverrides = {};
  }
  }
  if (apCan("catalog.view") || apCan("catalog.edit")) {
    try {
      await loadAdminProductsCatalog();
    } catch {
      if (Array.isArray(window.PRODUCTS_DATA) && window.PRODUCTS_DATA.length) {
        apEnsureUnifiedCatalogArticleCodes();
      }
    }
  }
  if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
    await window.dpSiteReady.catch(() => {});
  }
  setApCatalogDirty(false);
  renderApPriceImportHistory();
apLoadPriceBaseColumnLabels();
  setApPriceLastFile(readApPriceImportHistory()[0] || null);
  if (apCan("catalog.restore")) await renderApPriceServerBackups();
  syncHash();
  if (apCan("catalog.view") || apCan("catalog.edit")) {
    renderProductCatalog();
    apBulkPackPanelSyncFromDraft();
  }
  updateDraftToolbar();
  if (apCan("analytics.view")) await renderDashboard();
  if (apCan("analytics.view")) await loadAnalytics();
})();
