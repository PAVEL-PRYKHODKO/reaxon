const PORTAL_PAGE_SIZE = 4;
/** Смещение границы «страницы» в пагинации (след. страница начинается +10). */
const CATALOG_PAGE_SIZE = 10;
/** Список и плитка: сначала 6 карточек, затем +10 на каждое «Показать ещё». */
const CATALOG_INITIAL_VISIBLE = 6;
const CATALOG_LOAD_MORE_STEP = 10;
/** Fallback (кг), если скрипт pricing ещё не загружен. */
const CATALOG_FIXED_PACK_KG = [0.9, 19.7, 46.6];

function getProductPool() {
  return Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
}

/** То же что dpFormatArticleUi: для цифр — «Артикул: N». */
function ppArticleUi(raw) {
  if (typeof window.dpFormatArticleUi === "function") return window.dpFormatArticleUi(raw);
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return "—";
  if (/^\d+$/.test(s)) return `Артикул: ${s}`;
  return s;
}

const FAMILY_SELECT_OPTIONS = [
  { value: "all", label: "Все типы" },
  { value: "enamel", label: "Эмали" },
  { value: "primer", label: "Грунтовки" },
  { value: "lacquer", label: "Лаки" },
  { value: "paint", label: "Краски" },
  { value: "putty", label: "Шпатлёвки" },
  { value: "other", label: "Прочее" },
];

const PURPOSE_SELECT_OPTIONS = [
  { value: "all", label: "Все назначения" },
  { value: "metal", label: "Для металла" },
  { value: "wood", label: "Для дерева" },
  { value: "outdoor", label: "Наружные работы" },
  { value: "indoor", label: "Внутренние работы" },
  { value: "anti-corrosion", label: "Антикоррозионные" },
];

const CARD_IMAGES_BY_FAMILY = {
  enamel: [
    "https://images.unsplash.com/photo-1523419409543-4e2ccce93f95?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=1800&q=85",
  ],
  primer: [
    "https://images.unsplash.com/photo-1581093804475-577d72e2d6f8?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1581093588401-22fb3e5aee3a?auto=format&fit=crop&w=1800&q=85",
  ],
  lacquer: [
    "https://images.unsplash.com/photo-1584433144859-1fc3ab64a957?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1568620435895-d4521f0b2f44?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1800&q=85",
  ],
  paint: [
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1523419409543-4e2ccce93f95?auto=format&fit=crop&w=1800&q=85",
  ],
  putty: [
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1581092335878-2d9ff86ca2bf?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1800&q=85",
  ],
  other: [
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=1800&q=85",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1800&q=85",
  ],
};

function familyKey(rawFamily = "") {
  const f = String(rawFamily || "").toLowerCase();
  if (f.includes("enamel")) return "enamel";
  if (f.includes("primer")) return "primer";
  if (f.includes("lacquer")) return "lacquer";
  if (f.includes("paint")) return "paint";
  if (f.includes("putty")) return "putty";
  return "other";
}

function hashStr(input = "") {
  let h = 0;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function imageForProduct(product) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  const custom = ov.cardImageUrl || ov.heroImageUrl;
  if (custom) {
    const resolved = typeof window.dpResolveMediaUrl === "function" ? window.dpResolveMediaUrl(custom) : custom;
    if (resolved) return resolved;
  }
  const key = familyKey(product.family);
  const pool = CARD_IMAGES_BY_FAMILY[key] || CARD_IMAGES_BY_FAMILY.other;
  const codeSeed = `${product.code || ""}|${product.name || ""}|${product.id || ""}`;
  return pool[hashStr(codeSeed) % pool.length];
}

function catalogChipLikeFromChipObj(c) {
  if (!c) return null;
  if (c.kind === "jar" && c.jarKg != null) return { kind: "jar", jarKg: Number(c.jarKg) };
  const k = String(c.kind || c.packType || "").toLowerCase();
  if (k === "bucket" || k === "drum") {
    const pm = Number(c.packMassKg);
    if (Number.isFinite(pm) && pm > 0) return { kind: k, packMassKg: pm };
    return { kind: k };
  }
  return null;
}

function catalogChipLikeFromPackButton(btn) {
  const kind = btn.getAttribute("data-pack-kind");
  if (!kind) return null;
  if (kind === "jar") {
    const j = btn.getAttribute("data-jar-kg");
    const jarKg = j != null && j !== "" ? parseFloat(j) : NaN;
    return Number.isFinite(jarKg) ? { kind: "jar", jarKg } : null;
  }
  const m = btn.getAttribute("data-pack-mass-kg");
  const mass = m != null && m !== "" ? parseFloat(m) : NaN;
  if (Number.isFinite(mass) && mass > 0) return { kind, packMassKg: mass };
  return { kind };
}

function catalogProductImageResolved(product, chipLike) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  const u =
    chipLike && typeof window.dpCatalogPackImageUrlOrNull === "function"
      ? window.dpCatalogPackImageUrlOrNull(ov, chipLike)
      : null;
  if (u) return u;
  return imageForProduct(product);
}

function catalogUpdateRowPackImage(row) {
  const id = row.getAttribute("data-product-id");
  if (!id) return;
  const product = getProductPool().find((p) => String(p.id) === id);
  if (!product) return;
  const sel = row.querySelector(".catalog-pack-chip.is-selected");
  let chipLike = null;
  if (sel && !sel.disabled) chipLike = catalogChipLikeFromPackButton(sel);
  const imgUrl = catalogProductImageResolved(product, chipLike);
  const listMedia = row.querySelector(".catalog-row-media");
  if (listMedia) listMedia.style.backgroundImage = imgUrl ? `url(${JSON.stringify(imgUrl)})` : "none";
  const gridImg = row.querySelector(".catalog-card-grid-media img");
  if (gridImg) gridImg.src = imgUrl || "";
}

function ppEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function matchPurpose(product, purpose) {
  if (purpose === "all") return true;
  const text = `${product.name || ""} ${product.code || ""}`.toLowerCase();
  if (purpose === "metal") return /металл|антикор|корроз|гф-|хв-|хс-|эп-|мс-/.test(text);
  if (purpose === "wood") return /дерев|лак|пф-/.test(text);
  if (purpose === "outdoor") return /фасад|атмосфер|пф-|хв-|хс-/.test(text);
  if (purpose === "indoor") return /интер|вд|нц-|пф-223|пф-266/.test(text);
  if (purpose === "anti-corrosion") return /грунт|антикор|гф-|эп-|хс-/.test(text);
  return true;
}

/** Дополнительные пункты фильтра «Назначение» (кроме Интерьер / Фасад / Промышленное). */
function matchCatalogExtendedPurpose(product, mode) {
  const text = `${product.name || ""} ${product.code || ""}`.toLowerCase();
  const fam = String(product.family || "").toLowerCase();
  if (mode === "wd-dispersion") {
    return (
      /\bвдак\b|\bвдкч\b|водно[\s\-–]*дисперс|воднодисперс|латекс|latex|акрилат/i.test(text) ||
      ((fam.includes("paint") || fam.includes("enamel")) &&
        /\bвдак\b|\bвдкч\b|водно[\s\-–]*дисперс| акрилат/i.test(text))
    );
  }
  if (mode === "wood-protection") {
    return /древес|для\s+дер|дерев(?!ян)|антисепт|пропит|олиф|оксоль|лак[^\n]{0,30}дер/i.test(text);
  }
  if (mode === "fire-retardant") {
    return /огнезащит|огнеупор|огнебио|огнестой|антопирен| огн.?стой/i.test(text);
  }
  if (mode === "surface-prep") {
    const fk = familyKey(product);
    if (fk === "primer" || fk === "putty") return true;
    return /преобразователь\s+ржав|накат\b|выравнивающ|шпатл|шпакл/i.test(text);
  }
  if (mode === "disinfectant") {
    return /дезинфици|микробицид|санитарн.*(?:сред|обработ)|бактерицид|фунгицид.*дез/i.test(text);
  }
  if (mode === "solvents") {
    return /растворит|р[-\u2013\u2014]тель|р\.\s*тель|ксилол|уайт|ацетон|смывк|обезжир|сольвент|углеводород/i.test(
      text
    );
  }
  return false;
}

