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
    errPassShort: "Пароль — минимум 10 символов.",
    errPassMatch: "Пароль и подтверждение не совпадают.",
    errNeedCompany: "Для юридического лица укажите название предприятия.",
    errNeedPhone: "Укажите номер телефона.",
    labelCompanyReq: "Название предприятия *",
    regOk: "Регистрация выполнена…",
    regErr: "Ошибка регистрации",
    loginOk: "Вход выполнен…",
    loginErr: "Ошибка входа",
    userFallback: "Пользователь",
    forgotHint: "Забыли пароль?",
    forgotBtn: "Восстановить",
    forgotEmailPlaceholder: "Email для восстановления",
    forgotSubmit: "Отправить ссылку",
    forgotMissingEmail: "Введите email для восстановления.",
    forgotSent: "Если аккаунт найден, письмо со ссылкой уже отправлено.",
    resetTitle: "Сброс пароля",
    resetBtn: "Сбросить пароль",
    resetPassNew: "Новый пароль",
    resetPassRepeat: "Повторите пароль",
    resetTokenBad: "Ссылка восстановления недействительна.",
    resetOk: "Пароль обновлен…",
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
    errPassShort: "Пароль — щонайменше 10 символів.",
    errPassMatch: "Пароль і підтвердження не збігаються.",
    errNeedCompany: "Для юридичної особи вкажіть назву підприємства.",
    errNeedPhone: "Вкажіть номер телефону.",
    labelCompanyReq: "Назва підприємства *",
    regOk: "Реєстрацію завершено…",
    regErr: "Помилка реєстрації",
    loginOk: "Вхід виконано…",
    loginErr: "Помилка входу",
    userFallback: "Користувач",
    forgotHint: "Забули пароль?",
    forgotBtn: "Відновити",
    forgotEmailPlaceholder: "Email для відновлення",
    forgotSubmit: "Надіслати посилання",
    forgotMissingEmail: "Введіть email для відновлення.",
    forgotSent: "Якщо акаунт знайдено, лист із посиланням уже надіслано.",
    resetTitle: "Скидання пароля",
    resetBtn: "Скинути пароль",
    resetPassNew: "Новий пароль",
    resetPassRepeat: "Повторіть пароль",
    resetTokenBad: "Посилання для відновлення недійсне.",
    resetOk: "Пароль оновлено…",
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

function canUsePasswordManager() {
  return typeof window !== "undefined" && "credentials" in navigator;
}

async function prefillSavedLogin(loginForm) {
  if (!loginForm || !canUsePasswordManager()) return;
  try {
    const cred = await navigator.credentials.get({ password: true, mediation: "optional" });
    if (!cred) return;
    const emailInput = loginForm.querySelector('input[name="email"]');
    const passInput = loginForm.querySelector('input[name="password"]');
    if (emailInput && !String(emailInput.value || "").trim()) emailInput.value = String(cred.id || "");
    if (passInput && !String(passInput.value || "").trim()) passInput.value = String(cred.password || "");
  } catch {
    /* ignore */
  }
}

