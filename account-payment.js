(function () {
  if (document.body?.dataset?.page !== "account-payment") return;

  const AP = {
    ru: {
      linkLogin: "Войти",
      linkCabinet: "Кабинет",
      statusGuest: "Войдите, чтобы оформить оплату LiqPay из профиля (телефон в кабинете обязателен).",
      errLoad: "Не удалось загрузить условия оплаты. Попробуйте позже.",
      needLoginFirst: "Сначала войдите в кабинет.",
      needAccept: "Нужно согласие с офертой.",
      badAmount: "Укажите корректную сумму.",
      creating: "Создаём платёж…",
      liqError: "Ошибка оформления.",
      goLiq: "Переход на LiqPay…",
      networkErr: "Нет связи с сервером.",
      returnMsg: "Возврат с LiqPay. Если оплата прошла, менеджер увидит статус в CRM.",
      liqSandbox: "Режим sandbox: тестовая оплата LiqPay.",
      liqRedirect: "Перенаправление на защищённую страницу LiqPay.",
      liqLogin: "Войдите в кабинет, чтобы оплатить картой через LiqPay.",
      liqEnv: 'Настройте LiqPay в <code>.env</code> (<code>LIQPAY_PUBLIC_KEY</code>, <code>LIQPAY_PRIVATE_KEY</code>).',
      copy: "Копировать",
      copied: "Скопировано",
      copyErr: "Не удалось скопировать. Выделите текст вручную.",
      recipient: "Получатель",
      edrpou: "ЕДРПОУ",
      iban: "IBAN",
      bank: "Банк",
      mfo: "МФО",
      docTitle: "DP Coatings — оплата (личный кабинет)",
      metaDesc: "Онлайн-оплата LiqPay или реквизиты IBAN. Публичная оферта.",
    },
    uk: {
      linkLogin: "Увійти",
      linkCabinet: "Кабінет",
      statusGuest: "Увійдіть, щоб оформити оплату LiqPay з профілю (телефон у кабінеті обов’язковий).",
      errLoad: "Не вдалося завантажити умови оплати. Спробуйте пізніше.",
      needLoginFirst: "Спочатку увійдіть у кабінет.",
      needAccept: "Потрібна згода з офертою.",
      badAmount: "Вкажіть коректну суму.",
      creating: "Створюємо платіж…",
      liqError: "Помилка замовлення.",
      goLiq: "Перехід на LiqPay…",
      networkErr: "Немає зв’язку з сервером.",
      returnMsg: "Повернення з LiqPay. Якщо оплата пройшла, менеджер побачить статус у CRM.",
      liqSandbox: "Режим sandbox: тестова оплата LiqPay.",
      liqRedirect: "Перенаправлення на захищену сторінку LiqPay.",
      liqLogin: "Увійдіть у кабінет, щоб оплатити карткою через LiqPay.",
      liqEnv: 'Налаштуйте LiqPay у <code>.env</code> (<code>LIQPAY_PUBLIC_KEY</code>, <code>LIQPAY_PRIVATE_KEY</code>).',
      copy: "Копіювати",
      copied: "Скопійовано",
      copyErr: "Не вдалося скопіювати. Виділіть текст вручну.",
      recipient: "Отримувач",
      edrpou: "ЄДРПОУ",
      iban: "IBAN",
      bank: "Банк",
      mfo: "МФО",
      docTitle: "DP Coatings — оплата (кабінет)",
      metaDesc: "Онлайн-оплата LiqPay або реквізити IBAN. Публічна оферта.",
    },
  };

  function apayLocale() {
    if (window.getDpLang) return getDpLang() === "uk" ? "uk" : "ru";
    return "ru";
  }

  function apayT(k) {
    const row = AP[apayLocale()] || AP.ru;
    return row[k] != null ? row[k] : AP.ru[k] || k;
  }

  try {
    document.title = apayT("docTitle");
  } catch {
    /* ignore */
  }
  try {
    const metaD = document.querySelector('meta[name="description"]');
    if (metaD) metaD.setAttribute("content", apayT("metaDesc"));
  } catch {
    /* ignore */
  }
  {
    const liqHint0 = document.getElementById("apay-liqpay-hint");
    if (liqHint0) liqHint0.innerHTML = apayT("liqEnv");
  }

  const token = localStorage.getItem("authToken");

  function syncApayAccountIcon() {
    const trigger = document.getElementById("home-account-trigger");
    if (!trigger) return;
    if (!localStorage.getItem("authToken")) {
      trigger.setAttribute("href", "auth.html?next=" + encodeURIComponent("account-payment.html"));
      trigger.setAttribute("aria-label", apayT("linkLogin"));
    } else {
      trigger.setAttribute("href", "account.html");
      trigger.setAttribute("aria-label", apayT("linkCabinet"));
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncApayAccountIcon);
  } else {
    syncApayAccountIcon();
  }
  window.addEventListener("dp-auth-changed", syncApayAccountIcon);

  if (!token) {
    const st = document.getElementById("apay-status");
    if (st) {
      st.textContent = apayT("statusGuest");
    }
  }

  function apiUrl(p) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
  }

  function setStatus(msg, err) {
    const el = document.getElementById("apay-status");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = err ? "#b91c1c" : "#0f172a";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function copyToClipboard(t) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
    return Promise.reject();
  }

  async function loadConfig() {
    const l = apayLocale();
    const path = "/api/payment/config";
    const base = apiUrl(path);
    const join = base.includes("?") ? "&" : "?";
    const url = `${base}${join}lang=${encodeURIComponent(l === "uk" ? "uk" : "ru")}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("config");
    return r.json();
  }

  function renderIban(iban) {
    const root = document.getElementById("apay-iban-list");
    if (!root || !iban) return;
    const rows = [
      [apayT("recipient"), iban.recipient],
      [apayT("edrpou"), iban.edrpou],
      [apayT("iban"), iban.iban],
      [apayT("bank"), iban.bank],
      [apayT("mfo"), iban.mfo],
    ];
    root.innerHTML = rows
      .map(([k, v]) => {
        const val = String(v || "—");
        if (val === "—")
          return `<div><dt>${escapeHtml(k)}</dt><dd>—</dd></div>`;
        return `<div><dt>${escapeHtml(k)}</dt><dd><span class="apay-iban-value">${escapeHtml(
          val
        )}</span> <button type="button" class="apay-copy" data-copy="${escapeHtml(
          val
        )}">${escapeHtml(apayT("copy"))}</button></dd></div>`;
      })
      .join("");

    root.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-copy") || "";
        copyToClipboard(t).then(
          () => {
            const prev = btn.textContent;
            btn.textContent = apayT("copied");
            setTimeout(() => {
              btn.textContent = prev;
            }, 1600);
          },
          () => setStatus(apayT("copyErr"), true)
        );
      });
    });
  }

  (async () => {
    try {
      const cfg = await loadConfig();
      const offerBox = document.getElementById("apay-offer-body");
      const titleEl = document.getElementById("apay-offer-title");
      if (titleEl && cfg.offerTitle) titleEl.textContent = cfg.offerTitle;
      if (offerBox && cfg.offerHtml) offerBox.innerHTML = cfg.offerHtml;
      renderIban(cfg.iban);

      const liqBlock = document.getElementById("apay-liqpay-block");
      const liqHint = document.getElementById("apay-liqpay-hint");
      const liqForm = document.getElementById("apay-liqpay-form");
      if (cfg.liqpayEnabled && token) {
        if (liqHint) {
          liqHint.textContent = cfg.liqpaySandbox ? apayT("liqSandbox") : apayT("liqRedirect");
        }
        if (liqForm) liqForm.hidden = false;
      } else {
        if (liqHint) {
          if (!token) {
            liqHint.textContent = apayT("liqLogin");
          } else if (!cfg.liqpayEnabled) {
            liqHint.innerHTML = apayT("liqEnv");
          }
        }
        if (liqForm) liqForm.hidden = !token || !cfg.liqpayEnabled;
      }
    } catch {
      setStatus(apayT("errLoad"), true);
    }
  })();

  const liqForm = document.getElementById("apay-liqpay-form");
  if (liqForm) {
    liqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!token) {
        setStatus(apayT("needLoginFirst"), true);
        return;
      }
      const amount = Number(liqForm.amount.value);
      const description = String(liqForm.description.value || "").trim();
      const accept = liqForm.querySelector("#apay-accept")?.checked;
      if (!accept) {
        setStatus(apayT("needAccept"), true);
        return;
      }
      if (!Number.isFinite(amount) || amount < 1) {
        setStatus(apayT("badAmount"), true);
        return;
      }
      setStatus(apayT("creating"));
      const sub = liqForm.querySelector("#apay-liqpay-submit");
      if (sub) sub.disabled = true;
      try {
        const r = await fetch(apiUrl("/api/payments/liqpay/invoice"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount, description, acceptOffer: true }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus(d.message || apayT("liqError"), true);
          return;
        }
        const form = document.getElementById("apay-hidden-liqpay");
        if (!form) return;
        form.action = d.action || "https://www.liqpay.ua/api/3/checkout";
        const dIn = form.querySelector('input[name="data"]');
        const sIn = form.querySelector('input[name="signature"]');
        if (dIn) dIn.value = d.data;
        if (sIn) sIn.value = d.signature;
        setStatus(apayT("goLiq"));
        form.submit();
      } catch (err) {
        setStatus(err?.message || apayT("networkErr"), true);
      } finally {
        if (sub) sub.disabled = false;
      }
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.get("liqpay") === "return") {
    setStatus(apayT("returnMsg"));
  }
})();
