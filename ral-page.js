const FALLBACK_RAL_COLORS = [
  { code: "RAL 1000", name: "Green beige", hex: "#BEBD7F" },
  { code: "RAL 1001", name: "Beige", hex: "#C2B078" },
  { code: "RAL 1003", name: "Signal yellow", hex: "#F9A800" },
  { code: "RAL 1004", name: "Golden yellow", hex: "#E49E00" },
  { code: "RAL 1013", name: "Oyster white", hex: "#EAE6CA" },
  { code: "RAL 1015", name: "Light ivory", hex: "#E6D2B5" },
  { code: "RAL 1018", name: "Zinc yellow", hex: "#F8F32B" },
  { code: "RAL 1021", name: "Rapeseed yellow", hex: "#EEC900" },
  { code: "RAL 1023", name: "Traffic yellow", hex: "#F0CA00" },
  { code: "RAL 2000", name: "Yellow orange", hex: "#DA6E00" },
  { code: "RAL 2002", name: "Vermilion", hex: "#D05D28" },
  { code: "RAL 2004", name: "Pure orange", hex: "#F44611" },
  { code: "RAL 2008", name: "Bright red orange", hex: "#EC7C26" },
  { code: "RAL 3000", name: "Flame red", hex: "#A72920" },
  { code: "RAL 3001", name: "Signal red", hex: "#9B2423" },
  { code: "RAL 3002", name: "Carmine red", hex: "#9B2321" },
  { code: "RAL 3003", name: "Ruby red", hex: "#861A22" },
  { code: "RAL 3004", name: "Purple red", hex: "#6B1C23" },
  { code: "RAL 3005", name: "Wine red", hex: "#59191F" },
  { code: "RAL 3011", name: "Brown red", hex: "#792423" },
  { code: "RAL 3020", name: "Traffic red", hex: "#BB1E10" },
  { code: "RAL 3027", name: "Raspberry red", hex: "#B42041" },
  { code: "RAL 4001", name: "Red lilac", hex: "#8A5A83" },
  { code: "RAL 4004", name: "Claret violet", hex: "#691639" },
  { code: "RAL 4005", name: "Blue lilac", hex: "#83639D" },
  { code: "RAL 5000", name: "Violet blue", hex: "#2D4B70" },
  { code: "RAL 5002", name: "Ultramarine blue", hex: "#00387B" },
  { code: "RAL 5003", name: "Sapphire blue", hex: "#1F3855" },
  { code: "RAL 5005", name: "Signal blue", hex: "#005387" },
  { code: "RAL 5007", name: "Brilliant blue", hex: "#376B8C" },
  { code: "RAL 5010", name: "Gentian blue", hex: "#0E4C92" },
  { code: "RAL 5011", name: "Steel blue", hex: "#1A2B3C" },
  { code: "RAL 5012", name: "Light blue", hex: "#2974B8" },
  { code: "RAL 5015", name: "Sky blue", hex: "#007BC7" },
  { code: "RAL 5017", name: "Traffic blue", hex: "#005B8C" },
  { code: "RAL 5018", name: "Turquoise blue", hex: "#058B8C" },
  { code: "RAL 6000", name: "Patina green", hex: "#327662" },
  { code: "RAL 6001", name: "Emerald green", hex: "#28713E" },
  { code: "RAL 6002", name: "Leaf green", hex: "#2D572C" },
  { code: "RAL 6003", name: "Olive green", hex: "#4E5754" },
  { code: "RAL 6005", name: "Moss green", hex: "#0E4243" },
  { code: "RAL 6007", name: "Bottle green", hex: "#1F3A3D" },
  { code: "RAL 6011", name: "Reseda green", hex: "#6C7C59" },
  { code: "RAL 6018", name: "Yellow green", hex: "#57A639" },
  { code: "RAL 6020", name: "Chrome green", hex: "#2E3A23" },
  { code: "RAL 6024", name: "Traffic green", hex: "#008754" },
  { code: "RAL 7000", name: "Squirrel grey", hex: "#7E8B92" },
  { code: "RAL 7001", name: "Silver grey", hex: "#8F999F" },
  { code: "RAL 7004", name: "Signal grey", hex: "#9EA3B0" },
  { code: "RAL 7005", name: "Mouse grey", hex: "#6B716F" },
  { code: "RAL 7006", name: "Beige grey", hex: "#756F61" },
  { code: "RAL 7011", name: "Iron grey", hex: "#5B646B" },
  { code: "RAL 7012", name: "Basalt grey", hex: "#575D61" },
  { code: "RAL 7015", name: "Slate grey", hex: "#51565C" },
  { code: "RAL 7016", name: "Anthracite grey", hex: "#383E42" },
  { code: "RAL 7021", name: "Black grey", hex: "#2E3234" },
  { code: "RAL 7024", name: "Graphite grey", hex: "#474A50" },
  { code: "RAL 7030", name: "Stone grey", hex: "#939388" },
  { code: "RAL 7032", name: "Pebble grey", hex: "#B9B9A8" },
  { code: "RAL 7035", name: "Light grey", hex: "#CBD0CC" },
  { code: "RAL 7037", name: "Dusty grey", hex: "#7F7F7A" },
  { code: "RAL 7040", name: "Window grey", hex: "#9DA3A6" },
  { code: "RAL 7042", name: "Traffic grey A", hex: "#8F9695" },
  { code: "RAL 7043", name: "Traffic grey B", hex: "#4E5451" },
  { code: "RAL 7044", name: "Silk grey", hex: "#BDBDB2" },
  { code: "RAL 8000", name: "Green brown", hex: "#817863" },
  { code: "RAL 8001", name: "Ochre brown", hex: "#8F6B32" },
  { code: "RAL 8002", name: "Signal brown", hex: "#7A4F2A" },
  { code: "RAL 8003", name: "Clay brown", hex: "#80542F" },
  { code: "RAL 8004", name: "Copper brown", hex: "#8F4E35" },
  { code: "RAL 8011", name: "Nut brown", hex: "#5B3A29" },
  { code: "RAL 8014", name: "Sepia brown", hex: "#4E3B31" },
  { code: "RAL 8017", name: "Chocolate brown", hex: "#442F29" },
  { code: "RAL 8019", name: "Grey brown", hex: "#3D3635" },
  { code: "RAL 8022", name: "Black brown", hex: "#1A1718" },
  { code: "RAL 9001", name: "Cream", hex: "#E9E0D2" },
  { code: "RAL 9002", name: "Grey white", hex: "#D7D5CB" },
  { code: "RAL 9003", name: "Signal white", hex: "#ECECE7" },
  { code: "RAL 9004", name: "Signal black", hex: "#2B2B2C" },
  { code: "RAL 9005", name: "Jet black", hex: "#0E0E10" },
  { code: "RAL 9010", name: "Pure white", hex: "#F4F4F0" },
  { code: "RAL 9011", name: "Graphite black", hex: "#1C1C1F" },
  { code: "RAL 9016", name: "Traffic white", hex: "#F6F6F6" },
  { code: "RAL 9017", name: "Traffic black", hex: "#1E1E20" },
  { code: "RAL 9018", name: "Papyrus white", hex: "#CFD3CD" },
];