function matchCatalogPurposeModes(product, modes) {
  if (!modes || modes.size === 0) return true;
  for (const m of modes) {
    if (m === "interior") {
      if (matchPurpose(product, "indoor") || matchPurpose(product, "wood")) return true;
    } else if (m === "facade") {
      if (matchPurpose(product, "outdoor")) return true;
    } else if (m === "industrial") {
      if (matchPurpose(product, "metal") || matchPurpose(product, "anti-corrosion")) return true;
    } else if (matchCatalogExtendedPurpose(product, m)) return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.dpMatchCatalogExtendedPurpose = matchCatalogExtendedPurpose;
}

function pluralTovarov(n) {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return "товаров";
  if (y > 1 && y < 5) return "товара";
  if (y === 1) return "товар";
  return "товаров";
}

/** Элементы панели: номер страницы или разрыв «…». */
function catalogPaginationItems(totalPages, currentPage) {
  const tp = Math.max(1, totalPages);
  const cur = Math.min(Math.max(1, currentPage), tp);
  if (tp <= 9) {
    return Array.from({ length: tp }, (_, i) => ({ type: "page", n: i + 1 }));
  }
  const out = [];
  const addPage = (n) => {
    if (!out.some((x) => x.type === "page" && x.n === n)) out.push({ type: "page", n });
  };
  const addGap = () => {
    if (out.length && out[out.length - 1].type === "gap") return;
    out.push({ type: "gap" });
  };
  addPage(1);
  if (cur <= 4) {
    for (let p = 2; p <= Math.min(5, tp - 1); p += 1) addPage(p);
    if (tp > 6) addGap();
    addPage(tp);
  } else if (cur >= tp - 3) {
    addGap();
    for (let p = Math.max(2, tp - 4); p <= tp - 1; p += 1) addPage(p);
    addPage(tp);
  } else {
    addGap();
    for (let p = cur - 1; p <= cur + 1; p += 1) addPage(p);
    addGap();
    addPage(tp);
  }
  return out;
}

function buildCatalogPaginationHtml(totalPages, currentPage) {
  if (totalPages <= 1) return "";
  const cur = Math.min(Math.max(1, currentPage), totalPages);
  const items = catalogPaginationItems(totalPages, cur);
  const parts = [
    `<button type="button" class="catalog-page-nav catalog-page-prev" data-catalog-nav="prev" aria-label="Предыдущая страница"${
      cur <= 1 ? " disabled" : ""
    }>‹</button>`,
  ];
  for (const it of items) {
    if (it.type === "gap") {
      parts.push(`<span class="catalog-page-ellipsis" aria-hidden="true">…</span>`);
    } else {
      const active = it.n === cur ? " is-active" : "";
      parts.push(
        `<button type="button" class="catalog-page-btn${active}" data-catalog-page="${it.n}" aria-label="Страница ${it.n}"${
          it.n === cur ? ' aria-current="page"' : ""
        }>${it.n}</button>`
      );
    }
  }
  parts.push(
    `<button type="button" class="catalog-page-nav catalog-page-next" data-catalog-nav="next" aria-label="Следующая страница"${
      cur >= totalPages ? " disabled" : ""
    }>›</button>`
  );
  return parts.join("");
}

function collectPurposeModes(root) {
  const set = new Set();
  if (!root) return set;
  root.querySelectorAll("input[name=\"catalog-purpose\"]:checked").forEach((el) => {
    if (el.value) set.add(el.value);
  });
  return set;
}

function catalogChipSortKg(c, product) {
  if (!c) return 0;
  const pm = Number(c.packMassKg);
  if (Number.isFinite(pm) && pm > 0) return pm;
  if (c.kind === "jar") return Number(c.jarKg) || 0;
  if (c.kind === "bucket") return Number(product.bucketKg) || 0;
  if (c.kind === "drum") return Number(product.drumKg) || 0;
  return 0;
}

function catalogFormatFixedPackLabel(kg) {
  const n = Number(kg);
  if (n === 0.9) return "0,9 кг";
  if (n === 19.7) return "19,7 кг";
  if (n === 46.6) return "46,6 кг";
  return `${String(kg).replace(".", ",")} кг`;
}

/** Ссылка на форму на странице контактов (запрос к производителю по фасовке). */
function catalogFasovkaContactHref(product) {
  const id = String(product && product.id != null ? product.id : "");
  const code = String(product && product.code != null ? product.code : "");
  const name = String(product && product.name != null ? product.name : "");
  const q = new URLSearchParams();
  q.set("from", "catalog");
  if (id) q.set("productId", id);
  if (code) q.set("code", code);
  if (name) q.set("product", name.slice(0, 200));
  const qs = q.toString();
  return qs ? `contact.html?${qs}#lead-form` : "contact.html#lead-form";
}

function catalogFasovkaPlaceholderLink(product) {
  const href = ppEscape(catalogFasovkaContactHref(product));
  return `<a class="catalog-placeholder catalog-placeholder--link" href="${href}">Уточняйте фасовку</a>`;
}

function catalogBuildPackChips(product) {
  if (!product) return [];
  const hasRetail = Number(product.priceNdsPerKg) > 0;
  if (!hasRetail) {
    return [];
  }
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  if (typeof window.dpApplyDetailPackChips === "function") {
    const chips = window.dpApplyDetailPackChips(product, ov);
    return Array.isArray(chips) ? chips : [];
  }
  if (typeof window.dpBuildPackChipsRaw === "function") {
    const chips = window.dpBuildPackChipsRaw(product);
    return Array.isArray(chips) ? chips : [];
  }
  const mode = "retail";
  const chips = [];
  for (const w of CATALOG_FIXED_PACK_KG) {
    const total = typeof calcJarTotal === "function" ? calcJarTotal(product, w, mode) : null;
    chips.push({
      kind: "jar",
      packType: "jar",
      jarKg: w,
      label: catalogFormatFixedPackLabel(w),
      sub: "фасовка",
      price: total,
      disabled: total == null,
    });
  }
  chips.sort((a, b) => catalogChipSortKg(a, product) - catalogChipSortKg(b, product));
  return chips;
}

function catalogMinPackPrice(product) {
  const chips = catalogBuildPackChips(product);
  const prices = chips.map((c) => c.price).filter((n) => n != null && isFinite(Number(n)) && Number(n) > 0);
  if (!prices.length) return null;
  return Math.min(...prices);
}

function catalogFormatMoney(n) {
  if (n == null || !isFinite(Number(n))) return "—";
  if (typeof window.formatMoney === "function") return window.formatMoney(Number(n));
  return `${Math.round(Number(n))} грн`;
}

function catalogStockBadge(product) {
  const chips = catalogBuildPackChips(product);
  const r = retailNum(product);
  const hasBuyable = chips.some((c) => !c.disabled);
  if (hasBuyable) {
    return { cls: "catalog-badge catalog-badge--stock", text: "В наличии" };
  }
  if (chips.length && !hasBuyable) {
    return { cls: "catalog-badge catalog-badge--order", text: "Под заказ" };
  }
  if (r != null && r > 0) {
    return { cls: "catalog-badge catalog-badge--stock", text: "В наличии" };
  }
  return { cls: "catalog-badge catalog-badge--order", text: "Под заказ" };
}

function updateCatalogRowPrice(row) {
  const sel = row.querySelector(".catalog-pack-chip.is-selected");
  const inp = row.querySelector(".catalog-qty-input");
  const priceEl = row.querySelector(".catalog-row-price");
  if (!priceEl) return;
  const qty = Math.max(1, Math.min(99, parseInt(inp?.value, 10) || 1));
  if (!sel || sel.disabled || sel.getAttribute("disabled") != null) {
    priceEl.textContent = "—";
    return;
  }
  const unit = parseFloat(sel.getAttribute("data-pack-price"));
  if (!Number.isFinite(unit)) {
    priceEl.textContent = "—";
    return;
  }
  priceEl.textContent = catalogFormatMoney(unit * qty);
}

function catalogSelectedPack(row) {
  const inp = row.querySelector(".catalog-qty-input");
  const qty = Math.max(1, Math.min(99, parseInt(inp?.value, 10) || 1));
  const sel = row.querySelector(".catalog-pack-chip.is-selected");
  if (!sel || sel.disabled || sel.getAttribute("disabled") != null) return null;
  const kind = sel.getAttribute("data-pack-kind");
  const jarKg = sel.getAttribute("data-jar-kg");
  return { kind, jarKg, qty };
}

function catalogSelectedPackExists(productId, pack) {
  if (!pack || typeof window.dpGetCartItems !== "function") return false;
  const mode =
    typeof window.dpCheckoutGetCart === "function"
      ? window.dpCheckoutGetCart().customerType || "retail"
      : "retail";
  const cart = window.dpGetCartItems();
  if (!Array.isArray(cart)) return false;
  if (pack.kind === "jar") {
    const weight = Number(pack.jarKg);
    return cart.some(
      (item) =>
        item.productId === productId &&
        item.packType === "jar" &&
        item.mode === mode &&
        Number(item.customKg) === weight
    );
  }
  return cart.some((item) => item.productId === productId && item.packType === pack.kind && item.mode === mode);
}

function addSelectedCatalogPackToCart(row, productId, { skipExisting = false } = {}) {
  const pack = catalogSelectedPack(row);
  if (!pack) return false;
  if (skipExisting && catalogSelectedPackExists(productId, pack)) return true;
  if (pack.kind === "jar" && pack.jarKg) {
    if (typeof addJarToCartWithQuantity !== "function") return false;
    addJarToCartWithQuantity(productId, parseFloat(pack.jarKg), pack.qty);
    return true;
  }
  if (pack.kind === "bucket" || pack.kind === "drum") {
    if (typeof addToCartWithQuantity !== "function") return false;
    addToCartWithQuantity(productId, pack.kind, pack.qty);
    return true;
  }
  return false;
}

function bindCatalogCatalogDelegation(cfg) {
  if (!cfg.catalogLayout || cfg.grid.dataset.dpCatalogDel === "1") return;
  cfg.grid.dataset.dpCatalogDel = "1";
  cfg.grid.addEventListener("click", (e) => {
    const packChip = e.target.closest(".catalog-pack-chip");
    if (packChip && cfg.grid.contains(packChip)) {
      if (packChip.disabled) return;
      const row = packChip.closest(".catalog-row, .catalog-card-grid");
      if (!row) return;
      row.querySelectorAll(".catalog-pack-chip").forEach((x) => x.classList.remove("is-selected"));
      packChip.classList.add("is-selected");
      const qtyInput = row.querySelector(".catalog-qty-input");
      if (qtyInput instanceof HTMLInputElement) {
        qtyInput.value = "1";
      }
      updateCatalogRowPrice(row);
      catalogUpdateRowPackImage(row);
      return;
    }
    const dec = e.target.closest(".catalog-qty-minus");
    const inc = e.target.closest(".catalog-qty-plus");
    const addBtn = e.target.closest(".catalog-add-cart");
    const payBtn = e.target.closest(".catalog-pay-now");
    const row = e.target.closest(".catalog-row, .catalog-card-grid");
    if (!row || !cfg.grid.contains(row)) return;
    const id = row.getAttribute("data-product-id");
    if (!id) return;
    if (dec || inc) {
      const inp = row.querySelector(".catalog-qty-input");
      if (!inp) return;
      let n = parseInt(inp.value, 10) || 1;
      n = inc ? Math.min(99, n + 1) : Math.max(1, n - 1);
      inp.value = String(n);
      updateCatalogRowPrice(row);
      return;
    }
    if (addBtn || payBtn) {
      const added = addSelectedCatalogPackToCart(row, id, { skipExisting: Boolean(payBtn) });
      if (added && payBtn) window.location.href = "checkout.html";
    }
  });

  cfg.grid.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.classList.contains("catalog-qty-input")) return;
    const row = t.closest(".catalog-row, .catalog-card-grid");
    if (!row || !cfg.grid.contains(row)) return;
    updateCatalogRowPrice(row);
  });
}

