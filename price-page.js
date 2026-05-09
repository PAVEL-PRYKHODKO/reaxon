function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Подпись типа покрытия в колонке прайса (RU/UA через catalog-pricing.js). */
function dpPriceFamilyCellLabel(family) {
  if (typeof window.dpPriceFamilyLocalized === "function") return window.dpPriceFamilyLocalized(family);
  const raw = String(family ?? "").trim();
  return raw || "—";
}

function dpPriceFamilyHayForSearch(family) {
  if (typeof window.dpPriceFamilySearchHay === "function") return window.dpPriceFamilySearchHay(family);
  return String(family ?? "").trim().toLowerCase();
}

const DEFAULT_DP_PRICE_IDS = {
  tbodyId: "price-table-body",
  tableId: "price-table",
  scrollId: "price-table-scroll",
  showMoreBtnId: "price-show-more",
  familyFilterId: "price-family-filter",
  searchInputId: "price-search",
  downloadBtnId: "download-price",
  downloadDropdownId: "download-price-dropdown",
  downloadCsvBtnId: "download-price-csv",
  downloadPdfBtnId: "download-price-pdf",
};

function ensureMergedPriceIds() {
  if (window.__dpPriceIdsMergedReady) return;
  const merged = { ...DEFAULT_DP_PRICE_IDS };
  const ext =
    typeof window.DP_PRICE_TABLE_IDS === "object" && window.DP_PRICE_TABLE_IDS ? window.DP_PRICE_TABLE_IDS : {};
  for (const k of Object.keys(DEFAULT_DP_PRICE_IDS)) {
    if (Object.prototype.hasOwnProperty.call(ext, k)) merged[k] = ext[k];
  }
  const next = {};
  for (const k of Object.keys(merged)) {
    const v = merged[k];
    next[k] = v === undefined || v === false || v === "" || v == null ? "" : String(v).trim();
  }
  window.__dpPriceMergedIds = next;
  window.__dpPriceIdsMergedReady = true;
}

function priceId(key) {
  ensureMergedPriceIds();
  return window.__dpPriceMergedIds[key] ?? "";
}

function priceEl(key) {
  const id = priceId(key);
  return id ? document.getElementById(id) : null;
}

function toMoney(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num.toFixed(2) : "";
}

function toMoneyOrDash(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num.toFixed(2) : "—";
}

const DP_PRICE_BASE_LABELS_KEY = "dpPriceBaseColumnLabels";
const DP_PRICE_BASE_LABELS_DEFAULT = {
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

function getPriceBaseLabels() {
  const out = { ...DP_PRICE_BASE_LABELS_DEFAULT };
  try {
    const raw = JSON.parse(localStorage.getItem(DP_PRICE_BASE_LABELS_KEY) || "{}");
    if (!raw || typeof raw !== "object") return out;
    for (const key of Object.keys(out)) {
      const label = String(raw[key] || "").trim();
      if (label) out[key] = label;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function headerLabelHtml(label) {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const withBreaks = raw
    .replace(/(за\s*1\s*кг)\s+/giu, "$1\n")
    .replace(/(\s*\/кг\/)\s*/giu, "$1\n");
  return escAttr(withBreaks).replace(/\n/g, "<br>");
}

/** На публичной странице прайса столбец ID скрыт; поиск идёт по артикулу и названию. */
function priceShowsIdFamilyColumns() {
  return false;
}

function syncPriceTableColumnVisibility() {
  const table = priceEl("tableId");
  if (!table) return;
  table.classList.toggle("price-table--hide-id", !priceShowsIdFamilyColumns());
}

/** Порог строк: при большем числе показываем кнопку «Показать ещё» (расширить окно таблицы); все строки всегда в DOM и прокручиваются в блоке. */
function getInitialPriceRowCap() {
  if (typeof window === "undefined") return 14;
  const vh = window.innerHeight || 800;
  const rowApprox = 42;
  const chrome = Math.min(320, Math.max(200, Math.round(vh * 0.2)));
  const n = Math.floor((vh - chrome) / rowApprox);
  return Math.max(8, Math.min(36, n));
}

let priceTableExpanded = false;
let priceShowMoreBound = false;
let priceWheelRedirectBound = false;

/** Колесо над таблицей прокручивает блок прайса, а не только страницу (overflow без фокуса). */
function bindPriceTableWheelRedirect() {
  ensureMergedPriceIds();
  const scroll = priceEl("scrollId");
  if (!scroll || priceWheelRedirectBound) return;
  priceWheelRedirectBound = true;
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (!scroll.contains(e.target) && e.target !== scroll) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const el = scroll;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= el.clientHeight;
      const st = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;
      if (scrollHeight <= clientHeight + 1) return;
      const atTop = st <= 0;
      const atBottom = st + clientHeight >= scrollHeight - 1;
      if (dy < 0 && atTop) return;
      if (dy > 0 && atBottom) return;
      e.preventDefault();
      el.scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, st + dy));
    },
    { passive: false, capture: true }
  );
}

