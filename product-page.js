function getProductDataPool() {
  return Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
}

const PDP_FAMILY_LABEL = {
  primer: "Грунтовки",
  enamel: "Эмали",
  lacquer: "Лаки",
  paint: "Краски",
  putty: "Шпатлёвки",
  other: "Прочее",
};

const PDP_BUYBOX_BADGES_EXCLUDE = new Set([
  "РАВНОМЕРНОЕ ПОКРЫТИЕ",
  "СТАБИЛЬНЫЙ РЕЗУЛЬТАТ",
  "ПРОСТОЕ ПРИМЕНЕНИЕ",
]);

function qParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function esc(v = "") {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pdpArticleBreadcrumb(product) {
  const name = String(product?.name || "");
  const c = String(product?.code ?? "").trim();
  if (!c) return name;
  const label =
    typeof window.dpFormatArticleUi === "function"
      ? window.dpFormatArticleUi(c)
      : /^\d+$/.test(c)
        ? `Артикул: ${c}`
        : c;
  return `${label} · ${name}`;
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n)} грн/кг`;
}

function pdpFmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(x)} грн`;
}

function productImageDataUri(product) {
  const name = encodeURIComponent((product.name || "").slice(0, 42));
  const code = encodeURIComponent(product.code || "SERIES");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='760' height='460' viewBox='0 0 760 460'>` +
    `<defs><linearGradient id='g' x1='0' x2='1'><stop stop-color='%23003b7e'/><stop offset='1' stop-color='%23e31b23'/></linearGradient></defs>` +
    `<rect width='760' height='460' fill='%23e8ecf4'/>` +
    `<circle cx='128' cy='88' r='120' fill='url(%23g)' fill-opacity='0.22'/>` +
    `<circle cx='650' cy='358' r='170' fill='url(%23g)' fill-opacity='0.2'/>` +
    `<rect x='250' y='70' width='260' height='280' rx='26' fill='url(%23g)'/>` +
    `<rect x='300' y='40' width='160' height='48' rx='12' fill='%230a1528'/>` +
    `<text x='380' y='226' text-anchor='middle' fill='%23f8faff' font-family='Inter,Arial' font-size='33' font-weight='800'>${code}</text>` +
    `<text x='380' y='262' text-anchor='middle' fill='%23d9e2f5' font-family='Inter,Arial' font-size='18'>DP COATINGS</text>` +
    `<text x='30' y='430' fill='%233b5280' font-family='Inter,Arial' font-size='16'>${name}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function dpResolveUpload(url) {
  if (!url) return "";
  return typeof window.dpResolveMediaUrl === "function" ? window.dpResolveMediaUrl(url) : url;
}

function pdpCardImageFor(product) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  const u = ov.heroImageUrl || ov.cardImageUrl;
  if (u) return dpResolveUpload(u) || u;
  return productImageDataUri(product);
}

function dpDetailLib() {
  return window.DP_PRODUCT_DETAIL_DEFAULTS || null;
}

function normalizeSpecRowsFromOverride(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const out = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      const k = String(row[0]).trim();
      const v = String(row[1]).trim();
      if (k) out.push([k, v]);
      continue;
    }
    if (row && typeof row === "object") {
      const k = String(row.key ?? row.label ?? "").trim();
      const v = String(row.value ?? "").trim();
      if (k) out.push([k, v]);
    }
  }
  return out.length ? out : [];
}

function mergeSpecRows(ov, fallbackPairs) {
  if (ov && Array.isArray(ov.detailSpecRows)) {
    const n = normalizeSpecRowsFromOverride(ov.detailSpecRows);
    if (n !== null) return n;
  }
  return fallbackPairs;
}

function mergeDetailString(ov, key, fallback) {
  if (ov && Object.prototype.hasOwnProperty.call(ov, key)) return String(ov[key] ?? "");
  return fallback;
}

function mergeDetailStringArray(ov, key, fallbackArr) {
  if (ov && Object.prototype.hasOwnProperty.call(ov, key) && Array.isArray(ov[key])) {
    return ov[key].map((x) => String(x).trim()).filter(Boolean);
  }
  return fallbackArr.slice();
}

