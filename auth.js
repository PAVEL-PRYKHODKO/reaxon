const AUTH_ST = {
  ru: {
    hLogin: "Вход",
    hRegister: "Регистрация",
    hintNoAccount: "Нет аккаунта?",
    btnToRegister: "Регистрация",
    hintHasAccount: "Уже есть аккаунт?",
    btnToLogin: "Войти",
    ariaToRegister: "Перейти к регистрации",
    ariaToLogin: "Перейти ко входу",
    phId: "Email",
    phPass: "Пароль",
    btnSubmitLogin: "Войти",
    btnSubmitRegister: "Создать аккаунт",
    errNeedEmail: "Для регистрации укажите email в первом поле.",
    errPassShort: "Пароль не короче 6 символов.",
    errPassMatch: "Пароль и подтверждение не совпадают.",
    errNeedCompany: "Для юридического лица укажите название предприятия.",
    errNeedPhone: "Укажите номер телефона.",
    labelCompanyReq: "Название предприятия *",
    regOk: "Регистрация выполнена…",
    regErr: "Ошибка регистрации",
    loginOk: "Вход выполнен…",
    loginErr: "Ошибка входа",
    userFallback: "Пользователь",
  },
  uk: {
    hLogin: "Вхід",
    hRegister: "Реєстрація",
    hintNoAccount: "Немає акаунта?",
    btnToRegister: "Реєстрація",
    hintHasAccount: "Вже є акаунт?",
    btnToLogin: "Увійти",
    ariaToRegister: "Перейти до реєстрації",
    ariaToLogin: "Перейти до входу",
    phId: "Email",
    phPass: "Пароль",
    btnSubmitLogin: "Увійти",
    btnSubmitRegister: "Створити акаунт",
    errNeedEmail: "Для реєстрації вкажіть email у першому полі.",
    errPassShort: "Пароль — не менше 6 символів.",
    errPassMatch: "Пароль і підтвердження не збігаються.",
    errNeedCompany: "Для юридичної особи вкажіть назву підприємства.",
    errNeedPhone: "Вкажіть номер телефону.",
    labelCompanyReq: "Назва підприємства *",
    regOk: "Реєстрацію завершено…",
    regErr: "Помилка реєстрації",
    loginOk: "Вхід виконано…",
    loginErr: "Помилка входу",
    userFallback: "Користувач",
  },
};

function authLocale() {
  if (window.getDpLang) {
    const l = getDpLang();
    return l === "uk" ? "uk" : "ru";
  }
  return "ru";
}

function at(key) {
  const loc = authLocale();
  const pack = AUTH_ST[loc] || AUTH_ST.ru;
  return pack[key] != null ? pack[key] : AUTH_ST.ru[key] || key;
}

function apiPath(p) {
  return typeof window.dpApiUrl === "function" ? window.dpApiUrl(p) : p;
}

function setSession(data) {
  localStorage.setItem("authToken", data.token);
  localStorage.setItem("authUser", JSON.stringify(data.user));
}

function authRedirectUrl() {
  try {
    const raw = new URL(location.href).searchParams.get("next");
    if (!raw) return "index.html";
    const next = decodeURIComponent(raw.trim());
    if (next.includes("/") || next.includes("\\") || /^https?:/i.test(next)) return "index.html";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.html/.test(next)) return "index.html";
    return next.replace(/^\//, "");
  } catch {
    return "index.html";
  }
}

async function apiPost(url, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed")) {
      throw new Error(
        "Сервер недоступен. Запустите в папке проекта: npm start и откройте сайт по адресу http://localhost:3000 (не открывайте HTML как файл с диска)."
      );
    }
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Ошибка запроса");
  return data;
}

function setStatus(msg, kind) {
  const s = document.getElementById("auth-status");
  if (!s) return;
  s.textContent = msg || "";
  s.classList.remove("auth-status--ok", "auth-status--err");
  if (kind === "ok") s.classList.add("auth-status--ok");
  if (kind === "err") s.classList.add("auth-status--err");
}

