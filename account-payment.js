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
      deliveryCityRequired: "Укажите город доставки.",
      deliveryWarehouseRequired: "Укажите отделение Новой Почты.",
      deliveryAddressRequired: "Укажите номер или комментарий заявки курьера НП.",
      deliveryCourierNpConfirmRequired: "Подтвердите, что оформили доставку через сервис Новой Почты.",
      creating: "Создаём платёж…",
      liqError: "Ошибка оформления.",
      goLiq: "Переход на страницу оплаты…",
      networkErr: "Нет связи с сервером.",
      returnMsg: "Возврат со страницы оплаты. Если оплата прошла, менеджер увидит статус в CRM.",
      liqSandbox: "Режим sandbox: тестовая оплата.",
      liqRedirect: "Перенаправление на защищённую страницу оплаты.",
      liqLogin: "Войдите в кабинет, чтобы оплатить картой.",
      liqEnv: "Не найден ни один настроенный платёжный провайдер в .env.",
      copy: "Копировать",
      copied: "Скопировано",
      copyErr: "Не удалось скопировать. Выделите текст вручную.",
      cartEmpty: "Корзина пуста. Добавьте товары перед оплатой.",
      toCatalog: "Перейти в каталог",
      remove: "Удалить",
      totalPay: "Итого к оплате",
      payerTypeLabel: "Тип плательщика",
      payerIndividual: "Физическое лицо",
      payerLegal: "Юридическое лицо",
      priceModeLabel: "Режим цены",
      priceRetail: "Без НДС",
      priceWholesale: "С НДС",
      priceMixed: "Смешанный",
      packBucket: "Ведро",
      packDrum: "Барабан",
      packJar: "Банка",
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
      deliveryCityRequired: "Вкажіть місто доставки.",
      deliveryWarehouseRequired: "Вкажіть відділення Нової Пошти.",
      deliveryAddressRequired: "Вкажіть номер або коментар заявки кур'єра НП.",
      deliveryCourierNpConfirmRequired: "Підтвердіть, що оформили доставку через сервіс Нової Пошти.",
      creating: "Створюємо платіж…",
      liqError: "Помилка замовлення.",
      goLiq: "Перехід на сторінку оплати…",
      networkErr: "Немає зв’язку з сервером.",
      returnMsg: "Повернення зі сторінки оплати. Якщо оплата пройшла, менеджер побачить статус у CRM.",
      liqSandbox: "Режим sandbox: тестова оплата.",
      liqRedirect: "Перенаправлення на захищену сторінку оплати.",
      liqLogin: "Увійдіть у кабінет, щоб оплатити карткою.",
      liqEnv: "Не знайдено жодного налаштованого платіжного провайдера в .env.",
      copy: "Копіювати",
      copied: "Скопійовано",
      copyErr: "Не вдалося скопіювати. Виділіть текст вручну.",
      cartEmpty: "Кошик порожній. Додайте товари перед оплатою.",
      toCatalog: "Перейти до каталогу",
      remove: "Видалити",
      totalPay: "Разом до сплати",
      payerTypeLabel: "Тип платника",
      payerIndividual: "Фізична особа",
      payerLegal: "Юридична особа",
      priceModeLabel: "Режим ціни",
      priceRetail: "Без ПДВ",
      priceWholesale: "З ПДВ",
      priceMixed: "Змішаний",
      packBucket: "Відро",
      packDrum: "Барабан",
      packJar: "Банка",
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

  function fmtUAH(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0 грн";
    return `${v.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} грн`;
  }

  let hasOrderItems = false;
  const deliveryState = {
    npConfigured: false,
    majorCities: [],
    cityRef: "",
    citySuggestions: [],
    warehouseRef: "",
    warehouseSuggestions: [],
    citySuggestTimer: null,
  };

  function isLegalPayerFromProfile() {
    try {
      const u = JSON.parse(localStorage.getItem("authUser") || "null");
      return Boolean(u?.profile?.isLegalEntity);
    } catch {
      return false;
    }
  }

  function resolvePriceModeLabel() {
    return isLegalPayerFromProfile() ? apayT("priceWholesale") : apayT("priceRetail");
  }

  function getProductsMap() {
    const arr = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
    const map = new Map();
    for (const p of arr) {
      const id = String(p?.id || "").trim();
      if (id) map.set(id, p);
    }
    return map;
  }

  function packLabel(packType) {
    if (packType === "bucket") return apayT("packBucket");
    if (packType === "drum") return apayT("packDrum");
    return apayT("packJar");
  }

  function buildPaymentOrder() {
    const raw = typeof window.dpGetCartItems === "function" ? window.dpGetCartItems() : [];
    const products = getProductsMap();
    const legal = isLegalPayerFromProfile();
    const cartItems = [];
    const lines = [];
    let total = 0;
    for (const [rawIndex, item] of (Array.isArray(raw) ? raw : []).entries()) {
      const productId = String(item?.productId || "").trim();
      const p = products.get(productId);
      if (!p) continue;
      const qty = Math.max(1, Number(item?.qty || 1) || 1);
      const packType = String(item?.packType || "jar").trim();
      const customKg = packType === "jar" ? Number(item?.customKg || 0) : 0;
      const weight =
        packType === "bucket"
          ? Number(p.bucketKg || 0)
          : packType === "drum"
            ? Number(p.drumKg || 0)
            : Number(item?.customKg || p.jarKg || 0);
      const unit = legal
        ? Number(p.priceNdsPerKg ?? p.priceNoNdsPerKg ?? 0)
        : Number(p.priceNoNdsPerKg ?? p.priceNdsPerKg ?? 0);
      const lineTotal = Math.round(Math.max(0, unit * Math.max(0, weight) * qty) * 100) / 100;
      total += lineTotal;
      const details = `${String(p.variant || "").trim() || "—"} · ${packLabel(packType)} ${weight || "—"} кг · ${resolvePriceModeLabel()} × ${qty}`;
      lines.push({
        index: rawIndex,
        title: String(p.title || p.name || p.code || p.id || "—"),
        details,
        qty,
        image: String(p.image || "assets/product-template.png"),
        lineTotal,
        sumLabel: fmtUAH(lineTotal),
      });
      cartItems.push({
        productId,
        packType: packType === "bucket" || packType === "drum" ? packType : "jar",
        qty,
        customKg: Number.isFinite(customKg) && customKg > 0 ? customKg : null,
      });
    }
    return {
      legal,
      cartItems,
      lines,
      orderTotal: Math.round(total * 100) / 100,
      cartSnapshot: lines.map((x) => ({
        title: x.title,
        details: x.details,
        qty: x.qty,
        lineTotal: x.lineTotal,
      })),
    };
  }

  function syncPayButtonState() {
    const liqForm = document.getElementById("apay-liqpay-form");
    if (!liqForm) return;
    const acceptCheckbox = liqForm.querySelector("#apay-accept");
    const submitBtn = liqForm.querySelector("#apay-liqpay-submit");
    if (!submitBtn) return;
    const accepted = Boolean(acceptCheckbox?.checked);
    submitBtn.disabled = !accepted || !hasOrderItems;
  }

  function syncOrderFromCart() {
    const root = document.getElementById("apay-order-items");
    const totalEl = document.getElementById("apay-order-total");
    const ctxEl = document.getElementById("apay-order-context");
    const amountInput = document.querySelector('#apay-liqpay-form input[name="amount"]');
    if (!root || !totalEl) return;
    const order = buildPaymentOrder();
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    hasOrderItems = lines.length > 0;
    if (!hasOrderItems) {
      root.innerHTML = `
        <p class="apay-order-empty">${escapeHtml(apayT("cartEmpty"))}</p>
        <p class="apay-order-empty-action">
          <a class="btn btn-ghost apay-order-catalog-btn" href="products.html">${escapeHtml(apayT("toCatalog"))}</a>
        </p>
      `;
      totalEl.textContent = fmtUAH(0);
      if (ctxEl) ctxEl.textContent = "";
      if (amountInput) amountInput.value = "";
      syncPayButtonState();
      return;
    }
    if (ctxEl) {
      const payerType = order.legal ? apayT("payerLegal") : apayT("payerIndividual");
      const priceMode = resolvePriceModeLabel();
      ctxEl.innerHTML = `
        <span class="apay-order-badge"><span>${escapeHtml(apayT("payerTypeLabel"))}:</span> <strong>${escapeHtml(payerType)}</strong></span>
        <span class="apay-order-badge"><span>${escapeHtml(apayT("priceModeLabel"))}:</span> <strong>${escapeHtml(priceMode)}</strong></span>
      `;
    }
    root.innerHTML = lines
      .map((line) => {
        const idx = Number(line.index);
        const qty = Number(line.qty || 1);
        const image = escapeHtml(String(line.image || "assets/product-template.png"));
        return `<article class="apay-order-item" role="listitem">
          <img src="${image}" alt="" onerror="this.onerror=null;this.src='assets/product-template.png';" />
          <div>
            <p class="apay-order-item-title">${escapeHtml(line.title || "—")}</p>
            <p class="apay-order-item-meta">${escapeHtml(line.details || "")}</p>
            <div class="apay-order-item-actions">
              <button class="apay-order-qty-btn" type="button" data-dec="${idx}" aria-label="−">−</button>
              <strong>${qty}</strong>
              <button class="apay-order-qty-btn" type="button" data-inc="${idx}" aria-label="+">+</button>
              <button class="apay-order-remove" type="button" data-remove="${idx}">${escapeHtml(apayT("remove"))}</button>
            </div>
          </div>
          <div class="apay-order-item-sum">${escapeHtml(line.sumLabel || fmtUAH(0))}</div>
        </article>`;
      })
      .join("");
    totalEl.textContent = fmtUAH(order.orderTotal || 0);
    if (amountInput) amountInput.value = String(order.orderTotal || "");
    syncPayButtonState();
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

  function linkOfferPhraseInText(offerBox) {
    if (!offerBox) return;
    const walker = document.createTreeWalker(offerBox, NodeFilter.SHOW_TEXT);
    const phrases = ["публичного договора", "публічного договору"];
    let changed = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = String(node.nodeValue || "");
      const lower = text.toLowerCase();
      const phrase = phrases.find((p) => lower.includes(p));
      if (!phrase) continue;
      const idx = lower.indexOf(phrase);
      if (idx < 0) continue;
      const before = text.slice(0, idx);
      const matched = text.slice(idx, idx + phrase.length);
      const after = text.slice(idx + phrase.length);
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      const a = document.createElement("a");
      a.href = "offer.html";
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = matched;
      frag.appendChild(a);
      if (after) frag.appendChild(document.createTextNode(after));
      node.parentNode?.replaceChild(frag, node);
      changed = true;
      break;
    }
    if (!changed) {
      const firstParagraph = offerBox.querySelector("p");
      if (firstParagraph) {
        const space = document.createTextNode(" ");
        const a = document.createElement("a");
        a.href = "offer.html";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = apayLocale() === "uk" ? "публічного договору" : "публичного договора";
        firstParagraph.appendChild(space);
        firstParagraph.appendChild(a);
      }
    }
  }

  function syncDeliveryFields() {
    const methodEl = document.getElementById("apay-delivery-method");
    const cityWrap = document.getElementById("apay-delivery-city-wrap");
    const whWrap = document.getElementById("apay-delivery-warehouse-wrap");
    const addressWrap = document.getElementById("apay-delivery-address-wrap");
    const commentWrap = document.getElementById("apay-delivery-comment-wrap");
    const courierNpHint = document.getElementById("apay-courier-np-hint");
    const courierNpLinkWrap = document.getElementById("apay-courier-np-link-wrap");
    const courierNpConfirmWrap = document.getElementById("apay-courier-np-confirm-wrap");
    const npHint = document.getElementById("apay-np-fallback-hint");
    const method = String(methodEl?.value || "nova_poshta");
    const npMode = method === "nova_poshta";
    const courierMode = method === "courier";
    const pickupMode = method === "pickup";
    if (cityWrap) cityWrap.hidden = pickupMode;
    if (whWrap) whWrap.hidden = !npMode;
    if (addressWrap) addressWrap.hidden = !courierMode;
    if (commentWrap) commentWrap.hidden = !pickupMode;
    if (courierNpHint) courierNpHint.hidden = !courierMode;
    if (courierNpLinkWrap) courierNpLinkWrap.hidden = !courierMode;
    if (courierNpConfirmWrap) courierNpConfirmWrap.hidden = !courierMode;
    if (npHint) npHint.hidden = !(npMode && !deliveryState.npConfigured);
    if (!npMode) {
      deliveryState.cityRef = "";
      deliveryState.warehouseRef = "";
      deliveryState.warehouseSuggestions = [];
      fillDataList("apay-delivery-warehouse-list", []);
    }
  }

  function readDeliveryPayload() {
    const method = String(document.getElementById("apay-delivery-method")?.value || "nova_poshta");
    const city = getDeliveryCityValue();
    const warehouse = String(document.getElementById("apay-delivery-warehouse")?.value || "").trim();
    const address = String(document.getElementById("apay-delivery-address")?.value || "").trim();
    const courierNpConfirmed = Boolean(document.getElementById("apay-courier-np-confirm")?.checked);
    const comment = String(document.getElementById("apay-delivery-comment")?.value || "").trim();
    if (method !== "pickup" && !city) {
      return { error: apayT("deliveryCityRequired") };
    }
    if (method === "nova_poshta" && !warehouse) {
      return { error: apayT("deliveryWarehouseRequired") };
    }
    if (method === "courier" && !address) {
      return { error: apayT("deliveryAddressRequired") };
    }
    if (method === "courier" && !courierNpConfirmed) {
      return { error: apayT("deliveryCourierNpConfirmRequired") };
    }
    return {
      value: {
        method,
        city: method === "pickup" ? null : city,
        cityRef: method === "nova_poshta" ? (deliveryState.cityRef || null) : null,
        warehouse: method === "nova_poshta" ? warehouse : null,
        warehouseRef: method === "nova_poshta" ? (deliveryState.warehouseRef || null) : null,
        address: method === "courier" ? address : null,
        courierNpConfirmed: method === "courier" ? courierNpConfirmed : null,
        comment: method === "pickup" ? comment || null : null,
      },
    };
  }

  function getDeliveryCityValue() {
    const sel = document.getElementById("apay-delivery-city-select");
    const cityInput = document.getElementById("apay-delivery-city");
    if (sel && sel.value && sel.value !== "__other__") {
      const idx = sel.selectedIndex;
      const opt = idx >= 0 ? sel.options[idx] : null;
      return String(opt?.textContent || "").trim();
    }
    return String(cityInput?.value || "").trim();
  }

  function fillDeliveryCitySelect() {
    const sel = document.getElementById("apay-delivery-city-select");
    if (!sel) return;
    const rows = Array.isArray(deliveryState.majorCities) ? deliveryState.majorCities : [];
    const opts = [
      `<option value="">${escapeHtml(apayLocale() === "uk" ? "Оберіть місто" : "Выберите город")}</option>`,
      ...rows.map((row, i) => {
        const label = apayLocale() === "uk" ? String(row?.searchUk || row?.searchRu || "") : String(row?.searchRu || row?.searchUk || "");
        return `<option value="c:${i}">${escapeHtml(label)}</option>`;
      }),
      `<option value="__other__">${escapeHtml(
        apayLocale() === "uk" ? "Інше місто (ввести вручну)" : "Другой город (ввести вручную)"
      )}</option>`,
    ];
    sel.innerHTML = opts.join("");
  }

  function ensureDeliveryDataLists() {
    const cityInput = document.getElementById("apay-delivery-city");
    const whInput = document.getElementById("apay-delivery-warehouse");
    if (cityInput && !document.getElementById("apay-delivery-city-list")) {
      const dl = document.createElement("datalist");
      dl.id = "apay-delivery-city-list";
      document.body.appendChild(dl);
      cityInput.setAttribute("list", dl.id);
    }
    if (whInput && !document.getElementById("apay-delivery-warehouse-list")) {
      const dl = document.createElement("datalist");
      dl.id = "apay-delivery-warehouse-list";
      document.body.appendChild(dl);
      whInput.setAttribute("list", dl.id);
    }
  }

  function fillDataList(id, items) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = (Array.isArray(items) ? items : [])
      .slice(0, 80)
      .map((x) => `<option value="${escapeHtml(String(x?.label || ""))}"></option>`)
      .join("");
  }

  function normDpText(v) {
    return String(v || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  async function detectSelectedCityRef() {
    const city = String(document.getElementById("apay-delivery-city")?.value || "").trim();
    const nCity = normDpText(city);
    let row = deliveryState.citySuggestions.find((x) => normDpText(x?.label) === nCity);
    if (!row && city.length >= 2 && deliveryState.npConfigured) {
      const fetched = await fetchNpCities(city).catch(() => []);
      deliveryState.citySuggestions = fetched.map((r) => ({
        ref: String(r?.ref || "").trim(),
        label: String(r?.label || "").trim(),
      }));
      fillDataList("apay-delivery-city-list", deliveryState.citySuggestions);
      row =
        deliveryState.citySuggestions.find((x) => normDpText(x?.label) === nCity) ||
        deliveryState.citySuggestions.find((x) => normDpText(x?.label).startsWith(nCity));
      if (!row && deliveryState.citySuggestions.length === 1) row = deliveryState.citySuggestions[0];
    }
    deliveryState.cityRef = row ? String(row.ref || "").trim() : "";
    deliveryState.warehouseRef = "";
    deliveryState.warehouseSuggestions = [];
    fillDataList("apay-delivery-warehouse-list", []);
    if (deliveryState.npConfigured && deliveryState.cityRef) {
      await loadNpWarehouses(deliveryState.cityRef).catch(() => {});
    }
  }

  function detectSelectedWarehouseRef() {
    const wh = String(document.getElementById("apay-delivery-warehouse")?.value || "").trim();
    const row = deliveryState.warehouseSuggestions.find((x) => String(x?.label || "").trim() === wh);
    deliveryState.warehouseRef = row ? String(row.ref || "").trim() : "";
  }

  async function fetchNpCities(find) {
    const lang = apayLocale() === "uk" ? "uk" : "ru";
    const res = await fetch(apiUrl("/api/shipping/np/cities"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ find, lang }),
    });
    const j = await res.json().catch(() => ({}));
    return Array.isArray(j.items) ? j.items : [];
  }

  async function loadNpWarehouses(cityRef) {
    const lang = apayLocale() === "uk" ? "uk" : "ru";
    const res = await fetch(apiUrl("/api/shipping/np/warehouses"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityRef, lang }),
    });
    const j = await res.json().catch(() => ({}));
    deliveryState.warehouseSuggestions = Array.isArray(j.items) ? j.items : [];
    fillDataList("apay-delivery-warehouse-list", deliveryState.warehouseSuggestions);
  }

  function wireNpDeliveryAutocomplete() {
    ensureDeliveryDataLists();
    const methodEl = document.getElementById("apay-delivery-method");
    const cityInput = document.getElementById("apay-delivery-city");
    const citySelect = document.getElementById("apay-delivery-city-select");
    const whInput = document.getElementById("apay-delivery-warehouse");
    if (!cityInput || !whInput || !methodEl) return;
    citySelect?.addEventListener("change", () => {
      const v = String(citySelect.value || "");
      if (!v) {
        cityInput.hidden = true;
        cityInput.value = "";
        deliveryState.cityRef = "";
        deliveryState.warehouseRef = "";
        fillDataList("apay-delivery-warehouse-list", []);
        return;
      }
      if (v === "__other__") {
        cityInput.hidden = false;
        cityInput.focus();
        return;
      }
      const m = /^c:(\d+)$/.exec(v);
      if (!m) return;
      const row = deliveryState.majorCities[parseInt(m[1], 10)];
      const label = apayLocale() === "uk" ? String(row?.searchUk || row?.searchRu || "") : String(row?.searchRu || row?.searchUk || "");
      cityInput.hidden = true;
      cityInput.value = label;
      void detectSelectedCityRef();
    });
    cityInput.addEventListener("input", () => {
      deliveryState.cityRef = "";
      deliveryState.warehouseRef = "";
      deliveryState.warehouseSuggestions = [];
      fillDataList("apay-delivery-warehouse-list", []);
      if (methodEl.value !== "nova_poshta" || !deliveryState.npConfigured) return;
      const q = cityInput.value.trim();
      clearTimeout(deliveryState.citySuggestTimer);
      if (q.length < 2) {
        deliveryState.citySuggestions = [];
        fillDataList("apay-delivery-city-list", []);
        return;
      }
      deliveryState.citySuggestTimer = setTimeout(async () => {
        const rows = await fetchNpCities(q).catch(() => []);
        deliveryState.citySuggestions = rows.map((r) => ({
          ref: String(r?.ref || "").trim(),
          label: String(r?.label || "").trim(),
        }));
        fillDataList("apay-delivery-city-list", deliveryState.citySuggestions);
      }, 220);
    });
    cityInput.addEventListener("change", () => {
      void detectSelectedCityRef();
    });
    cityInput.addEventListener("blur", () => {
      void detectSelectedCityRef();
    });
    whInput.addEventListener("input", () => {
      deliveryState.warehouseRef = "";
    });
    whInput.addEventListener("change", detectSelectedWarehouseRef);
    whInput.addEventListener("blur", detectSelectedWarehouseRef);
  }

  (async () => {
    try {
      const cfg = await loadConfig();
      const offerBox = document.getElementById("apay-offer-body");
      const titleEl = document.getElementById("apay-offer-title");
      if (titleEl && cfg.offerTitle) titleEl.textContent = cfg.offerTitle;
      if (offerBox && cfg.offerHtml) {
        offerBox.innerHTML = cfg.offerHtml;
        linkOfferPhraseInText(offerBox);
      }
      renderIban(cfg.iban);

      const liqHint = document.getElementById("apay-liqpay-hint");
      const liqForm = document.getElementById("apay-liqpay-form");
      const providers = cfg.paymentProviders && typeof cfg.paymentProviders === "object" ? cfg.paymentProviders : {};
      const providerSel = document.getElementById("apay-provider");
      if (providerSel) {
        const options = [
          { id: "fondy", label: "Fondy" },
          { id: "wayforpay", label: "WayForPay" },
          { id: "liqpay", label: "LiqPay" },
        ];
        providerSel.innerHTML = options
          .map((o) => {
            const on = providers[o.id]?.configured;
            return `<option value="${o.id}"${on ? "" : " disabled"}>${o.label}${on ? "" : " (не настроен)"}</option>`;
          })
          .join("");
        const def = String(cfg.defaultProvider || "fondy");
        if ([...providerSel.options].some((x) => x.value === def && !x.disabled)) providerSel.value = def;
        else {
          const firstEnabled = [...providerSel.options].find((x) => !x.disabled);
          if (firstEnabled) providerSel.value = firstEnabled.value;
        }
      }
      const hasAnyProvider = Boolean(providers.fondy?.configured || providers.wayforpay?.configured || providers.liqpay?.configured);
      if (hasAnyProvider && token) {
        if (liqHint) {
          liqHint.textContent = cfg.liqpaySandbox ? apayT("liqSandbox") : apayT("liqRedirect");
        }
        if (liqForm) liqForm.hidden = false;
      } else {
        if (liqHint) {
          if (!token) {
            liqHint.textContent = apayT("liqLogin");
          } else if (!hasAnyProvider) {
            liqHint.innerHTML = apayT("liqEnv");
          }
        }
        if (liqForm) liqForm.hidden = !token || !hasAnyProvider;
      }
      try {
        const citiesRes = await fetch(apiUrl("/api/shipping/ua-major-cities"), { cache: "no-store" });
        const citiesJson = await citiesRes.json().catch(() => ({}));
        deliveryState.majorCities = Array.isArray(citiesJson?.items) ? citiesJson.items : [];
      } catch {
        deliveryState.majorCities = [];
      }
      fillDeliveryCitySelect();
      try {
        const npStatus = await fetch(apiUrl("/api/shipping/np/status"), { cache: "no-store" });
        const npJson = await npStatus.json().catch(() => ({}));
        deliveryState.npConfigured = Boolean(npJson?.configured);
      } catch {
        deliveryState.npConfigured = false;
      }
      wireNpDeliveryAutocomplete();
      syncDeliveryFields();
    } catch {
      setStatus(apayT("errLoad"), true);
    }
  })();

  document.getElementById("apay-delivery-method")?.addEventListener("change", syncDeliveryFields);
  document.getElementById("apay-delivery-method")?.addEventListener("change", () => {
    const method = String(document.getElementById("apay-delivery-method")?.value || "");
    if (method === "nova_poshta") void detectSelectedCityRef();
  });
  syncDeliveryFields();

  const liqForm = document.getElementById("apay-liqpay-form");
  const orderRoot = document.getElementById("apay-order-items");
  orderRoot?.addEventListener("click", (e) => {
    const dec = e.target.closest("[data-dec]");
    if (dec) {
      const idx = Number(dec.getAttribute("data-dec"));
      const current = (typeof window.dpCheckoutGetCart === "function" ? window.dpCheckoutGetCart().lines : []).find((x) => x.index === idx);
      if (!current) return;
      const next = Math.max(1, Number(current.qty || 1) - 1);
      window.dpCheckoutSetQty?.(idx, next);
      syncOrderFromCart();
      return;
    }
    const inc = e.target.closest("[data-inc]");
    if (inc) {
      const idx = Number(inc.getAttribute("data-inc"));
      const current = (typeof window.dpCheckoutGetCart === "function" ? window.dpCheckoutGetCart().lines : []).find((x) => x.index === idx);
      if (!current) return;
      const next = Math.max(1, Number(current.qty || 1) + 1);
      window.dpCheckoutSetQty?.(idx, next);
      syncOrderFromCart();
      return;
    }
    const rem = e.target.closest("[data-remove]");
    if (rem) {
      const idx = Number(rem.getAttribute("data-remove"));
      window.dpCheckoutRemove?.(idx);
      syncOrderFromCart();
    }
  });

  syncOrderFromCart();
  window.addEventListener("dp-cart-changed", syncOrderFromCart);
  window.addEventListener("dp-catalog-updated", syncOrderFromCart);

  if (liqForm) {
    const acceptCheckbox = liqForm.querySelector("#apay-accept");
    const submitBtn = liqForm.querySelector("#apay-liqpay-submit");
    acceptCheckbox?.addEventListener("change", syncPayButtonState);
    syncPayButtonState();

    liqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!token) {
        setStatus(apayT("needLoginFirst"), true);
        return;
      }
      const order = buildPaymentOrder();
      const amount = Number(liqForm.amount.value);
      const description = String(liqForm.description.value || "").trim();
      const provider = String(liqForm.provider?.value || "fondy").trim();
      const accept = liqForm.querySelector("#apay-accept")?.checked;
      const delivery = readDeliveryPayload();
      if (!hasOrderItems) {
        setStatus(apayT("cartEmpty"), true);
        return;
      }
      if (delivery.error) {
        setStatus(delivery.error, true);
        return;
      }
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
        const r = await fetch(apiUrl("/api/payments/invoice"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            provider,
            amount,
            description,
            acceptOffer: true,
            customerType: order.legal ? "legal" : "individual",
            isLegalEntityBuyer: Boolean(order.legal),
            cartItems: order.cartItems,
            cartSnapshot: order.cartSnapshot,
            orderTotal: order.orderTotal,
            delivery: delivery.value,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus(d.message || apayT("liqError"), true);
          return;
        }
        if (d.redirectUrl) {
          setStatus(apayT("goLiq"));
          location.href = String(d.redirectUrl);
          return;
        }
        const form = document.getElementById("apay-hidden-gateway");
        if (!form) return;
        form.method = String(d.method || "POST").toUpperCase();
        form.action = String(d.action || "").trim();
        form.innerHTML = "";
        const fields = d.fields && typeof d.fields === "object" ? d.fields : {};
        for (const [k, v] of Object.entries(fields)) {
          if (Array.isArray(v)) {
            v.forEach((item) => {
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = `${k}[]`;
              input.value = String(item ?? "");
              form.appendChild(input);
            });
          } else {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = k;
            input.value = String(v ?? "");
            form.appendChild(input);
          }
        }
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
  if (params.get("liqpay") === "return" || params.get("pay") === "return") {
    setStatus(apayT("returnMsg"));
  }
})();
