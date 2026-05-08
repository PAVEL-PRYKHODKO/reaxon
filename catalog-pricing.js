(function () {
  /** Единый набор фасовок (кг): расчёт колонок каталога / карточки товара (не путать с тремя колонками прайса). */
  const WEIGHTS = [0.9, 19.7, 46.6];

  /** Поля каталога/прайса, подмешиваемые из site-content productOverrides. */
  const CATALOG_OVERRIDE_KEYS = [
    "family",
    "code",
    "lineCode",
    "series",
    "name",
    "bucketKg",
    "drumKg",
    "priceNoNdsPerKg",
    "priceNdsPerKg",
  ];

  /** Подпись в карточке и списках: перед чисто цифровым SKU — «Артикул: N». */
  window.dpFormatArticleUi = function dpFormatArticleUi(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "—") return "—";
    if (/^\d+$/.test(s)) return `Артикул: ${s}`;
    return s;
  };

  window.dpMergeCatalogRaw = function dpMergeCatalogRaw(raw) {
    if (!raw || raw.id == null) return raw;
    const id = String(raw.id);
    const ov = (window.DP_PRODUCT_OVERRIDES || {})[id];
    if (!ov || typeof ov !== "object") return raw;
    const out = { ...raw };
    for (const k of CATALOG_OVERRIDE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(ov, k)) {
        out[k] = ov[k];
      }
    }
    return out;
  };

  /** Веса фасовок для чипов каталога и PDP (dpStandardRetailJarKg). */
  window.dpStandardRetailJarKg = [0.9, 19.7, 46.6];

  /** Не дублировать чип, если такой вес уже задан ведром или бочкой. */
  window.dpPackKgMatchesBucketOrDrum = function dpPackKgMatchesBucketOrDrum(product, w) {
    const tol = 0.05;
    const kg = Number(w);
    if (!Number.isFinite(kg)) return false;
    const bw = Number(product && product.bucketKg);
    const dw = Number(product && product.drumKg);
    if (Number.isFinite(bw) && Math.abs(bw - kg) < tol) return true;
    if (Number.isFinite(dw) && Math.abs(dw - kg) < tol) return true;
    return false;
  };

  function round2(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  /** Единое округление цен и весов до копеек (как на прайсе и в расчёте фасовок). */
  window.dpRoundMoney = round2;

  /** RU — короткие подписи типа покрытия для прайса / фильтра (как в колонке). */
  const DP_COATING_FAMILY_SHORT_RU = {
    lacquer: "Лак",
    primer: "Грунт",
    "primer-gf": "Грунт",
    enamel: "Эмаль",
    "enamel-pf": "Эмаль",
    paint: "Краска",
    putty: "Шпаклёвка",
    solvent: "Растворитель",
    other: "Прочее",
  };

  /** UA — ті самі поняття (фарба, емаль, ґрунт, розчинник…). */
  const DP_COATING_FAMILY_SHORT_UK = {
    lacquer: "Лак",
    primer: "Ґрунт",
    "primer-gf": "Ґрунт",
    enamel: "Емаль",
    "enamel-pf": "Емаль",
    paint: "Фарба",
    putty: "Шпаклівка",
    solvent: "Розчинник",
    other: "Інше",
  };

  /** RU/UA заголовки для карточки товара (род. мн.). */
  const DP_COATING_FAMILY_PDP_TITLE_RU = {
    lacquer: "Лаки",
    primer: "Грунтовки",
    "primer-gf": "Грунтовки",
    enamel: "Эмали",
    "enamel-pf": "Эмали",
    paint: "Краски",
    putty: "Шпаклёвки",
    solvent: "Растворители",
    other: "Прочее",
  };

  const DP_COATING_FAMILY_PDP_TITLE_UK = {
    lacquer: "Лаки",
    primer: "Ґрунтовки",
    "primer-gf": "Ґрунтовки",
    enamel: "Емалі",
    "enamel-pf": "Емалі",
    paint: "Фарби",
    putty: "Шпаклівки",
    solvent: "Розчинники",
    other: "Інше",
  };

  function dpCatalogUiLang() {
    if (typeof window.getDpLang === "function") {
      return window.getDpLang() === "uk" ? "uk" : "ru";
    }
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("lang") === "ru" ? "ru" : "uk";
    } catch (_) {
      return "uk";
    }
  }

  /**
   * Короткая подпись типа покрытия для прайса и фильтра (RU/UA по интерфейсу).
   */
  window.dpPriceFamilyLocalized = function dpPriceFamilyLocalized(family) {
    const raw = String(family ?? "").trim();
    if (!raw) return "—";
    const k = raw.toLowerCase().replace(/_/g, "-");
    const shortMap = dpCatalogUiLang() === "uk" ? DP_COATING_FAMILY_SHORT_UK : DP_COATING_FAMILY_SHORT_RU;
    if (shortMap[k]) return shortMap[k];
    return raw;
  };

  /** Сохранено для совместимости со старым кодом прайса. */
  window.dpPriceFamilyRuShort = window.dpPriceFamilyLocalized;

  /**
   * Порядок типов покрытия в редактируемых селектах (ключ = значение поля catalog.family).
   */
  window.DP_PRICE_FAMILY_EDIT_ORDER = [
    "enamel-pf",
    "primer-gf",
    "enamel",
    "primer",
    "paint",
    "lacquer",
    "putty",
    "solvent",
    "other",
  ];

  /**
   * Fragment HTML опций для &lt;select&gt; типа покрытия: подписи по языку сайта (RU/UA), value — ключ данных.
   * @param {(s: unknown) => string} escapeHtmlFn
   */
  window.dpPriceFamilySelectOptionsInnerHtml = function dpPriceFamilySelectOptionsInnerHtml(escapeHtmlFn, rawFamily) {
    const esc = typeof escapeHtmlFn === "function" ? escapeHtmlFn : function (x) {
      return String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    };
    const v = rawFamily == null ? "" : String(rawFamily).trim();
    const norm = v.toLowerCase().replace(/_/g, "-");
    const order =
      Array.isArray(window.DP_PRICE_FAMILY_EDIT_ORDER) && window.DP_PRICE_FAMILY_EDIT_ORDER.length > 0
        ? window.DP_PRICE_FAMILY_EDIT_ORDER
        : ["enamel-pf", "primer-gf", "enamel", "primer", "paint", "lacquer", "putty", "solvent", "other"];
    const preset = new Set(order.map((k) => String(k).toLowerCase().replace(/_/g, "-")));
    const parts = [];
    parts.push(`<option value=""${!norm ? " selected" : ""}>${esc(dpPriceFamilyLocalized(""))}</option>`);
    let unknown = false;
    if (norm && !preset.has(norm)) {
      parts.push(`<option value="${esc(v)}" selected>${esc(dpPriceFamilyLocalized(v))}</option>`);
      unknown = true;
    }
    for (const key of order) {
      const k = String(key).toLowerCase().replace(/_/g, "-");
      const sel = !unknown && norm === k ? " selected" : "";
      parts.push(`<option value="${esc(key)}"${sel}>${esc(dpPriceFamilyLocalized(key))}</option>`);
    }
    return parts.join("");
  };

  /**
   * Строки RU + UA через пробел для поиска по типу покрытия на любом языке.
   */
  window.dpPriceFamilySearchHay = function dpPriceFamilySearchHay(family) {
    const raw = String(family ?? "").trim();
    if (!raw) return "";
    const k = raw.toLowerCase().replace(/_/g, "-");
    const ru = DP_COATING_FAMILY_SHORT_RU[k] || "";
    const uk = DP_COATING_FAMILY_SHORT_UK[k] || "";
    return `${raw} ${ru} ${uk}`
      .toLowerCase()
      .trim();
  };

  /** Подпись категории на странице товара (блок над ценой / мета). */
  window.dpPdpFamilyCategoryTitle = function dpPdpFamilyCategoryTitle(family) {
    const raw = String(family ?? "").trim();
    const k = raw.toLowerCase().replace(/_/g, "-");
    const ukMap = DP_COATING_FAMILY_PDP_TITLE_UK;
    const ruMap = DP_COATING_FAMILY_PDP_TITLE_RU;
    const isUk = dpCatalogUiLang() === "uk";
    const primary = isUk ? ukMap[k] : ruMap[k];
    const secondary = isUk ? ruMap[k] : ukMap[k];
    if (primary !== undefined && primary !== "") return primary;
    if (secondary !== undefined && secondary !== "") return secondary;
    return isUk ? ukMap.other : ruMap.other;
  };

  window.dpCatalogPriceTypeColumnHeading = function dpCatalogPriceTypeColumnHeading() {
    return dpCatalogUiLang() === "uk" ? "Тип покриття" : "Тип покрытия";
  };

  window.dpCatalogPriceFilterAllFamiliesLabel = function dpCatalogPriceFilterAllFamiliesLabel() {
    return dpCatalogUiLang() === "uk" ? "Всі типи покриття" : "Все типы покрытия";
  };

  /**
   * Если в каталоге ошибочно указано family=primer, но по назв. товара це емаль або лак — виправити.
   * «ГФ-1426» у назві — номенклатура марки, не «сімейство грунтовка».
   */
  function dpInferCatalogFamilyFromUaRuName(nm, currentFamily) {
    const fam = String(currentFamily || "").toLowerCase();
    if (fam !== "primer") return currentFamily;
    const n = String(nm ?? "").trim();
    if (!n) return currentFamily;
    const first = (n.split(/\s+/)[0] || "").trim();
    const firstLower = first.replace(/[.,;]+$/g, "").toLowerCase();
    if (firstLower === "ламель") return currentFamily;
    if (firstLower === "лак") return "lacquer";
    if (firstLower === "емаль" || firstLower === "эмаль") return "enamel";
    return currentFamily;
  }

  /**
   * Нормализация числовых полей позиции каталога после импорта/редактирования.
   */
  window.dpNormalizeCatalogProduct = function dpNormalizeCatalogProduct(p) {
    if (!p || typeof p !== "object") return p;
    const out = { ...p };
    const r = window.dpRoundMoney;
    const rn = typeof r === "function" ? r : (v) => Math.round(Number(v) * 100) / 100;
    for (const key of ["priceNoNdsPerKg", "priceNdsPerKg", "jarSmallKg", "jarBigKg", "bucketKg", "drumKg"]) {
      const v = out[key];
      if (v === "" || v === undefined) {
        out[key] = null;
        continue;
      }
      if (v == null) {
        out[key] = null;
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) out[key] = null;
      else out[key] = rn(n);
    }
    const label = String(out.name || out.fullName || "").trim();
    const fixedFam = dpInferCatalogFamilyFromUaRuName(label, out.family);
    if (fixedFam !== out.family) out.family = fixedFam;
    return out;
  };

  window.dpNormalizeCatalogProductsInPlace = function dpNormalizeCatalogProductsInPlace(arr) {
    if (!Array.isArray(arr) || typeof window.dpNormalizeCatalogProduct !== "function") return arr;
    for (let i = 0; i < arr.length; i++) arr[i] = window.dpNormalizeCatalogProduct(arr[i]);
    return arr;
  };

  /** Три колонки таблицы прайса на сайте: сумма с НДС = цена с НДС (грн/кг) × массу фасовки. */
  const PRICE_TABLE_PACK_KG = [2.8, 19.4, 46.6];

  /** @returns {number[]|null} три суммы с НДС для столбцов прайса или null */
  window.dpComputePriceTablePackTotalsNds = function dpComputePriceTablePackTotalsNds(priceNdsPerKg) {
    const r = Number(priceNdsPerKg);
    if (!Number.isFinite(r) || r <= 0) return null;
    return PRICE_TABLE_PACK_KG.map((w) => round2(r * w));
  };

  /** Те же три массы, что PRICE_TABLE_PACK_KG: сумма без НДС = цена без НДС × кг упаковки. */
  window.dpComputePriceTablePackTotalsNoNds = function dpComputePriceTablePackTotalsNoNds(priceNoNdsPerKg) {
    const r = Number(priceNoNdsPerKg);
    if (!Number.isFinite(r) || r <= 0) return null;
    return PRICE_TABLE_PACK_KG.map((w) => round2(r * w));
  };

  window.dpCatalogPackWeights = WEIGHTS;

  /** @returns {Record<string, number>|null} ключи веса фасовок (строка → сумма) */
  window.dpComputePackPricesNds = function dpComputePackPricesNds(priceNdsPerKg) {
    const r = Number(priceNdsPerKg);
    if (!Number.isFinite(r) || r <= 0) return null;
    const o = {};
    for (const w of WEIGHTS) o[String(w)] = round2(r * w);
    return o;
  };

  window.dpComputePackPricesNoNds = function dpComputePackPricesNoNds(priceNoNdsPerKg) {
    const r = Number(priceNoNdsPerKg);
    if (!Number.isFinite(r) || r <= 0) return null;
    const o = {};
    for (const w of WEIGHTS) o[String(w)] = round2(r * w);
    return o;
  };

  /** Сумма фасовки → цена за кг */
  window.dpPerKgFromPackTotal = function dpPerKgFromPackTotal(total, kg) {
    const t = Number(total);
    const k = Number(kg);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(k) || k <= 0) return null;
    return round2(t / k);
  };

  window.dpFormatPackMoney = function dpFormatPackMoney(n) {
    const x = round2(n);
    if (x == null || x <= 0) return "—";
    return x.toFixed(2);
  };

  function dpUnitRetailNds(product) {
    const u = Number(product && product.priceNdsPerKg);
    return Number.isFinite(u) && u > 0 ? u : null;
  }

  function dpRetailPackTotal(product, packType) {
    const w = packType === "bucket" ? product && product.bucketKg : product && product.drumKg;
    const u = dpUnitRetailNds(product);
    if (w == null || u == null) return null;
    const t = Number(w) * Number(u);
    return Number.isFinite(t) ? round2(t) : null;
  }

  function dpRetailJarTotal(product, jarKg) {
    const u = dpUnitRetailNds(product);
    const w = Number(jarKg);
    if (u == null || !Number.isFinite(w) || w <= 0) return null;
    const t = w * Number(u);
    return Number.isFinite(t) ? round2(t) : null;
  }

  function dpFormatFixedJarLabel(w) {
    const n = Number(w);
    if (n === 0.9) return "0,9 кг";
    if (n === 19.7) return "19,7 кг";
    if (n === 46.6) return "46,6 кг";
    if (n === 2.8) return "2,8 кг";
    const s = String(w);
    return `${s.includes(".") ? s.replace(".", ",") : s} кг`;
  }

  /**
   * Классификация фасовки по массе (кг) для дефолтного вывода:
   * 0.1–2.7 — банка мал
   * 2.8–6   — банка бол
   * 7–30    — ведро
   * 32–50   — барабан
   */
  function dpPackClassByKg(kgRaw) {
    const w = round2(Number(kgRaw));
    if (w == null || !Number.isFinite(w) || w <= 0) return null;
    if (w >= 0.1 && w <= 2.7) return { kind: "jar", sub: "банка мал" };
    if (w >= 2.8 && w <= 6) return { kind: "jar", sub: "банка бол" };
    if (w >= 7 && w <= 30) return { kind: "bucket", sub: "ведро" };
    if (w >= 32 && w <= 50) return { kind: "drum", sub: "барабан" };
    return null;
  }

  function dpLooksLikePackMassColumn(labelRaw) {
    const label = String(labelRaw || "").toLowerCase();
    // Считаем доп. колонку фасовкой, только если это явно колонка кг.
    return /(^|[^a-zа-я])(кг|kg)([^a-zа-я]|$)/i.test(label);
  }

  function dpProductPackMassesFromPrice(product) {
    const source = [
      Number(product && product.jarSmallKg),
      Number(product && product.jarBigKg),
      Number(product && product.bucketKg),
      Number(product && product.drumKg),
    ];
    const extra = product && product.extraPriceColumns && typeof product.extraPriceColumns === "object"
      ? product.extraPriceColumns
      : null;
    if (extra) {
      for (const [label, raw] of Object.entries(extra)) {
        if (!dpLooksLikePackMassColumn(label)) continue;
        source.push(Number(raw));
      }
    }
    const out = [];
    const seen = new Set();
    for (const wRaw of source) {
      const w = round2(Number(wRaw));
      if (!Number.isFinite(w) || w <= 0) continue;
      const key = String(w);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out;
  }

  window.dpPackChipSortKg = function dpPackChipSortKg(product, c) {
    if (!c) return 0;
    const pm = Number(c.packMassKg);
    if (Number.isFinite(pm) && pm > 0) return pm;
    if (c.kind === "jar") return Number(c.jarKg) || 0;
    if (c.kind === "bucket") return Number(product && product.bucketKg) || 0;
    if (c.kind === "drum") return Number(product && product.drumKg) || 0;
    return 0;
  };

  window.dpInferPackKindFromKg = function dpInferPackKindFromKg(kgRaw) {
    const c = dpPackClassByKg(kgRaw);
    return c ? c.kind : null;
  };

  /** Все логические фасовки (в т.ч. без цены) — из всех кг текущей позиции прайса. */
  window.dpBuildPackChipsRaw = function dpBuildPackChipsRaw(product) {
    if (!product) return [];
    const chips = [];
    if (Number(product.priceNdsPerKg) > 0) {
      const source = dpProductPackMassesFromPrice(product);
      for (const w of source) {
        let inf =
          typeof window.dpInferPackKindFromKg === "function"
            ? window.dpInferPackKindFromKg(w)
            : null;
        if (!inf) inf = "jar";
        if (!inf) continue;
        const total = dpRetailJarTotal(product, w);
        const cls = dpPackClassByKg(w);
        const sub = cls?.sub || (inf === "bucket" ? "ведро" : inf === "drum" ? "барабан" : "фасовка");
        chips.push({
          kind: inf,
          packType: inf === "jar" ? "jar" : inf,
          jarKg: inf === "jar" ? w : null,
          packMassKg: w,
          label: dpFormatFixedJarLabel(w),
          sub,
          price: total,
          disabled: total == null,
        });
      }
    }
    chips.sort((a, b) => window.dpPackChipSortKg(product, a) - window.dpPackChipSortKg(product, b));
    return chips;
  };

  window.dpResolvePackOptionRow = function dpResolvePackOptionRow(product, row) {
    if (!product || !row) return null;
    const sameKg = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.05;
    const kind = String(row.kind || "").toLowerCase();
    const labelOv = String(row.label || "").trim();
    const subOv = String(row.sub || "").trim();
    if (kind === "bucket") {
      const ov = Number(row.jarKg);
      const cat = Number(product.bucketKg);
      if (!Number.isFinite(cat) || cat <= 0) return null;
      if (Number.isFinite(ov) && ov > 0 && !sameKg(ov, cat)) return null;
      const w = Number(cat);
      const total = dpRetailJarTotal(product, w);
      const lbl = labelOv || dpFormatFixedJarLabel(w);
      const cls = dpPackClassByKg(w);
      return {
        kind: "bucket",
        packType: "bucket",
        jarKg: null,
        packMassKg: w,
        label: lbl,
        sub: subOv || cls?.sub || "ведро",
        price: total,
        disabled: total == null,
      };
    }
    if (kind === "drum") {
      const ov = Number(row.jarKg);
      const cat = Number(product.drumKg);
      if (!Number.isFinite(cat) || cat <= 0) return null;
      if (Number.isFinite(ov) && ov > 0 && !sameKg(ov, cat)) return null;
      const w = Number(cat);
      const total = dpRetailJarTotal(product, w);
      const lbl = labelOv || dpFormatFixedJarLabel(w);
      const cls = dpPackClassByKg(w);
      return {
        kind: "drum",
        packType: "drum",
        jarKg: null,
        packMassKg: w,
        label: lbl,
        sub: subOv || cls?.sub || "барабан",
        price: total,
        disabled: total == null,
      };
    }
    if (kind === "jar") {
      const w = Number(row.jarKg);
      if (!Number.isFinite(w) || w <= 0) return null;
      const inPriceForProduct = dpProductPackMassesFromPrice(product).some((x) => sameKg(w, x));
      if (!inPriceForProduct) return null;
      const total = dpRetailJarTotal(product, w);
      const defLabel = dpFormatFixedJarLabel(w);
      const cls = dpPackClassByKg(w);
      return {
        kind: "jar",
        packType: "jar",
        jarKg: w,
        packMassKg: w,
        label: labelOv || defLabel,
        sub: subOv || cls?.sub || "банка",
        price: total,
        disabled: total == null,
      };
    }
    return null;
  };

  /** Чипы для каталога и PDP: с учётом черновика `detailPackOptions` в overrides. */
  window.dpApplyDetailPackChips = function dpApplyDetailPackChips(product, ov) {
    const raw = window.dpBuildPackChipsRaw(product);
    // Источник истины для витрины — прайс (jarSmall/jarBig/bucket/drum).
    // Это гарантирует, что после импорта/изменения прайса фасовки на карточках
    // автоматически совпадают с таблицей прайса для каждой позиции.
    return Array.isArray(raw) ? raw : [];
  };

  window.dpDefaultPackOptionRows = function dpDefaultPackOptionRows(product) {
    return window.dpBuildPackChipsRaw(product).map((c) => {
      const pm = Number(c.packMassKg);
      const j = Number(c.jarKg);
      const mass = Number.isFinite(pm) && pm > 0 ? pm : Number.isFinite(j) && j > 0 ? j : null;
      return {
        kind: c.kind,
        jarKg: mass,
        label: "",
        sub: "",
        hidden: false,
      };
    });
  };

  window.dpNormalizePackOptionRows = function dpNormalizePackOptionRows(arr) {
    return (Array.isArray(arr) ? arr : []).map((r) => {
      const hasKind = r && typeof r === "object" && Object.prototype.hasOwnProperty.call(r, "kind");
      const k = String(r.kind || "jar").toLowerCase();
      let kind = k === "bucket" || k === "drum" ? k : "jar";
      const n = Number(r.jarKg);
      const jarKg = Number.isFinite(n) && n > 0 ? n : null;
      // Автоклассификация только для legacy-строк без явного типа:
      // если админ вручную выбрал тип, сохраняем его как есть.
      if (!hasKind && kind === "jar" && jarKg != null && typeof window.dpInferPackKindFromKg === "function") {
        const inferred = window.dpInferPackKindFromKg(jarKg);
        if (inferred === "bucket" || inferred === "drum") kind = inferred;
      }
      return {
        kind,
        jarKg,
        label: String(r.label || "").trim(),
        sub: String(r.sub || "").trim(),
        hidden: Boolean(r.hidden),
      };
    });
  };

  /** Стабильный ключ строки настроек фасовок (массово / overrides). Совпадает с логикой dpCatalogPackImageKey по kind+kg. */
  window.dpPackOptionRowStableKey = function dpPackOptionRowStableKey(row) {
    if (!row || typeof row !== "object") return "";
    const kind = String(row.kind || "jar").toLowerCase();
    const k = kind === "bucket" || kind === "drum" ? kind : "jar";
    if (k === "bucket") {
      const j = Number(row.jarKg);
      if (!Number.isFinite(j) || j <= 0) return "bucket";
      const r = round2(j);
      return `bucket:${String(r)}`;
    }
    if (k === "drum") {
      const j = Number(row.jarKg);
      if (!Number.isFinite(j) || j <= 0) return "drum";
      const r = round2(j);
      return `drum:${String(r)}`;
    }
    const j = Number(row.jarKg);
    if (!Number.isFinite(j) || j <= 0) return "";
    const r = round2(j);
    return `jar:${String(r)}`;
  };

  /**
   * Объединение фасовок по каталогу: из всех кг-полей прайса по всем позициям.
   * Тип определяется по dpInferPackKindFromKg (текущая классификация диапазонов).
   */
  window.dpAggregateDefaultPackRowsForCatalog = function dpAggregateDefaultPackRowsForCatalog(products) {
    const list = Array.isArray(products) ? products : [];
    const seen = new Set();
    const acc = [];
    function sortAgg(rows) {
      const kindOrder = { jar: 0, bucket: 1, drum: 2 };
      return [...rows].sort((a, b) => {
        const ka = String(a.kind || "jar").toLowerCase();
        const kb = String(b.kind || "jar").toLowerCase();
        const oa = kindOrder[ka] ?? 9;
        const ob = kindOrder[kb] ?? 9;
        if (oa !== ob) return oa - ob;
        const ma = Number(a.jarKg) || 0;
        const mb = Number(b.jarKg) || 0;
        return ma - mb;
      });
    }
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const weights = dpProductPackMassesFromPrice(p);
      for (const w of weights) {
        let inferred = typeof window.dpInferPackKindFromKg === "function" ? window.dpInferPackKindFromKg(w) : null;
        if (!inferred) inferred = "jar";
        if (!inferred) continue;
        const cls = dpPackClassByKg(w);
        const r = {
          kind: inferred,
          jarKg: w,
          label: "",
          sub: cls?.sub || (inferred === "bucket" ? "ведро" : inferred === "drum" ? "барабан" : "фасовка"),
          hidden: false,
        };
        const key = typeof window.dpPackOptionRowStableKey === "function" ? window.dpPackOptionRowStableKey(r) : "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        acc.push(r);
      }
    }
    if (acc.length) return window.dpNormalizePackOptionRows(sortAgg(acc));
    return window.dpNormalizePackOptionRows([]);
  };

  /** Стабильный ключ фасовки для catalogPackImages: jar:кг или bucket/drum — как для чипов каталога и PDP. */
  window.dpCatalogPackImageKey = function dpCatalogPackImageKey(chip) {
    if (!chip || typeof chip !== "object") return "";
    const k = String(chip.kind || chip.packType || "").toLowerCase();
    if (k === "jar") {
      const kg = Number(chip.jarKg);
      if (!Number.isFinite(kg) || kg <= 0) return "";
      const r = round2(kg);
      return `jar:${String(r)}`;
    }
    if (k === "bucket") {
      const pm = Number(chip.packMassKg);
      const jq = Number(chip.jarKg);
      const kg = Number.isFinite(pm) && pm > 0 ? pm : jq;
      if (!Number.isFinite(kg) || kg <= 0) return "bucket";
      const r = round2(kg);
      return `bucket:${String(r)}`;
    }
    if (k === "drum") {
      const pm = Number(chip.packMassKg);
      const jq = Number(chip.jarKg);
      const kg = Number.isFinite(pm) && pm > 0 ? pm : jq;
      if (!Number.isFinite(kg) || kg <= 0) return "drum";
      const r = round2(kg);
      return `drum:${String(r)}`;
    }
    return "";
  };

  function catalogPackKeyAliases(keyRaw) {
    const key = String(keyRaw || "").trim().toLowerCase();
    if (!key) return [];
    const out = [key];
    if (key.startsWith("bucket:")) out.push("bucket");
    else if (key === "bucket") out.push("bucket:20");
    if (key.startsWith("drum:")) out.push("drum");
    else if (key === "drum") out.push("drum:50");
    return [...new Set(out)];
  }

  /** URL картинки для выбранной фасовки из overrides.catalogPackImages или null (тогда см. общее cardImageUrl и т. д.). */
  window.dpCatalogPackImageUrlOrNull = function dpCatalogPackImageUrlOrNull(ov, packChipLike) {
    if (!ov || typeof ov !== "object") return null;
    const map = ov.catalogPackImages;
    if (!map || typeof map !== "object") return null;
    const key = typeof window.dpCatalogPackImageKey === "function" ? window.dpCatalogPackImageKey(packChipLike) : "";
    if (!key) return null;
    const keys = catalogPackKeyAliases(key);
    for (const k of keys) {
      const u = map[k];
      if (typeof u !== "string") continue;
      const t = u.trim().slice(0, 520);
      if (!t) continue;
      if (typeof window.dpResolveMediaUrl === "function") {
        const r = window.dpResolveMediaUrl(t);
        if (r) return r;
      }
      return t;
    }
    return null;
  };

  /**
   * Превращает текстовые коды каталога (ГФ-021 и т.д.) в числовые артикулы для сортировки.
   * Сохраняет «линию» в lineCode (+ series для обратной совместимости), группирует по family + lineCode.
   */
  window.dpApplyNumericCodesToCatalogData = function dpApplyNumericCodesToCatalogData(arr) {
    if (!Array.isArray(arr) || arr.length < 1) return arr;
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const c0 = row.code != null ? String(row.code).trim() : "";
      if (row.lineCode == null && c0 !== "" && !/^\d+$/.test(c0)) {
        row.lineCode = c0;
      }
    }
    function keyFor(row) {
      const fam = String(row.family || "other").toLowerCase();
      const line = String(row.lineCode || "").trim();
      if (line) return `${fam}\t${line.toLowerCase()}`;
      const nm = String(row.name || "").trim();
      return `${fam}\t${nm.slice(0, 56).toLowerCase()}`;
    }
    const groups = new Map();
    for (const row of arr) {
      const k = keyFor(row);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row);
    }
    const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
    let blockIdx = 100;
    for (const k of keys) {
      const items = groups.get(k).slice().sort((a, b) => {
        const na = String(a.name || "");
        const nb = String(b.name || "");
        if (na !== nb) return na.localeCompare(nb, "ru", { numeric: true });
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
      const base = blockIdx * 1000;
      for (let i = 0; i < items.length; i += 1) {
        const row = items[i];
        row.code = String(base + i);
        const lc = String(row.lineCode || "").trim();
        if (lc) row.series = lc;
      }
      blockIdx += 1;
    }
    return arr;
  };
})();