function catalogChipsBlockHtml(p) {
  const chips = catalogBuildPackChips(p);
  let firstEnabled = -1;
  for (let i = 0; i < chips.length; i += 1) {
    if (!chips[i].disabled) {
      firstEnabled = i;
      break;
    }
  }
  const chipsHtml =
    chips.length > 0
      ? chips
          .map((c, i) => {
            const mass =
              c.packMassKg != null && Number.isFinite(Number(c.packMassKg)) && Number(c.packMassKg) > 0
                ? String(c.packMassKg)
                : "";
            const pk =
              c.kind === "jar"
                ? `data-pack-kind="jar" data-jar-kg="${c.jarKg}" data-pack-price="${c.price ?? ""}"`
                : `data-pack-kind="${c.packType}" data-jar-kg=""${
                    mass ? ` data-pack-mass-kg="${mass}"` : ""
                  } data-pack-price="${c.price ?? ""}"`;
            const isSel = firstEnabled >= 0 && i === firstEnabled ? " is-selected" : "";
            const dis = c.disabled ? " disabled" : "";
            return `<button type="button" class="catalog-pack-chip${isSel}" ${pk}${dis}>${ppEscape(
              c.label
            )}</button>`;
          })
          .join("")
      : catalogFasovkaPlaceholderLink(p);
  const selChip = firstEnabled >= 0 ? chips[firstEnabled] : null;
  const priceLabel =
    selChip && selChip.price != null ? catalogFormatMoney(selChip.price) : "—";
  const addDisabled = firstEnabled < 0 ? " disabled" : "";
  return { chipsHtml, priceLabel, addDisabled, initialPackLike: catalogChipLikeFromChipObj(selChip) };
}

function renderCatalogListRow(p, itemExtraClass = "") {
  const features = productFeatures(p);
  const cardTitle = productCardTitle(p);
  const badge = catalogStockBadge(p);
  const { chipsHtml, priceLabel, addDisabled, initialPackLike } = catalogChipsBlockHtml(p);
  const img = catalogProductImageResolved(p, initialPackLike);

  return `
  <article class="catalog-row${itemExtraClass}" data-product-id="${ppEscape(String(p.id))}">
    <a class="catalog-row-media-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="Открыть ${ppEscape(cardTitle)}">
      <div class="catalog-row-media" style="background-image:url('${img}');"></div>
    </a>
    <div class="catalog-row-body">
      <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${ppEscape(cardTitle)}</a></h3>
      <p class="catalog-row-code">${ppEscape(ppArticleUi(p.code ?? ""))}</p>
      <span class="${badge.cls}">${ppEscape(badge.text)}</span>
      <ul class="catalog-row-features">
        ${features.map((f) => `<li>${ppEscape(f)}</li>`).join("")}
      </ul>
    </div>
    <div class="catalog-row-aside">
      <div class="catalog-pack-chips">${chipsHtml}</div>
      <div class="catalog-qty-row">
        <button type="button" class="catalog-qty-btn catalog-qty-minus" aria-label="Меньше">−</button>
        <input class="catalog-qty-input" type="number" min="1" max="99" value="1" aria-label="Количество" />
        <button type="button" class="catalog-qty-btn catalog-qty-plus" aria-label="Больше">+</button>
      </div>
      <p class="catalog-row-price">${priceLabel}</p>
      <div class="catalog-card-actions">
        <button type="button" class="catalog-add-cart"${addDisabled}>В корзину</button>
        <button type="button" class="catalog-pay-now"${addDisabled}>Оплатить</button>
      </div>
    </div>
  </article>`;
}

function renderCatalogGridCard(p, itemExtraClass = "") {
  const features = productFeatures(p);
  const cardTitle = productCardTitle(p);
  const badge = catalogStockBadge(p);
  const { chipsHtml, priceLabel, addDisabled, initialPackLike } = catalogChipsBlockHtml(p);
  const img = catalogProductImageResolved(p, initialPackLike);

  return `
  <article class="catalog-card-grid${itemExtraClass}" data-product-id="${ppEscape(String(p.id))}">
    <a href="product.html?id=${encodeURIComponent(p.id)}" class="catalog-card-grid-media">
      <img src="${ppEscape(img)}" alt="${ppEscape(cardTitle)}" loading="lazy" decoding="async" />
      <span class="products-media-code">${ppEscape(ppArticleUi(p.code ?? ""))}</span>
    </a>
    <div class="catalog-card-grid-body">
      <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${ppEscape(cardTitle)}</a></h3>
      <span class="${badge.cls}">${ppEscape(badge.text)}</span>
      <ul>${features.map((f) => `<li>${ppEscape(f)}</li>`).join("")}</ul>
    </div>
    <div class="catalog-card-grid-footer">
      <div class="catalog-pack-chips" style="max-width:none;justify-content:flex-start">${chipsHtml}</div>
      <div class="catalog-qty-row">
        <button type="button" class="catalog-qty-btn catalog-qty-minus" aria-label="Меньше">−</button>
        <input class="catalog-qty-input" type="number" min="1" max="99" value="1" aria-label="Количество" />
        <button type="button" class="catalog-qty-btn catalog-qty-plus" aria-label="Больше">+</button>
      </div>
      <p class="catalog-row-price" style="margin:0">${priceLabel}</p>
      <div class="catalog-card-actions catalog-card-actions--grid">
        <button type="button" class="catalog-add-cart"${addDisabled}>В корзину</button>
        <button type="button" class="catalog-pay-now"${addDisabled}>Оплатить</button>
      </div>
    </div>
  </article>`;
}

