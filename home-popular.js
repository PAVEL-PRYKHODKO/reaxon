(function () {
  const PICK_COUNT = 4;

  function esc(v) {
    if (typeof escapeHtml === "function") return escapeHtml(String(v ?? ""));
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tk(key) {
    return typeof t === "function" ? t(key) : key;
  }

  function getCatalogProducts() {
    if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS) && PRODUCTS.length) {
      return PRODUCTS;
    }
    return [];
  }

  function randomPick(arr, n) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t0 = copy[i];
      copy[i] = copy[j];
      copy[j] = t0;
    }
    return copy.slice(0, Math.min(n, copy.length));
  }

  function cartMode() {
    return typeof state !== "undefined" && state && state.customerType === "wholesale" ? "wholesale" : "retail";
  }

  /** Одна кнопка «В корзину»: приоритет ведро с ценой, иначе барабан, иначе что есть. */
  function preferredPackType(p) {
    const mode = cartMode();
    const hasB = p.bucketKg != null;
    const hasD = p.drumKg != null;
    const bTotal =
      hasB && typeof calcPackTotal === "function" ? calcPackTotal(p, "bucket", mode) : null;
    const dTotal = hasD && typeof calcPackTotal === "function" ? calcPackTotal(p, "drum", mode) : null;
    if (hasB && bTotal != null) return "bucket";
    if (hasD && dTotal != null) return "drum";
    if (hasB) return "bucket";
    if (hasD) return "drum";
    return null;
  }

  function renderCard(p) {
    const img =
      typeof productImageDataUri === "function" ? productImageDataUri(p) : "assets/product-template.png";

    const title = `${p.typeWord || ""} ${p.series || ""}`.trim() || String(p.name || p.code || "Товар");
    const alt = `${p.typeWord || ""} ${p.series || ""}`.trim() || title;
    const detailHref = `product.html?id=${encodeURIComponent(String(p.id || ""))}`;

    const pack = preferredPackType(p);
    const canAdd = pack != null && typeof addToCart === "function";
    const cartBtn = canAdd
      ? `<button type="button" class="mini-btn mini-btn-red" data-home-add-to-cart="${esc(String(p.id))}" data-home-pack="${esc(pack)}">${esc(tk("homePopularAddCart"))}</button>`
      : `<button type="button" class="mini-btn mini-btn-red" disabled>${esc(tk("homePopularAddCart"))}</button>`;

    return `
      <article class="product-card">
        <a class="product-card-media-link" href="${esc(detailHref)}" aria-label="${esc(alt)} — открыть в каталоге">
          <div class="product-image">
            <img src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/product-template.png';" />
          </div>
        </a>
        <div class="product-body">
          <h3><a href="${esc(detailHref)}">${esc(title)}</a></h3>
          <div class="product-actions">
            ${cartBtn}
            <a href="${detailHref}" class="mini-btn mini-btn-dark">${esc(tk("moreButton"))}</a>
          </div>
        </div>
      </article>
    `;
  }

  function render() {
    const root = document.getElementById("home-popular-products");
    if (!root) return;

    const all = getCatalogProducts().filter((p) => p && p.id);
    const list = randomPick(all, PICK_COUNT);

    if (!list.length) {
      root.innerHTML = `<p class="home-fallback">Нет данных по товарам.</p>`;
      return;
    }

    root.innerHTML = list.map(renderCard).join("");
  }

  window.__renderHomePopular = render;

  function bindCartClicks(root) {
    if (!root || root.dataset.homePopularCartBound === "1") return;
    root.dataset.homePopularCartBound = "1";
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-home-add-to-cart]");
      if (!btn || btn.disabled) return;
      const id = btn.getAttribute("data-home-add-to-cart");
      const pack = btn.getAttribute("data-home-pack");
      if (!id || !pack || typeof addToCart !== "function") return;
      addToCart(id, pack);
    });
  }

  async function boot() {
    const root = document.getElementById("home-popular-products");
    if (!root) return;
    bindCartClicks(root);
    if (window.dpSiteReady && typeof window.dpSiteReady.then === "function") {
      try {
        await window.dpSiteReady;
      } catch {
        /* офлайн */
      }
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
