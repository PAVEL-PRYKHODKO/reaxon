(function () {
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
            <a href="auth.html?next=admin-panel.html" style="padding:9px 13px;border-radius:9px;background:#1d4ed8;color:#fff;text-decoration:none">Войти</a>
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

  async function resolveUser() {
    const token = getToken();
    const cached = parseUser();
    if (!token) return cached;
    try {
      const meUrl = typeof window.dpApiUrl === "function" ? window.dpApiUrl("/api/auth/me") : "/api/auth/me";
      const res = await fetch(meUrl, {
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
    const url = window.dpApiUrl(`/api/admin/runtime-script/${encodeURIComponent(name)}`);
    const res = await fetch(url, {
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
