const token = localStorage.getItem("authToken") || "";
if (!token) window.location.href = "auth.html";

let authUser = {};
try {
  authUser = JSON.parse(localStorage.getItem("authUser") || "{}");
} catch {
  authUser = {};
}

const CRM_ALLOWED_ROLES = new Set(["admin", "moderator", "accountant"]);
if (!CRM_ALLOWED_ROLES.has(String(authUser.role || "").toLowerCase())) {
  window.location.href = "account.html";
}

let crmCurrentPermissions = authUser.permissions && typeof authUser.permissions === "object" ? authUser.permissions : {};
function crmCan(permission) {
  return authUser.role === "admin" || Boolean(crmCurrentPermissions?.[permission]);
}

let canEditLeads = authUser.role === "admin" || crmCan("leads.edit") || authUser.role === "moderator";
let canExport = authUser.role === "admin" || crmCan("leads.export") || authUser.role === "accountant";
let isAdmin = authUser.role === "admin";
let canViewUsersDir = isAdmin || crmCan("users.view") || authUser.role === "moderator";
let canDeleteLeadNotes = isAdmin || crmCan("leads.deleteNotes");
let canManageUserRoles = isAdmin || crmCan("users.editRole");
let canAssignLeads = isAdmin || crmCan("leads.assign") || authUser.role === "moderator";

const hintEl = document.getElementById("crm-access-hint");
if (hintEl) {
  hintEl.textContent =
    authUser.role === "admin"
      ? "Администратор: заявки, экспорт CSV, управление пользователями и полные профили в боковом меню."
      : authUser.role === "moderator"
        ? "Модератор: заявки, раздел «Пользователи» — полные контакты и адреса (включая скрытые на сайте). Смена ролей только у администратора."
        : "Бухгалтер: просмотр заявок и экспорт CSV. Редактирование заявок недоступно.";
}

const exportBtn = document.getElementById("crm-export");
if (exportBtn && !canExport) exportBtn.classList.add("crm-panel-hidden");

const adminSidebar = document.getElementById("crm-sidebar-admin");
if (adminSidebar) {
  if (canViewUsersDir) adminSidebar.classList.remove("crm-panel-hidden");
  else adminSidebar.classList.add("crm-panel-hidden");
}

/** В iframe админки ссылки ведут в основное окно, а не внутрь фрейма. */
if (window.self !== window.top) {
  document.querySelectorAll(".crm-header a[href]").forEach((el) => {
    const h = el.getAttribute("href") || "";
    if (h === "#" || h.startsWith("javascript:")) return;
    el.setAttribute("target", "_top");
  });
}

if (isAdmin) {
  const end = document.querySelector(".crm-header .header-utility-links--end");
  if (end && !end.querySelector('a[href="admin.html"]')) {
    const a = document.createElement("a");
    a.href = "admin.html";
    a.textContent = "Админ-панель";
    a.setAttribute("target", "_top");
    const sep = document.createElement("span");
    sep.className = "header-utility-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "|";
    end.insertBefore(sep, end.firstChild);
    end.insertBefore(a, sep);
  }
  const embedNav = document.getElementById("crm-embed-toolbar-nav");
  if (document.documentElement.classList.contains("crm-embed-admin") && embedNav && !embedNav.querySelector('a[href="admin.html"]')) {
    const a = document.createElement("a");
    a.href = "admin.html#console";
    a.textContent = "Консоль панели";
    a.setAttribute("target", "_top");
    embedNav.appendChild(a);
  }
}

let managers = [];
let leadsCache = [];
let clientHistoryMap = new Map();
let usersCache = [];
let currentUserFilter = "all";
let currentView = "leads";
const expandedLeadIds = new Set();
const isSalesCrmPage = document.body.classList.contains("crm-sales-page");
const CRM_TOOLS_LABELS = {
  tasks: "Задачи сотрудников",
  inventory: "Склад и инвентаризация",
  documents: "Документы",
  dropshippers: "Партнеры-дропшипперы",
  campaigns: "Рекламные кампании",
  finance: "Финансовые операции",
  integrations: "Интеграции и API",
};
let crmToolsModule = "tasks";
let crmToolsCache = [];

const FILTER_LABELS = {
  all: "Все пользователи",
  admin: "Администраторы",
  moderator: "Модераторы",
  accountant: "Бухгалтеры",
  manager: "Менеджеры",
  client: "Клиенты",
  viewer: "Наблюдатели",
};

