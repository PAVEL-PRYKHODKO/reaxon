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

  function $(id) {
    return document.getElementById(id);
  }

  function isNovaDelivery() {
    return ($("co-delivery") && $("co-delivery").value) === "nova_poshta";
  }

  function hasCityComplete() {
    const sel = $("co-city-select");
    if (!sel || !sel.value) return false;
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
    const payBlock = $("co-payment-block");
    const del = $("co-delivery");
    const pay = $("co-payment");
    const wh = $("co-warehouse");
    const whMan = $("co-warehouse-manual");
    const whNp = $("co-np-warehouse-wrap");
    const lbl = $("co-warehouse-row-label");

    if (delBlock) delBlock.classList.toggle("checkout-block-muted", !ok);
    if (payBlock) payBlock.classList.toggle("checkout-block-muted", !ok);
    if (del) del.disabled = !ok;
    if (pay) pay.disabled = !ok;

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
      const ed = String(pr.edrpou || "").replace(/\s/g, "");
      const ibanRaw = String(pr.billingIban || "").replace(/\s/g, "").toUpperCase();
      const invMail = String(pr.invoiceEmail || "").trim() || String(u?.email || "").trim();
      const adr = String(pr.legalAddress || "").trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invMail);
      const edOk = /^\d{8,10}$/.test(ed);
      const ibOk = /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(ibanRaw) && ibanRaw.length >= 15;
      return company.length >= 2 && edOk && ibOk && emailOk && adr.length >= 8;
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
        <p class="checkout-coupon" data-i18n="checkoutCoupon">${escapeHtml(t("checkoutCoupon"))}</p>
        <div class="checkout-order-meta">
          <div class="checkout-order-row">
            <span data-i18n="checkoutDelivery">${escapeHtml(t("checkoutDelivery"))}</span>
            <span>${delText}</span>
          </div>
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
    if (whMan) whMan.value = "";
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
    if (whMan) whMan.value = "";
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
      if (name) name.value = String(u.name || "").trim();
      if (email) email.value = String(u.email || "").trim();
      if (phone) phone.value = String((u.profile && u.profile.phone) || "").trim();
    } catch {
      /* ignore */
    }
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
        refreshDisabled();
        renderOrderSummary();
      });
    });
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
    })();

    renderOrderSummary();
    initTabs();
    prefillFromAuth();

    window.addEventListener("dp-auth-changed", () => renderOrderSummary());

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
      if (whMan) whMan.value = "";
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
      renderOrderSummary();
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = $("checkout-form-status");
      const name = ($("co-name") && $("co-name").value.trim()) || "";
      const phone = ($("co-phone") && $("co-phone").value.trim()) || "";
      const email = ($("co-email") && $("co-email").value.trim()) || "";
      const comment = ($("co-comment") && $("co-comment").value.trim()) || "";
      const pay = ($("co-payment") && $("co-payment").value) || "liqpay";
      const newsletter = $("co-newsletter") && $("co-newsletter").checked;
      const deliveryMethod = ($("co-delivery") && $("co-delivery").value) || "nova_poshta";
      const nova = deliveryMethod === "nova_poshta";

      if (name.length < 2 || phone.length < 9) {
        if (st) st.textContent = t("checkoutErrorContacts");
        return;
      }
      if (typeof window.dpAuthCustomerLoggedIn === "function" && window.dpAuthCustomerLoggedIn()) {
        if (!checkoutLegalBillingProfileComplete()) {
          if (st) st.textContent = t("checkoutLegalEntityProfileIncomplete");
          return;
        }
      }
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
      } else {
        if (!(whMan && whMan.value.trim().length >= 2)) {
          if (st) st.textContent = t("checkoutWarehouseManual");
          return;
        }
        state.warehouseRef = "";
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
        : whText;

      const { cartSnapshot, orderTotal } = window.dpCheckoutLeadPayloadBase();
      const checkoutMeta = typeof window.dpCheckoutGetCart === "function" ? window.dpCheckoutGetCart() : {};
      const rawCart = typeof window.dpGetCartItems === "function" ? window.dpGetCartItems() : [];
      const paymentNote =
        pay === "iban"
          ? t("checkoutPayIban")
          : pay === "liqpay"
            ? t("checkoutPayCard")
            : String(pay);

      const billingExtras =
        typeof checkoutBillingPayloadFromStoredProfile === "function" ? checkoutBillingPayloadFromStoredProfile() : {};

      const payload = {
        name,
        customerName: name,
        phone,
        email,
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
        paymentMethod: pay,
        paymentNote,
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
        const res = await fetch(leadsUrl, {
          method: "POST",
          headers: leadHeaders,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("bad");
        if (st) st.textContent = t("submitted");
        if (typeof window.dpCheckoutClearCart === "function") {
          window.dpCheckoutClearCart();
        } else {
          localStorage.setItem("cart", "[]");
        }
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1200);
      } catch {
        localStorage.setItem("lastLead", JSON.stringify(payload));
        if (st) st.textContent = `${t("submitted")} (offline)`;
        if (btn) btn.disabled = false;
      }
    });
  };
})();
