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
  adminBarId: "price-admin-bar",
  adminLeadId: "price-lead-admin-detail",
  confirmChangesBtnId: "price-confirm-changes",
  discardChangesBtnId: "price-discard-changes",
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

/** Шесть ячеек упаковки: сначала все суммы без НДС (2,8 / 19,4 / 46,6 кг), затем все с НДС. */
function packColsAll(p) {
  const fnNo = typeof window.dpComputePriceTablePackTotalsNoNds === "function" ? window.dpComputePriceTablePackTotalsNoNds : null;
  const fnNds =
    typeof window.dpComputePriceTablePackTotalsNds === "function" ? window.dpComputePriceTablePackTotalsNds : null;
  const fmt = window.dpFormatPackMoney;
  const f = typeof fmt === "function" ? fmt : (n) => (Number(n) > 0 ? Number(n).toFixed(2) : "—");
  const arrNo = fnNo ? fnNo(p.priceNoNdsPerKg) : null;
  const arrNds = fnNds ? fnNds(p.priceNdsPerKg) : null;
  const bez = [];
  const sNds = [];
  for (let i = 0; i < 3; i += 1) {
    bez.push(
      arrNo != null && arrNo[i] != null && Number.isFinite(Number(arrNo[i])) && Number(arrNo[i]) > 0 ? f(arrNo[i]) : "—"
    );
    sNds.push(
      arrNds != null && arrNds[i] != null && Number.isFinite(Number(arrNds[i])) && Number(arrNds[i]) > 0
        ? f(arrNds[i])
        : "—"
    );
  }
  return [...bez, ...sNds];
}

