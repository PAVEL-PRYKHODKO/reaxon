/**
 * Личный кабинет: отдельная страница account.html (без выезжающей панели).
 */
(function () {
  if (document.body?.dataset?.page !== "account") return;

  function apiUrl(p) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
  }

  function mediaUrl(path) {
    if (!path || typeof path !== "string") return "";
    if (path.startsWith("http")) return path;
    const base = window.DP_API_BASE || "";
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function getToken() {
    return localStorage.getItem("authToken");
  }

  async function apiAuth(method, urlPath, body) {
    const token = getToken();
    if (!token) throw new Error("no_token");
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(apiUrl(urlPath), opts);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        throw new Error("Сервер недоступен. Запустите npm start и откройте сайт через http://localhost:3000");
      }
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      throw new Error("Сессия истекла. Войдите снова.");
    }
    if (!res.ok) throw new Error(data.message || "Ошибка запроса");
    return data;
  }

  async function notifyServerLogout() {
    try {
      await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.remove("account-status--ok", "account-status--err");
    if (kind === "ok") el.classList.add("account-status--ok");
    if (kind === "err") el.classList.add("account-status--err");
  }

  function syncLegalBillingVisibility(form) {
    const box = document.getElementById("account-legal-only-fields");
    const legacyBilling = document.getElementById("account-legal-billing");
    const companyInput = form?.querySelector?.('input[name="companyName"]');
    const legalAddressInput = form?.querySelector?.('textarea[name="legalAddress"]');
    const deliveryAddressInput = form?.querySelector?.('textarea[name="deliveryAddress"]');
    const legalControl = form?.querySelector?.("#account-is-legal-entity");
    if (!box || !(legalControl instanceof HTMLInputElement || legalControl instanceof HTMLSelectElement)) return;
    const enabled =
      legalControl instanceof HTMLSelectElement
        ? String(legalControl.value || "") === "1"
        : Boolean(legalControl.checked);
    box.hidden = !enabled;
    // Fallback: если в кеше осталась старая разметка, принудительно скрываем связанные поля.
    if (legacyBilling) legacyBilling.hidden = !enabled;
    if (companyInput?.closest("label")) companyInput.closest("label").hidden = !enabled;
    if (legalAddressInput?.closest("label")) legalAddressInput.closest("label").hidden = !enabled;
    if (deliveryAddressInput?.closest("label")) deliveryAddressInput.closest("label").hidden = !enabled;
  }

  function applyUserToForm(form, user) {
    if (!user || !form) return;
    const pr = user.profile || {};
    form.name.value = user.name || "";
    if (form.lastName) form.lastName.value = pr.lastName || "";
    form.email.value = user.email || "";
    form.age.value = pr.age != null && pr.age !== "" ? String(pr.age) : "";
    const g = pr.gender === "female" || pr.gender === "male" ? pr.gender : "";
    form.gender.value = g;
    const profileCity = String(pr.city || pr.countryRegion || "").trim();
    const citySelect = form.querySelector("#account-city-select");
    const cityManual = form.querySelector("#account-city-manual");
    if (citySelect instanceof HTMLSelectElement && cityManual instanceof HTMLInputElement) {
      const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
      const target = norm(profileCity);
      const options = Array.from(citySelect.options || []);
      const hit = options.find((opt) => /^c:\d+$/.test(String(opt.value || "")) && norm(opt.textContent) === target);
      if (hit) {
        citySelect.value = hit.value;
        cityManual.hidden = true;
        cityManual.value = String(hit.textContent || "").trim();
      } else {
        citySelect.value = profileCity ? "__other__" : "";
        cityManual.hidden = citySelect.value !== "__other__";
        cityManual.value = profileCity;
      }
    }
    form.companyName.value = pr.companyName || "";
    form.phone.value = pr.phone || "";
    form.legalAddress.value = pr.legalAddress || "";
    form.deliveryAddress.value = pr.deliveryAddress || "";
    const ile = form.querySelector("#account-is-legal-entity");
    if (ile instanceof HTMLSelectElement) {
      ile.value = pr.isLegalEntity ? "1" : "0";
    } else if (ile instanceof HTMLInputElement) {
      ile.checked = Boolean(pr.isLegalEntity);
    }
    const edEl = form.querySelector('[name="edrpou"]');
    if (edEl instanceof HTMLInputElement) edEl.value = pr.edrpou || "";
    const invEl = form.querySelector('[name="invoiceEmail"]');
    if (invEl instanceof HTMLInputElement) invEl.value = pr.invoiceEmail || "";
    const ibEl = form.querySelector('[name="billingIban"]');
    if (ibEl instanceof HTMLInputElement) ibEl.value = pr.billingIban || "";
    syncLegalBillingVisibility(form);
    const pv = pr.privacy || {};
    form.hideEmail.checked = Boolean(pv.hideEmail);
    form.hidePhone.checked = Boolean(pv.hidePhone);
    form.hideLegalAddress.checked = Boolean(pv.hideLegalAddress);
    form.hideDeliveryAddress.checked = Boolean(pv.hideDeliveryAddress);
  }

  let accountMajorCities = [];

  function fillAccountCitySelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    const isUk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
    const options = [
      `<option value="">${isUk ? "Оберіть місто" : "Выберите город"}</option>`,
      ...accountMajorCities.map((row, i) => {
        const label = isUk ? String(row?.searchUk || row?.searchRu || "") : String(row?.searchRu || row?.searchUk || "");
        return `<option value="c:${i}">${label.replace(/</g, "&lt;")}</option>`;
      }),
      `<option value="__other__">${isUk ? "Інше місто (ввести вручну)" : "Другой город (ввести вручную)"}</option>`,
    ];
    select.innerHTML = options.join("");
  }

  function setupAccountCityField(form) {
    const select = form?.querySelector?.("#account-city-select");
    const manual = form?.querySelector?.("#account-city-manual");
    if (!(select instanceof HTMLSelectElement) || !(manual instanceof HTMLInputElement)) return;
    select.addEventListener("change", () => {
      const v = String(select.value || "");
      if (v === "__other__") {
        manual.hidden = false;
        manual.focus();
        return;
      }
      manual.hidden = true;
      if (/^c:\d+$/.test(v)) {
        const idx = Number(v.slice(2));
        const row = accountMajorCities[idx];
        const isUk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
        const label = isUk ? String(row?.searchUk || row?.searchRu || "") : String(row?.searchRu || row?.searchUk || "");
        manual.value = label;
      }
    });
  }

  function resolveAccountCityFromForm(form) {
    const select = form?.querySelector?.("#account-city-select");
    const manual = form?.querySelector?.("#account-city-manual");
    if (!(select instanceof HTMLSelectElement) || !(manual instanceof HTMLInputElement)) return "";
    const v = String(select.value || "");
    if (v === "__other__") return String(manual.value || "").trim().slice(0, 200);
    if (/^c:\d+$/.test(v)) {
      const idx = Number(v.slice(2));
      const row = accountMajorCities[idx];
      const isUk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
      const label = isUk ? String(row?.searchUk || row?.searchRu || "") : String(row?.searchRu || row?.searchUk || "");
      return String(label || "").trim().slice(0, 200);
    }
    return String(manual.value || "").trim().slice(0, 200);
  }

  function updateAvatarPreview(box, url) {
    if (!box) return;
    box.innerHTML = "";
    if (url) {
      const img = document.createElement("img");
      img.src = mediaUrl(url);
      img.alt = "Фото профиля";
      img.draggable = false;
      box.appendChild(img);
    } else {
      const s = document.createElement("span");
      s.textContent = "Нет фото";
      box.appendChild(s);
    }
    syncAvatarRemoveVisibility();
  }

  function syncAvatarRemoveVisibility() {
    const pv = document.getElementById("account-drawer-avatar-preview");
    const rm = document.getElementById("account-drawer-avatar-remove-btn");
    if (!pv || !rm) return;
    rm.hidden = !pv.querySelector("img");
  }

  function formatRoleLabel(role) {
    const r = String(role || "").toLowerCase();
    const map = {
      admin: "Администратор",
      moderator: "Модератор",
      accountant: "Бухгалтер",
      user: "Пользователь",
    };
    return map[r] || (role ? String(role) : "Пользователь");
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoneyUAH(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return `${v.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} грн`;
  }

  function purchaseLeadStatusLabel(status) {
    const m = {
      new: "Новая",
      in_progress: "В работе",
      quoted: "КП отправлено",
      won: "Выполнена",
      lost: "Отменена",
    };
    return m[String(status || "")] || (status ? String(status) : "—");
  }

  function paymentStatusLabel(st) {
    const s = String(st || "").toLowerCase();
    if (s === "success" || s === "paid") return "Оплачено";
    if (s === "pending") return "Ожидает оплаты";
    if (s.startsWith("error")) return "Ошибка оплаты";
    return st ? String(st) : "";
  }

  function formatPurchaseDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ru-UA", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  async function loadSiteMessages() {
    const root = document.getElementById("account-site-messages-list");
    const statusEl = document.getElementById("account-site-messages-status");
    if (!getToken() || !root) return;
    if (statusEl) {
      statusEl.textContent = "Загрузка…";
      statusEl.classList.remove("account-status--err");
    }
    try {
      const data = await apiAuth("GET", "/api/me/site-messages");
      const items = data.items || [];
      if (statusEl) statusEl.textContent = "";
      renderSiteMessages(items);
    } catch (e) {
      if (e.message === "no_token") return;
      if (statusEl) {
        statusEl.textContent = e.message || "Не удалось загрузить сообщения";
        statusEl.classList.add("account-status--err");
      }
      root.innerHTML = "";
    }
  }

  function renderSiteMessages(items) {
    const root = document.getElementById("account-site-messages-list");
    if (!root) return;
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "account-site-messages__empty";
      empty.setAttribute("data-i18n", "accountSiteMessagesEmpty");
      empty.textContent =
        "Пока нет ответов менеджера. Они появятся здесь после обработки заявки.";
      root.innerHTML = "";
      root.appendChild(empty);
      if (typeof window.applyTranslations === "function") window.applyTranslations();
      return;
    }
    root.innerHTML = items
      .map((m) => {
        const unread = !m.read ? " account-site-message--unread" : "";
        return `<article class="account-site-message${unread}" data-msg-id="${escHtml(m.id)}">
          <div class="account-site-message__top">
            <span class="account-site-message__topic">Заявка №${escHtml(String(m.leadId != null ? m.leadId : "—"))} · ${escHtml(
          m.topic || "—"
        )}</span>
            <time class="account-site-message__time" datetime="${escHtml(m.createdAt || "")}">${escHtml(
          formatPurchaseDate(m.createdAt)
        )}</time>
          </div>
          <p class="account-site-message__from">${escHtml(m.fromManagerName || "Менеджер")}</p>
          <div class="account-site-message__body">${escHtml(m.body || "")}</div>
        </article>`;
      })
      .join("");
    root.querySelectorAll(".account-site-message").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-msg-id");
        if (!id) return;
        try {
          await apiAuth("PATCH", `/api/me/site-messages/${encodeURIComponent(id)}/read`);
          el.classList.remove("account-site-message--unread");
        } catch {
          /* ignore */
        }
      });
    });
  }

  function renderPurchaseHistory(items) {
    const root = document.getElementById("account-purchase-history-list");
    if (!root) return;
    if (!items || !items.length) {
      root.innerHTML =
        '<p class="account-purchase-history__empty">Пока нет заказов, привязанных к аккаунту. Оформляйте покупки, будучи авторизованным на сайте — они появятся здесь.</p>';
      return;
    }
    root.innerHTML = items
      .map((row) => {
        const payLbl = paymentStatusLabel(row.paymentStatus);
        const payExtra = row.paidAt ? ` · ${formatPurchaseDate(row.paidAt)}` : "";
        const payLine = payLbl ? `<div class="account-purchase-item__meta">${escHtml(payLbl)}${escHtml(payExtra)}</div>` : "";
        const lines = (row.cartPreview || [])
          .map((r) => {
            const t = escHtml(r.title || "—");
            const q = r.qty != null ? ` ×${escHtml(String(r.qty))}` : "";
            const lt =
              r.lineTotal != null && Number.isFinite(Number(r.lineTotal))
                ? ` · ${escHtml(formatMoneyUAH(r.lineTotal))}`
                : "";
            return `<li>${t}${q}${lt}</li>`;
          })
          .join("");
        const more =
          row.cartLines > (row.cartPreview || []).length
            ? `<div class="account-purchase-item__meta">… и ещё позиций: ${row.cartLines - (row.cartPreview || []).length}</div>`
            : "";
        return `<article class="account-purchase-item">
          <div class="account-purchase-item__top">
            <span class="account-purchase-item__id">Заявка №${escHtml(String(row.id))}</span>
            <span class="account-purchase-item__date">${escHtml(formatPurchaseDate(row.createdAt))}</span>
          </div>
          <div class="account-purchase-item__sum">${escHtml(formatMoneyUAH(row.orderTotal))}</div>
          <div class="account-purchase-item__meta">${escHtml(purchaseLeadStatusLabel(row.status))} · ${escHtml(
          String(row.source || "сайт")
        )}</div>
          ${payLine}
          ${
            lines
              ? `<ul class="account-purchase-item__lines">${lines}</ul>${more}`
              : row.cartLines
                ? `<div class="account-purchase-item__meta">Позиций в составе: ${row.cartLines}</div>`
                : ""
          }
        </article>`;
      })
      .join("");
  }

  function clearPurchaseHistoryUI() {
    const root = document.getElementById("account-purchase-history-list");
    const statusEl = document.getElementById("account-purchase-history-status");
    if (root) root.innerHTML = "";
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.classList.remove("account-status--err");
    }
  }

  async function loadPurchaseHistory() {
    const root = document.getElementById("account-purchase-history-list");
    const statusEl = document.getElementById("account-purchase-history-status");
    if (!getToken() || !root) return;
    if (statusEl) {
      statusEl.textContent = "Загрузка…";
      statusEl.classList.remove("account-status--err");
    }
    try {
      const data = await apiAuth("GET", "/api/auth/my-purchases");
      if (statusEl) statusEl.textContent = "";
      renderPurchaseHistory(data.items || []);
    } catch (e) {
      if (e.message === "no_token") return;
      if (statusEl) {
        statusEl.textContent = e.message || "Не удалось загрузить историю";
        statusEl.classList.add("account-status--err");
      }
      root.innerHTML = "";
    }
  }

  function updateProfileSummaryCard(user) {
    const wrap = document.getElementById("account-drawer-profile-summary");
    const preview = document.getElementById("account-drawer-avatar-preview");
    const nm = document.getElementById("account-drawer-summary-name");
    const em = document.getElementById("account-drawer-summary-email");
    const rl = document.getElementById("account-drawer-summary-role");
    if (!wrap || !preview || !nm || !em || !rl) return;
    if (!user) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    {
      const pr = user.profile || {};
      const show = [user.name, pr.lastName].filter(Boolean).join(" ").trim();
      nm.textContent = show || "Без имени";
    }
    em.textContent = user.email || "";
    rl.textContent = formatRoleLabel(user.role);
    updateAvatarPreview(preview, user.profile?.avatarUrl);
  }

  function syncStaffToolsVisibility(user) {
    let u = user;
    if (u === undefined || u === null) {
      try {
        u = JSON.parse(localStorage.getItem("authUser") || "null");
      } catch {
        u = null;
      }
    }
    const adminEl = document.getElementById("account-drawer-admin-tools");
    const crmEl = document.getElementById("account-drawer-crm-tools");
    const role = String(u?.role || "").trim().toLowerCase();
    if (adminEl) adminEl.hidden = !(role === "admin");
    if (crmEl) crmEl.hidden = !(role === "moderator" || role === "accountant");
  }

  function updateAuthSections() {
    const token = getToken();
    const logged = document.getElementById("account-drawer-logged");
    const logoutBtn = document.getElementById("account-drawer-logout-btn");
    if (!logged) return;
    if (!token) {
      window.location.replace("auth.html");
      return;
    }
    logged.hidden = false;
    if (logoutBtn) logoutBtn.hidden = false;
    syncStaffToolsVisibility(null);
  }

  async function loadProfile() {
    const form = document.getElementById("account-drawer-form");
    const statusEl = document.getElementById("account-drawer-form-status");
    if (!form) return;
    try {
      try {
        const citiesRes = await fetch(apiUrl("/api/shipping/ua-major-cities"), { cache: "no-store" });
        const citiesJson = await citiesRes.json().catch(() => ({}));
        accountMajorCities = Array.isArray(citiesJson?.items) ? citiesJson.items : [];
      } catch {
        accountMajorCities = [];
      }
      const citySelect = form.querySelector("#account-city-select");
      fillAccountCitySelect(citySelect);
      const user = await apiAuth("GET", "/api/auth/me");
      localStorage.setItem("authUser", JSON.stringify(user));
      applyUserToForm(form, user);
      updateProfileSummaryCard(user);
      syncStaffToolsVisibility(user);
      setStatus(statusEl, "", null);
      void loadPurchaseHistory();
      void loadSiteMessages();
    } catch (e) {
      if (e.message === "no_token" || !getToken()) {
        window.location.replace("auth.html");
        return;
      }
      setStatus(statusEl, e.message || "Не удалось загрузить профиль", "err");
    }
  }

  let bound = false;

  function bindFormHandlers() {
    if (bound) return;
    bound = true;

    const form = document.getElementById("account-drawer-form");
    const statusEl = document.getElementById("account-drawer-form-status");
    const avatarInput = document.getElementById("account-drawer-avatar-input");
    const avatarRemoveBtn = document.getElementById("account-drawer-avatar-remove-btn");
    const preview = document.getElementById("account-drawer-avatar-preview");
    setupAccountCityField(form);

    async function performLogout() {
      const ok = window.confirm(
        "Выйти из аккаунта?\n\n«ОК» — выйти, «Отмена» — остаться в системе."
      );
      if (!ok) return;
      await notifyServerLogout();
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      window.dispatchEvent(new CustomEvent("dp-auth-changed"));
      window.location.href = "index.html";
    }

    document.getElementById("account-drawer-logout-btn")?.addEventListener("click", () => {
      void performLogout();
    });

    form?.querySelector("#account-is-legal-entity")?.addEventListener("change", () => syncLegalBillingVisibility(form));
    syncLegalBillingVisibility(form);

    avatarInput?.addEventListener("change", async () => {
      const f = avatarInput.files && avatarInput.files[0];
      if (!f) return;
      if (f.size > 512 * 1024) {
        setStatus(statusEl, "Файл больше 512 КБ.", "err");
        avatarInput.value = "";
        return;
      }
      setStatus(statusEl, "Загрузка фото…", null);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await apiAuth("POST", "/api/auth/profile/avatar", {
            imageBase64: reader.result,
          });
          updateAvatarPreview(preview, data.avatarUrl);
          let u = {};
          try {
            u = JSON.parse(localStorage.getItem("authUser") || "{}");
          } catch {
            u = {};
          }
          u.profile = u.profile || {};
          u.profile.avatarUrl = data.avatarUrl;
          localStorage.setItem("authUser", JSON.stringify(u));
          setStatus(statusEl, "Фото обновлено.", "ok");
        } catch (e) {
          setStatus(statusEl, e.message || "Не удалось загрузить фото", "err");
        } finally {
          avatarInput.value = "";
        }
      };
      reader.onerror = () => setStatus(statusEl, "Не удалось прочитать файл", "err");
      reader.readAsDataURL(f);
    });

    async function removeProfileAvatar() {
      setStatus(statusEl, "Удаление…", null);
      try {
        await apiAuth("DELETE", "/api/auth/profile/avatar");
        updateAvatarPreview(preview, "");
        let u = {};
        try {
          u = JSON.parse(localStorage.getItem("authUser") || "{}");
        } catch {
          u = {};
        }
        if (u.profile) u.profile.avatarUrl = null;
        localStorage.setItem("authUser", JSON.stringify(u));
        setStatus(statusEl, "Фото удалено.", "ok");
      } catch (e) {
        setStatus(statusEl, e.message || "Ошибка", "err");
      }
    }

    avatarRemoveBtn?.addEventListener("click", async () => {
      if (avatarRemoveBtn.hidden) return;
      const ok = window.confirm("Удалить фото профиля?");
      if (!ok) return;
      await removeProfileAvatar();
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(statusEl, "Сохранение…", null);
      const fd = new FormData(form);
      const payload = {
        name: fd.get("name"),
        email: fd.get("email"),
        profile: {
          age: fd.get("age") === "" ? null : fd.get("age"),
          gender: (() => {
            const raw = String(fd.get("gender") || "").trim().toLowerCase();
            if (raw === "female") return "female";
            if (raw === "male") return "male";
            return "";
          })(),
          lastName: String(fd.get("lastName") || "").trim().slice(0, 200),
          countryRegion: resolveAccountCityFromForm(form),
          city: resolveAccountCityFromForm(form),
          isLegalEntity:
            String(form.elements.isLegalEntity?.value || "") === "1" ||
            Boolean(form.elements.isLegalEntity?.checked),
          companyName: fd.get("companyName") || "",
          edrpou: String(fd.get("edrpou") || "").trim(),
          billingIban: String(fd.get("billingIban") || "").trim(),
          invoiceEmail: String(fd.get("invoiceEmail") || "").trim(),
          phone: fd.get("phone") || "",
          legalAddress: fd.get("legalAddress") || "",
          deliveryAddress: fd.get("deliveryAddress") || "",
        },
        privacy: {
          hideEmail: form.hideEmail.checked,
          hidePhone: form.hidePhone.checked,
          hideLegalAddress: form.hideLegalAddress.checked,
          hideDeliveryAddress: form.hideDeliveryAddress.checked,
        },
      };
      try {
        const data = await apiAuth("PATCH", "/api/auth/profile", payload);
        if (data.token) localStorage.setItem("authToken", data.token);
        if (data.user) localStorage.setItem("authUser", JSON.stringify(data.user));
        applyUserToForm(form, data.user);
        updateAvatarPreview(preview, data.user?.profile?.avatarUrl);
        updateProfileSummaryCard(data.user);
        if (data.user) syncStaffToolsVisibility(data.user);
        setStatus(statusEl, "Данные сохранены.", "ok");
        try {
          window.dispatchEvent(new CustomEvent("dp-auth-changed"));
        } catch {
          /* ignore */
        }
      } catch (err) {
        setStatus(statusEl, err.message || "Ошибка сохранения", "err");
      }
    });

    const passForm = document.getElementById("account-password-form");
    const passStatus = document.getElementById("account-password-form-status");
    passForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(passStatus, "Смена пароля…", null);
      const fd = new FormData(passForm);
      const cur = String(fd.get("currentPassword") || "");
      const n1 = String(fd.get("newPassword") || "");
      const n2 = String(fd.get("newPasswordConfirm") || "");
      if (!cur) {
        setStatus(passStatus, "Введите текущий пароль.", "err");
        return;
      }
      if (n1.length < 6) {
        setStatus(passStatus, "Новый пароль не короче 6 символов.", "err");
        return;
      }
      if (n1 !== n2) {
        setStatus(passStatus, "Новый пароль и подтверждение не совпадают.", "err");
        return;
      }
      if (n1 === cur) {
        setStatus(passStatus, "Новый пароль должен отличаться от текущего.", "err");
        return;
      }
      try {
        const data = await apiAuth("POST", "/api/auth/change-password", {
          currentPassword: cur,
          newPassword: n1,
        });
        if (data.token) localStorage.setItem("authToken", data.token);
        if (data.user) localStorage.setItem("authUser", JSON.stringify(data.user));
        passForm.querySelectorAll('input[type="password"]').forEach((inp) => {
          inp.value = "";
        });
        if (data.user) {
          updateProfileSummaryCard(data.user);
          syncStaffToolsVisibility(data.user);
        }
        setStatus(passStatus, "Пароль изменён.", "ok");
        window.dispatchEvent(new CustomEvent("dp-auth-changed"));
      } catch (err) {
        setStatus(passStatus, err.message || "Не удалось сменить пароль", "err");
      }
    });
  }

  function init() {
    if (!getToken()) {
      window.location.replace("auth.html");
      return;
    }
    bindFormHandlers();
    if (typeof window.applyTranslations === "function") {
      window.applyTranslations();
    }
    window.addEventListener("dp-auth-changed", () => {
      if (!getToken()) {
        window.location.replace("auth.html");
        return;
      }
      void loadProfile();
    });
    updateAuthSections();
    void loadProfile();
  }

  if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
    window.dpSiteReady.then(() => init()).catch(() => init());
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
