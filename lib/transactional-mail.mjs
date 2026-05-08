/**
 * Транзакционная почта (Gmail SMTP + App Password).
 * Включается при заданных SMTP_USER и SMTP_PASS в .env — см. .env.example.
 */
import nodemailer from "nodemailer";

const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_HOST = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE =
  process.env.SMTP_SECURE === "1" ||
  String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
  SMTP_PORT === 465;

const MAIL_FROM = String(process.env.MAIL_FROM || "").trim() || (SMTP_USER ? `Reaxon <${SMTP_USER}>` : "");
/** Куда слать уведомления о новых заявках (по умолчанию — тот же ящик, что и SMTP_USER). */
const MAIL_ADMIN_TO = String(process.env.MAIL_ADMIN_TO || SMTP_USER).trim();
/** Необязательная скрытая копия на исходящих письмах клиенту. */
const MAIL_BCC = String(process.env.MAIL_BCC || "").trim();
/** Для быстрых заявок с баннеров (контакты «Заказать звонок», главная «Получить расчёт»); переопределяет MAIL_ADMIN_TO. */
const CALLBACK_BANNER_EMAIL = String(process.env.CALLBACK_BANNER_EMAIL || "reaxondh@gmail.com").trim();

const SOURCES_CALLBACK_BANNER_MAIL = new Set(["site_callback_banner", "site_home_calc_banner"]);

let transporter = null;

export function isTransactionalMailConfigured() {
  return Boolean(SMTP_USER && SMTP_PASS && MAIL_FROM);
}

