(function () {
  function apiUrl(p) {
    return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
  }

  function mediaUrl(path) {
    if (!path || typeof path !== "string") return "";
    if (path.startsWith("http")) return path;
    const base = window.DP_API_BASE || "";
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function apiAuth(method, urlPath, body) {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.href = "auth.html";
      throw new Error("no_token");
    }
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(apiUrl(urlPath), opts);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        throw new Error("Сервер недоступен. Запустите npm start и откройте сайт через http://localhost:3000");
      }
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      window.location.href = "auth.html";
      throw new Error("Сессия истекла. Войдите снова.");
    }
    if (!res.ok) throw new Error(data.message || "Ошибка запроса");
    return data;
  }

  async function notifyServerLogout() {
    try {
      await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.remove("account-status--ok", "account-status--err");
    if (kind === "ok") el.classList.add("account-status--ok");
    if (kind === "err") el.classList.add("account-status--err");
  }

  function applyUserToForm(form, user) {
    if (!user || !form) return;
    form.name.value = user.name || "";
    form.email.value = user.email || "";
    const pr = user.profile || {};
    form.age.value = pr.age != null && pr.age !== "" ? String(pr.age) : "";
    const g = pr.gender === "female" || pr.gender === "male" ? pr.gender : "";
    form.gender.value = g;
    form.countryRegion.value = pr.countryRegion || "";
    form.companyName.value = pr.companyName || "";
    form.phone.value = pr.phone || "";
    form.legalAddress.value = pr.legalAddress || "";
    form.deliveryAddress.value = pr.deliveryAddress || "";
    const pv = pr.privacy || {};
    form.hideEmail.checked = Boolean(pv.hideEmail);
    form.hidePhone.checked = Boolean(pv.hidePhone);
    form.hideLegalAddress.checked = Boolean(pv.hideLegalAddress);
    form.hideDeliveryAddress.checked = Boolean(pv.hideDeliveryAddress);
  }

  function updateAvatarPreview(url) {
    const box = document.getElementById("account-avatar-preview");
    if (!box) return;
    box.innerHTML = "";
    if (url) {
      const img = document.createElement("img");
      img.src = mediaUrl(url);
      img.alt = "Фото профиля";
      box.appendChild(img);
    } else {
      const s = document.createElement("span");
      s.textContent = "Нет фото";
      box.appendChild(s);
    }
  }

  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const form = document.getElementById("account-profile-form");
  const statusEl = document.getElementById("account-form-status");
  const avatarInput = document.getElementById("account-avatar-input");
  const avatarRemove = document.getElementById("account-avatar-remove");
  document.getElementById("account-logout-btn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!window.confirm("Выйти из аккаунта?")) return;
    await notifyServerLogout();
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    window.location.href = "index.html";
  });

  avatarInput?.addEventListener("change", async () => {
    const f = avatarInput.files && avatarInput.files[0];
    if (!f) return;
    if (f.size > 512 * 1024) {
      setStatus(statusEl, "Файл больше 512 КБ.", "err");
      avatarInput.value = "";
      return;
    }
    setStatus(statusEl, "Загрузка фото…", null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = await apiAuth("POST", "/api/auth/profile/avatar", {
          imageBase64: reader.result,
        });
        updateAvatarPreview(data.avatarUrl);
        let u = {};
        try {
          u = JSON.parse(localStorage.getItem("authUser") || "{}");
        } catch {
          u = {};
        }
        u.profile = u.profile || {};
        u.profile.avatarUrl = data.avatarUrl;
        localStorage.setItem("authUser", JSON.stringify(u));
        setStatus(statusEl, "Фото обновлено.", "ok");
      } catch (e) {
        setStatus(statusEl, e.message || "Не удалось загрузить фото", "err");
      } finally {
        avatarInput.value = "";
      }
    };
    reader.onerror = () => setStatus(statusEl, "Не удалось прочитать файл", "err");
    reader.readAsDataURL(f);
  });

  avatarRemove?.addEventListener("click", async () => {
    setStatus(statusEl, "Удаление…", null);
    try {
      await apiAuth("DELETE", "/api/auth/profile/avatar");
      updateAvatarPreview("");
      let u = {};
      try {
        u = JSON.parse(localStorage.getItem("authUser") || "{}");
      } catch {
        u = {};
      }
      if (u.profile) u.profile.avatarUrl = null;
      localStorage.setItem("authUser", JSON.stringify(u));
      setStatus(statusEl, "Фото удалено.", "ok");
    } catch (e) {
      setStatus(statusEl, e.message || "Ошибка", "err");
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(statusEl, "Сохранение…", null);
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      profile: {
        age: fd.get("age") === "" ? null : fd.get("age"),
        gender: (() => {
          const raw = String(fd.get("gender") || "").trim().toLowerCase();
          if (raw === "female") return "female";
          if (raw === "male") return "male";
          return "";
        })(),
        countryRegion: fd.get("countryRegion") || "",
        companyName: fd.get("companyName") || "",
        phone: fd.get("phone") || "",
        legalAddress: fd.get("legalAddress") || "",
        deliveryAddress: fd.get("deliveryAddress") || "",
      },
      privacy: {
        hideEmail: form.hideEmail.checked,
        hidePhone: form.hidePhone.checked,
        hideLegalAddress: form.hideLegalAddress.checked,
        hideDeliveryAddress: form.hideDeliveryAddress.checked,
      },
    };
    try {
      const data = await apiAuth("PATCH", "/api/auth/profile", payload);
      if (data.token) localStorage.setItem("authToken", data.token);
      if (data.user) localStorage.setItem("authUser", JSON.stringify(data.user));
      applyUserToForm(form, data.user);
      updateAvatarPreview(data.user?.profile?.avatarUrl);
      setStatus(statusEl, "Данные сохранены.", "ok");
    } catch (err) {
      setStatus(statusEl, err.message || "Ошибка сохранения", "err");
    }
  });

  (async function init() {
    try {
      const user = await apiAuth("GET", "/api/auth/me");
      localStorage.setItem("authUser", JSON.stringify(user));
      applyUserToForm(form, user);
      updateAvatarPreview(user.profile?.avatarUrl);
    } catch (e) {
      if (e.message !== "no_token") setStatus(statusEl, e.message || "Не удалось загрузить профиль", "err");
    }
  })();
})();