function syncPriceExpandUI() {
  const scroll = priceEl("scrollId");
  const btn = priceEl("showMoreBtnId");
  const tbody = priceEl("tbodyId");
  if (!scroll || !tbody) return;

  const total = tbody.querySelectorAll("tr").length;
  const cap = getInitialPriceRowCap();
  const hasExtra = total > cap;

  if (!btn) {
    scroll.classList.remove("price-table-scroll--collapsed");
    scroll.classList.add("is-expanded");
    return;
  }

  if (!hasExtra) {
    btn.hidden = true;
    scroll.classList.remove("price-table-scroll--collapsed");
    scroll.classList.add("is-expanded");
    return;
  }

  scroll.classList.add("price-table-scroll--collapsed");
  btn.hidden = false;

  if (priceTableExpanded) {
    scroll.classList.add("is-expanded");
    btn.textContent = "Свернуть";
    btn.setAttribute("aria-expanded", "true");
  } else {
    scroll.classList.remove("is-expanded");
    btn.textContent = "Показать ещё";
    btn.setAttribute("aria-expanded", "false");
  }
}

function getRows() {
  const arr = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
  const merge =
    typeof window.dpMergeCatalogRaw === "function" ? window.dpMergeCatalogRaw : (r) => r;
  const norm =
    typeof window.dpNormalizeCatalogProduct === "function"
      ? window.dpNormalizeCatalogProduct
      : typeof window.dpNormalizeProduct === "function"
      ? window.dpNormalizeProduct
      : (r) => r;
  return arr.map((raw) => norm(merge(raw)));
}

function getDynamicPriceColumns(rows) {
  const blocked = new Set(
    [
      "№ п/п",
      "дата перерахунку",
      "мал /кг/ банка",
      "вел /кг/ банка",
      "вага /кг/ мал банка",
      "вага /кг/ вел банка",
      "вага /кг/ відро",
      "вага /кг/ барабан",
    ].map((s) => s.toLowerCase())
  );
  const out = [];
  const seen = new Set();
  for (const p of rows) {
    const map = p && p.extraPriceColumns && typeof p.extraPriceColumns === "object" ? p.extraPriceColumns : null;
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const label = String(key || "").trim();
      if (!label) continue;
      if (blocked.has(label.toLowerCase())) continue;
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(label);
    }
  }
  return out;
}

function renderPriceTableHeader(dynamicCols) {
  const table = priceEl("tableId");
  if (!table) return;
  const row = table.querySelector("thead tr");
  if (!row) return;
  const h = getPriceBaseLabels();
  const staticHeader = `
    <th>${headerLabelHtml(h.family)}</th>
    <th>${headerLabelHtml(h.code)}</th>
    <th>${headerLabelHtml(h.name)}</th>
    <th>${headerLabelHtml(h.priceNoNdsPerKg)}</th>
    <th>${headerLabelHtml(h.priceNdsPerKg)}</th>
    <th>${headerLabelHtml(h.jarSmallKg)}</th>
    <th>${headerLabelHtml(h.jarBigKg)}</th>
    <th>${headerLabelHtml(h.bucketKg)}</th>
    <th>${headerLabelHtml(h.drumKg)}</th>
  `;
  const dynHeader = dynamicCols.map((label) => `<th>${headerLabelHtml(label)}</th>`).join("");
  row.innerHTML = `${staticHeader}${dynHeader}`;
}

function cellReadonly(text) {
  return `<span class="price-cell-text">${escAttr(text)}</span>`;
}

