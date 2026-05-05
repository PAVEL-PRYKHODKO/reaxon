(function () {
  const token = localStorage.getItem("authToken") || "";
  let authUser = {};
  try {
    authUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  } catch {
    authUser = {};
  }

  if (!token) {
    window.location.href = "auth.html?next=" + encodeURIComponent("admin-panel.html");
    return;
  }

  if (String(authUser.role || "") !== "admin") {
    window.location.href = "auth.html";
    return;
  }

  const names = ["admin-panel.js", "admin-product-cards.js"];

  function loadProtectedScript(name) {
    return fetch(window.dpApiUrl(`/api/admin/runtime-script/${encodeURIComponent(name)}`), {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Не удалось загрузить ${name}: ${res.status}`);
      }
      const code = await res.text();
      const blob = new Blob([code], { type: "text/javascript" });
      const objectUrl = URL.createObjectURL(blob);
      const script = document.createElement("script");
      script.src = objectUrl;
      script.defer = true;
      document.body.appendChild(script);
      script.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
      script.addEventListener("error", () => URL.revokeObjectURL(objectUrl), { once: true });
    });
  }

  (async () => {
    try {
      for (const name of names) {
        await loadProtectedScript(name);
      }
    } catch (err) {
      console.error(err);
      window.location.href = "auth.html";
    }
  })();
})();
