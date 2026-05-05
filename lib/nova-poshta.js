/**
 * Прокси к JSON API «Нова пошта» v2.0 (ключ тільки на сервері).
 * @see https://developers.novaposhta.ua/
 */
export async function novaPoshtaCall(apiKey, modelName, calledMethod, methodProperties = {}) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("np_no_key");
  }
  const res = await fetch("https://api.novaposhta.ua/v2.0/json/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      modelName,
      calledMethod,
      methodProperties,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    const err = Array.isArray(json.errors) ? json.errors[0] : json.error || "NP request failed";
    throw new Error(String(err));
  }
  return json.data;
}

/**
 * Всі відділення міста (з пагінацією API, до maxPages сторінок).
 */
export async function novaPoshtaListAllWarehouses(apiKey, cityRef, { maxPages = 25 } = {}) {
  const ref = String(cityRef || "").trim();
  if (!ref) return [];
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await novaPoshtaCall(apiKey, "Address", "getWarehouses", {
      CityRef: ref,
      Limit: 100,
      Page: page,
    });
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}
