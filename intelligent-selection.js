(function initIntelligentSelectionPage() {
  const page = String(document.body?.dataset?.page || "");
  if (page !== "intelligent-selection") return;

  const form = document.getElementById("ai-selection-form");
  const queryInput = document.getElementById("ai-selection-query");
  const submitBtn = document.getElementById("ai-selection-submit");
  const statusEl = document.getElementById("ai-selection-status");
  const resultsEl = document.getElementById("ai-selection-results");
  if (!form || !queryInput || !submitBtn || !statusEl || !resultsEl) return;

  function initRevealAnimation() {
    const items = Array.from(document.querySelectorAll(".ai-reveal"));
    if (!items.length) return;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-visible");
          obs.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    items.forEach((el) => observer.observe(el));
  }

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

  function esc(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function productImage(product) {
    const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product?.id || "")] || {};
    const raw = String(ov.cardImageUrl || ov.heroImageUrl || "").trim();
    if (raw) {
      return typeof window.dpResolveMediaUrl === "function" ? window.dpResolveMediaUrl(raw) || raw : raw;
    }
    return "images/placeholder.svg";
  }

  function fmtMoney(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return "—";
    if (typeof window.formatMoney === "function") return window.formatMoney(x);
    return `${Math.round(x)} грн`;
  }

  function productPackChips(product) {
    const ov = (window.DP_PRODUCT_OVERRIDES || {})[String(product?.id || "")] || {};
    let chips = [];
    if (typeof window.dpApplyDetailPackChips === "function") {
      chips = window.dpApplyDetailPackChips(product, ov) || [];
    } else if (typeof window.dpBuildPackChipsRaw === "function") {
      chips = window.dpBuildPackChipsRaw(product) || [];
    }
    return Array.isArray(chips) ? chips : [];
  }

  function renderRows(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      resultsEl.innerHTML = "";
      return;
    }
    const pool = Array.isArray(window.PRODUCTS_DATA) ? window.PRODUCTS_DATA : [];
    const byId = new Map(pool.map((p) => [String(p?.id || ""), p]));
    const html = rows
      .map((row) => {
        const id = String(row?.id || "");
        const product = byId.get(id);
        if (!product) return "";
        const name = String(product?.name || "Без названия");
        const code = String(product?.code || "—");
        const img = productImage(product);
        const chips = productPackChips(product);
        const chipsHtml = chips.length
          ? chips
              .slice(0, 8)
              .map((c) => {
                const label = String(c?.label || c?.sub || "Фасовка");
                const price = fmtMoney(c?.price);
                return `<span class="catalog-pack-chip${c?.disabled ? "" : " is-selected"}" style="pointer-events:none">${esc(
                  label
                )} · ${esc(price)}</span>`;
              })
              .join("")
          : '<span class="catalog-placeholder">Уточняйте фасовку</span>';
        const retail = fmtMoney(product?.priceNdsPerKg);
        const noNds = fmtMoney(product?.priceNoNdsPerKg);
        return `
          <article class="catalog-row" data-product-id="${esc(id)}">
            <a class="catalog-row-media-link" href="product.html?id=${encodeURIComponent(id)}" aria-label="Открыть ${esc(name)}">
              <div class="catalog-row-media" style="background-image:url('${esc(img)}');"></div>
            </a>
            <div class="catalog-row-body">
              <h3><a href="product.html?id=${encodeURIComponent(id)}">${esc(name)}</a></h3>
              <p class="catalog-row-code">Артикул: ${esc(code)}</p>
              <div class="catalog-pack-chips">${chipsHtml}</div>
            </div>
            <div class="catalog-row-actions">
              <div class="catalog-row-price-box">
                <div class="catalog-row-price-label">Розница (с НДС)</div>
                <div class="catalog-row-price">${esc(retail)}</div>
                <div class="catalog-row-price-label">Без НДС</div>
                <div class="catalog-row-price">${esc(noNds)}</div>
              </div>
              <div class="ai-selection-item-links">
                <a class="btn btn-ghost" href="products.html?id=${encodeURIComponent(id)}">В каталоге</a>
                <a class="btn btn-primary" href="product.html?id=${encodeURIComponent(id)}">Карточка</a>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
    resultsEl.innerHTML = `<div class="products-popular-grid catalog-grid--list">${html}</div>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = String(queryInput.value || "").trim();
    if (query.length < 3) {
      statusEl.textContent = "Введите запрос минимум из 3 символов.";
      return;
    }

    submitBtn.setAttribute("disabled", "disabled");
    statusEl.textContent = "ИИ анализирует запрос...";
    resultsEl.innerHTML = "";

    try {
      const { resp, data } = await postAiSearch({ query, strictAi: true });
      if (!resp.ok || !data || data.error) {
        statusEl.textContent = String(data?.message || "Не удалось выполнить подбор.");
        renderRows([]);
        return;
      }
      if (data.provider !== "google-gemini") {
        statusEl.textContent = "Показ результатов доступен только после обработки запроса ИИ.";
        renderRows([]);
        return;
      }
      const rows = Array.isArray(data.products) ? data.products : [];
      statusEl.textContent = rows.length
        ? `Подобрано ${rows.length} позиций (Google AI).`
        : "Подходящие позиции не найдены (Google AI).";
      renderRows(rows);
    } catch {
      const fileMode = window.location.protocol === "file:";
      statusEl.textContent = fileMode
        ? "API недоступен в режиме file://. Откройте сайт через http://localhost:3000."
        : "Ошибка сети при выполнении AI-подбора.";
      renderRows([]);
    } finally {
      submitBtn.removeAttribute("disabled");
    }
  });

  initRevealAnimation();
})();
