(function () {
  if (document.body?.dataset?.page !== "account-orders") return;

  function apiUrl(p) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
  }

  function getToken() {
    return localStorage.getItem("authToken");
  }

  function isUk() {
    return typeof window.getDpLang === "function" && window.getDpLang() === "uk";
  }

  function tr(ru, uk) {
    return isUk() ? uk : ru;
  }

  async function apiAuth(method, urlPath) {
    const token = getToken();
    if (!token) throw new Error("no_token");
    const res = await fetch(apiUrl(urlPath), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      throw new Error(tr("Сессия истекла. Войдите снова.", "Сесія закінчилась. Увійдіть знову."));
    }
    if (!res.ok) {
      throw new Error(data.message || tr("Не удалось загрузить заявки.", "Не вдалося завантажити заявки."));
    }
    return data;
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoneyUAH(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return `${v.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} грн`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ru-UA", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(iso);
    }
  }

  function statusLabel(status) {
    const m = {
      new: tr("Новая", "Нова"),
      in_progress: tr("В работе", "В роботі"),
      quoted: tr("КП отправлено", "КП надіслано"),
      won: tr("Выполнена", "Виконана"),
      lost: tr("Отменена", "Скасована"),
      invoice_issued: tr("Счет выставлен", "Рахунок виставлено"),
    };
    return m[String(status || "")] || (status ? String(status) : "—");
  }

  function paymentStatusLabel(st) {
    const s = String(st || "").toLowerCase();
    if (s === "success" || s === "paid") return tr("Оплачено", "Оплачено");
    if (s === "pending") return tr("Ожидает оплаты", "Очікує оплату");
    if (s.startsWith("error")) return tr("Ошибка оплаты", "Помилка оплати");
    return st ? String(st) : "—";
  }

  function deliveryText(row) {
    const method = String(row.deliveryMethod || "").trim();
    const city = String(row.deliveryCity || "").trim();
    const point = String(row.deliveryPoint || "").trim();
    if (!method) return "—";
    const nameMap = {
      nova_poshta: tr("Новая Почта", "Нова Пошта"),
      ukrposhta: tr("Укрпочта", "Укрпошта"),
      meest: "Meest",
      autolux: "Автолюкс",
      pickup: tr("Самовывоз", "Самовивіз"),
      courier: tr("Курьер", "Кур'єр"),
      agreement: tr("По согласованию", "За погодженням"),
      invoice_only: tr("По согласованию (счет)", "За погодженням (рахунок)"),
    };
    const head = nameMap[method] || method;
    if (city && point) return `${head}, ${city}, ${point}`;
    if (city) return `${head}, ${city}`;
    if (point) return `${head}, ${point}`;
    return head;
  }

  function renderOrders(items) {
    const root = document.getElementById("account-orders-list");
    if (!root) return;
    if (!items || !items.length) {
      root.innerHTML = `<p class="account-purchase-history__empty">${escHtml(
        tr("Пока нет заявок, привязанных к вашему аккаунту.", "Поки немає заявок, прив'язаних до вашого акаунта.")
      )}</p>`;
      return;
    }
    root.innerHTML = items
      .map((row) => {
        const lines = (row.cartSnapshot || [])
          .map((line) => {
            const qty = line.qty != null ? ` ×${escHtml(String(line.qty))}` : "";
            const sum = line.lineTotal != null ? ` · ${escHtml(formatMoneyUAH(line.lineTotal))}` : "";
            const details = line.details ? `<div class="account-order-line__meta">${escHtml(line.details)}</div>` : "";
            const image = escHtml(line.image || "assets/product-template.png");
            return `<li class="account-order-line">
              <img class="account-order-line__img" src="${image}" alt="" onerror="this.onerror=null;this.src='assets/product-template.png';" />
              <div class="account-order-line__body">
                <div class="account-order-line__title"><strong>${escHtml(line.title || "—")}</strong></div>
                ${details}
              </div>
              <div class="account-order-line__sum">${qty}${sum}</div>
            </li>`;
          })
          .join("");
        const payMeta = `${escHtml(paymentStatusLabel(row.paymentStatus))}${row.paidAt ? ` · ${escHtml(formatDate(row.paidAt))}` : ""}`;
        return `<article class="account-purchase-item">
          <details class="account-order-accordion">
            <summary class="account-order-accordion__summary">
              <div class="account-purchase-item__top">
                <span class="account-purchase-item__id">${escHtml(tr("Заявка №", "Заявка №"))}${escHtml(String(row.id))}</span>
                <span class="account-purchase-item__date">${escHtml(formatDate(row.createdAt))}</span>
              </div>
              <div class="account-purchase-item__sum">${escHtml(formatMoneyUAH(row.orderTotal))}</div>
              <div class="account-purchase-item__meta">${escHtml(statusLabel(row.status))} · ${escHtml(String(row.source || tr("сайт", "сайт")))}</div>
            </summary>
            <div class="account-order-accordion__content">
              <div class="account-purchase-item__meta">${escHtml(tr("Оплата", "Оплата"))}: ${payMeta}</div>
              <div class="account-purchase-item__meta">${escHtml(tr("Доставка", "Доставка"))}: ${escHtml(deliveryText(row))}</div>
              ${
                lines
                  ? `<ul class="account-purchase-item__lines account-order-lines">${lines}</ul>`
                  : `<div class="account-purchase-item__meta">${escHtml(
                      tr("Состав заказа отсутствует", "Склад замовлення відсутній")
                    )}</div>`
              }
            </div>
          </details>
        </article>`;
      })
      .join("");
  }

  async function init() {
    const statusEl = document.getElementById("account-orders-status");
    if (!getToken()) {
      window.location.replace("auth.html");
      return;
    }
    if (statusEl) statusEl.textContent = tr("Загрузка…", "Завантаження…");
    try {
      const data = await apiAuth("GET", "/api/auth/my-purchases");
      renderOrders(data.items || []);
      if (statusEl) statusEl.textContent = `${tr("Всего заявок", "Усього заявок")}: ${(data.items || []).length}`;
    } catch (e) {
      if (e.message === "no_token") {
        window.location.replace("auth.html");
        return;
      }
      if (statusEl) {
        statusEl.textContent = e.message || tr("Не удалось загрузить заявки.", "Не вдалося завантажити заявки.");
        statusEl.classList.add("account-status--err");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