function renderPriceTable() {
  ensureMergedPriceIds();

  const body = priceEl("tbodyId");
  if (!body) return;
  const rows = getFilteredRows();
  const dynamicCols = getDynamicPriceColumns(rows);
  renderPriceTableHeader(dynamicCols);

  body.innerHTML = rows
    .map((p) => {
      const id = p.id ?? "";
      const code = p.code ?? p.series ?? "";
      const fam = p.family ?? "";
      const nm = p.name ?? p.fullName ?? "";
      const pNo = toMoneyOrDash(p.priceNoNdsPerKg);
      const pNds = toMoneyOrDash(p.priceNdsPerKg);
      const jarSmall = toMoney(p.jarSmallKg);
      const jarBig = toMoney(p.jarBigKg);
      const bucket = toMoney(p.bucketKg);
      const drum = toMoney(p.drumKg);
      const extraMap = p && p.extraPriceColumns && typeof p.extraPriceColumns === "object" ? p.extraPriceColumns : {};
      const dynRow = dynamicCols
        .map((col) => {
          const raw = Object.prototype.hasOwnProperty.call(extraMap, col) ? extraMap[col] : "";
          return `<td>${escAttr(String(raw ?? ""))}</td>`;
        })
        .join("");

      return `
        <tr>
          <td>${escAttr(dpPriceFamilyCellLabel(fam))}</td>
          <td>${escAttr(code)}</td>
          <td>${escAttr(nm)}</td>
          <td>${escAttr(pNo)}</td>
          <td>${escAttr(pNds)}</td>
          <td>${escAttr(jarSmall)}</td>
          <td>${escAttr(jarBig)}</td>
          <td>${escAttr(bucket)}</td>
          <td>${escAttr(drum)}</td>
          ${dynRow}
        </tr>
      `;
    })
    .join("");

  syncPriceTableColumnVisibility();
  syncPriceExpandUI();
}

function getFilteredRows() {
  ensureMergedPriceIds();
  const rows = getRows();
  const familyEl = priceEl("familyFilterId");
  const searchEl = priceEl("searchInputId");
  const family = familyEl?.value || "all";
  const q = (searchEl?.value || "").trim().toLowerCase();
  const filtered = rows.filter((p) => {
    const familyOk = family === "all" || String(p.family || "") === family;
    if (!familyOk) return false;
    if (!q) return true;
    const code = p.code ?? p.series ?? "";
    const lc = p.lineCode || "";
    const hay = `${p.family || ""} ${dpPriceFamilyHayForSearch(p.family)} ${code} ${lc} ${p.name || ""} ${p.fullName || ""}`.toLowerCase();
    return hay.includes(q);
  });
  filtered.sort((a, b) => {
    const sa = String(a.code ?? "").trim();
    const sb = String(b.code ?? "").trim();
    const na = /^\d+$/.test(sa) ? Number(sa) : NaN;
    const nb = /^\d+$/.test(sb) ? Number(sb) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return sa.localeCompare(sb, "ru", { numeric: true });
  });
  return filtered;
}

let priceFilterListenersBound = false;