function getAuthUserRole() {
  try {
    if (!localStorage.getItem("authToken")) return "";
    const u = JSON.parse(localStorage.getItem("authUser") || "null");
    return String(u?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function isPriceAdmin() {
  return getAuthUserRole() === "admin";
}

/** Столбец ID — только для администратора, модератора и бухгалтера (тип покрытия виден всем, подпись RU/UA). */
function priceShowsIdFamilyColumns() {
  const r = getAuthUserRole();
  if (!r) return false;
  return (
    r === "admin" ||
    r === "moderator" ||
    r === "accountant" ||
    r === "bookkeeper" ||
    r === "бухгалтер"
  );
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
  const norm = typeof window.dpNormalizeProduct === "function" ? window.dpNormalizeProduct : (r) => r;
  return arr.map((raw) => norm(merge(raw)));
}

function cellReadonly(text) {
  return `<span class="price-cell-text">${escAttr(text)}</span>`;
}

function cellInput(pid, field, value, type, extraAttrs) {
  const v = value == null || value === "" ? "" : String(value);
  const attrs = extraAttrs ? ` ${extraAttrs}` : "";
  return `<input type="${type}" class="price-inline-edit" data-pid="${escAttr(pid)}" data-field="${field}" data-initial="${escAttr(v)}" value="${escAttr(v)}"${attrs} />`;
}

function cellFamilySelect(pid, rawFamily) {
  const v = rawFamily == null || rawFamily === "" ? "" : String(rawFamily).trim();
  const inner =
    typeof window.dpPriceFamilySelectOptionsInnerHtml === "function"
      ? window.dpPriceFamilySelectOptionsInnerHtml((x) => escAttr(String(x ?? "")), rawFamily)
      : `<option value="">${escAttr(v)}</option>`;
  return `<select class="price-inline-edit price-inline-family-select" data-pid="${escAttr(pid)}" data-field="family" data-initial="${escAttr(v)}">${inner}</select>`;
}

function renderPriceTable(options) {
  ensureMergedPriceIds();
  const skipDirtyCheck = options && options.skipDirtyCheck;
  const embeddedCrm = document.body.dataset.crmEmbeddedPriceTable === "1";
  const admin = isPriceAdmin() && !embeddedCrm;
  if (!skipDirtyCheck && admin && hasUnsavedPriceEdits()) {
    if (!window.confirm("Есть несохранённые правки в таблице. Продолжить и отменить их?")) return;
  }

  const body = priceEl("tbodyId");
  if (!body) return;
  const rows = getFilteredRows();

  body.innerHTML = rows
    .map((p) => {
      const id = p.id ?? "";
      const pk = packColsAll(p);
      const packRow = pk.map((x) => `<td>${escAttr(x)}</td>`).join("");
      const code = p.code ?? p.series ?? "";
      const fam = p.family ?? "";
      const nm = p.name ?? p.fullName ?? "";
      const pNo = toMoney(p.priceNoNdsPerKg);
      const pNds = toMoney(p.priceNdsPerKg);

      if (admin) {
        return `
        <tr data-product-id="${escAttr(id)}">
          <td>${cellReadonly(id)}</td>
          <td>${cellFamilySelect(id, fam)}</td>
          <td>${cellInput(id, "code", code, "text")}</td>
          <td>${cellInput(id, "name", nm, "text")}</td>
          <td>${cellInput(id, "priceNoNdsPerKg", pNo, "number", 'step="0.01" min="0"')}</td>
          <td>${cellInput(id, "priceNdsPerKg", pNds, "number", 'step="0.01" min="0"')}</td>
          ${packRow}
        </tr>
      `;
      }

      return `
        <tr>
          <td>${escAttr(id)}</td>
          <td>${escAttr(dpPriceFamilyCellLabel(fam))}</td>
          <td>${escAttr(code)}</td>
          <td>${escAttr(nm)}</td>
          <td>${escAttr(pNo)}</td>
          <td>${escAttr(pNds)}</td>
          ${packRow}
        </tr>
      `;
    })
    .join("");

  if (admin) bindPriceInlineEdits(body);
  syncPriceAdminBarVisibility();
  updatePriceActionButtons();
  syncPriceTableColumnVisibility();
  syncPriceExpandUI();
}

function syncPriceAdminBarVisibility() {
  const admin = isPriceAdmin();
  const bar = priceEl("adminBarId");
  if (bar) bar.hidden = !admin;
  const lead = priceEl("adminLeadId");
  if (lead) lead.hidden = !admin;
}

function fieldValueMatchesInitial(field, currentValue, initialAttr) {
  const a = String(currentValue ?? "").trim();
  const b = String(initialAttr ?? "").trim();
  if (field === "family" || field === "code" || field === "name") return a === b;
  if (a === "" && b === "") return true;
  const na = a === "" ? null : Number(a.replace(",", "."));
  const nb = b === "" ? null : Number(b.replace(",", "."));
  if (na === null && nb === null) return true;
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a === b;
  return Math.abs(na - nb) < 1e-9;
}

function hasUnsavedPriceEdits() {
  if (document.body.dataset.crmEmbeddedPriceTable === "1") return false;
  const tbody = priceEl("tbodyId");
  if (!tbody || !isPriceAdmin()) return false;
  for (const input of tbody.querySelectorAll(".price-inline-edit")) {
    const field = input.dataset.field;
    if (!field) continue;
    if (!fieldValueMatchesInitial(field, input.value, input.getAttribute("data-initial"))) return true;
  }
  return false;
}

function updatePriceActionButtons() {
  const dirty = hasUnsavedPriceEdits();
  const confirmBtn = priceEl("confirmChangesBtnId");
  const discardBtn = priceEl("discardChangesBtnId");
  if (confirmBtn) confirmBtn.disabled = !dirty;
  if (discardBtn) discardBtn.disabled = !dirty;
}

/** После сброса полей — обновить суммы по фасовкам из актуальных данных каталога. */
function refreshAdminPricePackColumnsFromServer() {
  if (document.body.dataset.crmEmbeddedPriceTable === "1") return;
  const tbody = priceEl("tbodyId");
  if (!tbody || !isPriceAdmin()) return;
  const byId = new Map(getRows().map((p) => [String(p.id), p]));
  tbody.querySelectorAll("tr[data-product-id]").forEach((tr) => {
    const id = tr.getAttribute("data-product-id");
    const p = byId.get(String(id));
    if (!p) return;
    const tds = tr.querySelectorAll("td");
    if (tds.length < 12) return;
    const pk = packColsAll(p);
    for (let i = 0; i < 6; i += 1) {
      const cell = tds[6 + i];
      if (cell) cell.textContent = pk[i] ?? "—";
    }
  });
}

function discardPricePendingEdits() {
  const tbody = priceEl("tbodyId");
  if (!tbody || !hasUnsavedPriceEdits()) return;
  for (const input of tbody.querySelectorAll(".price-inline-edit")) {
    input.value = input.getAttribute("data-initial") ?? "";
  }
  refreshAdminPricePackColumnsFromServer();
  updatePriceActionButtons();
}

function collectPendingProductOverrides(tbody) {
  const byPid = {};
  const errors = [];
  for (const input of tbody.querySelectorAll(".price-inline-edit")) {
    const pid = input.dataset.pid;
    const field = input.dataset.field;
    if (!pid || !field) continue;
    const initial = input.getAttribute("data-initial") ?? "";
    if (fieldValueMatchesInitial(field, input.value, initial)) continue;
    const patch = buildPatchForField(field, input.value);
    if (patch === null) {
      errors.push({ field, input });
      continue;
    }
    if (!byPid[pid]) byPid[pid] = {};
    Object.assign(byPid[pid], patch);
  }
  return { byPid, errors };
}

async function confirmPriceChanges() {
  const tbody = priceEl("tbodyId");
  const btn = priceEl("confirmChangesBtnId");
  const discardBtn = priceEl("discardChangesBtnId");
  if (!tbody || !btn) return;

  const { byPid, errors } = collectPendingProductOverrides(tbody);
  if (errors.length) {
    alert("Исправьте некорректные значения (числа должны быть ≥ 0).");
    errors[0].input?.focus?.();
    return;
  }
  if (!Object.keys(byPid).length) return;

  const token = localStorage.getItem("authToken");
  if (!token) {
    alert("Сессия истекла. Войдите снова.");
    return;
  }

  const url =
    typeof window.dpApiUrl === "function" ? window.dpApiUrl("/api/admin/site-content") : "/api/admin/site-content";
  btn.disabled = true;
  if (discardBtn) discardBtn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = "Сохранение…";
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ productOverrides: byPid }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText);
    }
    const data = await res.json();
    if (data.productOverrides && typeof data.productOverrides === "object") {
      window.DP_PRODUCT_OVERRIDES = data.productOverrides;
    }
    window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "price-confirm" } }));
    btn.textContent = prevText;
  } catch (e) {
    console.error(e);
    alert("Не удалось сохранить. Проверьте права администратора и сеть.");
    btn.textContent = prevText;
    updatePriceActionButtons();
  }
}

