(function () {
  const statusEl = document.getElementById("admin-launcher-status");
  const API_BASE_KEY = "dp_api_base";
  const API_LAST_GOOD_KEY = "dp_api_last_good_base";

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function trimBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function unique(items) {
    const out = [];
    const seen = new Set();
    for (const raw of items) {
      const v = trimBase(raw);
      const key = v || "__root__";
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }

  function readStorage(key) {
    try {
      return trimBase(localStorage.getItem(key));
    } catch {
      return "";
    }
  }

  function candidates() {
    const stored = readStorage(API_BASE_KEY);
    const lastGood = readStorage(API_LAST_GOOD_KEY);
    const configured = trimBase(window.DP_API_BASE);
    const rawOrigin = String(location.origin || "").trim();
    const origin = rawOrigin === "null" ? "" : trimBase(rawOrigin);
    const local = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"];
    return unique([configured, lastGood, stored, ...local, origin, ""]);
  }

  function apiUrl(base, path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return base ? `${base}${p}` : p;
  }

  function saveGoodBase(base) {
    const v = trimBase(base);
    if (!v) return;
    try {
      localStorage.setItem(API_BASE_KEY, v);
      localStorage.setItem(API_LAST_GOOD_KEY, v);
    } catch {
      /* ignore */
    }
  }

  async function probe(base) {
    try {
      const res = await fetch(apiUrl(base, "/api/auth/me"), { method: "GET", cache: "no-store" });
      if (res.ok || res.status === 401 || res.status === 403) return true;
      return false;
    } catch {
      return false;
    }
  }

  async function run() {
    setStatus("Проверяем доступность API...");
    const list = candidates();
    for (const base of list) {
      const ok = await probe(base);
      if (!ok) continue;
      saveGoodBase(base);
      const target = base ? `${base}/admin-panel.html` : "admin-panel.html";
      const query = location.search || "";
      const hash = location.hash || "";
      setStatus("Открываем админ-панель...");
      location.replace(`${target}${query}${hash}`);
      return;
    }
    setStatus("API недоступен. Запустите сервер (`npm start`) и повторите вход.");
  }

  run();
})();
