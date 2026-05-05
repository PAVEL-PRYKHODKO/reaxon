const token = localStorage.getItem("authToken") || "";
if (!token) window.location.href = "auth.html";

let authUser = {};
try {
  authUser = JSON.parse(localStorage.getItem("authUser") || "{}");
} catch {
  authUser = {};
}

const ALLOWED_ROLES = new Set(["admin", "moderator", "accountant"]);
if (!ALLOWED_ROLES.has(String(authUser.role || "").toLowerCase())) {
  window.location.href = "account.html";
}

let leads = [];
let users = [];
let managers = [];
let integrations = [];
let tasks = [];
let campaigns = [];
let inventory = [];
let inventoryMovements = [];
let calendarEvents = [];
let draggedLeadId = null;
let draggedTaskId = null;
let selectedLeadId = null;
let selectedContactId = null;
const expandedLeadIds = new Set();
let currentSection = "pipeline";
let currentSubtab = "general";
let currentWarehouseSubsection = "form";
let currentTaskSubsection = "list";
let currentContactsCategory = "all";
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = formatDateLocal(new Date());
let warehouseFlowsSnapshot = [];
let currentTaskCategory = "all";
const expandedTaskIds = new Set();
let editingTaskPlainId = null;
const TASK_FILTERS_STORAGE_KEY = "crmTaskFilters";
const TASK_SAVED_PRESET_STORAGE_KEY = "crmTaskSavedPreset";
const CALENDAR_EVENTS_FALLBACK_KEY = "crmCalendarEventsFallback";
const WAREHOUSE_MOVEMENTS_FALLBACK_KEY = "crmWarehouseMovementsFallback";
const TASKS_FALLBACK_KEY = "crmTasksFallback";
const CONTACT_CARD_OVERRIDES_KEY = "crmContactCardOverrides";
let activeTaskPreset = "";
let editingContactId = null;