function parseFieldForPatch(field, rawStr) {
  const raw = String(rawStr ?? "").trim();
  if (field === "family" || field === "code" || field === "name") {
    return raw === "" ? null : raw;
  }
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function buildPatchForField(field, value) {
  const v = parseFieldForPatch(field, value);
  if (v === undefined) return null;
  return { [field]: v };
}

function bindPriceInlineEdits(tbody) {
  if (tbody.dataset.priceInlineBound === "1") return;
  tbody.dataset.priceInlineBound = "1";

  const refreshDirty = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains("price-inline-edit")) return;
    updatePriceActionButtons();
  };
  tbody.addEventListener("input", refreshDirty);
  tbody.addEventListener("change", refreshDirty);
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
  const showIdCol = priceShowsIdFamilyColumns();
  const tailHeader = [
    "Без НДС за кг, грн",
    "С НДС за кг, грн",
    "2,8 кг без НДС, грн",
    "≈19,4 кг без НДС, грн",
    "≈46,6 кг без НДС, грн",
    "2,8 кг с НДС, грн",
    "≈19,4 кг с НДС, грн",
    "≈46,6 кг с НДС, грн",
  ];
  const typeCol =
    typeof window.dpCatalogPriceTypeColumnHeading === "function"
      ? window.dpCatalogPriceTypeColumnHeading()
      : "Тип покрытия";
  const header = showIdCol
    ? ["ID", typeCol, "Артикул", "Наименование", ...tailHeader]
    : ["Артикул", typeCol, "Наименование", ...tailHeader];

  const body = rows.map((p) => {
    const code = p.code ?? p.series ?? "";
    const nm = p.name ?? p.fullName ?? "";
    const pk = packColsAll(p);
    const kgNo = toMoney(p.priceNoNdsPerKg);
    const kgNds = toMoney(p.priceNdsPerKg);
    const familyLbl = dpPriceFamilyCellLabel(p.family);

    const tail = [kgNo, kgNds, pk[0], pk[1], pk[2], pk[3], pk[4], pk[5]];
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

async function downloadPriceExcel() {
  try {
    await loadExcelJsOnce();
  } catch {
    window.alert?.("Не вдалося завантажити модуль Excel. Перевірте мережу.");
    return;
  }

  const { header, body } = getPriceExportTableData();
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Прайс", { views: [{ showGridLines: true }] });

  const ncol = header.length;
  const thin = { style: "thin", color: { argb: "FFBAC8DB" } };

  const headerRowIdx = 1;
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

let priceConfirmBound = false;

function initPricePage() {
  ensureMergedPriceIds();
  if (!priceEl("tbodyId")) return;

  initPriceFilters();
  priceTableExpanded = false;
  renderPriceTable({ skipDirtyCheck: true });

  if (!priceConfirmBound) {
    priceConfirmBound = true;
    priceEl("confirmChangesBtnId")?.addEventListener("click", () => void confirmPriceChanges());
    priceEl("discardChangesBtnId")?.addEventListener("click", discardPricePendingEdits);
  }
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
    renderPriceTable({ skipDirtyCheck: true });
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
  const opts = e.detail?.source === "price-confirm" ? { skipDirtyCheck: true } : {};
  renderPriceTable(opts);
});

window.addEventListener("dp-auth-changed", () => {
  refreshPriceFamilyOptions();
  priceTableExpanded = false;
  renderPriceTable({ skipDirtyCheck: true });
  syncPriceAdminBarVisibility();
  updatePriceActionButtons();
});