async function rememberLoginCredentials(identifier, password) {
  if (!canUsePasswordManager()) return;
  if (!window.PasswordCredential) return;
  const id = String(identifier || "").trim();
  const pass = String(password || "");
  if (!id || !pass) return;
  try {
    const cred = new window.PasswordCredential({
      id,
      password: pass,
      name: id,
    });
    await navigator.credentials.store(cred);
  } catch {
    /* ignore */
  }
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

function resetTokenFromUrl() {
  try {
    return String(new URL(location.href).searchParams.get("reset_token") || "").trim();
  } catch {
    return "";
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

const skipAuthForms =
  document.body?.dataset?.page === "auth" && localStorage.getItem("authToken") && !resetTokenFromUrl();
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
  const forgotHint = document.getElementById("auth-forgot-hint");
  const authOpenRegister = document.getElementById("auth-open-register");
  const authBackLogin = document.getElementById("auth-back-login");
  const authForgotPassword = document.getElementById("auth-forgot-password");
  const forgotForm = document.getElementById("forgot-form");
  const resetForm = document.getElementById("reset-form");
  const idInput = loginForm?.querySelector('input[name="email"]');
  const passwordInput = loginForm?.querySelector('input[name="password"]');
  const forgotEmailInput = forgotForm?.querySelector('input[name="email"]');
  const resetPassInput = resetForm?.querySelector('input[name="newPassword"]');
  const resetPassConfirmInput = resetForm?.querySelector('input[name="newPasswordConfirm"]');
  const regLegal = document.getElementById("reg-legal");
  const regCompany = document.getElementById("reg-company");
  const regCompanyLabel = document.getElementById("reg-company-label");
  const regLegalBlock = document.getElementById("reg-legal-block");

  let authUiMode = "login";
  const resetToken = resetTokenFromUrl();
  let resetModeOn = Boolean(resetToken);

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
    if (forgotHint) forgotHint.textContent = at("forgotHint");
    if (authForgotPassword) {
      authForgotPassword.textContent = at("forgotBtn");
      authForgotPassword.setAttribute("aria-label", at("forgotBtn"));
    }
    if (forgotEmailInput) forgotEmailInput.setAttribute("placeholder", at("forgotEmailPlaceholder"));
    const forgotSubmit = forgotForm?.querySelector('button[type="submit"]');
    if (forgotSubmit) forgotSubmit.textContent = at("forgotSubmit");
    if (resetPassInput) resetPassInput.setAttribute("placeholder", at("resetPassNew"));
    if (resetPassConfirmInput) resetPassConfirmInput.setAttribute("placeholder", at("resetPassRepeat"));
    const resetSubmit = resetForm?.querySelector('button[type="submit"]');
    if (resetSubmit) resetSubmit.textContent = at("resetBtn");
    setStatus("", null);
    if (!isLogin) {
      updateLegalBlockVisibility();
    } else {
      void prefillSavedLogin(loginForm);
    }
  }

  function goRegister() {
    resetModeOn = false;
    if (resetForm) {
      resetForm.hidden = true;
      resetForm.setAttribute("aria-hidden", "true");
    }
    if (forgotForm) {
      forgotForm.hidden = true;
      forgotForm.setAttribute("aria-hidden", "true");
    }
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
    if (forgotForm) {
      forgotForm.hidden = true;
      forgotForm.setAttribute("aria-hidden", "true");
    }
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
  authForgotPassword?.addEventListener("click", async () => {
    if (resetModeOn) return;
    const willOpen = Boolean(forgotForm?.hidden);
    if (forgotForm) {
      forgotForm.hidden = !willOpen ? true : false;
      forgotForm.setAttribute("aria-hidden", willOpen ? "false" : "true");
    }
    if (willOpen) {
      if (forgotEmailInput && !String(forgotEmailInput.value || "").trim() && idInput?.value) {
        forgotEmailInput.value = String(idInput.value || "").trim();
      }
      requestAnimationFrame(() => {
        forgotEmailInput?.focus();
      });
    }
  });

  forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = String(forgotEmailInput?.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setStatus(at("forgotMissingEmail"), "err");
      forgotEmailInput?.focus();
      return;
    }
    try {
      await apiPost(apiPath("/api/auth/forgot-password"), { email });
      setStatus(at("forgotSent"), "ok");
      forgotForm.hidden = true;
      forgotForm.setAttribute("aria-hidden", "true");
    } catch (err) {
      setStatus(err.message || at("loginErr"), "err");
    }
  });

  if (resetModeOn) {
    setAuthMode("login");
    if (hLogin) hLogin.textContent = at("resetTitle");
    if (loginForm) loginForm.hidden = true;
    if (authForgotPassword) authForgotPassword.disabled = true;
    if (forgotForm) {
      forgotForm.hidden = true;
      forgotForm.setAttribute("aria-hidden", "true");
    }
    if (resetForm) {
      resetForm.hidden = false;
      resetForm.setAttribute("aria-hidden", "false");
    }
    requestAnimationFrame(() => {
      resetPassInput?.focus();
    });
  } else if (location.hash === "#register") {
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
      await rememberLoginCredentials(identifier, password);
      setStatus(at("loginOk"), "ok");
      const target = authRedirectUrl();
      setTimeout(() => {
        window.location.href = target;
      }, 400);
    } catch (err) {
      setStatus(err.message || at("loginErr"), "err");
    }
  });

  resetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!resetToken) {
      setStatus(at("resetTokenBad"), "err");
      return;
    }
    const newPassword = String(resetPassInput?.value || "");
    const newPasswordConfirm = String(resetPassConfirmInput?.value || "");
    if (newPassword.length < 10) {
      setStatus(at("errPassShort"), "err");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setStatus(at("errPassMatch"), "err");
      return;
    }
    try {
      const data = await apiPost(apiPath("/api/auth/reset-password"), { token: resetToken, newPassword });
      setSession(data);
      await rememberLoginCredentials(String(data?.user?.email || ""), newPassword);
      setStatus(at("resetOk"), "ok");
      const target = authRedirectUrl();
      setTimeout(() => {
        window.location.href = target;
      }, 450);
    } catch (err) {
      setStatus(err.message || at("resetTokenBad"), "err");
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
      await rememberLoginCredentials(email.toLowerCase(), password);
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
