(function () {
  const STORAGE_KEY = "dp_api_base";

  function trimBase(s) {
    return String(s || "").trim().replace(/\/+$/, "");
  }

  function resolvePathPrefix() {
    try {
      const explicitPrefix = document.querySelector('meta[name="dp-api-prefix"]')?.getAttribute("content");
      const cleanExplicit = String(explicitPrefix || "").trim();
      if (cleanExplicit) {
        return `/${cleanExplicit.replace(/^\/+|\/+$/g, "")}`;
      }
      const p = String(location.pathname || "/");
      const slash = p.lastIndexOf("/");
      const dir = slash >= 0 ? p.slice(0, slash + 1) : "/";
      const normalized = dir.replace(/\/{2,}/g, "/");
      return normalized === "/" ? "" : normalized.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function compute() {
    if (typeof window.DP_API_BASE_OVERRIDE === "string" && trimBase(window.DP_API_BASE_OVERRIDE)) {
      return trimBase(window.DP_API_BASE_OVERRIDE);
    }
    const meta = document.querySelector('meta[name="dp-api-base"]')?.getAttribute("content");
    if (trimBase(meta)) return trimBase(meta);
    if (location.protocol === "file:") {
      // При открытии HTML с диска всегда используем локальный API.
      // Это исключает случай, когда в localStorage остался старый "last good"
      // base от другого окружения и логин уходит не в текущий backend.
      return "http://localhost:3000";
    }
    const apiPort = document.querySelector('meta[name="dp-api-port"]')?.getAttribute("content") || "3000";
    const host = location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal && location.port && String(location.port) !== String(apiPort)) {
      return `${location.protocol}//${host}:${apiPort}`;
    }
    const prefix = resolvePathPrefix();
    return `${location.origin}${prefix}`;
  }

  const base = compute();
  try {
    if (base) localStorage.setItem(STORAGE_KEY, base);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}

  window.DP_API_BASE = base;

  window.dpApiUrl = function (path) {
    if (/^https?:\/\//i.test(String(path || ""))) return String(path);
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!window.DP_API_BASE) return p;
    return `${window.DP_API_BASE}${p}`;
  };
})();
