(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function parseUser() {
    try {
      return JSON.parse(localStorage.getItem("authUser") || "null");
    } catch {
      return null;
    }
  }

  function setButtonsState(user) {
    const trigger = byId("home-account-trigger");
    const adminBtn = byId("home-admin-btn");

    const hasToken = Boolean(localStorage.getItem("authToken"));
    const isLogged = Boolean(hasToken && user && (user.email || user.id));
    const role = String(user?.role || "").toLowerCase();
    const isAdmin = isLogged && role === "admin";

    if (trigger) {
      if (isLogged) {
        trigger.setAttribute("href", "account.html");
        trigger.setAttribute("aria-label", "Личный кабинет и профиль");
      } else {
        trigger.setAttribute("href", "auth.html");
        trigger.setAttribute("aria-label", "Вход и регистрация");
      }
    }

    if (adminBtn) {
      adminBtn.hidden = !isAdmin;
      if (isAdmin) adminBtn.setAttribute("href", "admin.html");
    }
  }

  async function fetchMeIfNeeded() {
    const token = localStorage.getItem("authToken");
    if (!token) return null;
    const cached = parseUser();
    try {
      const url = typeof window.dpApiUrl === "function" ? window.dpApiUrl("/api/auth/me") : "/api/auth/me";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return cached;
      const user = await res.json();
      localStorage.setItem("authUser", JSON.stringify(user));
      return user;
    } catch {
      return cached;
    }
  }

  async function init() {
    const user = await fetchMeIfNeeded();
    const activeUser = user || parseUser();
    setButtonsState(activeUser);
    if (typeof window.initLeadFormIdentityUI === "function") {
      window.initLeadFormIdentityUI();
    }
    try {
      window.dispatchEvent(new CustomEvent("dp-auth-changed"));
    } catch {
      /* ignore */
    }

    const adminBtn = byId("home-admin-btn");
    adminBtn?.addEventListener("click", (e) => {
      const u = parseUser();
      const role = String(u?.role || "").toLowerCase();
      if (role === "admin") {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = "admin.html";
        return;
      }
      e.preventDefault();
      alert("Доступ в админ-панель только для администратора. Выполните вход под админ-аккаунтом.");
      window.location.href = "auth.html?next=admin.html";
    });

    window.addEventListener("dp-auth-changed", () => {
      setButtonsState(parseUser());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
