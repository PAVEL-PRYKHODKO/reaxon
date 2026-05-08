(function () {
  const API_BASE_KEY = "dp_api_base";
  const API_LAST_GOOD_KEY = "dp_api_last_good_base";

  function getToken() {
    return localStorage.getItem("authToken") || "";
  }

  function renderAccessMessage(text) {
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
        <section style="max-width:640px;width:100%;background:#111827;border:1px solid #334155;border-radius:14px;padding:22px">
          <h1 style="margin:0 0 10px;font-size:20px">Доступ в админ-панель</h1>
          <p style="margin:0 0 14px;color:#94a3b8;line-height:1.45">${text}</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="auth.html?next=admin.html" style="padding:9px 13px;border-radius:9px;background:#1d4ed8;color:#fff;text-decoration:none">Войти</a>
            <a href="index.html" style="padding:9px 13px;border-radius:9px;border:1px solid #475569;color:#e2e8f0;text-decoration:none">На главную</a>
          </div>
        </section>
      </main>
    `;
  }
  function parseUser() {
    try {
      return JSON.parse(localStorage.getItem("authUser") || "{}");
    } catch {
      return {};
    }
  }

  function trimBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function uniqueBases(list) {
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      const base = trimBase(raw);
      const key = base || "__root__";
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(base);
    }
    return out;
  }

  function resolveApiBases() {
    let storedBase = "";
    let lastGood = "";
    try {
      storedBase = trimBase(localStorage.getItem(API_BASE_KEY));
      lastGood = trimBase(localStorage.getItem(API_LAST_GOOD_KEY));
    } catch {
      /* ignore */
    }
    const configured = trimBase(window.DP_API_BASE);
    const rawOrigin = String(location.origin || "").trim();
    const origin = rawOrigin === "null" ? "" : trimBase(rawOrigin);
    const dir = String(location.pathname || "/").replace(/\/[^/]*$/, "");
    const withDir = dir && dir !== "/" ? `${origin}${dir}` : origin;
    const localFallbacks =
      location.protocol === "file:" ? ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"] : [];
    return uniqueBases([configured, lastGood, storedBase, ...localFallbacks, withDir, origin, ""]);
  }

  function makeUrl(base, path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return base ? `${base}${p}` : p;
  }

  async function ensureHttpAdminEntry() {
    if (location.protocol !== "file:") return false;
    const candidates = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"];
    for (const base of candidates) {
      try {
        const resp = await fetch(`${base}/api/auth/me`, { method: "GET", cache: "no-store" });
        if (!resp || (resp.status !== 401 && !resp.ok)) continue;
        try {
          localStorage.setItem(API_BASE_KEY, base);
          localStorage.setItem(API_LAST_GOOD_KEY, base);
        } catch {
          /* ignore */
        }
        const next = `${base}/admin.html${location.search || ""}${location.hash || ""}`;
        location.replace(next);
        return true;
      } catch {
        /* try next candidate */
      }
    }
    return false;
  }

  async function fetchWithApiBaseFallback(path, init) {
    const bases = resolveApiBases();
    let lastError = null;
    let lastResponse = null;
    for (const base of bases) {
      try {
        const response = await fetch(makeUrl(base, path), init);
        if (response.ok) {
          const normalized = trimBase(base);
          if (normalized) {
            window.DP_API_BASE = normalized;
            try {
              localStorage.setItem(API_BASE_KEY, normalized);
              localStorage.setItem(API_LAST_GOOD_KEY, normalized);
            } catch {
              /* ignore */
            }
          }
          return response;
        }
        // Auth and rate-limit errors are terminal and should not trigger base switching.
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          return response;
        }
        lastResponse = response;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error("api_unreachable");
  }

  async function resolveUser() {
    const token = getToken();
    const cached = parseUser();
    if (!token) return cached;
    try {
      const res = await fetchWithApiBaseFallback("/api/auth/me", {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return cached;
      const user = await res.json();
      if (user && typeof user === "object") {
        localStorage.setItem("authUser", JSON.stringify(user));
        return user;
      }
      return cached;
    } catch {
      return cached;
    }
  }

  const names = ["admin-panel.js", "admin-product-cards.js"];

  async function fetchRuntimeScript(name) {
    const token = getToken();
    const res = await fetchWithApiBaseFallback(`/api/admin/runtime-script/${encodeURIComponent(name)}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const err = new Error(`Не удалось загрузить ${name}: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  }

  async function loadProtectedScript(name) {
    let code = "";
    try {
      code = await fetchRuntimeScript(name);
    } catch (e) {
      const st = Number(e?.status || 0);
      const retryable = st === 0 || st >= 500;
      if (retryable) {
        await new Promise((r) => setTimeout(r, 250));
        code = await fetchRuntimeScript(name);
      } else {
        throw e;
      }
    }
    const blob = new Blob([code], { type: "text/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = objectUrl;
    script.defer = true;
    document.body.appendChild(script);
    script.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
    script.addEventListener("error", () => URL.revokeObjectURL(objectUrl), { once: true });
  }

  (async () => {
    try {
      const redirected = await ensureHttpAdminEntry();
      if (redirected) return;
      const token = getToken();
      if (!token) {
        renderAccessMessage("Сессия не найдена. Войдите под администратором.");
        return;
      }
      const authUser = await resolveUser();
      if (String(authUser?.role || "").trim().toLowerCase() !== "admin") {
        renderAccessMessage("Текущий аккаунт не имеет роли администратора.");
        return;
      }
      for (const name of names) {
        await loadProtectedScript(name);
      }
    } catch (err) {
      console.error(err);
      const st = Number(err?.status || 0);
      if (st === 401) {
        try {
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
        } catch {
          /* ignore */
        }
        renderAccessMessage("Сессия устарела. Войдите повторно под администратором.");
        return;
      }
      if (st === 403) {
        renderAccessMessage("У текущего аккаунта нет прав администратора.");
        return;
      }
      if (st === 429) {
        renderAccessMessage("Слишком много запросов к админ-модулям. Подождите минуту и обновите страницу.");
        return;
      }
      renderAccessMessage("Не удалось загрузить админ-модули. Обновите страницу или войдите повторно.");
    }
  })();
})();