const skipAuthForms = document.body?.dataset?.page === "auth" && localStorage.getItem("authToken");
if (skipAuthForms) {
  window.location.replace(authRedirectUrl());
} else {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const authPageWrap = document.getElementById("auth-page-wrap");
  const winLogin = document.getElementById("auth-window-login");
  const winReg = document.getElementById("auth-window-register");
  const hLogin = document.getElementById("auth-heading-login");
  const hReg = document.getElementById("auth-heading-register");
  const hintLogin = document.getElementById("auth-switch-hint-login");
  const hintReg = document.getElementById("auth-switch-hint-reg");
  const authOpenRegister = document.getElementById("auth-open-register");
  const authBackLogin = document.getElementById("auth-back-login");
  const idInput = loginForm?.querySelector('input[name="email"]');
  const passwordInput = loginForm?.querySelector('input[name="password"]');
  const regLegal = document.getElementById("reg-legal");
  const regCompany = document.getElementById("reg-company");
  const regCompanyLabel = document.getElementById("reg-company-label");
  const regLegalBlock = document.getElementById("reg-legal-block");

  let authUiMode = "login";

  function updateLegalBlockVisibility() {
    if (!regLegal || !regLegalBlock) return;
    const on = regLegal.checked;
    if (on) {
      regLegalBlock.removeAttribute("hidden");
    } else {
      regLegalBlock.setAttribute("hidden", "");
    }
    if (regCompany) {
      regCompany.required = on;
    }
    if (regCompanyLabel) {
      regCompanyLabel.textContent = at("labelCompanyReq");
    }
  }

  function setAuthMode(mode) {
    authUiMode = mode;
    const isLogin = mode === "login";
    if (winLogin) {
      winLogin.hidden = !isLogin;
      winLogin.setAttribute("aria-hidden", isLogin ? "false" : "true");
    }
    if (winReg) {
      winReg.hidden = isLogin;
      winReg.setAttribute("aria-hidden", isLogin ? "true" : "false");
    }
    if (hLogin) hLogin.textContent = at("hLogin");
    if (hReg) hReg.textContent = at("hRegister");
    authPageWrap?.classList.toggle("auth-page-wrap--register", !isLogin);
    if (idInput) {
      idInput.setAttribute("placeholder", at("phId"));
    }
    if (passwordInput) {
      passwordInput.setAttribute("autocomplete", "current-password");
      passwordInput.removeAttribute("minLength");
      passwordInput.setAttribute("placeholder", at("phPass"));
    }
    const submitLogin = loginForm?.querySelector('button[type="submit"]');
    if (submitLogin) {
      submitLogin.textContent = at("btnSubmitLogin");
    }
    const regBtn = registerForm?.querySelector("button[type=submit]");
    if (regBtn) {
      regBtn.textContent = at("btnSubmitRegister");
    }
    if (hintLogin) {
      hintLogin.textContent = at("hintNoAccount");
    }
    if (hintReg) {
      hintReg.textContent = at("hintHasAccount");
    }
    if (authOpenRegister) {
      authOpenRegister.textContent = at("btnToRegister");
      authOpenRegister.setAttribute("aria-label", at("ariaToRegister"));
    }
    if (authBackLogin) {
      authBackLogin.textContent = at("btnToLogin");
      authBackLogin.setAttribute("aria-label", at("ariaToLogin"));
    }
    setStatus("", null);
    if (!isLogin) {
      updateLegalBlockVisibility();
    }
  }

  function goRegister() {
    setAuthMode("register");
    const base = `${location.pathname}${location.search}`;
    history.replaceState(null, "", `${base}#register`);
    requestAnimationFrame(() => {
      registerForm?.querySelector('input[name="firstName"]')?.focus();
    });
  }

  function goLogin() {
    if (regLegal) regLegal.checked = false;
    updateLegalBlockVisibility();
    setAuthMode("login");
    const base = `${location.pathname}${location.search}`;
    history.replaceState(null, "", base);
    requestAnimationFrame(() => {
      idInput?.focus();
    });
  }

  regLegal?.addEventListener("change", () => {
    updateLegalBlockVisibility();
  });

  window.addEventListener("dp-lang-change", () => {
    setAuthMode(authUiMode);
  });

  authOpenRegister?.addEventListener("click", goRegister);
  authBackLogin?.addEventListener("click", goLogin);

  if (location.hash === "#register") {
    setAuthMode("register");
    requestAnimationFrame(() => {
      registerForm?.querySelector('input[name="firstName"]')?.focus();
    });
  } else {
    setAuthMode("login");
  }
  updateLegalBlockVisibility();

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const identifier = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    try {
      const data = await apiPost(apiPath("/api/auth/login"), { email: identifier, password });
      setSession(data);
      setStatus(at("loginOk"), "ok");
      const target = authRedirectUrl();
      setTimeout(() => {
        window.location.href = target;
      }, 400);
    } catch (err) {
      setStatus(err.message || at("loginErr"), "err");
    }
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    const firstName = String(fd.get("firstName") || "").trim();
    const lastName = String(fd.get("lastName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const passwordConfirm = String(fd.get("passwordConfirm") || "");
    const city = String(fd.get("city") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const deliveryAddress = String(fd.get("deliveryAddress") || "").trim();
    const isLegal = regLegal?.checked || false;
    const companyName = String(fd.get("companyName") || "").trim();
    const website = String(fd.get("website") || "").trim();
    const legalAddress = String(fd.get("legalAddress") || "").trim();

    if (!email.includes("@")) {
      setStatus(at("errNeedEmail"), "err");
      return;
    }
    if (password.length < 6) {
      setStatus(at("errPassShort"), "err");
      return;
    }
    if (password !== passwordConfirm) {
      setStatus(at("errPassMatch"), "err");
      return;
    }
    if (!phone) {
      setStatus(at("errNeedPhone"), "err");
      return;
    }
    if (isLegal && !companyName) {
      setStatus(at("errNeedCompany"), "err");
      return;
    }

    const payload = {
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      city,
      phone,
      deliveryAddress: deliveryAddress || undefined,
      isLegalEntity: isLegal,
    };
    if (isLegal) {
      payload.website = website || undefined;
      payload.companyName = companyName || undefined;
      payload.legalAddress = legalAddress || undefined;
    }

    try {
      const data = await apiPost(apiPath("/api/auth/register"), payload);
      setSession(data);
      setStatus(at("regOk"), "ok");
      const target = authRedirectUrl();
      setTimeout(() => {
        window.location.href = target;
      }, 400);
    } catch (err) {
      setStatus(err.message || at("regErr"), "err");
    }
  });
}
