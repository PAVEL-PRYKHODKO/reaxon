(() => {
  const token = localStorage.getItem("authToken") || "";
  const root = document.getElementById("ap-cards-editor-root");
  if (!token || !root) return;

  const state = {
    products: [],
    filtered: [],
    overrides: {},
    selectedId: "",
    photoEdit: {
      sourceDataUrl: "",
      image: null,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
  };

  function apiUrl(path) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(path) : path;
  }

  async function apiAdmin(method, path, body) {
    const res = await fetch(apiUrl(path), {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  function setStatus(text, type = null) {
    const el = document.getElementById("ap-cards-status");
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("is-ok", "is-err");
    if (type === "ok") el.classList.add("is-ok");
    if (type === "err") el.classList.add("is-err");
  }

  function setPhotoStatus(text, type = null) {
    const el = document.getElementById("ap-cards-photo-status");
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("is-ok", "is-err");
    if (type === "ok") el.classList.add("is-ok");
    if (type === "err") el.classList.add("is-err");
  }

  function rowText(p) {
    return `${p.id || ""} ${p.code || ""} ${p.lineCode || ""} ${p.series || ""} ${p.name || ""}`.toLowerCase();
  }

  function articleOf(p) {
    const code = String(p?.code || "").trim();
    const line = String(p?.lineCode || p?.series || "").trim();
    return code || line || String(p?.id || "").trim();
  }

  function articleUi(p) {
    const raw = articleOf(p);
    if (!raw) return "—";
    if (typeof window.dpFormatArticleUi === "function") {
      const formatted = String(window.dpFormatArticleUi(raw) || "").trim();
      if (formatted) return formatted;
    }
    return raw;
  }

  function articlePlain(p) {
    const shown = String(articleUi(p) || "").trim();
    const m = shown.match(/^Артикул:\s*(.+)$/i);
    if (m && m[1]) return m[1].trim();
    return shown;
  }

  function sortProducts(list) {
    return [...list].sort((a, b) => {
      const ac = articleOf(a).toLowerCase();
      const bc = articleOf(b).toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc, "ru", { numeric: true });
      return String(a.name || "").localeCompare(String(b.name || ""), "ru", { numeric: true });
    });
  }

  function defaultCardFeatures(product) {
    const family = String(product?.family || "").toLowerCase();
    if (family.includes("primer")) return ["Улучшает адгезию", "Подготовка основания", "Снижает риск коррозии"];
    if (family.includes("enamel")) return ["Защитно-декоративное покрытие", "Стойкие цвета", "Для металла и дерева"];
    if (family.includes("lacquer")) return ["Финишная защита поверхности", "Устойчивость к износу", "Удобное нанесение"];
    if (family.includes("paint")) return ["Равномерное покрытие", "Удобство нанесения", "Подходит для разных оснований"];
    if (family.includes("putty")) return ["Выравнивание поверхности", "Подготовка под финиш", "Стабильная структура"];
    return ["Промышленная серия", "Поставки для B2B и розницы", "Подбор под задачу"];
  }

  function linesFromTextarea(value, max = 80) {
    return String(value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, max);
  }

  function rowsToText(rows) {
    if (!Array.isArray(rows)) return "";
    return rows
      .map((r) => (Array.isArray(r) ? `${String(r[0] || "").trim()} | ${String(r[1] || "").trim()}` : ""))
      .filter(Boolean)
      .join("\n");
  }

  function rowsFromText(text) {
    const invalid = [];
    const items = linesFromTextarea(text, 60)
      .map((line, idx) => {
        const [a, ...rest] = line.split("|");
        const key = String(a || "").trim();
        const val = String(rest.join("|") || "").trim();
        if (!key || !val) {
          invalid.push(idx + 1);
          return null;
        }
        return [key, val];
      })
      .filter(Boolean);
    return { items, invalid };
  }

  function tipsToText(tips) {
    if (!Array.isArray(tips)) return "";
    return tips
      .map((x) => {
        const title = String(x?.title || "").trim();
        const url = String(x?.url || "").trim();
        const source = String(x?.source || "").trim();
        return [title, url, source].join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  }

  function tipsFromText(text) {
    const invalid = [];
    const items = linesFromTextarea(text, 60)
      .map((line, idx) => {
        const [title, url, source] = line.split("|").map((s) => String(s || "").trim());
        if (!title || !url) {
          invalid.push(idx + 1);
          return null;
        }
        return { title, url, ...(source ? { source } : {}) };
      })
      .filter(Boolean);
    return { items, invalid };
  }

  function filesToText(files) {
    if (!Array.isArray(files)) return "";
    return files
      .map((x) => {
        const label = String(x?.label || "").trim();
        const href = String(x?.href || "").trim();
        const size = String(x?.size || "").trim();
        return [label, href, size].join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  }

  function filesFromText(text) {
    const invalid = [];
    const items = linesFromTextarea(text, 60)
      .map((line, idx) => {
        const [label, href, size] = line.split("|").map((s) => String(s || "").trim());
        if (!label || !href) {
          invalid.push(idx + 1);
          return null;
        }
        return { label, href, ...(size ? { size } : {}) };
      })
      .filter(Boolean);
    return { items, invalid };
  }

  function effectiveCardData(product, override) {
    const ov = override && typeof override === "object" ? override : {};
    const defaults =
      window.DP_PRODUCT_DETAIL_DEFAULTS && typeof window.DP_PRODUCT_DETAIL_DEFAULTS.getDefaults === "function"
        ? window.DP_PRODUCT_DETAIL_DEFAULTS.getDefaults(product) || {}
        : {};
    return {
      cardTitle: String(ov.cardTitle || product?.name || ""),
      subtitle: String(ov.subtitle || defaults.defaultSubtitle || ""),
      description: String(ov.description || defaults.characteristicsIntro || ""),
      cardFeatures:
        Array.isArray(ov.cardFeatures) && ov.cardFeatures.length
          ? ov.cardFeatures.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
          : defaultCardFeatures(product),
      detailSpecRows: Array.isArray(ov.detailSpecRows) && ov.detailSpecRows.length ? ov.detailSpecRows : defaults.specRows || [],
      detailCharacteristicsIntro: String(ov.detailCharacteristicsIntro || defaults.characteristicsIntro || ""),
      detailApplication: String(ov.detailApplication || defaults.applicationText || ""),
      detailPrepBase: Array.isArray(ov.detailPrepBase) && ov.detailPrepBase.length ? ov.detailPrepBase : defaults.prepBase || [],
      detailPrepProduct:
        Array.isArray(ov.detailPrepProduct) && ov.detailPrepProduct.length ? ov.detailPrepProduct : defaults.prepProduct || [],
      detailPainting: Array.isArray(ov.detailPainting) && ov.detailPainting.length ? ov.detailPainting : defaults.painting || [],
      detailTopBadges: Array.isArray(ov.detailTopBadges) && ov.detailTopBadges.length ? ov.detailTopBadges : defaults.topBadges || [],
      detailExpertTips:
        Array.isArray(ov.detailExpertTips) && ov.detailExpertTips.length ? ov.detailExpertTips : defaults.expertTips || [],
      detailFiles: Array.isArray(ov.detailFiles) && ov.detailFiles.length ? ov.detailFiles : defaults.files || [],
      fullOverride: { ...ov },
    };
  }

  function applyFilter() {
    const q = String(document.getElementById("ap-cards-search")?.value || "")
      .trim()
      .toLowerCase();
    state.filtered = q ? state.products.filter((p) => rowText(p).includes(q)) : state.products.slice();
    renderSelect();
  }

  function renderSelect() {
    const sel = document.getElementById("ap-cards-select");
    if (!sel) return;
    const options = state.filtered
      .map((p) => {
        const article = articlePlain(p);
        const name = String(p.name || "").trim() || String(p.id || "");
        return `<option value="${String(p.id)}">Артикул: ${article} — ${name}</option>`;
      })
      .join("");
    sel.innerHTML = `<option value="">— Выберите позицию —</option>${options}`;
    if (state.selectedId && state.filtered.some((p) => String(p.id) === state.selectedId)) {
      sel.value = state.selectedId;
    } else {
      state.selectedId = "";
      sel.value = "";
    }
    hydrateEditor();
  }

  function selectedProduct() {
    return state.products.find((p) => String(p.id) === state.selectedId) || null;
  }

  function currentOverride() {
    const p = selectedProduct();
    if (!p) return {};
    return state.overrides[String(p.id)] || {};
  }

  function mediaAbs(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    if (s.startsWith("/") && typeof window.dpApiUrl === "function") {
      const viaApi = String(window.dpApiUrl(s) || "").trim();
      if (viaApi) return viaApi;
    }
    if (typeof window.dpResolveMediaUrl === "function") {
      const r = window.dpResolveMediaUrl(s);
      if (r) return r;
    }
    return s;
  }

  function previewUrlCandidates(urlRaw) {
    const raw = String(urlRaw || "").trim();
    if (!raw) return [];
    const out = [];
    if (raw.startsWith("/") && typeof window.dpApiUrl === "function") {
      const withBase = String(window.dpApiUrl(raw) || "").trim();
      if (withBase) out.push(withBase);
      const noQuery = raw.split("?")[0];
      if (noQuery) {
        const withBaseNoQuery = String(window.dpApiUrl(noQuery) || "").trim();
        if (withBaseNoQuery && !out.includes(withBaseNoQuery)) out.push(withBaseNoQuery);
      }
    }
    const resolved = mediaAbs(raw);
    if (resolved) out.push(resolved);
    if (raw && !out.includes(raw)) out.push(raw);
    const noQuery = raw.split("?")[0];
    if (noQuery && !out.includes(noQuery)) out.push(noQuery);
    return out;
  }

  function packOptionRows(product, ov) {
    if (typeof window.dpApplyDetailPackChips !== "function") return [];
    const chips = window.dpApplyDetailPackChips(product, ov);
    return Array.isArray(chips) ? chips : [];
  }

  function packLabelFromChip(chip, key) {
    const label = String(chip?.label || "").trim();
    const sub = String(chip?.sub || "").trim();
    if (label && sub) return `${label} (${sub})`;
    if (label) return label;
    return key;
  }

  function packOptionsFor(product, ov) {
    const out = [];
    const add = (key, label) => {
      const k = String(key || "").trim();
      if (!k || out.some((x) => x.key === k)) return;
      out.push({ key: k, label: String(label || k).trim() || k });
    };
    for (const chip of packOptionRows(product, ov)) {
      const key =
        typeof window.dpCatalogPackImageKey === "function" ? window.dpCatalogPackImageKey(chip) : "";
      add(key, packLabelFromChip(chip, key));
    }
    const map = ov && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
    for (const key of Object.keys(map || {})) add(key, key);
    return out;
  }

  function activePackKey() {
    return String(document.getElementById("ap-cards-photo-pack")?.value || "").trim();
  }

  function activePreviewUrl() {
    const ov = currentOverride();
    const pack = activePackKey();
    if (pack) {
      const map = ov && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
      const url = map[pack];
      if (typeof url === "string" && url.trim()) return mediaAbs(url);
    }
    return mediaAbs(String(ov.cardImageUrl || ov.heroImageUrl || "").trim());
  }

  function activePreviewRawUrl() {
    const ov = currentOverride();
    const pack = activePackKey();
    if (pack) {
      const map = ov && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
      return String(map[pack] || "").trim();
    }
    return String(ov.cardImageUrl || ov.heroImageUrl || "").trim();
  }

  function togglePhotoEditor(on) {
    const wrap = document.getElementById("ap-cards-photo-editor");
    if (!wrap) return;
    wrap.hidden = !on;
    wrap.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function resetPhotoCropControls() {
    state.photoEdit.zoom = 1;
    state.photoEdit.offsetX = 0;
    state.photoEdit.offsetY = 0;
    const zoomEl = document.getElementById("ap-cards-photo-zoom");
    const xEl = document.getElementById("ap-cards-photo-offset-x");
    const yEl = document.getElementById("ap-cards-photo-offset-y");
    if (zoomEl) zoomEl.value = "1";
    if (xEl) xEl.value = "0";
    if (yEl) yEl.value = "0";
  }

  function drawPhotoEditorCanvas() {
    const cv = document.getElementById("ap-cards-photo-canvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = state.photoEdit.image;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!img) return;
    const scaleBase = Math.max(cv.width / img.width, cv.height / img.height);
    const zoom = Math.min(3, Math.max(0.35, Number(state.photoEdit.zoom) || 1));
    const scale = scaleBase * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const maxX = Math.max(0, (drawW - cv.width) / 2);
    const maxY = Math.max(0, (drawH - cv.height) / 2);
    const ox = (Number(state.photoEdit.offsetX) || 0) * maxX;
    const oy = (Number(state.photoEdit.offsetY) || 0) * maxY;
    const x = (cv.width - drawW) / 2 + ox;
    const y = (cv.height - drawH) / 2 + oy;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  async function loadImageFromDataUrl(dataUrl) {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось открыть изображение."));
      img.src = dataUrl;
    });
  }

  async function blobToDataUrl(blob) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Не удалось прочитать blob изображения."));
      fr.readAsDataURL(blob);
    });
  }

  async function startPhotoEditFromFile(file) {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    state.photoEdit.sourceDataUrl = dataUrl;
    state.photoEdit.image = img;
    resetPhotoCropControls();
    togglePhotoEditor(true);
    drawPhotoEditorCanvas();
  }

  function buildEditedPhotoDataUrl() {
    if (!state.photoEdit.image) return "";
    const cv = document.getElementById("ap-cards-photo-canvas");
    if (!cv) return "";
    drawPhotoEditorCanvas();
    return cv.toDataURL("image/jpeg", 0.92);
  }

  async function openCurrentPhotoInEditor() {
    const raw = activePreviewRawUrl();
    const candidates = previewUrlCandidates(raw);
    if (!candidates.length) {
      throw new Error("Для выбранной фасовки нет загруженного фото.");
    }
    let lastErr = null;
    for (const u of candidates) {
      try {
        const res = await fetch(u, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        const img = await loadImageFromDataUrl(dataUrl);
        state.photoEdit.sourceDataUrl = dataUrl;
        state.photoEdit.image = img;
        resetPhotoCropControls();
        togglePhotoEditor(true);
        drawPhotoEditorCanvas();
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`Не удалось открыть текущее фото (${lastErr?.message || "unknown error"}).`);
  }

  function renderPhotoPreview() {
    const img = document.getElementById("ap-cards-photo-preview");
    if (!img) return;
    const ov = currentOverride();
    const pack = activePackKey();
    const raw = (() => {
      if (pack) {
        const map = ov && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
        return String(map[pack] || "").trim();
      }
      return String(ov.cardImageUrl || ov.heroImageUrl || "").trim();
    })();
    const candidates = previewUrlCandidates(raw);
    if (!candidates.length) {
      img.removeAttribute("src");
      img.classList.remove("is-visible");
      setPhotoStatus(pack ? "Для выбранной фасовки фото не задано." : "Для карточки фото не задано.", null);
      return;
    }
    let idx = 0;
    img.onload = () => {
      setPhotoStatus("Превью фото загружено.", "ok");
    };
    img.onerror = () => {
      idx += 1;
      if (idx < candidates.length) {
        img.src = candidates[idx];
        return;
      }
      img.removeAttribute("src");
      img.classList.remove("is-visible");
      const tried = candidates.slice(0, 3).join(" | ");
      const base = typeof window.DP_API_BASE === "string" ? window.DP_API_BASE : "";
      setPhotoStatus(
        `Фото не открылось в превью. URL: ${raw || "—"}; tried: ${tried || "—"}; apiBase: ${base || "(same-origin)"}`,
        "err"
      );
    };
    img.src = candidates[idx];
    img.classList.add("is-visible");
  }

  function renderPackSelect() {
    const p = selectedProduct();
    const sel = document.getElementById("ap-cards-photo-pack");
    if (!sel) return;
    if (!p) {
      sel.innerHTML = `<option value="">Общее фото (по умолчанию)</option>`;
      return;
    }
    const ov = currentOverride();
    const current = String(sel.value || "").trim();
    const opts = packOptionsFor(p, ov);
    const map = ov && typeof ov.catalogPackImages === "object" ? ov.catalogPackImages : {};
    const html = opts
      .map((o) => `<option value="${o.key.replace(/"/g, "&quot;")}">${o.label}</option>`)
      .join("");
    sel.innerHTML = `<option value="">Общее фото (по умолчанию)</option>${html}`;
    if (current && opts.some((x) => x.key === current)) sel.value = current;
    else {
      const withImage = opts.find((x) => typeof map[x.key] === "string" && String(map[x.key]).trim());
      sel.value = withImage ? withImage.key : "";
    }
  }

  async function fileToDataUrl(file) {
    const fr = new FileReader();
    return await new Promise((resolve, reject) => {
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Не удалось прочитать файл."));
      fr.readAsDataURL(file);
    });
  }

  function hydrateEditor() {
    const p = selectedProduct();
    const meta = document.getElementById("ap-cards-selected-meta");
    const articleEl = document.getElementById("ap-cards-article");
    const title = document.getElementById("ap-cards-title");
    const subtitle = document.getElementById("ap-cards-subtitle");
    const desc = document.getElementById("ap-cards-description");
    const features = document.getElementById("ap-cards-features");
    const detailSpecRows = document.getElementById("ap-cards-detail-spec-rows");
    const detailCharacteristicsIntro = document.getElementById("ap-cards-detail-characteristics-intro");
    const detailApplication = document.getElementById("ap-cards-detail-application");
    const detailPrepBase = document.getElementById("ap-cards-detail-prep-base");
    const detailPrepProduct = document.getElementById("ap-cards-detail-prep-product");
    const detailPainting = document.getElementById("ap-cards-detail-painting");
    const detailTopBadges = document.getElementById("ap-cards-detail-top-badges");
    const detailExpertTips = document.getElementById("ap-cards-detail-expert-tips");
    const detailFiles = document.getElementById("ap-cards-detail-files");
    const rawJson = document.getElementById("ap-cards-override-json");
    if (
      !title ||
      !subtitle ||
      !desc ||
      !features ||
      !meta ||
      !articleEl ||
      !rawJson ||
      !detailSpecRows ||
      !detailCharacteristicsIntro ||
      !detailApplication ||
      !detailPrepBase ||
      !detailPrepProduct ||
      !detailPainting ||
      !detailTopBadges ||
      !detailExpertTips ||
      !detailFiles
    )
      return;

    if (!p) {
      meta.textContent = "Позиция не выбрана";
      articleEl.value = "";
      title.value = "";
      subtitle.value = "";
      desc.value = "";
      features.value = "";
      detailSpecRows.value = "";
      detailCharacteristicsIntro.value = "";
      detailApplication.value = "";
      detailPrepBase.value = "";
      detailPrepProduct.value = "";
      detailPainting.value = "";
      detailTopBadges.value = "";
      detailExpertTips.value = "";
      detailFiles.value = "";
      rawJson.value = "{}";
      state.photoEdit.sourceDataUrl = "";
      state.photoEdit.image = null;
      togglePhotoEditor(false);
      renderPackSelect();
      renderPhotoPreview();
      return;
    }

    const ov = state.overrides[String(p.id)] || {};
    const effective = effectiveCardData(p, ov);
    articleEl.value = articlePlain(p);
    meta.textContent = `Артикул / серия: ${articleUi(p)} | Наименование: ${String(p.name || "").trim() || "—"}`;
    title.value = effective.cardTitle;
    subtitle.value = effective.subtitle;
    desc.value = effective.description;
    features.value = effective.cardFeatures.join("\n");
    detailSpecRows.value = rowsToText(effective.detailSpecRows);
    detailCharacteristicsIntro.value = effective.detailCharacteristicsIntro;
    detailApplication.value = effective.detailApplication;
    detailPrepBase.value = effective.detailPrepBase.join("\n");
    detailPrepProduct.value = effective.detailPrepProduct.join("\n");
    detailPainting.value = effective.detailPainting.join("\n");
    detailTopBadges.value = effective.detailTopBadges.join("\n");
    detailExpertTips.value = tipsToText(effective.detailExpertTips);
    detailFiles.value = filesToText(effective.detailFiles);
    rawJson.value = JSON.stringify(effective.fullOverride, null, 2);
    renderPackSelect();
    renderPhotoPreview();
  }

  async function loadProducts() {
    const r = await fetch(apiUrl("/api/site/products"), { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    const list = Array.isArray(data?.products) ? data.products.slice() : [];
    if (typeof window.dpNormalizeCatalogProductsInPlace === "function") {
      window.dpNormalizeCatalogProductsInPlace(list);
    }
    if (typeof window.dpApplyNumericCodesToCatalogData === "function") {
      window.dpApplyNumericCodesToCatalogData(list);
    }
    state.products = sortProducts(list);
  }

  async function loadOverrides() {
    const data = await apiAdmin("GET", "/api/admin/site-content");
    state.overrides = data && typeof data.productOverrides === "object" ? data.productOverrides : {};
    window.DP_PRODUCT_OVERRIDES = state.overrides;
  }

  async function reloadAll(statusText = "Список обновлен.") {
    setStatus("Загрузка данных…", null);
    await loadOverrides();
    await loadProducts();
    applyFilter();
    setStatus(statusText, "ok");
  }

  async function saveSelected() {
    const p = selectedProduct();
    if (!p) {
      setStatus("Сначала выберите позицию из списка.", "err");
      return;
    }
    const rawJsonEl = document.getElementById("ap-cards-override-json");
    let advanced = {};
    if (rawJsonEl) {
      const src = String(rawJsonEl.value || "").trim();
      if (src) {
        try {
          const parsed = JSON.parse(src);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            setStatus("Расширенный override должен быть JSON-объектом.", "err");
            return;
          }
          advanced = parsed;
        } catch {
          setStatus("Ошибка JSON в поле «Расширенный override». Проверьте формат.", "err");
          return;
        }
      }
    }
    const specRowsText = String(document.getElementById("ap-cards-detail-spec-rows")?.value || "");
    const expertTipsText = String(document.getElementById("ap-cards-detail-expert-tips")?.value || "");
    const filesText = String(document.getElementById("ap-cards-detail-files")?.value || "");
    const specRowsParsed = rowsFromText(specRowsText);
    const expertTipsParsed = tipsFromText(expertTipsText);
    const filesParsed = filesFromText(filesText);
    if (specRowsParsed.invalid.length) {
      setStatus(
        `Ошибка в «Таблица характеристик»: строки ${specRowsParsed.invalid.join(", ")}. Формат: Название | Значение`,
        "err"
      );
      document.getElementById("ap-cards-detail-spec-rows")?.focus();
      return;
    }
    if (expertTipsParsed.invalid.length) {
      setStatus(
        `Ошибка в «Советы эксперта»: строки ${expertTipsParsed.invalid.join(", ")}. Формат: Заголовок | URL | Источник`,
        "err"
      );
      document.getElementById("ap-cards-detail-expert-tips")?.focus();
      return;
    }
    if (filesParsed.invalid.length) {
      setStatus(
        `Ошибка в «Файлы/документы»: строки ${filesParsed.invalid.join(", ")}. Формат: Название | Ссылка | Размер/тип`,
        "err"
      );
      document.getElementById("ap-cards-detail-files")?.focus();
      return;
    }
    const payload = {
      ...advanced,
      cardTitle: String(document.getElementById("ap-cards-title")?.value || "").trim(),
      subtitle: String(document.getElementById("ap-cards-subtitle")?.value || "").trim(),
      description: String(document.getElementById("ap-cards-description")?.value || "").trim(),
      cardFeatures: String(document.getElementById("ap-cards-features")?.value || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6),
      detailSpecRows: specRowsParsed.items,
      detailCharacteristicsIntro: String(document.getElementById("ap-cards-detail-characteristics-intro")?.value || "").trim(),
      detailApplication: String(document.getElementById("ap-cards-detail-application")?.value || "").trim(),
      detailPrepBase: linesFromTextarea(String(document.getElementById("ap-cards-detail-prep-base")?.value || ""), 40),
      detailPrepProduct: linesFromTextarea(String(document.getElementById("ap-cards-detail-prep-product")?.value || ""), 40),
      detailPainting: linesFromTextarea(String(document.getElementById("ap-cards-detail-painting")?.value || ""), 40),
      detailTopBadges: linesFromTextarea(String(document.getElementById("ap-cards-detail-top-badges")?.value || ""), 12),
      detailExpertTips: expertTipsParsed.items,
      detailFiles: filesParsed.items,
    };
    setStatus("Сохранение…", null);
    try {
      const data = await apiAdmin("PATCH", "/api/admin/site-content", {
        productOverrides: { [String(p.id)]: payload },
      });
      state.overrides = data && typeof data.productOverrides === "object" ? data.productOverrides : state.overrides;
      window.DP_PRODUCT_OVERRIDES = state.overrides;
      hydrateEditor();
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-editor" } }));
      setStatus("Карточка сохранена и обновлена для сайта.", "ok");
    } catch (e) {
      setStatus(e.message || String(e), "err");
    }
  }

  async function savePhoto() {
    const p = selectedProduct();
    if (!p) {
      setPhotoStatus("Сначала выберите позицию.", "err");
      return;
    }
    const fileEl = document.getElementById("ap-cards-photo-file");
    const f = fileEl?.files?.[0];
    if (!f && !state.photoEdit.image) {
      setPhotoStatus("Выберите файл или нажмите «Редактировать текущее фото».", "err");
      return;
    }
    setPhotoStatus("Загрузка фото…", null);
    try {
      const imageBase64 = state.photoEdit.image ? buildEditedPhotoDataUrl() : await fileToDataUrl(f);
      const pack = activePackKey();
      const data = await apiAdmin("POST", `/api/admin/products/${encodeURIComponent(String(p.id))}/image`, {
        imageBase64,
        ...(pack ? { catalogPackKey: pack } : {}),
      });
      if (data && typeof data.override === "object") {
        state.overrides[String(p.id)] = data.override;
      } else {
        await loadOverrides();
      }
      if (fileEl) fileEl.value = "";
      state.photoEdit.sourceDataUrl = "";
      state.photoEdit.image = null;
      togglePhotoEditor(false);
      renderPackSelect();
      renderPhotoPreview();
      setPhotoStatus(
        pack
          ? `Фото фасовки «${pack}» сохранено. URL: ${String(data?.imageUrl || "").trim() || "—"}`
          : `Общее фото сохранено. URL: ${String(data?.imageUrl || "").trim() || "—"}`,
        "ok"
      );
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-photo-save" } }));
    } catch (e) {
      setPhotoStatus(`Ошибка сохранения фото: ${e.message || String(e)}`, "err");
    }
  }

  async function deletePhoto() {
    const p = selectedProduct();
    if (!p) {
      setPhotoStatus("Сначала выберите позицию.", "err");
      return;
    }
    const pack = activePackKey();
    if (!pack) {
      setPhotoStatus("Выберите конкретную фасовку в списке, чтобы удалить только ее фото.", "err");
      return;
    }
    const msg = `Удалить фото только для фасовки «${pack}»?`;
    if (!window.confirm(msg)) return;
    setPhotoStatus("Удаление фото…", null);
    try {
      const path = `/api/admin/products/${encodeURIComponent(String(p.id))}/image?catalogPackKey=${encodeURIComponent(pack)}`;
      const data = await apiAdmin("DELETE", path);
      if (data && typeof data.override === "object") {
        state.overrides[String(p.id)] = data.override;
      } else {
        await loadOverrides();
      }
      renderPackSelect();
      renderPhotoPreview();
      setPhotoStatus(`Фото фасовки «${pack}» удалено.`, "ok");
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-photo-delete" } }));
    } catch (e) {
      setPhotoStatus(e.message || String(e), "err");
    }
  }

  async function deleteCommonPhoto() {
    const p = selectedProduct();
    if (!p) {
      setPhotoStatus("Сначала выберите позицию.", "err");
      return;
    }
    if (!window.confirm("Удалить общее фото карточки? Фото фасовок останутся без изменений.")) return;
    setPhotoStatus("Удаление общего фото…", null);
    try {
      const path = `/api/admin/products/${encodeURIComponent(String(p.id))}/image`;
      const data = await apiAdmin("DELETE", path);
      if (data && typeof data.override === "object") {
        state.overrides[String(p.id)] = data.override;
      } else {
        await loadOverrides();
      }
      renderPackSelect();
      renderPhotoPreview();
      setPhotoStatus("Общее фото удалено.", "ok");
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-photo-delete-common" } }));
    } catch (e) {
      setPhotoStatus(e.message || String(e), "err");
    }
  }

  function bind() {
    document.getElementById("ap-cards-reload")?.addEventListener("click", () => void reloadAll("Список перечитан с сервера."));
    document.getElementById("ap-cards-search")?.addEventListener("input", () => applyFilter());
    document.getElementById("ap-cards-select")?.addEventListener("change", (e) => {
      state.selectedId = String(e.target.value || "");
      hydrateEditor();
    });
    document.getElementById("ap-cards-save")?.addEventListener("click", () => void saveSelected());
    document.getElementById("ap-cards-photo-save")?.addEventListener("click", () => void savePhoto());
    document.getElementById("ap-cards-photo-delete")?.addEventListener("click", () => void deletePhoto());
    document.getElementById("ap-cards-photo-delete-common")?.addEventListener("click", () => void deleteCommonPhoto());
    document.getElementById("ap-cards-photo-pack")?.addEventListener("change", () => {
      renderPhotoPreview();
      setPhotoStatus("", null);
    });
    document.getElementById("ap-cards-photo-file")?.addEventListener("change", async (e) => {
      const f = e.target?.files?.[0];
      if (!f) {
        state.photoEdit.sourceDataUrl = "";
        state.photoEdit.image = null;
        togglePhotoEditor(false);
        return;
      }
      try {
        await startPhotoEditFromFile(f);
        setPhotoStatus("Фото готово к обрезке: настройте кадр и сохраните.", "ok");
      } catch (err) {
        state.photoEdit.sourceDataUrl = "";
        state.photoEdit.image = null;
        togglePhotoEditor(false);
        setPhotoStatus(err?.message || "Не удалось подготовить фото.", "err");
      }
    });
    document.getElementById("ap-cards-photo-edit-current")?.addEventListener("click", async () => {
      try {
        await openCurrentPhotoInEditor();
        setPhotoStatus("Текущее фото открыто в редакторе кадра.", "ok");
      } catch (e) {
        setPhotoStatus(e?.message || "Не удалось открыть текущее фото.", "err");
      }
    });
    document.getElementById("ap-cards-photo-zoom")?.addEventListener("input", (e) => {
      state.photoEdit.zoom = Number(e.target.value || 1);
      drawPhotoEditorCanvas();
    });
    document.getElementById("ap-cards-photo-offset-x")?.addEventListener("input", (e) => {
      state.photoEdit.offsetX = Number(e.target.value || 0);
      drawPhotoEditorCanvas();
    });
    document.getElementById("ap-cards-photo-offset-y")?.addEventListener("input", (e) => {
      state.photoEdit.offsetY = Number(e.target.value || 0);
      drawPhotoEditorCanvas();
    });
    document.getElementById("ap-cards-photo-reset-crop")?.addEventListener("click", () => {
      resetPhotoCropControls();
      drawPhotoEditorCanvas();
      setPhotoStatus("Кадр сброшен по центру.", null);
    });

    window.addEventListener("dp-catalog-updated", () => {
      if ((location.hash || "").replace(/^#/, "").toLowerCase() === "product-cards") {
        void reloadAll("Список обновлен после изменений каталога.");
      }
    });
    window.addEventListener("hashchange", () => {
      if ((location.hash || "").replace(/^#/, "").toLowerCase() === "product-cards") {
        void reloadAll("Данные раздела обновлены.");
      }
    });
  }

  async function boot() {
    bind();
    if ((location.hash || "").replace(/^#/, "").toLowerCase() === "product-cards") {
      try {
        await reloadAll("Раздел готов к редактированию.");
      } catch (e) {
        setStatus(e.message || String(e), "err");
      }
    }
  }

  void boot();
})();