function productCardTitle(product) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  const t = typeof ov.cardTitle === "string" ? ov.cardTitle.trim() : "";
  if (t) return t;
  return String(product.name || product.code || "Позиция");
}

function productFeatures(product) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  if (Array.isArray(ov.cardFeatures) && ov.cardFeatures.length) {
    return ov.cardFeatures.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  }
  const family = String(product.family || "");
  if (family.includes("primer")) return ["Улучшает адгезию", "Подготовка основания", "Снижает риск коррозии"];
  if (family.includes("enamel")) return ["Защитно-декоративное покрытие", "Стойкие цвета", "Для металла и дерева"];
  if (family.includes("lacquer")) return ["Финишная защита поверхности", "Устойчивость к износу", "Удобное нанесение"];
  if (family.includes("paint")) return ["Равномерное покрытие", "Удобство нанесения", "Подходит для разных оснований"];
  if (family.includes("putty")) return ["Выравнивание поверхности", "Подготовка под финиш", "Стабильная структура"];
  return ["Промышленная серия", "Поставки для B2B и розницы", "Подбор под задачу"];
}

function formatPriceCell(n) {
  if (n == null || !isFinite(Number(n)) || Number(n) <= 0) return "—";
  return Number(n).toFixed(2);
}

function codeStr(p) {
  return String(p.code || "").trim();
}

/** Группа «серии» прайса: человекочитаемый код линии (ГФ-021), без числового артикула. */
function seriesGroupKey(p) {
  const lc = String(p.lineCode || "").trim();
  if (lc) return lc;
  const s = String(p.series || "").trim();
  if (s && !/^\d+$/.test(s)) return s;
  return String(p.code || "").trim();
}

function nameStr(p) {
  return String(p.name || "").trim();
}

/** Сортировка по числовому артикулу, если код полностью цифровой. */
function compareArticleCodeAsc(a, b) {
  const sa = codeStr(a);
  const sb = codeStr(b);
  const na = /^\d+$/.test(sa) ? Number(sa) : NaN;
  const nb = /^\d+$/.test(sb) ? Number(sb) : NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb) && Number.isFinite(na) && Number.isFinite(nb)) {
    const d = na - nb;
    if (d !== 0) return d;
  }
  return sa.localeCompare(sb, "ru", { numeric: true }) || nameStr(a).localeCompare(nameStr(b), "ru");
}

function retailNum(p) {
  const v = p.priceNdsPerKg;
  return v != null && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
}

function sortProductList(items, sortKey) {
  const copy = [...items];
  const byCodeAsc = (a, b) => compareArticleCodeAsc(a, b);
  switch (sortKey) {
    case "code-desc":
      return copy.sort((a, b) => compareArticleCodeAsc(b, a) || nameStr(a).localeCompare(nameStr(b), "ru"));
    case "name-asc":
      return copy.sort((a, b) => nameStr(a).localeCompare(nameStr(b), "ru") || byCodeAsc(a, b));
    case "retail-asc":
      return copy.sort((a, b) => {
        const ra = retailNum(a);
        const rb = retailNum(b);
        if (ra == null && rb == null) return byCodeAsc(a, b);
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb || byCodeAsc(a, b);
      });
    case "retail-desc":
      return copy.sort((a, b) => {
        const ra = retailNum(a);
        const rb = retailNum(b);
        if (ra == null && rb == null) return byCodeAsc(a, b);
        if (ra == null) return 1;
        if (rb == null) return -1;
        return rb - ra || byCodeAsc(a, b);
      });
    case "code-asc":
    default:
      return copy.sort(byCodeAsc);
  }
}

function fillSelect(selectEl, options) {
  if (!selectEl) return;
  selectEl.innerHTML = options.map((o) => `<option value="${ppEscape(o.value)}">${ppEscape(o.label)}</option>`).join("");
}

function productsForByCodeSelect(family, cfg, state) {
  const pool = getProductPool();
  return pool.filter((p) => {
    const familyOk = family === "all" || familyKey(p.family) === family;
    const purposeOk = cfg.catalogLayout
      ? matchCatalogPurposeModes(p, collectPurposeModes(cfg.root))
      : matchPurpose(p, state.purpose);
    return familyOk && purposeOk;
  });
}

/** Текстовый поиск из шапки (?q=) — те же поля, что в прайсе. */
function catalogTextHaystack(p) {
  return `${p.id || ""} ${String(p.code || "").trim()} ${String(p.name || "").trim()} ${String(p.family || "").trim()}`.toLowerCase();
}

/** Поиск по названию в боковой панели каталога: заголовок карточки + полное имя. */
function catalogProductNameHaystack(p) {
  const norm =
    typeof window.dpNormalizeCatalogSearchText === "function"
      ? window.dpNormalizeCatalogSearchText
      : (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return norm(`${productCardTitle(p)} ${nameStr(p)}`);
}

function catalogProductMatchesNameQuery(p, rawQuery) {
  const raw = String(rawQuery || "").trim();
  if (!raw) return true;
  const norm =
    typeof window.dpNormalizeCatalogSearchText === "function"
      ? window.dpNormalizeCatalogSearchText
      : (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const qn = norm(raw);
  const hn = catalogProductNameHaystack(p);
  if (hn.includes(qn)) return true;
  const tokens = qn.split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return hn.includes(qn);
  return tokens.every((t) => hn.includes(t));
}

/** Группы по артикулу/серии из прайса, внутри — полные наименования по алфавиту. */
function fillByCodeSelect(selectEl, items) {
  if (!selectEl) return;
  const map = new Map();
  for (const p of items) {
    const key = seriesGroupKey(p) || codeStr(p) || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const codes = [...map.keys()].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, "ru", { numeric: true });
  });
  const parts = [`<option value="all">${ppEscape("Все позиции выборки")}</option>`];
  for (const codeKey of codes) {
    const group = map.get(codeKey);
    group.sort((a, b) => nameStr(a).localeCompare(nameStr(b), "ru"));
    const gLabel = codeKey || "Без артикула в прайсе";
    parts.push(`<optgroup label="${ppEscape(gLabel)}">`);
    for (const p of group) {
      parts.push(`<option value="${ppEscape(String(p.id))}">${ppEscape(nameStr(p))}</option>`);
    }
    parts.push("</optgroup>");
  }
  selectEl.innerHTML = parts.join("");
}