function getTransporter() {
  if (!isTransactionalMailConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidEmail(e) {
  const x = String(e || "").trim();
  if (!x || x.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function formatMoneyUa(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  const v = Math.round(Number(n) * 100) / 100;
  return `${v.toFixed(2).replace(".", ",")} грн`;
}

function cartRowsHtml(lead) {
  const rows = Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot : [];
  if (!rows.length) return "<p>—</p>";
  const body = rows
    .map(
      (r) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(r.title || "—")}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(r.details || "")}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${escapeHtml(String(r.qty ?? ""))}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${r.lineTotal == null ? "—" : escapeHtml(formatMoneyUa(r.lineTotal))}</td>
    </tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px;">
  <thead><tr style="background:#f1f5f9;">
    <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Товар / позиція</th>
    <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Детали</th>
    <th style="padding:6px 8px;border:1px solid #e2e8f0;">К-сть</th>
    <th style="padding:6px 8px;border:1px solid #e2e8f0;">Сума</th>
  </tr></thead>
  <tbody>${body}</tbody>
  </table>`;
}

function leadDetailsBlock(lead) {
  const lines = [
    ["ID заявки", `#${lead.id}`],
    ["Имя", lead.customerName || "—"],
    ["Телефон", lead.phone || "—"],
    ["Email", lead.email || "—"],
    ["Источник", lead.source || "—"],
    ["Тип клиента", lead.customerType || "—"],
    ["Город", lead.deliveryCity || "—"],
    ["Доставка", lead.deliveryPoint || "—"],
    ["Способ доставки", lead.deliveryMethod || "—"],
    [
      "Оплата",
      [lead.paymentMethod, lead.paymentNote].filter((x) => x && String(x).trim()).join(" — ") || "—",
    ],
    ["Сумма", lead.orderTotal == null ? "—" : formatMoneyUa(lead.orderTotal)],
    ["Підписка / розсилка", lead.marketingOptIn ? "так / yes" : "ні / no"],
    ["Тема", lead.topic || "—"],
    [
      "Аккаунт (ЛК)",
      lead.crm && lead.crm.accountUserId != null ? `user #${lead.crm.accountUserId}` : "—",
    ],
    [
      "Юрособа (оформлення)",
      lead.isLegalEntityBuyer ? "так — ПДВ / без ПДВ згідно з профілем" : "—",
    ],
    ["Назва в документах", lead.billingCompanyName || "—"],
    ["ЄДРПОУ", lead.billingEdrpou || "—"],
    ["Email для рахунків", lead.billingInvoiceEmail || "—"],
    ["IBAN", lead.billingIban || "—"],
    ["Юридична адреса", lead.billingLegalAddress || "—"],
  ];
  return lines
    .map(
      ([a, b]) => `
  <tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${escapeHtml(a)}</td>
  <td style="padding:4px 0;vertical-align:top;">${escapeHtml(b)}</td></tr>`
    )
    .join("");
}

function buildAdminText(lead) {
  const acc =
    lead.crm && lead.crm.accountUserId != null
      ? `user #${lead.crm.accountUserId} (логин на сайті)`
      : "гість / без акаунту";
  const lines = [
    `Нова заявка #${lead.id} (${lead.source || "site"})`,
    `Акаунт: ${acc}`,
    `Тема: ${lead.topic || "—"}`,
    `Ім'я: ${lead.customerName || "—"}`,
    `Тел.: ${lead.phone || "—"}`,
    `Email: ${lead.email || "—"}`,
    `Сума: ${lead.orderTotal == null ? "—" : formatMoneyUa(lead.orderTotal)}`,
    `Коментар: ${(lead.comment || "").slice(0, 2000)}`,
  ];
  if (lead.isLegalEntityBuyer) {
    lines.push(
      `Реквізити: ${lead.billingCompanyName || "—"} | ЄДРПОУ ${lead.billingEdrpou || "—"} | рахунки: ${lead.billingInvoiceEmail || "—"} | IBAN ${lead.billingIban || "—"}`
    );
  }
  return lines.join("\n");
}

function buildAdminHtml(lead) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;">
  <h1 style="font-size:18px;">Новая заявка / нова заявка #${escapeHtml(lead.id)}</h1>
  <table style="margin:12px 0;">${leadDetailsBlock(lead)}</table>
  <p><strong>Коментар / коментар</strong></p>
  <pre style="white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">${escapeHtml(lead.comment || "—")}</pre>
  <p><strong>Корзина / кошик</strong></p>
  ${cartRowsHtml(lead)}
  </body></html>`;
}

function billingSnippetHtml(lead) {
  const rows = [
    ["Назва", lead.billingCompanyName],
    ["ЄДРПОУ", lead.billingEdrpou],
    ["Рахунок на email", lead.billingInvoiceEmail],
    ["IBAN", lead.billingIban],
    ["Юридична адреса", lead.billingLegalAddress],
  ].filter(([, v]) => v && String(v).trim());
  if (!rows.length) return "";
  const body = rows
    .map(
      ([a, b]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${escapeHtml(a)}</td><td>${escapeHtml(
          String(b)
        )}</td></tr>`
    )
    .join("");
  return `<h2 style="font-size:16px;margin-top:20px;">Реквізити для документів / реквизиты для документов</h2>
<table style="margin-bottom:16px;">${body}</table>`;
}

function buildCustomerHtml(lead) {
  const name = lead.customerName || "";
  const billingBlock =
    String(lead.source || "") === "checkout" && lead.isLegalEntityBuyer ? billingSnippetHtml(lead) : "";
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:560px;">
  <h1 style="font-size:20px;">Спасибо за заказ! / Дякуємо за замовлення!</h1>
  <p>Здравствуйте${name ? `, <strong>${escapeHtml(name)}</strong>` : ""}!</p>
  <p>Мы получили вашу заявку <strong>#${escapeHtml(lead.id)}</strong> и свяжемся с вами в ближайшее время.</p>
  <p>Ми отримали ваше замовлення <strong>#${escapeHtml(lead.id)}</strong> і найближчим часом з вами зв'яжемось.</p>
  ${billingBlock}
  <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;" />
  <p style="color:#64748b;font-size:14px;">Reaxon — лакокрасочные матеріали / ЛКП</p>
  <p style="font-size:13px;color:#94a3b8;"><a href="mailto:${escapeHtml(SMTP_USER)}">${escapeHtml(SMTP_USER)}</a></p>
  </body></html>`;
}

function buildCustomerText(lead) {
  const billingLines =
    String(lead.source || "") === "checkout" && lead.isLegalEntityBuyer
      ? [
          "",
          "Реквізити (для документів):",
          lead.billingCompanyName && `Назва: ${lead.billingCompanyName}`,
          lead.billingEdrpou && `ЄДРПОУ: ${lead.billingEdrpou}`,
          lead.billingInvoiceEmail && `Email рахунків: ${lead.billingInvoiceEmail}`,
          lead.billingIban && `IBAN: ${lead.billingIban}`,
          lead.billingLegalAddress && `Юр. адреса: ${lead.billingLegalAddress}`,
        ].filter(Boolean)
      : [];
  return [
    "Спасибо за заказ! / Дякуємо за замовлення!",
    `Заявка / замовлення #${lead.id}`,
    "Ми зв'яжемось / мы свяжемся в ближайшее время.",
    ...billingLines,
    `Контакти: ${SMTP_USER}`,
  ].join("\n");
}

