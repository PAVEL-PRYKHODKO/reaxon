(function () {
  const token = localStorage.getItem("authToken") || "";
  let authUser = {};
  try {
    authUser = JSON.parse(localStorage.getItem("authUser") || "{}");
  } catch {
    authUser = {};
  }

  if (!token) {
    window.location.href = "auth.html?next=" + encodeURIComponent("crm-sales.html");
    return;
  }

  if (String(authUser.role || "").toLowerCase() !== "admin") {
    window.location.href = "account.html";
    return;
  }

  fetch(window.dpApiUrl("/api/admin/runtime-script/crm-sales.js"), {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load crm-sales.js: ${res.status}`);
      const code = await res.text();
      const blob = new Blob([code], { type: "text/javascript" });
      const objectUrl = URL.createObjectURL(blob);
      const script = document.createElement("script");
      script.src = objectUrl;
      script.defer = true;
      script.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
      script.addEventListener("error", () => URL.revokeObjectURL(objectUrl), { once: true });
      document.body.appendChild(script);
    })
    .catch((err) => {
      console.error(err);
      window.location.href = "auth.html";
    });
})();
