/**
 * Транзакционная почта (Gmail SMTP + App Password).
 * Включается при заданных SMTP_USER и SMTP_PASS в .env — см. .env.example.
 */
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

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
  address: "69002, м. Запоріжжя, вул. Костянтина Великого, буд. 20",
  edrpou: "32297953",
  ipn: "322979508268",
  certNo: "200123175",
  correspondence: "м. Запоріжжя, Н. Пошта, відд. 29",
  phone: "(067) 6134828",
};

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

function parseInvoiceRows(lead) {
  const rows = Array.isArray(lead?.cartSnapshot) ? lead.cartSnapshot : [];
  let idx = 1;
  return rows
    .map((r) => {
      const qty = Math.max(0, Number(r?.qty || 0));
      const sum = Number(r?.lineTotal || 0);
      const unit = qty > 0 && Number.isFinite(sum) ? Math.round((sum / qty) * 100) / 100 : null;
      return {
        n: idx++,
        title: String(r?.title || "—").trim(),
        details: String(r?.details || "").trim(),
        qty: qty > 0 ? qty : 0,
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
    address: {
      ru: String(src?.address?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.address.ru),
      uk: String(src?.address?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.address.uk),
    },
    edrpou: String(src?.edrpou || LEGAL_SELLER_REQUISITES_FALLBACK.edrpou),
    ipn: String(src?.ipn || LEGAL_SELLER_REQUISITES_FALLBACK.ipn),
    certificateNo: String(src?.certificateNo || LEGAL_SELLER_REQUISITES_FALLBACK.certificateNo),
    correspondenceAddress: {
      ru: String(src?.correspondenceAddress?.ru || LEGAL_SELLER_REQUISITES_FALLBACK.correspondenceAddress.ru),
      uk: String(src?.correspondenceAddress?.uk || LEGAL_SELLER_REQUISITES_FALLBACK.correspondenceAddress.uk),
    },
    phone: String(src?.phone || LEGAL_SELLER_REQUISITES_FALLBACK.phone),
  };
}

async function buildInvoiceXlsxBuffer(lead, rows, invoiceNo, sellerRequisites) {
  const createdAt = new Date(lead?.createdAt || Date.now());
  const dateLabel = `${String(createdAt.getDate()).padStart(2, "0")}.${String(createdAt.getMonth() + 1).padStart(
    2,
    "0"
  )}.${createdAt.getFullYear()}`;
  const total = rows.reduce((s, r) => s + (Number(r.lineTotalVat) || 0), 0);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice");

  ws.columns = [
    { width: 6 },
    { width: 40 },
    { width: 36 },
    { width: 10 },
    { width: 18 },
    { width: 18 },
  ];

  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "Рахунок-фактура / Рахунок на оплату";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };
  titleCell.border = {
    top: { style: "thin", color: { argb: "FF9FB6D0" } },
    left: { style: "thin", color: { argb: "FF9FB6D0" } },
    bottom: { style: "thin", color: { argb: "FF9FB6D0" } },
    right: { style: "thin", color: { argb: "FF9FB6D0" } },
  };

  const reqRows = [
    ["Номер", invoiceNo],
    ["Дата", dateLabel],
    [],
    ["Реквізити продавця", ""],
    ["Адреса", sellerRequisites.address.uk],
    ["Код ЄДРПОУ", sellerRequisites.edrpou],
    ["ІПН", sellerRequisites.ipn],
    ["Св-во №", sellerRequisites.certificateNo],
    ["Адреса для кореспонденції", sellerRequisites.correspondenceAddress.uk],
    ["Телефон", sellerRequisites.phone],
    [],
    ["Покупець", lead?.billingCompanyName || lead?.customerName || "—"],
    ["ЄДРПОУ покупця", lead?.billingEdrpou || "—"],
    ["Email для рахунків", lead?.billingInvoiceEmail || lead?.email || "—"],
    ["Юридична адреса покупця", lead?.billingLegalAddress || "—"],
    [],
  ];

  let rowCursor = 2;
  for (const row of reqRows) {
    ws.getCell(`A${rowCursor}`).value = row[0] || "";
    ws.getCell(`B${rowCursor}`).value = row[1] || "";
    if (row[0] === "Реквізити продавця") {
      ws.getCell(`A${rowCursor}`).font = { bold: true };
      ws.getCell(`A${rowCursor}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FC" } };
    }
    rowCursor++;
  }

  const headerRow = rowCursor;
  const header = ["№", "Найменування товару", "Фасовка / деталі", "К-сть", "Ціна з ПДВ, грн", "Сума з ПДВ, грн"];
  header.forEach((v, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = v;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBFA" } };
    c.border = {
      top: { style: "thin", color: { argb: "FF9FB6D0" } },
      left: { style: "thin", color: { argb: "FF9FB6D0" } },
      bottom: { style: "thin", color: { argb: "FF9FB6D0" } },
      right: { style: "thin", color: { argb: "FF9FB6D0" } },
    };
  });

  let dataRow = headerRow + 1;
  for (const r of rows) {
    const vals = [r.n, r.title, r.details, r.qty, r.unitPriceVat == null ? "" : r.unitPriceVat, r.lineTotalVat];
    vals.forEach((v, i) => {
      const c = ws.getCell(dataRow, i + 1);
      c.value = v;
      c.alignment =
        i >= 3 ? { horizontal: "right", vertical: "middle" } : { horizontal: "left", vertical: "middle", wrapText: true };
      c.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      if (i >= 4) c.numFmt = "#,##0.00";
    });
    dataRow++;
  }

  const totalRow = dataRow + 1;
  ws.mergeCells(`A${totalRow}:E${totalRow}`);
  const totalLabel = ws.getCell(`A${totalRow}`);
  totalLabel.value = "Разом з ПДВ";
  totalLabel.font = { bold: true };
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };

  const totalVal = ws.getCell(`F${totalRow}`);
  totalVal.value = Math.round(total * 100) / 100;
  totalVal.numFmt = "#,##0.00";
  totalVal.font = { bold: true };
  totalVal.alignment = { horizontal: "right", vertical: "middle" };
  totalVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };
  totalVal.border = {
    top: { style: "thin", color: { argb: "FF9FB6D0" } },
    left: { style: "thin", color: { argb: "FF9FB6D0" } },
    bottom: { style: "thin", color: { argb: "FF9FB6D0" } },
    right: { style: "thin", color: { argb: "FF9FB6D0" } },
  };

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `F${headerRow + 1}:F${headerRow + rows.length}`,
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
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Invoice / Proforma");
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Invoice No: ${pdfSafeText(invoiceNo)}`);
    doc.text(`Date: ${pdfSafeText(dateLabel)}`);
    doc.moveDown(0.6);
    doc.text("Seller details:");
    doc.text(`Address: ${pdfSafeText(sellerRequisites.address.uk)}`);
    doc.text(`EDRPOU: ${pdfSafeText(sellerRequisites.edrpou)}`);
    doc.text(`IPN: ${pdfSafeText(sellerRequisites.ipn)}`);
    doc.text(`Certificate: ${pdfSafeText(sellerRequisites.certificateNo)}`);
    doc.text(`Correspondence: ${pdfSafeText(sellerRequisites.correspondenceAddress.uk)}`);
    doc.text(`Phone: ${pdfSafeText(sellerRequisites.phone)}`);
    doc.moveDown(0.6);
    doc.text(`Buyer: ${pdfSafeText(lead?.billingCompanyName || lead?.customerName || "-")}`);
    doc.text(`Buyer EDRPOU: ${pdfSafeText(lead?.billingEdrpou || "-")}`);
    doc.text(`Billing email: ${pdfSafeText(lead?.billingInvoiceEmail || lead?.email || "-")}`);
    doc.text(`Legal address: ${pdfSafeText(lead?.billingLegalAddress || "-")}`);
    doc.moveDown(0.6);

    const header = "No Item name                         Pack/details                  Qty     Unit(VAT)     Total(VAT)";
    doc.fontSize(9).text(header);
    doc.moveDown(0.2);
    rows.forEach((r) => {
      const line = `${String(r.n).padEnd(3, " ")}${pdfSafeText(r.title).slice(0, 30).padEnd(32, " ")}${pdfSafeText(r.details)
        .slice(0, 28)
        .padEnd(30, " ")}${String(r.qty).padEnd(7, " ")}${String((r.unitPriceVat ?? 0).toFixed(2)).padEnd(
        13,
        " "
      )}${String((r.lineTotalVat ?? 0).toFixed(2))}`;
      doc.text(line, { lineBreak: true });
    });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Total VAT incl.: ${total.toFixed(2)} UAH`);
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
