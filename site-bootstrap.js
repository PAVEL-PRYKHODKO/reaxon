(function () {
  window.DP_PRODUCT_OVERRIDES = window.DP_PRODUCT_OVERRIDES || {};
  const CONSENT_KEY = "dp_cookie_consent_v1";
  const DEFAULT_POLICY_VERSION = "2026-05-08";
  const DEFAULT_CONSENT_SCHEMA_VERSION = 2;
  const CONSENT_CHANGED_EVENT = "dp-consent-changed";

  window.DP_POLICY_CONFIG = window.DP_POLICY_CONFIG || {
    version: DEFAULT_POLICY_VERSION,
    consentSchemaVersion: DEFAULT_CONSENT_SCHEMA_VERSION,
  };

  function expectedConsentVersion() {
    const n = Number(window.DP_POLICY_CONFIG?.consentSchemaVersion || DEFAULT_CONSENT_SCHEMA_VERSION);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONSENT_SCHEMA_VERSION;
  }

  function expectedPolicyVersion() {
    return String(window.DP_POLICY_CONFIG?.version || DEFAULT_POLICY_VERSION).trim() || DEFAULT_POLICY_VERSION;
  }

  function readConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      // Принятое согласие не сбрасываем автоматически при смене версии политики:
      // пользователь сам может пересмотреть выбор в футере.
      return {
        version: Number(data.version || expectedConsentVersion()) || expectedConsentVersion(),
        policyVersion: String(data.policyVersion || expectedPolicyVersion()).trim() || expectedPolicyVersion(),
        necessary: true,
        analytics: Boolean(data.analytics),
        marketing: Boolean(data.marketing),
        personalization: Boolean(data.personalization),
        acceptedAt: data.acceptedAt || null,
      };
    } catch {
      return null;
    }
  }

  function writeConsent(consent) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      /* ignore */
    }
  }

  function currentConsentOrDefault() {
    const c = readConsent();
    if (c) return c;
    return {
      version: expectedConsentVersion(),
      policyVersion: expectedPolicyVersion(),
      necessary: true,
      analytics: true,
      marketing: false,
      personalization: false,
      acceptedAt: null,
    };
  }

  function applyConsent(next) {
    const consent = {
      ...currentConsentOrDefault(),
      ...next,
      version: expectedConsentVersion(),
      policyVersion: expectedPolicyVersion(),
      necessary: true,
      acceptedAt: new Date().toISOString(),
    };
    writeConsent(consent);
    applyConsentSideEffects(consent);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { consent } }));
    return consent;
  }

  function applyConsentSideEffects(consent) {
    try {
      const root = document.documentElement;
      if (!root) return;
      root.dataset.dpConsentAnalytics = consent.analytics ? "1" : "0";
      root.dataset.dpConsentMarketing = consent.marketing ? "1" : "0";
      root.dataset.dpConsentPersonalization = consent.personalization ? "1" : "0";
      // Single aggregate flag simplifies future opt-in integrations.
      root.dataset.dpConsentOptional = consent.analytics || consent.marketing || consent.personalization ? "1" : "0";
    } catch {
      /* ignore */
    }
  }

  async function loadPolicyConfig() {
    try {
      const resp = await fetch("privacy-policy-config.json", { cache: "no-store" });
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null);
      if (!data || typeof data !== "object") return;
      window.DP_POLICY_CONFIG = {
        version: String(data.version || DEFAULT_POLICY_VERSION).trim() || DEFAULT_POLICY_VERSION,
        consentSchemaVersion: Number(data.consentSchemaVersion || DEFAULT_CONSENT_SCHEMA_VERSION) || DEFAULT_CONSENT_SCHEMA_VERSION,
        shortNoticeRu: Array.isArray(data.shortNoticeRu) ? data.shortNoticeRu : [],
        shortNoticeUk: Array.isArray(data.shortNoticeUk) ? data.shortNoticeUk : [],
      };
    } catch {
      /* ignore */
    }
  }

  window.dpGetCookieConsent = function () {
    return readConsent();
  };

  window.dpUpdateCookieConsent = function (patch) {
    return applyConsent(patch && typeof patch === "object" ? patch : {});
  };

  window.dpHasConsent = function (scope) {
    const c = readConsent();
    if (!c) return false;
    if (!scope) return true;
    if (scope === "necessary") return true;
    if (scope === "analytics") return Boolean(c.analytics);
    if (scope === "marketing") return Boolean(c.marketing);
    if (scope === "personalization") return Boolean(c.personalization);
    return false;
  };

  window.dpGetConsentCategories = function () {
    const c = currentConsentOrDefault();
    return {
      necessary: true,
      analytics: Boolean(c.analytics),
      marketing: Boolean(c.marketing),
      personalization: Boolean(c.personalization),
    };
  };

  function canCollectAnalytics() {
    return window.dpHasConsent && window.dpHasConsent("analytics");
  }

  function closeConsentUi() {
    document.getElementById("dp-consent-banner")?.remove();
    document.getElementById("dp-consent-modal")?.remove();
  }

  function renderConsentModal() {
    closeConsentUi();
    const consent = currentConsentOrDefault();
    const currentLang = typeof window.getDpLang === "function" ? window.getDpLang() : "uk";
    const i18n = currentLang === "uk"
      ? {
          title: "Налаштування cookie",
          intro:
            "Оберіть, які категорії даних можна використовувати. Необхідні cookie потрібні для коректної роботи сайту.",
          necessaryTitle: "Необхідні cookie",
          necessaryBody: "Потрібні для безпеки, авторизації та базової роботи сайту.",
          analyticsTitle: "Статистичні (аналітика)",
          analyticsBody: "Анонімна статистика відвідувань і подій для покращення сайту.",
          marketingTitle: "Маркетингові",
          marketingBody: "Допомагають показувати релевантні промо-матеріали та оцінювати рекламні кампанії.",
          personalizationTitle: "Персоналізація",
          personalizationBody: "Запам'ятовують ваші переваги для зручнішої взаємодії з сайтом.",
          cancel: "Скасувати",
          reject: "Лише необхідні",
          save: "Зберегти вибір",
        }
      : {
          title: "Настройки cookie",
          intro:
            "Выберите, какие категории данных можно использовать. Обязательные cookie нужны для корректной работы сайта.",
          necessaryTitle: "Обязательные cookie",
          necessaryBody: "Нужны для безопасности, авторизации и базовой работы сайта.",
          analyticsTitle: "Статистические (аналитика)",
          analyticsBody: "Анонимная статистика посещений и событий для улучшения сайта.",
          marketingTitle: "Маркетинговые",
          marketingBody: "Помогают показывать релевантные промо-материалы и оценивать рекламные кампании.",
          personalizationTitle: "Персонализация",
          personalizationBody: "Запоминают ваши предпочтения для более удобного взаимодействия с сайтом.",
          cancel: "Отмена",
          reject: "Только обязательные",
          save: "Сохранить выбор",
        };
    const modal = document.createElement("div");
    modal.id = "dp-consent-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.18);display:grid;place-items:center;padding:16px;";
    modal.innerHTML = `
      <section style="max-width:720px;width:100%;background:#ffffff;color:#0f172a;border:1px solid #dbe4f0;border-radius:14px;padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.14);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;">
        <h2 style="margin:0 0 8px;font-size:20px;">${i18n.title}</h2>
        <p style="margin:0 0 14px;color:#475569;">${i18n.intro}</p>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid #dbe4f0;background:#f8fbff;border-radius:10px;">
          <input type="checkbox" checked disabled />
          <span><strong>${i18n.necessaryTitle}</strong><br/><span style="color:#64748b">${i18n.necessaryBody}</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid #dbe4f0;background:#ffffff;border-radius:10px;">
          <input id="dp-consent-analytics" type="checkbox" ${consent.analytics ? "checked" : ""} />
          <span><strong>${i18n.analyticsTitle}</strong><br/><span style="color:#64748b">${i18n.analyticsBody}</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid #dbe4f0;background:#ffffff;border-radius:10px;">
          <input id="dp-consent-marketing" type="checkbox" ${consent.marketing ? "checked" : ""} />
          <span><strong>${i18n.marketingTitle}</strong><br/><span style="color:#64748b">${i18n.marketingBody}</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid #dbe4f0;background:#ffffff;border-radius:10px;">
          <input id="dp-consent-personalization" type="checkbox" ${consent.personalization ? "checked" : ""} />
          <span><strong>${i18n.personalizationTitle}</strong><br/><span style="color:#64748b">${i18n.personalizationBody}</span></span>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px;">
          <button id="dp-consent-modal-cancel" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer;">${i18n.cancel}</button>
          <button id="dp-consent-modal-reject" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer;">${i18n.reject}</button>
          <button id="dp-consent-modal-save" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;cursor:pointer;">${i18n.save}</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector("#dp-consent-modal-cancel")?.addEventListener("click", close);
    modal.querySelector("#dp-consent-modal-reject")?.addEventListener("click", () => {
      applyConsent({ analytics: false, marketing: false, personalization: false });
      close();
    });
    modal.querySelector("#dp-consent-modal-save")?.addEventListener("click", () => {
      const analytics = Boolean(modal.querySelector("#dp-consent-analytics")?.checked);
      const marketing = Boolean(modal.querySelector("#dp-consent-marketing")?.checked);
      const personalization = Boolean(modal.querySelector("#dp-consent-personalization")?.checked);
      applyConsent({ analytics, marketing, personalization });
      close();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }

  window.dpOpenConsentSettings = function () {
    renderConsentModal();
  };

  function renderConsentBanner() {
    if (readConsent()) return;
    if (document.getElementById("dp-consent-banner")) return;
    const banner = document.createElement("div");
    banner.id = "dp-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#ffffff;color:#0f172a;border:1px solid #dbe4f0;border-radius:12px;padding:14px;box-shadow:0 10px 24px rgba(15,23,42,.14);font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;";
    banner.innerHTML = `
      <div style="max-width:980px;margin:0 auto;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div style="min-width:260px;flex:1">
          Мы хотели бы сообщить вам, что на нашем веб-сайте мы используем функциональные файлы cookie без вашего согласия, в то время как статистические и маркетинговые файлы cookie используются с вашего согласия.
          <a href="privacy-policy.html" style="color:#1d4ed8">Подробная информация об управлении файлами cookie доступна здесь.</a>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="dp-consent-settings" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer">Настроить</button>
          <button id="dp-consent-reject" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer">Только обязательные</button>
          <button id="dp-consent-accept" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;cursor:pointer">Принять все cookie</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    const apply = (analytics) => {
      const enable = Boolean(analytics);
      applyConsent({
        analytics: enable,
        marketing: enable,
        personalization: enable,
      });
      banner.remove();
    };
    banner.querySelector("#dp-consent-settings")?.addEventListener("click", () => {
      banner.remove();
      renderConsentModal();
    });
    banner.querySelector("#dp-consent-reject")?.addEventListener("click", () => apply(false));
    banner.querySelector("#dp-consent-accept")?.addEventListener("click", () => apply(true));
  }

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
    if (!canCollectAnalytics()) return;
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
    if (!canCollectAnalytics()) return;
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

  window.dpTrackMarketingEvent = function (eventName) {
    if (!window.dpHasConsent || !window.dpHasConsent("marketing")) return;
    if (typeof window.dpApiUrl !== "function" || !eventName) return;
    const ev = String(eventName).trim().slice(0, 120);
    if (!ev) return;
    try {
      fetch(window.dpApiUrl("/api/analytics/collect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectPayload({ event: ev, category: "marketing" })),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  window.dpGetPersonalizationState = function () {
    return Boolean(window.dpHasConsent && window.dpHasConsent("personalization"));
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
    await loadPolicyConfig();
    applyConsentSideEffects(currentConsentOrDefault());
    renderConsentBanner();
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