function buildBillingDeptHtml(lead) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;">
  <h1 style="font-size:18px;">Копія заявки для бухгалтерії / копія для бухгалтерії — #${escapeHtml(lead.id)}</h1>
  <p style="color:#64748b;">Джерело: оформлення на сайті (юрособа). Лист відправлено автоматично.</p>
  <table style="margin:12px 0;">${leadDetailsBlock(lead)}</table>
  <p><strong>Коментар</strong></p>
  <pre style="white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">${escapeHtml(lead.comment || "—")}</pre>
  <p><strong>Кошик</strong></p>
  ${cartRowsHtml(lead)}
  </body></html>`;
}

function buildBillingDeptText(lead) {
  return [
    `Копія заявки #${lead.id} для бухгалтерії (автоматично)`,
    buildAdminText(lead),
    "",
    `Коментар: ${(lead.comment || "").slice(0, 2000)}`,
  ].join("\n");
}

function buildWelcomeHtml(user) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:560px;">
  <h1 style="font-size:20px;">Добро пожаловать / Ласкаво просимо!</h1>
  <p>Вы зарегистрировались в интернет-магазине <strong>Reaxon</strong> как <strong>${escapeHtml(user.name || "")}</strong>.</p>
  <p>Ви зареєструвалися в інтернет-магазині <strong>Reaxon</strong> як <strong>${escapeHtml(user.name || "")}</strong>.</p>
  <p>Адрес входа: <strong>${escapeHtml(user.email || "")}</strong></p>
  <p style="color:#64748b;font-size:14px;">Если вы не создавали аккаунт, проигнорируйте это письмо. / Якщо ви не реєструвалися, ігноруйте листа.</p>
  </body></html>`;
}

/**
 * Письмо владельцу + подтверждение клиенту (если указан валидный email).
 * @param {object} lead — объект заявки после записи в БД
 */
export async function sendLeadCreatedMails(lead) {
  const t = getTransporter();
  if (!t || !lead) return;

  let adminTo = isValidEmail(MAIL_ADMIN_TO) ? MAIL_ADMIN_TO : SMTP_USER;
  if (SOURCES_CALLBACK_BANNER_MAIL.has(String(lead.source || "")) && isValidEmail(CALLBACK_BANNER_EMAIL)) {
    adminTo = CALLBACK_BANNER_EMAIL;
  }
  const replyTo = isValidEmail(lead.email) ? lead.email : undefined;
  const src = String(lead.source || "");
  const skipCustomerBanner = SOURCES_CALLBACK_BANNER_MAIL.has(src);
  let subj = `[Reaxon] Заявка #${lead.id} — ${String(lead.customerName || "без імені").slice(0, 80)}`;
  if (src === "site_callback_banner") {
    subj = `[Reaxon] Звонок #${lead.id} — ${String(lead.customerName || "клієнт").slice(0, 80)}`;
  } else if (src === "site_home_calc_banner") {
    subj = `[Reaxon] Расчёт #${lead.id} — ${String(lead.customerName || "клієнт").slice(0, 80)}`;
  }

  await t.sendMail({
    from: MAIL_FROM,
    to: adminTo,
    replyTo: replyTo || undefined,
    subject: subj,
    text: buildAdminText(lead),
    html: buildAdminHtml(lead),
  });

  const cust = String(lead.email || "").trim();
  const bcc = MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined;

  if (!skipCustomerBanner && isValidEmail(cust)) {
    await t.sendMail({
      from: MAIL_FROM,
      to: cust,
      bcc: bcc || undefined,
      subject: `Reaxon: заявка #${lead.id} прийнята / получена`,
      text: buildCustomerText(lead),
      html: buildCustomerHtml(lead),
    });
  }

  /* Окрема автоматична копія на email для рахунків (якщо окремий від контактного або контактний не валідний). */
  const billingTo = String(lead.billingInvoiceEmail || "").trim();
  const checkoutLegal =
    String(lead.source || "") === "checkout" &&
    Boolean(lead.isLegalEntityBuyer) &&
    isValidEmail(billingTo);
  const sameAsContact = isValidEmail(cust) && billingTo.toLowerCase() === cust.toLowerCase();
  if (checkoutLegal && !sameAsContact) {
    await t.sendMail({
      from: MAIL_FROM,
      to: billingTo,
      bcc: bcc || undefined,
      replyTo: replyTo || undefined,
      subject: `[Reaxon] Заявка №${lead.id} — реквізити / кошик (автоматично)`,
      text: buildBillingDeptText(lead),
      html: buildBillingDeptHtml(lead),
    });
  }
}

