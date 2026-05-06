(function () {
  window.DP_PRODUCT_OVERRIDES = window.DP_PRODUCT_OVERRIDES || {};

  window.dpResolveMediaUrl = function (p) {
    const s = String(p || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("data:")) return s;
    let out;
    if (s.startsWith("/") && window.DP_API_BASE) {
      out = `${window.DP_API_BASE.replace(/\/+$/, "")}${s}`;
    } else {
      out = s;
    }
    if (out && /\/uploads\/products\//i.test(out)) {
      const rev = window.__DP_SITE_CONTENT_REVISION;
      if (rev != null && String(rev) !== "") {
        const sep = out.includes("?") ? "&" : "?";
        out = `${out}${sep}v=${encodeURIComponent(String(rev))}`;
      }
    }
    return out;
  };

  function visitorId() {
    try {
      let v = localStorage.getItem("dp_vid");
      if (!v) {
        v =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `v-${Math.random().toString(36).slice(2)}${Date.now()}`;
        localStorage.setItem("dp_vid", v);
      }
      return v;
    } catch {
      return `anon-${Date.now()}`;
    }
  }

  function collectPayload(extra) {
    return {
      path: `${location.pathname}${location.search}`,
      referrer: document.referrer || "",
      title: document.title || "",
      visitorId: visitorId(),
      ...(extra && typeof extra === "object" ? extra : {}),
    };
  }

  function collectAnalytics() {
    if (typeof window.dpApiUrl !== "function") return;
    try {
      fetch(window.dpApiUrl("/api/analytics/collect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectPayload()),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  window.dpTrackEvent = function (eventName) {
    if (typeof window.dpApiUrl !== "function" || !eventName) return;
    const ev = String(eventName).trim().slice(0, 120);
    if (!ev) return;
    try {
      fetch(window.dpApiUrl("/api/analytics/collect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectPayload({ event: ev })),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  async function fetchSiteProductsIntoWindow() {
    if (typeof window.dpApiUrl !== "function") return false;
    try {
      const pr = await fetch(window.dpApiUrl("/api/site/products"));
      if (!pr.ok) return false;
      const d = await pr.json();
      if (!Array.isArray(d.products)) return false;
      // Важный кейс: после очистки каталога на сервере массив может быть пустым.
      // Всё равно нужно синхронизировать клиент и очистить таблицы/витрину.
      window.PRODUCTS_DATA = d.products;
      if (typeof window.dpNormalizeCatalogProductsInPlace === "function") {
        window.dpNormalizeCatalogProductsInPlace(window.PRODUCTS_DATA);
      }
      if (typeof window.dpApplyNumericCodesToCatalogData === "function") {
        window.dpApplyNumericCodesToCatalogData(window.PRODUCTS_DATA);
      }
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "api" } }));
      return true;
    } catch {
      return false;
    }
  }

  /** Повторная загрузка каталога с сервера (после сохранения в админке и для других вкладок). */
  window.dpReloadSiteProductsFromApi = async function dpReloadSiteProductsFromApi() {
    const ok = await fetchSiteProductsIntoWindow();
    if (ok) {
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "api" } }));
    }
    return ok;
  };

  window.addEventListener("storage", (e) => {
    if (e.key !== "dp_catalog_rev" || e.newValue == null) return;
    void window.dpReloadSiteProductsFromApi?.();
  });

  window.dpSiteReady = (async () => {
    const skipInitialCatalog = document.body?.dataset?.page === "admin";
    try {
      if (!skipInitialCatalog) await fetchSiteProductsIntoWindow();
    } catch {
      /* офлайн — остаётся products-data.js */
    }
    collectAnalytics();
    if (typeof window.dpApiUrl !== "function") return;
    try {
      const r = await fetch(window.dpApiUrl("/api/site/product-overrides"));
      if (!r.ok) return;
      const data = await r.json();
      if (data && data.productOverrides && typeof data.productOverrides === "object") {
        window.DP_PRODUCT_OVERRIDES = data.productOverrides;
        window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "overrides" } }));
      }
      if (data && data.siteContentRevision != null) {
        window.__DP_SITE_CONTENT_REVISION = data.siteContentRevision;
      }
      if (data && Array.isArray(data.heroSlides)) {
        window.DP_HERO_SLIDES = data.heroSlides;
      }
      if (data && data.heroSlideshowSettings && typeof data.heroSlideshowSettings === "object") {
        window.DP_HERO_SLIDESHOW_SETTINGS = data.heroSlideshowSettings;
      }
      if (data && Array.isArray(data.productsBannerSlides)) {
        window.DP_PRODUCTS_BANNER_SLIDES = data.productsBannerSlides;
      }
    } catch {
      /* offline / CORS */
    }
    try {
      const rd = await fetch(window.dpApiUrl("/api/site/delivery-copy"));
      if (!rd.ok) return;
      const dd = await rd.json();
      if (dd && dd.deliveryUkraine && typeof dd.deliveryUkraine === "object") {
        window.DP_DELIVERY_UKRAINE = dd.deliveryUkraine;
      }
    } catch {
      /* offline */
    }
  })();
})();