function apiUrl(path) {
  return typeof window.dpApiUrl === "function" ? window.dpApiUrl(path) : path;
}

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readTaskFilters() {
  try {
    const raw = localStorage.getItem(TASK_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTaskFilters() {
  const payload = {
    search: document.getElementById("crm-task-search")?.value || "",
    assignee: document.getElementById("crm-task-filter-assignee")?.value || "",
    deadline: document.getElementById("crm-task-filter-deadline")?.value || "all",
  };
  try {
    localStorage.setItem(TASK_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op for storage-restricted environments
  }
}

function applySavedTaskFilters() {
  const saved = readTaskFilters();
  const search = document.getElementById("crm-task-search");
  const assignee = document.getElementById("crm-task-filter-assignee");
  const deadline = document.getElementById("crm-task-filter-deadline");
  if (search && typeof saved.search === "string") search.value = saved.search;
  if (assignee && saved.assignee != null) assignee.value = String(saved.assignee || "");
  if (deadline && typeof saved.deadline === "string") deadline.value = saved.deadline || "all";
}

function clearTaskFilters() {
  const search = document.getElementById("crm-task-search");
  const assignee = document.getElementById("crm-task-filter-assignee");
  const deadline = document.getElementById("crm-task-filter-deadline");
  if (search) search.value = "";
  if (assignee) assignee.value = "";
  if (deadline) deadline.value = "all";
  try {
    localStorage.removeItem(TASK_FILTERS_STORAGE_KEY);
  } catch {
    // no-op for storage-restricted environments
  }
}

function taskPresetPayloadFromCurrent() {
  return {
    search: document.getElementById("crm-task-search")?.value || "",
    assignee: document.getElementById("crm-task-filter-assignee")?.value || "",
    deadline: document.getElementById("crm-task-filter-deadline")?.value || "all",
  };
}

function saveTaskPreset() {
  try {
    localStorage.setItem(TASK_SAVED_PRESET_STORAGE_KEY, JSON.stringify(taskPresetPayloadFromCurrent()));
  } catch {
    // no-op
  }
}

function readTaskPreset() {
  try {
    const raw = localStorage.getItem(TASK_SAVED_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function applyTaskFilterValues(values = {}) {
  const search = document.getElementById("crm-task-search");
  const assignee = document.getElementById("crm-task-filter-assignee");
  const deadline = document.getElementById("crm-task-filter-deadline");
  if (search && typeof values.search === "string") search.value = values.search;
  if (assignee && values.assignee != null) assignee.value = String(values.assignee || "");
  if (deadline && typeof values.deadline === "string") deadline.value = values.deadline || "all";
}

function applyTaskPreset(key) {
  const myAssignee = authUser?.id == null ? "" : String(authUser.id);
  if (key === "all") {
    applyTaskFilterValues({ search: "", assignee: "", deadline: "all" });
  } else if (key === "today") {
    applyTaskFilterValues({ search: "", assignee: "", deadline: "today" });
  } else if (key === "week") {
    applyTaskFilterValues({ search: "", assignee: "", deadline: "week" });
  } else if (key === "overdue") {
    applyTaskFilterValues({ search: "", assignee: myAssignee, deadline: "overdue" });
  } else if (key === "saved") {
    const preset = readTaskPreset();
    if (!preset) {
      setStatus("Сохраненный пресет не найден.", false);
      return;
    }
    applyTaskFilterValues(preset);
  } else {
    return;
  }
  activeTaskPreset = key;
  renderTaskPresetBadge();
  writeTaskFilters();
  renderTasksList();
  renderTaskBoard();
}

function renderTaskPresetBadge() {
  const badge = document.getElementById("crm-task-active-preset");
  if (!badge) return;
  const labels = {
    all: "Все задачи",
    today: "Сегодня",
    week: "На неделю",
    overdue: "Мои просроченные",
    saved: "Мой сохраненный",
  };
  badge.textContent = `Активный пресет: ${labels[activeTaskPreset] || "вручную"}`;
}

async function api(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Ошибка API");
  return data;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel(status) {
  return (
    {
      new: "Входящие",
      in_progress: "Согласование",
      quoted: "На производстве",
      won: "Проверка",
      lost: "Завершить сделку",
    }[status] || status || "Входящие"
  );
}

function cardIcon(kind) {
  return (
    {
      contact: "👤",
      integration: "🔌",
      task: "✅",
      campaign: "📣",
      inventory: "📦",
      movement: "↕️",
      event: "📅",
      deadline: "⏰",
      deal: "💼",
    }[kind] || "•"
  );
}

function setStatus(msg, ok = true) {
  const el = document.getElementById("crm-pipeline-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "var(--muted)" : "#b42318";
}

function setCalendarStatus(msg, ok = true) {
  const el = document.getElementById("crm-calendar-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "var(--muted)" : "#b42318";
}

function readCalendarFallback() {
  try {
    const raw = localStorage.getItem(CALENDAR_EVENTS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCalendarFallback(items) {
  try {
    localStorage.setItem(CALENDAR_EVENTS_FALLBACK_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // no-op
  }
}

function readWarehouseMovementsFallback() {
  try {
    const raw = localStorage.getItem(WAREHOUSE_MOVEMENTS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readTasksFallback() {
  try {
    const raw = localStorage.getItem(TASKS_FALLBACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readContactCardOverrides() {
  try {
    const raw = localStorage.getItem(CONTACT_CARD_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeContactCardOverrides(data) {
  try {
    localStorage.setItem(CONTACT_CARD_OVERRIDES_KEY, JSON.stringify(data && typeof data === "object" ? data : {}));
  } catch {}
}

function writeTasksFallback(items) {
  try {
    localStorage.setItem(TASKS_FALLBACK_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {}
}

async function tasksModuleRequest(method, id = null, payload = null) {
  const endpoint = id == null ? "/api/crm/modules/tasks" : `/api/crm/modules/tasks/${id}`;
  try {
    return await api(endpoint, payload ? { method, body: JSON.stringify(payload) } : { method });
  } catch {
    const items = readTasksFallback();
    if (method === "GET") return { items, fallback: true };
    if (method === "POST") {
      const nextId = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      const created = { id: nextId, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      items.unshift(created);
      writeTasksFallback(items);
      return { item: created, fallback: true };
    }
    if (method === "PATCH" && id != null) {
      const idx = items.findIndex((x) => Number(x.id) === Number(id));
      if (idx < 0) throw new Error("Задача не найдена");
      items[idx] = { ...items[idx], ...payload, updatedAt: new Date().toISOString() };
      writeTasksFallback(items);
      return { item: items[idx], fallback: true };
    }
    if (method === "DELETE" && id != null) {
      writeTasksFallback(items.filter((x) => Number(x.id) !== Number(id)));
      return { ok: true, fallback: true };
    }
    throw new Error("Модуль задач временно недоступен");
  }
}

async function syncTasksFallbackToApi() {
  const localItems = readTasksFallback();
  if (!localItems.length) {
    setStatus("Локальных задач для синхронизации нет.", true);
    return;
  }
  let synced = 0;
  for (const row of localItems) {
    await api("/api/crm/modules/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: row.title || "Задача",
        value: row.value || "",
        meta: row.meta || "task",
        status: row.status || "todo",
        assigneeId: row.assigneeId == null ? null : Number(row.assigneeId),
      }),
    });
    synced += 1;
  }
  writeTasksFallback([]);
  await loadAll();
  openSection("tasks");
  setStatus(`Синхронизировано задач: ${synced}.`, true);
}

function writeWarehouseMovementsFallback(items) {
  try {
    localStorage.setItem(WAREHOUSE_MOVEMENTS_FALLBACK_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // no-op
  }
}

async function warehouseMovementsRequest(method, id = null, payload = null) {
  const endpoint = id == null ? "/api/crm/modules/inventoryMovements" : `/api/crm/modules/inventoryMovements/${id}`;
  try {
    return await api(endpoint, payload ? { method, body: JSON.stringify(payload) } : { method });
  } catch {
    const items = readWarehouseMovementsFallback();
    if (method === "GET") return { items, fallback: true };
    if (method === "POST") {
      const nextId = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      const created = { id: nextId, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      items.unshift(created);
      writeWarehouseMovementsFallback(items);
      return { item: created, fallback: true };
    }
    if (method === "DELETE" && id != null) {
      writeWarehouseMovementsFallback(items.filter((x) => Number(x.id) !== Number(id)));
      return { ok: true, fallback: true };
    }
    throw new Error("Склад временно недоступен");
  }
}

function normalizeWarehouseCategory(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "other";
  if (["components", "компоненты", "component"].includes(key)) return "components";
  if (["pigments", "пигменты", "pigment"].includes(key)) return "pigments";
  if (["lacquer", "лак", "лаки"].includes(key)) return "lacquer";
  if (["containers", "тара", "ведро", "банка", "барабан"].includes(key)) return "containers";
  if (["solvents", "растворители", "solvent"].includes(key)) return "solvents";
  if (["additives", "добавки", "additive"].includes(key)) return "additives";
  return "other";
}

function warehouseCategoryLabel(key) {
  return (
    {
      components: "Компоненты",
      pigments: "Пигменты",
      lacquer: "Лак",
      containers: "Тара",
      solvents: "Растворители",
      additives: "Добавки",
      other: "Прочее",
    }[key] || "Прочее"
  );
}

function warehouseUnitLabel(unit) {
  return (
    {
      kg: "кг",
      "кг": "кг",
      l: "л",
      "л": "л",
      pcs: "шт",
      pc: "шт",
      "шт": "шт",
    }[String(unit || "").toLowerCase()] || "шт"
  );
}

function containerTypeLabel(raw) {
  return (
    {
      bucket: "Ведро",
      jar: "Банка",
      drum: "Барабан",
    }[String(raw || "").toLowerCase()] || ""
  );
}

function warehouseCategoryFullLabel(category, containerType) {
  const cat = normalizeWarehouseCategory(category);
  const base = warehouseCategoryLabel(cat);
  if (cat !== "containers") return base;
  const detail = containerTypeLabel(containerType);
  return detail ? `${base} / ${detail}` : base;
}

function warehousePeriodLabel(rawDate, periodMode) {
  const dateStr = String(rawDate || "");
  if (!dateStr) return "Без даты";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Без даты";
  if (periodMode === "quarter") {
    const q = Math.floor(dt.getMonth() / 3) + 1;
    return `${dt.getFullYear()} Q${q}`;
  }
  if (periodMode === "month") {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }
  return formatDateLocal(dt);
}

function exportWarehouseFlowsExcel() {
  const periodMode = document.getElementById("crm-warehouse-export-period")?.value || "day";
  const rows = [...warehouseFlowsSnapshot];
  if (!rows.length) {
    setStatus("Нет данных для выгрузки в Приход/Уход", false);
    return;
  }
  rows.sort((a, b) => String(a.lastDate || "").localeCompare(String(b.lastDate || "")));
  const grouped = new Map();
  for (const row of rows) {
    const period = warehousePeriodLabel(row.lastDate, periodMode);
    if (!grouped.has(period)) grouped.set(period, []);
    grouped.get(period).push(row);
  }
  const dateFrom = document.getElementById("crm-warehouse-flow-date-from")?.value || "—";
  const dateTo = document.getElementById("crm-warehouse-flow-date-to")?.value || "—";
  const generatedAt = new Date();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    body{font-family:Arial,sans-serif;font-size:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #9aa4b2;padding:6px;text-align:left}
    th{background:#eaf0ff}
    .grp td{background:#f5f8ff;font-weight:700}
    .tot td{background:#eef3fb;font-weight:700}
  </style>
  </head><body>
    <h3>Склад: Приход / Уход</h3>
    <p>Период: ${esc(dateFrom)} - ${esc(dateTo)} | Разбивка: ${esc(periodMode)} | Сформирован: ${esc(formatDateTime(generatedAt))}</p>
    <table>
      <thead>
        <tr><th>Период</th><th>Дата</th><th>Категория</th><th>Номенклатура</th><th>Приход</th><th>Уход</th><th>Остаток</th><th>Ед. изм.</th><th>Статус</th></tr>
      </thead>
      <tbody>
      ${[...grouped.entries()]
        .map(([period, list]) => {
          const incomingTotal = list.reduce((sum, r) => sum + (Number(r.incoming || 0) || 0), 0);
          const outgoingTotal = list.reduce((sum, r) => sum + (Number(r.outgoing || 0) || 0), 0);
          const body = list
            .map((r) => {
              const bal = Number(r.balance || 0);
              const status = bal <= 0 ? "Нет на складе" : bal <= 5 ? "Заканчивается" : "В наличии";
              return `<tr>
                <td>${esc(period)}</td>
                <td>${esc(r.lastDate || "—")}</td>
                <td>${esc(warehouseCategoryFullLabel(r.category, r.containerType))}</td>
                <td>${esc(r.title || "Позиция")}</td>
                <td>${esc(Number(r.incoming || 0))}</td>
                <td>${esc(Number(r.outgoing || 0))}</td>
                <td>${esc(Number(r.balance || 0))}</td>
                <td>${esc(warehouseUnitLabel(r.unit))}</td>
                <td>${esc(status)}</td>
              </tr>`;
            })
            .join("");
          return `<tr class="grp"><td colspan="9">${esc(period)}</td></tr>${body}
            <tr class="tot">
              <td>${esc(period)}</td>
              <td>ИТОГО</td>
              <td colspan="2">Сумма по периоду</td>
              <td>${esc(incomingTotal)}</td>
              <td>${esc(outgoingTotal)}</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>`;
        })
        .join("")}
      </tbody>
    </table>
  </body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warehouse-flows-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Excel-файл Приход/Уход сформирован", true);
}

function getFilteredFlowMovements() {
  const warehouseFilter = (document.getElementById("crm-warehouse-filter")?.value || "").trim().toLowerCase();
  const categoryFilter = normalizeWarehouseCategory(document.getElementById("crm-warehouse-filter-category")?.value || "");
  const hasCategoryFilter = Boolean(document.getElementById("crm-warehouse-filter-category")?.value);
  const flowDateFrom = document.getElementById("crm-warehouse-flow-date-from")?.value || "";
  const flowDateTo = document.getElementById("crm-warehouse-flow-date-to")?.value || "";
  return inventoryMovements.filter((m) => {
    const cat = normalizeWarehouseCategory(m.category);
    if (hasCategoryFilter && cat !== categoryFilter) return false;
    const rowDate = String(m.meta || "");
    if (flowDateFrom && rowDate && rowDate < flowDateFrom) return false;
    if (flowDateTo && rowDate && rowDate > flowDateTo) return false;
    if ((flowDateFrom || flowDateTo) && !rowDate) return false;
    if (!warehouseFilter) return true;
    return `${m.title || ""} ${warehouseCategoryFullLabel(cat, m.containerType)}`.toLowerCase().includes(warehouseFilter);
  });
}

function exportWarehouseMovementsExcel() {
  const periodMode = document.getElementById("crm-warehouse-export-period")?.value || "day";
  const rows = getFilteredFlowMovements().sort((a, b) => String(a.meta || "").localeCompare(String(b.meta || "")));
  if (!rows.length) {
    setStatus("Нет движений для выгрузки", false);
    return;
  }
  const grouped = new Map();
  for (const row of rows) {
    const period = warehousePeriodLabel(row.meta, periodMode);
    if (!grouped.has(period)) grouped.set(period, []);
    grouped.get(period).push(row);
  }
  const dateFrom = document.getElementById("crm-warehouse-flow-date-from")?.value || "—";
  const dateTo = document.getElementById("crm-warehouse-flow-date-to")?.value || "—";
  const generatedAt = new Date();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    body{font-family:Arial,sans-serif;font-size:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #9aa4b2;padding:6px;text-align:left}
    th{background:#eaf0ff}
    .grp td{background:#f5f8ff;font-weight:700}
    .tot td{background:#eef3fb;font-weight:700}
  </style>
  </head><body>
    <h3>Склад: Журнал движений</h3>
    <p>Период: ${esc(dateFrom)} - ${esc(dateTo)} | Разбивка: ${esc(periodMode)} | Сформирован: ${esc(formatDateTime(generatedAt))}</p>
    <table>
      <thead>
        <tr><th>Период</th><th>Дата</th><th>Категория</th><th>Номенклатура</th><th>Приход</th><th>Уход</th><th>Итог</th><th>Ед. изм.</th></tr>
      </thead>
      <tbody>
      ${[...grouped.entries()]
        .map(([period, list]) => {
          const incomingTotal = list.reduce((sum, m) => {
            const value = Number(m.value || 0);
            return sum + (value > 0 ? value : 0);
          }, 0);
          const outgoingTotal = list.reduce((sum, m) => {
            const value = Number(m.value || 0);
            return sum + (value < 0 ? Math.abs(value) : 0);
          }, 0);
          const body = list
            .map((m) => {
              const value = Number(m.value || 0);
              const incoming = value > 0 ? value : 0;
              const outgoing = value < 0 ? Math.abs(value) : 0;
              return `<tr>
                <td>${esc(period)}</td>
                <td>${esc(m.meta || "—")}</td>
                <td>${esc(warehouseCategoryFullLabel(m.category, m.containerType))}</td>
                <td>${esc(m.title || "Позиция")}</td>
                <td>${esc(incoming)}</td>
                <td>${esc(outgoing)}</td>
                <td>${value > 0 ? "+" : ""}${esc(value)}</td>
                <td>${esc(warehouseUnitLabel(m.unit))}</td>
              </tr>`;
            })
            .join("");
          return `<tr class="grp"><td colspan="8">${esc(period)}</td></tr>${body}
            <tr class="tot">
              <td>${esc(period)}</td>
              <td>ИТОГО</td>
              <td colspan="2">Сумма по периоду</td>
              <td>${esc(incomingTotal)}</td>
              <td>${esc(outgoingTotal)}</td>
              <td>${esc(incomingTotal - outgoingTotal)}</td>
              <td>—</td>
            </tr>`;
        })
        .join("")}
      </tbody>
    </table>
  </body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warehouse-movements-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Excel-файл журнала движений сформирован", true);
}

function warehouseSortLabel(mode) {
  return (
    {
      name_asc: "Название ▲",
      name_desc: "Название ▼",
      qty_asc: "Остаток ▲",
      qty_desc: "Остаток ▼",
      date_asc: "Дата ▲",
      date_desc: "Дата ▼",
    }[mode] || mode
  );
}

function compareWarehouseRows(a, b, sortMode) {
  if (sortMode === "name_desc") return String(b.title || "").localeCompare(String(a.title || ""), "ru");
  if (sortMode === "name_asc") return String(a.title || "").localeCompare(String(b.title || ""), "ru");
  if (sortMode === "date_desc") return String(b.meta || b.lastDate || "").localeCompare(String(a.meta || a.lastDate || ""));
  if (sortMode === "date_asc") return String(a.meta || a.lastDate || "").localeCompare(String(b.meta || b.lastDate || ""));
  return warehouseCategoryFullLabel(a.category, a.containerType).localeCompare(
    warehouseCategoryFullLabel(b.category, b.containerType),
    "ru"
  );
}

async function calendarModuleRequest(method, id = null, payload = null) {
  const endpoint = id == null ? "/api/crm/modules/calendarEvents" : `/api/crm/modules/calendarEvents/${id}`;
  try {
    return await api(endpoint, payload ? { method, body: JSON.stringify(payload) } : { method });
  } catch {
    const items = readCalendarFallback();
    if (method === "POST") {
      const nextId = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      const created = { id: nextId, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      items.unshift(created);
      writeCalendarFallback(items);
      return { item: created, fallback: true };
    }
    if (method === "PATCH" && id != null) {
      const idx = items.findIndex((x) => Number(x.id) === Number(id));
      if (idx < 0) throw new Error("Событие не найдено");
      items[idx] = { ...items[idx], ...payload, updatedAt: new Date().toISOString() };
      writeCalendarFallback(items);
      return { item: items[idx], fallback: true };
    }
    if (method === "DELETE" && id != null) {
      const next = items.filter((x) => Number(x.id) !== Number(id));
      writeCalendarFallback(next);
      return { ok: true, fallback: true };
    }
    if (method === "GET") return { items, fallback: true };
    throw new Error("Операция календаря недоступна");
  }
}

async function syncCalendarFallbackToApi() {
  const localItems = readCalendarFallback();
  if (!localItems.length) {
    setCalendarStatus("Локальных событий для синхронизации нет.", true);
    return;
  }
  let synced = 0;
  for (const row of localItems) {
    await api("/api/crm/modules/calendarEvents", {
      method: "POST",
      body: JSON.stringify({
        title: row.title || "Событие",
        date: row.date || formatDateLocal(new Date()),
        time: row.time || "",
        type: row.type || "other",
      }),
    });
    synced += 1;
  }
  writeCalendarFallback([]);
  await loadAll();
  openSection("calendar");
  setCalendarStatus(`Синхронизировано событий: ${synced}.`, true);
}

function setActiveMenu(section) {
  document.querySelectorAll(".crm-left-item[data-section]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-section") === section);
  });
  const warehouseGroup = document.getElementById("crm-warehouse-menu-group");
  if (warehouseGroup) warehouseGroup.classList.toggle("is-open", section === "warehouse");
  const tasksGroup = document.getElementById("crm-tasks-menu-group");
  if (tasksGroup) tasksGroup.classList.toggle("is-open", section === "tasks");
  const contactsGroup = document.getElementById("crm-contacts-menu-group");
  if (contactsGroup) contactsGroup.classList.toggle("is-open", section === "contacts");
}

function setActiveContactsSubmenu(category) {
  document.querySelectorAll(".crm-contact-subitem[data-contacts-category]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-contacts-category") === category);
  });
}

function openContactsCategory(category) {
  const allowed = new Set(["all", "admin", "moderator", "accountant", "workers", "client", "blacklist"]);
  currentContactsCategory = allowed.has(String(category || "")) ? String(category) : "all";
  const select = document.getElementById("crm-contacts-category");
  if (select) select.value = currentContactsCategory;
  setActiveContactsSubmenu(currentContactsCategory);
  renderContactsMini();
}

/** Как в админ-панели: дефолтные фасовки из прайса или кастомный detailPackOptions. */
function crmMergedPackOptionRows(product, ov) {
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

async function renderCrmCatalogPackPhotosBlock() {
  const root = document.getElementById("crm-catalog-pack-photos-root");
  const st = document.getElementById("crm-catalog-pack-photos-status");
  const filterEl = document.getElementById("crm-catalog-pack-photos-filter");
  if (!root) return;
  root.innerHTML = '<p class="crm-small">Загрузка…</p>';
  if (st) st.textContent = "";
  const qRaw = (filterEl && filterEl.value) || "";
  const q = String(qRaw).trim().toLowerCase();
  try {
    const [pr, ov] = await Promise.all([
      fetch(apiUrl("/api/site/products"), { cache: "no-store" }).then((r) => r.json()),
      fetch(apiUrl("/api/site/product-overrides"), { cache: "no-store" }).then((r) => r.json()),
    ]);
    const products = Array.isArray(pr.products) ? pr.products : [];
    const map = (ov && ov.productOverrides && typeof ov.productOverrides === "object" && ov.productOverrides) || {};
    const resolveImg = (u) =>
      typeof window.dpResolveMediaUrl === "function" ? window.dpResolveMediaUrl(u) : String(u || "");
    const rows = [];
    const sorted = [...products].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "ru", { numeric: true }));
    for (const p of sorted) {
      const id = String(p.id ?? "");
      if (!id) continue;
      if (q) {
        const hay = `${id} ${String(p.code || "")} ${String(p.name || "")}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const o = map[id] || {};
      const merged = crmMergedPackOptionRows(p, o);
      const chips =
        typeof window.dpApplyDetailPackChips === "function"
          ? window.dpApplyDetailPackChips(p, { detailPackOptions: merged })
          : [];
      if (!chips.length) continue;
      const imgs = o.catalogPackImages && typeof o.catalogPackImages === "object" ? o.catalogPackImages : {};
      const card = o.cardImageUrl || o.heroImageUrl;
      let packCells = "";
      for (const chip of chips) {
        const pk =
          typeof window.dpCatalogPackImageKey === "function" ? window.dpCatalogPackImageKey(chip) : "";
        if (!pk) continue;
        const lbl = `${chip.label || "?"}`.trim();
        const sub = `${chip.sub || ""}`.trim();
        const cap = sub ? `${lbl} (${sub})` : lbl;
        const path = imgs[pk];
        const src = path ? resolveImg(path) : "";
        const hasImg = Boolean(path && String(path).trim());
        packCells += `
          <div class="crm-pack-photo-cell" data-product-id="${esc(id)}" data-pack-key="${esc(pk)}">
            <div class="crm-pack-photo-meta"><code>${esc(pk)}</code><span class="crm-small">${esc(cap)}</span></div>
            <div class="crm-pack-photo-imgwrap">
              ${src ? `<img class="crm-pack-photo-thumb" src="${esc(src)}" alt="" loading="lazy" />` : '<span class="crm-small">Нет фото</span>'}
            </div>
            <div class="crm-pack-photo-actions">
              <button type="button" class="crm-btn crm-btn-sm" data-crm-pack-photo-add>${hasImg ? "Заменить" : "Добавить"}</button>
              ${
                hasImg
                  ? '<button type="button" class="crm-btn crm-btn-sm" data-crm-pack-photo-del>Удалить</button>'
                  : ""
              }
            </div>
          </div>`;
      }
      if (!packCells) continue;
      const cardSrc = card ? resolveImg(card) : "";
      rows.push(`
        <section class="crm-catalog-pack-row" data-product-id="${esc(id)}">
          <header class="crm-catalog-pack-row-head">
            <strong>${esc(String(p.code || "—"))}</strong>
            <span class="crm-small">${esc(String(p.name || "").slice(0, 140))}</span>
            <span class="crm-small"><code>${esc(id)}</code></span>
            <a class="crm-btn crm-btn-sm" href="product.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">На сайте</a>
          </header>
          ${
            cardSrc
              ? `<div class="crm-pack-photo-general"><span class="crm-small">Общее фото карточки (все фасовки без отдельного снимка)</span><img class="crm-pack-photo-thumb" src="${esc(
                  cardSrc
                )}" alt="" loading="lazy" /></div>`
              : '<p class="crm-small">Общее фото не задано — на сайте показывается типовое или фото ниже для выбранной фасовки.</p>'
          }
          <div class="crm-pack-photo-grid">${packCells}</div>
        </section>`);
    }
    root.innerHTML = rows.length
      ? rows.join("")
      : q
        ? '<p class="crm-small">Нет позиций по фильтру — сбросьте поиск или уточните запрос.</p>'
        : '<p class="crm-small">Нет позиций с фасовками каталога (проверьте загрузку прайса).</p>';
    if (st) st.textContent = `Позиций в списке: ${rows.length}${q ? " (фильтр активен)" : ""}`;
  } catch (e) {
    root.innerHTML = `<p class="crm-status">${esc(e.message || String(e))}</p>`;
    if (st) st.textContent = "Ошибка загрузки данных.";
  }
}

function crmPickAndPostPackPhoto(productId, packKey) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/jpeg,image/png,image/webp";
  inp.addEventListener(
    "change",
    () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = String(reader.result || "");
        if (!/^data:image\//i.test(dataUrl)) return;
        try {
          const res = await fetch(apiUrl(`/api/admin/products/${encodeURIComponent(productId)}/image`), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ imageBase64: dataUrl, catalogPackKey: packKey }),
          });
          const msg = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(msg.message || msg.error || res.statusText);
          setStatus("Фото сохранено.", true);
          await renderCrmCatalogPackPhotosBlock();
        } catch (err) {
          setStatus(err.message || "Нет прав медиа или ошибка API", false);
        }
      };
      reader.readAsDataURL(f);
    },
    { once: true }
  );
  inp.click();
}

async function crmDeletePackPhoto(productId, packKey) {
  if (!window.confirm(`Удалить фото для тары «${packKey}» у позиции ${productId}?`)) return;
  try {
    const url = apiUrl(
      `/api/admin/products/${encodeURIComponent(productId)}/image?catalogPackKey=${encodeURIComponent(packKey)}`
    );
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const msg = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(msg.message || msg.error || res.statusText);
    setStatus("Фото фасовки удалено.", true);
    await renderCrmCatalogPackPhotosBlock();
  } catch (err) {
    setStatus(err.message || "Нет прав медиа или ошибка API", false);
  }
}

function setActiveWarehouseSubmenu(subsection) {
  document.querySelectorAll(".crm-left-subitem[data-warehouse-subsection]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-warehouse-subsection") === subsection);
  });
}

function openWarehouseSubsection(subsection) {
  const allowed = new Set(["form", "history", "movements", "flows", "pricelist", "catalog-pack-photos"]);
  currentWarehouseSubsection = allowed.has(String(subsection || "")) ? String(subsection) : "form";
  document.querySelectorAll(".crm-warehouse-pane").forEach((el) => {
    el.classList.toggle("is-active", el.getAttribute("data-warehouse-pane") === currentWarehouseSubsection);
  });
  setActiveWarehouseSubmenu(currentWarehouseSubsection);
  if (currentWarehouseSubsection === "catalog-pack-photos") {
    void renderCrmCatalogPackPhotosBlock();
  }
}

/** Навигация по ссылкам вида #warehouse или #warehouse/catalog-pack-photos (в т.ч. из iframe админ-панели). */
function applyCrmLocationHash() {
  const raw = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
  if (!raw) return false;
  const seg = raw.split("/").filter(Boolean);
  if (seg[0] !== "warehouse") return false;
  openSection("warehouse");
  document.getElementById("crm-warehouse-menu-group")?.classList.add("is-open");
  const sub = (seg[1] || "").trim().toLowerCase();
  const allowedSub = new Set(["form", "history", "movements", "flows", "pricelist", "catalog-pack-photos"]);
  if (sub === "catalog-pack-photos" || sub === "sku-photos") openWarehouseSubsection("catalog-pack-photos");
  else if (sub && allowedSub.has(sub)) openWarehouseSubsection(sub);
  else openWarehouseSubsection("form");
  return true;
}

function setActiveTaskSubmenu(subsection) {
  document.querySelectorAll(".crm-task-subitem[data-task-subsection]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-task-subsection") === subsection);
  });
}

function openTaskSubsection(subsection) {
  const allowed = new Set(["form", "list", "tasklist"]);
  currentTaskSubsection = allowed.has(String(subsection || "")) ? String(subsection) : "list";
  document.querySelectorAll(".crm-task-pane").forEach((el) => {
    el.classList.toggle("is-active", el.getAttribute("data-task-pane") === currentTaskSubsection);
  });
  setActiveTaskSubmenu(currentTaskSubsection);
}

function openSection(section) {
  const map = {
    pipeline: "crm-section-pipeline",
    contacts: "crm-section-contacts-screen",
    tasks: "crm-section-tasks-screen",
    calendar: "crm-section-calendar-screen",
    marketing: "crm-section-marketing-screen",
    integrations: "crm-section-integrations-screen",
    warehouse: "crm-section-warehouse-screen",
    reports: "crm-section-reports-screen",
  };
  const titles = {
    pipeline: "Основная воронка",
    contacts: "Контакты и клиенты",
    tasks: "Задачи сотрудников",
    calendar: "Календарь и сроки",
    marketing: "Маркетинговые кампании",
    integrations: "Интеграции и каналы",
    warehouse: "Склад и инвентаризация",
    reports: "Отчеты и аналитика",
  };
  const meta = {
    pipeline: "Воронка продаж и карточки сделок",
    contacts: "База клиентов, карточки и назначение менеджеров",
    tasks: "Kanban задач, SLA и управление дедлайнами",
    calendar: "Планирование и контроль сроков",
    marketing: "Кампании, бюджеты, эффективность",
    integrations: "Подключения сервисов и проверка событий",
    warehouse: "Остатки, движения и складские позиции",
    reports: "Экспорт и оперативная отчетность",
  };
  currentSection = map[section] ? section : "pipeline";
  document.querySelectorAll(".crm-screen").forEach((el) => el.classList.remove("is-active"));
  document.getElementById(map[currentSection])?.classList.add("is-active");
  setActiveMenu(currentSection);
  const title = document.getElementById("crm-section-title");
  const topMeta = document.getElementById("crm-top-meta");
  if (title) title.textContent = titles[currentSection] || titles.pipeline;
  if (topMeta) topMeta.textContent = meta[currentSection] || "";
  if (currentSection === "contacts") document.getElementById("crm-contacts-search")?.focus();
  if (currentSection === "integrations") document.getElementById("crm-gmail-connect")?.focus();
  if (currentSection === "tasks") {
    openTaskSubsection(currentTaskSubsection);
    if (currentTaskSubsection === "form") document.getElementById("crm-task-title")?.focus();
    else document.getElementById("crm-task-search")?.focus();
  }
  if (currentSection === "calendar") document.getElementById("crm-calendar-date")?.focus();
  if (currentSection === "warehouse") {
    openWarehouseSubsection(currentWarehouseSubsection);
    if (currentWarehouseSubsection === "form") document.getElementById("crm-warehouse-name")?.focus();
  }
  if (currentSection === "reports") document.getElementById("crm-generate-report-side")?.focus();
}

function setActiveSubtab(tab) {
  currentSubtab = tab;
  document.querySelectorAll("#crm-subtabs [data-subtab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-subtab") === tab);
  });
  renderSubtabContent();
}

function renderSubtabContent() {
  const root = document.getElementById("crm-subtab-content");
  const lead = currentLead();
  if (!root) return;
  if (!lead) {
    root.innerHTML = `<div class="crm-list-empty">Нет выбранной сделки.</div>`;
    return;
  }
  const interactions = Array.isArray(lead.crm?.interactions) ? lead.crm.interactions.length : 0;
  if (currentSubtab === "general") {
    root.innerHTML = `<p><strong>Общие:</strong> стадия ${esc(statusLabel(lead.status))}, клиент ${esc(lead.customerName || "—")}, менеджер ${esc(
      lead.crm?.assigneeName || "не назначен"
    )}.</p>`;
    return;
  }
  if (currentSubtab === "products") {
    root.innerHTML = `<p><strong>Товары:</strong> используйте раздел "Склад" ниже для категорий, остатков и поступлений. Для текущей сделки сумма: ${esc(
      lead.orderTotal || "—"
    )} UAH.</p>`;
    return;
  }
  if (currentSubtab === "invoices") {
    root.innerHTML = `<p><strong>Счета:</strong> платежный статус и сумма сделки. Метод оплаты: ${esc(
      lead.paymentMethod || "не указан"
    )}. Экспорт по всем сделкам доступен в разделе "Отчеты".</p>`;
    return;
  }
  if (currentSubtab === "relations") {
    root.innerHTML = `<p><strong>Связи:</strong> контакт клиента (${esc(lead.phone || "—")}) связан со сделкой #${esc(
      lead.id
    )}. Личный менеджер клиента назначается в разделе "Контакты".</p>`;
    return;
  }
  if (currentSubtab === "history") {
    root.innerHTML = `<p><strong>История:</strong> в этой сделке ${interactions} взаимодействий (переписка/звонки) + комментарии менеджера в таймлайне.</p>`;
    return;
  }
  root.innerHTML = "";
}

function currentLead() {
  if (!leads.length) return null;
  const found = leads.find((x) => String(x.id) === String(selectedLeadId));
  return found || leads[0];
}

function renderStages() {
  const root = document.getElementById("crm-stages");
  if (!root) return;
  const cols = ["new", "in_progress", "quoted", "won", "lost"];
  root.innerHTML = cols
    .map((s) => {
      const count = leads.filter((l) => l.status === s).length;
      return `<div class="crm-stage" data-stage="${s}"><span>${esc(statusLabel(s))}</span><strong>${count}</strong></div>`;
    })
    .join("");
  const total = leads.length;
  const turnover = leads.reduce((a, b) => a + (Number(b.orderTotal) || 0), 0);
  const top = document.getElementById("crm-top-meta");
  if (top) top.textContent = `${total} сделок · ${turnover.toFixed(0)} UAH`;
}

function renderDealsStrip() {
  const root = document.getElementById("crm-deals-strip");
  if (!root) return;
  const q = (document.getElementById("crm-lead-search")?.value || "").trim().toLowerCase();
  const filtered = q
    ? leads.filter((l) => `${l.customerName || ""} ${l.phone || ""} ${l.email || ""} ${l.comment || ""}`.toLowerCase().includes(q))
    : leads.slice();
  root.innerHTML = filtered.length
    ? filtered
        .map((lead) => {
          const isHot = String(lead.priority || "") === "high";
          const isWon = String(lead.status || "") === "won";
          const expanded = expandedLeadIds.has(String(lead.id));
          const cls = ["crm-card", isHot ? "crm-card--hot" : "", isWon ? "crm-card--won" : "", expanded ? "crm-card--expanded" : ""]
            .filter(Boolean)
            .join(" ");
          const interactions = Array.isArray(lead.crm?.interactions) ? lead.crm.interactions.length : 0;
          return `<article class="${cls}" draggable="true" data-lead-id="${esc(lead.id)}">
            <h4><span class="crm-icon">${cardIcon("deal")}</span>#${esc(lead.id)} ${esc(lead.customerName || "Без имени")}</h4>
            <p class="crm-card-topic">${esc(lead.topic || "—")}</p>
            <p>${esc(lead.phone || "—")} · ${esc(lead.email || "—")}</p>
            <div class="crm-card-meta"><span>${esc(statusLabel(lead.status))}</span><span>${esc(lead.orderTotal || "—")} UAH</span></div>
            <div class="crm-badges">
              <span class="crm-badge">${interactions} активностей</span>
              ${isHot ? `<span class="crm-badge crm-badge--danger">Высокий приоритет</span>` : ""}
            </div>
            <div class="crm-card-extra"><p>${esc(lead.comment || "Без комментария")}</p></div>
          </article>`;
        })
        .join("")
    : `<div class="crm-list-empty">Сделки не найдены.</div>`;
  bindDealCardsEvents();
}

function renderDealInfo() {
  const lead = currentLead();
  const root = document.getElementById("crm-deal-info");
  const kpi = document.getElementById("crm-analytics-kpi");
  if (!root) return;
  if (!lead) {
    root.innerHTML = `<div class="crm-list-empty">Нет активной сделки.</div>`;
    if (kpi) kpi.innerHTML = "";
    const hintEl = document.getElementById("crm-reply-lk-hint");
    if (hintEl) hintEl.textContent = "";
    return;
  }
  const assigned = lead.crm?.assigneeName || "Не назначен";
  const accId = lead.crm?.accountUserId;
  const accHint =
    accId != null
      ? `Клиент привязан к аккаунту #${accId}. Ответ в ЛК дойдёт в кабинет и на email.`
      : "Нет привязки к аккаунту — ответ в ЛК недоступен. Заявка должна быть с сайта под авторизованным пользователем.";
  const hintEl = document.getElementById("crm-reply-lk-hint");
  if (hintEl) hintEl.textContent = accHint;
  root.innerHTML = `
    <div class="crm-info-row"><strong>Стадия</strong><span>${esc(statusLabel(lead.status))}</span></div>
    <div class="crm-info-row"><strong>Тема</strong><span>${esc(lead.topic || "—")}</span></div>
    <div class="crm-info-row"><strong>Клиент</strong><span>${esc(lead.customerName || "—")}</span></div>
    <div class="crm-info-row"><strong>Контакты</strong><span>${esc(lead.phone || "—")} · ${esc(lead.email || "—")}</span></div>
    <div class="crm-info-row"><strong>Аккаунт</strong><span>${accId != null ? `#${esc(String(accId))}` : "—"}</span></div>
    <div class="crm-info-row"><strong>Менеджер</strong><span>${esc(assigned)}</span></div>
    <div class="crm-info-row"><strong>Сумма</strong><span>${esc(lead.orderTotal || "—")} UAH</span></div>
    <div class="crm-info-row"><strong>Комментарий</strong><span>${esc(lead.comment || "—")}</span></div>
  `;
  if (kpi) {
    const total = leads.length;
    const won = leads.filter((x) => x.status === "won").length;
    const conv = total ? ((won / total) * 100).toFixed(1) : "0.0";
    const turn = leads.reduce((a, b) => a + (Number(b.orderTotal) || 0), 0);
    kpi.innerHTML = `
      <div class="crm-kpi-item"><strong>${total}</strong><span>Сделок</span></div>
      <div class="crm-kpi-item"><strong>${won}</strong><span>В проверке</span></div>
      <div class="crm-kpi-item"><strong>${conv}%</strong><span>Конверсия</span></div>
      <div class="crm-kpi-item"><strong>${turn.toFixed(0)} UAH</strong><span>Оборот</span></div>
    `;
  }
}

function renderTimeline() {
  const lead = currentLead();
  const root = document.getElementById("crm-timeline");
  if (!root) return;
  if (!lead) {
    root.innerHTML = `<div class="crm-list-empty">Активности отсутствуют.</div>`;
    return;
  }
  const notes = Array.isArray(lead.crm?.managerNotes) ? lead.crm.managerNotes : [];
  const interactions = Array.isArray(lead.crm?.interactions) ? lead.crm.interactions : [];
  const rows = [
    ...notes.map((n) => ({
      type: "Комментарий",
      text: n.text || "",
      at: n.createdAt || lead.updatedAt,
      who: n.authorName || "Система",
    })),
    ...interactions.map((i) => ({
      type: `${i.channel || "interaction"} / ${i.direction || "outbound"}`,
      text: i.message || "",
      at: i.createdAt || lead.updatedAt,
      who: i.authorId || "Менеджер",
      recordingUrl: i.recordingUrl || "",
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  root.innerHTML = rows.length
    ? rows
        .map(
          (r) => `<article class="crm-timeline-item">
            <strong>${esc(r.type)}</strong>
            <p>${esc(r.text || "—")}</p>
            ${r.recordingUrl ? `<p><a href="${esc(r.recordingUrl)}" target="_blank" rel="noopener noreferrer">Запись разговора</a></p>` : ""}
            <div class="meta">${esc(new Date(r.at || Date.now()).toLocaleString("ru-RU"))} · ${esc(String(r.who || ""))}</div>
          </article>`
        )
        .join("")
    : `<div class="crm-list-empty">История пока пустая.</div>`;
}

function renderContactsMini() {
  const root = document.getElementById("crm-contacts-list");
  if (!root) return;
  const q = (document.getElementById("crm-contacts-search")?.value || "").trim().toLowerCase();
  const category = document.getElementById("crm-contacts-category")?.value || currentContactsCategory || "all";
  currentContactsCategory = category;
  setActiveContactsSubmenu(currentContactsCategory);
  const base = q ? users.filter((u) => `${u.name || ""} ${u.email || ""} ${u.profile?.phone || ""}`.toLowerCase().includes(q)) : users.slice();
  const roleKey = (u) => String(u.role || "").toLowerCase();
  const hasSpamMark = (u) => {
    const tags = Array.isArray(u.profile?.tags) ? u.profile.tags.join(" ").toLowerCase() : "";
    return Boolean(u.profile?.isSpam) || tags.includes("spam");
  };
  const hasBlacklistMark = (u) => {
    const tags = Array.isArray(u.profile?.tags) ? u.profile.tags.join(" ").toLowerCase() : "";
    return Boolean(u.profile?.isBlacklisted) || tags.includes("blacklist") || tags.includes("черный");
  };
  const managerOptions = (selectedId) =>
    `<option value="">Не назначен</option>${managers
      .map((m) => `<option value="${esc(m.id)}"${String(m.id) === String(selectedId ?? "") ? " selected" : ""}>${esc(m.name || `#${m.id}`)}</option>`)
      .join("")}`;
  const renderTable = (title, list) => {
    if (!list.length) return "";
    return `<section class="crm-warehouse-section">
      <h4>${esc(title)} (${list.length})</h4>
      <div class="crm-warehouse-table-wrap">
        <table class="crm-warehouse-table">
          <thead><tr><th>ID</th><th>Клиент</th><th>Email</th><th>Телефон</th><th>Компания</th><th>Менеджер</th><th>Действия</th></tr></thead>
          <tbody>
            ${list
              .slice(0, 200)
              .map(
                (u) => `<tr data-user-id="${esc(u.id)}">
                  <td>${esc(u.id)}</td>
                  <td>${esc(u.name || "Без имени")}</td>
                  <td>${esc(u.email || "—")}</td>
                  <td>${esc(u.profile?.phone || "—")}</td>
                  <td>${esc(u.profile?.companyName || "—")}</td>
                  <td><select class="crm-contact-manager">${managerOptions(u.profile?.accountManagerId)}</select></td>
                  <td><div class="crm-toolbar"><button class="crm-btn" type="button" data-save-manager>Сохранить</button><button class="crm-btn" type="button" data-open-contact>Карточка</button></div></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  };
  const admins = base.filter((u) => roleKey(u) === "admin");
  const moderators = base.filter((u) => roleKey(u) === "moderator");
  const accountants = base.filter((u) => ["accountant", "bookkeeper", "бухгалтер"].includes(roleKey(u)));
  const blacklist = base.filter((u) => hasBlacklistMark(u));
  const workers = base.filter((u) => ["manager", "moderator", "accountant", "bookkeeper", "бухгалтер"].includes(roleKey(u)));
  const clients = base.filter((u) => {
    const r = roleKey(u);
    return !["admin", "moderator", "accountant", "bookkeeper", "бухгалтер", "manager"].includes(r) && !hasSpamMark(u) && !hasBlacklistMark(u);
  });
  let title = "Все контакты";
  let rows = base;
  if (category === "admin") {
    title = "Администратор";
    rows = admins;
  } else if (category === "moderator") {
    title = "Модератор";
    rows = moderators;
  } else if (category === "accountant") {
    title = "Бухгалтер";
    rows = accountants;
  } else if (category === "workers") {
    title = "Работники";
    rows = workers;
  } else if (category === "client") {
    title = "Клиенты";
    rows = clients;
  } else if (category === "blacklist") {
    title = "Черный список";
    rows = blacklist;
  }
  root.innerHTML = renderTable(title, rows) || `<div class="crm-list-empty">Контакты не найдены.</div>`;
  if (!root.innerHTML) root.innerHTML = `<div class="crm-list-empty">Контакты не найдены.</div>`;
  if (!selectedContactId && base.length) selectedContactId = Number(base[0].id);
  renderContactProfile();
}

function renderContactProfile() {
  const root = document.getElementById("crm-contact-profile");
  if (!root) return;
  const user = users.find((u) => Number(u.id) === Number(selectedContactId));
  if (!user) {
    root.innerHTML = `<div class="crm-list-empty">Выберите контакт, чтобы открыть карточку клиента.</div>`;
    return;
  }
  const roleLabel = {
    admin: "Администратор",
    moderator: "Модератор",
    accountant: "Бухгалтер",
    bookkeeper: "Бухгалтер",
    manager: "Менеджер",
    client: "Клиент",
  }[String(user.role || "").toLowerCase()] || String(user.role || "—");
  const overrides = readContactCardOverrides();
  const override = overrides[String(user.id)] || {};
  const emailValue = String(override.email || user.email || "");
  const phoneValue = String(override.phone || user.profile?.phone || "");
  const position = String(override.position || user.profile?.position || "—");
  const note = String(override.note || "");
  const isAdminActor = String(authUser.role || "").toLowerCase() === "admin";
  const isAdminCard = String(user.role || "").toLowerCase() === "admin";
  const canEditCard = !isAdminCard || isAdminActor;
  const isEditing = Number(editingContactId) === Number(user.id);
  const relatedLeads = leads.filter((l) => String(l.email || "").toLowerCase() === String(user.email || "").toLowerCase() || String(l.phone || "") === String(user.profile?.phone || ""));
  const interactions = relatedLeads.reduce((acc, lead) => acc + (Array.isArray(lead.crm?.interactions) ? lead.crm.interactions.length : 0), 0);
  const historyRows = relatedLeads
    .flatMap((lead) =>
      (Array.isArray(lead.crm?.interactions) ? lead.crm.interactions : []).map((it) => ({
        leadId: lead.id,
        at: it.createdAt || lead.updatedAt || "",
        channel: it.channel || "interaction",
        message: it.message || "",
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);
  root.innerHTML = `
    <article class="crm-contact-card">
      <header class="crm-contact-card-head">
        <div>
          <h4>${esc(user.name || "—")} <span class="crm-inline-badge">#${esc(user.id)}</span></h4>
          <p class="crm-contact-card-sub">Роль: ${esc(roleLabel)}</p>
        </div>
        <div class="crm-contact-card-actions">
          <a class="crm-contact-card-icon" href="tel:${esc(user.profile?.phone || "")}" title="Позвонить" aria-label="Позвонить">📞</a>
          <a class="crm-contact-card-icon" href="mailto:${esc(user.email || "")}" title="Email" aria-label="Email">✉️</a>
          <button class="crm-contact-card-icon" type="button" title="Действия" aria-label="Действия">⋯</button>
        </div>
      </header>

      <section class="crm-contact-card-grid">
        <div class="crm-contact-card-item"><span>Email</span><strong>${
          isEditing ? `<input id="crm-contact-email-input" type="email" value="${esc(emailValue)}" />` : esc(emailValue || "—")
        }</strong></div>
        <div class="crm-contact-card-item"><span>Телефон</span><strong>${
          isEditing ? `<input id="crm-contact-phone-input" type="text" value="${esc(phoneValue)}" />` : esc(phoneValue || "—")
        }</strong></div>
        <div class="crm-contact-card-item"><span>Должность</span><strong>${
          isEditing ? `<input id="crm-contact-position-input" type="text" value="${esc(position)}" />` : esc(position)
        }</strong></div>
        <div class="crm-contact-card-item"><span>Комментарий</span><strong>${
          isEditing ? `<input id="crm-contact-note-input" type="text" value="${esc(note)}" />` : esc(note || "—")
        }</strong></div>
      </section>

      <div class="crm-toolbar" data-contact-profile-actions>
        ${
          canEditCard
            ? isEditing
              ? `<button class="crm-btn crm-btn-primary" type="button" data-contact-save="${esc(user.id)}">Сохранить</button>
                 <button class="crm-btn" type="button" data-contact-cancel="${esc(user.id)}">Отмена</button>`
              : `<button class="crm-btn" type="button" data-contact-edit="${esc(user.id)}">Редактировать карточку</button>`
            : `<span class="crm-inline-badge">Карточку администратора может менять только Администратор</span>`
        }
      </div>

      <div class="crm-contact-card-meta">
        <span>Связанные сделки: <strong>${relatedLeads.length}</strong></span>
        <span>История коммуникаций: <strong>${interactions}</strong></span>
      </div>
    </article>
    <p><strong>Последние коммуникации:</strong></p>
    ${
      historyRows.length
        ? historyRows
            .map(
              (r) => `<p>${esc(new Date(r.at || Date.now()).toLocaleString("ru-RU"))} · ${esc(r.channel)} · ${esc(r.message || "—")}
                <button class="crm-btn" type="button" data-open-related-lead="${esc(r.leadId)}">Открыть сделку #${esc(r.leadId)}</button></p>`
            )
            .join("")
        : `<p>История коммуникаций пока пустая.</p>`
    }
  `;
}

function renderIntegrationsMini() {
  const root = document.getElementById("crm-integrations-list");
  if (!root) return;
  root.innerHTML = integrations.length
    ? integrations
        .slice(0, 20)
        .map(
          (r) => `<article class="crm-mini-card crm-mini-card--integration"><strong><span class="crm-icon">${cardIcon("integration")}</span>${esc(
            r.title || "Интеграция"
          )}</strong><p>${esc(r.value || "—")}</p><p>${esc(r.meta || "—")}</p></article>`
        )
        .join("")
    : `<div class="crm-list-empty">Интеграции не подключены.</div>`;
}

function renderTasksList() {
  const root = document.getElementById("crm-tasks-list");
  if (!root) return;
  const archivePeriod = document.getElementById("crm-task-archive-period")?.value || "all";
  const now = Date.now();
  const periodMs =
    archivePeriod === "week" ? 7 * 24 * 3600 * 1000 : archivePeriod === "month" ? 30 * 24 * 3600 * 1000 : archivePeriod === "quarter" ? 90 * 24 * 3600 * 1000 : 0;
  const items = getFilteredTasks()
    .filter((t) => String(t.status || "todo") === "done")
    .filter((t) => {
      if (!periodMs) return true;
      const doneAt = new Date(String(t.completedAt || t.updatedAt || t.createdAt || "")).getTime();
      return Number.isFinite(doneAt) && now - doneAt <= periodMs;
    });
  const statusLabel = (status) => ({ todo: "В Работе", in_progress: "В процессе", done: "Завершена" }[status] || "В Работе");
  root.innerHTML = items.length
    ? `<table class="crm-warehouse-table">
        <thead><tr><th>ID</th><th>Задача</th><th>Исполнитель</th><th>Статус</th><th>Дата постановки</th><th>Дата выполнения</th><th>Дедлайн</th><th>Комментарий</th></tr></thead>
        <tbody>
          ${items
            .map((t) => {
              const deadline = String(t.value || "");
              const assignee = managers.find((m) => String(m.id) === String(t.assigneeId));
              return `<tr data-task-id="${esc(t.id)}">
                <td>${esc(t.id)}</td>
                <td>${esc(t.title || "Задача")}</td>
                <td>${esc(assignee?.name || "не назначен")}</td>
                <td>${esc(statusLabel(t.status || "todo"))}</td>
                <td>${esc(t.taskDate || String(t.createdAt || "").slice(0, 10) || "—")}</td>
                <td>${esc(String(t.completedAt || t.updatedAt || "").slice(0, 10) || "—")}</td>
                <td>${esc(deadline || "не указан")}</td>
                <td>${esc(t.comment || t.meta || "—")}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : `<div class="crm-list-empty">В архиве пока нет выполненных задач.</div>`;
}

function renderTaskBoard() {}

function renderDoneTasksList() {
  const root = document.getElementById("crm-tasks-done-list");
  if (!root) return;
  const doneRows = tasks
    .filter((t) => (t.status || "todo") === "done")
    .sort((a, b) => String(b.value || "").localeCompare(String(a.value || "")));
  root.innerHTML = doneRows.length
    ? `<div class="crm-task-ticket-list">
        ${doneRows
          .map((t) => {
            const assignee = managers.find((m) => String(m.id) === String(t.assigneeId));
            return `<article class="crm-task-ticket">
              <div class="crm-task-ticket-head"><strong>${esc(t.title || "Задача")}</strong><span class="crm-inline-badge">#${esc(t.id)}</span></div>
              <div class="crm-task-ticket-meta">
                <span>Исполнитель: ${esc(assignee?.name || "не назначен")}</span>
                <span>Статус: Завершена</span>
                <span>Срок: ${esc(t.value || "не указан")}</span>
                <span>SLA: Выполнено</span>
              </div>
            </article>`;
          })
          .join("")}
      </div>`
    : `<div class="crm-list-empty">Завершенных задач пока нет.</div>`;
}

function renderTaskPlainList() {
  const root = document.getElementById("crm-task-plain-list");
  if (!root) return;
  const isAdmin = String(authUser.role || "").toLowerCase() === "admin";
  const canComplete = (task) => {
    const myId = Number(authUser?.id);
    const assigneeId = Number(task?.assigneeId);
    return isAdmin || (Number.isFinite(myId) && Number.isFinite(assigneeId) && myId === assigneeId);
  };
  const q = (document.getElementById("crm-task-plain-search")?.value || "").trim().toLowerCase();
  const assigneeFilter = document.getElementById("crm-task-plain-assignee")?.value || "";
  const statusFilter = document.getElementById("crm-task-plain-status")?.value || "";
  const from = document.getElementById("crm-task-plain-date-from")?.value || "";
  const to = document.getElementById("crm-task-plain-date-to")?.value || "";
  const sortDeadline = document.getElementById("crm-task-plain-sort-deadline")?.value || "none";
  const rows = tasks
    .filter((t) => {
      const assignee = users.find((u) => String(u.id) === String(t.assigneeId)) || managers.find((m) => String(m.id) === String(t.assigneeId));
      if (q && !`${t.title || ""} ${t.comment || ""} ${t.meta || ""}`.toLowerCase().includes(q)) return false;
      if (assigneeFilter && String(t.assigneeId || "") !== String(assigneeFilter)) return false;
      if (statusFilter && String(t.status || "todo") !== statusFilter) return false;
      const dt = String(t.taskDate || t.createdAt || "").slice(0, 10);
      if (from && dt && dt < from) return false;
      if (to && dt && dt > to) return false;
      if ((from || to) && !dt) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortDeadline !== "none") {
        const da = String(a.value || "9999-12-31");
        const db = String(b.value || "9999-12-31");
        if (da !== db) return sortDeadline === "asc" ? da.localeCompare(db) : db.localeCompare(da);
      }
      return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
    });
  const statusLabel = (status) => ({ todo: "В Работе", in_progress: "В процессе", done: "Завершена" }[status] || "В Работе");
  const priorityLabel = (p) => ({ low: "Низкий", medium: "Средний", high: "Высокий" }[String(p || "").toLowerCase()] || "Средний");
  const roleLabel = (r) =>
    ({ manager: "Менеджер", accountant: "Бухгалтер", moderator: "Модератор", admin: "Администратор" }[String(r || "").toLowerCase()] || "—");
  const staff = [
    ...users.filter((u) => ["manager", "moderator", "accountant", "bookkeeper", "admin", "бухгалтер"].includes(String(u.role || "").toLowerCase())),
    ...managers,
  ].filter((v, idx, arr) => arr.findIndex((x) => String(x.id) === String(v.id)) === idx);
  const assigneeOptions = (selectedId) =>
    `<option value="">Не назначен</option>${staff.map((u) => `<option value="${esc(u.id)}"${String(u.id) === String(selectedId || "") ? " selected" : ""}>${esc(u.name || `#${u.id}`)}</option>`).join("")}`;
  const statusOptions = (selected) =>
    ["todo", "in_progress", "done"]
      .map((s) => `<option value="${s}"${String(s) === String(selected || "todo") ? " selected" : ""}>${statusLabel(s)}</option>`)
      .join("");
  const priorityOptions = (selected) =>
    ["low", "medium", "high"]
      .map((p) => `<option value="${p}"${String(p) === String(selected || "medium") ? " selected" : ""}>${priorityLabel(p)}</option>`)
      .join("");
  root.innerHTML = rows.length
    ? `<table class="crm-warehouse-table">
        <thead><tr><th>ID</th><th>Задача</th><th>Исполнитель</th><th>Дата</th><th>Дедлайн</th><th>Статус</th><th>Приоритет</th><th>Комментарий</th><th>Действия</th></tr></thead>
        <tbody>
          ${rows
            .map((t) => {
              const assignee = users.find((u) => String(u.id) === String(t.assigneeId)) || managers.find((m) => String(m.id) === String(t.assigneeId));
              const deadline = String(t.value || "");
              const overdue = deadline && String(t.status || "todo") !== "done" && new Date(`${deadline}T23:59:59`).getTime() < Date.now();
              const isEditing = isAdmin && Number(editingTaskPlainId) === Number(t.id);
              return `<tr data-task-plain-id="${esc(t.id)}">
                <td>${esc(t.id)}</td>
                <td>${isEditing ? `<input class="crm-task-edit-title" type="text" value="${esc(t.title || "")}" />` : esc(t.title || "Задача")}</td>
                <td>${isEditing ? `<select class="crm-task-edit-assignee">${assigneeOptions(t.assigneeId)}</select>` : esc(assignee?.name || "—")}</td>
                <td>${isEditing ? `<input class="crm-task-edit-date" type="date" value="${esc(t.taskDate || "")}" />` : esc(t.taskDate || "—")}</td>
                <td class="${overdue ? "crm-task-overdue-cell" : ""}">${isEditing ? `<input class="crm-task-edit-deadline" type="date" value="${esc(deadline || "")}" />` : esc(deadline || "—")}</td>
                <td class="${overdue ? "crm-task-overdue-cell" : ""}">${isEditing ? `<select class="crm-task-edit-status">${statusOptions(t.status)}</select>` : esc(statusLabel(t.status || "todo"))}</td>
                <td>${isEditing ? `<select class="crm-task-edit-priority">${priorityOptions(t.priority)}</select>` : esc(priorityLabel(t.priority || "medium"))}</td>
                <td>${isEditing ? `<input class="crm-task-edit-comment" type="text" value="${esc(t.comment || t.meta || "")}" />` : esc(t.comment || t.meta || "—")}</td>
                <td><div class="crm-toolbar">
                  ${
                    isEditing
                      ? `<button class="crm-btn" type="button" data-task-plain-save>Сохранить</button><button class="crm-btn" type="button" data-task-plain-cancel>Отмена</button>`
                      : `${String(t.status || "todo") !== "done" && canComplete(t) ? `<button class="crm-btn" type="button" data-task-plain-complete>Завершить</button>` : ""}${isAdmin ? `<button class="crm-btn" type="button" data-task-plain-edit>Редактировать</button>` : ""}<button class="crm-btn" type="button" data-task-plain-delete>Удалить</button>`
                  }
                </div></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : `<div class="crm-list-empty">Список задач пуст.</div>`;
}

function renderMarketingList() {
  const root = document.getElementById("crm-marketing-list");
  if (!root) return;
  root.innerHTML = campaigns.length
    ? campaigns
        .map(
          (c) => `<article class="crm-mini-card crm-mini-card--campaign"><strong><span class="crm-icon">${cardIcon("campaign")}</span>${esc(
            c.title || "Кампания"
          )}</strong><p>Бюджет: ${esc(c.value || "—")}</p><p>${esc(c.meta || "")}</p></article>`
        )
        .join("")
    : `<div class="crm-list-empty">Кампаний нет.</div>`;
}

function renderWarehouseList() {
  const root = document.getElementById("crm-warehouse-list");
  const stats = document.getElementById("crm-warehouse-stats");
  const historyRoot = document.getElementById("crm-warehouse-history");
  const movRoot = document.getElementById("crm-warehouse-movements");
  const warehouseFilter = (document.getElementById("crm-warehouse-filter")?.value || "").trim().toLowerCase();
  const categoryFilter = normalizeWarehouseCategory(document.getElementById("crm-warehouse-filter-category")?.value || "");
  const hasCategoryFilter = Boolean(document.getElementById("crm-warehouse-filter-category")?.value);
  const flowDateFrom = document.getElementById("crm-warehouse-flow-date-from")?.value || "";
  const flowDateTo = document.getElementById("crm-warehouse-flow-date-to")?.value || "";
  const sortMode = document.getElementById("crm-warehouse-sort")?.value || "name_asc";
  if (!root) return;
  const balanceMap = new Map();
  for (const mv of inventoryMovements) {
    const key = String(mv.title || "").trim().toLowerCase();
    if (!key) continue;
    const qty = Number(mv.value) || 0;
    const category = normalizeWarehouseCategory(mv.category);
    const containerType = category === "containers" ? String(mv.containerType || "") : "";
    const compoundKey = `${category}:${containerType}::${key}`;
    const prev = balanceMap.get(compoundKey) || {
      ...mv,
      balance: 0,
      incoming: 0,
      outgoing: 0,
      category,
      containerType,
      unit: warehouseUnitLabel(mv.unit),
    };
    prev.balance += qty;
    if (qty >= 0) prev.incoming += qty;
    else prev.outgoing += Math.abs(qty);
    prev.title = mv.title || prev.title;
    prev.category = category;
    prev.containerType = containerType || prev.containerType || "";
    prev.unit = warehouseUnitLabel(mv.unit || prev.unit);
    prev.lastDate = mv.meta || prev.lastDate || "";
    balanceMap.set(compoundKey, prev);
  }
  const cards = [...balanceMap.values()]
    .filter((r) => {
      if (hasCategoryFilter && normalizeWarehouseCategory(r.category) !== categoryFilter) return false;
      const rowDate = String(r.lastDate || "");
      if (flowDateFrom && rowDate && rowDate < flowDateFrom) return false;
      if (flowDateTo && rowDate && rowDate > flowDateTo) return false;
      if ((flowDateFrom || flowDateTo) && !rowDate) return false;
      if (!warehouseFilter) return true;
      return `${r.title || ""} ${r.category || ""}`.toLowerCase().includes(warehouseFilter);
    })
    .sort((a, b) => {
      if (sortMode === "name_desc") return String(b.title).localeCompare(String(a.title), "ru");
      if (sortMode === "qty_desc") return Number(b.balance || 0) - Number(a.balance || 0);
      if (sortMode === "qty_asc") return Number(a.balance || 0) - Number(b.balance || 0);
      if (sortMode === "date_desc") return String(b.lastDate || "").localeCompare(String(a.lastDate || ""));
      if (sortMode === "date_asc") return String(a.lastDate || "").localeCompare(String(b.lastDate || ""));
      return String(a.title).localeCompare(String(b.title), "ru");
    });
  warehouseFlowsSnapshot = cards;
  const totalItems = cards.length;
  const totalQty = cards.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
    const lowStock = cards.filter((r) => Number(r.balance) > 0 && Number(r.balance) <= 5).length;
    const outStock = cards.filter((r) => Number(r.balance) <= 0).length;
  if (stats) {
    stats.innerHTML = `
      <div class="crm-kpi-item"><strong>${totalItems}</strong><span>Позиции</span></div>
      <div class="crm-kpi-item"><strong>${totalQty}</strong><span>Остаток, ед.</span></div>
      <div class="crm-kpi-item"><strong>${lowStock}</strong><span>Низкий остаток</span></div>
      <div class="crm-kpi-item"><strong>${outStock}</strong><span>Нет в наличии</span></div>
    `;
  }
  if (!cards.length) {
    root.innerHTML = `<div class="crm-list-empty">Склад пока пуст.</div>`;
  } else {
    const order = ["components", "pigments", "lacquer", "containers", "solvents", "additives", "other"];
    const bySection = new Map(order.map((k) => [k, []]));
    for (const row of cards) {
      const cat = normalizeWarehouseCategory(row.category);
      if (!bySection.has(cat)) bySection.set(cat, []);
      bySection.get(cat).push(row);
    }
    root.innerHTML = [...bySection.entries()]
      .filter(([, rows]) => rows.length)
      .map(([cat, rows]) => {
        const body = rows
          .map((i) => {
            const key = `${normalizeWarehouseCategory(i.category)}:${String(i.containerType || "")}::${String(i.title || "").trim().toLowerCase()}`;
            const bal = Number(i.balance || 0);
            const statusText = bal <= 0 ? "Нет на складе" : bal <= 5 ? "Заканчивается" : "В наличии";
            const rowClass = bal <= 0 ? "crm-warehouse-row--out" : bal <= 5 ? "crm-warehouse-row--warn" : "";
            return `<tr class="${rowClass}">
              <td>${esc(warehouseCategoryFullLabel(i.category, i.containerType))}</td>
              <td>${esc(i.title || "Позиция")}</td>
              <td>${esc(Number(i.incoming || 0))}</td>
              <td>${esc(Number(i.outgoing || 0))}</td>
              <td>${esc(Number(i.balance || 0))}</td>
              <td>${esc(warehouseUnitLabel(i.unit))}</td>
              <td>${esc(i.lastDate || "—")}</td>
              <td><span class="crm-inline-badge">${esc(statusText)}</span></td>
              <td>
                <div class="crm-toolbar">
                  <button class="crm-btn" type="button" data-warehouse-edit="${esc(key)}">Корректировать</button>
                  <button class="crm-btn" type="button" data-warehouse-delete="${esc(key)}">Удалить</button>
                </div>
              </td>
            </tr>`;
          })
          .join("");
        return `<section class="crm-warehouse-section">
          <h4>${esc(warehouseCategoryLabel(cat))}</h4>
          <div class="crm-warehouse-table-wrap">
            <table class="crm-warehouse-table">
              <thead><tr>
                <th>Категория</th>
                <th><button class="crm-th-sort" type="button" data-warehouse-sort-col="name">Номенклатура</button></th>
                <th>Приход</th>
                <th>Уход</th>
                <th><button class="crm-th-sort" type="button" data-warehouse-sort-col="qty">Остаток</button></th>
                <th>Ед. изм.</th>
                <th><button class="crm-th-sort" type="button" data-warehouse-sort-col="date">Последнее движение</button></th>
                <th>Статус</th>
                <th>Действия</th>
              </tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </section>`;
      })
      .join("");
  }
  if (historyRoot) {
    const q = (document.getElementById("crm-warehouse-history-search")?.value || "").trim().toLowerCase();
    const selectedCat = normalizeWarehouseCategory(document.getElementById("crm-warehouse-history-category")?.value || "");
    const hasSelectedCat = Boolean(document.getElementById("crm-warehouse-history-category")?.value);
    const selectedDate = document.getElementById("crm-warehouse-history-date")?.value || "";
    const historySort = document.getElementById("crm-warehouse-history-sort")?.value || "category_asc";
    const historyRows = inventory
      .filter((r) => {
        const cat = normalizeWarehouseCategory(r.category);
        if (hasSelectedCat && cat !== selectedCat) return false;
        if (selectedDate && String(r.meta || "") !== selectedDate) return false;
        if (!q) return true;
        return `${r.title || ""} ${warehouseCategoryFullLabel(cat, r.containerType)} ${r.meta || ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => compareWarehouseRows(a, b, historySort))
      .slice(0, 250);
    historyRoot.innerHTML = historyRows.length
      ? `<table class="crm-warehouse-table">
          <thead><tr><th>Дата</th><th>Категория</th><th>Номенклатура</th><th>Операция</th><th>Количество</th><th>Ед. изм.</th></tr></thead>
          <tbody>
            ${(() => {
              let currentCat = "";
              return historyRows
                .map((r) => {
                  const catKey = normalizeWarehouseCategory(r.category);
                  const catName = warehouseCategoryFullLabel(catKey, r.containerType);
                  const section =
                    catName !== currentCat
                      ? ((currentCat = catName), `<tr class="crm-warehouse-cat-row"><td colspan="6">${esc(catName)}</td></tr>`)
                      : "";
                  const op = r.action === "out" ? "Списание" : "Поступление";
                  return `${section}<tr>
                    <td>${esc(r.meta || "—")}</td>
                    <td>${esc(catName)}</td>
                    <td>${esc(r.title || "Позиция")}</td>
                    <td>${esc(op)}</td>
                    <td>${esc(r.value || 0)}</td>
                    <td>${esc(warehouseUnitLabel(r.unit))}</td>
                  </tr>`;
                })
                .join("");
            })()}
          </tbody>
        </table>`
      : `<div class="crm-list-empty">История добавления пока пустая.</div>`;
  }
  if (movRoot) {
    const q = (document.getElementById("crm-warehouse-movements-search")?.value || "").trim().toLowerCase();
    const selectedCat = normalizeWarehouseCategory(document.getElementById("crm-warehouse-movements-category")?.value || "");
    const hasSelectedCat = Boolean(document.getElementById("crm-warehouse-movements-category")?.value);
    const selectedDate = document.getElementById("crm-warehouse-movements-date")?.value || "";
    const movementSort = document.getElementById("crm-warehouse-movements-sort")?.value || "category_asc";
    const movRows = inventoryMovements
      .filter((m) => {
        const mCat = normalizeWarehouseCategory(m.category);
        if (hasSelectedCat && mCat !== selectedCat) return false;
        if (selectedDate && String(m.meta || "") !== selectedDate) return false;
        if (!q) return true;
        return `${m.title || ""} ${warehouseCategoryFullLabel(mCat, m.containerType)} ${m.meta || ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => compareWarehouseRows(a, b, movementSort))
      .slice(0, 250);
    movRoot.innerHTML = movRows.length
      ? `<table class="crm-warehouse-table">
          <thead><tr><th>Дата</th><th>Категория</th><th>Номенклатура</th><th>Приход</th><th>Уход</th><th>Итог</th><th>Ед. изм.</th></tr></thead>
          <tbody>
            ${(() => {
              let currentCat = "";
              return movRows
                .map((m) => {
                  const catName = warehouseCategoryFullLabel(normalizeWarehouseCategory(m.category), m.containerType);
                  const section =
                    catName !== currentCat
                      ? ((currentCat = catName), `<tr class="crm-warehouse-cat-row"><td colspan="7">${esc(catName)}</td></tr>`)
                      : "";
                  return `${section}<tr>
                    <td>${esc(m.meta || "—")}</td>
                    <td>${esc(catName)}</td>
                    <td>${esc(m.title || "Позиция")}</td>
                    <td>${Number(m.value) > 0 ? esc(m.value || 0) : "0"}</td>
                    <td>${Number(m.value) < 0 ? esc(Math.abs(Number(m.value) || 0)) : "0"}</td>
                    <td>${Number(m.value) > 0 ? "+" : ""}${esc(m.value || 0)}</td>
                    <td>${esc(warehouseUnitLabel(m.unit))}</td>
                  </tr>`;
                })
                .join("");
            })()}
          </tbody>
        </table>`
      : `<div class="crm-list-empty">Журнал движений пуст.</div>`;
  }
}

function getCalendarFeed() {
  const manual = calendarEvents.map((e) => ({
    id: `event:${e.id}`,
    source: "event",
    rawId: e.id,
    title: e.title || "Событие",
    date: e.date || "",
    time: e.time || "",
    type: e.type || "other",
  }));
  const taskDeadlines = tasks
    .filter((t) => t.value)
    .map((t) => ({
      id: `task:${t.id}`,
      source: "task",
      rawId: t.id,
      title: `Дедлайн: ${t.title || "Задача"}`,
      date: t.value,
      time: "",
      type: "deadline",
      taskStatus: t.status || "todo",
    }));
  return [...manual, ...taskDeadlines];
}

function renderCalendarList() {
  const monthInput = document.getElementById("crm-calendar-month");
  const grid = document.getElementById("crm-calendar-grid");
  const dayList = document.getElementById("crm-calendar-day-list");
  const dateInput = document.getElementById("crm-calendar-date");
  if (!monthInput || !grid || !dayList) return;
  if (dateInput && !dateInput.value) dateInput.value = selectedCalendarDate;
  monthInput.value = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
  const feed = getCalendarFeed();
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const startShift = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - startShift);
  const today = formatDateLocal(new Date());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = formatDateLocal(d);
    const isOther = d.getMonth() !== calendarMonth.getMonth();
    const eventsCount = feed.filter((x) => x.date === ds).length;
    const cls = ["crm-calendar-cell", isOther ? "is-other-month" : "", ds === today ? "is-today" : "", ds === selectedCalendarDate ? "is-selected" : ""]
      .filter(Boolean)
      .join(" ");
    cells.push(
      `<article class="${cls}" data-calendar-day="${esc(ds)}"><strong>${esc(d.getDate())}</strong><p>${eventsCount ? `${eventsCount} событий` : "Нет событий"}</p></article>`
    );
  }
  grid.innerHTML = cells.join("");
  const byDay = feed
    .filter((x) => x.date === selectedCalendarDate)
    .sort((a, b) => `${a.time || ""}`.localeCompare(`${b.time || ""}`));
  if (!byDay.length) {
    dayList.innerHTML = `<div class="crm-list-empty">На ${esc(selectedCalendarDate)} событий нет.</div>`;
    return;
  }
  const groups = new Map();
  for (const row of byDay) {
    const key = row.time || "Без времени";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const nowDate = formatDateLocal(new Date());
  dayList.innerHTML = [...groups.entries()]
    .map(([timeKey, rows]) => {
      const cards = rows
        .map((row) => {
          const isOverdueDeadline =
            row.date < nowDate &&
            ((row.source === "task" && (row.taskStatus || "todo") !== "done") || (row.source === "event" && row.type === "deadline"));
          const cls = `crm-mini-card ${isOverdueDeadline ? "crm-mini-card--overdue" : ""}`;
          if (row.source === "task") {
            return `<article class="${cls}">
              <strong><span class="crm-icon">${cardIcon("deadline")}</span>${esc(row.title)}</strong>
              <p>Дата: ${esc(
              row.date
            )} · Статус: ${esc(
              row.taskStatus || "todo"
            )}</p>
              <p>Связано с задачей #${esc(row.rawId)}</p>
              <div class="crm-toolbar">
                <button class="crm-btn" type="button" data-open-task="${esc(row.rawId)}">ОТКРЫТЬ</button>
                <button class="crm-btn" type="button" data-ping-task="${esc(row.rawId)}">ПИНГ</button>
              </div>
            </article>`;
          }
          return `<article class="${cls}" data-calendar-id="${esc(row.rawId)}">
            <strong><span class="crm-icon">${cardIcon(row.type === "deadline" ? "deadline" : "event")}</span>${esc(row.title)}</strong>
            <p>Дата: ${esc(row.date)} ${row.time ? `· ${esc(row.time)}` : ""} · Тип: ${esc(row.type)}</p>
            <div class="crm-toolbar">
              <button class="crm-btn" type="button" data-calendar-edit="${esc(row.rawId)}">Редактировать</button>
              <button class="crm-btn" type="button" data-calendar-delete="${esc(row.rawId)}">Удалить</button>
            </div>
          </article>`;
        })
        .join("");
      return `<section class="crm-calendar-time-group"><h5>${esc(timeKey)}</h5><div class="crm-calendar-time-list">${cards}</div></section>`;
    })
    .join("");
}

function fillDealModalManagers() {
  const sel = document.getElementById("crm-deal-assignee");
  if (!sel) return;
  sel.innerHTML = `<option value="">Не назначен</option>${managers.map((m) => `<option value="${esc(m.id)}">${esc(m.name || `#${m.id}`)}</option>`).join("")}`;
}

function fillTaskAssignees() {
  const dateInput = document.getElementById("crm-task-date");
  if (dateInput) dateInput.value = formatDateLocal(new Date());
  const sel = document.getElementById("crm-task-assignee");
  const filter = document.getElementById("crm-task-filter-assignee");
  const targetRole = String(document.getElementById("crm-task-target-role")?.value || "").toLowerCase();
  const roleMap = { manager: ["manager"], accountant: ["accountant", "bookkeeper", "бухгалтер"], moderator: ["moderator"], admin: ["admin"] };
  const candidates = targetRole
    ? users.filter((u) => roleMap[targetRole]?.includes(String(u.role || "").toLowerCase()))
    : managers.slice();
  const assigneeOptions = `<option value="">Выбрать сотрудника</option>${candidates
    .map((u) => `<option value="${esc(u.id)}">${esc(u.name || `#${u.id}`)}</option>`)
    .join("")}`;
  const filterOptions = `<option value="">Все исполнители</option>${managers
    .map((m) => `<option value="${esc(m.id)}">${esc(m.name || `#${m.id}`)}</option>`)
    .join("")}`;
  if (sel) sel.innerHTML = assigneeOptions;
  if (filter) {
    const current = filter.value || "";
    filter.innerHTML = filterOptions;
    if (current) filter.value = current;
  }
  const plainFilter = document.getElementById("crm-task-plain-assignee");
  if (plainFilter) {
    const current = plainFilter.value || "";
    plainFilter.innerHTML = `<option value="">Все исполнители</option>${managers
      .map((m) => `<option value="${esc(m.id)}">${esc(m.name || `#${m.id}`)}</option>`)
      .join("")}`;
    if (current) plainFilter.value = current;
  }
  applySavedTaskFilters();
}

function getFilteredTasks() {
  const q = (document.getElementById("crm-task-search")?.value || "").trim().toLowerCase();
  const assigneeId = document.getElementById("crm-task-filter-assignee")?.value || "";
  const deadlineMode = document.getElementById("crm-task-filter-deadline")?.value || "all";
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekDate = new Date(todayDate);
  weekDate.setDate(weekDate.getDate() + 7);
  return tasks.filter((t) => {
    if (q && !`${t.title || ""} ${t.meta || ""}`.toLowerCase().includes(q)) return false;
    if (assigneeId && String(t.assigneeId || "") !== String(assigneeId)) return false;
    const deadline = String(t.value || "");
    if (deadlineMode === "all") return true;
    if (deadlineMode === "none") return !deadline;
    if (!deadline) return false;
    const d = new Date(`${deadline}T00:00:00`);
    if (deadlineMode === "today") return d.getTime() === todayDate.getTime();
    if (deadlineMode === "week") return d >= todayDate && d <= weekDate;
    if (deadlineMode === "overdue") return d < todayDate && (t.status || "todo") !== "done";
    return true;
  });
}

function openDealModal(id) {
  const lead = leads.find((x) => String(x.id) === String(id));
  if (!lead) return;
  fillDealModalManagers();
  document.getElementById("crm-deal-id").value = String(lead.id);
  document.getElementById("crm-deal-customer").value = lead.customerName || "";
  document.getElementById("crm-deal-phone").value = lead.phone || "";
  document.getElementById("crm-deal-email").value = lead.email || "";
  document.getElementById("crm-deal-status").value = lead.status || "new";
  document.getElementById("crm-deal-priority").value = lead.priority || "normal";
  document.getElementById("crm-deal-assignee").value = lead.crm?.assigneeId == null ? "" : String(lead.crm.assigneeId);
  document.getElementById("crm-deal-comment").value = lead.comment || "";
  const topicIn = document.getElementById("crm-deal-topic");
  if (topicIn) topicIn.value = lead.topic || "";
  document.getElementById("crm-deal-modal")?.showModal();
}

async function patchLead(id, payload) {
  await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

function bindDealCardsEvents() {
  const strip = document.getElementById("crm-deals-strip");
  if (!strip) return;
  strip.querySelectorAll(".crm-card[data-lead-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = String(card.getAttribute("data-lead-id"));
      selectedLeadId = id;
      if (expandedLeadIds.has(id)) expandedLeadIds.delete(id);
      else expandedLeadIds.add(id);
      renderDealsStrip();
      renderDealInfo();
      renderTimeline();
      renderSubtabContent();
    });
    card.addEventListener("dblclick", () => openDealModal(card.getAttribute("data-lead-id")));
    card.addEventListener("dragstart", () => {
      draggedLeadId = card.getAttribute("data-lead-id");
    });
  });
  const stageContainers = document.querySelectorAll(".crm-stage");
  stageContainers.forEach((stage) => {
    stage.addEventListener("dragover", (e) => e.preventDefault());
    stage.addEventListener("drop", async () => {
      const next = stage.getAttribute("data-stage");
      if (!draggedLeadId || !next) return;
      try {
        await patchLead(Number(draggedLeadId), { status: next });
        await loadAll();
        setStatus(`Сделка #${draggedLeadId} перемещена: ${statusLabel(next)}.`, true);
      } catch (err) {
        setStatus(err.message || "Ошибка перемещения", false);
      } finally {
        draggedLeadId = null;
      }
    });
  });
}

async function loadAll() {
  const [leadsData, usersData, managersData, integData, tasksData, calendarData, campaignsData, inventoryData, movementsData] = await Promise.all([
    api("/api/leads?status=all&sort=created_desc"),
    api("/api/users"),
    api("/api/users/managers"),
    api("/api/crm/modules/integrations").catch(() => ({ items: [] })),
    tasksModuleRequest("GET").catch(() => ({ items: readTasksFallback() })),
    calendarModuleRequest("GET").catch(() => ({ items: readCalendarFallback() })),
    api("/api/crm/modules/campaigns").catch(() => ({ items: [] })),
    api("/api/crm/modules/inventory").catch(() => ({ items: [] })),
    warehouseMovementsRequest("GET").catch(() => ({ items: readWarehouseMovementsFallback() })),
  ]);
  leads = Array.isArray(leadsData.items) ? leadsData.items : [];
  users = Array.isArray(usersData.items) ? usersData.items : [];
  managers = Array.isArray(managersData.items) ? managersData.items : [];
  integrations = Array.isArray(integData.items) ? integData.items : [];
  tasks = Array.isArray(tasksData.items) ? tasksData.items : [];
  calendarEvents = Array.isArray(calendarData.items) ? calendarData.items : [];
  campaigns = Array.isArray(campaignsData.items) ? campaignsData.items : [];
  inventory = Array.isArray(inventoryData.items) ? inventoryData.items : [];
  inventoryMovements = Array.isArray(movementsData.items) ? movementsData.items : [];
  if (!selectedLeadId && leads.length) selectedLeadId = String(leads[0].id);
  fillTaskAssignees();
  renderStages();
  renderDealsStrip();
  renderDealInfo();
  renderTimeline();
  renderContactsMini();
  renderIntegrationsMini();
  renderTasksList();
  renderTaskBoard();
  renderDoneTasksList();
  renderTaskPlainList();
  renderMarketingList();
  renderWarehouseList();
  renderCalendarList();
  renderSubtabContent();
}

document.getElementById("crm-logout-btn")?.addEventListener("click", () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
  window.location.href = "auth.html";
});

document.querySelector(".crm-left-menu")?.addEventListener("click", (e) => {
  const contactsSubBtn = e.target.closest(".crm-left-subitem[data-contacts-category]");
  if (contactsSubBtn) {
    openSection("contacts");
    openContactsCategory(contactsSubBtn.getAttribute("data-contacts-category"));
    return;
  }
  const subBtn = e.target.closest(".crm-left-subitem[data-warehouse-subsection]");
  if (subBtn) {
    openSection("warehouse");
    openWarehouseSubsection(subBtn.getAttribute("data-warehouse-subsection"));
    return;
  }
  const taskSubBtn = e.target.closest(".crm-left-subitem[data-task-subsection]");
  if (taskSubBtn) {
    openSection("tasks");
    openTaskSubsection(taskSubBtn.getAttribute("data-task-subsection"));
    return;
  }
  const btn = e.target.closest(".crm-left-item[data-section]");
  if (!btn) return;
  if (btn.getAttribute("data-section") === "warehouse" && btn.getAttribute("data-warehouse-toggle") === "true") {
    const group = document.getElementById("crm-warehouse-menu-group");
    if (group && currentSection !== "warehouse") group.classList.add("is-open");
  }
  if (btn.getAttribute("data-section") === "tasks" && btn.getAttribute("data-tasks-toggle") === "true") {
    const group = document.getElementById("crm-tasks-menu-group");
    if (group && currentSection !== "tasks") group.classList.add("is-open");
  }
  if (btn.getAttribute("data-section") === "contacts" && btn.getAttribute("data-contacts-toggle") === "true") {
    const group = document.getElementById("crm-contacts-menu-group");
    if (group && currentSection !== "contacts") group.classList.add("is-open");
  }
  openSection(btn.getAttribute("data-section"));
});
document.getElementById("crm-subtabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-subtab]");
  if (!btn) return;
  setActiveSubtab(btn.getAttribute("data-subtab"));
});

document.getElementById("crm-lead-search")?.addEventListener("input", () => renderDealsStrip());
document.getElementById("crm-leads-refresh")?.addEventListener("click", async () => {
  try {
    await loadAll();
    setStatus("Данные обновлены.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка обновления", false);
  }
});

document.getElementById("crm-open-editor")?.addEventListener("click", () => {
  if (selectedLeadId) openDealModal(selectedLeadId);
});

document.getElementById("crm-add-deal")?.addEventListener("click", async () => {
  const customerName = window.prompt("Имя клиента");
  if (!customerName) return;
  const phone = window.prompt("Телефон клиента");
  if (!phone) return;
  const email = window.prompt("Email (необязательно)") || "";
  try {
    await api("/api/leads", { method: "POST", body: JSON.stringify({ customerName, phone, email, customerType: "lead" }) });
    await loadAll();
  } catch (err) {
    setStatus(err.message || "Ошибка создания сделки", false);
  }
});

document.getElementById("crm-comm-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const channel = document.getElementById("crm-comm-channel")?.value || "email";
  const message = document.getElementById("crm-comm-message")?.value.trim() || "";
  const lead = currentLead();
  if (!lead || !message) return;
  try {
    await api(`/api/leads/${lead.id}/interactions`, {
      method: "POST",
      body: JSON.stringify({ channel, direction: "outbound", message }),
    });
    e.currentTarget.reset();
    await loadAll();
    setStatus("Активность сохранена в карточке сделки.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка сохранения активности", false);
  }
});

document.getElementById("crm-reply-lk-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lead = currentLead();
  const message = document.getElementById("crm-reply-lk-message")?.value.trim() || "";
  if (!lead || !message) return;
  try {
    await api(`/api/leads/${lead.id}/reply-to-client`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    e.currentTarget.reset();
    await loadAll();
    setStatus("Сообщение отправлено в личный кабинет и на email клиента.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка отправки в личный кабинет", false);
  }
});

document.getElementById("crm-task-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEl = document.getElementById("crm-task-form");
  const title = document.getElementById("crm-task-title")?.value.trim() || "";
  const targetRole = document.getElementById("crm-task-target-role")?.value || "manager";
  const assigneeId = document.getElementById("crm-task-assignee")?.value || "";
  const priority = document.getElementById("crm-task-priority")?.value || "medium";
  const taskDate = formatDateLocal(new Date());
  const deadline = document.getElementById("crm-task-deadline")?.value || "";
  const comment = document.getElementById("crm-task-comment")?.value.trim() || "";
  if (!title || !targetRole || !assigneeId) {
    setStatus("Заполните обязательные поля: роль и сотрудник.", false);
    return;
  }
  try {
    const res = await tasksModuleRequest("POST", null, {
      title,
      value: deadline,
      meta: comment || "task",
      status: "todo",
      priority,
      assigneeId: assigneeId ? Number(assigneeId) : null,
      targetRole,
      taskDate,
      comment,
    });
    currentTaskCategory = "all";
    currentTaskSubsection = "list";
    document.querySelectorAll("#crm-task-categories [data-task-category]").forEach((x) => {
      x.classList.toggle("is-active", x.getAttribute("data-task-category") === "all");
    });
    formEl?.reset();
    await loadAll();
    openSection("tasks");
    setStatus(res?.fallback ? "Задача сохранена локально (API недоступен)." : "Задача добавлена.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка сохранения задачи", false);
  }
});
document.getElementById("crm-tasks-list")?.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-task-id]");
  if (!row) return;
  const taskId = Number(row.getAttribute("data-task-id"));
  if (!Number.isFinite(taskId)) return;
  const task = tasks.find((t) => Number(t.id) === taskId);
  if (!task) return;
  const openBtn = e.target.closest("[data-task-open]");
  const completeBtn = e.target.closest("[data-task-complete]");
  const nextBtn = e.target.closest("[data-task-next]");
  const delBtn = e.target.closest("[data-task-delete]");
  if (openBtn) {
    if (expandedTaskIds.has(taskId)) expandedTaskIds.delete(taskId);
    else expandedTaskIds.add(taskId);
    renderTasksList();
    return;
  }
  try {
    if (completeBtn) {
      const myId = Number(authUser?.id);
      const isAdmin = String(authUser?.role || "").toLowerCase() === "admin";
      if (!isAdmin && Number(task.assigneeId || 0) !== myId) {
        setStatus("Только назначенный исполнитель может завершить задачу.", false);
        return;
      }
      await tasksModuleRequest("PATCH", taskId, { status: "done", completedAt: new Date().toISOString() });
      await loadAll();
      setStatus("Задача отмечена как завершенная.", true);
      return;
    }
    if (nextBtn) {
      const flow = ["todo", "in_progress", "done"];
      const current = flow.indexOf(task.status || "todo");
      const next = flow[(current + 1) % flow.length];
      await tasksModuleRequest("PATCH", taskId, { status: next, completedAt: next === "done" ? new Date().toISOString() : null });
    }
    if (delBtn) {
      await tasksModuleRequest("DELETE", taskId);
    }
    await loadAll();
  } catch (err) {
    setStatus(err.message || "Ошибка обновления задачи", false);
  }
});
document.getElementById("crm-task-board")?.addEventListener("click", async (e) => {
  const chip = e.target.closest("[data-task-drag]");
  if (!chip) return;
  const taskId = Number(chip.getAttribute("data-task-drag"));
  const task = tasks.find((t) => Number(t.id) === taskId);
  if (!task) return;
  selectedLeadId = selectedLeadId || (leads[0] ? String(leads[0].id) : null);
  setStatus(`Задача: ${task.title || "без названия"} · статус: ${task.status || "todo"}`, true);
});
["crm-task-search", "crm-task-filter-assignee", "crm-task-filter-deadline"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    writeTaskFilters();
    renderTasksList();
    renderTaskBoard();
    renderTaskPlainList();
  });
  document.getElementById(id)?.addEventListener("change", () => {
    writeTaskFilters();
    renderTasksList();
    renderTaskBoard();
    renderTaskPlainList();
  });
});
document.getElementById("crm-task-archive-period")?.addEventListener("change", () => renderTasksList());
["crm-task-plain-search", "crm-task-plain-assignee", "crm-task-plain-status", "crm-task-plain-date-from", "crm-task-plain-date-to", "crm-task-plain-sort-deadline"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => renderTaskPlainList());
  document.getElementById(id)?.addEventListener("change", () => renderTaskPlainList());
});
document.getElementById("crm-task-filters-reset")?.addEventListener("click", () => {
  clearTaskFilters();
  activeTaskPreset = "";
  renderTaskPresetBadge();
  renderTasksList();
  renderTaskBoard();
  renderTaskPlainList();
  setStatus("Фильтры задач сброшены.", true);
});
document.getElementById("crm-task-save-preset")?.addEventListener("click", () => {
  saveTaskPreset();
  setStatus("Пресет фильтров задач сохранен.", true);
});
document.getElementById("crm-task-delete-preset")?.addEventListener("click", () => {
  try {
    localStorage.removeItem(TASK_SAVED_PRESET_STORAGE_KEY);
    if (activeTaskPreset === "saved") {
      activeTaskPreset = "";
      renderTaskPresetBadge();
    }
    setStatus("Сохраненный пресет удален.", true);
  } catch {
    setStatus("Не удалось удалить сохраненный пресет.", false);
  }
});
document.getElementById("crm-task-preset")?.addEventListener("change", (e) => {
  const key = e.target?.value || "";
  if (!key) return;
  applyTaskPreset(key);
});

document.getElementById("crm-calendar-grid")?.addEventListener("click", (e) => {
  const cell = e.target.closest("[data-calendar-day]");
  if (!cell) return;
  selectedCalendarDate = cell.getAttribute("data-calendar-day") || selectedCalendarDate;
  const dateInput = document.getElementById("crm-calendar-date");
  if (dateInput) dateInput.value = selectedCalendarDate;
  const titleInput = document.getElementById("crm-calendar-title");
  titleInput?.focus();
  setCalendarStatus(`Выбран день ${selectedCalendarDate}. Введите событие и нажмите "Добавить событие".`, true);
  renderCalendarList();
});
document.getElementById("crm-calendar-prev")?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendarList();
});
document.getElementById("crm-calendar-next")?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendarList();
});
document.getElementById("crm-calendar-month")?.addEventListener("change", (e) => {
  const value = e.target?.value || "";
  if (!value) return;
  const [y, m] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return;
  calendarMonth = new Date(y, m - 1, 1);
  renderCalendarList();
});
document.getElementById("crm-calendar-today")?.addEventListener("click", () => {
  const now = new Date();
  calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  selectedCalendarDate = formatDateLocal(now);
  const dateInput = document.getElementById("crm-calendar-date");
  if (dateInput) dateInput.value = selectedCalendarDate;
  renderCalendarList();
});
document.getElementById("crm-calendar-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEl = document.getElementById("crm-calendar-form");
  const title = document.getElementById("crm-calendar-title")?.value.trim() || "";
  const date = document.getElementById("crm-calendar-date")?.value || "";
  const time = document.getElementById("crm-calendar-time")?.value || "";
  const type = document.getElementById("crm-calendar-type")?.value || "other";
  if (!title || !date) return;
  try {
    const res = await calendarModuleRequest("POST", null, { title, date, time, type });
    selectedCalendarDate = date;
    calendarMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
    formEl?.reset();
    await loadAll();
    openSection("calendar");
    setCalendarStatus(res?.fallback ? "Событие сохранено (локально, без API)." : "Событие успешно сохранено.", true);
  } catch (err) {
    setCalendarStatus(err.message || "Ошибка сохранения события", false);
  }
});
document.getElementById("crm-calendar-day-list")?.addEventListener("click", async (e) => {
  const openTaskBtn = e.target.closest("[data-open-task]");
  const pingTaskBtn = e.target.closest("[data-ping-task]");
  if (openTaskBtn) {
    openSection("tasks");
    setStatus(`Открыта задача #${openTaskBtn.getAttribute("data-open-task")}.`, true);
    return;
  }
  if (pingTaskBtn) {
    setStatus(`Пинг отправлен по задаче #${pingTaskBtn.getAttribute("data-ping-task")}.`, true);
    return;
  }
  const editBtn = e.target.closest("[data-calendar-edit]");
  const delBtn = e.target.closest("[data-calendar-delete]");
  const rawId = Number(editBtn?.getAttribute("data-calendar-edit") || delBtn?.getAttribute("data-calendar-delete"));
  if (!Number.isFinite(rawId)) return;
  const item = calendarEvents.find((x) => Number(x.id) === rawId);
  if (!item) return;
  try {
    if (editBtn) {
      const nextTitle = window.prompt("Название события", item.title || "");
      if (!nextTitle) return;
      const nextDate = window.prompt("Дата (YYYY-MM-DD)", item.date || selectedCalendarDate || "");
      if (!nextDate) return;
      const nextTime = window.prompt("Время (HH:MM, можно пусто)", item.time || "") || "";
      const res = await calendarModuleRequest("PATCH", rawId, { title: nextTitle.trim(), date: nextDate.trim(), time: nextTime.trim() });
      selectedCalendarDate = nextDate.trim();
      calendarMonth = new Date(Number(selectedCalendarDate.slice(0, 4)), Number(selectedCalendarDate.slice(5, 7)) - 1, 1);
      setCalendarStatus(res?.fallback ? "Событие обновлено (локально, без API)." : "Событие обновлено.", true);
    }
    if (delBtn) {
      const res = await calendarModuleRequest("DELETE", rawId);
      setCalendarStatus(res?.fallback ? "Событие удалено (локально, без API)." : "Событие удалено.", true);
    }
    await loadAll();
    openSection("calendar");
  } catch (err) {
    setCalendarStatus(err.message || "Ошибка операции с событием", false);
  }
});
document.getElementById("crm-calendar-sync")?.addEventListener("click", async () => {
  try {
    await syncCalendarFallbackToApi();
  } catch (err) {
    setCalendarStatus(err.message || "Синхронизация не выполнена. Проверьте доступность API.", false);
  }
});

document.getElementById("crm-marketing-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEl = document.getElementById("crm-marketing-form");
  const title = document.getElementById("crm-marketing-title")?.value.trim() || "";
  const budget = document.getElementById("crm-marketing-budget")?.value.trim() || "";
  if (!title) return;
  try {
    await api("/api/crm/modules/campaigns", { method: "POST", body: JSON.stringify({ title, value: budget, meta: "marketing" }) });
    formEl?.reset();
    await loadAll();
    openSection("marketing");
  } catch (err) {
    setStatus(err.message || "Ошибка сохранения кампании", false);
  }
});

document.getElementById("crm-warehouse-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEl = document.getElementById("crm-warehouse-form");
  const name = document.getElementById("crm-warehouse-name")?.value.trim() || "";
  const categoryRaw = String(document.getElementById("crm-warehouse-category")?.value || "");
  const [categoryPart, containerPart] = categoryRaw.split(":");
  const category = normalizeWarehouseCategory(categoryPart || "");
  const containerType = category === "containers" ? String(containerPart || "bucket") : "";
  const action = document.getElementById("crm-warehouse-action")?.value || "in";
  const qty = document.getElementById("crm-warehouse-qty")?.value || "0";
  const unit = warehouseUnitLabel(document.getElementById("crm-warehouse-unit")?.value || "pcs");
  const date = document.getElementById("crm-warehouse-date")?.value || "";
  if (!name) return;
  try {
    const signedQty = (action === "out" ? -1 : 1) * Math.abs(Number(qty || 0));
    const res = await warehouseMovementsRequest("POST", null, { title: name, category, containerType, value: signedQty, unit, meta: date });
    await api("/api/crm/modules/inventory", {
      method: "POST",
      body: JSON.stringify({ title: name, category, containerType, value: Math.abs(Number(qty || 0)), unit, action, meta: date }),
    }).catch(() => ({}));
    formEl?.reset();
    await loadAll();
    openSection("warehouse");
    setStatus(res?.fallback ? "Товар добавлен (локально, без API)." : "Товар добавлен на склад.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка сохранения склада", false);
  }
});

document.getElementById("crm-generate-report")?.addEventListener("click", () => {
  const header = ["id", "status", "customerName", "phone", "email", "assignee", "total", "updatedAt"];
  const rows = leads.map((l) => ({
    id: l.id,
    status: l.status || "",
    customerName: l.customerName || "",
    phone: l.phone || "",
    email: l.email || "",
    assignee: l.crm?.assigneeName || "",
    total: l.orderTotal || "",
    updatedAt: l.updatedAt || "",
  }));
  const csv = [header.join(","), ...rows.map((r) => header.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 400);
});
document.getElementById("crm-generate-report-side")?.addEventListener("click", () => {
  document.getElementById("crm-generate-report")?.click();
});

document.getElementById("crm-export-contacts")?.addEventListener("click", () => {
  const header = ["id", "name", "email", "phone", "company", "countryRegion", "role", "accountManagerId"];
  const rows = users.map((u) => ({
    id: u.id,
    name: u.name || "",
    email: u.email || "",
    phone: u.profile?.phone || "",
    company: u.profile?.companyName || "",
    countryRegion: u.profile?.countryRegion || "",
    role: u.role || "",
    accountManagerId: u.profile?.accountManagerId ?? "",
  }));
  const csv = [header.join(","), ...rows.map((r) => header.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 300);
});

document.getElementById("crm-contacts-search")?.addEventListener("input", () => renderContactsMini());
document.getElementById("crm-contacts-category")?.addEventListener("change", (e) => openContactsCategory(e.target?.value || "all"));
document.getElementById("crm-contacts-list")?.addEventListener("click", async (e) => {
  const wrap = e.target.closest("tr[data-user-id]");
  const openCard = e.target.closest("[data-open-contact]");
  const save = e.target.closest("[data-save-manager]");
  if (!wrap) return;
  const userId = Number(wrap.getAttribute("data-user-id"));
  if (openCard) {
    selectedContactId = userId;
    renderContactProfile();
    return;
  }
  if (!save) return;
  const managerId = wrap.querySelector(".crm-contact-manager")?.value || "";
  try {
    await api(`/api/users/${userId}/account-manager`, {
      method: "PATCH",
      body: JSON.stringify({ managerId: managerId ? Number(managerId) : null }),
    });
    await loadAll();
    setStatus("Личный менеджер клиента назначен.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка назначения менеджера", false);
  }
});
document.getElementById("crm-task-categories")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-task-category]");
  if (!btn) return;
  currentTaskCategory = btn.getAttribute("data-task-category") || "all";
  document.querySelectorAll("#crm-task-categories [data-task-category]").forEach((x) => {
    x.classList.toggle("is-active", x === btn);
  });
  renderTasksList();
});
document.getElementById("crm-task-submenu")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-task-subsection]");
  if (!btn) return;
  openTaskSubsection(btn.getAttribute("data-task-subsection"));
});
document.getElementById("crm-task-target-role")?.addEventListener("change", () => fillTaskAssignees());
document.getElementById("crm-task-target-role")?.addEventListener("change", () => {
  const dateInput = document.getElementById("crm-task-date");
  if (dateInput) dateInput.value = formatDateLocal(new Date());
});
document.getElementById("crm-task-sync-local")?.addEventListener("click", async () => {
  try {
    await syncTasksFallbackToApi();
  } catch (err) {
    setStatus(err.message || "Ошибка синхронизации локальных задач", false);
  }
});
document.getElementById("crm-task-plain-list")?.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-task-plain-id]");
  if (!row) return;
  const isAdmin = String(authUser.role || "").toLowerCase() === "admin";
  const taskId = Number(row.getAttribute("data-task-plain-id"));
  if (!Number.isFinite(taskId)) return;
  const task = tasks.find((t) => Number(t.id) === taskId);
  if (!task) return;
  const editBtn = e.target.closest("[data-task-plain-edit]");
  const saveBtn = e.target.closest("[data-task-plain-save]");
  const cancelBtn = e.target.closest("[data-task-plain-cancel]");
  const completeBtn = e.target.closest("[data-task-plain-complete]");
  const delBtn = e.target.closest("[data-task-plain-delete]");
  try {
    if (completeBtn) {
      const myId = Number(authUser?.id);
      const isAdmin = String(authUser?.role || "").toLowerCase() === "admin";
      if (!isAdmin && Number(task.assigneeId || 0) !== myId) {
        setStatus("Только назначенный исполнитель может завершить задачу.", false);
        return;
      }
      await tasksModuleRequest("PATCH", taskId, { status: "done", completedAt: new Date().toISOString() });
      await loadAll();
      setStatus("Задача отмечена как завершенная.", true);
      return;
    }
    if (editBtn) {
      if (!isAdmin) {
        setStatus("Редактирование доступно только Администратору.", false);
        return;
      }
      editingTaskPlainId = taskId;
      renderTaskPlainList();
      return;
    }
    if (cancelBtn) {
      editingTaskPlainId = null;
      renderTaskPlainList();
      return;
    }
    if (saveBtn) {
      if (!isAdmin) {
        setStatus("Сохранение доступно только Администратору.", false);
        return;
      }
      const title = row.querySelector(".crm-task-edit-title")?.value.trim() || "";
      const assigneeId = row.querySelector(".crm-task-edit-assignee")?.value || "";
      const taskDate = row.querySelector(".crm-task-edit-date")?.value || "";
      const deadline = row.querySelector(".crm-task-edit-deadline")?.value || "";
      const status = row.querySelector(".crm-task-edit-status")?.value || "todo";
      const priority = row.querySelector(".crm-task-edit-priority")?.value || "medium";
      const comment = row.querySelector(".crm-task-edit-comment")?.value.trim() || "";
      await tasksModuleRequest("PATCH", taskId, {
        title: title || task.title || "Задача",
        assigneeId: assigneeId ? Number(assigneeId) : null,
        taskDate,
        value: deadline,
        status,
        completedAt: status === "done" ? task.completedAt || new Date().toISOString() : null,
        priority,
        comment,
        meta: comment || "task",
      });
      editingTaskPlainId = null;
      await loadAll();
      setStatus("Задача обновлена.", true);
      return;
    }
    if (delBtn) {
      await tasksModuleRequest("DELETE", taskId);
      await loadAll();
      setStatus("Задача удалена.", true);
    }
  } catch (err) {
    setStatus(err.message || "Ошибка операции с задачей", false);
  }
});
document.getElementById("crm-contact-profile")?.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-contact-edit]");
  const saveBtn = e.target.closest("[data-contact-save]");
  const cancelBtn = e.target.closest("[data-contact-cancel]");
  if (editBtn) {
    const uid = Number(editBtn.getAttribute("data-contact-edit"));
    const target = users.find((u) => Number(u.id) === uid);
    const isAdminCard = String(target?.role || "").toLowerCase() === "admin";
    const isAdminActor = String(authUser.role || "").toLowerCase() === "admin";
    if (isAdminCard && !isAdminActor) {
      setStatus("Карточку Администратора может менять только Администратор.", false);
      return;
    }
    editingContactId = uid;
    renderContactProfile();
    return;
  }
  if (cancelBtn) {
    editingContactId = null;
    renderContactProfile();
    return;
  }
  if (saveBtn) {
    const uid = Number(saveBtn.getAttribute("data-contact-save"));
    const target = users.find((u) => Number(u.id) === uid);
    const isAdminCard = String(target?.role || "").toLowerCase() === "admin";
    const isAdminActor = String(authUser.role || "").toLowerCase() === "admin";
    if (isAdminCard && !isAdminActor) {
      setStatus("Карточку Администратора может менять только Администратор.", false);
      return;
    }
    const email = document.getElementById("crm-contact-email-input")?.value.trim() || "";
    const phone = document.getElementById("crm-contact-phone-input")?.value.trim() || "";
    const position = document.getElementById("crm-contact-position-input")?.value.trim() || "";
    const note = document.getElementById("crm-contact-note-input")?.value.trim() || "";
    const all = readContactCardOverrides();
    all[String(uid)] = { ...(all[String(uid)] || {}), email, phone, position, note };
    writeContactCardOverrides(all);
    editingContactId = null;
    renderContactProfile();
    setStatus("Карточка сотрудника обновлена.", true);
    return;
  }
  const btn = e.target.closest("[data-open-related-lead]");
  if (!btn) return;
  const leadId = btn.getAttribute("data-open-related-lead");
  if (!leadId) return;
  selectedLeadId = String(leadId);
  openSection("pipeline");
  renderDealsStrip();
  renderDealInfo();
  renderTimeline();
  renderSubtabContent();
});
document.getElementById("crm-dedupe-contacts")?.addEventListener("click", async () => {
  try {
    const data = await api("/api/crm/contacts/dedupe", { method: "POST" });
    await loadAll();
    setStatus(`Объединено дублей: ${Number(data.merged || 0)}.`, true);
  } catch (err) {
    setStatus(err.message || "Ошибка объединения дублей", false);
  }
});
document.getElementById("crm-warehouse-filter")?.addEventListener("input", () => renderWarehouseList());
document.getElementById("crm-warehouse-filter-category")?.addEventListener("change", () => renderWarehouseList());
document.getElementById("crm-warehouse-flow-date-from")?.addEventListener("change", () => renderWarehouseList());
document.getElementById("crm-warehouse-flow-date-to")?.addEventListener("change", () => renderWarehouseList());
document.getElementById("crm-warehouse-sort")?.addEventListener("change", () => renderWarehouseList());
document.getElementById("crm-warehouse-export-excel")?.addEventListener("click", () => exportWarehouseFlowsExcel());
document.getElementById("crm-warehouse-export-movements-excel")?.addEventListener("click", () => exportWarehouseMovementsExcel());
[
  "crm-warehouse-history-search",
  "crm-warehouse-history-category",
  "crm-warehouse-history-date",
  "crm-warehouse-history-sort",
  "crm-warehouse-movements-search",
  "crm-warehouse-movements-category",
  "crm-warehouse-movements-date",
  "crm-warehouse-movements-sort",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => renderWarehouseList());
  document.getElementById(id)?.addEventListener("change", () => renderWarehouseList());
});
document.getElementById("crm-warehouse-list")?.addEventListener("click", async (e) => {
  const sortBtn = e.target.closest("[data-warehouse-sort-col]");
  if (sortBtn) {
    const col = sortBtn.getAttribute("data-warehouse-sort-col");
    const select = document.getElementById("crm-warehouse-sort");
    if (select) {
      const cur = select.value || "name_asc";
      if (col === "name") select.value = cur === "name_asc" ? "name_desc" : "name_asc";
      if (col === "qty") select.value = cur === "qty_desc" ? "qty_asc" : "qty_desc";
      if (col === "date") select.value = cur === "date_desc" ? "date_asc" : "date_desc";
      renderWarehouseList();
      setStatus(`Сортировка: ${warehouseSortLabel(select.value)}`, true);
    }
    return;
  }
  const editBtn = e.target.closest("[data-warehouse-edit]");
  const delBtn = e.target.closest("[data-warehouse-delete]");
  const key = editBtn?.getAttribute("data-warehouse-edit") || delBtn?.getAttribute("data-warehouse-delete") || "";
  if (!key) return;
  const [catWithType, titlePart] = key.split("::");
  const [catPart, containerPart] = String(catWithType || "").split(":");
  const category = normalizeWarehouseCategory(catPart || "");
  const containerType = category === "containers" ? String(containerPart || "") : "";
  const normalizedTitle = String(titlePart || "").trim().toLowerCase();
  if (!normalizedTitle) return;
  const sample = inventoryMovements.find(
    (x) =>
      normalizeWarehouseCategory(x.category) === category &&
      String(x.containerType || "") === containerType &&
      String(x.title || "").trim().toLowerCase() === normalizedTitle
  );
  const title = sample?.title || normalizedTitle;
  try {
    if (editBtn) {
      const qtyRaw = window.prompt(`Корректировка остатка для "${title}". Введите число (+/-):`, "0");
      if (qtyRaw == null) return;
      const delta = Number(qtyRaw);
      if (!Number.isFinite(delta) || delta === 0) return;
      await warehouseMovementsRequest("POST", null, {
        title,
        value: delta,
        meta: new Date().toISOString().slice(0, 10),
        category,
        containerType,
      });
    }
    if (delBtn) {
      const ids = inventoryMovements
        .filter(
          (x) =>
            normalizeWarehouseCategory(x.category) === category &&
            String(x.containerType || "") === containerType &&
            String(x.title || "").trim().toLowerCase() === normalizedTitle
        )
        .map((x) => x.id);
      await Promise.all(ids.map((id) => warehouseMovementsRequest("DELETE", id)));
      const ids2 = inventory
        .filter(
          (x) =>
            normalizeWarehouseCategory(x.category) === category &&
            String(x.containerType || "") === containerType &&
            String(x.title || "").trim().toLowerCase() === normalizedTitle
        )
        .map((x) => x.id);
      await Promise.all(ids2.map((id) => api(`/api/crm/modules/inventory/${id}`, { method: "DELETE" })));
    }
    await loadAll();
  } catch (err) {
    setStatus(err.message || "Ошибка операции со складом", false);
  }
});

document.getElementById("crm-catalog-pack-photos-refresh")?.addEventListener("click", () => {
  void renderCrmCatalogPackPhotosBlock();
});

document.getElementById("crm-catalog-pack-photos-filter")?.addEventListener("input", () => {
  void renderCrmCatalogPackPhotosBlock();
});

document.getElementById("crm-catalog-pack-photos-root")?.addEventListener("click", (e) => {
  const addBtn = e.target.closest("button[data-crm-pack-photo-add]");
  const delBtn = e.target.closest("button[data-crm-pack-photo-del]");
  const cell = e.target.closest(".crm-pack-photo-cell");
  if (!cell) return;
  const pid = cell.getAttribute("data-product-id") || "";
  const pk = cell.getAttribute("data-pack-key") || "";
  if (!pid || !pk) return;
  if (addBtn) {
    e.preventDefault();
    crmPickAndPostPackPhoto(pid, pk);
  } else if (delBtn) {
    e.preventDefault();
    void crmDeletePackPhoto(pid, pk);
  }
});

document.getElementById("crm-gmail-connect")?.addEventListener("click", async () => {
  try {
    const data = await api("/api/integrations/gmail/oauth-url");
    if (!data.url) throw new Error("Не удалось получить OAuth URL");
    window.open(data.url, "_blank", "noopener,noreferrer");
  } catch (err) {
    setStatus(err.message || "Ошибка Gmail OAuth", false);
  }
});
document.getElementById("crm-binotel-test")?.addEventListener("click", async () => {
  try {
    const lead = currentLead();
    await fetch(apiUrl("/api/integrations/binotel/webhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: `test-${Date.now()}`,
        clientPhone: lead?.phone || "+380000000000",
        manager: authUser.name || authUser.email || "crm-user",
        result: "test webhook event",
        recordingUrl: "https://example.com/recording-test.mp3",
      }),
    });
    await loadAll();
    setStatus("Тестовый звонок Binotel записан.", true);
  } catch (err) {
    setStatus(err.message || "Ошибка Binotel теста", false);
  }
});

document.getElementById("crm-deal-form")?.addEventListener("submit", async (e) => {
  const action = e.submitter?.value || "cancel";
  if (action !== "save") return;
  e.preventDefault();
  const id = Number(document.getElementById("crm-deal-id").value);
  if (!Number.isFinite(id)) return;
  try {
    await patchLead(id, {
      customerName: document.getElementById("crm-deal-customer").value.trim(),
      phone: document.getElementById("crm-deal-phone").value.trim(),
      email: document.getElementById("crm-deal-email").value.trim(),
      topic: document.getElementById("crm-deal-topic")?.value.trim() || "",
      status: document.getElementById("crm-deal-status").value,
      priority: document.getElementById("crm-deal-priority").value,
      assigneeId: document.getElementById("crm-deal-assignee").value ? Number(document.getElementById("crm-deal-assignee").value) : null,
      comment: document.getElementById("crm-deal-comment").value.trim(),
    });
    document.getElementById("crm-deal-modal")?.close();
    await loadAll();
  } catch (err) {
    setStatus(err.message || "Ошибка сохранения сделки", false);
  }
});

(async () => {
  const hint = document.getElementById("crm-role-hint");
  if (hint) hint.textContent = `Роль: ${authUser.role || "unknown"}`;
  try {
    await loadAll();
    renderTaskPresetBadge();
    if (!applyCrmLocationHash()) {
      openSection("pipeline");
      setActiveSubtab("general");
    }
  } catch (err) {
    setStatus(err.message || "Ошибка инициализации CRM", false);
  }
})();

window.addEventListener("hashchange", () => {
  applyCrmLocationHash();
});
