/**
 * RU/UA: синхронизация document.lang, localStorage, переключатель #language-switcher.
 * Событие: dp-lang-change (detail.lang).
 */
(function () {
  const KEY = "lang";

  const MIN = {
    ru: {
      langLabel: "Язык",
      langSelectAria: "Язык интерфейса",
      langNavAria: "Переключение языка интерфейса",
    },
    uk: {
      langLabel: "Мова",
      langSelectAria: "Мова інтерфейсу",
      langNavAria: "Перемикання мови інтерфейсу",
    },
  };

  function getLang() {
    const l = String(localStorage.getItem(KEY) || "uk").trim().toLowerCase();
    if (l === "ru") return "ru";
    if (l === "uk") return "uk";
    if (l === "en") return "uk";
    return "uk";
  }

  function setHtmlLang() {
    document.documentElement.lang = getLang() === "uk" ? "uk" : "ru";
  }

  function applyMinI18n() {
    const l = getLang();
    const row = MIN[l] || MIN.ru;
    document.querySelectorAll(".lang-switcher [data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (k && row[k]) el.textContent = row[k];
    });
    const nav = document.querySelector('.lang-switcher[role="navigation"]');
    if (nav) {
      const a = row.langNavAria || row.langLabel;
      if (a) nav.setAttribute("aria-label", a);
    }
  }

  function applyDataLangAttrs() {
    const l = getLang();
    document.querySelectorAll("[data-ru][data-uk]").forEach((el) => {
      const v = l === "uk" ? el.getAttribute("data-uk") : el.getAttribute("data-ru");
      if (v == null) return;
      el.textContent = v;
    });
    document.querySelectorAll("[data-ru-placeholder][data-uk-placeholder]").forEach((el) => {
      if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
      const ph = l === "uk" ? el.getAttribute("data-uk-placeholder") : el.getAttribute("data-ru-placeholder");
      if (ph == null) return;
      el.setAttribute("placeholder", ph);
    });
    document.querySelectorAll("[data-ru-aria-label][data-uk-aria-label]").forEach((el) => {
      const v = l === "uk" ? el.getAttribute("data-uk-aria-label") : el.getAttribute("data-ru-aria-label");
      if (v == null) return;
      el.setAttribute("aria-label", v);
    });
    document.querySelectorAll("[data-ru-title][data-uk-title]").forEach((el) => {
      const v = l === "uk" ? el.getAttribute("data-uk-title") : el.getAttribute("data-ru-title");
      if (v == null) return;
      el.setAttribute("title", v);
    });
  }

  function initSwitcher() {
    setHtmlLang();
    const sel = document.getElementById("language-switcher");
    if (sel) {
      sel.value = getLang();
      const row = MIN[getLang()] || MIN.ru;
      const aria = row.langSelectAria || row.langLabel;
      sel.setAttribute("aria-label", aria);
    }
  }

  function dispatch() {
    window.dispatchEvent(new CustomEvent("dp-lang-change", { detail: { lang: getLang() } }));
  }

  function init() {
    setHtmlLang();
    initSwitcher();
    applyMinI18n();
    applyDataLangAttrs();
    const sel = document.getElementById("language-switcher");
    if (sel) {
      sel.addEventListener("change", (e) => {
        const v = e.target && e.target.value;
        if (v !== "ru" && v !== "uk") return;
        localStorage.setItem(KEY, v);
        setHtmlLang();
        if (sel) sel.setAttribute("aria-label", (MIN[v] || MIN.ru).langSelectAria);
        applyMinI18n();
        dispatch();
        if (
          document.body?.dataset?.page === "crm" ||
          document.body?.dataset?.page === "admin" ||
          document.body?.dataset?.page === "account-payment"
        ) {
          window.location.reload();
          return;
        }
        if (window.dpApplyDataLangAttrs) window.dpApplyDataLangAttrs();
      });
    } else {
      /* no switcher: still static RU/UA blocks */
    }
  }

  window.getDpLang = getLang;
  window.setDpLang = function (l) {
    if (l !== "ru" && l !== "uk") return;
    localStorage.setItem(KEY, l);
    setHtmlLang();
    const sel = document.getElementById("language-switcher");
    if (sel) {
      sel.value = l;
      const row = MIN[l] || MIN.ru;
      sel.setAttribute("aria-label", row.langSelectAria || row.langLabel);
    }
    applyMinI18n();
    dispatch();
    if (window.dpApplyDataLangAttrs) window.dpApplyDataLangAttrs();
  };
  window.DP_I18N_MIN = MIN;
  window.dpApplyDataLangAttrs = applyDataLangAttrs;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