function mergeExpertTips(ov, fallback) {
  if (ov && Object.prototype.hasOwnProperty.call(ov, "detailExpertTips") && Array.isArray(ov.detailExpertTips)) {
    return ov.detailExpertTips
      .map((t) => {
        if (!t || typeof t !== "object") return null;
        const title = String(t.title || "").trim();
        const url = String(t.url || "").trim();
        if (!title || !url) return null;
        return { title, url, source: String(t.source || "").trim() || "ссылка" };
      })
      .filter(Boolean);
  }
  return fallback.map((x) => ({ ...x }));
}

function mergeDetailFiles(ov, fallback) {
  if (ov && Object.prototype.hasOwnProperty.call(ov, "detailFiles") && Array.isArray(ov.detailFiles)) {
    return ov.detailFiles
      .map((f) => {
        if (!f || typeof f !== "object") return null;
        const label = String(f.label || "").trim();
        const href = String(f.href || "").trim();
        if (!label || !href) return null;
        return { label, href, size: String(f.size || "").trim() || "—" };
      })
      .filter(Boolean);
  }
  return fallback.map((x) => ({ ...x }));
}

function mergeTopBadges(ov, fallback) {
  if (ov && Object.prototype.hasOwnProperty.call(ov, "detailTopBadges") && Array.isArray(ov.detailTopBadges)) {
    return ov.detailTopBadges.map((x) => String(x).trim()).filter(Boolean);
  }
  return fallback.slice();
}

function pdpRetailTotals(product) {
  const mode = "retail";
  const totals = [];
  if (typeof calcJarTotal !== "function" || !(Number(product.priceNdsPerKg) > 0)) return totals;
  const std =
    Array.isArray(window.dpStandardRetailJarKg) && window.dpStandardRetailJarKg.length
      ? window.dpStandardRetailJarKg
      : [0.9, 19.7, 46.6];
  for (const w of std) {
    const t = calcJarTotal(product, w, mode);
    if (t != null && Number.isFinite(t) && t > 0) totals.push(t);
  }
  return totals;
}

function pdpMinPackPrice(product) {
  const t = pdpRetailTotals(product);
  if (!t.length) return null;
  return Math.min(...t);
}

/** Есть ли в прайсе положительная цена (с НДС или без). */
function productHasPriceInCatalog(p) {
  if (!p) return false;
  const r = Number(p.priceNdsPerKg);
  const w = Number(p.priceNoNdsPerKg);
  return (Number.isFinite(r) && r > 0) || (Number.isFinite(w) && w > 0);
}

/** Масса фасовки кг для сравнения чипов (банка jarKg, иначе packMassKg). */
function pdpChipMassKg(chip) {
  if (!chip) return null;
  const pm = Number(chip.packMassKg);
  if (Number.isFinite(pm) && pm > 0) return pm;
  const j = Number(chip.jarKg);
  return Number.isFinite(j) && j > 0 ? j : null;
}

/** Первая доступная к заказу фасовка или первая из списка (объект чипа каталога). */
function pdpFirstActivePack(packChips) {
  const firstOk = packChips.find((c) => !c.disabled);
  return firstOk || packChips[0] || null;
}

/** Кг для сортировки чипов */
function pdpChipSortKg(c, product) {
  if (!c) return 0;
  const pm = Number(c.packMassKg);
  if (Number.isFinite(pm) && pm > 0) return pm;
  if (c.kind === "jar") return Number(c.jarKg) || 0;
  if (c.kind === "bucket") return Number(product.bucketKg) || 0;
  if (c.kind === "drum") return Number(product.drumKg) || 0;
  return 0;
}