/** Уникальные серии/линии в выборке (для любой группы: эмали, грунтовки…). */
function fillSeriesCodeSelect(selectEl, items) {
  if (!selectEl) return;
  const codes = [...new Set(items.map(seriesGroupKey).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru", { numeric: true })
  );
  fillSelect(selectEl, [
    { value: "all", label: "Все артикулы в группе" },
    ...codes.map((c) => ({ value: c, label: c })),
  ]);
}

/** Вторая ступень: все позиции с группировкой по артикулу или только выбранная серия. */
function fillSeriesProductSelect(selectEl, items, seriesCode) {
  if (!selectEl) return;
  if (seriesCode === "all") {
    fillByCodeSelect(selectEl, items);
    return;
  }
  const list = [...items].filter((p) => seriesGroupKey(p) === seriesCode);
  list.sort((a, b) => nameStr(a).localeCompare(nameStr(b), "ru"));
  selectEl.innerHTML = [
    `<option value="all">${ppEscape("Все наименования этой серии")}</option>`,
    ...list.map((p) => `<option value="${ppEscape(String(p.id))}">${ppEscape(nameStr(p))}</option>`),
  ].join("");
}

function shownLimit(state, cfg) {
  let n = Number(state.shown);
  if (!Number.isFinite(n) || n < 1) n = cfg.initialShown;
  return n;
}

function parsePortalRoot(root) {
  const kind = root.dataset.productsPortal || "page";
  const isHome = kind === "home";
  if (isHome) {
    return {
      root,
      isHome,
      selFamily: document.getElementById("hp-select-family"),
      selPurpose: document.getElementById("hp-select-purpose"),
      selSort: document.getElementById("hp-select-sort"),
      selByCode: document.getElementById("hp-select-bycode"),
      seriesBlock: document.getElementById("hp-family-series-block"),
      selSeriesCode: document.getElementById("hp-select-series-code"),
      selSeriesProduct: document.getElementById("hp-select-series-product"),
      grid: document.getElementById("home-popular-products-grid"),
      loadMore: document.getElementById("home-products-load-more"),
      priceLoadMore: document.getElementById("hp-price-load-more"),
      priceTbody: document.getElementById("hp-price-tbody"),
      tabCatalog: document.getElementById("hp-tab-catalog"),
      tabPrice: document.getElementById("hp-tab-price"),
      panelCatalog: document.getElementById("hp-panel-catalog"),
      panelPrice: document.getElementById("hp-panel-price"),
      tabCatalogData: "hp-tab",
      initialShown: PORTAL_PAGE_SIZE,
      loadStep: PORTAL_PAGE_SIZE,
      catalogLayout: false,
    };
  }
  const catalogLayout = root.dataset.catalogLayout === "1";
  return {
    root,
    isHome: false,
    catalogLayout,
    selFamily: document.getElementById("pp-select-family"),
    selPurpose: document.getElementById("pp-select-purpose"),
    selSort: document.getElementById("pp-select-sort"),
    selByCode: catalogLayout ? null : document.getElementById("hp-select-bycode"),
    catalogPriceCodeInput: catalogLayout ? document.getElementById("catalog-price-code-input") : null,
    seriesBlock: document.getElementById("pp-family-series-block"),
    selSeriesCode: document.getElementById("pp-select-series-code"),
    selSeriesProduct: document.getElementById("pp-select-series-product"),
    grid: document.getElementById("popular-products-grid"),
    loadMore: document.getElementById("products-load-more"),
    priceLoadMore: document.getElementById("pp-price-load-more"),
    priceTbody: document.getElementById("pp-price-tbody"),
    tabCatalog: document.getElementById("pp-tab-catalog"),
    tabPrice: document.getElementById("pp-tab-price"),
    panelCatalog: document.getElementById("pp-panel-catalog"),
    panelPrice: document.getElementById("pp-panel-price"),
    tabCatalogData: "pp-tab",
    initialShown: catalogLayout ? CATALOG_INITIAL_VISIBLE : PORTAL_PAGE_SIZE,
    loadStep: catalogLayout ? CATALOG_LOAD_MORE_STEP : PORTAL_PAGE_SIZE,
    countLeft: document.getElementById("catalog-count-left"),
    countRight: document.getElementById("catalog-count-right"),
    catalogShownSub: document.getElementById("catalog-shown-sub"),
    paginationSidebar: document.getElementById("catalog-pagination-sidebar"),
    paginationBottom: document.getElementById("catalog-pagination-bottom"),
    resetFiltersBtn: document.getElementById("catalog-filters-reset"),
    viewListBtn: document.getElementById("catalog-view-list"),
    viewGridBtn: document.getElementById("catalog-view-grid"),
    loadMoreSidebar: document.getElementById("catalog-load-more-sidebar"),
    loadMoreBottom: document.getElementById("catalog-load-more-bottom"),
    catalogNameSearchInput: catalogLayout ? document.getElementById("catalog-name-search") : null,
    aiSearchInput: catalogLayout ? document.getElementById("catalog-ai-search-input") : null,
    aiSearchRunBtn: catalogLayout ? document.getElementById("catalog-ai-search-run") : null,
    aiSearchResetBtn: catalogLayout ? document.getElementById("catalog-ai-search-reset") : null,
    aiSearchStatus: catalogLayout ? document.getElementById("catalog-ai-search-status") : null,
  };
}

function initPortal(root) {
  if (root.dataset.dpPortalInit === "1") return;
  root.dataset.dpPortalInit = "1";

  const cfg = parsePortalRoot(root);
  if (!cfg.grid || !cfg.selFamily || !cfg.selSort) return;
  if (cfg.isHome && !cfg.selPurpose) return;

  const state = {
    family: "all",
    purpose: "all",
    sort: "code-asc",
    seriesCode: "all",
    positionId: "all",
    headerSearch: "",
    catalogNameSearch: "",
    catalogPriceCode: "",
    shown: cfg.initialShown,
    tab: "catalog",
    catalogPage: 1,
    catalogMoreBatches: 0,
    viewMode: "list",
    aiQuery: "",
    aiProvider: "",
    aiProductIds: null,
  };

  function aiApiUrls() {
    if (window.location.protocol !== "file:") return ["/api/ai/catalog-search"];
    return ["http://localhost:3000/api/ai/catalog-search", "http://localhost:3001/api/ai/catalog-search"];
  }

  async function postAiSearch(payload) {
    let lastErr = null;
    let lastResp = null;
    let lastData = null;
    for (const url of aiApiUrls()) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        lastResp = resp;
        lastData = data;
        if (resp.ok) return { resp, data };
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastResp) return { resp: lastResp, data: lastData || {} };
    throw lastErr || new Error("ai_search_network_error");
  }

  let catalogGridViewportExpanded = false;
  /** Одноразово: после первого рендера прокрутить и подсветить карточку из ?id= */
  let catalogDeepLinkProductId = null;

  if (!cfg.isHome) {
    const params = new URLSearchParams(location.search);
    const urlId = params.get("id");
    const urlQ = params.get("q");

    if (urlId && urlId.trim() && cfg.catalogLayout) {
      const idStr = urlId.trim();
      const pool = getProductPool();
      const exists = pool.some((p) => String(p.id) === idStr);
      if (exists) {
        catalogDeepLinkProductId = idStr;
        state.positionId = idStr;
        state.family = "all";
        state.purpose = "all";
        state.seriesCode = "all";
        state.headerSearch = "";
        state.catalogNameSearch = "";
        state.catalogPriceCode = "";
        const codeInpEarly = document.getElementById("catalog-price-code-input");
        if (codeInpEarly) codeInpEarly.value = "";
        cfg.root.querySelectorAll('input[name="catalog-purpose"]').forEach((el) => {
          el.checked = false;
        });
      }
    } else if (urlQ && urlQ.trim()) {
      state.headerSearch = urlQ.trim();
      state.family = "all";
      state.purpose = "all";
      state.seriesCode = "all";
      state.positionId = "all";
      if (cfg.catalogLayout) {
        cfg.root.querySelectorAll('input[name="catalog-purpose"]').forEach((el) => {
          el.checked = false;
        });
      }
    }
  }

  fillSelect(cfg.selFamily, FAMILY_SELECT_OPTIONS);
  if (cfg.selPurpose) fillSelect(cfg.selPurpose, PURPOSE_SELECT_OPTIONS);

  function syncByCodeSelect() {
    if (!cfg.selByCode) return;
    fillByCodeSelect(cfg.selByCode, productsForByCodeSelect(state.family, cfg, state));
    const vals = new Set([...cfg.selByCode.options].map((o) => o.value));
    if (!vals.has(state.positionId)) state.positionId = "all";
    cfg.selByCode.value = state.positionId;
  }

  function syncFamilySeriesPickers() {
    const scope = productsForByCodeSelect(state.family, cfg, state);
    const allFamilies = state.family === "all";
    if (cfg.seriesBlock) cfg.seriesBlock.hidden = allFamilies;
    const codeRow =
      cfg.catalogPriceCodeInput?.closest(".products-filter-field") || cfg.selByCode?.closest(".products-filter-field");
    if (codeRow) codeRow.hidden = !allFamilies;

    if (allFamilies) {
      syncByCodeSelect();
      return;
    }

    if (!cfg.selSeriesCode || !cfg.selSeriesProduct) return;

    fillSeriesCodeSelect(cfg.selSeriesCode, scope);
    if (![...cfg.selSeriesCode.options].some((o) => o.value === state.seriesCode)) state.seriesCode = "all";
    cfg.selSeriesCode.value = state.seriesCode;

    fillSeriesProductSelect(cfg.selSeriesProduct, scope, state.seriesCode);
    const nameVals = new Set([...cfg.selSeriesProduct.options].map((o) => o.value));
    if (!nameVals.has(state.positionId)) state.positionId = "all";
    cfg.selSeriesProduct.value = state.positionId;
  }

  function filteredProducts() {
    const pool = getProductPool();
    let list = pool.filter((p) => {
      const familyOk = state.family === "all" || familyKey(p.family) === state.family;
      const purposeOk = cfg.catalogLayout
        ? matchCatalogPurposeModes(p, collectPurposeModes(cfg.root))
        : matchPurpose(p, state.purpose);
      return familyOk && purposeOk;
    });

    if (state.family !== "all" && state.seriesCode !== "all") {
      list = list.filter((p) => seriesGroupKey(p) === state.seriesCode);
    }

    if (state.positionId !== "all") {
      list = list.filter((p) => String(p.id) === String(state.positionId));
    }

    if (
      cfg.catalogLayout &&
      state.family === "all" &&
      state.catalogPriceCode &&
      state.catalogPriceCode.trim()
    ) {
      const q = state.catalogPriceCode.trim().toLowerCase().replace(/\s+/g, "");
      list = list.filter((p) => codeStr(p).toLowerCase().replace(/\s+/g, "").includes(q));
    }

    if (state.headerSearch && state.headerSearch.trim()) {
      const raw = state.headerSearch.trim();
      list = list.filter((p) =>
        typeof window.dpCatalogRowMatchesQuery === "function"
          ? window.dpCatalogRowMatchesQuery(p, raw)
          : catalogTextHaystack(p).includes(raw.toLowerCase())
      );
    }

    if (cfg.catalogLayout && state.catalogNameSearch && state.catalogNameSearch.trim()) {
      const raw = state.catalogNameSearch.trim();
      list = list.filter((p) => catalogProductMatchesNameQuery(p, raw));
    }

    if (cfg.catalogLayout && state.aiProductIds && state.aiProductIds.size > 0) {
      list = list.filter((p) => state.aiProductIds.has(String(p.id)));
    }

    return list;
  }

  function updateSearchBanner(filteredCount) {
    const wrap = document.getElementById("products-catalog-search-banner");
    const textEl = document.getElementById("products-catalog-search-banner-text");
    if (!wrap || !textEl || cfg.isHome) return;
    if (!state.headerSearch || !state.headerSearch.trim()) {
      wrap.hidden = true;
      textEl.textContent = "";
      return;
    }
    wrap.hidden = false;
    const q = state.headerSearch.trim();
    textEl.textContent =
      filteredCount > 0
        ? `По запросу «${q}» показано позиций: ${filteredCount}.`
        : `По запросу «${q}» ничего не найдено. Уточните запрос или откройте весь каталог.`;
  }

  function setLoadMoreVisible(totalCount) {
    if (cfg.catalogLayout) return;
    const lim = shownLimit(state, cfg);
    const more = totalCount > lim;
    const d = more ? "inline-flex" : "none";
    if (cfg.loadMore) cfg.loadMore.style.display = d;
    if (cfg.priceLoadMore) cfg.priceLoadMore.style.display = d;
  }

  function renderGrid() {
    if (cfg.catalogLayout) return;
    const filtered = filteredProducts();
    updateSearchBanner(filtered.length);
    const items = sortProductList(filtered, state.sort);
    const lim = shownLimit(state, cfg);
    const visible = items.slice(0, Math.min(lim, items.length));

    cfg.grid.innerHTML = visible
      .map((p) => {
        const features = productFeatures(p);
        const cardTitle = productCardTitle(p);
        const img = imageForProduct(p);
        return `
        <article class="products-popular-card">
          <a class="products-popular-media-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="Открыть карточку ${ppEscape(cardTitle)}">
            <div class="products-popular-media" style="background-image: linear-gradient(120deg, rgba(14,24,48,0.22), rgba(20,36,62,0.12)), url('${img}');">
              <span class="products-media-code">${ppEscape(ppArticleUi(p.code ?? ""))}</span>
            </div>
          </a>
          <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${ppEscape(cardTitle)}</a></h3>
          <ul>
            ${features.map((f) => `<li>${ppEscape(f)}</li>`).join("")}
          </ul>
        </article>
      `;
      })
      .join("");

    setLoadMoreVisible(items.length);
  }

  function syncCatalogGridExpandUI() {
    if (!cfg.catalogLayout) return;
    const scroll = document.getElementById("catalog-grid-scroll");
    const btn = document.getElementById("catalog-expand-toggle");
    if (!scroll || !btn || !cfg.grid) return;
    const items = cfg.grid.querySelectorAll(".catalog-row, .catalog-card-grid");
    const empty = cfg.grid.querySelector(".catalog-empty");
    if (empty || items.length === 0) {
      btn.hidden = true;
      scroll.classList.remove("catalog-grid-scroll--collapsed");
      scroll.classList.add("is-expanded");
      return;
    }
    /* Порции 6+10+10… — без схлопывания; лента скроллится целиком. */
    btn.hidden = true;
    scroll.classList.remove("catalog-grid-scroll--collapsed");
    scroll.classList.add("is-expanded");
  }

  function renderCatalogMain() {
    const filtered = filteredProducts();
    updateSearchBanner(filtered.length);
    const items = sortProductList(filtered, state.sort);
    const countText = `Найдено: ${items.length} ${pluralTovarov(items.length)}`;
    if (cfg.countLeft) cfg.countLeft.textContent = countText;
    if (cfg.countRight) cfg.countRight.textContent = countText;

    const pages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
    if (state.catalogPage > pages) state.catalogPage = pages;
    const base = (state.catalogPage - 1) * CATALOG_PAGE_SIZE;
    const remaining = Math.max(0, items.length - base);
    const visibleCount = Math.min(
      CATALOG_INITIAL_VISIBLE + CATALOG_LOAD_MORE_STEP * state.catalogMoreBatches,
      remaining
    );
    const visible = items.slice(base, base + visibleCount);

    cfg.grid.classList.remove("catalog-grid--list", "catalog-grid--grid");
    cfg.grid.classList.add(state.viewMode === "grid" ? "catalog-grid--grid" : "catalog-grid--list");

    if (!visible.length) {
      cfg.grid.innerHTML = `<div class="catalog-empty">По заданным фильтрам ничего не найдено.</div>`;
    } else if (state.viewMode === "grid") {
      cfg.grid.innerHTML = visible.map((p) => renderCatalogGridCard(p, "")).join("");
    } else {
      cfg.grid.innerHTML = visible.map((p) => renderCatalogListRow(p, "")).join("");
    }

    const html = buildCatalogPaginationHtml(pages, state.catalogPage);
    if (cfg.paginationSidebar) cfg.paginationSidebar.innerHTML = html;
    if (cfg.paginationBottom) cfg.paginationBottom.innerHTML = html;

    const canLoadMoreOnPage = base + visibleCount < items.length;
    [cfg.loadMoreSidebar, cfg.loadMoreBottom].forEach((btn) => {
      if (!btn) return;
      btn.hidden = items.length === 0 || !canLoadMoreOnPage;
      btn.disabled = !canLoadMoreOnPage;
    });

    const subEl = cfg.catalogShownSub;
    if (subEl) {
      if (items.length === 0) {
        subEl.textContent = "";
        subEl.hidden = true;
      } else {
        const shown = visible.length;
        subEl.hidden = false;
        subEl.textContent = `Показано ${shown} из ${items.length}`;
      }
    }

    bindCatalogCatalogDelegation(cfg);
    syncCatalogGridExpandUI();
  }

  function renderPriceTable() {
    if (!cfg.priceTbody) return;
    const filtered = filteredProducts();
    const items = sortProductList(filtered, state.sort);
    const lim = shownLimit(state, cfg);
    const visible = items.slice(0, Math.min(lim, items.length));
    cfg.priceTbody.innerHTML = visible
      .map((p) => {
        const code = ppEscape(ppArticleUi(p.code ?? ""));
        const nm = ppEscape(nameStr(p));
        const href = `product.html?id=${encodeURIComponent(p.id)}`;
        return `<tr>
          <td><a href="${href}">${code}</a></td>
          <td><a href="${href}">${nm}</a></td>
          <td>${formatPriceCell(p.priceNdsPerKg)}</td>
          <td>${formatPriceCell(p.priceNoNdsPerKg)}</td>
        </tr>`;
      })
      .join("");
    setLoadMoreVisible(items.length);
  }

  function renderAll() {
    if (cfg.catalogLayout) {
      renderCatalogMain();
      renderPriceTable();
      return;
    }
    renderGrid();
    renderPriceTable();
  }

  function setTab(which) {
    state.tab = which;
    const isCat = which === "catalog";
    if (cfg.tabCatalog) {
      cfg.tabCatalog.classList.toggle("is-active", isCat);
      cfg.tabCatalog.setAttribute("aria-selected", isCat ? "true" : "false");
    }
    if (cfg.tabPrice) {
      cfg.tabPrice.classList.toggle("is-active", !isCat);
      cfg.tabPrice.setAttribute("aria-selected", isCat ? "false" : "true");
    }
    if (cfg.panelCatalog) {
      cfg.panelCatalog.classList.toggle("is-active", isCat);
      cfg.panelCatalog.toggleAttribute("hidden", !isCat);
    }
    if (cfg.panelPrice) {
      cfg.panelPrice.classList.toggle("is-active", !isCat);
      cfg.panelPrice.toggleAttribute("hidden", isCat);
    }
  }

  function resetPagingAndSelection() {
    state.seriesCode = "all";
    state.positionId = "all";
    if (cfg.catalogLayout) {
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      catalogGridViewportExpanded = false;
    } else state.shown = cfg.initialShown;
  }

  /** Сброс поиска по ?q= и фильтров; показ всех карточек в сетке (без порционной подгрузки). */
  function resetToFullCatalog() {
    state.headerSearch = "";
    state.catalogNameSearch = "";
    state.catalogPriceCode = "";
    state.family = "all";
    state.purpose = "all";
    state.sort = "code-asc";
    state.seriesCode = "all";
    state.positionId = "all";
    state.aiQuery = "";
    state.aiProvider = "";
    state.aiProductIds = null;
    if (cfg.catalogLayout) {
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      state.viewMode = "list";
      cfg.root.querySelectorAll('input[name="catalog-purpose"]').forEach((el) => {
        el.checked = false;
      });
      cfg.viewListBtn?.classList.add("is-active");
      cfg.viewGridBtn?.classList.remove("is-active");
      cfg.viewListBtn?.setAttribute("aria-pressed", "true");
      cfg.viewGridBtn?.setAttribute("aria-pressed", "false");
      state.shown = cfg.initialShown;
    } else {
      state.shown = Number.MAX_SAFE_INTEGER;
    }
    const inp = document.getElementById("site-search-input");
    if (inp) inp.value = "";
    const nameInp = document.getElementById("catalog-name-search");
    if (nameInp) nameInp.value = "";
    const codeInpReset = document.getElementById("catalog-price-code-input");
    if (codeInpReset) codeInpReset.value = "";
    if (cfg.aiSearchInput) cfg.aiSearchInput.value = "";
    if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = "";
    try {
      const u = new URL(location.href);
      if (u.searchParams.has("q")) {
        u.searchParams.delete("q");
        const qs = u.searchParams.toString();
        history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}${u.hash}`);
      }
    } catch {
      /* ignore */
    }
    if (cfg.selFamily) cfg.selFamily.value = "all";
    if (cfg.selPurpose) cfg.selPurpose.value = "all";
    if (cfg.selSort) cfg.selSort.value = "code-asc";
    if (cfg.selByCode) cfg.selByCode.value = "all";
    if (cfg.selSeriesCode) cfg.selSeriesCode.value = "all";
    if (cfg.selSeriesProduct) cfg.selSeriesProduct.value = "all";
    syncFamilySeriesPickers();
    renderAll();
  }

  async function runAiCatalogSearch() {
    if (!cfg.catalogLayout || !cfg.aiSearchInput) return;
    const query = String(cfg.aiSearchInput.value || "").trim();
    if (query.length < 3) {
      if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = "Введите запрос минимум из 3 символов.";
      return;
    }
    if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = "ИИ анализирует запрос...";
    cfg.aiSearchRunBtn?.setAttribute("disabled", "disabled");
    try {
      const { resp, data } = await postAiSearch({ query, strictAi: true });
      if (!resp.ok || !data || data.error) {
        const msg = String(data?.message || "Не удалось выполнить ИИ-поиск.");
        if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = msg;
        return;
      }
      if (String(data.provider || "") !== "google-gemini") {
        if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = "Результаты доступны только после обработки Google AI.";
        return;
      }
      const ids = Array.isArray(data.productIds) ? data.productIds.map((x) => String(x)) : [];
      state.aiQuery = query;
      state.aiProvider = String(data.provider || "");
      state.aiProductIds = new Set(ids);
      state.family = "all";
      state.purpose = "all";
      state.seriesCode = "all";
      state.positionId = "all";
      state.catalogNameSearch = "";
      state.catalogPriceCode = "";
      if (cfg.selFamily) cfg.selFamily.value = "all";
      if (cfg.selPurpose) cfg.selPurpose.value = "all";
      if (cfg.selSeriesCode) cfg.selSeriesCode.value = "all";
      if (cfg.selSeriesProduct) cfg.selSeriesProduct.value = "all";
      if (cfg.catalogNameSearchInput) cfg.catalogNameSearchInput.value = "";
      if (cfg.catalogPriceCodeInput) cfg.catalogPriceCodeInput.value = "";
      cfg.root.querySelectorAll('input[name="catalog-purpose"]').forEach((el) => {
        el.checked = false;
      });
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      syncFamilySeriesPickers();
      renderAll();
      const count = ids.length;
      if (cfg.aiSearchStatus) {
        cfg.aiSearchStatus.textContent = count
          ? `ИИ-поиск (Google AI): найдено ${count} позиций.`
          : "ИИ-поиск (Google AI): ничего не найдено, уточните запрос.";
      }
    } catch {
      const fileMode = window.location.protocol === "file:";
      if (cfg.aiSearchStatus) {
        cfg.aiSearchStatus.textContent = fileMode
          ? "API недоступен в режиме file://. Откройте сайт через http://localhost:3000."
          : "Ошибка сети при ИИ-поиске.";
      }
    } finally {
      cfg.aiSearchRunBtn?.removeAttribute("disabled");
    }
  }

  cfg.selFamily.addEventListener("change", () => {
    state.family = cfg.selFamily.value || "all";
    if (cfg.catalogLayout && state.family !== "all") {
      state.catalogPriceCode = "";
      if (cfg.catalogPriceCodeInput) cfg.catalogPriceCodeInput.value = "";
    }
    resetPagingAndSelection();
    syncFamilySeriesPickers();
    renderAll();
  });
  cfg.selPurpose?.addEventListener("change", () => {
    state.purpose = cfg.selPurpose.value || "all";
    resetPagingAndSelection();
    syncFamilySeriesPickers();
    renderAll();
  });
  cfg.selByCode?.addEventListener("change", () => {
    if (state.family !== "all") return;
    state.positionId = cfg.selByCode.value || "all";
    if (cfg.catalogLayout) {
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
    } else state.shown = cfg.initialShown;
    renderAll();
  });
  cfg.selSeriesCode?.addEventListener("change", () => {
    state.seriesCode = cfg.selSeriesCode.value || "all";
    state.positionId = "all";
    if (cfg.catalogLayout) {
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
    } else state.shown = cfg.initialShown;
    const scope = productsForByCodeSelect(state.family, cfg, state);
    fillSeriesProductSelect(cfg.selSeriesProduct, scope, state.seriesCode);
    if (cfg.selSeriesProduct) cfg.selSeriesProduct.value = "all";
    renderAll();
  });
  cfg.selSeriesProduct?.addEventListener("change", () => {
    state.positionId = cfg.selSeriesProduct.value || "all";
    if (cfg.catalogLayout) {
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
    } else state.shown = cfg.initialShown;
    renderAll();
  });
  cfg.selSort.addEventListener("change", () => {
    state.sort = cfg.selSort.value || "code-asc";
    if (cfg.catalogLayout) {
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
    }
    renderAll();
  });

  if (cfg.catalogLayout) {
    cfg.root.querySelectorAll('input[name="catalog-purpose"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        resetPagingAndSelection();
        syncFamilySeriesPickers();
        renderAll();
      });
    });
    cfg.catalogNameSearchInput?.addEventListener("input", () => {
      state.catalogNameSearch = cfg.catalogNameSearchInput.value || "";
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      renderAll();
    });
    cfg.catalogPriceCodeInput?.addEventListener("input", () => {
      state.catalogPriceCode = cfg.catalogPriceCodeInput.value || "";
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      renderAll();
    });
    cfg.aiSearchRunBtn?.addEventListener("click", () => {
      runAiCatalogSearch();
    });
    cfg.aiSearchInput?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      runAiCatalogSearch();
    });
    cfg.aiSearchResetBtn?.addEventListener("click", () => {
      state.aiQuery = "";
      state.aiProvider = "";
      state.aiProductIds = null;
      if (cfg.aiSearchInput) cfg.aiSearchInput.value = "";
      if (cfg.aiSearchStatus) cfg.aiSearchStatus.textContent = "";
      catalogGridViewportExpanded = false;
      state.catalogPage = 1;
      state.catalogMoreBatches = 0;
      renderAll();
    });
    cfg.resetFiltersBtn?.addEventListener("click", () => resetToFullCatalog());
    cfg.viewListBtn?.addEventListener("click", () => {
      catalogGridViewportExpanded = false;
      state.viewMode = "list";
      cfg.viewListBtn?.classList.add("is-active");
      cfg.viewGridBtn?.classList.remove("is-active");
      cfg.viewListBtn?.setAttribute("aria-pressed", "true");
      cfg.viewGridBtn?.setAttribute("aria-pressed", "false");
      renderAll();
    });
    cfg.viewGridBtn?.addEventListener("click", () => {
      catalogGridViewportExpanded = false;
      state.viewMode = "grid";
      cfg.viewGridBtn?.classList.add("is-active");
      cfg.viewListBtn?.classList.remove("is-active");
      cfg.viewGridBtn?.setAttribute("aria-pressed", "true");
      cfg.viewListBtn?.setAttribute("aria-pressed", "false");
      renderAll();
    });
    function onCatalogLoadMoreClick(e) {
      e.preventDefault();
      state.catalogMoreBatches += 1;
      renderAll();
    }
    cfg.loadMoreSidebar?.addEventListener("click", onCatalogLoadMoreClick);
    cfg.loadMoreBottom?.addEventListener("click", onCatalogLoadMoreClick);

    if (cfg.root.dataset.dpCatalogPagBound !== "1") {
      cfg.root.dataset.dpCatalogPagBound = "1";
      cfg.root.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-catalog-nav]");
        if (nav && cfg.root.contains(nav)) {
          e.preventDefault();
          if (nav.disabled) return;
          const filtered = filteredProducts();
          const items = sortProductList(filtered, state.sort);
          const pages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
          const dir = nav.getAttribute("data-catalog-nav");
          if (dir === "prev" && state.catalogPage > 1) {
            catalogGridViewportExpanded = false;
            state.catalogPage -= 1;
            state.catalogMoreBatches = 0;
            renderAll();
          } else if (dir === "next" && state.catalogPage < pages) {
            catalogGridViewportExpanded = false;
            state.catalogPage += 1;
            state.catalogMoreBatches = 0;
            renderAll();
          }
          return;
        }
        const btn = e.target.closest("[data-catalog-page]");
        if (!btn || !cfg.root.contains(btn)) return;
        e.preventDefault();
        const p = parseInt(btn.getAttribute("data-catalog-page"), 10);
        if (!Number.isFinite(p)) return;
        catalogGridViewportExpanded = false;
        state.catalogPage = p;
        state.catalogMoreBatches = 0;
        renderAll();
      });
    }

    if (cfg.root.dataset.dpCatalogResizeBound !== "1") {
      cfg.root.dataset.dpCatalogResizeBound = "1";
      let catalogGridResizeT;
      window.addEventListener("resize", () => {
        clearTimeout(catalogGridResizeT);
        catalogGridResizeT = setTimeout(() => {
          renderCatalogMain();
        }, 160);
      });
    }

    if (cfg.root.dataset.dpCatalogExpandBound !== "1") {
      cfg.root.dataset.dpCatalogExpandBound = "1";
      document.getElementById("catalog-expand-toggle")?.addEventListener("click", () => {
        catalogGridViewportExpanded = !catalogGridViewportExpanded;
        renderCatalogMain();
      });
    }
  }

  function onLoadMore() {
    state.shown += cfg.loadStep;
    renderAll();
  }
  cfg.loadMore?.addEventListener("click", onLoadMore);
  cfg.priceLoadMore?.addEventListener("click", onLoadMore);

  cfg.tabCatalog?.addEventListener("click", () => setTab("catalog"));
  cfg.tabPrice?.addEventListener("click", () => setTab("price"));

  if (!cfg.isHome) {
    document.getElementById("products-catalog-search-reset")?.addEventListener("click", (e) => {
      e.preventDefault();
      resetToFullCatalog();
    });
  }

  setTab("catalog");
  syncFamilySeriesPickers();
  renderAll();

  if (!cfg.isHome && state.headerSearch) {
    const inp = document.getElementById("site-search-input");
    if (inp) inp.value = state.headerSearch;
  }

  if (catalogDeepLinkProductId && cfg.catalogLayout && cfg.grid) {
    const scrollToId = catalogDeepLinkProductId;
    catalogDeepLinkProductId = null;
    const idEsc =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(scrollToId)
        : scrollToId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const runScrollHighlight = () => {
      catalogGridViewportExpanded = true;
      const scrollEl = document.getElementById("catalog-grid-scroll");
      if (scrollEl) {
        scrollEl.classList.remove("catalog-grid-scroll--collapsed");
        scrollEl.classList.add("is-expanded");
      }
      const el = cfg.grid.querySelector(`[data-product-id="${idEsc}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el?.classList.add("catalog-search-target");
      window.setTimeout(() => el?.classList.remove("catalog-search-target"), 2600);
    };
    requestAnimationFrame(() => requestAnimationFrame(runScrollHighlight));
  }

  root.dpRefreshProductPortal = function dpRefreshProductPortal() {
    syncFamilySeriesPickers();
    renderAll();
  };
}

window.dpRefreshProductsPortals = function dpRefreshProductsPortals() {
  document.querySelectorAll("[data-products-portal]").forEach((el) => {
    if (typeof el.dpRefreshProductPortal === "function") el.dpRefreshProductPortal();
  });
};

function dpProductsViewerRole() {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return "";
    const user = JSON.parse(localStorage.getItem("authUser") || "null");
    return String(user?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function dpCanSeeCatalogSyncNotice() {
  const role = dpProductsViewerRole();
  return role === "admin" || role === "accountant" || role === "bookkeeper" || role === "бухгалтер";
}

function dpShowCatalogSyncNotice() {
  if (!dpCanSeeCatalogSyncNotice()) return;
  const id = "dp-catalog-sync-notice";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText =
      "position:fixed;right:14px;bottom:14px;z-index:9999;padding:8px 11px;border-radius:10px;background:rgba(12,18,34,.9);color:#fff;font:500 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.26)";
    document.body.appendChild(el);
  }
  el.textContent = "Фасовки карточек обновлены из прайса";
  el.hidden = false;
  clearTimeout(dpShowCatalogSyncNotice._t);
  dpShowCatalogSyncNotice._t = setTimeout(() => {
    if (el) el.hidden = true;
  }, 2400);
}

async function bootProductsPortals() {
  if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
    try {
      await window.dpSiteReady;
    } catch {
      /* offline */
    }
  }
  document.querySelectorAll("[data-products-portal]").forEach((root) => initPortal(root));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => bootProductsPortals());
} else {
  bootProductsPortals();
}

window.addEventListener("dp-catalog-updated", (e) => {
  if (e?.detail?.source === "admin" || e?.detail?.source === "api") {
    dpShowCatalogSyncNotice();
  }
});
