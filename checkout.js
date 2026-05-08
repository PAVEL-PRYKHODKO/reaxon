/* global t, formatMoney, escapeHtml, getDpLang */
(function () {
  function api(path) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(path) : path;
  }

  function npLang() {
    if (window.getDpLang && getDpLang() === "uk") return "uk";
    return "ru";
  }

  const state = {
    npConfigured: false,
    majorCities: [],
    cityRef: "",
    cityLabel: "",
    warehouseRef: "",
    warehouseLabel: "",
    citySuggestTimer: null,
    tab: "new",
  };

  let citySuggestOpen = false;
  const CHECKOUT_DRAFT_COOKIE = "dp_checkout_draft_v1";

  function $(id) {
    return document.getElementById(id);
  }

  function setCookie(name, value, days) {
    const maxAge = Math.max(1, Number(days || 30)) * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  }

  function getCookie(name) {
    const key = `${name}=`;
    const parts = String(document.cookie || "").split(";").map((x) => x.trim());
    const row = parts.find((p) => p.startsWith(key));
    if (!row) return "";
    return decodeURIComponent(row.slice(key.length));
  }

  function isNovaDelivery() {
    return ($("co-delivery") && $("co-delivery").value) === "nova_poshta";
  }

  function syncNewsletterConsentUi() {
    const cb = $("co-newsletter");
    if (!cb) return;
    cb.disabled = false;
    cb.title = "";
  }

  function hasCityComplete() {
    const sel = $("co-city-select");
    if (!sel || !sel.value) return false;
    if (/^p:/.test(sel.value)) {
      return Boolean(String(state.cityLabel || sel.options[sel.selectedIndex]?.textContent || "").trim());
    }
    if (sel.value === "__other__") {
      if (state.npConfigured) {
        return Boolean(state.cityRef && state.cityLabel);
      }
      const manual = ($("co-city") && $("co-city").value.trim()) || "";
      return manual.length >= 2 || Boolean(state.cityLabel);
    }
    if (/^c:\d+$/.test(sel.value)) {
      if (state.npConfigured) {
        return Boolean(state.cityRef && state.cityLabel);
      }
      return Boolean(String(state.cityLabel || "").trim());
    }
    return false;
  }

  function getDeliveryLineText() {
    const sel = $("co-delivery");
    const dmv = (sel && sel.value) || "nova_poshta";
    const key = {
      nova_poshta: "checkoutDeliveryNP",
      ukrposhta: "checkoutDeliveryUkrposhta",
      meest: "checkoutDeliveryMeest",
      autolux: "checkoutDeliveryAutolux",
      pickup: "checkoutDeliveryPickup",
      courier: "checkoutDeliveryCourier",
      agreement: "checkoutDeliveryOther",
      other: "checkoutDeliveryOther",
    }[dmv];
    const title = key ? t(key) : dmv;
    if (isNovaDelivery()) {
      if (state.warehouseRef && state.warehouseLabel) {
        return `${title}: ${state.warehouseLabel}`;
      }
      if (!state.npConfigured && state.warehouseLabel) {
        return `${title}: ${state.warehouseLabel}`;
      }
      return t("checkoutDeliveryTbd");
    }
    if (state.warehouseLabel) {
      return `${title}: ${state.warehouseLabel}`;
    }
    return title;
  }

  function setNpWarehouseHint(keyOrEmpty) {
    const el = $("co-warehouse-np-hint");
    if (!el) return;
    if (!keyOrEmpty) {
      el.classList.add("is-hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("is-hidden");
    el.textContent = t(keyOrEmpty);
  }

  function refreshDisabled() {
    const ok = hasCityComplete();
    const isNv = isNovaDelivery();
    const useNpSelect = ok && isNv && state.npConfigured;
    const useManual = !useNpSelect;
    const delBlock = $("co-delivery-block");
    const del = $("co-delivery");
    const wh = $("co-warehouse");
    const whMan = $("co-warehouse-manual");
    const whNp = $("co-np-warehouse-wrap");
    const lbl = $("co-warehouse-row-label");

    if (delBlock) delBlock.classList.toggle("checkout-block-muted", !ok);
    if (del) del.disabled = !ok;

    if (whNp) whNp.classList.toggle("is-hidden", !useNpSelect);
    if (whMan) {
      whMan.classList.toggle("is-hidden", !useManual);
      whMan.disabled = !useManual || !ok;
    }
    if (wh) {
      wh.classList.remove("is-hidden");
      wh.disabled = !useNpSelect || (useNpSelect && !state.cityRef);
    }
    if (lbl) {
      if (useNpSelect) lbl.setAttribute("for", "co-warehouse");
      else lbl.setAttribute("for", "co-warehouse-manual");
    }

    if (!useNpSelect) {
      setNpWarehouseHint("");
    }
  }

  /** Реквизиты юрособи в сохранённом профиле (после /api/auth/me). */
  function checkoutLegalBillingProfileComplete() {
    try {
      if (typeof window.dpProfileIsLegalEntity !== "function" || !window.dpProfileIsLegalEntity()) return true;
      const u = JSON.parse(localStorage.getItem("authUser") || "null");
      const pr = u?.profile || {};
      const company = String(pr.companyName || "").trim();
      const invMail = String(pr.invoiceEmail || "").trim() || String(u?.email || "").trim();
      const adr = String(pr.legalAddress || "").trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invMail);
      return company.length >= 2 && emailOk && adr.length >= 5;
    } catch {
      return false;
    }
  }

  function checkoutBillingPayloadFromStoredProfile() {
    try {
      if (typeof window.dpAuthCustomerLoggedIn !== "function" || !window.dpAuthCustomerLoggedIn()) {
        return { isLegalEntityBuyer: false };
      }
      const u = JSON.parse(localStorage.getItem("authUser") || "null");
      const pr = u?.profile || {};
      const invMail = String(pr.invoiceEmail || "").trim() || String(u?.email || "").trim();
      return {
        isLegalEntityBuyer: Boolean(pr.isLegalEntity),
        billingCompanyName: String(pr.companyName || "").trim(),
        billingEdrpou: String(pr.edrpou || "").replace(/\s/g, ""),
        billingInvoiceEmail: invMail,
        billingIban: String(pr.billingIban || "").replace(/\s+/g, "").toUpperCase(),
        billingLegalAddress: String(pr.legalAddress || "").trim(),
      };
    } catch {
      return { isLegalEntityBuyer: false };
    }
  }

  function renderOrderSummary() {
    const root = $("checkout-order");
    if (!root || typeof window.dpCheckoutGetCart !== "function") return;
    const coCart = window.dpCheckoutGetCart();
    const { lines, orderTotal } = coCart;
    const guest =
      typeof window.checkoutGuestNoVatPricingActive === "function" && window.checkoutGuestNoVatPricingActive();
    const legalVat =
      typeof window.checkoutLegalEntityVatPricingActive === "function" && window.checkoutLegalEntityVatPricingActive();
    const legalBuyer = isLoggedLegalEntityBuyer();

    const delText = escapeHtml(getDeliveryLineText());

    const items = lines
      .map((L) => {
        return `
        <div class="checkout-line" data-ci="${L.index}">
          <img class="checkout-line-img" src="${escapeHtml(L.image)}" alt="" onerror="this.onerror=null;this.src='assets/product-template.png';" />
          <div class="checkout-line-body">
            <div class="checkout-line-head">
              <div>
                <p class="checkout-line-title">${escapeHtml(L.title)}</p>
                <p class="checkout-line-meta">${escapeHtml(L.details)}</p>
              </div>
              <button type="button" class="checkout-line-delete" data-remove-line="${L.index}" aria-label="${escapeHtml(t("cartRemove"))}">🗑</button>
            </div>
            <div class="checkout-qty">
              <button type="button" data-dec="${L.index}" aria-label="−">−</button>
              <input type="text" inputmode="numeric" value="${L.qty}" data-qty-line="${L.index}" aria-label="${escapeHtml(t("checkoutQty"))}" />
              <button type="button" data-inc="${L.index}" aria-label="+">+</button>
            </div>
          </div>
          <div class="checkout-line-sum">${escapeHtml(L.sumLabel)}</div>
        </div>`;
      })
      .join("");

    let pricingNoteHtml = "";
    if (guest) {
      pricingNoteHtml = `<p class="checkout-order-guest-note meta" role="note">${escapeHtml(t("checkoutOrderNoVatGuestNote"))}</p>`;
    } else if (legalVat) {
      pricingNoteHtml = `<p class="checkout-order-guest-note checkout-order-legal-note meta" role="note">${escapeHtml(
        t("checkoutOrderLegalEntityVatNote")
      )}</p>`;
    }

    root.innerHTML = `
      <div class="checkout-order-panel">
        <h2 class="checkout-order-title" data-i18n="checkoutYourOrder">${escapeHtml(t("checkoutYourOrder"))}</h2>
        ${pricingNoteHtml}
        ${items || `<p class="meta">${escapeHtml(t("emptyCart"))}</p>`}
        ${
          lines.length
            ? `<p><button type="button" class="btn btn-ghost" data-clear-checkout-cart>${
                typeof window.getDpLang === "function" && window.getDpLang() === "uk"
                  ? "Очистити кошик"
                  : "Очистить корзину"
              }</button></p>`
            : ""
        }
        <div class="checkout-order-meta">
          ${
            legalBuyer
              ? ""
              : `<div class="checkout-order-row">
                   <span data-i18n="checkoutDelivery">${escapeHtml(t("checkoutDelivery"))}</span>
                   <span>${delText}</span>
                 </div>`
          }
          <div class="checkout-total">
            <span data-i18n="total">${escapeHtml(t("total"))}</span>
            <span>${lines.length ? escapeHtml(formatMoney(orderTotal)) : "—"}</span>
          </div>
        </div>
      </div>`;
    if (window.applyTranslations) window.applyTranslations(root);
  }

  function clearCitySuggest() {
    const ul = $("co-city-suggest");
    if (ul) {
      ul.innerHTML = "";
      ul.classList.add("is-hidden");
    }
    citySuggestOpen = false;
  }

  function pickCity(ref, label) {
    state.cityRef = ref;
    state.cityLabel = label;
    state.warehouseRef = "";
    state.warehouseLabel = "";
    const whMan = $("co-warehouse-manual");
    if (whMan && state.npConfigured && isNovaDelivery()) whMan.value = "";
    const wh = $("co-warehouse");
    if (wh) {
      wh.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
    }
    const refEl = $("co-city-ref");
    if (refEl) refEl.value = ref;
    clearCitySuggest();
    if (state.npConfigured && ref && isNovaDelivery()) {
      void loadWarehouses(ref);
    } else {
      refreshDisabled();
      renderOrderSummary();
    }
  }

  async function loadWarehouses(cityRef) {
    const sel = $("co-warehouse");
    if (!sel) {
      refreshDisabled();
      return;
    }
    setNpWarehouseHint("");
    state.warehouseRef = "";
    state.warehouseLabel = "";
    const whMan = $("co-warehouse-manual");
    if (whMan && state.npConfigured && isNovaDelivery()) whMan.value = "";
    sel.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
    if (!isNovaDelivery() || !hasCityComplete()) {
      refreshDisabled();
      renderOrderSummary();
      return;
    }
    if (!state.npConfigured || !cityRef) {
      refreshDisabled();
      renderOrderSummary();
      return;
    }
    const lang = npLang();
    try {
      const res = await fetch(api("/api/shipping/np/warehouses"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityRef, lang }),
      });
      const j = await res.json().catch(() => ({}));
      const items = Array.isArray(j.items) ? j.items : [];
      if (!res.ok || j.ok === false) {
        setNpWarehouseHint("checkoutNpHintLoadError");
      } else {
        for (const it of items) {
          const o = document.createElement("option");
          o.value = it.ref;
          o.textContent = it.label;
          sel.appendChild(o);
        }
        if (sel.options.length <= 1) {
          setNpWarehouseHint("checkoutNpHintEmpty");
        }
      }
    } catch {
      setNpWarehouseHint("checkoutNpHintLoadError");
    } finally {
      refreshDisabled();
      renderOrderSummary();
    }
  }

  async function searchCities(q) {
    if (!state.npConfigured) return;
    const lang = npLang();
    const ul = $("co-city-suggest");
    if (!ul) return;
    try {
      const res = await fetch(api("/api/shipping/np/cities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ find: q, lang }),
      });
      const j = await res.json();
      ul.innerHTML = "";
      if (!j.items || !j.items.length) {
        clearCitySuggest();
        return;
      }
      for (const it of j.items) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = it.label;
        btn.addEventListener("click", () => pickCity(it.ref, it.label));
        li.appendChild(btn);
        ul.appendChild(li);
      }
      ul.classList.remove("is-hidden");
      citySuggestOpen = true;
    } catch {
      clearCitySuggest();
    }
  }

  function fillCitySelect() {
    const sel = $("co-city-select");
    if (!sel) return;
    const other = sel.querySelector('option[value="__other__"]');
    const first = sel.querySelector("option[value='']");
    sel.querySelectorAll("option[data-major]").forEach((n) => n.remove());
    state.majorCities.forEach((row, i) => {
      const o = document.createElement("option");
      o.value = `c:${i}`;
      o.setAttribute("data-major", "1");
      o.textContent = npLang() === "uk" ? row.searchUk : row.searchRu;
      if (other) sel.insertBefore(o, other);
      else if (first) first.after(o);
    });
  }

  async function resolveMajorCityIndex(i) {
    const row = state.majorCities[i];
    if (!row) return;
    const labelDisplay = npLang() === "uk" ? row.searchUk : row.searchRu;
    state.cityLabel = labelDisplay;
    state.cityRef = "";
    if ($("co-city-ref")) $("co-city-ref").value = "";
    const wh = $("co-warehouse");
    if (wh) wh.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
    if (!state.npConfigured) {
      refreshDisabled();
      renderOrderSummary();
      return;
    }
    const find = labelDisplay;
    const lang = npLang();
    try {
      const res = await fetch(api("/api/shipping/np/cities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ find, lang }),
      });
      const j = await res.json();
      if (j.items && j.items[0]) {
        pickCity(j.items[0].ref, j.items[0].label);
      } else {
        const st = $("checkout-form-status");
        if (st) st.textContent = t("checkoutCityOther");
        state.cityRef = "";
        refreshDisabled();
        renderOrderSummary();
      }
    } catch {
      const st = $("checkout-form-status");
      if (st) st.textContent = t("checkoutCityOther");
      refreshDisabled();
    }
  }

  function wireOrderPanel(root) {
    root.addEventListener("click", (e) => {
      const clear = e.target.closest("[data-clear-checkout-cart]");
      if (clear) {
        e.preventDefault();
        if (typeof window.dpCheckoutClearCart === "function") window.dpCheckoutClearCart();
        state.warehouseLabel = "";
        state.warehouseRef = "";
        renderOrderSummary();
        return;
      }
      const r = e.target.closest("[data-remove-line]");
      if (r) {
        e.preventDefault();
        const idx = Number(r.getAttribute("data-remove-line"));
        if (typeof window.dpCheckoutRemove === "function") window.dpCheckoutRemove(idx);
        state.warehouseLabel = "";
        state.warehouseRef = "";
        renderOrderSummary();
        if (!window.dpCheckoutGetCart().lines.length) {
          window.location.href = "products.html";
        }
        return;
      }
      const dec = e.target.closest("[data-dec]");
      if (dec) {
        e.preventDefault();
        const idx = Number(dec.getAttribute("data-dec"));
        const line = window.dpCheckoutGetCart().lines.find((x) => x.index === idx);
        if (!line) return;
        const n = line.qty > 1 ? line.qty - 1 : 1;
        window.dpCheckoutSetQty(idx, n);
        renderOrderSummary();
        return;
      }
      const inc = e.target.closest("[data-inc]");
      if (inc) {
        e.preventDefault();
        const idx = Number(inc.getAttribute("data-inc"));
        const line = window.dpCheckoutGetCart().lines.find((x) => x.index === idx);
        if (!line) return;
        const n = line.qty + 1;
        window.dpCheckoutSetQty(idx, n);
        renderOrderSummary();
      }
    });
    root.addEventListener("change", (e) => {
      const inp = e.target.closest("[data-qty-line]");
      if (inp) {
        const idx = Number(inp.getAttribute("data-qty-line"));
        window.dpCheckoutSetQty(idx, inp.value);
        renderOrderSummary();
      }
    });
  }

  function prefillFromAuth() {
    try {
      const u = JSON.parse(localStorage.getItem("authUser") || "null");
      if (!u) return;
      const name = $("co-name");
      const phone = $("co-phone");
      const email = $("co-email");
      const citySelect = $("co-city-select");
      const cityInput = $("co-city");
      const cityRefInput = $("co-city-ref");
      const profileCity = String(
        (u.profile && (u.profile.city || u.profile.countryRegion)) || ""
      ).trim();
      if (name) name.value = String(u.name || "").trim();
      if (email) email.value = String(u.email || "").trim();
      if (phone) phone.value = String((u.profile && u.profile.phone) || "").trim();
      if (profileCity && citySelect) {
        const options = Array.from(citySelect.options || []);
        const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
        const target = norm(profileCity);
        const hit = options.find((opt) => /^c:\d+$/.test(String(opt.value || "")) && norm(opt.textContent) === target);
        if (hit) {
          citySelect.value = hit.value;
          cityInput && (cityInput.value = "");
          cityRefInput && (cityRefInput.value = "");
          citySelect.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          const customValue = `p:${target}`;
          let custom = options.find((opt) => opt.value === customValue);
          if (!custom) {
            custom = document.createElement("option");
            custom.value = customValue;
            custom.textContent = profileCity;
            citySelect.appendChild(custom);
          }
          citySelect.value = customValue;
          citySelect.dispatchEvent(new Event("change", { bubbles: true }));
          if (cityInput) cityInput.value = profileCity;
          if (cityRefInput) cityRefInput.value = "";
          state.cityLabel = profileCity;
          state.cityRef = "";
          renderOrderSummary();
          refreshDisabled();
        }
      }
    } catch {
      /* ignore */
    }
  }

  function isCustomerLoggedIn() {
    try {
      if (typeof window.dpAuthCustomerLoggedIn === "function") return Boolean(window.dpAuthCustomerLoggedIn());
      return Boolean(localStorage.getItem("authToken"));
    } catch {
      return false;
    }
  }

  function syncCheckoutContactRules() {
    const phone = $("co-phone");
    const email = $("co-email");
    const loggedIn = isCustomerLoggedIn();
    if (loggedIn) prefillFromAuth();
    if (phone) {
      phone.required = true;
      phone.readOnly = loggedIn;
    }
    if (email) {
      email.required = !loggedIn;
      email.readOnly = loggedIn;
    }
    syncCheckoutPaymentRules();
    syncCheckoutLegalEntityFieldVisibility();
  }

  function isLoggedLegalEntityBuyer() {
    try {
      if (!isCustomerLoggedIn()) return false;
      const u = JSON.parse(localStorage.getItem("authUser") || "null");
      return Boolean(u?.profile?.isLegalEntity);
    } catch {
      return false;
    }
  }

  function syncCheckoutPaymentRules() {
    const paymentBlock = $("co-payment-block");
    const formatWrap = $("co-legal-invoice-format-wrap");
    const legal = isLoggedLegalEntityBuyer();
    if (paymentBlock) paymentBlock.hidden = !legal;
    if (formatWrap) formatWrap.hidden = !legal;
  }

  function syncCheckoutLegalEntityFieldVisibility() {
    const legal = isLoggedLegalEntityBuyer();
    const deliveryBlock = $("co-delivery-block");
    const warehouseBlock = $("co-warehouse-block");
    const npHint = $("co-np-fallback-hint");
    if (deliveryBlock) deliveryBlock.hidden = legal;
    if (warehouseBlock) warehouseBlock.hidden = legal;
    if (npHint && legal) npHint.hidden = true;
  }

  function clearCheckoutRequiredHighlights() {
    document.querySelectorAll(".checkout-required-missing").forEach((el) => el.classList.remove("checkout-required-missing"));
  }

  function clearCheckoutFieldErrors() {
    document.querySelectorAll(".checkout-field-error").forEach((el) => el.remove());
  }

  function setCheckoutFieldError(id, message) {
    const el = $(id);
    if (!el || !message) return;
    const markerClass = `checkout-field-error-for-${id}`;
    const parent = el.parentElement;
    if (!parent) return;
    if (parent.querySelector(`.${markerClass}`)) return;
    const err = document.createElement("p");
    err.className = `checkout-field-error ${markerClass}`;
    err.textContent = message;
    parent.appendChild(err);
  }

  function markCheckoutMissingFields(ids) {
    clearCheckoutRequiredHighlights();
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.classList.add("checkout-required-missing");
    });
  }

  function syncRegisteredLoginPrompt() {
    const hint = $("co-reg-login-hint");
    const txt = $("co-reg-login-text");
    const regLoginForm = $("co-reg-login-form");
    const submit = $("co-submit");
    const checkoutForm = $("checkout-form");
    const rows = document.querySelector("#checkout-form .checkout-form-rows");
    const autoFillHint = $("co-autofill-hint");
    const status = $("checkout-form-status");
    const regStatus = $("co-reg-login-status");
    const regMode = state.tab === "reg";
    const loggedIn = isCustomerLoggedIn();
    const uk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
    if (txt) {
      txt.textContent = uk
        ? "Для оформлення як зареєстрований покупець увійдіть в акаунт."
        : "Для оформления как зарегистрированный покупатель выполните вход в аккаунт.";
    }
    if (regLoginForm) regLoginForm.hidden = !regMode || loggedIn;
    if (hint) hint.hidden = !(regMode && !loggedIn);
    if (checkoutForm) {
      const hideCheckout = regMode && !loggedIn;
      checkoutForm.hidden = hideCheckout;
      checkoutForm.style.display = hideCheckout ? "none" : "";
    }
    if (rows) rows.hidden = regMode && !loggedIn;
    if (autoFillHint && regMode) autoFillHint.hidden = true;
    if (status && regMode && !loggedIn) status.textContent = "";
    if (submit) submit.hidden = regMode && !loggedIn;
    if (regStatus) {
      regStatus.textContent = "";
    }
  }

  function readCheckoutDraftCookie() {
    try {
      const raw = getCookie(CHECKOUT_DRAFT_COOKIE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function collectCheckoutDraft() {
    return {
      name: $("co-name")?.value?.trim() || "",
      phone: $("co-phone")?.value?.trim() || "",
      email: $("co-email")?.value?.trim() || "",
      citySelect: $("co-city-select")?.value || "",
      city: $("co-city")?.value?.trim() || "",
      cityRef: $("co-city-ref")?.value?.trim() || "",
      comment: $("co-comment")?.value?.trim() || "",
      delivery: $("co-delivery")?.value || "nova_poshta",
      warehouseManual: $("co-warehouse-manual")?.value?.trim() || "",
      ts: Date.now(),
    };
  }

  function saveCheckoutDraftCookie() {
    const d = collectCheckoutDraft();
    const hasUseful =
      Boolean(d.name || d.phone || d.email || d.city || d.warehouseManual || d.comment) ||
      d.citySelect === "__other__";
    if (!hasUseful) return;
    setCookie(CHECKOUT_DRAFT_COOKIE, JSON.stringify(d), 30);
  }

  function applyCheckoutDraft(draft) {
    if (!draft || typeof draft !== "object") return;
    const loggedIn = isCustomerLoggedIn();
    if (!loggedIn) {
      if ($("co-name") && draft.name) $("co-name").value = String(draft.name);
      if ($("co-phone") && draft.phone) $("co-phone").value = String(draft.phone);
      if ($("co-email") && draft.email) $("co-email").value = String(draft.email);
    }
    if ($("co-comment") && draft.comment) $("co-comment").value = String(draft.comment);
    if ($("co-delivery") && draft.delivery) {
      $("co-delivery").value = String(draft.delivery);
      $("co-delivery").dispatchEvent(new Event("change", { bubbles: true }));
    }
    if ($("co-city-select") && draft.citySelect) {
      $("co-city-select").value = String(draft.citySelect);
      $("co-city-select").dispatchEvent(new Event("change", { bubbles: true }));
    }
    if ($("co-city") && draft.city) {
      $("co-city").value = String(draft.city);
      $("co-city").dispatchEvent(new Event("input", { bubbles: true }));
    }
    if ($("co-city-ref") && draft.cityRef) $("co-city-ref").value = String(draft.cityRef);
    if ($("co-warehouse-manual") && draft.warehouseManual) {
      $("co-warehouse-manual").value = String(draft.warehouseManual);
      $("co-warehouse-manual").dispatchEvent(new Event("input", { bubbles: true }));
    }
    saveCheckoutDraftCookie();
    syncCheckoutPaymentRules();
  }

  function setupCheckoutAutofillSuggestion() {
    const hint = $("co-autofill-hint");
    const draft = readCheckoutDraftCookie();
    if (!draft) return;
    const hasValues = Boolean(draft.name || draft.phone || draft.email || draft.city || draft.warehouseManual || draft.comment);
    if (!hasValues) return;
    applyCheckoutDraft(draft);
    if (hint) hint.hidden = true;
  }

  function clearFormForNew() {
    ["co-name", "co-phone", "co-email", "co-city", "co-city-ref", "co-comment", "co-warehouse-manual", "co-city-select", "co-delivery"].forEach(
      (id) => {
        const el = $(id);
        if (el) {
          if (id === "co-delivery") el.value = "nova_poshta";
          else if (id === "co-city-select") el.value = "";
          else el.value = "";
        }
      }
    );
    const wh = $("co-warehouse");
    if (wh) wh.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
    $("co-city-search-wrap")?.classList.add("is-hidden");
    state.cityRef = "";
    state.cityLabel = "";
    state.warehouseRef = "";
    state.warehouseLabel = "";
    clearCitySuggest();
    fillCitySelect();
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".checkout-tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode");
        state.tab = mode === "reg" ? "reg" : "new";
        tabs.forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
        if (state.tab === "reg") {
          prefillFromAuth();
        } else {
          clearFormForNew();
        }
        syncRegisteredLoginPrompt();
        refreshDisabled();
        renderOrderSummary();
      });
    });
  }

  function syncBuyerTabsByAuth() {
    const tabNew = $("co-tab-new");
    const tabReg = $("co-tab-reg");
    const tabsWrap = (tabNew && tabNew.closest(".checkout-tabs")) || (tabReg && tabReg.closest(".checkout-tabs")) || document.querySelector(".checkout-tabs");
    const loggedIn = isCustomerLoggedIn();
    if (loggedIn) {
      state.tab = "reg";
      if (tabsWrap) {
        tabsWrap.hidden = true;
        tabsWrap.style.display = "none";
      }
      if (tabNew) tabNew.hidden = true;
      if (tabReg) tabReg.hidden = false;
      if (tabReg) tabReg.setAttribute("aria-selected", "true");
      if (tabNew) tabNew.setAttribute("aria-selected", "false");
      prefillFromAuth();
    } else {
      if (tabsWrap) {
        tabsWrap.hidden = false;
        tabsWrap.style.display = "";
      }
      if (tabNew) tabNew.hidden = false;
      if (tabReg) tabReg.hidden = false;
      if (state.tab !== "new" && state.tab !== "reg") state.tab = "new";
      if (tabNew) tabNew.setAttribute("aria-selected", state.tab === "new" ? "true" : "false");
      if (tabReg) tabReg.setAttribute("aria-selected", state.tab === "reg" ? "true" : "false");
    }
  }

  window.initCheckoutPage = function initCheckoutPage() {
    if (typeof window.dpCheckoutGetCart !== "function") return;
    if (!window.dpCheckoutGetCart().lines.length) {
      try {
        sessionStorage.setItem("checkoutEmpty", "1");
      } catch {
        /* ignore */
      }
      window.location.replace("products.html");
      return;
    }

    const orderRoot = document.getElementById("checkout-order");
    if (orderRoot) wireOrderPanel(orderRoot);
    window.dpOnCartChanged = function () {
      renderOrderSummary();
    };

    void (async () => {
      try {
        const r = await fetch(api("/api/shipping/ua-major-cities"));
        const j = await r.json();
        state.majorCities = Array.isArray(j.items) ? j.items : [];
      } catch {
        state.majorCities = [];
      }
      fillCitySelect();
      if (window.applyTranslations) window.applyTranslations(document.getElementById("co-city-select"));
      prefillFromAuth();

      try {
        const r2 = await fetch(api("/api/shipping/np/status"));
        const j2 = await r2.json();
        state.npConfigured = Boolean(j2.configured);
      } catch {
        state.npConfigured = false;
      }
      const npHint = $("co-np-fallback-hint");
      if (npHint) {
        npHint.hidden = state.npConfigured;
        if (window.applyTranslations) window.applyTranslations(npHint.parentElement);
      }
      refreshDisabled();
      syncCheckoutPaymentRules();
      syncCheckoutLegalEntityFieldVisibility();
    })();

    renderOrderSummary();
    initTabs();
    syncBuyerTabsByAuth();
    prefillFromAuth();
    syncCheckoutContactRules();
    setupCheckoutAutofillSuggestion();
    syncNewsletterConsentUi();
    syncRegisteredLoginPrompt();
    syncCheckoutPaymentRules();
    syncCheckoutLegalEntityFieldVisibility();

    const regLoginForm = $("co-reg-login-form");
    regLoginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = $("co-reg-login-status");
      const submitBtn = $("co-reg-login-submit");
      const email = String($("co-reg-email")?.value || "").trim().toLowerCase();
      const password = String($("co-reg-password")?.value || "");
      if (!email || !password) {
        if (statusEl) statusEl.textContent = typeof window.getDpLang === "function" && window.getDpLang() === "uk"
          ? "Вкажіть email і пароль."
          : "Укажите email и пароль.";
        return;
      }
      if (statusEl) statusEl.textContent = typeof window.getDpLang === "function" && window.getDpLang() === "uk"
        ? "Виконуємо вхід…"
        : "Выполняем вход…";
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(api("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (statusEl) statusEl.textContent = String(data?.message || (typeof window.getDpLang === "function" && window.getDpLang() === "uk"
            ? "Не вдалося увійти."
            : "Не удалось войти."));
          return;
        }
        if (data?.token) localStorage.setItem("authToken", String(data.token));
        if (data?.user) localStorage.setItem("authUser", JSON.stringify(data.user));
        window.dispatchEvent(new Event("dp-auth-changed"));
        prefillFromAuth();
        syncCheckoutContactRules();
        syncRegisteredLoginPrompt();
        if (typeof window.applyTranslations === "function") window.applyTranslations(document.body);
      } catch {
        if (statusEl) statusEl.textContent = typeof window.getDpLang === "function" && window.getDpLang() === "uk"
          ? "Помилка мережі."
          : "Ошибка сети.";
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    window.addEventListener("dp-auth-changed", () => {
      syncBuyerTabsByAuth();
      prefillFromAuth();
      syncCheckoutContactRules();
      syncRegisteredLoginPrompt();
      syncCheckoutPaymentRules();
      syncCheckoutLegalEntityFieldVisibility();
      renderOrderSummary();
    });
    window.addEventListener("dp-consent-changed", () => syncNewsletterConsentUi());
    window.addEventListener("dp-lang-change", () => {
      syncNewsletterConsentUi();
      syncCheckoutPaymentRules();
      syncCheckoutLegalEntityFieldVisibility();
    });

    const form = $("checkout-form");
    const whSel = $("co-warehouse");
    const whMan = $("co-warehouse-manual");

    $("co-city-select")?.addEventListener("change", () => {
      const sel = $("co-city-select");
      const v = sel && sel.value;
      const searchWrap = $("co-city-search-wrap");
      const st = $("checkout-form-status");
      if (st) st.textContent = "";
      state.warehouseRef = "";
      state.warehouseLabel = "";
      state.cityRef = "";
      if (whSel) whSel.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
      if (whMan && state.npConfigured && isNovaDelivery()) whMan.value = "";
      if (!v) {
        state.cityLabel = "";
        if ($("co-city")) $("co-city").value = "";
        if ($("co-city-ref")) $("co-city-ref").value = "";
        searchWrap?.classList.add("is-hidden");
        refreshDisabled();
        renderOrderSummary();
        return;
      }
      if (v === "__other__") {
        state.cityLabel = "";
        if ($("co-city")) $("co-city").value = "";
        if ($("co-city-ref")) $("co-city-ref").value = "";
        searchWrap?.classList.remove("is-hidden");
        refreshDisabled();
        renderOrderSummary();
        return;
      }
      if (/^p:/.test(String(v || ""))) {
        searchWrap?.classList.add("is-hidden");
        const opt = sel?.options?.[sel.selectedIndex];
        state.cityLabel = String(opt?.textContent || "").trim();
        state.cityRef = "";
        if ($("co-city")) $("co-city").value = state.cityLabel;
        if ($("co-city-ref")) $("co-city-ref").value = "";
        refreshDisabled();
        renderOrderSummary();
        return;
      }
      searchWrap?.classList.add("is-hidden");
      const m = /^c:(\d+)$/.exec(v);
      if (m) {
        void resolveMajorCityIndex(parseInt(m[1], 10));
      }
      renderOrderSummary();
    });

    if (whSel) {
      whSel.addEventListener("change", () => {
        const opt = whSel.options[whSel.selectedIndex];
        state.warehouseRef = whSel.value || "";
        state.warehouseLabel = opt ? String(opt.textContent || "").trim() : "";
        renderOrderSummary();
      });
    }
    if (whMan) {
      whMan.addEventListener("input", () => {
        if (isNovaDelivery() && state.npConfigured) return;
        state.warehouseRef = "";
        state.warehouseLabel = whMan.value.trim();
        renderOrderSummary();
        refreshDisabled();
      });
    }

    $("co-delivery")?.addEventListener("change", () => {
      if (!isNovaDelivery()) {
        setNpWarehouseHint("");
        state.warehouseRef = "";
        state.warehouseLabel = (whMan && whMan.value.trim()) || "";
        if (whSel) {
          whSel.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
        }
      } else {
        state.warehouseRef = "";
        state.warehouseLabel = (whMan && whMan.value.trim()) || "";
        if (whSel) {
          whSel.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
        }
        if (state.npConfigured && state.cityRef) {
          void loadWarehouses(state.cityRef);
        }
      }
      renderOrderSummary();
      refreshDisabled();
    });

    if ($("co-city")) {
      $("co-city").addEventListener("input", () => {
        if (!state.npConfigured) {
          state.cityLabel = $("co-city").value.trim();
          state.cityRef = "";
          if ($("co-city-ref")) $("co-city-ref").value = "";
          refreshDisabled();
          renderOrderSummary();
          return;
        }
        const v = $("co-city").value.trim();
        if (v !== state.cityLabel) {
          state.cityRef = "";
          state.cityLabel = "";
          if ($("co-city-ref")) $("co-city-ref").value = "";
          if (whSel) whSel.innerHTML = `<option value="">${escapeHtml(t("checkoutWarehousePlaceholder"))}</option>`;
        }
        clearTimeout(state.citySuggestTimer);
        if (v.length < 2) {
          clearCitySuggest();
          refreshDisabled();
          return;
        }
        state.citySuggestTimer = setTimeout(() => {
          void searchCities(v);
        }, 320);
        refreshDisabled();
      });
      $("co-city").addEventListener("blur", () => {
        setTimeout(() => {
          if (!citySuggestOpen) return;
          clearCitySuggest();
        }, 200);
      });
    }

    document.getElementById("language-switcher")?.addEventListener("change", () => {
      setTimeout(() => {
        fillCitySelect();
        prefillFromAuth();
        if (window.applyTranslations) {
          window.applyTranslations(document.body);
        }
        if (isNovaDelivery() && state.cityRef && state.npConfigured) {
          void loadWarehouses(state.cityRef);
        } else {
          refreshDisabled();
        }
        renderOrderSummary();
      }, 0);
    });

    $("co-comment")?.addEventListener("input", () => {
      saveCheckoutDraftCookie();
      renderOrderSummary();
    });
    [
      "co-name",
      "co-phone",
      "co-email",
      "co-city",
      "co-city-select",
      "co-delivery",
      "co-warehouse-manual",
      "co-accept-offer",
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", saveCheckoutDraftCookie);
      el.addEventListener("change", saveCheckoutDraftCookie);
      const clearOne = () => {
        el.classList.remove("checkout-required-missing");
        document.querySelectorAll(`.checkout-field-error-for-${id}`).forEach((x) => x.remove());
      };
      el.addEventListener("input", clearOne);
      el.addEventListener("change", clearOne);
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = $("checkout-form-status");
      const name = ($("co-name") && $("co-name").value.trim()) || "";
      const phone = ($("co-phone") && $("co-phone").value.trim()) || "";
      const email = ($("co-email") && $("co-email").value.trim()) || "";
      const comment = ($("co-comment") && $("co-comment").value.trim()) || "";
      const pay = ($("co-payment") && $("co-payment").value) || "liqpay";
      const payFinal = isLoggedLegalEntityBuyer() ? "invoice" : pay;
      const legalInvoiceOnly = isLoggedLegalEntityBuyer();
      const legalInvoiceFormat = ($("co-legal-invoice-format") && $("co-legal-invoice-format").value) || "both";
      const newsletter = $("co-newsletter") && $("co-newsletter").checked;
      const acceptOffer = Boolean($("co-accept-offer")?.checked);
      const deliveryMethod = ($("co-delivery") && $("co-delivery").value) || "nova_poshta";
      const nova = deliveryMethod === "nova_poshta";
      const byAgreement = deliveryMethod === "agreement";
      const loggedIn = isCustomerLoggedIn();
      if (state.tab === "reg" && !loggedIn) {
        if (st) st.textContent = "";
        syncRegisteredLoginPrompt();
        return;
      }
      let nameFinal = name;
      let phoneFinal = phone;
      let emailFinal = email;
      if (loggedIn) {
        const prof = checkoutBillingPayloadFromStoredProfile();
        try {
          const u = JSON.parse(localStorage.getItem("authUser") || "null");
          nameFinal = nameFinal || String(u?.name || "").trim() || String(prof.billingCompanyName || "").trim();
          phoneFinal = phoneFinal || String(u?.profile?.phone || "").trim();
          emailFinal = emailFinal || String(u?.email || "").trim() || String(prof.billingInvoiceEmail || "").trim();
        } catch {
          /* ignore */
        }
      }

      clearCheckoutRequiredHighlights();
      clearCheckoutFieldErrors();
      const missing = [];
      if (nameFinal.length < 2) missing.push("co-name");
      if (phoneFinal.length < 9) missing.push("co-phone");
      if (!/.+@.+\..+/.test(emailFinal)) missing.push("co-email");
      if (!legalInvoiceOnly) {
        if (!$("co-city-select")?.value) {
          missing.push("co-city-select");
        } else if ($("co-city-select")?.value === "__other__") {
          if (state.npConfigured) {
            if (!state.cityRef) missing.push("co-city");
          } else if (!(($("co-city") && $("co-city").value.trim().length >= 2))) {
            missing.push("co-city");
          }
        } else if (state.npConfigured && !state.cityRef) {
          missing.push("co-city-select");
        }
        if (!($("co-delivery") && $("co-delivery").value)) missing.push("co-delivery");
        if (nova) {
          if (state.npConfigured) {
            if (!state.warehouseRef) missing.push("co-warehouse");
          } else if (!(whMan && whMan.value.trim().length >= 2)) {
            missing.push("co-warehouse-manual");
          }
        } else if (!byAgreement && !(whMan && whMan.value.trim().length >= 2)) {
          missing.push("co-warehouse-manual");
        }
      }
      if (missing.length) {
        markCheckoutMissingFields(missing);
        const uk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
        const labels = {
          "co-name": uk ? "Вкажіть ПІБ." : "Укажите ФИО.",
          "co-phone": uk ? "Вкажіть телефон." : "Укажите телефон.",
          "co-email": uk ? "Вкажіть коректний E-mail." : "Укажите корректный E-mail.",
          "co-city-select": uk ? "Оберіть місто." : "Выберите город.",
          "co-city": uk ? "Вкажіть місто." : "Укажите город.",
          "co-delivery": uk ? "Оберіть спосіб доставки." : "Выберите способ доставки.",
          "co-payment": uk ? "Оберіть спосіб оплати." : "Выберите способ оплаты.",
          "co-warehouse": uk ? "Оберіть відділення." : "Выберите отделение.",
          "co-warehouse-manual": uk ? "Вкажіть відділення або адресу." : "Укажите отделение или адрес.",
          "co-accept-offer": uk ? "Потрібна згода з договором оферти." : "Необходимо согласие с договором оферты.",
        };
        missing.forEach((id) => setCheckoutFieldError(id, labels[id] || (uk ? "Заповніть поле." : "Заполните поле.")));
        if (st) st.textContent = "";
        return;
      }
      if (!acceptOffer) {
        markCheckoutMissingFields(["co-accept-offer"]);
        setCheckoutFieldError(
          "co-accept-offer",
          typeof window.getDpLang === "function" && window.getDpLang() === "uk"
            ? "Потрібна згода з договором оферти."
            : "Необходимо согласие с договором оферты."
        );
        return;
      }

      if (nameFinal.length < 2 || phoneFinal.length < 9) {
        if (st) st.textContent = t("checkoutErrorContacts");
        return;
      }
      if (!loggedIn && !/.+@.+\..+/.test(emailFinal)) {
        if (st) st.textContent = t("checkoutErrorContacts");
        return;
      }
      if (typeof window.dpAuthCustomerLoggedIn === "function" && window.dpAuthCustomerLoggedIn()) {
        if (!checkoutLegalBillingProfileComplete()) {
          if (st) st.textContent = t("checkoutLegalEntityProfileIncomplete");
          return;
        }
      }
      if (!legalInvoiceOnly) {
        if (!hasCityComplete()) {
          if (st) st.textContent = t("checkoutCityPick");
          return;
        }
        if (nova) {
          if (state.npConfigured) {
            if (!state.cityRef) {
              if (st) st.textContent = t("checkoutCityPlaceholder");
              return;
            }
            if (!state.warehouseRef) {
              if (st) st.textContent = t("checkoutWarehousePlaceholder");
              return;
            }
          } else {
            if (!(whMan && whMan.value.trim().length >= 2)) {
              if (st) st.textContent = t("checkoutWarehouseManual");
              return;
            }
            state.warehouseRef = "";
          }
        } else if (!byAgreement) {
          if (!(whMan && whMan.value.trim().length >= 2)) {
            if (st) st.textContent = t("checkoutWarehouseManual");
            return;
          }
          state.warehouseRef = "";
        }
      }

      let cityDisp = state.cityLabel || "";
      if (!cityDisp && $("co-city-select") && $("co-city-select").value === "__other__" && $("co-city")) {
        cityDisp = $("co-city").value.trim();
      }
      if (!cityDisp) cityDisp = String(($("co-city") && $("co-city").value.trim()) || "");

      const whText = (whMan && whMan.value.trim()) || "";
      const point = nova
        ? state.warehouseRef
          ? state.warehouseLabel
          : whText
        : byAgreement
          ? (comment || "")
          : whText;

      const { cartSnapshot, orderTotal } = window.dpCheckoutLeadPayloadBase();
      const checkoutMeta = typeof window.dpCheckoutGetCart === "function" ? window.dpCheckoutGetCart() : {};
      const rawCart = typeof window.dpGetCartItems === "function" ? window.dpGetCartItems() : [];
      const paymentNote =
        payFinal === "invoice"
          ? typeof window.getDpLang === "function" && window.getDpLang() === "uk"
            ? "Рахунок-фактура для оплати надіслана на email."
            : "Счет-фактура для оплаты отправлен на email."
          : payFinal === "iban"
            ? t("checkoutPayIban")
            : payFinal === "liqpay"
              ? t("checkoutPayCard")
              : String(payFinal);

      const billingExtras =
        typeof checkoutBillingPayloadFromStoredProfile === "function" ? checkoutBillingPayloadFromStoredProfile() : {};

      const payload = {
        name: nameFinal,
        customerName: nameFinal,
        phone: phoneFinal,
        email: emailFinal,
        comment: [comment, orderTotal != null ? `${t("total")}: ${formatMoney(orderTotal)}` : ""]
          .filter(Boolean)
          .join("\n"),
        source: "checkout",
        customerType: checkoutMeta.customerType,
        buyerIsAuthenticated: Boolean(checkoutMeta.buyerIsAuthenticated),
        guestIndividualNoVatPricing: Boolean(checkoutMeta.guestIndividualNoVatPricing),
        legalEntityVatPricing: Boolean(checkoutMeta.legalEntityVatPricing),
        ...billingExtras,
        cart: rawCart,
        cartSnapshot,
        orderTotal,
        deliveryMethod,
        paymentMethod: payFinal,
        paymentNote,
        legalInvoiceFormat: isLoggedLegalEntityBuyer() ? String(legalInvoiceFormat || "both") : "both",
        deliveryCity: cityDisp,
        deliveryPoint: point,
        npCityRef: nova && state.npConfigured ? state.cityRef || null : null,
        npWarehouseRef: nova && state.npConfigured && state.warehouseRef ? state.warehouseRef : null,
        marketingOptIn: Boolean(newsletter),
      };

      const btn = $("co-submit");
      if (btn) btn.disabled = true;
      if (st) st.textContent = "";

      const leadsUrl = api("/api/leads");
      const leadHeaders = { "Content-Type": "application/json" };
      try {
        const tok = localStorage.getItem("authToken");
        if (tok) leadHeaders.Authorization = `Bearer ${tok}`;
      } catch {
        /* ignore */
      }
      try {
        saveCheckoutDraftCookie();
        const res = await fetch(leadsUrl, {
          method: "POST",
          headers: leadHeaders,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("bad");
        let successText = t("submitted");
        if (st) {
          const uk = typeof window.getDpLang === "function" && window.getDpLang() === "uk";
          const legalInvoiceFlow = isLoggedLegalEntityBuyer() && payFinal === "invoice";
          successText = legalInvoiceFlow
            ? uk
              ? "Замовлення сформовано, рахунок відправлено на email."
              : "Заказ сформирован, счет отправлен на почту."
            : t("submitted");
          st.textContent = successText;
        }
        if (typeof window.dpShowToast === "function") {
          window.dpShowToast(successText, 2800);
        }
        if (typeof window.dpCheckoutClearCart === "function") {
          window.dpCheckoutClearCart();
        } else {
          localStorage.setItem("cart", "[]");
        }
        renderOrderSummary();
        if (btn) btn.disabled = false;
      } catch {
        localStorage.setItem("lastLead", JSON.stringify(payload));
        if (st) st.textContent = `${t("submitted")} (offline)`;
        if (btn) btn.disabled = false;
      }
    });
  };
})();