/**
 * Приветствие после регистрации /api/auth/register
 */
/**
 * Уведомление клиенту: ответ менеджера в личный кабинет + дублирование на email.
 */
export async function sendSiteInboxMessageMail({ toEmail, customerName, leadId, topic, body, managerName }) {
  const t = getTransporter();
  if (!t || !isValidEmail(toEmail)) return;
  const subj = `[Reaxon] Новое сообщение по заявке #${leadId}`;
  const topicLine = topic ? escapeHtml(topic) : "—";
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:560px;">
  <h1 style="font-size:18px;">Новое сообщение / нове повідомлення</h1>
  <p>Здравствуйте${customerName ? `, <strong>${escapeHtml(customerName)}</strong>` : ""}!</p>
  <p>По заявке <strong>#${escapeHtml(String(leadId))}</strong> (${topicLine}) вам ответил менеджер <strong>${escapeHtml(
    managerName || "Reaxon"
  )}</strong>.</p>
  <p style="white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff;">${escapeHtml(
    String(body || "").slice(0, 5000)
  )}</p>
  <p>${(() => {
    const b = String(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
    return b
      ? `<a href="${escapeHtml(b)}/account.html">Открыть личный кабинет / Відкрити кабінет</a>`
      : "Личный кабинет: раздел на сайте Reaxon.";
  })()}</p>
  <p style="color:#94a3b8;font-size:13px;">Reaxon</p>
  </body></html>`;
  const text = `Заявка #${leadId}. Тема: ${topic || "—"}\n\n${String(body || "")}\n\nКабинет: account.html`;
  await t.sendMail({
    from: MAIL_FROM,
    to: String(toEmail).trim(),
    bcc: MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined,
    subject: subj,
    text,
    html,
  });
}

export async function sendWelcomeMail(user) {
  const t = getTransporter();
  if (!t || !user || !isValidEmail(user.email)) return;
  await t.sendMail({
    from: MAIL_FROM,
    to: String(user.email).trim(),
    bcc: MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined,
    subject: "Reaxon: реєстрація / регистрация",
    text: `Ласкаво просимо / Добро пожаловать! Аккаунт: ${user.email}`,
    html: buildWelcomeHtml(user),
  });
}

