(() => {
  const token = localStorage.getItem("authToken") || "";
  const root = document.getElementById("ap-cards-editor-root");
  if (!token || !root) return;

  const state = {
    products: [],
    filtered: [],
    overrides: {},
    selectedId: "",
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
    if (typeof window.dpResolveMediaUrl === "function") {
      const r = window.dpResolveMediaUrl(s);
      if (r) return r;
    }
    return s;
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

  function renderPhotoPreview() {
    const img = document.getElementById("ap-cards-photo-preview");
    if (!img) return;
    const url = activePreviewUrl();
    if (!url) {
      img.removeAttribute("src");
      img.classList.remove("is-visible");
      return;
    }
    img.src = url;
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
    const html = opts
      .map((o) => `<option value="${o.key.replace(/"/g, "&quot;")}">${o.label}</option>`)
      .join("");
    sel.innerHTML = `<option value="">Общее фото (по умолчанию)</option>${html}`;
    if (current && opts.some((x) => x.key === current)) sel.value = current;
    else sel.value = "";
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
    if (!title || !subtitle || !desc || !features || !meta || !articleEl) return;

    if (!p) {
      meta.textContent = "Позиция не выбрана";
      articleEl.value = "";
      title.value = "";
      subtitle.value = "";
      desc.value = "";
      features.value = "";
      return;
    }

    const ov = state.overrides[String(p.id)] || {};
    articleEl.value = articlePlain(p);
    meta.textContent = `Артикул / серия: ${articleUi(p)} | Наименование: ${String(p.name || "").trim() || "—"}`;
    title.value = String(ov.cardTitle || p.name || "");
    subtitle.value = String(ov.subtitle || "");
    desc.value = String(ov.description || "");
    const feats = Array.isArray(ov.cardFeatures) ? ov.cardFeatures.map((x) => String(x).trim()).filter(Boolean) : [];
    features.value = feats.join("\n");
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
    const payload = {
      cardTitle: String(document.getElementById("ap-cards-title")?.value || "").trim(),
      subtitle: String(document.getElementById("ap-cards-subtitle")?.value || "").trim(),
      description: String(document.getElementById("ap-cards-description")?.value || "").trim(),
      cardFeatures: String(document.getElementById("ap-cards-features")?.value || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6),
    };
    setStatus("Сохранение…", null);
    try {
      const data = await apiAdmin("PATCH", "/api/admin/site-content", {
        productOverrides: { [String(p.id)]: payload },
      });
      state.overrides = data && typeof data.productOverrides === "object" ? data.productOverrides : state.overrides;
      window.DP_PRODUCT_OVERRIDES = state.overrides;
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-editor" } }));
      setStatus("Карточка сохранена.", "ok");
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
    const f = document.getElementById("ap-cards-photo-file")?.files?.[0];
    if (!f) {
      setPhotoStatus("Выберите файл изображения.", "err");
      return;
    }
    setPhotoStatus("Загрузка фото…", null);
    try {
      const imageBase64 = await fileToDataUrl(f);
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
      const fileEl = document.getElementById("ap-cards-photo-file");
      if (fileEl) fileEl.value = "";
      renderPackSelect();
      renderPhotoPreview();
      setPhotoStatus(pack ? `Фото фасовки «${pack}» сохранено.` : "Общее фото сохранено.", "ok");
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-photo-save" } }));
    } catch (e) {
      setPhotoStatus(e.message || String(e), "err");
    }
  }

  async function deletePhoto() {
    const p = selectedProduct();
    if (!p) {
      setPhotoStatus("Сначала выберите позицию.", "err");
      return;
    }
    const pack = activePackKey();
    const msg = pack
      ? `Удалить фото только для фасовки «${pack}»?`
      : "Удалить общее фото карточки?";
    if (!window.confirm(msg)) return;
    setPhotoStatus("Удаление фото…", null);
    try {
      const path = pack
        ? `/api/admin/products/${encodeURIComponent(String(p.id))}/image?catalogPackKey=${encodeURIComponent(pack)}`
        : `/api/admin/products/${encodeURIComponent(String(p.id))}/image`;
      const data = await apiAdmin("DELETE", path);
      if (data && typeof data.override === "object") {
        state.overrides[String(p.id)] = data.override;
      } else {
        await loadOverrides();
      }
      renderPackSelect();
      renderPhotoPreview();
      setPhotoStatus(pack ? `Фото фасовки «${pack}» удалено.` : "Общее фото удалено.", "ok");
      window.dispatchEvent(new CustomEvent("dp-catalog-updated", { detail: { source: "product-cards-photo-delete" } }));
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
    document.getElementById("ap-cards-photo-pack")?.addEventListener("change", () => {
      renderPhotoPreview();
      setPhotoStatus("", null);
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