function refreshPriceFamilyOptions() {
  ensureMergedPriceIds();
  const familyEl = priceEl("familyFilterId");
  if (!familyEl) return;
  const prev = familyEl.value;
  const rows = getRows();
  const families = [...new Set(rows.map((r) => String(r.family || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  const allTypes =
    typeof window.dpCatalogPriceFilterAllFamiliesLabel === "function"
      ? window.dpCatalogPriceFilterAllFamiliesLabel()
      : "Все типы покрытия";
  familyEl.innerHTML =
    `<option value="all">${escAttr(allTypes)}</option>` +
    families.map((f) => `<option value="${escAttr(f)}">${escAttr(dpPriceFamilyCellLabel(f))}</option>`).join("");
  if (prev && (prev === "all" || families.includes(prev))) familyEl.value = prev;
  else familyEl.value = "all";
}

function initPriceFilters() {
  ensureMergedPriceIds();
  const familyEl = priceEl("familyFilterId");
  const searchEl = priceEl("searchInputId");
  if (!familyEl || !searchEl) return;

  refreshPriceFamilyOptions();
  if (!priceFilterListenersBound) {
    const rerender = () => {
      priceTableExpanded = false;
      renderPriceTable();
    };
    familyEl.addEventListener("change", rerender);
    searchEl.addEventListener("input", rerender);
    priceFilterListenersBound = true;
  }
}

/** Те же колонки, что таблица / Excel / PDF */
function getPriceExportTableData() {
  const rows = getFilteredRows();
  const dynamicCols = getDynamicPriceColumns(rows);
  const h = getPriceBaseLabels();
  const showIdCol = priceShowsIdFamilyColumns();
  const tailHeader = [h.priceNoNdsPerKg, h.priceNdsPerKg, h.jarSmallKg, h.jarBigKg, h.bucketKg, h.drumKg, ...dynamicCols];
  const typeCol =
    typeof window.dpCatalogPriceTypeColumnHeading === "function"
      ? window.dpCatalogPriceTypeColumnHeading()
      : "Тип покрытия";
  const header = showIdCol
    ? ["ID", typeCol, h.code, h.name, ...tailHeader]
    : [h.code, typeCol, h.name, ...tailHeader];

  const body = rows.map((p) => {
    const code = p.code ?? p.series ?? "";
    const nm = p.name ?? p.fullName ?? "";
    const kgNo = toMoney(p.priceNoNdsPerKg);
    const kgNds = toMoney(p.priceNdsPerKg);
    const familyLbl = dpPriceFamilyCellLabel(p.family);
    const extraMap = p && p.extraPriceColumns && typeof p.extraPriceColumns === "object" ? p.extraPriceColumns : {};
    const dynVals = dynamicCols.map((col) =>
      Object.prototype.hasOwnProperty.call(extraMap, col) ? String(extraMap[col] ?? "") : ""
    );

    const tail = [kgNo, kgNds, toMoney(p.jarSmallKg), toMoney(p.jarBigKg), toMoney(p.bucketKg), toMoney(p.drumKg), ...dynVals];
    const withId = [p.id != null ? String(p.id) : "", familyLbl, code, nm, ...tail];
    return showIdCol ? withId : [code, familyLbl, nm, ...tail];
  });

  return { header, body };
}

function excelColumnLetters(index1Based) {
  let n = index1Based;
  let str = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    str = String.fromCharCode(65 + m) + str;
    n = Math.floor((n - 1) / 26);
  }
  return str || "A";
}

function loadExcelJsOnce() {
  if (typeof window.ExcelJS !== "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    s.crossOrigin = "anonymous";
    s.referrerPolicy = "no-referrer";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("exceljs"));
    document.head.appendChild(s);
  });
}

function loadPdfMakeOnce() {
  if (typeof window.pdfMake !== "undefined" && window.pdfMake.vfs && typeof window.pdfMake.createPdf === "function") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const core = document.createElement("script");
    core.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js";
    core.crossOrigin = "anonymous";
    core.referrerPolicy = "no-referrer";
    core.onload = () => {
      const vfs = document.createElement("script");
      vfs.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js";
      vfs.crossOrigin = "anonymous";
      vfs.referrerPolicy = "no-referrer";
      vfs.onload = () => resolve();
      vfs.onerror = () => reject(new Error("pdfmake vfs"));
      document.head.appendChild(vfs);
    };
    core.onerror = () => reject(new Error("pdfmake"));
    document.head.appendChild(core);
  });
}

/** Розподіл ширини колонок під ландшафт A4 (~752 pt поля між margins), щоб таблиця не виходила за край. */
function buildPdfTableWidths(header) {
  const n = header.length;
  if (n <= 0) return [];
  const avail = 752;
  const nameIdx = header.findIndex((h) => /наименован|назва|найменуван/i.test(String(h)));
  const nameW = Math.min(210, Math.max(95, Math.floor(avail * 0.28)));
  if (nameIdx < 0) return Array(n).fill(avail / n);
  const other = Math.max(26, (avail - nameW) / (n - 1));
  return header.map((_, i) => (i === nameIdx ? nameW : other));
}

function priceExportLang() {
  return typeof window.getDpLang === "function" && window.getDpLang() === "uk" ? "uk" : "ru";
}