export async function sendPasswordResetMail({ toEmail, customerName, resetUrl, ttlMinutes = 30 }) {
  const t = getTransporter();
  if (!t || !isValidEmail(toEmail) || !resetUrl) return;
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:560px;">
  <h1 style="font-size:20px;">Восстановление пароля</h1>
  <p>Здравствуйте${customerName ? `, <strong>${escapeHtml(customerName)}</strong>` : ""}.</p>
  <p>Вы запросили восстановление пароля для аккаунта <strong>${escapeHtml(String(toEmail))}</strong>.</p>
  <p><a href="${escapeHtml(String(resetUrl))}" style="display:inline-block;padding:10px 16px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;">Сбросить пароль</a></p>
  <p>Ссылка действительна примерно ${escapeHtml(String(ttlMinutes))} минут.</p>
  <p style="color:#64748b;font-size:14px;">Если это были не вы, просто проигнорируйте письмо.</p>
  </body></html>`;
  const text = `Восстановление пароля\n\nДля аккаунта ${toEmail} была запрошена смена пароля.\nСсылка: ${resetUrl}\nСрок действия: ${ttlMinutes} минут.\n\nЕсли это были не вы, игнорируйте это письмо.`;
  const info = await t.sendMail({
    from: MAIL_FROM,
    to: String(toEmail).trim(),
    bcc: MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined,
    subject: "Reaxon: восстановление пароля",
    text,
    html,
  });
  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
  if (!accepted.length || rejected.length) {
    throw new Error(`SMTP rejected recipient(s): ${rejected.join(", ") || "unknown"}`);
  }
  return info;
}

export async function sendPaymentReceiptMail({
  toEmail,
  customerName,
  leadId,
  orderId,
  provider,
  amount,
  currency = "UAH",
  cartSnapshot = [],
  sellerIban = {},
}) {
  const t = getTransporter();
  if (!t || !isValidEmail(toEmail)) return null;
  const lines = Array.isArray(cartSnapshot) ? cartSnapshot : [];
  const rowsHtml = lines.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Товар</th>
        <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Деталі</th>
        <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">К-сть</th>
        <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">Сума</th>
      </tr></thead>
      <tbody>
      ${lines
        .map(
          (r) => `<tr>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(r.title || "—")}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(r.details || "")}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${escapeHtml(String(r.qty ?? ""))}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(
            formatMoneyUa(r.lineTotal || 0)
          )}</td>
        </tr>`
        )
        .join("")}
      </tbody>
    </table>`
    : "<p>Склад замовлення не передано.</p>";
  const ibanRows = [
    ["Отримувач / Получатель", sellerIban.recipient || "—"],
    ["ЄДРПОУ", sellerIban.edrpou || "—"],
    ["IBAN", sellerIban.iban || "—"],
    ["Банк", sellerIban.bank || "—"],
    ["МФО", sellerIban.mfo || "—"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${escapeHtml(k)}</td><td>${escapeHtml(
          v
        )}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:640px;">
    <h1 style="font-size:20px;">Підтвердження оплати / Подтверждение оплаты</h1>
    <p>Вітаємо${customerName ? `, <strong>${escapeHtml(customerName)}</strong>` : ""}.</p>
    <p>Оплата за замовлення <strong>#${escapeHtml(String(leadId || ""))}</strong> успішна.</p>
    <p><strong>Провайдер:</strong> ${escapeHtml(String(provider || "").toUpperCase())}<br/>
    <strong>Номер операції:</strong> ${escapeHtml(String(orderId || "—"))}<br/>
    <strong>Сума:</strong> ${escapeHtml(formatMoneyUa(amount || 0))} ${escapeHtml(currency || "UAH")}</p>
    <h2 style="font-size:16px;margin-top:18px;">Склад замовлення</h2>
    ${rowsHtml}
    <h2 style="font-size:16px;margin-top:18px;">Реквізити продавця</h2>
    <table>${ibanRows}</table>
    <p style="color:#64748b;font-size:13px;margin-top:14px;">Reaxon / DP Coatings</p>
  </body></html>`;
  const text = [
    "Підтвердження оплати / Подтверждение оплаты",
    `Замовлення #${leadId || "—"}`,
    `Провайдер: ${String(provider || "").toUpperCase()}`,
    `Операція: ${orderId || "—"}`,
    `Сума: ${formatMoneyUa(amount || 0)} ${currency || "UAH"}`,
  ].join("\n");
  return t.sendMail({
    from: MAIL_FROM,
    to: String(toEmail).trim(),
    bcc: MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined,
    subject: `Reaxon: підтвердження оплати #${leadId || ""}`,
    text,
    html,
  });
}