function pdpBuildPackChips(product) {
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  if (typeof window.dpApplyDetailPackChips === "function") {
    return window.dpApplyDetailPackChips(product, ov);
  }
  if (typeof window.dpBuildPackChipsRaw === "function") {
    return window.dpBuildPackChipsRaw(product);
  }
  const mode = "retail";
  const std =
    Array.isArray(window.dpStandardRetailJarKg) && window.dpStandardRetailJarKg.length
      ? window.dpStandardRetailJarKg
      : [0.9, 19.7, 46.6];
  const fmt = (w) => {
    const n = Number(w);
    if (n === 0.9) return "0,9 кг";
    if (n === 19.7) return "19,7 кг";
    if (n === 46.6) return "46,6 кг";
    return `${String(w).replace(".", ",")} кг`;
  };
  const chips = [];
  if (Number(product.priceNdsPerKg) > 0) {
    for (const w of std) {
      const total = typeof calcJarTotal === "function" ? calcJarTotal(product, w, mode) : null;
      chips.push({
        kind: "jar",
        packType: "jar",
        jarKg: w,
        label: fmt(w),
        sub: "фасовка",
        price: total,
        disabled: total == null,
      });
    }
  }
  chips.sort((a, b) => pdpChipSortKg(a, product) - pdpChipSortKg(b, product));
  return chips;
}

function pdpFasovkaContactHref(product) {
  const id = String(product && product.id != null ? product.id : "");
  const code = String(product && product.code != null ? product.code : "");
  const name = String(product && product.name != null ? product.name : "");
  const q = new URLSearchParams();
  q.set("from", "pdp");
  if (id) q.set("productId", id);
  if (code) q.set("code", code);
  if (name) q.set("product", name.slice(0, 200));
  const qs = q.toString();
  return qs ? `contact.html?${qs}#lead-form` : "contact.html#lead-form";
}

function pdpSimilarProducts(current, pool, limit = 8) {
  const fam = String(current.family || "other");
  return pool
    .filter((p) => p.id !== current.id && String(p.family || "other") === fam)
    .slice(0, limit * 2)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "uk"))
    .slice(0, limit);
}

function pdpMainAndSecondaryImages(product, ov) {
  const h = ov.heroImageUrl ? String(ov.heroImageUrl).trim() : "";
  const c = ov.cardImageUrl ? String(ov.cardImageUrl).trim() : "";
  const primaryRaw = h || c;
  const primary = primaryRaw ? dpResolveUpload(primaryRaw) || primaryRaw : productImageDataUri(product);
  let secondary = "";
  if (h && c && h !== c) {
    const other = h === primaryRaw ? c : h;
    secondary = dpResolveUpload(other) || other;
  }
  return { primary, secondary };
}

