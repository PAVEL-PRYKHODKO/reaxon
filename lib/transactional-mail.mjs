/**
 * Транзакционная почта (Gmail SMTP + App Password).
 * Включается при заданных SMTP_USER и SMTP_PASS в .env — см. .env.example.
 */
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
const LEGAL_SELLER_REQUISITES_FALLBACK = {
  companyName: {
    ru: 'ТОВ Виробниче підприємство "Дніпрохім"',
    uk: 'ТОВ Виробниче підприємство "Дніпрохім"',
  },
  address: {
    ru: "69002, г. Запорожье, ул. Константина Великого, дом 20",
    uk: "69002, м. Запоріжжя, вул. Костянтина Великого, буд. 20",
  },
  iban: "UA363003350000000026009327975",
  bank: {
    ru: 'АТ "Райффайзен Банк Аваль"',
    uk: 'АТ "Райффайзен Банк Аваль"',
  },
  mfo: "300335",
  edrpou: "32297953",
  ipn: "322979508268",
  certificateNo: "200123175",
  taxStatus: {
    ru: "является плательщиком налога на прибыль на общих основаниях",
    uk: "є платником податку на прибуток на загальних підставах",
  },
  correspondenceAddress: {
    ru: "г. Запорожье, Н. Почта, отд. 29",
    uk: "м. Запоріжжя, Н. Пошта, відд. 29",
  },
  phone: "(067) 6134828",
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCTS_CATALOG_PATH = path.join(__dirname, "..", "products-catalog.json");
let productsCatalogCache = null;
let pdfFontPathCache = null;

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

function pdfSafeText(s) {
  return String(s ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePdfFontPath() {
  if (pdfFontPathCache !== null) return pdfFontPathCache || null;
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/Library/Fonts/Times New Roman.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode MS.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        pdfFontPathCache = p;
        return p;
      }
    } catch {
      /* ignore */
    }
  }
  pdfFontPathCache = "";
  return null;
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

function deliveryMethodLabelUk(method) {
  const m = String(method || "").trim().toLowerCase();
  const map = {
    nova_poshta: "Нова Пошта",
    ukrposhta: "Укрпошта",
    meest: "Meest Express",
    autolux: "Автолюкс",
    pickup: "Самовивіз",
    courier: "Кур'єр НП",
    agreement: "За погодженням",
    other: "За погодженням",
    invoice_only: "За погодженням",
  };
  return map[m] || (m ? m : "За погодженням");
}

function invoiceDeliveryText(lead) {
  const method = deliveryMethodLabelUk(lead?.deliveryMethod);
  const city = String(lead?.deliveryCity || "").trim();
  const point = String(lead?.deliveryPoint || "").trim();
  const details = [city, point].filter(Boolean).join(", ");
  return details ? `${method}: ${details}` : method;
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

function readProductsCatalogForInvoices() {
  if (productsCatalogCache) return productsCatalogCache;
  try {
    const raw = fs.readFileSync(PRODUCTS_CATALOG_PATH, "utf8");
    const arr = JSON.parse(raw);
    productsCatalogCache = Array.isArray(arr) ? arr : [];
  } catch {
    productsCatalogCache = [];
  }
  return productsCatalogCache;
}

function parseNameAndPackFromDetails(rawDetails, rawTitle) {
  const details = String(rawDetails || "").trim();
  const parts = details
    .split(/(?:\s[·•]\s|\s-\s|\s\|\s)/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const detailsName = String(parts[0] || "")
    .replace(/^Емаль\s+Артикул:\s*\d+\s*$/i, "")
    .trim();
  const detailsPackRaw = String(
    parts.find((p) => /(банк|барабан|ведр|відр|кг|kg|л\b|литр)/i.test(String(p || ""))) || ""
  );
  const detailsPack = detailsPackRaw
    .replace(/\s*[·•-]\s*(с\s*ндс|без\s*ндс|з\s*пдв|без\s*пдв).*/i, "")
    .replace(/\s*×\s*\d+\s*$/i, "")
    .trim();
  const titleFallback = String(rawTitle || "")
    .replace(/^Емаль\s+Артикул:\s*\d+\s*$/i, "")
    .trim();
  return {
    name: detailsName || titleFallback || "—",
    pack: detailsPack,
  };
}

function derivePackFromCartItem(item, product) {
  const pack = String(item?.packType || "").toLowerCase();
  if (!product) return "";
  if (pack === "bucket") return `Ведро ${Number(product.bucketKg || 0) || ""} кг`.replace(/\s+/g, " ").trim();
  if (pack === "drum") return `Барабан ${Number(product.drumKg || 0) || ""} кг`.replace(/\s+/g, " ").trim();
  const custom = Number(item?.customKg || 0);
  const jarKg = custom > 0 ? custom : Number(product.jarSmallKg || product.jarKg || 0);
  return `Банка ${jarKg || ""} кг`.replace(/\s+/g, " ").trim();
}

function parseInvoiceRows(lead) {
  const rows = Array.isArray(lead?.cartSnapshot) ? lead.cartSnapshot : [];
  const cart = Array.isArray(lead?.cart) ? lead.cart : [];
  const byId = new Map(
    readProductsCatalogForInvoices()
      .map((p) => [String(p?.id || "").trim(), p])
      .filter(([id]) => id)
  );
  let idx = 1;
  return rows
    .map((r, i) => {
      const cartItem = cart[i] || null;
      const product = cartItem?.productId ? byId.get(String(cartItem.productId)) : null;
      const rawTitle = r?.title || r?.name || r?.productName || r?.itemName || r?.label || "";
      const rawDetails = r?.details || r?.pack || r?.packLabel || r?.variant || "";
      const parsed = parseNameAndPackFromDetails(rawDetails, rawTitle);
      const productName =
        String(product?.name || product?.title || "").trim() ||
        String(parsed.name || "").trim() ||
        String(rawTitle || "").trim() ||
        `Товар ${i + 1}`;
      const packLabel =
        String(parsed.pack || "").trim() ||
        String(rawDetails || "").trim() ||
        derivePackFromCartItem(cartItem, product);
      const packKgMatch = String(packLabel || "").match(/(\d+(?:[.,]\d+)?)\s*кг/i);
      const packKg = packKgMatch ? Number(String(packKgMatch[1]).replace(",", ".")) : 0;
      const qty = Math.max(0, Number(r?.qty || 0));
      const qtyKg = Number.isFinite(packKg) && packKg > 0 ? Math.round(packKg * qty * 1000) / 1000 : qty;
      const sum = Number(r?.lineTotal || 0);
      const unit = qtyKg > 0 && Number.isFinite(sum) ? Math.round((sum / qtyKg) * 100) / 100 : null;
      return {
        n: idx++,
        title: productName,
        details: packLabel,
        qty: qtyKg > 0 ? qtyKg : 0,
        unitPriceVat: unit,
        lineTotalVat: Number.isFinite(sum) ? Math.round(sum * 100) / 100 : 0,
      };
    })
    .filter((r) => r.title);
}

function invoiceNumberByLead(lead) {
  const id = Number(lead?.id || 0) || 0;
  const dt = new Date(lead?.createdAt || Date.now());
  const y = String(dt.getFullYear());
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `RF-${y}${m}${d}-${id}`;
}

function normalizeSellerRequisites(input) {
  const src = input && typeof input === "object" ? input : LEGAL_SELLER_REQUISITES_FALLBACK;
  return {
    companyName: {
      ru: String(src?.companyName?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.companyName.ru),
      uk: String(src?.companyName?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.companyName.uk),
    },
    address: {
      ru: String(src?.address?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.address.ru),
      uk: String(src?.address?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.address.uk),
    },
    iban: String(src?.iban || LEGAL_SELLER_REQUISITES_FALLBACK.iban),
    bank: {
      ru: String(src?.bank?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.bank.ru),
      uk: String(src?.bank?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.bank.uk),
    },
    mfo: String(src?.mfo || LEGAL_SELLER_REQUISITES_FALLBACK.mfo),
    edrpou: String(src?.edrpou || LEGAL_SELLER_REQUISITES_FALLBACK.edrpou),
    ipn: String(src?.ipn || LEGAL_SELLER_REQUISITES_FALLBACK.ipn),
    certificateNo: String(src?.certificateNo || LEGAL_SELLER_REQUISITES_FALLBACK.certificateNo),
    taxStatus: {
      ru: String(src?.taxStatus?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.taxStatus.ru),
      uk: String(src?.taxStatus?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.taxStatus.uk),
    },
    correspondenceAddress: {
      ru: String(src?.correspondenceAddress?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.correspondenceAddress.ru),
      uk: String(src?.correspondenceAddress?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.correspondenceAddress.uk),
    },
    phone: String(src?.phone || LEGAL_SELLER_REQUISITES_FALLBACK.phone),
  };
}

async function buildInvoiceXlsxBuffer(lead, rows, invoiceNo, sellerRequisites) {
  const createdAt = new Date(lead?.createdAt || Date.now());
  const dateLabel = `${String(createdAt.getDate()).padStart(2, "0")}.${String(createdAt.getMonth() + 1).padStart(2, "0")}.${createdAt.getFullYear()}`;
  const monthNamesUk = [
    "Січня",
    "Лютого",
    "Березня",
    "Квітня",
    "Травня",
    "Червня",
    "Липня",
    "Серпня",
    "Вересня",
    "Жовтня",
    "Листопада",
    "Грудня",
  ];
  const longDateUk = `${createdAt.getDate()} ${monthNamesUk[createdAt.getMonth()]} ${createdAt.getFullYear()} р.`;
  const total = rows.reduce((s, r) => s + (Number(r.lineTotalVat) || 0), 0);
  const totalNoVat = Math.round((total / 1.2) * 100) / 100;
  const vat = Math.round((total - totalNoVat) * 100) / 100;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice");

  ws.columns = [
    { width: 5.8 }, // A
    { width: 32 }, // B
    { width: 24 }, // C
    { width: 1.2 }, // D spacer
    { width: 7 }, // E
    { width: 14 }, // F
    { width: 16 }, // G
    { width: 16 }, // H
  ];

  const sellerName = sellerRequisites.companyName?.uk || "ТОВ Виробниче підприємство \"Дніпрохім\"";
  const buyerName = lead?.billingCompanyName || lead?.customerName || "—";
  const sellerBank = `Р/р ${sellerRequisites.iban} в ${sellerRequisites.bank?.uk || ""} МФО ${sellerRequisites.mfo}`;
  const deliveryText = invoiceDeliveryText(lead);

  ws.mergeCells("C1:H1");
  ws.mergeCells("C2:H2");
  ws.mergeCells("C3:H3");
  ws.mergeCells("C4:H4");
  ws.mergeCells("C5:H5");
  ws.mergeCells("C6:H6");
  ws.mergeCells("C7:H7");
  ws.mergeCells("C9:H9");
  ws.mergeCells("C10:H10");
  ws.mergeCells("C11:H11");
  ws.mergeCells("C12:H12");
  ws.mergeCells("C13:H13");
  ws.getCell("B1").value = "Постачальник";
  ws.getCell("B1").font = { name: "Arial", size: 10, bold: true, underline: true };
  ws.getCell("C1").value = sellerName;
  ws.getCell("C2").value = `код ЄДРПОУ ${sellerRequisites.edrpou}, тел. ${sellerRequisites.phone}`;
  ws.getCell("C3").value = sellerBank;
  ws.getCell("C4").value = `ІПН ${sellerRequisites.ipn}, номер свідоцтва ${sellerRequisites.certificateNo}`;
  ws.getCell("C5").value = String(sellerRequisites.taxStatus?.uk || "");
  ws.getCell("C6").value = `Адреса юридична: ${sellerRequisites.address.uk}`;
  ws.getCell("C7").value = `Адреса поштова :  ${sellerRequisites.correspondenceAddress.uk}`;

  ws.getCell("B9").value = "Одержувач";
  ws.getCell("B9").font = { name: "Arial", size: 10, bold: true, underline: true };
  ws.getCell("C9").value = buyerName;
  ws.getCell("C10").value = `тел. ${lead?.phone || "—"}`;
  ws.getCell("B11").value = "Платник";
  ws.getCell("B11").font = { name: "Arial", size: 10, bold: true, underline: true };
  ws.getCell("C11").value = "той самий";
  ws.getCell("B12").value = "Замовлення";
  ws.getCell("B12").font = { name: "Arial", size: 10, bold: true, underline: true };
  ws.getCell("C12").value = "Без замовлення";
  ws.getCell("B13").value = "Доставка";
  ws.getCell("B13").font = { name: "Arial", size: 10, bold: true, underline: true };
  ws.getCell("C13").value = deliveryText;

  for (let r = 1; r <= 13; r++) {
    ws.getCell(`C${r}`).font = { name: "Arial", size: 10 };
    ws.getCell(`C${r}`).alignment = { horizontal: "left", vertical: "top", wrapText: false };
  }

  // Title block (A14:H15 merged like template)
  ws.mergeCells("A14:H14");
  ws.mergeCells("A15:H15");
  ws.getCell("A14").value = `Рахунок-фактура № ${invoiceNo}`;
  ws.getCell("A15").value = `від ${longDateUk}`;
  ws.getCell("A14").font = { name: "Arial", size: 12, bold: true };
  ws.getCell("A15").font = { name: "Arial", size: 12, bold: true };
  ws.getCell("A14").alignment = { horizontal: "center", vertical: "bottom" };
  ws.getCell("A15").alignment = { horizontal: "center", vertical: "bottom" };

  const headerRow = 17;
  const header = ["№", "Найменування товару", "", "", "Од.", "Кількість", "Ціна без ПДВ", "Сума без ПДВ"];
  ws.mergeCells("B17:D17");
  header.forEach((v, i) => {
    if (i === 2 || i === 3) return;
    const c = ws.getCell(headerRow, i + 1);
    c.value = v;
    c.font = { name: "Arial", size: 10, bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6E6" } };
    c.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  let dataRow = headerRow + 1;
  for (const r of rows) {
    const lineNoVat = Math.round(((r.lineTotalVat || 0) / 1.2) * 100) / 100;
    const unitNoVat = Number(r.qty || 0) > 0 ? Math.round((lineNoVat / Number(r.qty || 0)) * 100) / 100 : 0;
    ws.mergeCells(`B${dataRow}:D${dataRow}`);
    const packOnly = String(r.details || "")
      .replace(/\s*\d+(?:[.,]\d+)?\s*кг/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const titleWithPack = `${r.title || "—"}${packOnly ? ` (${packOnly})` : ""}`;
    const vals = [r.n, titleWithPack, null, null, "кг", r.qty, unitNoVat, lineNoVat];
    vals.forEach((v, i) => {
      if (i === 2 || i === 3) return;
      const c = ws.getCell(dataRow, i + 1);
      c.value = v;
      c.alignment =
        i >= 5
          ? { horizontal: "right", vertical: "top" }
          : i === 4
            ? { horizontal: "center", vertical: "top" }
            : { horizontal: "left", vertical: "top", wrapText: true };
      c.font = { name: "Arial", size: i === 0 ? 8 : 10, bold: false };
      c.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (i === 6 || i === 7) c.numFmt = "0.00";
      if (i === 5) c.numFmt = "0.000";
    });
    dataRow++;
  }

  const totalRow1 = dataRow;
  const totalRow2 = dataRow + 1;
  const totalRow3 = dataRow + 2;
  const rowsTotals = [
    [totalRow1, "Разом без ПДВ:", totalNoVat],
    [totalRow2, "ПДВ:", vat],
    [totalRow3, "Всього з ПДВ:", total],
  ];
  rowsTotals.forEach(([r, label, value]) => {
    ws.mergeCells(`A${r}:G${r}`);
    const lc = ws.getCell(`A${r}`);
    lc.value = label;
    lc.font = { name: "Arial", size: 11, bold: true };
    lc.alignment = { horizontal: "right", vertical: "middle" };
    const vc = ws.getCell(`H${r}`);
    vc.value = value;
    vc.numFmt = "0.00";
    vc.font = { name: "Arial", size: 11, bold: true };
    vc.alignment = { horizontal: "right", vertical: "middle" };
    ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      ws.getCell(`${col}${r}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });
  });

  const wordsRow = totalRow3 + 2;
  ws.getCell(`A${wordsRow}`).value = "Всього на суму:";
  ws.getCell(`A${wordsRow}`).font = { name: "Arial", size: 11, bold: false };
  ws.mergeCells(`A${wordsRow + 1}:H${wordsRow + 1}`);
  ws.getCell(`A${wordsRow + 1}`).value = `Сума до сплати: ${total.toFixed(2)} грн`;
  ws.getCell(`A${wordsRow + 1}`).font = { name: "Arial", size: 11, bold: true };
  ws.getCell(`A${wordsRow + 2}`).value = `ПДВ: ${vat.toFixed(2)} грн.`;
  ws.getCell(`A${wordsRow + 2}`).font = { name: "Arial", size: 11, bold: false };

  ws.getCell(`E${wordsRow + 4}`).value = "Виписав(ла):";
  ws.getCell(`E${wordsRow + 4}`).font = { name: "Arial", size: 11, bold: false };
  ws.mergeCells(`G${wordsRow + 5}:H${wordsRow + 5}`);
  ws.getCell(`G${wordsRow + 5}`).value = "директор Приходько В. М.";
  ws.getCell(`G${wordsRow + 5}`).font = { name: "Arial", size: 9, bold: false };
  ws.getCell(`G${wordsRow + 5}`).alignment = { horizontal: "center", vertical: "top" };
  ws.getCell(`G${wordsRow + 5}`).border = {
    top: { style: "thin", color: { argb: "FF000000" } },
  };

  const dueDate = new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000);
  ws.mergeCells(`E${wordsRow + 8}:H${wordsRow + 8}`);
  ws.getCell(`E${wordsRow + 8}`).value = `Рахунок дійсний до сплати до ${String(dueDate.getDate()).padStart(2, "0")}.${String(
    dueDate.getMonth() + 1
  ).padStart(2, "0")}.${String(dueDate.getFullYear()).slice(-2)}`;
  ws.getCell(`E${wordsRow + 8}`).font = { name: "Arial", size: 10, bold: true };
  ws.getCell(`E${wordsRow + 8}`).alignment = { horizontal: "right", vertical: "center" };

  // Row heights similar to sample
  {
    const heights = {
      1: 12,
      2: 14.65,
      3: 24,
      4: 14.65,
      5: 14.65,
      6: 14.65,
      7: 14.65,
      8: 4,
      9: 12,
      10: 14.65,
      11: 15.75,
      12: 14.65,
      14: 17,
      15: 17,
      17: 14.65,
      18: 12,
    };
    Object.entries(heights).forEach(([r, h]) => {
      ws.getRow(Number(r)).height = h;
    });
  }

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `H${headerRow + 1}:H${headerRow + rows.length}`,
      rules: [
        {
          type: "cellIs",
          operator: "greaterThan",
          formulae: ["0"],
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE6F7E9" }, fgColor: { argb: "FFE6F7E9" } },
          },
        },
      ],
    });
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

async function buildInvoicePdfBuffer(lead, rows, invoiceNo, sellerRequisites) {
  const createdAt = new Date(lead?.createdAt || Date.now());
  const dateLabel = `${String(createdAt.getDate()).padStart(2, "0")}.${String(createdAt.getMonth() + 1).padStart(
    2,
    "0"
  )}.${createdAt.getFullYear()}`;
  const total = rows.reduce((s, r) => s + (Number(r.lineTotalVat) || 0), 0);
  const totalNoVat = Math.round((total / 1.2) * 100) / 100;
  const vat = Math.round((total - totalNoVat) * 100) / 100;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const fontPath = resolvePdfFontPath();
    if (fontPath) {
      try {
        doc.font(fontPath);
      } catch {
        /* fallback below */
      }
    }

    const buyerName = lead?.billingCompanyName || lead?.customerName || "—";
    const deliveryText = invoiceDeliveryText(lead);
    const boxX = 40;
    let y = 40;
    const right = 555;
    const tableWidth = right - boxX;
    const labelW = 112;
    const valueX = boxX + labelW + 8;
    const rowH = 18;

    const line = (label, value, bold = false, stroke = true) => {
      const contentWidth = right - valueX - 4;
      const textHeight = doc
        .font(bold ? fontPath || "Helvetica-Bold" : fontPath || "Helvetica")
        .fontSize(10)
        .heightOfString(String(value || ""), { width: contentWidth });
      const actualRowH = Math.max(rowH, Math.ceil(textHeight) + 8);
      if (stroke) doc.rect(boxX, y, tableWidth, actualRowH).stroke("#000000");
      if (label) {
        doc.font(fontPath || "Helvetica-Bold").fontSize(10).text(label, boxX + 4, y + 4, {
          width: labelW - 6,
          height: actualRowH - 6,
          lineBreak: true,
        });
      }
      doc.font(bold ? fontPath || "Helvetica-Bold" : fontPath || "Helvetica")
        .fontSize(10)
        .text(value, valueX, y + 4, {
          width: contentWidth,
          height: actualRowH - 6,
          lineBreak: true,
        });
      y += actualRowH;
    };

    line("Постачальник", String(sellerRequisites.companyName?.uk || 'ТОВ Виробниче підприємство "Дніпрохім"'), true);
    line("", `код ЄДРПОУ ${sellerRequisites.edrpou}, тел. ${sellerRequisites.phone}`);
    line("", `Р/р ${sellerRequisites.iban} в ${sellerRequisites.bank?.uk || ""} МФО ${sellerRequisites.mfo}`);
    line("", `ІПН ${sellerRequisites.ipn}, номер свідоцтва ${sellerRequisites.certificateNo}`);
    line("", String(sellerRequisites.taxStatus?.uk || ""));
    line("", `Адреса юридична: ${sellerRequisites.address.uk}`);
    line("", `Адреса поштова: ${sellerRequisites.correspondenceAddress.uk}`);
    y += 4;
    line("Одержувач", buyerName, true);
    line("", `тел. ${lead?.phone || "—"}`);
    line("Платник", "той самий", true);
    line("Замовлення", "Без замовлення", true);
    line("Доставка", deliveryText, true);

    y += 8;
    doc.font(fontPath || "Helvetica-Bold").fontSize(16).text(`Рахунок-фактура № ${invoiceNo}`, boxX, y, {
      width: right - boxX,
      align: "center",
    });
    y += 24;
    doc.font(fontPath || "Helvetica-Bold").fontSize(14).text(`від ${dateLabel} р.`, boxX, y, {
      width: right - boxX,
      align: "center",
    });
    y += 28;

    const cols = [
      { key: "n", title: "№", w: 26 },
      { key: "title", title: "Найменування товару", w: 230 },
      { key: "u", title: "Од.", w: 36 },
      { key: "q", title: "Кількість", w: 70 },
      { key: "p", title: "Ціна без ПДВ", w: 76 },
      { key: "s", title: "Сума без ПДВ", w: 77 },
    ];
    const ensureSpace = (neededHeight) => {
      const bottom = doc.page.height - (doc.page.margins?.bottom || 40);
      if (y + neededHeight <= bottom) return;
      doc.addPage();
      y = 40;
    };
    let x = boxX;
    doc.lineWidth(1);
    cols.forEach((c) => {
      doc.rect(x, y, c.w, 24).fillAndStroke("#e6e6e6", "#000000");
      doc.fillColor("#000000")
        .font(fontPath || "Helvetica-Bold")
        .fontSize(10)
        .text(c.title, x + 2, y + 6, { width: c.w - 4, align: "center" });
      x += c.w;
    });
    y += 24;

    rows.forEach((r, idx) => {
      ensureSpace(24);
      const rowNoVat = Math.round(((r.lineTotalVat || 0) / 1.2) * 100) / 100;
      const unitNoVat = r.qty > 0 ? Math.round((rowNoVat / r.qty) * 100) / 100 : 0;
      const packOnly = String(r.details || "")
        .replace(/\s*\d+(?:[.,]\d+)?\s*кг/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const titleWithPack = `${r.title || "—"}${packOnly ? ` (${packOnly})` : ""}`;
      const data = [
        String(r.n || ""),
        titleWithPack,
        "кг",
        Number(r.qty || 0).toFixed(3),
        unitNoVat.toFixed(2),
        rowNoVat.toFixed(2),
      ];
      x = boxX;
      cols.forEach((c, i) => {
        if (idx % 2 === 1) {
          doc.rect(x, y, c.w, 22).fillAndStroke("#fafafa", "#000000");
        } else {
          doc.rect(x, y, c.w, 22).stroke("#000000");
        }
        doc.fillColor("#000000");
        doc.font(fontPath || "Helvetica")
          .fontSize(i === 0 ? 9 : 10)
          .text(String(data[i] || ""), x + 2, y + 6, {
            width: c.w - 4,
            align: i >= 3 ? "right" : i === 2 ? "center" : "left",
          });
        x += c.w;
      });
      y += 22;
    });

    const totals = [
      ["Разом без ПДВ:", totalNoVat],
      ["ПДВ:", vat],
      ["Всього з ПДВ:", total],
    ];
    ensureSpace(22 * totals.length + 150);
    totals.forEach(([label, val]) => {
      const labelX = boxX + cols[0].w + cols[1].w + cols[2].w;
      const labelW = cols[3].w + cols[4].w;
      doc.rect(labelX, y, labelW, 22).fillAndStroke("#f2f2f2", "#000000");
      doc.rect(labelX + labelW, y, cols[5].w, 22).fillAndStroke("#f2f2f2", "#000000");
      doc.fillColor("#000000");
      doc.font(fontPath || "Helvetica-Bold").fontSize(12).text(label, labelX + 4, y + 5, { width: labelW - 8, align: "right" });
      doc.text(Number(val).toFixed(2), labelX + labelW + 4, y + 5, { width: cols[5].w - 8, align: "right" });
      y += 22;
    });

    y += 18;
    doc.font(fontPath || "Helvetica").fontSize(12).text("Всього на суму:", boxX, y);
    y += 20;
    doc.font(fontPath || "Helvetica-Bold").text(`Сума до сплати: ${total.toFixed(2)} грн`, boxX, y);
    y += 20;
    doc.font(fontPath || "Helvetica").text(`ПДВ: ${vat.toFixed(2)} грн.`, boxX, y);
    y += 40;
    doc.text("Виписав(ла):", 320, y);
    doc.moveTo(410, y + 12).lineTo(555, y + 12).stroke("#000000");
    doc.fontSize(10).text("директор Приходько В. М.", 420, y + 16, { width: 130, align: "center" });
    y += 60;
    const due = new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000);
    const dueLabel = `${String(due.getDate()).padStart(2, "0")}.${String(due.getMonth() + 1).padStart(2, "0")}.${String(
      due.getFullYear()
    ).slice(-2)}`;
    doc.font(fontPath || "Helvetica-Bold").fontSize(12).text(`Рахунок дійсний до сплати до ${dueLabel}`, boxX, y, {
      width: right - boxX,
      align: "right",
    });
    doc.end();
  });
}

export async function sendLegalInvoiceDocumentsMail(lead, sellerRequisitesInput = null) {
  const t = getTransporter();
  if (!t || !lead) return null;
  const checkoutLegal = String(lead.source || "") === "checkout" && Boolean(lead.isLegalEntityBuyer);
  if (!checkoutLegal) return null;
  const toEmail =
    (isValidEmail(lead.billingInvoiceEmail) && String(lead.billingInvoiceEmail).trim()) ||
    (isValidEmail(lead.email) && String(lead.email).trim()) ||
    "";
  if (!toEmail) return null;
  const rows = parseInvoiceRows(lead);
  if (!rows.length) return null;
  const sellerRequisites = normalizeSellerRequisites(sellerRequisitesInput);
  const invoiceNo = invoiceNumberByLead(lead);
  const xlsxBuffer = await buildInvoiceXlsxBuffer(lead, rows, invoiceNo, sellerRequisites);
  const pdfBuffer = await buildInvoicePdfBuffer(lead, rows, invoiceNo, sellerRequisites);
  const fmt = String(lead?.legalInvoiceFormat || "both").trim().toLowerCase();
  const total = rows.reduce((s, r) => s + (Number(r.lineTotalVat) || 0), 0);
  const subject = `[Reaxon] Рахунок-фактура ${invoiceNo}`;
  const text = [
    `Надсилаємо рахунок-фактуру ${invoiceNo}.`,
    `Заявка: #${lead.id}`,
    `Сума з ПДВ: ${formatMoneyUa(total)}`,
    `Реквізити продавця: ${sellerRequisites.address.uk}; код ЄДРПОУ ${sellerRequisites.edrpou}; ІПН ${sellerRequisites.ipn}; св-во № ${sellerRequisites.certificateNo}; адреса для кореспонденції: ${sellerRequisites.correspondenceAddress.uk}; тел. ${sellerRequisites.phone}.`,
    "Вкладення: Excel та PDF.",
  ].join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;max-width:620px;">
  <h1 style="font-size:19px;">Рахунок-фактура / Счет-фактура</h1>
  <p>Заявка <strong>#${escapeHtml(String(lead.id || ""))}</strong>, номер документа <strong>${escapeHtml(invoiceNo)}</strong>.</p>
  <p>Сума з ПДВ: <strong>${escapeHtml(formatMoneyUa(total))}</strong>.</p>
  <p><strong>Реквізити продавця:</strong><br/>
  ${escapeHtml(sellerRequisites.address.uk)}<br/>
  код ЄДРПОУ ${escapeHtml(sellerRequisites.edrpou)}; ІПН ${escapeHtml(sellerRequisites.ipn)}; св-во № ${escapeHtml(
    sellerRequisites.certificateNo
  )}<br/>
  адреса для кореспонденції: ${escapeHtml(sellerRequisites.correspondenceAddress.uk)}; тел. ${escapeHtml(
    sellerRequisites.phone
  )}</p>
  <p>У вкладеннях: <strong>Excel (.xlsx)</strong> та <strong>PDF</strong>.</p>
  <p style="color:#64748b;font-size:13px;">Лист сформовано автоматично.</p>
  </body></html>`;
  const info = await t.sendMail({
    from: MAIL_FROM,
    to: toEmail,
    bcc: MAIL_BCC && isValidEmail(MAIL_BCC) ? MAIL_BCC : undefined,
    subject,
    text,
    html,
    attachments: [
      ...(fmt === "both" || fmt === "xlsx"
        ? [
            {
              filename: `invoice-${invoiceNo}.xlsx`,
              content: xlsxBuffer,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ]
        : []),
      ...(fmt === "both" || fmt === "pdf"
        ? [
            {
              filename: `invoice-${invoiceNo}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : []),
    ],
  });
  return info;
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
