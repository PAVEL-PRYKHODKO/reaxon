/**
 * Дублікати сповіщень про швидкі заявки з банерів («Заказать звонок», «Получить расчёт»)
 * у Telegram-канал для менеджерів через Bot API (sendMessage).
 *
 * Налаштування: додайте бота адміністратором каналу з правом публікації, у .env —
 * TELEGRAM_BOT_TOKEN та TELEGRAM_BANNER_NOTIFY_CHAT_ID (зазвичай -100… для каналу).
 */

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
/** chat_id каналу / групи (число або @public_username) */
const CHAT_ID = String(process.env.TELEGRAM_BANNER_NOTIFY_CHAT_ID || "").trim();

const BANNER_SOURCES = new Set(["site_callback_banner", "site_home_calc_banner"]);

const TG_MSG_MAX = 3900;

export function isTelegramBannerNotifyConfigured() {
  return Boolean(BOT_TOKEN && CHAT_ID);
}

function bannerSourceLabel(src) {
  if (src === "site_callback_banner") return "Заказать звонок (контакты)";
  if (src === "site_home_calc_banner") return "Получить расчёт (главная)";
  return src || "—";
}

function truncateTail(s, max) {
  const t = String(s || "").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatBannerLeadTelegramMessage(lead) {
  const lines = [
    "🔔 Новая заявка с сайта (баннер)",
    "",
    `Источник: ${bannerSourceLabel(lead.source)}`,
    `ID заявки: #${lead.id}`,
    `Имя: ${lead.customerName || "—"}`,
    `Телефон: ${lead.phone || "—"}`,
    `Email: ${lead.email || "—"}`,
    `Тема: ${lead.topic || "—"}`,
  ];
  const aid = lead.crm?.accountUserId;
  if (aid != null && Number.isFinite(Number(aid))) {
    lines.push(`Аккаунт ЛК: user #${aid}`);
  }
  lines.push("", "Комментарий:");
  lines.push(truncateTail(lead.comment, 2800));
  let text = lines.join("\n");
  if (text.length > TG_MSG_MAX) text = `${text.slice(0, TG_MSG_MAX - 1)}…`;
  return text;
}

/**
 * Відправити повідомлення у канал менеджерів (якщо заявка з банера та env налаштовано).
 */
export async function notifyTelegramBannerLead(lead) {
  if (!lead || !BANNER_SOURCES.has(String(lead.source || ""))) return;
  if (!isTelegramBannerNotifyConfigured()) return;

  const text = formatBannerLeadTelegramMessage(lead);
  const url = `https://api.telegram.org/bot${encodeURIComponent(BOT_TOKEN)}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[telegram-banner] sendMessage failed:", res.status, raw.slice(0, 600));
    }
  } catch (err) {
    console.error("[telegram-banner] sendMessage error:", err?.message || err);
  }
}