function bindPdpInteractions(root, product) {
  const chips = Array.from(root.querySelectorAll(".pdp-buybox-packs .pdp-pack-chip"));
  const tabBtns = Array.from(root.querySelectorAll("[data-pdp-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-pdp-panel]"));
  const track = root.querySelector("[data-pdp-similar-track]");

  function pdpChipLikeFromEl(chip) {
    const pt = chip?.getAttribute("data-pack-type");
    if (!pt) return null;
    if (pt === "jar") {
      const j = chip.getAttribute("data-jar-kg");
      const jarKg = j != null && j !== "" ? parseFloat(j) : NaN;
      return Number.isFinite(jarKg) ? { kind: "jar", jarKg } : null;
    }
    const m = chip.getAttribute("data-pack-mass-kg");
    const mass = m != null && m !== "" ? parseFloat(m) : NaN;
    if (Number.isFinite(mass) && mass > 0) return { kind: pt, packType: pt, packMassKg: mass };
    return { kind: pt };
  }

  let qty = 1;
  const qtyNumEl = root.querySelector("[data-pdp-qty-num]");
  const qtyCluster = root.querySelector("[data-pdp-qty-cluster]");
  function syncQty() {
    if (qtyNumEl) qtyNumEl.textContent = String(qty);
    if (qtyCluster) qtyCluster.setAttribute("aria-label", `Количество: ${qty}`);
  }
  syncQty();

  function updatePdpPackPriceFromChip() {
    const el = root.querySelector("[data-pdp-price-pack]");
    if (!el) return;
    const ch = chips.find((c) => c.classList.contains("is-active")) || chips[0];
    if (!ch) {
      el.textContent = "—";
      return;
    }
    const raw = ch.getAttribute("data-pdp-pack-total");
    const n = raw != null && raw !== "" ? Number(raw) : NaN;
    el.textContent = Number.isFinite(n) && n > 0 ? pdpFmtMoney(n) : "—";
  }
  updatePdpPackPriceFromChip();

  function activeChip() {
    return chips.find((el) => el.classList.contains("is-active")) || chips[0];
  }

  function updatePdpGalleryPackImage() {
    const hero = root.querySelector(".pdp-gallery-inner img");
    if (!hero || !product) return;
    const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
    const chip = activeChip();
    const like = chip ? pdpChipLikeFromEl(chip) : null;
    let url = null;
    if (like && typeof window.dpCatalogPackImageUrlOrNull === "function") {
      url = window.dpCatalogPackImageUrlOrNull(ov, like);
    }
    if (!url) {
      const { primary } = pdpMainAndSecondaryImages(product, ov);
      url = primary || "";
    }
    if (url) hero.src = url;
  }

  function selectTab(id) {
    tabBtns.forEach((b) => {
      const on = b.getAttribute("data-pdp-tab") === id;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      const on = p.getAttribute("data-pdp-panel") === id;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
    });
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    const tab = t.closest("[data-pdp-tab]");
    if (tab) {
      e.preventDefault();
      selectTab(tab.getAttribute("data-pdp-tab") || "desc");
      return;
    }

    const chip = t.closest(".pdp-pack-chip");
    if (chip && chips.includes(chip)) {
      if (chip.hasAttribute("disabled") || chip.disabled) return;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      updatePdpPackPriceFromChip();
      updatePdpGalleryPackImage();
      return;
    }

    if (t.closest("[data-pdp-qty-minus]")) {
      qty = Math.max(1, qty - 1);
      syncQty();
      return;
    }
    if (t.closest("[data-pdp-qty-plus]")) {
      qty = Math.min(99, qty + 1);
      syncQty();
      return;
    }

    const addSim = t.closest("[data-pdp-sim-add]");
    if (addSim) {
      const id = addSim.getAttribute("data-pdp-sim-add");
      const jar = addSim.getAttribute("data-pdp-sim-jar");
      if (jar && id && typeof addJarToCartWithQuantity === "function") {
        addJarToCartWithQuantity(id, jar, 1);
        return;
      }
      const pack = addSim.getAttribute("data-pdp-sim-pack") || "bucket";
      if (id && typeof addToCartWithQuantity === "function") {
        addToCartWithQuantity(id, pack, 1);
      }
      return;
    }

    const prev = t.closest("[data-pdp-sim-prev]");
    if (prev && track) {
      track.scrollBy({ left: -280, behavior: "smooth" });
      return;
    }
    const next = t.closest("[data-pdp-sim-next]");
    if (next && track) {
      track.scrollBy({ left: 280, behavior: "smooth" });
      return;
    }

    const addMain = t.closest("[data-pdp-add-cart]");
    if (addMain) {
      const ch = activeChip();
      if (!ch || ch.hasAttribute("disabled")) return;
      const packType = ch.getAttribute("data-pack-type");
      const jarKg = ch.getAttribute("data-jar-kg");
      if (packType === "jar" && jarKg && typeof addJarToCartWithQuantity === "function") {
        addJarToCartWithQuantity(product.id, jarKg, qty);
      } else if (packType && typeof addToCartWithQuantity === "function") {
        addToCartWithQuantity(product.id, packType, qty);
      }
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tab = e.target instanceof Element ? e.target.closest("[data-pdp-tab]") : null;
    if (tab) {
      e.preventDefault();
      selectTab(tab.getAttribute("data-pdp-tab") || "desc");
    }
  });

  updatePdpGalleryPackImage();
}