/** Реквізити для шапки файлу прайсу (як на контактах / у legal-requisites.json). */
async function loadLegalRequisitesForPriceExport() {
  if (window.__dpLegalRequisitesCache && typeof window.__dpLegalRequisitesCache === "object") {
    return window.__dpLegalRequisitesCache;
  }
  try {
    const url = typeof window.dpApiUrl === "function" ? window.dpApiUrl("/api/legal-requisites") : "/api/legal-requisites";
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.ok) {
      const j = await res.json();
      window.__dpLegalRequisitesCache = j;
      return j;
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("legal-requisites.json", { credentials: "same-origin", cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      window.__dpLegalRequisitesCache = j;
      return j;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildLegalRequisitesHeaderLines(cfg, lang) {
  if (!cfg || typeof cfg !== "object") return [];
  const L = lang === "uk" ? "uk" : "ru";
  const company = String(cfg.companyName?.[L] || cfg.companyName?.ru || "").trim();
  const address = String(cfg.address?.[L] || cfg.address?.ru || "").trim();
  const bank = String(cfg.bank?.[L] || cfg.bank?.ru || "").trim();
  const taxStatus = String(cfg.taxStatus?.[L] || cfg.taxStatus?.ru || "").trim();
  const corr = String(cfg.correspondenceAddress?.[L] || cfg.correspondenceAddress?.ru || "").trim();
  const production = String(cfg.productionAddress?.[L] || cfg.productionAddress?.ru || "").trim();
  const mailAddr = String(cfg.mailAddress?.[L] || cfg.mailAddress?.ru || "").trim();
  const edrpouLabel = L === "uk" ? "ЄДРПОУ" : "ЕГРПОУ";
  const ipnLabel = L === "uk" ? "ІПН" : "ИНН";
  const mfoLabel = "МФО";
  const certLabel = L === "uk" ? "Свідоцтво №" : "Св-во №";
  const bankParts = [];
  if (String(cfg.iban || "").trim()) bankParts.push(`IBAN ${String(cfg.iban).trim()}`);
  if (bank) bankParts.push(bank);
  if (String(cfg.mfo || "").trim()) bankParts.push(`${mfoLabel} ${String(cfg.mfo).trim()}`);
  const bankLine = bankParts.join(", ");
  const regLine = `${edrpouLabel}: ${cfg.edrpou || ""} · ${ipnLabel}: ${cfg.ipn || ""} · ${certLabel} ${cfg.certificateNo || ""}`;
  const telWord = L === "uk" ? "тел." : "тел.";
  let corrLine = corr;
  if (cfg.phone) corrLine = corrLine ? `${corrLine}, ${telWord} ${cfg.phone}` : `${telWord} ${cfg.phone}`;
  const phones = Array.isArray(cfg.contactPhones) ? cfg.contactPhones.filter(Boolean) : [];
  const phoneLine = phones.length ? `${L === "uk" ? "Тел." : "Тел."}: ${phones.join(", ")}` : "";
  const email = String(cfg.contactEmail || "").trim();

  const lines = [];
  lines.push(L === "uk" ? "Прайс-лист" : "Прайс-лист");
  if (company) lines.push(company);
  if (address) lines.push(`${L === "uk" ? "Юридична адреса" : "Юридический адрес"}: ${address}`);
  if (bankLine) lines.push(`${L === "uk" ? "Банківські реквізити" : "Банковские реквизиты"}: ${bankLine}`);
  lines.push(`${L === "uk" ? "Реєстраційні дані" : "Регистрационные данные"}: ${regLine}`);
  if (taxStatus) lines.push(`${L === "uk" ? "Податковий статус" : "Налоговый статус"}: ${taxStatus}`);
  if (corrLine) lines.push(`${L === "uk" ? "Для кореспонденції" : "Для корреспонденции"}: ${corrLine}`);
  if (production) lines.push(`${L === "uk" ? "Виробництво" : "Производство"}: ${production}`);
  if (mailAddr) lines.push(`${L === "uk" ? "Поштова адреса" : "Почтовый адрес"}: ${mailAddr}`);
  if (phoneLine) lines.push(phoneLine);
  if (email) lines.push(`E-mail: ${email}`);
  return lines.map((x) => String(x || "").trim()).filter(Boolean);
}

async function downloadPriceExcel() {
  try {
    await loadExcelJsOnce();
  } catch {
    window.alert?.("Не вдалося завантажити модуль Excel. Перевірте мережу.");
    return;
  }

  const cfg = await loadLegalRequisitesForPriceExport();
  const reqLines = buildLegalRequisitesHeaderLines(cfg, priceExportLang());

  const { header, body } = getPriceExportTableData();
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Прайс", { views: [{ showGridLines: true }] });

  const ncol = header.length;
  const thin = { style: "thin", color: { argb: "FFBAC8DB" } };
  const letterLast = excelColumnLetters(ncol);

  let rowIdx = 1;
  if (reqLines.length) {
    reqLines.forEach((line, li) => {
      const row = ws.getRow(rowIdx);
      const c = row.getCell(1);
      c.value = line;
      c.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (li === 0) {
        c.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
      } else if (li === 1 && reqLines.length > 1) {
        c.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
      } else {
        c.font = { size: 9, color: { argb: "FF334155" } };
      }
      try {
        ws.mergeCells(`A${rowIdx}:${letterLast}${rowIdx}`);
      } catch {
        /* ignore merge edge cases */
      }
      row.height = li === 0 ? 22 : Math.min(48, 14 + Math.ceil(String(line).length / 110) * 12);
      rowIdx += 1;
    });
    rowIdx += 1;
  }

  const headerRowIdx = rowIdx;
  const hr = ws.getRow(headerRowIdx);
  header.forEach((text, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E7A" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  hr.height = 36;

  body.forEach((dataRow, ri) => {
    const row = ws.getRow(headerRowIdx + 1 + ri);
    row.height = 20;
    dataRow.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val;
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      }
    });
  });

  header.forEach((h, i) => {
    let w = 13;
    if (/Наименован|назва|найменуван/i.test(h)) w = 44;
    else if (/артикул|^ID$/i.test(h)) w = 15;
    else if (/Тип покрытия|тип покриття|покрыти|Семейство|сім/i.test(h)) w = 22;
    ws.getColumn(i + 1).width = w;
  });

  const lastRow = headerRowIdx + body.length;
  ws.views = [{ state: "frozen", ySplit: headerRowIdx, showGridLines: true }];
  ws.autoFilter = `A${headerRowIdx}:${excelColumnLetters(ncol)}${lastRow}`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reaxon_coating_list.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadPricePdf() {
  try {
    await loadPdfMakeOnce();
  } catch {
    window.alert?.("Не вдалося завантажити модуль PDF. Перевірте мережу.");
    return;
  }

  const cfg = await loadLegalRequisitesForPriceExport();
  const reqLines = buildLegalRequisitesHeaderLines(cfg, priceExportLang());
  const reqBlock =
    reqLines.length > 0
      ? {
          stack: reqLines.map((line, i) => ({
            text: line,
            fontSize: i === 0 ? 11 : i === 1 ? 10 : 8,
            bold: i <= 1,
            margin: [0, 0, 0, i === reqLines.length - 1 ? 10 : 2],
          })),
          margin: [0, 0, 0, 8],
        }
      : null;

  const { header, body } = getPriceExportTableData();

  const tableBody = [
    header.map((h) => ({ text: String(h), style: "pdfTh" })),
    ...body.map((row) => row.map((c) => ({ text: String(c ?? ""), style: "pdfTd" }))),
  ];

  const docDefinition = {
    pageOrientation: "landscape",
    pageMargins: [28, 32, 28, 42],
    defaultStyle: { font: "Roboto", fontSize: 7 },
    styles: {
      pdfTh: { bold: true, fillColor: "#e2e8f0", fontSize: 7 },
      pdfTd: { fontSize: 6.8 },
    },
    content: [
      ...(reqBlock ? [reqBlock] : []),
      {
        table: {
          headerRows: 1,
          widths: buildPdfTableWidths(header),
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.35,
          vLineWidth: () => 0.35,
          hLineColor: () => "#94a3b8",
          vLineColor: () => "#94a3b8",
          paddingLeft: () => 2,
          paddingRight: () => 2,
          paddingTop: () => 1.5,
          paddingBottom: () => 1.5,
        },
      },
    ],
  };

  const pm = typeof window.pdfMake !== "undefined" ? window.pdfMake : null;
  if (!pm || typeof pm.createPdf !== "function" || !pm.vfs) {
    window.alert?.("PDF: модуль завантажився не повністю. Оновіть сторінку.");
    return;
  }

  pm.createPdf(docDefinition).download("reaxon_coating_list.pdf");
}

window.dpDownloadPriceExcel = downloadPriceExcel;
/** Обратная совместимость: раньше вызывалась выгрузка CSV. */
window.dpDownloadPriceCsv = downloadPriceExcel;
window.dpDownloadPricePdf = downloadPricePdf;

/** Один выпадающий список: «Скачать прайс» → Excel (.xlsx) / PDF */
function bindOnePriceDropdown(parts) {
  const { trigger, dropdown, csvBtn, pdfBtn } = parts;
  if (!trigger || trigger.dataset.dpPriceDownloadUi === "1") return;

  trigger.classList.add("dp-price-download-trigger");

  if (!dropdown || !csvBtn || !pdfBtn) {
    if (!trigger.dataset.dpDlFallbackExcel) {
      trigger.dataset.dpDlFallbackExcel = "1";
      trigger.addEventListener("click", () => void downloadPriceExcel());
    }
    return;
  }

  dropdown.classList.add("dp-price-download-dropdown");

  trigger.dataset.dpPriceDownloadUi = "1";
  bindPriceDropdownDocumentCloseOnce();

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!dropdown.classList.contains("is-hidden")) {
      closeAllPriceDownloadDropdowns();
      return;
    }
    closeAllPriceDownloadDropdowns();
    dropdown.classList.remove("is-hidden");
    trigger.setAttribute("aria-expanded", "true");
  });

  csvBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void downloadPriceExcel();
    closeAllPriceDownloadDropdowns();
  });

  pdfBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void downloadPricePdf();
    closeAllPriceDownloadDropdowns();
  });
}