const USER_ROLE_OPTIONS = [
  ["admin", "Администратор"],
  ["manager", "Менеджер"],
  ["moderator", "Модератор"],
  ["accountant", "Бухгалтер"],
  ["client", "Клиент"],
  ["viewer", "Наблюдатель"],
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mediaUrlForCrm(p) {
  if (!p || typeof p !== "string") return "";
  if (p.startsWith("http")) return p;
  const base = window.DP_API_BASE || "";
  if (!base) return p;
  return `${base.replace(/\/+$/, "")}${p.startsWith("/") ? p : `/${p}`}`;
}

function genderRu(g) {
  const m = { male: "Мужской", female: "Женский", other: "Другое" };
  return m[g] || (g ? String(g) : "—");
}

function privacyBadge(on) {
  return on
    ? ` <span class="crm-privacy-badge" title="Скрыто от других пользователей на сайте">скрыто на сайте</span>`
    : "";
}

function userProfileBlock(u) {
  const p = u.profile || {};
  const flags = u.privacyFlags || p.privacy || {};
  const av = p.avatarUrl
    ? `<div class="crm-user-avatar"><img src="${escapeHtml(mediaUrlForCrm(p.avatarUrl))}" alt="" width="56" height="56" loading="lazy" /></div>`
    : "";
  return `
    <details class="crm-user-profile-details">
      <summary>Профиль и контакты (CRM)</summary>
      <div class="crm-user-profile-body">
        ${av}
        <ul class="crm-user-profile-list">
          <li>Возраст: ${escapeHtml(p.age != null && p.age !== "" ? String(p.age) : "—")}</li>
          <li>Пол: ${escapeHtml(genderRu(p.gender))}</li>
          <li>Регион / страна: ${escapeHtml(p.countryRegion || "—")}</li>
          <li>Компания: ${escapeHtml(p.companyName || "—")}</li>
          <li>Email: ${escapeHtml(u.email || "")}${privacyBadge(flags.hideEmail)}</li>
          <li>Телефон: ${escapeHtml(p.phone || "—")}${privacyBadge(flags.hidePhone)}</li>
          <li>Юр. адрес: ${escapeHtml(p.legalAddress || "—")}${privacyBadge(flags.hideLegalAddress)}</li>
          <li>Доставка: ${escapeHtml(p.deliveryAddress || "—")}${privacyBadge(flags.hideDeliveryAddress)}</li>
        </ul>
      </div>
    </details>
  `;
}

function roleOptionsHtml(selected) {
  return USER_ROLE_OPTIONS.map(
    ([val, label]) =>
      `<option value="${val}" ${val === selected ? "selected" : ""}>${label}</option>`
  ).join("");
}

function statusText(s) {
  return (
    {
      new: "Новая",
      in_progress: "В работе",
      quoted: "КП отправлено",
      won: "Успешно",
      lost: "Закрыто",
    }[s] || s || "Новая"
  );
}

function deliveryLabel(v) {
  const m = {
    nova_poshta: "Новая Почта",
    ukrposhta: "Укрпочта",
    meest: "Meest Express",
    autolux: "Автолюкс",
    pickup: "Самовывоз",
    courier: "Курьер",
    other: "Другое",
  };
  const s = String(v || "").trim();
  return m[s] || (s ? s : "—");
}

function paymentLabel(v) {
  const m = {
    liqpay: "LiqPay / карта",
    iban: "IBAN / счёт",
    card_demo: "Демо карта",
    cod: "Наложенный платёж",
    managers: "Согласовать с менеджером",
  };
  const s = String(v || "").trim();
  return m[s] || (s ? s : "—");
}

/** Заметки для отображения: массив + одно устаревшее поле managerNote, пока сервер не перенёс в managerNotes. */
function managerNotesForDisplay(lead) {
  const raw = Array.isArray(lead.crm?.managerNotes)
    ? lead.crm.managerNotes.filter((n) => n && String(n.text || "").trim())
    : [];
  const legacy = String(lead.crm?.managerNote || "").trim();
  if (raw.length === 0 && legacy) {
    return [
      {
        id: null,
        text: legacy,
        authorName: "Ранее",
        createdAt: lead.updatedAt || lead.createdAt,
      },
    ];
  }
  return raw;
}

function renderOneManagerNote(n, readOnly) {
  const who = escapeHtml(n.authorName || "Менеджер");
  const when = n.createdAt ? new Date(n.createdAt).toLocaleString("ru-RU") : "";
  let meta = `${who}${when ? ` · ${escapeHtml(when)}` : ""}`;
  if (n.editedAt) {
    meta += ` · изменено ${escapeHtml(new Date(n.editedAt).toLocaleString("ru-RU"))}`;
    if (n.editedByName) meta += ` (${escapeHtml(String(n.editedByName))})`;
  }
  const text = escapeHtml(String(n.text || ""));
  const hasId = n.id != null && String(n.id).length > 0;
  const actions =
    !readOnly && hasId && (canEditLeads || canDeleteLeadNotes)
      ? `<div class="crm-manager-comment-actions">
          ${canEditLeads ? `<button type="button" class="btn btn-ghost crm-note-edit-btn">Изменить</button>` : ""}
          ${canDeleteLeadNotes ? `<button type="button" class="btn btn-ghost crm-note-delete-btn">Удалить</button>` : ""}
        </div>`
      : "";
  const editPanel =
    !readOnly && hasId && canEditLeads
      ? `<div class="crm-note-edit-panel crm-panel-hidden">
          <textarea class="crm-note-edit-textarea" rows="3" aria-label="Редактирование заметки"></textarea>
          <div class="crm-note-edit-btns">
            <button type="button" class="btn btn-primary crm-note-save-btn">Сохранить</button>
            <button type="button" class="btn btn-ghost crm-note-cancel-btn">Отмена</button>
          </div>
        </div>`
      : "";

  return `<div class="crm-manager-comment"${
    hasId ? ` data-note-id="${escapeHtml(String(n.id))}"` : ""
  }>
    <div class="crm-manager-comment-head">
      <div class="crm-manager-comment-meta">${meta}</div>
      ${actions}
    </div>
    <div class="crm-note-view crm-manager-comment-text">${text}</div>
    ${editPanel}
  </div>`;
}

function renderManagerNotesSection(lead, readOnly) {
  const notes = managerNotesForDisplay(lead);
  const inner =
    notes.length === 0
      ? `<p class="crm-manager-notes-empty meta">Заметок менеджера пока нет.</p>`
      : `<div class="crm-manager-notes-thread">${notes.map((n) => renderOneManagerNote(n, readOnly)).join("")}</div>`;
  return `<section class="crm-manager-notes-section" aria-label="Заметки менеджера">
    <h4 class="crm-manager-notes-heading">Заметки менеджера</h4>
    <div class="crm-manager-notes-log">${inner}</div>
  </section>`;
}

function setMsg(msg, ok = true) {
  const el = document.getElementById("crm-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#15803d" : "#b91c1c";
}

function setUsersMsg(msg, ok = true) {
  const el = document.getElementById("crm-users-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#15803d" : "#b91c1c";
}

function setToolsMsg(msg, ok = true) {
  const el = document.getElementById("crm-tools-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
}

function crmToolApiPath(module, id = "") {
  const tail = id ? `/${encodeURIComponent(String(id))}` : "";
  return `/api/crm/modules/${encodeURIComponent(module)}${tail}`;
}

function renderCrmToolsTable() {
  const tbody = document.querySelector("#crm-tools-table tbody");
  if (!tbody) return;
  if (!crmToolsCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="meta">Нет записей в разделе "${escapeHtml(CRM_TOOLS_LABELS[crmToolsModule] || crmToolsModule)}".</td></tr>`;
    return;
  }
  const actions = canEditLeads;
  tbody.innerHTML = crmToolsCache
    .map(
      (row) => `<tr data-crm-tool-id="${escapeHtml(String(row.id))}">
        <td>${escapeHtml(String(row.id))}</td>
        <td>${escapeHtml(row.title || "—")}</td>
        <td>${escapeHtml(row.value == null ? "—" : String(row.value))}</td>
        <td>${escapeHtml(row.meta || "—")}</td>
        <td>${escapeHtml(row.updatedAt ? new Date(row.updatedAt).toLocaleString("ru-RU") : "—")}</td>
        <td>${actions ? `<span class="crm-tools-actions"><button type="button" class="btn btn-ghost crm-tool-edit">Изменить</button><button type="button" class="btn btn-ghost crm-tool-delete">Удалить</button></span>` : `<span class="meta">Только чтение</span>`}</td>
      </tr>`
    )
    .join("");
}

async function loadCrmToolModule(module = crmToolsModule) {
  const key = String(module || "tasks");
  crmToolsModule = key;
  document.querySelectorAll(".crm-tools-tab[data-crm-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-crm-tool") === key);
  });
  setToolsMsg(`Загрузка раздела "${CRM_TOOLS_LABELS[key] || key}"...`, true);
  try {
    const data = await api(crmToolApiPath(key));
    crmToolsCache = Array.isArray(data.items) ? data.items : [];
    renderCrmToolsTable();
    setToolsMsg(`Раздел "${CRM_TOOLS_LABELS[key] || key}": ${crmToolsCache.length} записей.`, true);
  } catch (e) {
    crmToolsCache = [];
    renderCrmToolsTable();
    setToolsMsg(e.message || "Ошибка загрузки раздела", false);
  }
}

function crmApiUrl(path) {
  return typeof window.dpApiUrl === "function" ? window.dpApiUrl(path) : path;
}

async function api(url, options = {}) {
  const fullUrl = url.startsWith("http") ? url : crmApiUrl(url);
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body != null) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed")) {
      throw new Error("Нет связи с API. Запустите npm start и откройте сайт через http://localhost:3000");
    }
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Ошибка API");
  return data;
}

async function loadCrmPermissions() {
  try {
    const data = await api("/api/auth/permissions");
    crmCurrentPermissions = data.permissions && typeof data.permissions === "object" ? data.permissions : {};
    authUser.permissions = crmCurrentPermissions;
    try {
      localStorage.setItem("authUser", JSON.stringify(authUser));
    } catch {
      /* ignore */
    }
  } catch {
    crmCurrentPermissions = {};
  }
  canEditLeads = crmCan("leads.edit");
  canExport = crmCan("leads.export");
  isAdmin = authUser.role === "admin";
  canViewUsersDir = crmCan("users.view");
  canDeleteLeadNotes = crmCan("leads.deleteNotes");
  canManageUserRoles = crmCan("users.editRole");
  canAssignLeads = crmCan("leads.assign");
  document.getElementById("crm-export")?.classList.toggle("crm-panel-hidden", !canExport);
  document.getElementById("crm-sidebar-admin")?.classList.toggle("crm-panel-hidden", !canViewUsersDir);
  const toolsForm = document.getElementById("crm-tools-form");
  if (toolsForm) {
    toolsForm.querySelectorAll("input,button").forEach((el) => {
      el.disabled = !canEditLeads;
    });
  }
}

function setLeadsView() {
  currentView = "leads";
  document.getElementById("crm-view-leads")?.classList.remove("crm-panel-hidden");
  document.getElementById("crm-view-users")?.classList.add("crm-panel-hidden");
  document.getElementById("crm-leads-filter-block")?.classList.remove("crm-panel-hidden");
  const title = document.getElementById("crm-workspace-title");
  if (title) title.textContent = "Заявки";
  document.getElementById("crm-nav-leads")?.classList.add("is-active");
  document.querySelectorAll(".crm-sb-sub").forEach((el) => el.classList.remove("is-active"));
  setUsersMsg("");
}

function setUsersView(roleFilter) {
  if (!canViewUsersDir) return;
  currentView = "users";
  currentUserFilter = roleFilter || "all";
  document.getElementById("crm-view-leads")?.classList.add("crm-panel-hidden");
  document.getElementById("crm-view-users")?.classList.remove("crm-panel-hidden");
  document.getElementById("crm-leads-filter-block")?.classList.add("crm-panel-hidden");
  const title = document.getElementById("crm-workspace-title");
  if (title) title.textContent = isAdmin ? "Администрирование пользователей" : "Пользователи и профили";
  document.getElementById("crm-nav-leads")?.classList.remove("is-active");
  document.querySelectorAll(".crm-sb-sub").forEach((el) => {
    el.classList.remove("is-active");
    const all = el.dataset.userFilter === "all";
    const r = el.dataset.userFilterRole;
    if (all && currentUserFilter === "all") el.classList.add("is-active");
    if (r && r === currentUserFilter) el.classList.add("is-active");
  });
  const label = document.getElementById("crm-users-filter-label");
  if (label) label.textContent = FILTER_LABELS[currentUserFilter] || FILTER_LABELS.all;
  renderUsersList();
}

function bindSidebarNav() {
  document.getElementById("crm-nav-leads")?.addEventListener("click", () => setLeadsView());
  document.querySelector(".crm-sidebar-nav")?.addEventListener("click", (e) => {
    const subAll = e.target.closest("[data-user-filter]");
    if (subAll) {
      e.preventDefault();
      setUsersView("all");
      return;
    }
    const subRole = e.target.closest("[data-user-filter-role]");
    if (subRole) {
      e.preventDefault();
      setUsersView(subRole.getAttribute("data-user-filter-role") || "all");
    }
  });
}

function renderLeadOrderSection(lead) {
  const snap = Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot : [];
  const total = lead.orderTotal;
  const hasSnap = snap.length > 0;
  const hasTotal = total != null && total !== "" && Number.isFinite(Number(total));
  if (!hasSnap && !hasTotal && (!Array.isArray(lead.cart) || !lead.cart.length)) return "";

  let body = "";
  if (hasSnap) {
    body += `<ul class="crm-order-lines">${snap
      .map(
        (r) => `
      <li class="crm-order-line">
        <strong>${escapeHtml(r.title)}</strong>
        <div>${escapeHtml(r.details || "")}</div>
        ${
          r.lineTotal != null && r.lineTotal !== ""
            ? `<div class="crm-order-line-sum">${escapeHtml(String(r.lineTotal))} грн</div>`
            : ""
        }
      </li>`
      )
      .join("")}</ul>`;
  }
  if (hasTotal) {
    body += `<p class="crm-order-total"><strong>Итого по расчёту клиента:</strong> ${escapeHtml(String(total))} грн</p>`;
  }
  if (!body && Array.isArray(lead.cart) && lead.cart.length) {
    body = `<p class="meta">Корзина: ${lead.cart.length} поз. (детальный расчёт не передавался)</p>`;
  }
  if (!body) return "";
  const srcLine =
    lead.source === "payment_page"
      ? `<p class="meta"><strong>Источник:</strong> страница оплаты</p>`
      : "";
  const payNote =
    lead.paymentNote && String(lead.paymentNote).trim()
      ? `<p class="meta"><strong>Оплата (прим.):</strong> ${escapeHtml(lead.paymentNote)}</p>`
      : "";
  const shipCity =
    lead.deliveryCity && String(lead.deliveryCity).trim()
      ? `<p class="meta"><strong>Город / НП:</strong> ${escapeHtml(String(lead.deliveryCity).trim())}</p>`
      : "";
  const shipPoint =
    lead.deliveryPoint && String(lead.deliveryPoint).trim()
      ? `<p class="meta"><strong>Отделение / адрес:</strong> ${escapeHtml(String(lead.deliveryPoint).trim())}</p>`
      : "";
  const del = lead.deliveryMethod
    ? `<p class="meta"><strong>Доставка:</strong> ${escapeHtml(deliveryLabel(lead.deliveryMethod))} <code class="crm-code">${escapeHtml(
        String(lead.deliveryMethod)
      )}</code></p>`
    : "";
  const payPref = lead.paymentMethod
    ? `<p class="meta"><strong>Способ оплаты (заявка):</strong> ${escapeHtml(paymentLabel(lead.paymentMethod))} <code class="crm-code">${escapeHtml(
        String(lead.paymentMethod)
      )}</code></p>`
    : "";
  const liq = lead.crm?.payment
    ? `<p class="meta"><strong>Платёж (CRM):</strong> ${escapeHtml(lead.crm.payment.provider || "")} · ${escapeHtml(
        String(lead.crm.payment.status || "")
      )} ${lead.crm.payment.paidAt ? " · " + escapeHtml(lead.crm.payment.paidAt) : ""}</p>`
    : "";
  return `<section class="crm-order-block" aria-label="Заказ с сайта"><h4 class="crm-order-heading">Заказ / логистика / оплата</h4>${srcLine}<p class="meta"><strong>Источник (source):</strong> ${escapeHtml(
    lead.source || "—"
  )}</p>${shipCity}${shipPoint}${del}${payPref}${liq}${payNote}${body}</section>`;
}

function leadItemsCount(lead) {
  if (Array.isArray(lead.cartSnapshot) && lead.cartSnapshot.length) return lead.cartSnapshot.length;
  if (Array.isArray(lead.cart) && lead.cart.length) return lead.cart.length;
  return 0;
}

function moneyLabel(value) {
  return value != null && value !== "" && Number.isFinite(Number(value)) ? `${escapeHtml(String(value))} грн` : "—";
}

function priorityText(v) {
  return v === "high" ? "Высокий" : "Обычный";
}

function leadAssigneeName(lead) {
  return lead.crm?.assigneeName || "Не назначен";
}

function leadDateLabel(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function leadDateObj(lead) {
  const d = new Date(lead.createdAt || lead.updatedAt || "");
  return Number.isFinite(d.getTime()) ? d : new Date(0);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d) {
  return d.toLocaleString("ru-RU", { month: "long", year: "numeric" });
}

function weekStartDate(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekKey(d) {
  const ws = weekStartDate(d);
  return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, "0")}-${String(ws.getDate()).padStart(2, "0")}`;
}

function shortDate(d) {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function weekLabel(d) {
  const start = weekStartDate(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${shortDate(start)} — ${shortDate(end)}`;
}

function clientHistoryKey(lead) {
  const phone = String(lead.phone || "").replace(/\D/g, "");
  if (phone.length >= 7) return `phone:${phone}`;
  const email = String(lead.email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(lead.customerName || "").trim().toLowerCase().replace(/\s+/g, " ");
  return name ? `name:${name}` : `lead:${lead.id}`;
}

function clientHistoryForLead(lead) {
  const key = clientHistoryKey(lead);
  return clientHistoryMap.get(key) || [lead];
}

function buildClientHistoryIndex(items) {
  const map = new Map();
  for (const lead of items) {
    const key = clientHistoryKey(lead);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(lead);
  }
  for (const list of map.values()) {
    list.sort((a, b) => leadDateObj(b) - leadDateObj(a));
  }
  clientHistoryMap = map;
}

function renderClientHistorySection(lead) {
  const history = clientHistoryForLead(lead);
  if (history.length <= 1) return "";
  return `<section class="crm-client-history" aria-label="История заказов клиента">
    <h4>История заказов клиента (${history.length})</h4>
    <div class="crm-client-history-list">
      ${history
        .map(
          (h) => `<button type="button" class="crm-client-history-item" data-crm-open-lead="${escapeHtml(String(h.id))}">
            <span>#${escapeHtml(String(h.id))}</span>
            <strong>${moneyLabel(h.orderTotal)}</strong>
            <em>${escapeHtml(statusText(h.status))}</em>
            <small>${escapeHtml(leadDateLabel(h.createdAt))}</small>
          </button>`
        )
        .join("")}
    </div>
  </section>`;
}

function leadCard(lead, readOnly) {
  const leadKey = String(lead.id);
  const open = expandedLeadIds.has(leadKey);
  const created = leadDateLabel(lead.createdAt);
  const updated = leadDateLabel(lead.updatedAt);
  const itemCount = leadItemsCount(lead);
  const historyCount = clientHistoryForLead(lead).length;
  const assigneeOptions = managers
    .map((m) => `<option value="${m.id}" ${lead.crm?.assigneeId === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
    .join("");
  const actionsBlock = readOnly
    ? `<p class="crm-readonly-hint">Только просмотр</p>`
    : `<div class="crm-actions">
        <div class="crm-actions-grid">
          <label class="crm-action-field">Статус
            <select class="crm-status-select">
              <option value="new" ${lead.status === "new" ? "selected" : ""}>Новая</option>
              <option value="in_progress" ${lead.status === "in_progress" ? "selected" : ""}>В работе</option>
              <option value="quoted" ${lead.status === "quoted" ? "selected" : ""}>КП отправлено</option>
              <option value="won" ${lead.status === "won" ? "selected" : ""}>Успешно</option>
              <option value="lost" ${lead.status === "lost" ? "selected" : ""}>Закрыто</option>
            </select>
          </label>
          <label class="crm-action-field">Приоритет
            <select class="crm-priority-select">
              <option value="normal" ${lead.priority === "normal" ? "selected" : ""}>Обычный</option>
              <option value="high" ${lead.priority === "high" ? "selected" : ""}>Высокий</option>
            </select>
          </label>
          <label class="crm-action-field">Ответственный
            <select class="crm-assignee-select" ${canAssignLeads ? "" : "disabled"}>
              <option value="">Не назначен</option>
              ${assigneeOptions}
            </select>
          </label>
        </div>
        <label class="crm-note-label">Новая заметка
          <textarea class="crm-note-textarea" rows="3" placeholder="Ввести заметку"></textarea>
        </label>
        <button class="btn btn-primary crm-save-btn" type="button">Сохранить изменения</button>
      </div>`;
  const route = [lead.deliveryCity, lead.deliveryPoint].filter((x) => x && String(x).trim()).join(" — ");
  return `
    <article class="crm-card crm-lead-card${open ? " is-expanded" : ""}" data-id="${escapeHtml(leadKey)}">
      <button type="button" class="crm-lead-row" aria-expanded="${open ? "true" : "false"}" aria-controls="crm-lead-details-${escapeHtml(leadKey)}">
        <span class="crm-lead-id">#${escapeHtml(leadKey)}</span>
        <span class="crm-lead-main">
          <strong>${escapeHtml(lead.customerName || "Без имени")}</strong>
          <small>${escapeHtml(lead.phone || "—")}${lead.email ? ` · ${escapeHtml(lead.email)}` : ""}</small>
        </span>
        <span class="crm-lead-route">${escapeHtml(route || deliveryLabel(lead.deliveryMethod))}</span>
        <span class="crm-lead-money">${moneyLabel(lead.orderTotal)}</span>
        <span class="crm-lead-chip crm-lead-chip--status crm-status-${escapeHtml(lead.status || "new")}">${escapeHtml(statusText(lead.status))}</span>
        <span class="crm-lead-chip${lead.priority === "high" ? " crm-lead-chip--hot" : ""}">${escapeHtml(priorityText(lead.priority))}</span>
        ${historyCount > 1 ? `<span class="crm-lead-chip crm-lead-chip--history">История: ${historyCount}</span>` : ""}
        <span class="crm-lead-assignee">${escapeHtml(leadAssigneeName(lead))}</span>
        <span class="crm-lead-date">${escapeHtml(created)}</span>
        <span class="crm-lead-toggle" aria-hidden="true">${open ? "Свернуть" : "Открыть"}</span>
      </button>
      <div class="crm-lead-details${open ? "" : " crm-panel-hidden"}" id="crm-lead-details-${escapeHtml(leadKey)}">
        <div class="crm-lead-detail-grid">
          <section class="crm-detail-panel">
            <h4>Клиент</h4>
            <p><strong>Имя:</strong> ${escapeHtml(lead.customerName || "—")}</p>
            <p><strong>Телефон:</strong> ${escapeHtml(lead.phone || "—")}</p>
            <p><strong>Email:</strong> ${escapeHtml(lead.email || "—")}</p>
            <p><strong>Тип клиента:</strong> ${escapeHtml(lead.customerType || "retail")}</p>
            <p><strong>Комментарий:</strong> ${escapeHtml(lead.comment || "—")}</p>
          </section>
          <section class="crm-detail-panel">
            <h4>CRM</h4>
            <p><strong>Ответственный:</strong> ${escapeHtml(leadAssigneeName(lead))}</p>
            <p><strong>Статус:</strong> ${escapeHtml(statusText(lead.status))}</p>
            <p><strong>Приоритет:</strong> ${escapeHtml(priorityText(lead.priority))}</p>
            <p><strong>Создано:</strong> ${escapeHtml(created)}</p>
            <p><strong>Обновлено:</strong> ${escapeHtml(updated)}</p>
          </section>
          <section class="crm-detail-panel">
            <h4>Заказ кратко</h4>
            <p><strong>Позиций:</strong> ${itemCount}</p>
            <p><strong>Сумма:</strong> ${moneyLabel(lead.orderTotal)}</p>
            <p><strong>Доставка:</strong> ${escapeHtml(deliveryLabel(lead.deliveryMethod))}</p>
            <p><strong>Оплата:</strong> ${escapeHtml(paymentLabel(lead.paymentMethod))}</p>
            <p><strong>Источник:</strong> ${escapeHtml(lead.source || "—")}</p>
          </section>
        </div>
        ${renderClientHistorySection(lead)}
        ${renderLeadOrderSection(lead)}
        ${renderManagerNotesSection(lead, readOnly)}
        ${actionsBlock}
      </div>
    </article>
  `;
}

function buildLeadsQuery() {
  const status = document.getElementById("crm-filter-status")?.value || "all";
  const priority = document.getElementById("crm-filter-priority")?.value || "all";
  const assigneeId = document.getElementById("crm-filter-assignee")?.value || "all";
  const sort = document.getElementById("crm-sort")?.value || "created_desc";
  const delivery = document.getElementById("crm-filter-delivery")?.value || "all";
  const payment = document.getElementById("crm-filter-payment")?.value || "all";
  const q = document.getElementById("crm-search")?.value?.trim() || "";
  const p = new URLSearchParams();
  p.set("status", status);
  p.set("priority", priority);
  p.set("assigneeId", assigneeId);
  p.set("sort", sort);
  p.set("delivery", delivery);
  p.set("payment", payment);
  p.set("q", q);
  return p.toString();
}

function selectLabel(id) {
  const el = document.getElementById(id);
  if (!el || !el.options || el.selectedIndex < 0) return "";
  return el.options[el.selectedIndex]?.textContent?.trim() || "";
}

function activeFilterChips() {
  const chips = [];
  const map = [
    ["crm-filter-status", "Статус"],
    ["crm-filter-assignee", "Менеджер"],
    ["crm-filter-priority", "Приоритет"],
    ["crm-filter-delivery", "Доставка"],
    ["crm-filter-payment", "Оплата"],
  ];
  for (const [id, label] of map) {
    const el = document.getElementById(id);
    if (el && el.value && el.value !== "all") chips.push(`${label}: ${selectLabel(id)}`);
  }
  const q = document.getElementById("crm-search")?.value?.trim() || "";
  if (q) chips.push(`Поиск: ${q}`);
  return chips;
}

function renderLeadsSummary(summary, count) {
  const sumEl = document.getElementById("crm-lead-summary");
  if (!sumEl || !summary) return;
  const filters = activeFilterChips();
  sumEl.innerHTML = `
    <span class="crm-summary-chip">В базе: <strong>${Number(summary.total || 0)}</strong></span>
    <span class="crm-summary-chip">Новые: <strong>${Number(summary.new || 0)}</strong></span>
    <span class="crm-summary-chip">В работе: <strong>${Number(summary.in_progress || 0)}</strong></span>
    <span class="crm-summary-chip">КП: <strong>${Number(summary.quoted || 0)}</strong></span>
    <span class="crm-summary-chip">Успех: <strong>${Number(summary.won || 0)}</strong></span>
    <span class="crm-summary-chip">Закрыто: <strong>${Number(summary.lost || 0)}</strong></span>
    <span class="crm-summary-chip crm-summary-chip--list">В списке: <strong>${Number(count || 0)}</strong></span>
    ${
      filters.length
        ? `<span class="crm-summary-filters">Активно: ${filters.map((f) => `<em>${escapeHtml(f)}</em>`).join("")}</span>`
        : ""
    }
  `;
}

function renderGroupedLeads(items, readOnly) {
  if (!items.length) return "<p class='meta'>Заявок пока нет.</p>";
  const months = new Map();
  for (const lead of items) {
    const d = leadDateObj(lead);
    const mk = monthKey(d);
    if (!months.has(mk)) months.set(mk, { date: d, items: [] });
    months.get(mk).items.push(lead);
  }
  return [...months.entries()]
    .sort((a, b) => b[1].date - a[1].date)
    .map(([mk, month]) => {
      const weeks = new Map();
      for (const lead of month.items) {
        const d = leadDateObj(lead);
        const wk = weekKey(d);
        if (!weeks.has(wk)) weeks.set(wk, { date: weekStartDate(d), items: [] });
        weeks.get(wk).items.push(lead);
      }
      const latestMonth = mk === monthKey(leadDateObj(items[0]));
      return `<details class="crm-time-group crm-time-group--month" ${latestMonth ? "open" : ""}>
        <summary class="crm-time-summary crm-time-summary--month">
          <span>${escapeHtml(monthLabel(month.date))}</span>
          <strong>${month.items.length} заявок</strong>
        </summary>
        <div class="crm-time-group-body">
          ${[...weeks.entries()]
            .sort((a, b) => b[1].date - a[1].date)
            .map(
              ([wk, week], idx) => `<details class="crm-time-group crm-time-group--week" ${latestMonth && idx === 0 ? "open" : ""}>
                <summary class="crm-time-summary crm-time-summary--week">
                  <span>Неделя ${escapeHtml(weekLabel(week.date))}</span>
                  <strong>${week.items.length}</strong>
                </summary>
                <div class="crm-week-list">${week.items.map((l) => leadCard(l, readOnly)).join("")}</div>
              </details>`
            )
            .join("")}
        </div>
      </details>`;
    })
    .join("");
}

async function loadLeads() {
  try {
    const qs = buildLeadsQuery();
    const data = await api(`/api/leads?${qs}`);
    leadsCache = Array.isArray(data.items) ? data.items : [];
    buildClientHistoryIndex(leadsCache);
    const list = document.getElementById("crm-list");
    if (!list) return;
    const readOnly = !canEditLeads;
    list.innerHTML = renderGroupedLeads(leadsCache, readOnly);
    renderKanban(leadsCache);
    renderLeadsSummary(data.summary, leadsCache.length);
    setMsg(`В списке: ${leadsCache.length} заявок`);
  } catch (err) {
    setMsg(err.message || "Ошибка загрузки CRM", false);
  }
}

function renderKanban(items) {
  const root = document.getElementById("crm-kanban");
  if (!root) return;
  const columns = [
    { id: "new", title: "Новые" },
    { id: "in_progress", title: "В работе" },
    { id: "quoted", title: "КП отправлено" },
    { id: "won", title: "Успешно" },
    { id: "lost", title: "Закрыто" },
  ];
  root.innerHTML = columns
    .map((col) => {
      const colItems = items.filter((i) => i.status === col.id);
      const cards = (isSalesCrmPage ? colItems : colItems.slice(0, 6))
        .map((l) => {
          const total = moneyLabel(l.orderTotal);
          const assignee = leadAssigneeName(l);
          const created = leadDateLabel(l.createdAt);
          return `
            <article class="crm-kanban-card crm-kanban-card--lead" data-open-lead-id="${escapeHtml(String(l.id))}" role="button" tabindex="0">
              <strong>#${escapeHtml(String(l.id))} ${escapeHtml(l.customerName || "Без имени")}</strong>
              <p>${escapeHtml(l.phone || "—")}${l.email ? ` · ${escapeHtml(l.email)}` : ""}</p>
              <p class="crm-kanban-card-meta">
                <span>${escapeHtml(total)}</span>
                <span>${escapeHtml(assignee)}</span>
              </p>
              <p class="crm-kanban-card-sub">${escapeHtml(created)}</p>
            </article>
          `;
        })
        .join("");
      return `
        <section class="crm-kanban-col crm-kanban-col--${col.id}">
          <h4>${col.title} <span>${colItems.length}</span></h4>
          <div class="crm-kanban-items">
            ${cards || "<p class='meta'>Пусто</p>"}
          </div>
        </section>
      `;
    })
    .join("");
}

async function loadManagers() {
  try {
    const data = await api("/api/users/managers");
    managers = Array.isArray(data.items) ? data.items : [];
  } catch {
    managers = [];
  }
  syncAssigneeFilterOptions();
}

function syncAssigneeFilterOptions() {
  const sel = document.getElementById("crm-filter-assignee");
  if (!sel) return;
  const prev = sel.value;
  const opts = [
    `<option value="all">Все менеджеры</option>`,
    `<option value="none">Не назначен</option>`,
    ...managers.map(
      (m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`
    ),
  ];
  sel.innerHTML = opts.join("");
  const allowed = new Set(["all", "none", ...managers.map((m) => String(m.id))]);
  sel.value = allowed.has(prev) ? prev : "all";
}

function renderUsersList() {
  if (!canViewUsersDir) return;
  const root = document.getElementById("crm-users-list");
  if (!root) return;
  let items = usersCache.slice();
  if (currentUserFilter !== "all") items = items.filter((u) => u.role === currentUserFilter);
  if (!items.length) {
    root.innerHTML = "<p class=\"meta\">Нет пользователей в этой категории.</p>";
    setUsersMsg(`Показано: 0`);
    return;
  }
  root.innerHTML = items
    .map((u) => {
      const adminActions = canManageUserRoles
        ? `<div class="crm-user-card-actions">
        <label class="crm-user-field-label">Роль
          <select class="crm-user-role-select" aria-label="Роль">${roleOptionsHtml(u.role)}</select>
        </label>
        <div class="crm-user-btns">
          <button type="button" class="btn btn-primary crm-user-save-btn">Сохранить роль</button>
          <button type="button" class="btn btn-ghost crm-user-delete-btn">Удалить</button>
        </div>
      </div>`
        : `<p class="crm-user-mod-hint">Просмотр полного профиля. Изменение роли и удаление — только администратор.</p>`;
      return `
    <article class="crm-user-card" data-user-id="${u.id}">
      <div class="crm-user-card-head">
        <div>
          <h3 class="crm-user-name">${escapeHtml(u.name)}</h3>
          <p class="crm-user-email">${escapeHtml(u.email)}</p>
        </div>
        <span class="crm-user-pill">${escapeHtml(u.roleLabel || u.role)}</span>
      </div>
      ${userProfileBlock(u)}
      ${adminActions}
    </article>
  `;
    })
    .join("");
  setUsersMsg(`Показано: ${items.length} из ${usersCache.length}`);
}

async function loadUsersDirectory() {
  if (!canViewUsersDir) return;
  try {
    const data = await api("/api/users");
    usersCache = Array.isArray(data.items) ? data.items : [];
    if (currentView === "users") renderUsersList();
    else setUsersMsg(`В базе пользователей: ${usersCache.length}`);
  } catch (e) {
    setUsersMsg(e.message || "Не удалось загрузить пользователей", false);
  }
}

bindSidebarNav();

document.getElementById("crm-refresh")?.addEventListener("click", loadLeads);
document.getElementById("crm-search")?.addEventListener("input", loadLeads);
document.getElementById("crm-groups-open")?.addEventListener("click", () => {
  document.querySelectorAll("#crm-list .crm-time-group").forEach((el) => {
    el.open = true;
  });
});
document.getElementById("crm-groups-close")?.addEventListener("click", () => {
  document.querySelectorAll("#crm-list .crm-time-group").forEach((el) => {
    el.open = false;
  });
});
document.getElementById("crm-tools-tabs")?.addEventListener("click", (e) => {
  const tab = e.target.closest(".crm-tools-tab[data-crm-tool]");
  if (!tab) return;
  const module = tab.getAttribute("data-crm-tool");
  if (!module) return;
  loadCrmToolModule(module);
});
document.getElementById("crm-tools-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("crm-tools-title")?.value.trim() || "";
  const value = document.getElementById("crm-tools-value")?.value.trim() || "";
  const meta = document.getElementById("crm-tools-meta")?.value.trim() || "";
  if (!title) {
    setToolsMsg("Укажите название записи.", false);
    return;
  }
  const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    await api(crmToolApiPath(crmToolsModule), {
      method: "POST",
      body: JSON.stringify({ title, value, meta }),
    });
    e.currentTarget.reset();
    await loadCrmToolModule(crmToolsModule);
  } catch (err) {
    setToolsMsg(err.message || "Ошибка сохранения записи", false);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});
document.querySelector("#crm-tools-table tbody")?.addEventListener("click", async (e) => {
  if (!canEditLeads) return;
  const row = e.target.closest("tr[data-crm-tool-id]");
  if (!row) return;
  const id = Number(row.getAttribute("data-crm-tool-id"));
  if (!Number.isFinite(id)) return;
  const editBtn = e.target.closest(".crm-tool-edit");
  const delBtn = e.target.closest(".crm-tool-delete");
  if (editBtn) {
    const current = crmToolsCache.find((x) => Number(x.id) === id);
    if (!current) return;
    const title = window.prompt("Название", current.title || "");
    if (title == null) return;
    const value = window.prompt("Значение", current.value == null ? "" : String(current.value));
    if (value == null) return;
    const meta = window.prompt("Примечание", current.meta || "");
    if (meta == null) return;
    try {
      await api(crmToolApiPath(crmToolsModule, id), {
        method: "PATCH",
        body: JSON.stringify({ title, value, meta }),
      });
      await loadCrmToolModule(crmToolsModule);
    } catch (err) {
      setToolsMsg(err.message || "Ошибка обновления записи", false);
    }
    return;
  }
  if (delBtn) {
    if (!window.confirm("Удалить запись?")) return;
    try {
      await api(crmToolApiPath(crmToolsModule, id), { method: "DELETE" });
      await loadCrmToolModule(crmToolsModule);
    } catch (err) {
      setToolsMsg(err.message || "Ошибка удаления записи", false);
    }
  }
});
document.getElementById("crm-kanban")?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-open-lead-id]");
  if (!card) return;
  const leadId = String(card.getAttribute("data-open-lead-id") || "");
  if (!leadId) return;
  expandedLeadIds.add(leadId);
  const target = [...document.querySelectorAll("#crm-list .crm-card")].find((el) => String(el.dataset.id) === leadId);
  if (!target) return;
  target.classList.add("is-expanded");
  target.querySelector("details")?.setAttribute("open", "");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.getElementById("crm-kanban")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest("[data-open-lead-id]");
  if (!card) return;
  e.preventDefault();
  card.click();
});
[
  "crm-filter-status",
  "crm-filter-assignee",
  "crm-filter-priority",
  "crm-sort",
  "crm-filter-delivery",
  "crm-filter-payment",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => loadLeads());
});
document.getElementById("crm-filter-reset")?.addEventListener("click", () => {
  const st = document.getElementById("crm-filter-status");
  const as = document.getElementById("crm-filter-assignee");
  const pr = document.getElementById("crm-filter-priority");
  const so = document.getElementById("crm-sort");
  const dlv = document.getElementById("crm-filter-delivery");
  const pay = document.getElementById("crm-filter-payment");
  if (st) st.value = "all";
  if (as) as.value = "all";
  if (pr) pr.value = "all";
  if (so) so.value = "created_desc";
  if (dlv) dlv.value = "all";
  if (pay) pay.value = "all";
  loadLeads();
});

function closeNoteEdit(commentEl) {
  if (!commentEl) return;
  const view = commentEl.querySelector(".crm-note-view");
  const panel = commentEl.querySelector(".crm-note-edit-panel");
  if (view) view.classList.remove("crm-panel-hidden");
  if (panel) panel.classList.add("crm-panel-hidden");
}

function openNoteEdit(commentEl) {
  if (!commentEl) return;
  const view = commentEl.querySelector(".crm-note-view");
  const panel = commentEl.querySelector(".crm-note-edit-panel");
  const ta = commentEl.querySelector(".crm-note-edit-textarea");
  if (!view || !panel || !ta) return;
  ta.value = view.textContent || "";
  view.classList.add("crm-panel-hidden");
  panel.classList.remove("crm-panel-hidden");
}

document.getElementById("crm-list")?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".crm-note-edit-btn");
  const delBtn = e.target.closest(".crm-note-delete-btn");
  const saveBtn = e.target.closest(".crm-note-save-btn");
  const cancelBtn = e.target.closest(".crm-note-cancel-btn");
  const historyBtn = e.target.closest("[data-crm-open-lead]");
  const rowBtn = e.target.closest(".crm-lead-row");
  const comment = e.target.closest(".crm-manager-comment");
  const card = e.target.closest(".crm-card");
  if (historyBtn) {
    e.preventDefault();
    const targetId = historyBtn.getAttribute("data-crm-open-lead");
    if (!targetId) return;
    expandedLeadIds.add(String(targetId));
    const targetCard = [...document.querySelectorAll("#crm-list .crm-card")].find((el) => String(el.dataset.id) === String(targetId));
    if (targetCard) {
      targetCard.closest(".crm-time-group--month")?.setAttribute("open", "");
      targetCard.closest(".crm-time-group--week")?.setAttribute("open", "");
      targetCard.classList.add("is-expanded");
      targetCard.querySelector(".crm-lead-row")?.setAttribute("aria-expanded", "true");
      const details = targetCard.querySelector(".crm-lead-details");
      details?.classList.remove("crm-panel-hidden");
      targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }
  if (!card) return;
  const leadKey = String(card.dataset.id || "");
  const leadId = Number(leadKey);

  if (rowBtn) {
    e.preventDefault();
    const details = card.querySelector(".crm-lead-details");
    const open = !expandedLeadIds.has(leadKey);
    if (open) expandedLeadIds.add(leadKey);
    else expandedLeadIds.delete(leadKey);
    card.classList.toggle("is-expanded", open);
    rowBtn.setAttribute("aria-expanded", open ? "true" : "false");
    const toggle = rowBtn.querySelector(".crm-lead-toggle");
    if (toggle) toggle.textContent = open ? "Свернуть" : "Открыть";
    if (details) details.classList.toggle("crm-panel-hidden", !open);
    return;
  }

  if (editBtn && comment && canEditLeads) {
    e.preventDefault();
    card.querySelectorAll(".crm-manager-comment").forEach((c) => closeNoteEdit(c));
    openNoteEdit(comment);
    return;
  }
  if (cancelBtn && comment && canEditLeads) {
    e.preventDefault();
    closeNoteEdit(comment);
    return;
  }
  if (saveBtn && comment && canEditLeads) {
    e.preventDefault();
    const noteId = comment.dataset.noteId;
    const ta = comment.querySelector(".crm-note-edit-textarea");
    const text = ta?.value?.trim() || "";
    if (!text) {
      setMsg("Введите текст заметки", false);
      return;
    }
    if (!noteId || !Number.isFinite(leadId)) return;
    saveBtn.disabled = true;
    try {
      await api(`/api/leads/${leadId}/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
      });
      setMsg("Заметка обновлена");
      await loadLeads();
    } catch (err) {
      setMsg(err.message || "Ошибка сохранения", false);
    } finally {
      saveBtn.disabled = false;
    }
    return;
  }
  if (delBtn && comment && canDeleteLeadNotes) {
    e.preventDefault();
    const noteId = comment.dataset.noteId;
    if (!noteId || !Number.isFinite(leadId)) return;
    if (!window.confirm("Удалить эту заметку?")) return;
    delBtn.disabled = true;
    try {
      await api(`/api/leads/${leadId}/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
      setMsg("Заметка удалена");
      await loadLeads();
    } catch (err) {
      setMsg(err.message || "Ошибка удаления", false);
    } finally {
      delBtn.disabled = false;
    }
  }
});

document.getElementById("crm-view-leads")?.addEventListener("click", async (e) => {
  if (!canEditLeads) return;
  const btn = e.target.closest(".crm-save-btn");
  if (!btn) return;
  e.preventDefault();
  const card = btn.closest(".crm-card");
  if (!card) return;
  const idRaw = card.dataset.id;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    setMsg("Некорректный номер заявки", false);
    return;
  }
  const status = card.querySelector(".crm-status-select")?.value || "new";
  const priority = card.querySelector(".crm-priority-select")?.value || "normal";
  const assigneeIdRaw = card.querySelector(".crm-assignee-select")?.value ?? "";
  let assigneeId = null;
  if (assigneeIdRaw !== "") {
    const n = Number(assigneeIdRaw);
    assigneeId = Number.isFinite(n) ? n : null;
  }
  const noteEl = card.querySelector("textarea.crm-note-textarea");
  const newNote = noteEl ? noteEl.value.trim() : "";
  const payload = { status, priority };
  if (canAssignLeads) payload.assigneeId = assigneeId;
  if (newNote) payload.managerNote = newNote;
  btn.disabled = true;
  try {
    await api(`/api/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setMsg(`Заявка #${id} сохранена`);
    await loadLeads();
  } catch (err) {
    setMsg(err.message || "Ошибка обновления", false);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("crm-users-list")?.addEventListener("click", async (e) => {
  const saveBtn = e.target.closest(".crm-user-save-btn");
  const delBtn = e.target.closest(".crm-user-delete-btn");
  const card = e.target.closest(".crm-user-card");
  if (!card) return;
  if (!canManageUserRoles) return;
  const id = card.dataset.userId;
  if (saveBtn) {
    const sel = card.querySelector(".crm-user-role-select");
    const role = sel?.value;
    if (!id || !role) return;
    try {
      await api(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setUsersMsg(`Роль пользователя обновлена. При смене своей роли войдите снова.`);
      await loadUsersDirectory();
    } catch (err) {
      setUsersMsg(err.message || "Ошибка сохранения роли", false);
    }
    return;
  }
  if (delBtn) {
    if (!id) return;
    const ok = window.confirm(
      `Удалить пользователя #${id} безвозвратно? Ответственность по заявкам будет снята.`
    );
    if (!ok) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      setUsersMsg("Пользователь удалён.");
      await loadUsersDirectory();
    } catch (err) {
      setUsersMsg(err.message || "Ошибка удаления", false);
    }
  }
});

function crmLogoutConfirm(e) {
  e.preventDefault();
  const ok = window.confirm(
    "Выйти из аккаунта?\n\n«ОК» — выйти, «Отмена» — остаться в системе."
  );
  if (!ok) return;
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
  window.location.href = "auth.html";
}

document.getElementById("logout-btn")?.addEventListener("click", crmLogoutConfirm);
document.getElementById("crm-embed-logout-btn")?.addEventListener("click", crmLogoutConfirm);

document.getElementById("crm-export")?.addEventListener("click", async () => {
  if (!canExport) return;
  const url = crmApiUrl("/api/leads/export.csv");
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Не удалось выгрузить CSV");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "crm-leads.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    setMsg(e.message || "Ошибка экспорта", false);
  }
});

(async () => {
  await loadCrmPermissions();
  if (!crmCan("leads.view")) {
    window.location.href = "index.html";
    return;
  }
  await loadManagers();
  await loadLeads();
  await loadUsersDirectory();
  if (isSalesCrmPage) await loadCrmToolModule("tasks");
  setLeadsView();
})();