function renderProductPage() {
  const root = document.getElementById("product-root");
  if (!root) return;
  const id = qParam("id");
  const product = getProductDataPool().find((x) => String(x.id) === String(id));
  if (!product) {
    root.innerHTML = `<article class="pdp-empty-state"><h1 class="pdp-title">Позиция не найдена</h1><p class="product-meta">Проверьте ссылку или вернитесь в каталог.</p><p><a href="products.html">← К каталогу</a></p></article>`;
    return;
  }

  const lib = dpDetailLib();
  const family = lib ? lib.detectFamily(product) : String(product.family || "other");
  const defs =
    lib && typeof lib.getDefaults === "function"
      ? lib.getDefaults(product)
      : {
          specRows: [],
          defaultSubtitle: `${product.name} — профессиональная лакокрасочная позиция.`,
          characteristicsIntro: "",
          applicationText: "",
          prepBase: [],
          prepProduct: [],
          painting: [],
          expertTips: [],
          topBadges: [],
          files: [],
        };
  const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product.id)] || {};
  const badges = mergeTopBadges(ov, defs.topBadges).filter((b) => !PDP_BUYBOX_BADGES_EXCLUDE.has(String(b).trim()));
  const rows = mergeSpecRows(ov, defs.specRows);
  const charIntro = mergeDetailString(ov, "detailCharacteristicsIntro", defs.characteristicsIntro);
  const applicationText = mergeDetailString(ov, "detailApplication", defs.applicationText);
  const prepBase = mergeDetailStringArray(ov, "detailPrepBase", defs.prepBase);
  const prepProduct = mergeDetailStringArray(ov, "detailPrepProduct", defs.prepProduct);
  const paint = mergeDetailStringArray(ov, "detailPainting", defs.painting);
  const tips = mergeExpertTips(ov, defs.expertTips);
  const files = mergeDetailFiles(ov, defs.files);

  const { primary: image, secondary: secImage } = pdpMainAndSecondaryImages(product, ov);
  const defaultSub =
    defs && typeof defs.defaultSubtitle === "string" && defs.defaultSubtitle.trim()
      ? defs.defaultSubtitle
      : `${product.name} — профессиональная лакокрасочная позиция.`;
  const heroSubtitle = ov.subtitle ? esc(ov.subtitle) : esc(defaultSub);
  const extraDesc = ov.description ? `<p>${esc(ov.description)}</p>` : "";

  const catLabel =
    typeof window.dpPdpFamilyCategoryTitle === "function"
      ? window.dpPdpFamilyCategoryTitle(String(product.family || family || "other"))
      : PDP_FAMILY_LABEL[String(product.family || family)] || PDP_FAMILY_LABEL.other;
  const hasCatalogPrice = productHasPriceInCatalog(product);
  const stockBarClass = hasCatalogPrice ? "pdp-stock-bar pdp-stock-bar--ok" : "pdp-stock-bar pdp-stock-bar--no";
  const stockBarLabel = hasCatalogPrice ? "Есть в наличии" : "Нет в наличии";

  const packChips = pdpBuildPackChips(product);
  const def = pdpFirstActivePack(packChips);
  const chipsHtml = packChips
    .map((c) => {
      const active =
        def &&
        String(c.kind) === String(def.kind) &&
        String(c.packType || "") === String(def.packType || "") &&
        pdpChipMassKg(c) === pdpChipMassKg(def);
      const priceHint = c.price != null ? pdpFmtMoney(c.price) : "—";
      const jarAttr = c.kind === "jar" ? ` data-jar-kg="${esc(String(c.jarKg))}"` : "";
      const massAttr =
        c.kind !== "jar" && pdpChipMassKg(c) != null ? ` data-pack-mass-kg="${esc(String(pdpChipMassKg(c)))}"` : "";
      const chipTitle = `${c.sub} · ${priceHint}`;
      const totalAttr =
        c.price != null && Number.isFinite(Number(c.price)) && Number(c.price) > 0
          ? ` data-pdp-pack-total="${String(c.price)}"`
          : "";
      const dis = c.disabled ? " disabled" : "";
      return `<button type="button" class="pdp-pack-chip${active ? " is-active" : ""}" data-pack-type="${esc(
        c.packType
      )}"${jarAttr}${massAttr}${totalAttr}${dis} aria-pressed="${active ? "true" : "false"}" title="${esc(chipTitle)}"><span>${esc(
        c.label
      )}</span><small>${esc(c.sub)} · ${esc(priceHint)}</small></button>`;
    })
    .join("");

  const canBuy = packChips.some((c) => !c.disabled);

  function pdpInitialPackPriceLabel() {
    if (!packChips.length) return "—";
    const c =
      packChips.find((x) => def && String(x.kind) === String(def.kind) && String(x.packType || "") === String(def.packType || "") && pdpChipMassKg(x) === pdpChipMassKg(def)) ||
      packChips[0];
    if (c && c.price != null && Number.isFinite(c.price) && c.price > 0) return pdpFmtMoney(c.price);
    return "—";
  }
  const initialPackPriceLabel = pdpInitialPackPriceLabel();

  const descSecondaryBlock = secImage
    ? `<div class="pdp-side-img"><img src="${esc(secImage)}" alt="" loading="lazy" /></div>`
    : "";

  const tipsBlock =
    tips.length > 0
      ? `<ul class="pdp-list">${tips
          .map(
            (x) =>
              `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a> — ${esc(
                x.source
              )}</li>`
          )
          .join("")}</ul>`
      : "";

  const similar = pdpSimilarProducts(product, getProductDataPool(), 8);
  const similarHtml = similar
    .map((p) => {
      const img = esc(pdpCardImageFor(p));
      const title = esc(p.name);
      const href = `product.html?id=${esc(String(p.id))}`;
      const simChips = pdpBuildPackChips(p);
      const simMin = pdpMinPackPrice(p);
      const firstBuy = simChips.find((c) => !c.disabled) || null;
      const simFirst = firstBuy || simChips[0] || null;
      const priceLine =
        firstBuy && firstBuy.price != null && Number(firstBuy.price) > 0
          ? pdpFmtMoney(firstBuy.price)
          : simMin != null
            ? `от ${pdpFmtMoney(simMin)}`
            : "—";
      let addAttrs = "";
      if (firstBuy) {
        if (firstBuy.kind === "jar") {
          addAttrs = `data-pdp-sim-add="${esc(String(p.id))}" data-pdp-sim-jar="${esc(String(firstBuy.jarKg))}"`;
        } else {
          addAttrs = `data-pdp-sim-add="${esc(String(p.id))}" data-pdp-sim-pack="${esc(firstBuy.packType)}"`;
        }
      }
      const canSim = !!firstBuy;
      return `<article class="pdp-sim-card">
        <div class="pdp-sim-card-img"><img src="${img}" alt="" loading="lazy" /></div>
        <div class="pdp-sim-card-body">
          <h3 class="pdp-sim-card-title"><a href="${href}">${title}</a></h3>
          <div class="pdp-sim-price">${esc(priceLine)}</div>
          <button type="button" class="pdp-sim-add" ${addAttrs} ${canSim ? "" : "disabled"}>В корзину</button>
        </div>
      </article>`;
    })
    .join("");

  const rawSku = String(product.code ?? "").trim();
  const pdpSkuLine =
    rawSku &&
    (typeof window.dpFormatArticleUi === "function"
      ? window.dpFormatArticleUi(rawSku)
      : /^\d+$/.test(rawSku)
        ? `Артикул: ${rawSku}`
        : rawSku);

  root.innerHTML = `
    <div class="pdp-breadcrumb-strip">
      <div class="container">
        <nav class="pdp-breadcrumb" aria-label="Хлебные крошки">
          <a href="index.html">Главная</a>
          <span class="pdp-breadcrumb-sep">/</span>
          <a href="products.html">Каталог</a>
          <span class="pdp-breadcrumb-sep">/</span>
          <a href="products.html">${esc(catLabel)}</a>
          <span class="pdp-breadcrumb-sep">/</span>
          <span class="pdp-breadcrumb-current">${esc(String(product.code ?? "").trim() ? pdpArticleBreadcrumb(product) : product.name)}</span>
        </nav>
      </div>
    </div>

    <div class="pdp-main">
      <div class="${esc(stockBarClass)}" role="status">${esc(stockBarLabel)}</div>
      <div class="pdp-gallery">
        <div class="pdp-gallery-inner">
          <img src="${esc(image)}" alt="${esc(product.name)}" />
        </div>
      </div>

      <div class="pdp-buybox">
        <h1 class="pdp-title">${esc(product.name)}</h1>
        ${pdpSkuLine ? `<p class="pdp-meta-article">${esc(pdpSkuLine)}</p>` : ""}
        <div class="pdp-rating-row">
          <span class="pdp-stars" aria-label="Рейтинг 4 из 5">
            <span class="pdp-star pdp-star--on" aria-hidden="true">★</span><span class="pdp-star pdp-star--on" aria-hidden="true">★</span><span class="pdp-star pdp-star--on" aria-hidden="true">★</span><span class="pdp-star pdp-star--on" aria-hidden="true">★</span><span class="pdp-star pdp-star--off" aria-hidden="true">★</span>
          </span>
          <a class="pdp-rating-link" href="contact.html#contact">17 отзывов</a>
        </div>
        ${badges.length ? `<div class="pdp-buybox-badges">${badges.map((b) => `<span class="pdp-buybox-badge">${esc(b)}</span>`).join("")}</div>` : ""}

        <div class="pdp-buybox-price-row">
          <div class="pdp-buybox-price-col">
            <div class="pdp-price-main"><span data-pdp-price-pack>${esc(initialPackPriceLabel)}</span></div>
            <div class="pdp-price-unit">Розница с НДС: ${esc(money(product.priceNdsPerKg))}</div>
          </div>
        </div>

        <div class="pdp-buybox-actions">
          <div class="pdp-buybox-actions-row">
            <div class="pdp-buybox-packs pdp-pack-chips" role="group" aria-label="Выбор фасовки">
              ${
                chipsHtml ||
                `<a class="pdp-buybox-no-packs pdp-buybox-fasovka-link" href="${esc(
                  pdpFasovkaContactHref(product)
                )}">Уточняйте фасовку у менеджера</a>`
              }
            </div>
            <div class="pdp-buybox-qty">
              <div class="pdp-qty-cluster" data-pdp-qty-cluster aria-label="Количество: 1">
                <div class="pdp-qty-stepper">
                  <button type="button" class="pdp-qty-btn" data-pdp-qty-minus aria-label="Меньше">−</button>
                  <span class="pdp-qty-num" data-pdp-qty-num>1</span>
                  <button type="button" class="pdp-qty-btn" data-pdp-qty-plus aria-label="Больше">+</button>
                </div>
              </div>
            </div>
            <button type="button" class="pdp-add-cart" data-pdp-add-cart ${canBuy ? "" : "disabled"}>В Корзину</button>
          </div>
          <div class="pdp-buybox-support">
            <p class="pdp-buybox-hint">Остались вопросы? Звоните:</p>
            <a class="pdp-buybox-phone" href="tel:+380676134220">+38 (067) 613-42-20</a>
          </div>
        </div>
      </div>

    <section class="pdp-tabs-wrap" aria-label="Информация о товаре">
      <div class="pdp-tabs" role="tablist">
        <button type="button" class="pdp-tab is-active" role="tab" data-pdp-tab="desc" aria-selected="true" id="pdp-tab-desc">Описание</button>
        <button type="button" class="pdp-tab" role="tab" data-pdp-tab="use" aria-selected="false" id="pdp-tab-use">Применение</button>
        <button type="button" class="pdp-tab" role="tab" data-pdp-tab="spec" aria-selected="false" id="pdp-tab-spec">Характеристики</button>
        <button type="button" class="pdp-tab" role="tab" data-pdp-tab="docs" aria-selected="false" id="pdp-tab-docs">Документы</button>
      </div>

      <div class="pdp-panel is-active" role="tabpanel" data-pdp-panel="desc" aria-labelledby="pdp-tab-desc">
        <div class="pdp-desc-grid">
          <div class="pdp-prose">
            <p>${heroSubtitle}</p>
            ${extraDesc}
          </div>
          ${descSecondaryBlock}
        </div>
        <div class="pdp-delivery">
          <h3 class="pdp-delivery-title">Доставка и сервис</h3>
          <div class="pdp-delivery-grid">
            <div class="pdp-delivery-item">
              <img src="assets/why-choose-quality.png" alt="" width="40" height="40" loading="lazy" />
              <div><strong>Собственное производство</strong><span>Контроль качества на всех этапах</span></div>
            </div>
            <div class="pdp-delivery-item">
              <img src="assets/why-choose-delivery.png" alt="" width="40" height="40" loading="lazy" />
              <div><strong>Оптовые поставки по Украине</strong><span>Логистика под ваш объект</span></div>
            </div>
            <div class="pdp-delivery-item">
              <img src="assets/why-choose-partnership.png" alt="" width="40" height="40" loading="lazy" />
              <div><strong>Бесплатная консультация</strong><span>Подбор ЛКМ и технология нанесения</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="pdp-panel" role="tabpanel" data-pdp-panel="use" aria-labelledby="pdp-tab-use" hidden>
        <div class="pdp-prose">
          <p>${esc(applicationText)}</p>
        </div>
        <h3 class="pdp-delivery-title" style="margin-top:1.25rem">Подготовка основания</h3>
        <ul class="pdp-list">${prepBase.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h3 class="pdp-delivery-title" style="margin-top:1rem">Подготовка изделия</h3>
        <ul class="pdp-list">${prepProduct.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h3 class="pdp-delivery-title" style="margin-top:1rem">Окраска</h3>
        <ul class="pdp-list">${paint.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${tipsBlock ? `<h3 class="pdp-delivery-title" style="margin-top:1rem">Советы эксперта</h3>${tipsBlock}` : ""}
      </div>

      <div class="pdp-panel" role="tabpanel" data-pdp-panel="spec" aria-labelledby="pdp-tab-spec" hidden>
        <table class="pdp-spec-table"><tbody>
          ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
        </tbody></table>
        ${charIntro ? `<div class="pdp-prose" style="margin-top:1rem"><p>${esc(charIntro)}</p></div>` : ""}
      </div>

      <div class="pdp-panel" role="tabpanel" data-pdp-panel="docs" aria-labelledby="pdp-tab-docs" hidden>
        ${
          files.length
            ? `<ul class="pdp-files">${files
                .map(
                  (f) =>
                    `<li><a href="${esc(f.href)}" target="_blank" rel="noopener noreferrer">${esc(f.label)}</a><span class="pdp-file-size">${esc(f.size)}</span></li>`
                )
                .join("")}</ul>`
            : `<p class="pdp-price-unit">Нет прикреплённых файлов. Документы можно добавить в админ-панели.</p>`
        }
      </div>
    </section>

    ${
      similar.length
        ? `<section class="pdp-similar" aria-label="Похожие товары">
      <div class="pdp-similar-head">
        <h2 class="pdp-similar-title">Похожие товары</h2>
        <div class="pdp-similar-tools">
          <a class="pdp-similar-all" href="products.html">Все в категории</a>
          <button type="button" class="pdp-carousel-btn" data-pdp-sim-prev aria-label="Назад">‹</button>
          <button type="button" class="pdp-carousel-btn" data-pdp-sim-next aria-label="Вперёд">›</button>
        </div>
      </div>
      <div class="pdp-similar-track-wrap">
        <div class="pdp-similar-track" data-pdp-similar-track>${similarHtml}</div>
      </div>
    </section>`
        : ""
    }
    </div>
  `;

  bindPdpInteractions(root, product);
}

async function bootProductPage() {
  if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
    try {
      await window.dpSiteReady;
    } catch {
      /* ignore */
    }
  }
  renderProductPage();
  if (!window.__dpPdpCatalogListener) {
    window.__dpPdpCatalogListener = true;
    window.addEventListener("dp-catalog-updated", () => {
      renderProductPage();
    });
    window.addEventListener("dp-lang-change", () => {
      renderProductPage();
    });
  }
}

bootProductPage();