let priceDlDocCloseBound = false;

function bindPriceDropdownDocumentCloseOnce() {
  if (priceDlDocCloseBound) return;
  priceDlDocCloseBound = true;
  document.addEventListener("click", closeAllPriceDownloadDropdowns);
}

function closeAllPriceDownloadDropdowns() {
  document.querySelectorAll(".dp-price-download-dropdown").forEach((el) => el.classList.add("is-hidden"));
  document.querySelectorAll(".dp-price-download-trigger").forEach((tr) => tr.setAttribute("aria-expanded", "false"));
}

function bindPriceDownloadDropdowns() {
  ensureMergedPriceIds();

  bindOnePriceDropdown({
    trigger: priceEl("downloadBtnId"),
    dropdown: document.getElementById(priceId("downloadDropdownId")),
    csvBtn: priceEl("downloadCsvBtnId"),
    pdfBtn: priceEl("downloadPdfBtnId"),
  });

  bindOnePriceDropdown({
    trigger: document.getElementById("hero-download-price"),
    dropdown: document.getElementById("hero-download-dropdown"),
    csvBtn: document.getElementById("hero-download-csv"),
    pdfBtn: document.getElementById("hero-download-pdf"),
  });
}

function initPricePage() {
  ensureMergedPriceIds();
  if (!priceEl("tbodyId")) return;

  initPriceFilters();
  priceTableExpanded = false;
  renderPriceTable();
  const showBtn = priceEl("showMoreBtnId");
  if (!priceShowMoreBound && showBtn) {
    priceShowMoreBound = true;
    showBtn.addEventListener("click", () => {
      priceTableExpanded = !priceTableExpanded;
      syncPriceExpandUI();
    });
  }

  bindPriceTableWheelRedirect();
}

if (!window.__dpPriceLangUiBound) {
  window.__dpPriceLangUiBound = true;
  window.addEventListener("dp-lang-change", () => {
    ensureMergedPriceIds();
    if (!priceEl("tbodyId")) return;
    refreshPriceFamilyOptions();
    priceTableExpanded = false;
    renderPriceTable();
  });
}

async function bootPricePage() {
  ensureMergedPriceIds();

  if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
    try {
      await window.dpSiteReady;
    } catch {
      /* offline */
    }
  }
  bindPriceDownloadDropdowns();
  initPricePage();
  if (typeof window.dpApplyDataLangAttrs === "function") window.dpApplyDataLangAttrs();
}

bootPricePage();

window.addEventListener("dp-catalog-updated", (e) => {
  refreshPriceFamilyOptions();
  if (e.detail?.skipPriceRender) return;
  priceTableExpanded = false;
  renderPriceTable();
});

window.addEventListener("dp-auth-changed", () => {
  refreshPriceFamilyOptions();
  priceTableExpanded = false;
  renderPriceTable();
});