let ralColors = [...FALLBACK_RAL_COLORS];
const RAL_FAV_KEY = "ralFavorites";

/** Частые запросы в LKM: белые/серые/сигнальные и базовые RAL Classic */
const POPULAR_RAL_CODES = [
  "RAL 9010",
  "RAL 9016",
  "RAL 9003",
  "RAL 9005",
  "RAL 7016",
  "RAL 7035",
  "RAL 7030",
  "RAL 3000",
  "RAL 3020",
  "RAL 5002",
  "RAL 5005",
  "RAL 5015",
  "RAL 6005",
  "RAL 6024",
  "RAL 8017",
  "RAL 7040",
];

const RAL_SERIES_LABELS = {
  "1xxx": "Жёлто-бежевые",
  "2xxx": "Оранжевые",
  "3xxx": "Красные",
  "4xxx": "Фиолетовые",
  "5xxx": "Синие",
  "6xxx": "Зелёные",
  "7xxx": "Серые",
  "8xxx": "Коричневые",
  "9xxx": "Белые и чёрные",
};

function ralLang() {
  return localStorage.getItem("lang") || "ru";
}

function ralT(key) {
  const dict = {
    ru: {
      copy: "Копировать код",
      copied: "Скопировано",
      fav: "В избранное",
      inFav: "В избранном",
      emptyFav: "Пока нет избранных цветов. Добавьте их из таблицы ниже.",
      emptySection: "Нет оттенков по текущим фильтрам.",
      seriesAll: "Все серии",
      darkTitle: "Тёмные оттенки",
      darkLead: "Низкая яркость на экране — ориентир; на объекте ориентируйтесь на физический образец.",
      lightTitle: "Светлые оттенки",
      lightLead: "Высокая яркость и пастельные тона.",
      byColorTitle: "По цвету (серии RAL Classic)",
      byColorLead: "Группировка по тысячам кода: 1xxx — жёлто-бежевые, … 9xxx — белые и чёрные.",
      popularTitle: "Популярные цвета RAL",
      popularLead: "Оттенки, которые чаще всего заказывают под промышленные покрытия. Полная таблица — внизу, за «Показать ещё».",
      mainLeadShort:
        "Ниже — популярные RAL. Избранное, тёмные и светлые группы и все серии откройте кнопкой «Показать ещё». Слева — поиск и фильтр по серии.",
      showMore: "Показать ещё",
      showLess: "Свернуть",
    },
    uk: {
      copy: "Копіювати код",
      copied: "Скопійовано",
      fav: "В обране",
      inFav: "В обраному",
      emptyFav: "Поки немає обраних кольорів. Додайте їх із таблиці нижче.",
      emptySection: "Немає відтінків за поточними фільтрами.",
      seriesAll: "Усі серії",
      darkTitle: "Темні відтінки",
      darkLead: "Низька яскравість на екрані — орієнтир; на об'єкті звертайтеся до зразка.",
      lightTitle: "Світлі відтінки",
      lightLead: "Висока яскравість і пастельні тони.",
      byColorTitle: "За кольором (серії RAL Classic)",
      byColorLead: "Групування за тисячами коду.",
      popularTitle: "Популярні кольори RAL",
      popularLead: "Відтінки, які найчастіше замовляють. Повна таблиця — нижче, за «Показати ще».",
      mainLeadShort:
        "Нижче — популярні RAL. Обране, темні й світлі групи та всі серії відкрийте кнопкою «Показати ще». Зліва — пошук і фільтр за серією.",
      showMore: "Показати ще",
      showLess: "Згорнути",
    },
    en: {
      copy: "Copy code",
      copied: "Copied",
      fav: "Add favorite",
      inFav: "Favorited",
      emptyFav: "No favorites yet. Add colors from below.",
      emptySection: "No shades match the current filters.",
      seriesAll: "All series",
      darkTitle: "Dark shades",
      darkLead: "Low on-screen brightness is indicative only; use physical samples on site.",
      lightTitle: "Light shades",
      lightLead: "High brightness and pastels.",
      byColorTitle: "By hue (RAL Classic series)",
      byColorLead: "Grouped by code thousands: 1xxx yellow-beige … 9xxx white and black.",
      popularTitle: "Popular RAL colors",
      popularLead: "Shades often specified for industrial coatings. Open “Show more” for the full table.",
      mainLeadShort:
        "Popular RAL shades are listed below. Favorites, dark/light groups and all series are behind “Show more”. Use the left column to search and filter.",
      showMore: "Show more",
      showLess: "Show less",
    },
  };
  const lang = ralLang();
  return (dict[lang] || dict.ru)[key] || key;
}

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(RAL_FAV_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(codes) {
  try {
    localStorage.setItem(RAL_FAV_KEY, JSON.stringify(codes));
  } catch {
    // ignore
  }
}

function toggleFavorite(code) {
  const current = readFavorites();
  const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
  writeFavorites(next);
  renderRalPage();
}

function getGroup(code = "") {
  const match = String(code).match(/RAL\s+(\d)/i);
  return match ? `${match[1]}xxx` : "other";
}

function normRalCode(code) {
  return String(code || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function popularOrderedFromBase(base) {
  const idx = new Map(POPULAR_RAL_CODES.map((c, i) => [normRalCode(c), i]));
  return [...base]
    .filter((c) => idx.has(normRalCode(c.code)))
    .sort((a, b) => (idx.get(normRalCode(a.code)) ?? 999) - (idx.get(normRalCode(b.code)) ?? 999));
}

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function isDarkTone(hex) {
  return luminance(hex) <= 0.38;
}

function isLightTone(hex) {
  return luminance(hex) >= 0.62;
}

function cardHtml(c, favorites) {
  const inFav = favorites.includes(c.code);
  return `
        <article class="ral-card">
          <div class="ral-swatch" style="background:${c.hex}" aria-label="${c.code} ${c.name}"></div>
          <h3>${c.code}</h3>
          <p>${c.name}</p>
          <small>${c.hex}</small>
          <div class="ral-actions">
            <button class="ral-fav-btn ${inFav ? "active" : ""}" type="button" data-fav-ral="${c.code}">${inFav ? ralT("inFav") : ralT("fav")}</button>
            <button class="ral-copy-btn" type="button" data-copy-ral="${c.code}">${ralT("copy")}</button>
          </div>
        </article>
      `;
}

function filterByQueryAndSeries(items, q, series) {
  return items.filter((c) => {
    const matchQuery = !q || `${c.code} ${c.name}`.toLowerCase().includes(q);
    const matchSeries = series === "all" || getGroup(c.code) === series;
    return matchQuery && matchSeries;
  });
}

async function loadModernRalPalette() {
  const status = document.getElementById("ral-status");
  const sources = [
    "https://cdn.jsdelivr.net/gh/yisibl/ral-color-table@master/ral-classic.json",
    "https://cdn.jsdelivr.net/npm/ral-colors@latest/ral-classic.json",
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rows = Array.isArray(data)
        ? data
            .map((x) => ({
              code: x.code || x.ral || x.id || "",
              name: x.name || x.title || "",
              hex: x.hex || x.color || "",
            }))
            .filter((x) => x.code && x.hex)
        : [];
      if (rows.length >= 50) {
        ralColors = rows.map((r) => ({
          code: String(r.code).toUpperCase().startsWith("RAL") ? String(r.code).toUpperCase() : `RAL ${String(r.code).replace(/[^\d]/g, "")}`,
          name: r.name || "RAL color",
          hex: r.hex.startsWith("#") ? r.hex : `#${r.hex}`,
        }));
        if (status) status.textContent = "";
        return;
      }
    } catch {
      // continue
    }
  }
  if (status) status.textContent = "Используется встроенная таблица RAL.";
}

let selectedSeries = "all";

function buildSeriesChips() {
  const wrap = document.getElementById("ral-series-chips");
  if (!wrap) return;
  const groups = [...new Set(ralColors.map((c) => getGroup(c.code)))].filter((g) => g !== "other").sort();
  const chips = [
    { value: "all", label: ralT("seriesAll") },
    ...groups.map((g) => ({ value: g, label: `${g} · ${RAL_SERIES_LABELS[g] || g}` })),
  ];
  wrap.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="ral-filter-chip${selectedSeries === c.value ? " is-active" : ""}" data-ral-series="${c.value}">${c.label}</button>`
    )
    .join("");
}

let ralExtraExpanded = false;

function applyRalSectionLabels() {
  const pairs = [
    ["ral-popular-title", "popularTitle"],
    ["ral-popular-lead", "popularLead"],
    ["ral-dark-title", "darkTitle"],
    ["ral-dark-lead", "darkLead"],
    ["ral-light-title", "lightTitle"],
    ["ral-light-lead", "lightLead"],
    ["ral-by-color-title", "byColorTitle"],
    ["ral-by-color-lead", "byColorLead"],
  ];
  for (const [id, key] of pairs) {
    const el = document.getElementById(id);
    if (el) el.textContent = ralT(key);
  }
  const mainLead = document.getElementById("ral-main-lead-text");
  if (mainLead) mainLead.textContent = ralT("mainLeadShort");
}

function syncRalExtraPanel() {
  const wrap = document.getElementById("ral-extra-sections");
  const btn = document.getElementById("ral-show-more");
  if (!wrap || !btn) return;
  if (ralExtraExpanded) {
    wrap.removeAttribute("hidden");
    btn.setAttribute("aria-expanded", "true");
    btn.textContent = ralT("showLess");
  } else {
    wrap.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = ralT("showMore");
  }
}

function renderRalPage() {
  applyRalSectionLabels();

  const searchEl = document.getElementById("ral-search");
  const popularRoot = document.getElementById("ral-section-popular");
  const darkRoot = document.getElementById("ral-section-dark");
  const lightRoot = document.getElementById("ral-section-light");
  const seriesRoot = document.getElementById("ral-by-series");
  const favRoot = document.getElementById("ral-favorites");
  if (!searchEl || !popularRoot || !darkRoot || !lightRoot || !seriesRoot || !favRoot) return;

  const q = searchEl.value.trim().toLowerCase();
  const favorites = readFavorites();
  const base = filterByQueryAndSeries(ralColors, q, selectedSeries);

  const popularItems = popularOrderedFromBase(base);
  popularRoot.innerHTML = popularItems.length
    ? popularItems.map((c) => cardHtml(c, favorites)).join("")
    : `<p class="ral-empty-hint">${ralT("emptySection")}</p>`;

  const darkItems = base.filter((c) => isDarkTone(c.hex));
  const lightItems = base.filter((c) => isLightTone(c.hex));

  darkRoot.innerHTML = darkItems.length ? darkItems.map((c) => cardHtml(c, favorites)).join("") : `<p class="ral-empty-hint">${ralT("emptySection")}</p>`;
  lightRoot.innerHTML = lightItems.length ? lightItems.map((c) => cardHtml(c, favorites)).join("") : `<p class="ral-empty-hint">${ralT("emptySection")}</p>`;

  const groups = [...new Set(ralColors.map((c) => getGroup(c.code)))].filter((g) => g !== "other").sort();
  const bySeriesHtml = groups
    .map((g) => {
      const inGroup = base.filter((c) => getGroup(c.code) === g);
      if (!inGroup.length) return "";
      const label = `${g} — ${RAL_SERIES_LABELS[g] || g}`;
      return `
        <section class="ral-series-block" id="ral-series-${g.replace(/x/g, "")}">
          <h4 class="ral-series-title">${label}</h4>
          <div class="ral-grid ral-grid--inline">${inGroup.map((c) => cardHtml(c, favorites)).join("")}</div>
        </section>
      `;
    })
    .join("");
  seriesRoot.innerHTML = bySeriesHtml || `<p class="ral-empty-hint">${ralT("emptySection")}</p>`;

  const favs = new Set(favorites);
  const favItems = ralColors.filter((c) => favs.has(c.code));
  if (!favItems.length) {
    favRoot.innerHTML = `<article class="ral-card ral-card--empty"><p>${ralT("emptyFav")}</p></article>`;
  } else {
    favRoot.innerHTML = favItems.map((c) => cardHtml(c, favorites)).join("");
  }

  buildSeriesChips();
  syncRalExtraPanel();
}

async function onCopy(btn, code) {
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = ralT("copied");
    setTimeout(() => {
      btn.textContent = ralT("copy");
    }, 1000);
  } catch {
    btn.textContent = code;
    setTimeout(() => {
      btn.textContent = ralT("copy");
    }, 1300);
  }
}

function initRalPage() {
  const main = document.querySelector("main");
  const search = document.getElementById("ral-search");
  const reset = document.getElementById("ral-reset");
  const chipsHost = document.getElementById("ral-series-chips");

  if (!main || !search) return;

  renderRalPage();
  search.addEventListener("input", renderRalPage);
  reset?.addEventListener("click", () => {
    search.value = "";
    selectedSeries = "all";
    renderRalPage();
  });

  chipsHost?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ral-series]");
    if (!btn) return;
    selectedSeries = btn.getAttribute("data-ral-series") || "all";
    renderRalPage();
  });

  document.getElementById("ral-show-more")?.addEventListener("click", () => {
    ralExtraExpanded = !ralExtraExpanded;
    syncRalExtraPanel();
  });

  main.addEventListener("click", async (e) => {
    const favBtn = e.target.closest("[data-fav-ral]");
    if (favBtn) {
      toggleFavorite(favBtn.getAttribute("data-fav-ral") || "");
      return;
    }
    const copyBtn = e.target.closest("[data-copy-ral]");
    if (!copyBtn) return;
    await onCopy(copyBtn, copyBtn.getAttribute("data-copy-ral") || "");
  });

  loadModernRalPalette().then(() => {
    renderRalPage();
  });
}

initRalPage();
