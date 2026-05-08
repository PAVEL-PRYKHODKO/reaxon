import "./lib/load-env.mjs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { DEFAULT_DELIVERY_PAGE_V2 } from "./delivery-v2-defaults.js";
import { initCrmBackend, crmSnapshot, crmUpdate, crmUsesPostgres } from "./lib/crm-backend.js";
import { liqpaySign, liqpayVerify, liqpayDecodeData } from "./lib/liqpay.js";
import { novaPoshtaCall, novaPoshtaListAllWarehouses } from "./lib/nova-poshta.js";
import {
  isTransactionalMailConfigured,
  sendLeadCreatedMails,
  sendWelcomeMail,
  sendSiteInboxMessageMail,
  sendPasswordResetMail,
  sendPaymentReceiptMail,
} from "./lib/transactional-mail.mjs";
import { notifyTelegramBannerLead } from "./lib/telegram-banner-notify.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "crm-db.json");
const UPLOADS_ROOT = path.join(__dirname, "uploads");
const AVATAR_DIR = path.join(UPLOADS_ROOT, "avatars");
const PRODUCT_IMAGES_DIR = path.join(UPLOADS_ROOT, "products");
const HERO_SLIDES_DIR = path.join(UPLOADS_ROOT, "hero-slides");
const PRODUCTS_BANNER_DIR = path.join(UPLOADS_ROOT, "products-banner");
const SITE_CONTENT_PATH = path.join(__dirname, "site-content.json");
const PRODUCTS_CATALOG_PATH = path.join(__dirname, "products-catalog.json");
const PRODUCTS_CATALOG_BACKUP_DIR = path.join(__dirname, "data", "catalog-backups");
const PRODUCTS_DATA_JS_PATH = path.join(__dirname, "products-data.js");
const ANALYTICS_PATH = path.join(__dirname, "analytics-store.json");
const PRIVACY_POLICY_CONFIG_PATH = path.join(__dirname, "privacy-policy-config.json");
const ANALYTICS_MAX_EVENTS = 25000;
const isProd = process.env.NODE_ENV === "production";

/** Не дублировать письма, когда заявку создаёт сотрудник из CRM (с токеном admin/…). */
function isStaffCrmRequest(req) {
  const r = req.user && req.user.role;
  return Boolean(r && ["admin", "moderator", "manager", "accountant"].includes(r));
}
const PORT = Number(process.env.PORT || 3000);
const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL || "";

const LIQPAY_PUBLIC_KEY = String(process.env.LIQPAY_PUBLIC_KEY || "").trim();
const LIQPAY_PRIVATE_KEY = String(process.env.LIQPAY_PRIVATE_KEY || "").trim();
const FONDY_MERCHANT_ID = String(process.env.FONDY_MERCHANT_ID || "").trim();
const FONDY_SECRET_KEY = String(process.env.FONDY_SECRET_KEY || "").trim();
const WAYFORPAY_MERCHANT_ACCOUNT = String(process.env.WAYFORPAY_MERCHANT_ACCOUNT || "").trim();
const WAYFORPAY_SECRET_KEY = String(process.env.WAYFORPAY_SECRET_KEY || "").trim();
const LIQPAY_SANDBOX =
  process.env.LIQPAY_SANDBOX === "1" || String(process.env.LIQPAY_SANDBOX || "").toLowerCase() === "true";
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim();
const NOVAPOSHTA_API_KEY = String(process.env.NOVAPOSHTA_API_KEY || "").trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const AUTH_DEBUG_RESET_URLS =
  process.env.AUTH_DEBUG_RESET_URLS === "1" ||
  String(process.env.AUTH_DEBUG_RESET_URLS || "").toLowerCase() === "true";
const JWT_EXPIRES_IN_ADMIN = String(process.env.JWT_EXPIRES_IN_ADMIN || "7d").trim() || "7d";
const JWT_EXPIRES_IN_USER = String(process.env.JWT_EXPIRES_IN_USER || "30d").trim() || "30d";
const UA_MAJOR_CITIES_PATH = path.join(__dirname, "data", "ua-major-cities.json");
const AUTH_COOKIE_NAME = "dp_auth";

let uaMajorCitiesCache = null;
function readUaMajorCities() {
  if (uaMajorCitiesCache) return uaMajorCitiesCache;
  try {
    const raw = fs.readFileSync(UA_MAJOR_CITIES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    uaMajorCitiesCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    uaMajorCitiesCache = [];
  }
  return uaMajorCitiesCache;
}

function readPrivacyPolicyConfig() {
  try {
    const raw = fs.readFileSync(PRIVACY_POLICY_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

const PRIVACY_POLICY_CONFIG = readPrivacyPolicyConfig() || {};
const PRIVACY_POLICY_VERSION = String(PRIVACY_POLICY_CONFIG.version || "2026-05-08").trim() || "2026-05-08";

function liqpayConfigured() {
  return Boolean(LIQPAY_PUBLIC_KEY && LIQPAY_PRIVATE_KEY);
}

function fondyConfigured() {
  return Boolean(FONDY_MERCHANT_ID && FONDY_SECRET_KEY);
}

function wayforpayConfigured() {
  return Boolean(WAYFORPAY_MERCHANT_ACCOUNT && WAYFORPAY_SECRET_KEY);
}

let JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
if (isProd) {
  if (JWT_SECRET.length < 32) {
    console.error(
      "[security] В production задайте JWT_SECRET не короче 32 символов (переменная окружения или .env). См. .env.example."
    );
    process.exit(1);
  }
} else if (!JWT_SECRET) {
  JWT_SECRET = "dp-coatings-local-secret";
  console.warn(
    "[security] JWT_SECRET не задан — используется локальный секрет. Перед публикацией укажите JWT_SECRET в .env."
  );
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (isProd && ALLOWED_ORIGINS.length === 0) {
  console.error(
    "[security] В production задайте ALLOWED_ORIGINS (разрешённые Origin через запятую). См. .env.example."
  );
  process.exit(1);
}

/** CRM: admin — всё; moderator — заявки (как менеджер), без экспорта и без управления пользователями; accountant — только просмотр + экспорт CSV. */
const ROLE_LABELS_RU = {
  admin: "Администратор",
  client: "Клиент",
  moderator: "Модератор",
  accountant: "Бухгалтер",
  manager: "Менеджер",
  viewer: "Наблюдатель",
};

const PUBLIC_REGISTER_ROLES = new Set(["client", "viewer"]);

/** Роли, которые админ может выставить вручную */
const ADMIN_ASSIGNABLE_ROLES = ["admin", "manager", "moderator", "accountant", "client", "viewer"];
const ROLE_PERMISSION_KEYS = [
  "adminPanel.view",
  "users.view",
  "users.create",
  "users.editRole",
  "users.delete",
  "users.export",
  "leads.view",
  "leads.edit",
  "leads.assign",
  "leads.deleteNotes",
  "leads.export",
  "catalog.view",
  "catalog.edit",
  "catalog.restore",
  "siteContent.edit",
  "media.edit",
  "analytics.view",
];
const ROLE_PERMISSION_LABELS = {
  "adminPanel.view": "Доступ к админ-панели",
  "users.view": "Пользователи: просмотр",
  "users.create": "Пользователи: добавление",
  "users.editRole": "Пользователи: изменение ролей",
  "users.delete": "Пользователи: удаление",
  "users.export": "Пользователи: экспорт CSV",
  "leads.view": "CRM: просмотр заявок",
  "leads.edit": "CRM: редактирование заявок и заметок",
  "leads.assign": "CRM: назначение ответственного",
  "leads.deleteNotes": "CRM: удаление заметок",
  "leads.export": "CRM: экспорт CSV",
  "catalog.view": "Каталог: просмотр админ-данных",
  "catalog.edit": "Каталог: редактирование и импорт прайса",
  "catalog.restore": "Каталог: откат резервных копий",
  "siteContent.edit": "Сайт: редактирование контента",
  "media.edit": "Медиа: загрузка и удаление изображений",
  "analytics.view": "Аналитика: просмотр",
};
const DEFAULT_ROLE_PERMISSIONS = {
  admin: Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, true])),
  moderator: {
    "adminPanel.view": false,
    "users.view": true,
    "users.create": false,
    "users.editRole": false,
    "users.delete": false,
    "users.export": true,
    "leads.view": true,
    "leads.edit": true,
    "leads.assign": true,
    "leads.deleteNotes": false,
    "leads.export": false,
    "catalog.view": false,
    "catalog.edit": false,
    "catalog.restore": false,
    "siteContent.edit": false,
    "media.edit": false,
    "analytics.view": false,
  },
  accountant: {
    "adminPanel.view": false,
    "users.view": true,
    "users.create": false,
    "users.editRole": false,
    "users.delete": false,
    "users.export": true,
    "leads.view": true,
    "leads.edit": false,
    "leads.assign": false,
    "leads.deleteNotes": false,
    "leads.export": true,
    "catalog.view": false,
    "catalog.edit": false,
    "catalog.restore": false,
    "siteContent.edit": false,
    "media.edit": false,
    "analytics.view": false,
  },
  manager: {
    "adminPanel.view": false,
    "users.view": false,
    "users.create": false,
    "users.editRole": false,
    "users.delete": false,
    "users.export": false,
    "leads.view": true,
    "leads.edit": true,
    "leads.assign": true,
    "leads.deleteNotes": false,
    "leads.export": false,
    "catalog.view": false,
    "catalog.edit": false,
    "catalog.restore": false,
    "siteContent.edit": false,
    "media.edit": false,
    "analytics.view": false,
  },
  viewer: Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, false])),
  client: Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, false])),
};

function isLeadStaffRole(role) {
  return role === "admin" || role === "manager" || role === "moderator";
}

function isCrmAccessRole(role) {
  return role === "admin" || role === "moderator" || role === "accountant";
}

function defaultRolePermissions() {
  return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
}

function normalizeRolePermissions(raw) {
  const out = defaultRolePermissions();
  const src = raw && typeof raw === "object" ? raw : {};
  for (const role of ADMIN_ASSIGNABLE_ROLES) {
    const row = src[role] && typeof src[role] === "object" ? src[role] : {};
    for (const key of ROLE_PERMISSION_KEYS) {
      if (role === "admin") out[role][key] = true;
      else if (Object.prototype.hasOwnProperty.call(row, key)) out[role][key] = Boolean(row[key]);
    }
  }
  return out;
}

function roleHasPermission(db, role, permission) {
  if (role === "admin") return true;
  const matrix = normalizeRolePermissions(db?.meta?.rolePermissions);
  return Boolean(matrix[role]?.[permission]);
}

function defaultPrivacy() {
  return {
    hideEmail: false,
    hidePhone: false,
    hideLegalAddress: false,
    hideDeliveryAddress: false,
  };
}

function defaultProfile() {
  return {
    age: null,
    gender: "",
    countryRegion: "",
    lastName: "",
    city: "",
    website: "",
    isLegalEntity: false,
    companyName: "",
    edrpou: "",
    invoiceEmail: "",
    billingIban: "",
    phone: "",
    legalAddress: "",
    deliveryAddress: "",
    accountManagerId: null,
    avatarUrl: null,
    marketingOptIn: false,
    privacy: defaultPrivacy(),
  };
}

function ensureUserProfile(user) {
  if (!user.profile || typeof user.profile !== "object") {
    user.profile = defaultProfile();
    return;
  }
  const base = defaultProfile();
  const p = user.profile;
  for (const k of Object.keys(base)) {
    if (k === "privacy") continue;
    if (p[k] === undefined) p[k] = base[k];
  }
  if (!p.privacy || typeof p.privacy !== "object") p.privacy = defaultPrivacy();
  for (const k of Object.keys(defaultPrivacy())) {
    p.privacy[k] = Boolean(p.privacy[k]);
  }
  if (!Array.isArray(p.siteInbox)) p.siteInbox = [];
}

function profileForClient(u) {
  ensureUserProfile(u);
  const pr = u.profile;
  return {
    age: pr.age,
    gender: pr.gender,
    countryRegion: pr.countryRegion,
    lastName: pr.lastName,
    city: pr.city,
    website: pr.website,
    isLegalEntity: Boolean(pr.isLegalEntity),
    companyName: pr.companyName,
    edrpou: pr.edrpou,
    invoiceEmail: pr.invoiceEmail,
    billingIban: pr.billingIban,
    phone: pr.phone,
    legalAddress: pr.legalAddress,
    deliveryAddress: pr.deliveryAddress,
    accountManagerId: pr.accountManagerId ?? null,
    avatarUrl: pr.avatarUrl,
    privacy: { ...pr.privacy },
  };
}

function publicUser(u) {
  const role = u.role || "client";
  ensureUserProfile(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role,
    roleLabel: ROLE_LABELS_RU[role] || role,
    profile: profileForClient(u),
  };
}

/** Полные данные для CRM (admin / moderator): независимо от флагов приватности. */
function staffUserDto(u) {
  const base = publicUser(u);
  return {
    ...base,
    createdAt: u.createdAt || null,
    profileUpdatedAt: u.profileUpdatedAt || null,
    privacyFlags: { ...u.profile.privacy },
  };
}

function isStaffRole(role) {
  return role === "admin" || role === "moderator";
}

/** Просмотр профиля другим авторизованным пользователем (клиент — с учётом приватности). */
function peerProfileDto(viewerRole, viewerId, target) {
  ensureUserProfile(target);
  const role = target.role || "client";
  const base = {
    id: target.id,
    name: target.name,
    role,
    roleLabel: ROLE_LABELS_RU[role] || role,
    profile: {
      age: target.profile.age,
      gender: target.profile.gender,
      countryRegion: target.profile.countryRegion,
      companyName: target.profile.companyName,
      avatarUrl: target.profile.avatarUrl,
    },
  };
  if (viewerId === target.id || isStaffRole(viewerRole)) {
    return {
      ...base,
      email: target.email,
      profile: {
        ...base.profile,
        phone: target.profile.phone,
        legalAddress: target.profile.legalAddress,
        deliveryAddress: target.profile.deliveryAddress,
      },
      privacy: { ...target.profile.privacy },
      view: viewerId === target.id ? "self" : "staff",
    };
  }
  const { privacy } = target.profile;
  return {
    ...base,
    email: privacy.hideEmail ? null : target.email,
    profile: {
      ...base.profile,
      phone: privacy.hidePhone ? null : target.profile.phone,
      legalAddress: privacy.hideLegalAddress ? null : target.profile.legalAddress,
      deliveryAddress: privacy.hideDeliveryAddress ? null : target.profile.deliveryAddress,
    },
    privacy: { ...privacy },
    view: "peer",
  };
}

/** Нормализует lead.crm и переносит устаревшее строковое managerNote в managerNotes[]. */
function normalizeLeadCrm(lead) {
  if (!lead.crm || typeof lead.crm !== "object") {
    lead.crm = {
      stage: lead.status || "new",
      tags: [],
      managerNote: "",
      managerNotes: [],
      interactions: [],
      clientMessages: [],
      assigneeId: null,
      assigneeName: null,
    };
    return;
  }
  if (!Array.isArray(lead.crm.tags)) lead.crm.tags = [];
  if (!Array.isArray(lead.crm.managerNotes)) lead.crm.managerNotes = [];
  if (!Array.isArray(lead.crm.interactions)) lead.crm.interactions = [];
  if (!Array.isArray(lead.crm.clientMessages)) lead.crm.clientMessages = [];
  for (const n of lead.crm.managerNotes) {
    if (n && (n.id == null || n.id === "")) n.id = randomUUID();
  }
  if (lead.crm.managerNotes.length === 0) {
    const legacy = typeof lead.crm.managerNote === "string" ? lead.crm.managerNote.trim() : "";
    if (legacy) {
      lead.crm.managerNotes.push({
        id: randomUUID(),
        text: legacy,
        authorName: "Ранее",
        authorId: null,
        createdAt: lead.updatedAt || lead.createdAt || new Date().toISOString(),
      });
      lead.crm.managerNote = "";
    }
  }
}

function normalizePhoneForDedup(v) {
  return String(v || "").replace(/\D+/g, "");
}

function mergeDuplicateUsers(db) {
  if (!Array.isArray(db.users) || db.users.length < 2) return 0;
  const keyToMaster = new Map();
  const removeIds = new Set();
  const usersSorted = db.users.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  for (const u of usersSorted) {
    ensureUserProfile(u);
    const emailKey = String(u.email || "").trim().toLowerCase();
    const phoneKey = normalizePhoneForDedup(u.profile?.phone);
    const keys = [];
    if (emailKey) keys.push(`email:${emailKey}`);
    if (phoneKey) keys.push(`phone:${phoneKey}`);
    if (!keys.length) continue;
    let masterId = null;
    for (const key of keys) {
      if (keyToMaster.has(key)) {
        masterId = keyToMaster.get(key);
        break;
      }
    }
    if (masterId == null) {
      for (const key of keys) keyToMaster.set(key, u.id);
      continue;
    }
    const master = db.users.find((x) => x.id === masterId);
    if (!master) continue;
    ensureUserProfile(master);
    if (!master.name && u.name) master.name = u.name;
    if (!master.email && u.email) master.email = u.email;
    for (const field of ["phone", "companyName", "countryRegion", "legalAddress", "deliveryAddress", "avatarUrl", "accountManagerId"]) {
      if (!master.profile[field] && u.profile[field]) master.profile[field] = u.profile[field];
    }
    for (const k of Object.keys(defaultPrivacy())) {
      if (u.profile?.privacy && typeof u.profile.privacy[k] === "boolean") {
        master.profile.privacy[k] = master.profile.privacy[k] && u.profile.privacy[k];
      }
    }
    for (const lead of db.leads || []) {
      normalizeLeadCrm(lead);
      if (lead.crm?.assigneeId === u.id) {
        lead.crm.assigneeId = master.id;
        lead.crm.assigneeName = master.name;
      }
    }
    removeIds.add(u.id);
    for (const key of keys) keyToMaster.set(key, master.id);
  }
  if (!removeIds.size) return 0;
  db.users = db.users.filter((u) => !removeIds.has(u.id));
  return removeIds.size;
}

function normalizeCrmDatabase(db) {
  let changed = false;
  if (!db.meta || typeof db.meta !== "object") db.meta = {};
  if (!Number.isFinite(Number(db.meta.nextCrmEntityId))) {
    db.meta.nextCrmEntityId = 1;
    changed = true;
  }
  if (!db.modules || typeof db.modules !== "object") {
    db.modules = {};
    changed = true;
  }
  const moduleKeys = ["tasks", "calendarEvents", "inventory", "inventoryMovements", "documents", "dropshippers", "campaigns", "finance", "integrations"];
  for (const key of moduleKeys) {
    if (!Array.isArray(db.modules[key])) {
      db.modules[key] = [];
      changed = true;
    }
  }
  const normalizedPerms = normalizeRolePermissions(db.meta.rolePermissions);
  if (JSON.stringify(db.meta.rolePermissions || null) !== JSON.stringify(normalizedPerms)) {
    db.meta.rolePermissions = normalizedPerms;
    changed = true;
  }
  for (const lead of db.leads) {
    const snap = JSON.stringify(lead.crm);
    normalizeLeadCrm(lead);
    if (JSON.stringify(lead.crm) !== snap) changed = true;
  }
  for (const u of db.users) {
    const before = JSON.stringify(u.profile);
    ensureUserProfile(u);
    if (JSON.stringify(u.profile) !== before) changed = true;
  }
  const merged = mergeDuplicateUsers(db);
  if (merged > 0) changed = true;
  return changed;
}

function ensureUploadDirs() {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
  fs.mkdirSync(HERO_SLIDES_DIR, { recursive: true });
  fs.mkdirSync(PRODUCTS_BANNER_DIR, { recursive: true });
}

function normalizeHeroSlides(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, 12)) {
    if (!row || typeof row !== "object") continue;
    const url = String(row.url || "").trim().slice(0, 700);
    if (!url) continue;
    const idRaw = String(row.id || "").trim();
    const id = idRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || randomUUID().replace(/-/g, "").slice(0, 16);
    const alt = String(row.alt || "").trim().slice(0, 240);
    out.push({ id, url, alt });
  }
  return out;
}

const DEFAULT_HERO_SLIDESHOW_SETTINGS = {
  intervalMs: 5500,
  transitionMs: 1050,
  easing: "smooth",
};

function normalizeHeroSlideshowSettings(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  let intervalMs = Number(o.intervalMs);
  if (!Number.isFinite(intervalMs)) intervalMs = DEFAULT_HERO_SLIDESHOW_SETTINGS.intervalMs;
  intervalMs = Math.min(120000, Math.max(2000, Math.round(intervalMs)));
  let transitionMs = Number(o.transitionMs);
  if (!Number.isFinite(transitionMs)) transitionMs = DEFAULT_HERO_SLIDESHOW_SETTINGS.transitionMs;
  transitionMs = Math.min(5000, Math.max(150, Math.round(transitionMs)));
  const allowed = new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out", "smooth"]);
  let easing = String(o.easing || "").trim();
  if (!allowed.has(easing)) easing = DEFAULT_HERO_SLIDESHOW_SETTINGS.easing;
  return { intervalMs, transitionMs, easing };
}

function ensureSiteContentFile() {
  if (!fs.existsSync(SITE_CONTENT_PATH)) {
    fs.writeFileSync(
      SITE_CONTENT_PATH,
      JSON.stringify(
        {
          productOverrides: {},
          heroSlides: [],
          heroSlideshowSettings: DEFAULT_HERO_SLIDESHOW_SETTINGS,
          productsBannerSlides: [],
        },
        null,
        2
      ),
      "utf-8"
    );
  }
}

function clipDeliveryStr(v, max) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

/** Пустая строка в JSON считается «не задано» — подставляем дефолт как в delivery.html. Бейдж карточки может быть пустым. */
function deliveryFieldOrDef(cur, def, max) {
  if (cur === undefined || cur === null) return clipDeliveryStr(def, max);
  const t = clipDeliveryStr(cur, max);
  return t.length === 0 ? clipDeliveryStr(def, max) : t;
}

function deliveryBadgeOrDef(cur, def, max) {
  if (cur === undefined || cur === null) return clipDeliveryStr(def, max);
  return clipDeliveryStr(cur, max);
}

const DEFAULT_DELIVERY_UKRAINE = {
  ru: {
    navUtility: "Доставка по Украине",
    footerLink: "Доставка и оплата",
    pageH1: "Доставка и оплата",
    pageLead:
      "Отправляем эмали, грунтовки и сопутствующие ЛКМ по всей Украине. Ниже — типовая схема: как оформить заказ, как оплатить и какие варианты доставки доступны. Точные сроки и тарифы согласуем после подтверждения состава заказа и адреса.",
    methodsHeading: "Доставка по Украине",
    methodsIntro:
      "Отправка транспортными службами согласуется индивидуально: вес, объём и класс опасности груза влияют на выбор перевозчика и тариф. Работаем с отделениями по всей Украине — от Запорожья и Харькова до Одессы, Днепра, Львова и областных центров.",
    cards: [
      {
        badge: "Популярно",
        title: "«Нова Пошта»",
        body: "Доставка в отделение, поштомат или адресная по Украине. Трекинг отправления, страхование груза — по запросу.",
      },
      {
        badge: "",
        title: "«Укрпошта»",
        body: "Экономичный вариант для небольших посылок и отдалённых населённых пунктов, сроки согласно правилам оператора.",
      },
      {
        badge: "",
        title: "Курьер по городу",
        body: "Экспресс-доставка по региональному центру или пригороду — при наличии курьерской службы и по предварительной договорённости.",
      },
      {
        badge: "",
        title: "Опт и крупный груз",
        body: "Паллеты и крупногабарит: отдельный расчёт логистики, возможен выход на автоперевозчика.",
      },
      {
        badge: "По Украине",
        title: "Города и области",
        body: "Регулярные отправления в Запорожье и Запорожскую область, Харьков, Одессу, Днепр, Львов, Кривой Рог, Николаев, Винницу, Полтаву, Чернигов, Сумы, Херсон, Черкассы, Ровно, Ивано-Франковск, Тернополь, Ужгород и другие населённые пункты — сроки по графику перевозчика.",
      },
    ],
  },
  uk: {
    navUtility: "Доставка по Україні",
    footerLink: "Доставка та оплата",
    pageH1: "Доставка та оплата",
    pageLead:
      "Відправляємо емалі, ґрунтовки та супутні ЛКМ по всій Україні. Нижче — типова схема: як оформити замовлення, як оплатити та які варіанти доставки доступні. Точні строки й тарифи узгодимо після підтвердження складу замовлення та адреси.",
    methodsHeading: "Доставка по Україні",
    methodsIntro:
      "Відправка транспортними службами узгоджується індивідуально: вага, об'єм і клас небезпеки вантажу впливають на вибір перевізника й тариф. Працюємо з відділеннями по всій Україні — від Запоріжжя й Харкова до Одеси, Дніпра, Львова та обласних центрів.",
    cards: [
      {
        badge: "Популярно",
        title: "«Нова Пошта»",
        body: "Доставка у відділення, поштомат або адресна по Україні. Трекінг відправлення, страхування вантажу — за запитом.",
      },
      {
        badge: "",
        title: "«Укрпошта»",
        body: "Економний варіант для невеликих посилок і віддалених населених пунктів, строки згідно з правилами оператора.",
      },
      {
        badge: "",
        title: "Кур'єр по місту",
        body: "Експрес-доставка по обласному центру чи передмістю — за наявності кур'єрської служби та за попередньою домовленістю.",
      },
      {
        badge: "",
        title: "Опт і великий вантаж",
        body: "Палети та великогабарит: окремий розрахунок логістики, можливий вихід на автоперевізника.",
      },
      {
        badge: "По Україні",
        title: "Міста та області",
        body: "Регулярні відправлення в Запоріжжя та Запорізьку область, Харків, Одесу, Дніпро, Львів, Кривий Ріг, Миколаїв, Вінницю, Полтаву, Чернігів, Суми, Херсон, Черкаси, Рівне, Івано-Франківськ, Тернопіль, Ужгород та інші населені пункти — строки за графіком перевізника.",
      },
    ],
  },
  en: {
    navUtility: "Delivery across Ukraine",
    footerLink: "Delivery & payment",
    pageH1: "Delivery & payment",
    pageLead:
      "We ship enamels, primers and related coatings across Ukraine. Below is a typical flow: how to place an order, pay, and which delivery options are available. Exact timelines and rates are agreed after confirming the order and address.",
    methodsHeading: "Delivery across Ukraine",
    methodsIntro:
      "Carrier shipments are agreed individually: weight, volume and hazard class affect carrier choice and pricing. We ship nationwide — from Zaporizhzhia and Kharkiv to Odesa, Dnipro, Lviv and regional hubs.",
    cards: [
      {
        badge: "Popular",
        title: "Nova Poshta",
        body: "Delivery to a branch, parcel locker or address across Ukraine. Tracking and cargo insurance on request.",
      },
      {
        badge: "",
        title: "Ukrposhta",
        body: "Cost-effective for small parcels and remote areas; transit per carrier rules.",
      },
      {
        badge: "",
        title: "City courier",
        body: "Express within the regional centre or suburbs where a courier service is available and agreed in advance.",
      },
      {
        badge: "",
        title: "Wholesale & bulky",
        body: "Pallets and oversized loads: separate logistics quote; dedicated trucking if needed.",
      },
      {
        badge: "Ukraine",
        title: "Cities & oblasts",
        body: "Regular service to Zaporizhzhia and Zaporizhzhia Oblast, Kharkiv, Odesa, Dnipro, Lviv, Kryvyi Rih, Mykolaiv, Vinnytsia, Poltava, Chernihiv, Sumy, Kherson, Cherkasy, Rivne, Ivano-Frankivsk, Ternopil, Uzhhorod and other locations — transit per carrier schedule.",
      },
    ],
  },
};

function deliveryBoolVis(cur, def = true) {
  if (cur === undefined || cur === null) return def;
  return cur !== false;
}

function deliveryClipOptStr(cur, max) {
  return String(cur ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

const MAX_DELIVERY_UA_CARDS = 12;
const MAX_DV2_FAQ = 8;

function normalizeDeliveryPageV2(cur, lang) {
  const rootDef = DEFAULT_DELIVERY_PAGE_V2[lang] || DEFAULT_DELIVERY_PAGE_V2.ru;
  const c = cur && typeof cur === "object" ? cur : {};

  function hrefOrDef(w, wDef, key) {
    const h = deliveryClipOptStr(w[key], 400);
    return h.length ? h : clipDeliveryStr(wDef[key], 400);
  }

  function mergeWide(wDef, wCur) {
    const w = wCur && typeof wCur === "object" ? wCur : {};
    return {
      visible: deliveryBoolVis(w.visible),
      title: deliveryFieldOrDef(w.title, wDef.title, 240),
      sub: deliveryFieldOrDef(w.sub, wDef.sub, 400),
      priceFromLabel: deliveryFieldOrDef(w.priceFromLabel, wDef.priceFromLabel, 40),
      priceFrom: deliveryFieldOrDef(w.priceFrom, wDef.priceFrom, 80),
      priceToLabel: deliveryFieldOrDef(w.priceToLabel, wDef.priceToLabel, 40),
      priceTo: deliveryFieldOrDef(w.priceTo, wDef.priceTo, 80),
      ctaLabel: deliveryFieldOrDef(w.ctaLabel, wDef.ctaLabel, 160),
      ctaHref: hrefOrDef(w, wDef, "ctaHref"),
      imageUrl: hrefOrDef(w, wDef, "imageUrl"),
      imageAlt: deliveryFieldOrDef(w.imageAlt, wDef.imageAlt, 400),
    };
  }

  function mergeSide(sDef, sCur) {
    const s = sCur && typeof sCur === "object" ? sCur : {};
    return {
      visible: deliveryBoolVis(s.visible),
      title: deliveryFieldOrDef(s.title, sDef.title, 240),
      sub: deliveryFieldOrDef(s.sub, sDef.sub, 400),
      note: deliveryFieldOrDef(s.note, sDef.note, 4000),
    };
  }

  function mergeFaq(fDef, fCur) {
    const f = fCur && typeof fCur === "object" ? fCur : {};
    const itemsIn = Array.isArray(f.items) ? f.items : [];
    const itemsDef = Array.isArray(fDef.items) ? fDef.items : [];
    const n = Math.min(Math.max(itemsDef.length, itemsIn.length), MAX_DV2_FAQ);
    const items = [];
    for (let i = 0; i < n; i++) {
      const di = itemsDef[i] || { q: "", body: "" };
      const ci = itemsIn[i] && typeof itemsIn[i] === "object" ? itemsIn[i] : {};
      items.push({
        q: deliveryFieldOrDef(ci.q, di.q, 400),
        body: deliveryFieldOrDef(ci.body, di.body, 8000),
      });
    }
    return {
      visible: deliveryBoolVis(f.visible),
      title: deliveryFieldOrDef(f.title, fDef.title, 240),
      items,
    };
  }

  function mergeRow(rDef, rCur) {
    const r = rCur && typeof rCur === "object" ? rCur : {};
    return {
      visible: deliveryBoolVis(r.visible),
      imageUrl: hrefOrDef(r, rDef, "imageUrl"),
      imageAlt: deliveryFieldOrDef(r.imageAlt, rDef.imageAlt, 400),
      title: deliveryFieldOrDef(r.title, rDef.title, 240),
      pill1: deliveryFieldOrDef(r.pill1, rDef.pill1, 200),
      pill2: deliveryFieldOrDef(r.pill2, rDef.pill2, 200),
      priceFromLabel: deliveryFieldOrDef(r.priceFromLabel, rDef.priceFromLabel, 40),
      priceToLabel: deliveryFieldOrDef(r.priceToLabel, rDef.priceToLabel, 40),
      priceLead: deliveryFieldOrDef(r.priceLead, rDef.priceLead, 120),
      priceFrom: deliveryFieldOrDef(r.priceFrom, rDef.priceFrom, 80),
      priceMid: deliveryFieldOrDef(r.priceMid, rDef.priceMid, 80),
      priceTo: deliveryFieldOrDef(r.priceTo, rDef.priceTo, 80),
      priceTrail: deliveryFieldOrDef(r.priceTrail, rDef.priceTrail, 400),
      ctaLabel: deliveryFieldOrDef(r.ctaLabel, rDef.ctaLabel, 160),
      ctaHref: hrefOrDef(r, rDef, "ctaHref"),
      aside1Title: deliveryFieldOrDef(r.aside1Title, rDef.aside1Title, 160),
      aside1Text: deliveryFieldOrDef(r.aside1Text, rDef.aside1Text, 4000),
      aside2Title: deliveryFieldOrDef(r.aside2Title, rDef.aside2Title, 160),
      aside2List: deliveryFieldOrDef(r.aside2List, rDef.aside2List, 4000),
    };
  }

  function mergePickup(pDef, pCur) {
    const p = pCur && typeof pCur === "object" ? pCur : {};
    return {
      visible: deliveryBoolVis(p.visible),
      imageUrl: hrefOrDef(p, pDef, "imageUrl"),
      imageAlt: deliveryFieldOrDef(p.imageAlt, pDef.imageAlt, 400),
      title: deliveryFieldOrDef(p.title, pDef.title, 240),
      addressText: deliveryFieldOrDef(p.addressText, pDef.addressText, 4000),
      ctaLabel: deliveryFieldOrDef(p.ctaLabel, pDef.ctaLabel, 160),
      ctaHref: hrefOrDef(p, pDef, "ctaHref"),
      asideTitle: deliveryFieldOrDef(p.asideTitle, pDef.asideTitle, 160),
      asideText: deliveryFieldOrDef(p.asideText, pDef.asideText, 4000),
    };
  }

  const rowsDef = rootDef.rows || {};
  const rowsCur = c.rows && typeof c.rows === "object" ? c.rows : {};

  return {
    wideCard: mergeWide(rootDef.wideCard, c.wideCard),
    sideCard: mergeSide(rootDef.sideCard, c.sideCard),
    faq: mergeFaq(rootDef.faq, c.faq),
    rows: {
      local: mergeRow(rowsDef.local, rowsCur.local),
      national: mergeRow(rowsDef.national, rowsCur.national),
      pickup: mergePickup(rowsDef.pickup, rowsCur.pickup),
    },
  };
}

function normalizeDeliveryUkraine(input) {
  const src = input && typeof input === "object" ? input : {};
  const langs = ["ru", "uk", "en"];
  const out = {};
  for (const lang of langs) {
    const def = DEFAULT_DELIVERY_UKRAINE[lang];
    const cur = src[lang] && typeof src[lang] === "object" ? src[lang] : {};
    const defCards = Array.isArray(def.cards) ? def.cards : [];
    const curCards = Array.isArray(cur.cards) ? cur.cards : [];
    const nCards = Math.min(Math.max(defCards.length, curCards.length), MAX_DELIVERY_UA_CARDS);
    const cards = [];
    for (let i = 0; i < nCards; i++) {
      const dc = defCards[i] || { badge: "", title: "", body: "" };
      const cc = curCards[i] && typeof curCards[i] === "object" ? curCards[i] : {};
      cards.push({
        badge: deliveryBadgeOrDef(cc.badge, dc.badge, 120),
        title: deliveryFieldOrDef(cc.title, dc.title, 240),
        body: deliveryFieldOrDef(cc.body, dc.body, 12000),
        visible: deliveryBoolVis(cc.visible),
        icon: deliveryClipOptStr(cc.icon, 200),
        imageUrl: deliveryClipOptStr(cc.imageUrl, 400),
      });
    }
    out[lang] = {
      navUtility: deliveryFieldOrDef(cur.navUtility, def.navUtility, 200),
      navUtilityVisible: deliveryBoolVis(cur.navUtilityVisible),
      footerLink: deliveryFieldOrDef(cur.footerLink, def.footerLink, 200),
      footerLinkVisible: deliveryBoolVis(cur.footerLinkVisible),
      pageH1: deliveryFieldOrDef(cur.pageH1, def.pageH1, 240),
      pageH1Visible: deliveryBoolVis(cur.pageH1Visible),
      pageLead: deliveryFieldOrDef(cur.pageLead, def.pageLead, 12000),
      pageLeadVisible: deliveryBoolVis(cur.pageLeadVisible),
      methodsHeading: deliveryFieldOrDef(cur.methodsHeading, def.methodsHeading, 240),
      methodsHeadingVisible: deliveryBoolVis(cur.methodsHeadingVisible),
      methodsIntro: deliveryFieldOrDef(cur.methodsIntro, def.methodsIntro, 12000),
      methodsIntroVisible: deliveryBoolVis(cur.methodsIntroVisible),
      cards,
      pageV2: normalizeDeliveryPageV2(cur.pageV2, lang),
    };
  }
  return out;
}

function defaultAccountPayment() {
  return {
    offerTitle: "Публічна оферта (оплата в кабінеті)",
    offerHtml: `<p>Оформлюючи оплату, ви погоджуєтесь з умовами публічного договору купівлі-продажу. Деталі уточнює менеджер після оформлення.</p>
<p>Онлайн-оплата карткою (Visa, Mastercard) здійснюється через сервіс <strong>LiqPay</strong> (ПАТ КБ «Приватбанк») згідно з правилами платіжної системи.</p>
<p>Банківський переказ на IBAN: у призначенні платежу вкажіть номер договору, рахунку або ПІБ / назву ТОВ.</p>`,
    offerTitleRu: "Публичная оферта (оплата в кабинете)",
    offerHtmlRu: `<p>Оформляя оплату, вы соглашаетесь с условиями публичного договора купли-продажи. Детали счёта уточняет менеджер после оформления.</p>
<p>Онлайн-оплата картой (Visa, Mastercard) осуществляется через сервис <strong>LiqPay</strong> (ПАО КБ «Приватбанк») в соответствии с правилами платёжной системы.</p>
<p>Банковский перевод на IBAN: в назначении платежа укажите номер договора, счёта или ФИО / наименование ТОВ.</p>`,
    iban: {
      recipient: 'ТОВ "ДПП ДНЕХРОХІМ" (замініть на ваші реквізити в site-content.json)',
      edrpou: "00000000",
      iban: "UA00000000000000000000000000",
      bank: 'АТ "Укрексімбанк" (приклад)',
      mfo: "322001",
    },
  };
}

function normalizeAccountPayment(ap) {
  const d = defaultAccountPayment();
  if (!ap || typeof ap !== "object") return d;
  return {
    offerTitle: String(ap.offerTitle || d.offerTitle).trim().slice(0, 200) || d.offerTitle,
    offerHtml: String(ap.offerHtml || d.offerHtml).slice(0, 50000) || d.offerHtml,
    offerTitleRu: String(ap.offerTitleRu != null && ap.offerTitleRu !== "" ? ap.offerTitleRu : d.offerTitleRu)
      .trim()
      .slice(0, 200) || d.offerTitleRu,
    offerHtmlRu: String(ap.offerHtmlRu != null && ap.offerHtmlRu !== "" ? ap.offerHtmlRu : d.offerHtmlRu).slice(0, 50000) || d.offerHtmlRu,
    iban: {
      recipient: String((ap.iban && ap.iban.recipient) || d.iban.recipient).trim().slice(0, 300),
      edrpou: String((ap.iban && ap.iban.edrpou) || d.iban.edrpou).trim().slice(0, 20),
      iban: String((ap.iban && ap.iban.iban) || d.iban.iban).trim().slice(0, 40),
      bank: String((ap.iban && ap.iban.bank) || d.iban.bank).trim().slice(0, 200),
      mfo: String((ap.iban && ap.iban.mfo) || d.iban.mfo).trim().slice(0, 12),
    },
  };
}

function readSiteContent() {
  ensureSiteContentFile();
  try {
    const raw = JSON.parse(fs.readFileSync(SITE_CONTENT_PATH, "utf-8"));
    if (!raw.productOverrides || typeof raw.productOverrides !== "object") raw.productOverrides = {};
    raw.heroSlides = normalizeHeroSlides(raw.heroSlides);
    raw.heroSlideshowSettings = normalizeHeroSlideshowSettings(raw.heroSlideshowSettings);
    raw.productsBannerSlides = normalizeHeroSlides(raw.productsBannerSlides);
    raw.deliveryUkraine = normalizeDeliveryUkraine(raw.deliveryUkraine);
    raw.accountPayment = normalizeAccountPayment(raw.accountPayment);
    if ("deliveryLayout" in raw) delete raw.deliveryLayout;
    if ("deliverySectionsLocale" in raw) delete raw.deliverySectionsLocale;
    let touched = false;
    const exts = ["png", "jpg", "jpeg", "webp"];
    const normalizeProductUploadUrl = (urlRaw) => {
      const src = String(urlRaw || "").trim();
      if (!src) return "";
      const [pathOnly, query = ""] = src.split("?");
      const m = pathOnly.match(/^\/uploads\/products\/([a-zA-Z0-9_.-]+)\.(png|jpg|jpeg|webp)$/i);
      if (!m) return "";
      const base = m[1];
      const wantExt = String(m[2] || "").toLowerCase();
      const sameFile = path.join(PRODUCT_IMAGES_DIR, `${base}.${wantExt}`);
      if (fs.existsSync(sameFile)) return query ? `${pathOnly}?${query}` : pathOnly;
      for (const ext of exts) {
        const candidate = path.join(PRODUCT_IMAGES_DIR, `${base}.${ext}`);
        if (!fs.existsSync(candidate)) continue;
        const nextPath = `/uploads/products/${base}.${ext}`;
        return query ? `${nextPath}?${query}` : nextPath;
      }
      return "";
    };
    for (const ov of Object.values(raw.productOverrides)) {
      if (!ov || typeof ov !== "object") continue;
      for (const key of ["cardImageUrl", "heroImageUrl"]) {
        const cur = String(ov[key] || "").trim();
        if (!cur) continue;
        const fixed = normalizeProductUploadUrl(cur);
        if (!fixed) {
          delete ov[key];
          touched = true;
          continue;
        }
        if (fixed !== cur) {
          ov[key] = fixed;
          touched = true;
        }
      }
      if (ov.catalogPackImages && typeof ov.catalogPackImages === "object") {
        const next = {};
        for (const [k, v] of Object.entries(ov.catalogPackImages)) {
          const fixed = normalizeProductUploadUrl(v);
          if (fixed) next[k] = fixed;
          else touched = true;
        }
        if (Object.keys(next).length) {
          if (JSON.stringify(next) !== JSON.stringify(ov.catalogPackImages)) touched = true;
          ov.catalogPackImages = next;
        } else if (Object.keys(ov.catalogPackImages).length) {
          delete ov.catalogPackImages;
          touched = true;
        }
      }
    }
    if (touched) writeSiteContent(raw);
    return raw;
  } catch {
    return {
      productOverrides: {},
      heroSlides: [],
      heroSlideshowSettings: normalizeHeroSlideshowSettings(null),
      productsBannerSlides: [],
      deliveryUkraine: normalizeDeliveryUkraine({}),
      accountPayment: defaultAccountPayment(),
    };
  }
}

function writeSiteContent(data) {
  ensureSiteContentFile();
  if (data && typeof data === "object") {
    if ("deliverySectionsLocale" in data) delete data.deliverySectionsLocale;
    if ("deliveryLayout" in data) delete data.deliveryLayout;
  }
  fs.writeFileSync(SITE_CONTENT_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/** Время изменения site-content.json — для сброса кэша браузера у картинок /uploads/products/. */
function siteContentMtimeMs() {
  try {
    return fs.statSync(SITE_CONTENT_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function seedProductsCatalogFromJsFile() {
  try {
    if (!fs.existsSync(PRODUCTS_DATA_JS_PATH)) return null;
    const js = fs.readFileSync(PRODUCTS_DATA_JS_PATH, "utf-8");
    const m = js.match(/window\.PRODUCTS_DATA\s*=\s*(\[[\s\S]*\]);?\s*$/);
    if (!m) return null;
    const arr = JSON.parse(m[1]);
    if (!Array.isArray(arr)) return null;
    fs.writeFileSync(PRODUCTS_CATALOG_PATH, JSON.stringify(arr, null, 2), "utf-8");
    return arr;
  } catch {
    return null;
  }
}

function ensureProductsCatalogFile() {
  if (fs.existsSync(PRODUCTS_CATALOG_PATH)) return;
  seedProductsCatalogFromJsFile();
}

function readProductsCatalog() {
  ensureProductsCatalogFile();
  try {
    const raw = JSON.parse(fs.readFileSync(PRODUCTS_CATALOG_PATH, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeProductsCatalog(products) {
  ensureProductsCatalogFile();
  fs.writeFileSync(PRODUCTS_CATALOG_PATH, JSON.stringify(products, null, 2), "utf-8");
}

function ensureProductsCatalogBackupDir() {
  fs.mkdirSync(PRODUCTS_CATALOG_BACKUP_DIR, { recursive: true });
}

function catalogBackupIdFromDate(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-");
}

function createProductsCatalogBackup(reason = "save") {
  ensureProductsCatalogFile();
  ensureProductsCatalogBackupDir();
  const products = readProductsCatalog();
  const createdAt = new Date().toISOString();
  const id = catalogBackupIdFromDate(new Date(createdAt));
  const payload = {
    id,
    createdAt,
    reason,
    count: products.length,
    products,
  };
  fs.writeFileSync(path.join(PRODUCTS_CATALOG_BACKUP_DIR, `${id}.json`), JSON.stringify(payload, null, 2), "utf-8");
  return { id, createdAt, reason, count: products.length };
}

function listProductsCatalogBackups() {
  ensureProductsCatalogBackupDir();
  return fs
    .readdirSync(PRODUCTS_CATALOG_BACKUP_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(PRODUCTS_CATALOG_BACKUP_DIR, file), "utf-8"));
        return {
          id: String(raw.id || file.replace(/\.json$/, "")),
          createdAt: String(raw.createdAt || ""),
          reason: String(raw.reason || "save"),
          count: Number(raw.count || (Array.isArray(raw.products) ? raw.products.length : 0)) || 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 30);
}

function readProductsCatalogBackup(id) {
  const safeId = String(id || "").trim();
  if (!/^[\w-]+$/.test(safeId)) return null;
  const file = path.join(PRODUCTS_CATALOG_BACKUP_DIR, `${safeId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && Array.isArray(raw.products) ? raw : null;
  } catch {
    return null;
  }
}

function sanitizeCatalogProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 120);
  if (!id) return null;
  const family = String(raw.family || "other").trim().slice(0, 64) || "other";
  const code = String(raw.code ?? "").trim().slice(0, 80);
  const lineCode = String(raw.lineCode ?? "").trim().slice(0, 120);
  const series = String(raw.series ?? "").trim().slice(0, 120);
  const name = String(raw.name ?? "").trim().slice(0, 500);
  const numOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const jarSmallKg = numOrNull(raw.jarSmallKg);
  const jarBigKg = numOrNull(raw.jarBigKg);
  const bucketKg = numOrNull(raw.bucketKg);
  const drumKg = numOrNull(raw.drumKg);
  const priceNoNdsPerKg = numOrNull(raw.priceNoNdsPerKg);
  const priceNdsPerKg = numOrNull(raw.priceNdsPerKg);
  let extraPriceColumns = null;
  if (raw.extraPriceColumns && typeof raw.extraPriceColumns === "object" && !Array.isArray(raw.extraPriceColumns)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(raw.extraPriceColumns)) {
      const key = String(k || "").trim().slice(0, 120);
      if (!key) continue;
      const val = String(v ?? "").trim().slice(0, 500);
      if (!val) continue;
      cleaned[key] = val;
      if (Object.keys(cleaned).length >= 60) break;
    }
    if (Object.keys(cleaned).length) extraPriceColumns = cleaned;
  }
  const out = {
    id,
    family,
    code,
    name,
    jarSmallKg,
    jarBigKg,
    bucketKg,
    drumKg,
    priceNoNdsPerKg,
    priceNdsPerKg,
  };
  if (extraPriceColumns) out.extraPriceColumns = extraPriceColumns;
  if (lineCode) out.lineCode = lineCode;
  if (series) out.series = series;
  return out;
}

function sanitizeProductsCatalogArray(body) {
  const list = body && Array.isArray(body.products) ? body.products : null;
  if (!list) return { error: "invalid_payload", message: "Ожидается { products: [...] }." };
  if (list.length === 0) return { products: [] };
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const p = sanitizeCatalogProduct(row);
    if (!p) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  if (out.length === 0) return { error: "empty_catalog", message: "Каталог пуст или все строки некорректны." };
  return { products: out };
}

function aiNormText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aiTokenize(value) {
  return aiNormText(value)
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s && s.length > 1);
}

function aiSafeJsonParse(raw) {
  if (!raw || typeof raw !== "string") return null;
  const direct = raw.trim();
  if (!direct) return null;
  try {
    return JSON.parse(direct);
  } catch {
    const m = direct.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function aiHeuristicIntent(query) {
  const q = aiNormText(query);
  const purpose = [];
  if (/(внутри|интерьер|комнат|дом|квартир|стен|потол)/i.test(q)) purpose.push("interior");
  if (/(фасад|наруж|улиц|снаружи)/i.test(q)) purpose.push("facade");
  if (/(металл|цех|станок|пром|антикор|корроз)/i.test(q)) purpose.push("industrial");
  if (/(дерев|деревн|дос|лаги|террас)/i.test(q)) purpose.push("wood-protection");
  if (/(огн|пожар)/i.test(q)) purpose.push("fire-retardant");
  if (/(растворител|разбавител|уайт-спирит|ацетон)/i.test(q)) purpose.push("solvents");
  const family =
    /(эмаль|эмал)/i.test(q)
      ? "enamel"
      : /(грунт|грунтов)/i.test(q)
        ? "primer"
        : /(лак)/i.test(q)
          ? "lacquer"
          : "";
  return {
    query: String(query || "").trim(),
    needs: [],
    useCase: q,
    surfaces: [],
    purpose,
    family,
    exclude: [],
    keywords: aiTokenize(query).slice(0, 12),
  };
}

async function aiParseIntentWithGemini(query) {
  if (!GEMINI_API_KEY) return { intent: null, error: "GEMINI_API_KEY не задан." };
  const prompt = [
    "Ты помощник по подбору лакокрасочных материалов.",
    "Верни только JSON без пояснений.",
    'Формат JSON: {"needs":[],"useCase":"","surfaces":[],"purpose":[],"family":"","exclude":[],"keywords":[]}',
    "purpose может содержать: interior, facade, industrial, wd-dispersion, wood-protection, fire-retardant, surface-prep, disinfectant, solvents",
    "family: короткое значение группы товара (например enamel, primer, lacquer) или пустая строка.",
    "keywords: 5-12 ключевых слов из запроса пользователя.",
    `Запрос пользователя: "${String(query || "").slice(0, 600)}"`,
  ].join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );
    if (!resp.ok) {
      const errJson = await resp.json().catch(() => null);
      const errMsg =
        errJson?.error?.message ||
        (resp.status === 429
          ? "Превышена квота Gemini API (429). Проверьте лимиты/биллинг в Google AI Studio."
          : `Gemini API вернул ошибку ${resp.status}.`);
      return { intent: null, error: String(errMsg).slice(0, 500) };
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = aiSafeJsonParse(text);
    if (!parsed || typeof parsed !== "object") {
      return { intent: null, error: "Gemini вернул ответ в неожиданном формате." };
    }
    const intent = {
      query: String(query || "").trim(),
      needs: Array.isArray(parsed.needs) ? parsed.needs.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [],
      useCase: String(parsed.useCase || "").trim().slice(0, 300),
      surfaces: Array.isArray(parsed.surfaces)
        ? parsed.surfaces.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
        : [],
      purpose: Array.isArray(parsed.purpose) ? parsed.purpose.map((x) => aiNormText(x)).filter(Boolean).slice(0, 8) : [],
      family: String(parsed.family || "").trim().slice(0, 64),
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [],
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.map((x) => aiNormText(x)).filter(Boolean).slice(0, 14)
        : aiTokenize(query).slice(0, 12),
    };
    return { intent, error: null };
  } catch {
    return { intent: null, error: "Не удалось связаться с Gemini API." };
  } finally {
    clearTimeout(timeout);
  }
}

function aiScoreCatalogProducts(products, intent) {
  const familyNeed = aiNormText(intent?.family || "");
  const purposeNeed = Array.isArray(intent?.purpose) ? intent.purpose.map((x) => aiNormText(x)).filter(Boolean) : [];
  const kw = Array.isArray(intent?.keywords) ? intent.keywords.map((x) => aiNormText(x)).filter(Boolean) : [];
  const scored = [];
  for (const p of products) {
    const family = aiNormText(p?.family || "");
    const code = aiNormText(p?.code || p?.series || "");
    const name = aiNormText(p?.name || p?.fullName || "");
    const hay = `${family} ${code} ${name}`;
    let score = 0;
    if (familyNeed && family.includes(familyNeed)) score += 30;
    for (const pr of purposeNeed) {
      if (!pr) continue;
      if (hay.includes(pr)) score += 18;
      if (pr === "interior" && /(стен|интерьер|внутр)/i.test(hay)) score += 12;
      if (pr === "facade" && /(фасад|наруж)/i.test(hay)) score += 12;
      if (pr === "industrial" && /(пром|металл|антикор)/i.test(hay)) score += 12;
      if (pr === "wood-protection" && /(дерев)/i.test(hay)) score += 12;
      if (pr === "solvents" && /(растворител|разбав)/i.test(hay)) score += 12;
    }
    let kwHits = 0;
    for (const t of kw) {
      if (!t || t.length < 2) continue;
      if (hay.includes(t)) {
        kwHits += 1;
        score += 6;
      }
    }
    if (!score && kwHits === 0) continue;
    scored.push({ score, product: p });
  }
  scored.sort((a, b) => b.score - a.score || String(a.product?.code || "").localeCompare(String(b.product?.code || "")));
  return scored.slice(0, 24);
}

function sanitizeDetailSpecRows(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const row of raw.slice(0, 24)) {
    if (Array.isArray(row) && row.length >= 2) {
      const k = String(row[0]).trim().slice(0, 160);
      const v = String(row[1]).trim().slice(0, 2000);
      if (k) out.push([k, v]);
    } else if (row && typeof row === "object") {
      const k = String(row.key ?? row.label ?? "").trim().slice(0, 160);
      const v = String(row.value ?? "").trim().slice(0, 2000);
      if (k) out.push([k, v]);
    }
  }
  return out;
}

function sanitizeStringList(raw, maxItems, maxLen) {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((x) => String(x).trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeDetailExpertTips(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const t of raw.slice(0, 18)) {
    if (!t || typeof t !== "object") continue;
    const title = String(t.title || "").trim().slice(0, 400);
    let url = String(t.url || "").trim().slice(0, 800);
    if (!title || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      title,
      url,
      source: String(t.source || "").trim().slice(0, 120),
    });
  }
  return out;
}

function sanitizeDetailPackOptions(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const row of raw.slice(0, 24)) {
    if (!row || typeof row !== "object") continue;
    const kind = String(row.kind || "").toLowerCase();
    const k = kind === "bucket" || kind === "drum" ? kind : "jar";
    const w = Number(row.jarKg);
    let jarKg = null;
    if (Number.isFinite(w) && w > 0 && w <= 1e6) {
      jarKg = Math.round(w * 1e4) / 1e4;
    }
    if (k === "jar" && jarKg == null) continue;
    out.push({
      kind: k,
      jarKg: jarKg ?? null,
      label: String(row.label || "").trim().slice(0, 80),
      sub: String(row.sub || "").trim().slice(0, 80),
      hidden: Boolean(row.hidden),
    });
  }
  return out;
}

function sanitizeDetailFiles(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const f of raw.slice(0, 12)) {
    if (!f || typeof f !== "object") continue;
    const label = String(f.label || "").trim().slice(0, 320);
    const href = String(f.href || "").trim().slice(0, 800);
    if (!label || !href) continue;
    out.push({
      label,
      href,
      size: String(f.size || "").trim().slice(0, 120),
    });
  }
  return out;
}

function sanitizeCatalogPackImages(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  let n = 0;
  const exts = ["png", "jpg", "jpeg", "webp"];
  for (const [k0, v0] of Object.entries(raw)) {
    if (n >= 18) break;
    const k = String(k0 || "").replace(/[^\w.:_-]/g, "").slice(0, 48);
    if (!k) continue;
    const uRaw = String(v0 || "").trim().slice(0, 520);
    const pathOnly = uRaw.split(/[?\s]/)[0];
    const m = pathOnly.match(/^\/uploads\/products\/([a-zA-Z0-9_.-]+)\.(png|jpg|jpeg|webp)$/i);
    if (!m) continue;
    const base = String(m[1] || "");
    const extFromUrl = String(m[2] || "").toLowerCase();
    let fixedPath = pathOnly;
    const exact = path.join(PRODUCT_IMAGES_DIR, `${base}.${extFromUrl}`);
    if (!fs.existsSync(exact)) {
      let found = "";
      for (const ext of exts) {
        const p = path.join(PRODUCT_IMAGES_DIR, `${base}.${ext}`);
        if (!fs.existsSync(p)) continue;
        found = ext;
        break;
      }
      if (!found) continue;
      fixedPath = `/uploads/products/${base}.${found}`;
    }
    let safeUrl = fixedPath;
    const qIdx = uRaw.indexOf("?");
    if (qIdx >= 0) {
      const q = uRaw.slice(qIdx + 1).trim();
      if (/^_=\d{6,}$/.test(q)) safeUrl = `${fixedPath}?${q}`;
    }
    out[k] = safeUrl;
    n += 1;
  }
  return out;
}

function sanitizeCatalogPackImageKey(rawKey) {
  const k = String(rawKey || "").replace(/[^\w.:_-]/g, "").slice(0, 48);
  return k || "";
}

function sanitizeProductOverride(raw) {
  if (!raw || typeof raw !== "object") return {};
  const o = {};
  if (typeof raw.cardImageUrl === "string") {
    const u = raw.cardImageUrl.trim().slice(0, 500);
    o.cardImageUrl = u;
  }
  if (typeof raw.heroImageUrl === "string") {
    const u = raw.heroImageUrl.trim().slice(0, 500);
    o.heroImageUrl = u;
  }
  if (typeof raw.cardTitle === "string") o.cardTitle = raw.cardTitle.trim().slice(0, 320);
  if (typeof raw.subtitle === "string") o.subtitle = raw.subtitle.trim().slice(0, 600);
  if (typeof raw.description === "string") o.description = raw.description.trim().slice(0, 8000);
  if (Array.isArray(raw.cardFeatures)) {
    o.cardFeatures = raw.cardFeatures
      .map((x) => String(x).trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 6);
  }
  if (raw.detailSpecRows !== undefined) o.detailSpecRows = sanitizeDetailSpecRows(raw.detailSpecRows);
  if (typeof raw.detailCharacteristicsIntro === "string") {
    o.detailCharacteristicsIntro = raw.detailCharacteristicsIntro.replace(/\r\n/g, "\n").trim().slice(0, 12000);
  }
  if (typeof raw.detailApplication === "string") {
    o.detailApplication = raw.detailApplication.replace(/\r\n/g, "\n").trim().slice(0, 12000);
  }
  if (raw.detailPrepBase !== undefined) o.detailPrepBase = sanitizeStringList(raw.detailPrepBase, 40, 2000);
  if (raw.detailPrepProduct !== undefined) o.detailPrepProduct = sanitizeStringList(raw.detailPrepProduct, 40, 2000);
  if (raw.detailPainting !== undefined) o.detailPainting = sanitizeStringList(raw.detailPainting, 40, 2000);
  if (raw.detailExpertTips !== undefined) o.detailExpertTips = sanitizeDetailExpertTips(raw.detailExpertTips);
  if (raw.detailTopBadges !== undefined) o.detailTopBadges = sanitizeStringList(raw.detailTopBadges, 12, 120);
  if (raw.detailFiles !== undefined) o.detailFiles = sanitizeDetailFiles(raw.detailFiles);
  if (raw.detailPackOptions !== undefined) o.detailPackOptions = sanitizeDetailPackOptions(raw.detailPackOptions);

  function catalogTextField(key, maxLen) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) return;
    if (raw[key] === null) {
      o[key] = null;
      return;
    }
    const s = String(raw[key]).trim();
    if (!s) o[key] = null;
    else o[key] = s.slice(0, maxLen);
  }
  function catalogNumberField(key, maxVal) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) return;
    if (raw[key] === null || raw[key] === "") {
      o[key] = null;
      return;
    }
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0 || n > maxVal) return;
    o[key] = Math.round(n * 1e4) / 1e4;
  }
  catalogTextField("family", 64);
  catalogTextField("code", 120);
  catalogTextField("name", 800);
  catalogNumberField("bucketKg", 1e6);
  catalogNumberField("drumKg", 1e6);
  catalogNumberField("priceNoNdsPerKg", 1e7);
  catalogNumberField("priceNdsPerKg", 1e7);
  if (raw.catalogPackImages !== undefined) o.catalogPackImages = sanitizeCatalogPackImages(raw.catalogPackImages);
  return o;
}

function applySanitizedProductOverridePatch(target, sanitized) {
  const t = target;
  const s = sanitized;
  if (s.cardImageUrl === "") delete t.cardImageUrl;
  else if (s.cardImageUrl !== undefined) t.cardImageUrl = s.cardImageUrl;
  if (s.heroImageUrl === "") delete t.heroImageUrl;
  else if (s.heroImageUrl !== undefined) t.heroImageUrl = s.heroImageUrl;
  if (s.cardTitle === "") delete t.cardTitle;
  else if (s.cardTitle !== undefined) t.cardTitle = s.cardTitle;
  if (s.subtitle === "") delete t.subtitle;
  else if (s.subtitle !== undefined) t.subtitle = s.subtitle;
  if (s.description === "") delete t.description;
  else if (s.description !== undefined) t.description = s.description;
  if (s.cardFeatures !== undefined) {
    if (s.cardFeatures.length === 0) delete t.cardFeatures;
    else t.cardFeatures = s.cardFeatures;
  }
  if (s.detailSpecRows !== undefined) {
    if (!s.detailSpecRows.length) delete t.detailSpecRows;
    else t.detailSpecRows = s.detailSpecRows;
  }
  if (s.detailCharacteristicsIntro !== undefined) {
    if (s.detailCharacteristicsIntro === "") delete t.detailCharacteristicsIntro;
    else t.detailCharacteristicsIntro = s.detailCharacteristicsIntro;
  }
  if (s.detailApplication !== undefined) {
    if (s.detailApplication === "") delete t.detailApplication;
    else t.detailApplication = s.detailApplication;
  }
  if (s.detailPrepBase !== undefined) {
    if (!s.detailPrepBase.length) delete t.detailPrepBase;
    else t.detailPrepBase = s.detailPrepBase;
  }
  if (s.detailPrepProduct !== undefined) {
    if (!s.detailPrepProduct.length) delete t.detailPrepProduct;
    else t.detailPrepProduct = s.detailPrepProduct;
  }
  if (s.detailPainting !== undefined) {
    if (!s.detailPainting.length) delete t.detailPainting;
    else t.detailPainting = s.detailPainting;
  }
  if (s.detailExpertTips !== undefined) {
    if (!s.detailExpertTips.length) delete t.detailExpertTips;
    else t.detailExpertTips = s.detailExpertTips;
  }
  if (s.detailTopBadges !== undefined) {
    if (!s.detailTopBadges.length) delete t.detailTopBadges;
    else t.detailTopBadges = s.detailTopBadges;
  }
  if (s.detailFiles !== undefined) {
    if (!s.detailFiles.length) delete t.detailFiles;
    else t.detailFiles = s.detailFiles;
  }
  if (s.detailPackOptions !== undefined) {
    if (!s.detailPackOptions.length) delete t.detailPackOptions;
    else t.detailPackOptions = s.detailPackOptions;
  }
  if (s.catalogPackImages !== undefined) {
    if (!s.catalogPackImages || Object.keys(s.catalogPackImages).length === 0) delete t.catalogPackImages;
    else t.catalogPackImages = s.catalogPackImages;
  }
  if (s.family === null) delete t.family;
  else if (s.family !== undefined) t.family = s.family;
  if (s.code === null) delete t.code;
  else if (s.code !== undefined) t.code = s.code;
  if (s.name === null) delete t.name;
  else if (s.name !== undefined) t.name = s.name;
  if (s.bucketKg === null) delete t.bucketKg;
  else if (s.bucketKg !== undefined) t.bucketKg = s.bucketKg;
  if (s.drumKg === null) delete t.drumKg;
  else if (s.drumKg !== undefined) t.drumKg = s.drumKg;
  if (s.priceNoNdsPerKg === null) delete t.priceNoNdsPerKg;
  else if (s.priceNoNdsPerKg !== undefined) t.priceNoNdsPerKg = s.priceNoNdsPerKg;
  if (s.priceNdsPerKg === null) delete t.priceNdsPerKg;
  else if (s.priceNdsPerKg !== undefined) t.priceNdsPerKg = s.priceNdsPerKg;
}

function readAnalyticsStore() {
  if (!fs.existsSync(ANALYTICS_PATH)) {
    const empty = { events: [] };
    fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(empty), "utf-8");
    return empty;
  }
  try {
    const d = JSON.parse(fs.readFileSync(ANALYTICS_PATH, "utf-8"));
    if (!Array.isArray(d.events)) d.events = [];
    return d;
  } catch {
    return { events: [] };
  }
}

function appendAnalyticsEvent(ev) {
  const d = readAnalyticsStore();
  d.events.push(ev);
  if (d.events.length > ANALYTICS_MAX_EVENTS) {
    d.events = d.events.slice(-ANALYTICS_MAX_EVENTS);
  }
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(d), "utf-8");
}

function aggregateAnalytics(days = 14) {
  const d = readAnalyticsStore();
  const n = Math.min(90, Math.max(1, Number(days) || 14));
  const cutoff = Date.now() - n * 86400000;
  const events = d.events.filter((e) => {
    const t = new Date(e.t).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  let pageviews = 0;
  const byDay = new Map();
  const byPath = new Map();
  const customEvents = new Map();
  const uniquesByDay = new Map();

  for (const e of events) {
    const day = String(e.t || "").slice(0, 10) || "?";
    const isPlainPageview = e.type === "pageview" && !e.event;
    if (isPlainPageview) {
      pageviews += 1;
      byPath.set(e.path, (byPath.get(e.path) || 0) + 1);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      const vid = e.visitorId || "unknown";
      if (!uniquesByDay.has(day)) uniquesByDay.set(day, new Set());
      uniquesByDay.get(day).add(vid);
    }
    if (e.event) {
      const k = String(e.event);
      customEvents.set(k, (customEvents.get(k) || 0) + 1);
    }
  }

  const sortedDays = [...byDay.keys()].sort();
  const series = sortedDays.map((date) => ({
    date,
    pageviews: byDay.get(date) || 0,
    uniqueVisitors: uniquesByDay.get(date)?.size || 0,
  }));

  const topPaths = [...byPath.entries()]
    .map(([pathKey, count]) => ({ path: pathKey, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const topEvents = [...customEvents.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    days: n,
    totalPageviews: pageviews,
    totalEventsStored: d.events.length,
    series,
    topPaths,
    topEvents,
  };
}

const SEED_ADMIN_EMAIL = "pavel@dp-coatings.local";
const SEED_ADMIN_NAME = "Павел";
const SEED_ADMIN_PASSWORD = "123456";

async function seedDefaultAdmin() {
  await crmUpdate(async (db) => {
    const idx = db.users.findIndex((u) => u.email === SEED_ADMIN_EMAIL);
    if (idx === -1) {
      const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
      db.users.push({
        id: db.meta.nextUserId++,
        name: SEED_ADMIN_NAME,
        email: SEED_ADMIN_EMAIL,
        passwordHash,
        role: "admin",
        createdAt: new Date().toISOString(),
        profile: defaultProfile(),
        profileUpdatedAt: null,
      });
      return;
    }
    db.users[idx].name = SEED_ADMIN_NAME;
    db.users[idx].role = "admin";
  });
}

const DEMO_ROLE_USERS = [
  { email: "moderator@dp-coatings.local", name: "Модератор", role: "moderator" },
  { email: "buh@dp-coatings.local", name: "Бухгалтер", role: "accountant" },
  { email: "klient@dp-coatings.local", name: "Клиент", role: "client" },
];
const DEMO_ROLE_PASSWORD = "123456";

async function seedDemoRoleUsers() {
  await crmUpdate(async (db) => {
    for (const row of DEMO_ROLE_USERS) {
      if (db.users.some((u) => u.email === row.email)) continue;
      const passwordHash = await bcrypt.hash(DEMO_ROLE_PASSWORD, 10);
      db.users.push({
        id: db.meta.nextUserId++,
        name: row.name,
        email: row.email,
        passwordHash,
        role: row.role,
        createdAt: new Date().toISOString(),
        profile: defaultProfile(),
        profileUpdatedAt: null,
      });
    }
  });
}

function passwordPolicyError(password) {
  const value = String(password || "");
  const minLen = isProd ? 10 : 6;
  if (value.length < minLen) {
    return `Пароль должен быть не короче ${minLen} символов.`;
  }
  if (isProd) {
    const hasLetter = /[A-Za-zА-Яа-я]/.test(value);
    const hasDigit = /\d/.test(value);
    if (!hasLetter || !hasDigit) {
      return "Пароль должен содержать хотя бы одну букву и одну цифру.";
    }
  }
  return "";
}

function signToken(user) {
  const role = user.role || "client";
  const expiresIn = role === "admin" ? JWT_EXPIRES_IN_ADMIN : JWT_EXPIRES_IN_USER;
  return jwt.sign(
    { sub: user.id, email: user.email, role, name: user.name || "" },
    JWT_SECRET,
    { expiresIn }
  );
}

function parseCookiesFromHeader(headerValue) {
  const out = {};
  const raw = String(headerValue || "");
  if (!raw) return out;
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

function extractAuthToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookiesFromHeader(req.headers.cookie || "");
  const fromCookie = String(cookies[AUTH_COOKIE_NAME] || "").trim();
  return fromCookie || "";
}

function setAuthCookie(res, token, maxAgeMs) {
  const safeMaxAge = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? Math.floor(maxAgeMs) : 30 * 24 * 60 * 60 * 1000;
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: safeMaxAge,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
  });
}

const loginAttemptState = new Map();
const LOGIN_ATTEMPT_TTL_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED = isProd ? 8 : 30;
const LOGIN_LOCK_MS = isProd ? 15 * 60 * 1000 : 2 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TOKEN_BYTES = 32;

function pruneLoginAttemptState(now = Date.now()) {
  for (const [k, v] of loginAttemptState.entries()) {
    if (!v) {
      loginAttemptState.delete(k);
      continue;
    }
    if (v.lockUntil && v.lockUntil > now) continue;
    if (now - (v.lastAt || 0) > LOGIN_ATTEMPT_TTL_MS) {
      loginAttemptState.delete(k);
    }
  }
}

function loginAttemptKey(req, identifier) {
  const ip = String(req.ip || req.socket?.remoteAddress || "ip-unknown");
  const ident = String(identifier || "").trim().toLowerCase().slice(0, 120) || "__empty__";
  return `${ip}::${ident}`;
}

function getLoginLockRemainingMs(req, identifier) {
  pruneLoginAttemptState();
  const key = loginAttemptKey(req, identifier);
  const row = loginAttemptState.get(key);
  if (!row?.lockUntil) return 0;
  const left = row.lockUntil - Date.now();
  return left > 0 ? left : 0;
}

function registerLoginFailure(req, identifier) {
  const key = loginAttemptKey(req, identifier);
  const now = Date.now();
  const current = loginAttemptState.get(key) || { fails: 0, lastAt: now, lockUntil: 0 };
  const nextFails = (current.fails || 0) + 1;
  const lockUntil = nextFails >= LOGIN_MAX_FAILED ? now + LOGIN_LOCK_MS : 0;
  loginAttemptState.set(key, { fails: nextFails, lastAt: now, lockUntil });
}

function clearLoginFailures(req, identifier) {
  loginAttemptState.delete(loginAttemptKey(req, identifier));
}

function hashPasswordResetToken(rawToken) {
  return createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

function equalHashSafe(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
  const ba = Buffer.from(sa, "utf8");
  const bb = Buffer.from(sb, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function authMiddleware(req, res, next) {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ error: "auth_required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

/** Устанавливает req.user при валидном Bearer; иначе req.user = null. Для публичных POST (заявки). */
function optionalAuthMiddleware(req, res, next) {
  req.user = null;
  const token = extractAuthToken(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

function roleMiddleware(roles = []) {
  return async (req, res, next) => {
    if (!req.user?.sub) return res.status(403).json({ error: "forbidden" });
    const tokenRole = String(req.user.role || "").trim().toLowerCase();
    const need = roles.map((r) => String(r || "").trim().toLowerCase());
    if (tokenRole && need.includes(tokenRole)) return next();
    try {
      const db = await crmSnapshot();
      const user = db.users.find((u) => u.id === req.user.sub);
      const actualRole = String(user?.role || "").trim().toLowerCase();
      if (actualRole && need.includes(actualRole)) {
        req.user.role = actualRole;
        return next();
      }
    } catch {
      /* ignore and fall through */
    }
    return res.status(403).json({ error: "forbidden_role" });
  };
}

function permissionMiddleware(permission) {
  return async (req, res, next) => {
    if (!req.user?.role) return res.status(403).json({ error: "forbidden" });
    const db = await crmSnapshot();
    if (!roleHasPermission(db, req.user.role, permission)) {
      return res.status(403).json({ error: "forbidden_permission", message: "Недостаточно прав доступа." });
    }
    next();
  };
}

const CRM_MODULE_KEYS = new Set(["tasks", "calendarEvents", "inventory", "inventoryMovements", "documents", "dropshippers", "campaigns", "finance", "integrations"]);

function crmModuleKeyOrNull(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return CRM_MODULE_KEYS.has(key) ? key : null;
}

function sanitizeCrmModulePayload(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "id" || k === "createdAt" || k === "updatedAt") continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 2000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (v == null) out[k] = null;
    else if (Array.isArray(v)) out[k] = v.slice(0, 100).map((x) => (typeof x === "string" ? x.slice(0, 200) : x));
    else if (typeof v === "object") out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

function appendCrmModuleRecord(db, moduleKey, payload, authorId = null) {
  if (!db.modules || typeof db.modules !== "object") db.modules = {};
  if (!Array.isArray(db.modules[moduleKey])) db.modules[moduleKey] = [];
  const id = Number(db.meta.nextCrmEntityId++) || Date.now();
  const item = {
    id,
    ...sanitizeCrmModulePayload(payload || {}),
    authorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.modules[moduleKey].unshift(item);
  return item;
}

function sanitizeCartSnapshot(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 80).map((row) => ({
    title: String(row.title || "").slice(0, 220),
    details: String(row.details || "").slice(0, 400),
    qty: Math.min(9999, Math.max(0, Number(row.qty) || 0)),
    lineTotal:
      row.lineTotal == null || row.lineTotal === ""
        ? null
        : (() => {
            const n = Number(row.lineTotal);
            return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
          })(),
  }));
}

function normalizeLeadInput(payload = {}) {
  const orderTotalRaw = payload.orderTotal;
  const orderTotalN =
    orderTotalRaw == null || orderTotalRaw === ""
      ? null
      : (() => {
          const n = Number(orderTotalRaw);
          return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
        })();
  const deliveryMethod = String(payload.deliveryMethod || "").trim().slice(0, 64) || null;
  return {
    customerName: String(payload.name || payload.customerName || "").trim(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim(),
    comment: String(payload.comment || "").trim(),
    source: String(payload.source || "site_form").trim(),
    customerType: String(payload.customerType || "retail").trim(),
    cart: Array.isArray(payload.cart) ? payload.cart : [],
    orderTotal: orderTotalN,
    cartSnapshot: sanitizeCartSnapshot(payload.cartSnapshot),
    deliveryMethod,
    paymentMethod: String(payload.paymentMethod || "").trim().slice(0, 80) || null,
    paymentNote: String(payload.paymentNote || "").trim().slice(0, 500) || null,
    topic: String(payload.topic || "").trim().slice(0, 200) || "",
    deliveryCity: String(payload.deliveryCity || "").trim().slice(0, 120) || null,
    deliveryPoint: String(payload.deliveryPoint || payload.deliveryWarehouse || "").trim().slice(0, 500) || null,
    npCityRef: String(payload.npCityRef || "").trim().slice(0, 64) || null,
    npWarehouseRef: String(payload.npWarehouseRef || "").trim().slice(0, 64) || null,
    marketingOptIn: Boolean(payload.marketingOptIn),
    buyerIsAuthenticated: Boolean(payload.buyerIsAuthenticated),
    guestIndividualNoVatPricing: Boolean(payload.guestIndividualNoVatPricing),
    legalEntityVatPricing: Boolean(payload.legalEntityVatPricing),
    isLegalEntityBuyer: Boolean(payload.isLegalEntityBuyer),
    billingCompanyName: String(payload.billingCompanyName || "").trim().slice(0, 200) || null,
    billingEdrpou: String(payload.billingEdrpou || "").trim().slice(0, 20) || null,
    billingInvoiceEmail: String(payload.billingInvoiceEmail || "").trim().toLowerCase().slice(0, 120) || null,
    billingIban: String(payload.billingIban || "").trim().slice(0, 40) || null,
    billingLegalAddress: String(payload.billingLegalAddress || "").trim().slice(0, 500) || null,
  };
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pickAssignee(db) {
  const managers = db.users.filter((u) => isLeadStaffRole(u.role));
  if (!managers.length) return null;
  const idx = db.meta.assignCursor % managers.length;
  db.meta.assignCursor = (db.meta.assignCursor + 1) % managers.length;
  return managers[idx];
}

async function sendWebhook(eventType, payload) {
  if (!CRM_WEBHOOK_URL) return;
  try {
    await fetch(CRM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload }),
    });
  } catch {
    // ignore webhook failures, main flow must not fail
  }
}

const app = express();

if (isProd || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'"],
              formAction: [
                "'self'",
                "https://www.liqpay.ua",
                "https://liqpay.ua",
                "https://pay.fondy.eu",
                "https://secure.wayforpay.com",
              ],
              fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
              frameAncestors: ["'none'"],
            },
          }
      : false,
  })
);

app.use(
  cors({
    origin(origin, cb) {
      if (!isProd) {
        cb(null, true);
        return;
      }
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 12 : 200,
  message: { error: "rate_limited", message: "Слишком много попыток входа. Подождите и попробуйте снова." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 20 : 200,
  message: { error: "rate_limited", message: "Слишком много регистраций с этого адреса. Попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authForgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 8 : 120,
  message: { error: "rate_limited", message: "Слишком много запросов на восстановление пароля. Попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const leadsPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 50 : 400,
  message: { error: "rate_limited", message: "Слишком много заявок. Попробуйте позже или свяжитесь по телефону." },
  standardHeaders: true,
  legacyHeaders: false,
});

const analyticsCollectLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 2000 : 20000,
  message: { error: "rate_limited", message: "Слишком много событий аналитики." },
  standardHeaders: true,
  legacyHeaders: false,
});

const liqpayInvoiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 120,
  message: { error: "rate_limited", message: "Перевищено ліміт спроб оплати. Спробуйте пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

const novaPoshtaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 40 : 200,
  message: { error: "rate_limited", message: "Занадто багато запитів до довідника. Спробуйте за хвилину." },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminRuntimeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 180 : 2000,
  message: { error: "rate_limited", message: "Слишком много запросов к админ-рантайму. Повторите через минуту." },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiCatalogSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 30 : 300,
  message: { error: "rate_limited", message: "Слишком много запросов к ИИ-поиску. Повторите через минуту." },
  standardHeaders: true,
  legacyHeaders: false,
});

function paymentProviderFromInput(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "fondy" || p === "wayforpay" || p === "liqpay") return p;
  return "fondy";
}

function paymentProviderAvailability() {
  return {
    fondy: { configured: fondyConfigured(), label: "Fondy" },
    wayforpay: { configured: wayforpayConfigured(), label: "WayForPay" },
    liqpay: { configured: liqpayConfigured(), label: "LiqPay" },
  };
}

function isProviderConfigured(provider) {
  if (provider === "fondy") return fondyConfigured();
  if (provider === "wayforpay") return wayforpayConfigured();
  return liqpayConfigured();
}

function providerConfigHint(provider) {
  if (provider === "fondy") return "Додайте FONDY_MERCHANT_ID і FONDY_SECRET_KEY в .env.";
  if (provider === "wayforpay") return "Додайте WAYFORPAY_MERCHANT_ACCOUNT і WAYFORPAY_SECRET_KEY в .env.";
  return "Додайте LIQPAY_PUBLIC_KEY і LIQPAY_PRIVATE_KEY в .env.";
}

function buildAccountPaymentLeadSource(provider) {
  return `account_${provider}`;
}

function createFondySignature(requestObj) {
  const keys = Object.keys(requestObj)
    .filter((k) => k !== "signature" && requestObj[k] !== null && requestObj[k] !== undefined && requestObj[k] !== "")
    .sort();
  const parts = [FONDY_SECRET_KEY, ...keys.map((k) => String(requestObj[k]))];
  return createHash("sha1").update(parts.join("|"), "utf8").digest("hex");
}

function createWayforpaySignature(payload) {
  const base = [
    payload.merchantAccount,
    payload.merchantDomainName,
    payload.orderReference,
    payload.orderDate,
    payload.amount,
    payload.currency,
    ...(Array.isArray(payload.productName) ? payload.productName : []),
    ...(Array.isArray(payload.productCount) ? payload.productCount.map((x) => String(x)) : []),
    ...(Array.isArray(payload.productPrice) ? payload.productPrice.map((x) => String(x)) : []),
  ]
    .map((x) => String(x))
    .join(";");
  return createHmac("md5", WAYFORPAY_SECRET_KEY).update(base, "utf8").digest("hex");
}

function verifyFondyCallbackSignature(payload) {
  if (!payload || typeof payload !== "object") return false;
  const given = String(payload.signature || "").trim();
  if (!given) return false;
  const clone = { ...payload };
  delete clone.signature;
  const expected = createFondySignature(clone);
  return Boolean(expected && equalHashSafe(given, expected));
}

function verifyWayforpayCallbackSignature(payload) {
  if (!payload || typeof payload !== "object") return false;
  const given = String(payload.merchantSignature || payload.signature || "").trim().toLowerCase();
  if (!given) return false;
  const merchantAccount = String(payload.merchantAccount || WAYFORPAY_MERCHANT_ACCOUNT || "").trim();
  const orderReference = String(payload.orderReference || "").trim();
  const amount = String(payload.amount != null ? payload.amount : "").trim();
  const currency = String(payload.currency || "").trim();
  const transactionStatus = String(payload.transactionStatus || "").trim();
  const reasonCode = String(payload.reasonCode != null ? payload.reasonCode : "").trim();
  const authCode = String(payload.authCode || "").trim();
  const cardPan = String(payload.cardPan || "").trim();
  const candidates = [
    [merchantAccount, orderReference, amount, currency, authCode, cardPan, transactionStatus, reasonCode],
    [merchantAccount, orderReference, amount, currency, transactionStatus, reasonCode],
  ];
  return candidates.some((parts) => {
    if (parts.some((x) => !x)) return false;
    const expected = createHmac("md5", WAYFORPAY_SECRET_KEY)
      .update(parts.join(";"), "utf8")
      .digest("hex")
      .toLowerCase();
    return equalHashSafe(given, expected);
  });
}

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dp-coatings-api",
    crmStore: crmUsesPostgres() ? "postgresql" : "json-file",
    mail: { smtp: isTransactionalMailConfigured() },
  });
});

app.get("/api/shipping/np/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, configured: Boolean(NOVAPOSHTA_API_KEY) });
});

/** Крупные города Украины (подписи RU/UK) — для выпадающего списка на checkout. */
app.get("/api/shipping/ua-major-cities", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.json({ ok: true, items: readUaMajorCities() });
});

app.post("/api/shipping/np/cities", novaPoshtaLimiter, async (req, res) => {
  if (!NOVAPOSHTA_API_KEY) {
    return res.status(503).json({ ok: false, configured: false, items: [] });
  }
  const find = String(req.body?.find || "").trim().slice(0, 100);
  const lang = String(req.body?.lang || "uk").toLowerCase() === "ru" ? "ru" : "uk";
  if (find.length < 2) {
    return res.json({ ok: true, configured: true, items: [] });
  }
  try {
    const data = await novaPoshtaCall(NOVAPOSHTA_API_KEY, "Address", "getCities", {
      FindByString: find,
      Limit: 30,
      Page: 1,
    });
    const rows = Array.isArray(data) ? data : [];
    const items = rows.map((row) => {
      const ref = String(row.Ref || "").trim();
      const ua = String(row.Description || row.Present || "").trim();
      const ru = String(row.DescriptionRu || "").trim();
      const label = lang === "ru" ? (ru || ua) : (ua || ru);
      return { ref, label: label || ua || ru || ref };
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, configured: true, items });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "np_error";
    res.status(502).json({ ok: false, error: "np_cities_failed", message: msg });
  }
});

app.post("/api/shipping/np/warehouses", novaPoshtaLimiter, async (req, res) => {
  if (!NOVAPOSHTA_API_KEY) {
    return res.status(503).json({ ok: false, configured: false, items: [] });
  }
  const cityRef = String(req.body?.cityRef || "").trim();
  const lang = String(req.body?.lang || "uk").toLowerCase() === "ru" ? "ru" : "uk";
  if (!cityRef) {
    return res.status(400).json({ ok: false, error: "city_ref_required" });
  }
  try {
    const rows = await novaPoshtaListAllWarehouses(NOVAPOSHTA_API_KEY, cityRef, { maxPages: 25 });
    const sorted = [...rows].sort((a, b) => {
      const na = parseInt(String(a.Number || "0"), 10) || 0;
      const nb = parseInt(String(b.Number || "0"), 10) || 0;
      return na - nb;
    });
    const items = sorted.map((row) => {
      const ref = String(row.Ref || "").trim();
      const num = String(row.Number || "").trim();
      const ua = String(row.Description || "").trim();
      const ru = String(row.DescriptionRu || "").trim();
      const addr = String(row.ShortAddress || row.Address || "").trim();
      const desc = lang === "ru" ? (ru || ua) : (ua || ru);
      const label = [num && `№${num}`, desc, addr].filter(Boolean).join(" — ");
      return { ref, label: label || ref };
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, configured: true, items });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "np_error";
    res.status(502).json({ ok: false, error: "np_warehouses_failed", message: msg });
  }
});

app.get("/api/payment/config", (req, res) => {
  const sc = readSiteContent();
  const ap = sc.accountPayment || defaultAccountPayment();
  const d = defaultAccountPayment();
  const q = String((req.query && req.query.lang) || "").toLowerCase();
  const useRu = q === "ru" || q === "ru-ru" || q === "rus";
  /* Без ?lang= — украинский, как в ранних версиях site-content. */
  const offerTitle = useRu
    ? (String(ap.offerTitleRu || d.offerTitleRu).trim() || d.offerTitleRu)
    : (ap.offerTitle || d.offerTitle);
  const offerHtml = useRu
    ? (String(ap.offerHtmlRu || d.offerHtmlRu).trim() || d.offerHtmlRu)
    : (ap.offerHtml || d.offerHtml);
  res.set("Cache-Control", "no-store");
  const providers = paymentProviderAvailability();
  res.json({
    liqpayEnabled: providers.liqpay.configured,
    liqpaySandbox: LIQPAY_SANDBOX,
    liqpayPublicKey: providers.liqpay.configured ? LIQPAY_PUBLIC_KEY : null,
    paymentProviders: providers,
    defaultProvider: providers.fondy.configured
      ? "fondy"
      : providers.wayforpay.configured
        ? "wayforpay"
        : providers.liqpay.configured
          ? "liqpay"
          : "fondy",
    offerTitle,
    offerHtml,
    iban: ap.iban,
  });
});

function normalizeAccountPaymentCartItems(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .slice(0, 200)
    .map((it) => {
      const productId = String(it?.productId || "").trim().slice(0, 120);
      const packTypeRaw = String(it?.packType || "jar").trim().toLowerCase();
      const packType = packTypeRaw === "bucket" || packTypeRaw === "drum" ? packTypeRaw : "jar";
      const qty = Math.max(1, Math.min(999, Number(it?.qty || 1) || 1));
      const customKg = Number(it?.customKg || 0);
      if (!productId) return null;
      return {
        productId,
        packType,
        qty,
        customKg: Number.isFinite(customKg) && customKg > 0 ? customKg : null,
      };
    })
    .filter(Boolean);
}

function computeAccountPaymentAmountByCart(cartItems, isLegalEntityBuyer) {
  const catalog = readProductsCatalog();
  const byId = new Map();
  for (const p of catalog) {
    const id = String(p?.id || "").trim();
    if (!id) continue;
    byId.set(id, p);
  }
  const lines = [];
  const invalidItems = [];
  let total = 0;
  for (const item of cartItems) {
    const p = byId.get(item.productId);
    if (!p) {
      invalidItems.push({ productId: item.productId, reason: "product_not_found" });
      continue;
    }
    const priceNoNds = Number(p.priceNoNdsPerKg ?? 0);
    const priceNds = Number(p.priceNdsPerKg ?? 0);
    const unit = isLegalEntityBuyer
      ? Number.isFinite(priceNds) && priceNds > 0
        ? priceNds
        : priceNoNds
      : Number.isFinite(priceNoNds) && priceNoNds > 0
        ? priceNoNds
        : priceNds;
    if (!Number.isFinite(unit) || unit < 0) {
      invalidItems.push({ productId: item.productId, reason: "invalid_unit_price" });
      continue;
    }
    let weightKg = 0;
    if (item.packType === "bucket") weightKg = Number(p.bucketKg || 0);
    else if (item.packType === "drum") weightKg = Number(p.drumKg || 0);
    else {
      const allowedJarWeights = [Number(p.jarSmallKg || 0), Number(p.jarBigKg || 0), Number(p.jarKg || 0)]
        .filter((n) => Number.isFinite(n) && n > 0)
        .filter((n, idx, arr) => arr.indexOf(n) === idx);
      const requestedJarWeight = Number(item.customKg || 0);
      if (Number.isFinite(requestedJarWeight) && requestedJarWeight > 0) {
        if (allowedJarWeights.length > 0 && !allowedJarWeights.includes(requestedJarWeight)) {
          invalidItems.push({
            productId: item.productId,
            packType: "jar",
            reason: "jar_weight_not_allowed",
            requestedWeight: requestedJarWeight,
            allowedWeights: allowedJarWeights,
          });
          continue;
        }
        weightKg = requestedJarWeight;
      } else {
        weightKg = Number(allowedJarWeights[0] || 0);
      }
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      invalidItems.push({ productId: item.productId, packType: item.packType, reason: "invalid_weight" });
      continue;
    }
    const lineTotal = Math.round(unit * weightKg * item.qty * 100) / 100;
    total += lineTotal;
    lines.push({
      productId: item.productId,
      packType: item.packType,
      qty: item.qty,
      weightKg,
      unit,
      lineTotal,
      name: String(p.name || p.id || "—"),
    });
  }
  return { lines, invalidItems, total: Math.round(total * 100) / 100 };
}

function sanitizeAccountPaymentDelivery(input) {
  const d = input && typeof input === "object" ? input : {};
  const methodRaw = String(d.method || "nova_poshta").trim().toLowerCase();
  const method = methodRaw === "courier" || methodRaw === "pickup" ? methodRaw : "nova_poshta";
  const city = String(d.city || "").trim().slice(0, 120);
  const cityRef = String(d.cityRef || "").trim().slice(0, 120);
  const warehouse = String(d.warehouse || "").trim().slice(0, 180);
  const warehouseRef = String(d.warehouseRef || "").trim().slice(0, 180);
  const address = String(d.address || "").trim().slice(0, 220);
  const courierNpConfirmed =
    d.courierNpConfirmed === true ||
    d.courierNpConfirmed === "true" ||
    d.courierNpConfirmed === 1 ||
    d.courierNpConfirmed === "1";
  const comment = String(d.comment || "").trim().slice(0, 220);
  if (method !== "pickup" && !city) return { error: "delivery_city_required", message: "Вкажіть місто доставки." };
  if (method === "nova_poshta" && !warehouse) {
    return { error: "delivery_warehouse_required", message: "Вкажіть відділення Нової Пошти." };
  }
  if (method === "courier" && !address) {
    return { error: "delivery_address_required", message: "Вкажіть номер або коментар заявки кур'єра НП." };
  }
  if (method === "courier" && !courierNpConfirmed) {
    return { error: "delivery_courier_np_confirm_required", message: "Підтвердіть оформлення доставки через сервіс Нової Пошти." };
  }
  return {
    value: {
      method,
      city: method === "pickup" ? null : city,
      cityRef: method === "nova_poshta" ? (cityRef || null) : null,
      warehouse: method === "nova_poshta" ? warehouse : null,
      warehouseRef: method === "nova_poshta" ? (warehouseRef || null) : null,
      address: method === "courier" ? address : null,
      courierNpConfirmed: method === "courier" ? courierNpConfirmed : null,
      comment: method === "pickup" ? (comment || null) : null,
    },
  };
}

async function createAccountPaymentInvoice(req, res, providerInput) {
  const provider = paymentProviderFromInput(providerInput || req.body?.provider);
  if (!isProviderConfigured(provider)) {
    return res.status(503).json({
      error: "provider_unconfigured",
      provider,
      message: providerConfigHint(provider),
    });
  }
  const { amount, description, acceptOffer } = req.body || {};
  const requestedAmount = Number(amount);
  const cartItems = normalizeAccountPaymentCartItems(req.body?.cartItems);
  const deliverySanitized = sanitizeAccountPaymentDelivery(req.body?.delivery);
  if (deliverySanitized.error) {
    return res.status(400).json({ error: deliverySanitized.error, message: deliverySanitized.message });
  }
  const delivery = deliverySanitized.value;
  const cartSnapshotIn = Array.isArray(req.body?.cartSnapshot) ? req.body.cartSnapshot : [];
  const cartSnapshot = cartSnapshotIn
    .slice(0, 100)
    .map((x) => ({
      title: String(x?.title || "").trim().slice(0, 240),
      details: String(x?.details || "").trim().slice(0, 500),
      qty: Math.max(1, Math.min(999, Number(x?.qty || 1) || 1)),
      lineTotal: Math.max(0, Math.round((Number(x?.lineTotal || 0) || 0) * 100) / 100),
    }))
    .filter((x) => x.title);
  if (!acceptOffer) {
    return res.status(400).json({
      error: "accept_required",
      message: "Потрібна згода з офертою (acceptOffer: true).",
    });
  }
  if (cartItems.length === 0) {
    return res.status(400).json({ error: "cart_empty", message: "Кошик порожній. Додайте товари перед оплатою." });
  }
  const uid = req.user.sub;
  const db0 = await crmSnapshot();
  const user = db0.users.find((u) => u.id === uid);
  if (!user) {
    return res.status(404).json({ error: "not_found", message: "Користувача не знайдено." });
  }
  const phone = String(user.profile?.phone || "").trim();
  if (!phone || phone.length < 9) {
    return res.status(400).json({
      error: "phone_required",
      message: "Вкажіть номер телефону в профілі кабінету перед оплатою.",
    });
  }
  const isLegalEntityBuyer =
    user?.profile?.isLegalEntity === true ||
    user?.profile?.isLegalEntity === "true" ||
    user?.profile?.isLegalEntity === 1 ||
    user?.profile?.isLegalEntity === "1";
  const priceByCart = computeAccountPaymentAmountByCart(cartItems, isLegalEntityBuyer);
  if (Array.isArray(priceByCart.invalidItems) && priceByCart.invalidItems.length) {
    return res.status(400).json({
      error: "invalid_cart_item",
      message: "У кошику є товари з невалідною фасовкою або вагою. Перевірте позиції та спробуйте ще раз.",
      invalidItems: priceByCart.invalidItems.slice(0, 20),
    });
  }
  const amt = Number(priceByCart.total || 0);
  if (!Number.isFinite(amt) || amt < 1) {
    return res.status(400).json({ error: "invalid_amount", message: "Сума від 1 UAH." });
  }
  if (Number.isFinite(requestedAmount) && Math.abs(requestedAmount - amt) > 0.01) {
    return res.status(400).json({
      error: "amount_mismatch",
      message: "Сума замовлення змінилась. Оновіть сторінку оплати.",
      expectedAmount: amt,
    });
  }
  if (amt > 1_000_000) {
    return res.status(400).json({ error: "amount_too_large", message: "Сума занадто велика." });
  }
  const customerType = isLegalEntityBuyer ? "legal" : "individual";
  const legalCompanyName = String(user.profile?.companyName || "").trim();
  const customerName = String(
    (isLegalEntityBuyer && legalCompanyName) || user.name || user.email || "Клієнт"
  ).trim();
  const orderLabel = (String(description || "").trim() || `Онлайн-оплата, акаунт #${user.id}`).slice(0, 400);
  const providerTag = provider === "liqpay" ? "LIQ" : provider === "wayforpay" ? "WFP" : "FON";
  const baseForUrls = PUBLIC_BASE_URL || `${req.protocol}://${req.get("host") || "localhost"}`;

  let lead;
  let orderId;
  let leadId;
  await crmUpdate(async (db) => {
    const assignee = pickAssignee(db);
    leadId = db.meta.nextLeadId;
    orderId = `DPC-${providerTag}-${leadId}-${Date.now()}`;
    const descText = [orderLabel, `Акаунт: ${user.email || ""}`.trim()].filter(Boolean).join(" · ");
    const deliveryLabel =
      delivery.method === "pickup"
        ? `Самовивіз${delivery.comment ? `, коментар: ${delivery.comment}` : ""}`
        : delivery.method === "courier"
          ? `Кур'єр НП (оформлено користувачем через сайт НП), м. ${delivery.city}, заявка: ${delivery.address || "—"}`
          : `Нова Пошта, м. ${delivery.city}, відділення: ${delivery.warehouse || "—"}`;
    const fullComment = `Онлайн-оплата ${provider.toUpperCase()} (створення інвойсу, тип платника: ${customerType}). ${descText}. Доставка: ${deliveryLabel}`.trim();
    lead = {
      id: leadId,
      status: "new",
      priority: "normal",
      customerName,
      phone,
      email: String(user.email || "").trim(),
      comment: fullComment,
      source: buildAccountPaymentLeadSource(provider),
      customerType,
      cart: cartItems,
      orderTotal: Math.round(amt * 100) / 100,
      cartSnapshot,
      deliveryMethod: delivery.method,
      paymentMethod: provider,
      paymentNote: `${provider.toUpperCase()}: очікування оплати`,
      crm: {
        stage: "new",
        tags: [provider, "account_payment"],
        managerNote: "",
        managerNotes: [],
        assigneeId: assignee?.id || null,
        assigneeName: assignee?.name || null,
        accountUserId: uid,
        liqpayOrderId: provider === "liqpay" ? orderId : null,
        payment: {
          status: "pending",
          provider,
          amount: Math.round(amt * 100) / 100,
          currency: "UAH",
          orderId,
          userId: uid,
          customerType,
          isLegalEntityBuyer,
          createdAt: new Date().toISOString(),
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.meta.nextLeadId++;
    db.leads.unshift(lead);
  });

  sendWebhook("lead_created", lead);

  if (provider === "liqpay") {
    const dataObj = {
      version: 3,
      public_key: LIQPAY_PUBLIC_KEY,
      action: "pay",
      amount: Math.round(amt * 100) / 100,
      currency: "UAH",
      description: `Заявка #${leadId} — ${orderLabel}`.slice(0, 400),
      order_id: orderId,
      sandbox: LIQPAY_SANDBOX ? 1 : 0,
      result_url: `${baseForUrls.replace(/\/+$/, "")}/account-payment.html?pay=return&provider=liqpay`,
      server_url: `${baseForUrls.replace(/\/+$/, "")}/api/payments/liqpay/callback`,
      phone: phone.replace(/\D/g, "").slice(-12),
    };
    const dataB64 = Buffer.from(JSON.stringify(dataObj), "utf8").toString("base64");
    const signature = liqpaySign(LIQPAY_PRIVATE_KEY, dataB64);
    return res.json({
      provider,
      action: "https://www.liqpay.ua/api/3/checkout",
      method: "POST",
      fields: { data: dataB64, signature },
      orderId,
      leadId,
    });
  }

  if (provider === "fondy") {
    const fondyRequest = {
      merchant_id: Number(FONDY_MERCHANT_ID),
      order_id: orderId,
      order_desc: `Заявка #${leadId} — ${orderLabel}`.slice(0, 400),
      amount: Math.round(amt * 100),
      currency: "UAH",
      response_url: `${baseForUrls.replace(/\/+$/, "")}/account-payment.html?pay=return&provider=fondy`,
      server_callback_url: `${baseForUrls.replace(/\/+$/, "")}/api/payments/fondy/callback`,
      sender_email: String(user.email || "").trim().slice(0, 120),
      sender_cell_phone: phone.replace(/\D/g, "").slice(-12),
      lang: "uk",
    };
    fondyRequest.signature = createFondySignature(fondyRequest);
    const fr = await fetch("https://pay.fondy.eu/api/checkout/url/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: fondyRequest }),
    });
    const fj = await fr.json().catch(() => ({}));
    const checkoutUrl = fj?.response?.checkout_url || "";
    if (!fr.ok || !checkoutUrl) {
      const msg = String(fj?.response?.error_message || "Не вдалося створити платіж Fondy.");
      return res.status(502).json({ error: "fondy_create_failed", message: msg });
    }
    return res.json({ provider, redirectUrl: checkoutUrl, orderId, leadId });
  }

  const wayforpayPayload = {
    merchantAccount: WAYFORPAY_MERCHANT_ACCOUNT,
    merchantDomainName: String((PUBLIC_BASE_URL || `${req.protocol}://${req.get("host") || "localhost"}`)
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")),
    orderReference: orderId,
    orderDate: Math.floor(Date.now() / 1000),
    amount: Math.round(amt * 100) / 100,
    currency: "UAH",
    productName: [`Заявка #${leadId}`],
    productCount: [1],
    productPrice: [Math.round(amt * 100) / 100],
    returnUrl: `${baseForUrls.replace(/\/+$/, "")}/account-payment.html?pay=return&provider=wayforpay`,
    serviceUrl: `${baseForUrls.replace(/\/+$/, "")}/api/payments/wayforpay/callback`,
    clientFirstName: customerName.slice(0, 60),
    clientEmail: String(user.email || "").trim().slice(0, 120),
    clientPhone: phone.replace(/\D/g, "").slice(-12),
    language: "UA",
  };
  wayforpayPayload.merchantSignature = createWayforpaySignature(wayforpayPayload);
  return res.json({
    provider,
    action: "https://secure.wayforpay.com/pay",
    method: "POST",
    fields: wayforpayPayload,
    orderId,
    leadId,
  });
}

app.post("/api/payments/invoice", authMiddleware, liqpayInvoiceLimiter, async (req, res) => {
  return createAccountPaymentInvoice(req, res, null);
});

app.post("/api/payments/liqpay/invoice", authMiddleware, liqpayInvoiceLimiter, async (req, res) => {
  return createAccountPaymentInvoice(req, res, "liqpay");
});

app.post("/api/payments/liqpay/callback", async (req, res) => {
  if (!liqpayConfigured()) {
    return res.status(503).send("unconfigured");
  }
  const dataB64 = req.body && (req.body.data || req.body.Data);
  const signature = req.body && (req.body.signature || req.body.Signature);
  if (!dataB64 || !signature) {
    return res.status(400).send("bad_request");
  }
  if (!liqpayVerify(LIQPAY_PRIVATE_KEY, dataB64, signature)) {
    return res.status(400).send("invalid_signature");
  }
  let payload;
  try {
    payload = liqpayDecodeData(dataB64);
  } catch {
    return res.status(400).send("invalid_data");
  }
  const orderId = String(payload.order_id || "");
  if (!orderId) {
    return res.status(400).send("no_order");
  }
  const payStatus = String(payload.status || "");
  const success = payStatus === "success" || payStatus === "sandbox" || payStatus === "subscribed";
  const err = payload.err_code != null && payload.err_code !== "" ? String(payload.err_code) : null;
  let receiptData = null;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((l) => l.crm && String(l.crm.liqpayOrderId) === orderId);
    if (!lead) return;
    normalizeLeadCrm(lead);
    if (!lead.crm.payment) lead.crm.payment = {};
    lead.crm.payment.status = success ? "success" : err ? `error:${err}` : payStatus || "unknown";
    lead.crm.payment.liqpayStatus = payStatus;
    if (success) {
      lead.crm.payment.paidAt = new Date().toISOString();
      lead.crm.payment.transactionId = payload.transaction_id != null ? String(payload.transaction_id) : null;
      if (!lead.crm.payment.receiptSentAt && lead.email) {
        receiptData = {
          toEmail: String(lead.email || "").trim(),
          customerName: String(lead.customerName || "").trim(),
          leadId: lead.id,
          orderId,
          provider: "liqpay",
          amount: Number(lead.crm.payment.amount || payload.amount || 0) || 0,
          currency: String(lead.crm.payment.currency || payload.currency || "UAH"),
          cartSnapshot: Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot : [],
        };
        lead.crm.payment.receiptSentAt = new Date().toISOString();
      }
      const note = `LiqPay: оплачено (${payStatus})${payload.amount != null ? `, сума ${payload.amount} ${payload.currency || "UAH"}` : ""}`;
      if (!lead.paymentNote || !String(lead.paymentNote).includes("LiqPay: оплачено")) {
        lead.paymentNote = [lead.paymentNote, note].filter(Boolean).join("\n");
      }
    }
    lead.updatedAt = new Date().toISOString();
  });
  if (receiptData) {
    const ap = (readSiteContent().accountPayment || defaultAccountPayment()).iban || {};
    sendPaymentReceiptMail({ ...receiptData, sellerIban: ap }).catch((e) =>
      console.warn("[mail] payment receipt failed:", e && e.message ? e.message : e)
    );
  }
  res.send("OK");
});

app.post("/api/payments/fondy/callback", async (req, res) => {
  if (!fondyConfigured()) return res.status(503).send("unconfigured");
  const payload = req.body && req.body.order_id ? req.body : req.body?.response || req.body?.request || {};
  if (!verifyFondyCallbackSignature(payload)) return res.status(400).send("invalid_signature");
  const orderId = String(payload.order_id || "").trim();
  if (!orderId) return res.status(400).send("no_order");
  const status = String(payload.order_status || payload.payment_status || "").toLowerCase();
  const success = ["approved", "declined_waiting", "processing"].includes(status) ? status === "approved" : false;
  let receiptData = null;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((l) => String(l?.crm?.payment?.orderId || "") === orderId);
    if (!lead) return;
    normalizeLeadCrm(lead);
    if (!lead.crm.payment) lead.crm.payment = {};
    lead.crm.payment.provider = "fondy";
    lead.crm.payment.status = success ? "success" : status || "unknown";
    lead.crm.payment.fondyStatus = status || null;
    if (success) {
      lead.crm.payment.paidAt = new Date().toISOString();
      if (!lead.crm.payment.receiptSentAt && lead.email) {
        receiptData = {
          toEmail: String(lead.email || "").trim(),
          customerName: String(lead.customerName || "").trim(),
          leadId: lead.id,
          orderId,
          provider: "fondy",
          amount: Number(lead.crm.payment.amount || 0) || 0,
          currency: String(lead.crm.payment.currency || "UAH"),
          cartSnapshot: Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot : [],
        };
        lead.crm.payment.receiptSentAt = new Date().toISOString();
      }
      lead.paymentNote = [lead.paymentNote, `Fondy: оплачено (${status})`].filter(Boolean).join("\n");
    }
    lead.updatedAt = new Date().toISOString();
  });
  if (receiptData) {
    const ap = (readSiteContent().accountPayment || defaultAccountPayment()).iban || {};
    sendPaymentReceiptMail({ ...receiptData, sellerIban: ap }).catch((e) =>
      console.warn("[mail] payment receipt failed:", e && e.message ? e.message : e)
    );
  }
  res.send("OK");
});

app.post("/api/payments/wayforpay/callback", async (req, res) => {
  if (!wayforpayConfigured()) return res.status(503).send("unconfigured");
  const body = req.body || {};
  if (!verifyWayforpayCallbackSignature(body)) return res.status(400).send("invalid_signature");
  const orderId = String(body.orderReference || "").trim();
  if (!orderId) return res.status(400).send("no_order");
  const txStatus = String(body.transactionStatus || "").toLowerCase();
  const success = txStatus === "approved";
  let receiptData = null;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((l) => String(l?.crm?.payment?.orderId || "") === orderId);
    if (!lead) return;
    normalizeLeadCrm(lead);
    if (!lead.crm.payment) lead.crm.payment = {};
    lead.crm.payment.provider = "wayforpay";
    lead.crm.payment.status = success ? "success" : txStatus || "unknown";
    lead.crm.payment.wayforpayStatus = txStatus || null;
    if (success) {
      lead.crm.payment.paidAt = new Date().toISOString();
      if (!lead.crm.payment.receiptSentAt && lead.email) {
        receiptData = {
          toEmail: String(lead.email || "").trim(),
          customerName: String(lead.customerName || "").trim(),
          leadId: lead.id,
          orderId,
          provider: "wayforpay",
          amount: Number(lead.crm.payment.amount || 0) || 0,
          currency: String(lead.crm.payment.currency || "UAH"),
          cartSnapshot: Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot : [],
        };
        lead.crm.payment.receiptSentAt = new Date().toISOString();
      }
      lead.paymentNote = [lead.paymentNote, `WayForPay: оплачено (${txStatus})`].filter(Boolean).join("\n");
    }
    lead.updatedAt = new Date().toISOString();
  });
  if (receiptData) {
    const ap = (readSiteContent().accountPayment || defaultAccountPayment()).iban || {};
    sendPaymentReceiptMail({ ...receiptData, sellerIban: ap }).catch((e) =>
      console.warn("[mail] payment receipt failed:", e && e.message ? e.message : e)
    );
  }
  res.send("OK");
});

app.post("/api/auth/register", authRegisterLimiter, async (req, res) => {
  const b = req.body || {};
  const { name, email, password, role } = b;
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  const firstName = String(b.firstName != null ? b.firstName : "").trim();
  const lastName = String(b.lastName != null ? b.lastName : "").trim();
  const cityIn = String(b.city != null ? b.city : (b.profile && b.profile.city) || "").trim();
  const siteIn = String(b.website != null ? b.website : (b.profile && b.profile.website) || "").trim();
  const phoneIn = String(b.phone != null ? b.phone : (b.profile && b.profile.phone) || "").trim();
  const companyIn = String(
    b.companyName != null ? b.companyName : (b.profile && b.profile.companyName) || ""
  ).trim();
  const legalAdrIn = String(
    b.legalAddress != null ? b.legalAddress : (b.profile && b.profile.legalAddress) || ""
  ).trim();
  const edrpouIn = String(b.edrpou != null ? b.edrpou : (b.profile && b.profile.edrpou) || "")
    .replace(/\s+/g, "")
    .trim();
  const billingIbanIn = String(
    b.billingIban != null ? b.billingIban : (b.profile && b.profile.billingIban) || ""
  )
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();
  const invoiceEmailIn = String(
    b.invoiceEmail != null ? b.invoiceEmail : (b.profile && b.profile.invoiceEmail) || ""
  )
    .trim()
    .toLowerCase();
  const deliveryIn = String(
    b.deliveryAddress != null ? b.deliveryAddress : (b.profile && b.profile.deliveryAddress) || ""
  ).trim();
  const isLegalEntity =
    b.isLegalEntity === true ||
    b.isLegalEntity === "true" ||
    b.isLegalEntity === 1 ||
    b.isLegalEntity === "1";
  const marketingOptIn =
    b.marketingOptIn === true ||
    b.marketingOptIn === "true" ||
    b.marketingOptIn === 1 ||
    b.marketingOptIn === "1";
  const termsAccepted =
    b.termsAccepted === true ||
    b.termsAccepted === "true" ||
    b.termsAccepted === 1 ||
    b.termsAccepted === "1";

  const extendedReg = firstName.length > 0 || cityIn.length > 0;
  let cleanName = [firstName, lastName].filter(Boolean).join(" ").trim() || String(name || "").trim();
  if (!cleanName && cleanEmail.includes("@")) {
    cleanName = cleanEmail.split("@")[0] || "";
  }
  if (!cleanName) cleanName = "Пользователь";

  const registerPasswordError = passwordPolicyError(cleanPassword);
  if (!cleanEmail || !cleanEmail.includes("@") || registerPasswordError) {
    return res.status(400).json({
      error: "invalid_payload",
      message: !cleanEmail || !cleanEmail.includes("@") ? "Укажите корректный email." : registerPasswordError,
    });
  }
  if (!termsAccepted) {
    return res.status(400).json({
      error: "terms_required",
      message: "Для регистрации необходимо принять Политику конфиденциальности и условия использования сайта.",
    });
  }

  if (extendedReg) {
    if (!firstName) {
      return res.status(400).json({ error: "invalid_payload", message: "Укажите имя." });
    }
    if (!cityIn) {
      return res.status(400).json({ error: "invalid_payload", message: "Укажите город." });
    }
    if (!String(phoneIn || "").trim()) {
      return res.status(400).json({ error: "invalid_payload", message: "Укажите телефон." });
    }
    if (isLegalEntity && !companyIn) {
      return res.status(400).json({
        error: "invalid_payload",
        message: "Для юридического лица укажите название предприятия.",
      });
    }
    if (isLegalEntity && !/^\d{8,10}$/.test(edrpouIn)) {
      return res.status(400).json({
        error: "invalid_payload",
        message: "Для юридического лица укажите ЄДРПОУ/РНОКПП (8–10 цифр).",
      });
    }
    if (isLegalEntity && !/^UA\d{2}[A-Z0-9]{5,30}$/.test(billingIbanIn)) {
      return res.status(400).json({
        error: "invalid_payload",
        message: "Для юридического лица укажите корректный IBAN (UA...).",
      });
    }
    if (isLegalEntity && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmailIn)) {
      return res.status(400).json({
        error: "invalid_payload",
        message: "Для юридического лица укажите email для счетов.",
      });
    }
  }
  const newProfile = defaultProfile();
  newProfile.privacyConsentAcceptedAt = new Date().toISOString();
  newProfile.privacyConsentVersion = PRIVACY_POLICY_VERSION;
  newProfile.marketingOptIn = Boolean(marketingOptIn);

  const passwordHash = await bcrypt.hash(cleanPassword, 10);
  const requested = String(role || "client").trim();
  const safeRole = PUBLIC_REGISTER_ROLES.has(requested) ? requested : "client";
  if (extendedReg) {
    newProfile.lastName = lastName.slice(0, 200);
    newProfile.city = cityIn.slice(0, 200);
    newProfile.countryRegion = cityIn.slice(0, 200);
    newProfile.website = siteIn.slice(0, 200);
    newProfile.phone = phoneIn.slice(0, 80);
    newProfile.isLegalEntity = Boolean(isLegalEntity);
    newProfile.companyName = companyIn.slice(0, 200);
    newProfile.edrpou = edrpouIn.slice(0, 20);
    newProfile.billingIban = billingIbanIn.slice(0, 34);
    newProfile.invoiceEmail = invoiceEmailIn.slice(0, 120);
    newProfile.legalAddress = legalAdrIn.slice(0, 500);
    newProfile.deliveryAddress = deliveryIn.slice(0, 500);
  }

  let user;
  await crmUpdate(async (db) => {
    if (db.users.some((u) => u.email === cleanEmail)) {
      user = null;
      return;
    }
    user = {
      id: db.meta.nextUserId++,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role: db.users.length === 0 ? "admin" : safeRole,
      createdAt: new Date().toISOString(),
      profile: newProfile,
      profileUpdatedAt: extendedReg ? new Date().toISOString() : null,
    };
    db.users.push(user);
  });
  if (!user) {
    return res.status(409).json({ error: "email_exists", message: "Пользователь с таким email уже существует." });
  }

  const token = signToken(user);
  setAuthCookie(res, token, 30 * 24 * 60 * 60 * 1000);
  if (isTransactionalMailConfigured()) {
    void sendWelcomeMail(user).catch((err) => console.error("[mail] welcome failed:", err?.message || err));
  }
  res.status(201).json({
    token,
    user: publicUser(user),
  });
});

app.post("/api/auth/login", authLoginLimiter, async (req, res) => {
  const body = req.body || {};
  const identifier = String(body.email || body.login || "").trim();
  const cleanPassword = String(body.password || "");
  const lockRemainingMs = getLoginLockRemainingMs(req, identifier);
  if (lockRemainingMs > 0) {
    return res.status(429).json({
      error: "login_temporarily_locked",
      message: "Вход временно заблокирован после серии неудачных попыток. Попробуйте позже.",
      retryAfterSec: Math.ceil(lockRemainingMs / 1000),
    });
  }
  const db = await crmSnapshot();
  const idLower = identifier.toLowerCase();
  const nameKey = identifier.trim().toLowerCase();
  const user = db.users.find(
    (u) =>
      u.email === idLower ||
      (u.name && u.name.trim().toLowerCase() === nameKey)
  );
  if (!user) {
    registerLoginFailure(req, identifier);
    return res.status(401).json({ error: "invalid_credentials", message: "Неверный логин или пароль." });
  }
  const ok = await bcrypt.compare(cleanPassword, user.passwordHash);
  if (!ok) {
    registerLoginFailure(req, identifier);
    return res.status(401).json({ error: "invalid_credentials", message: "Неверный логин или пароль." });
  }

  const token = signToken(user);
  const role = String(user.role || "client").toLowerCase();
  const ttlMs = role === "admin" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  setAuthCookie(res, token, ttlMs);
  clearLoginFailures(req, identifier);
  res.json({
    token,
    user: publicUser(user),
  });
});

app.post("/api/auth/forgot-password", authForgotPasswordLimiter, async (req, res) => {
  const body = req.body || {};
  const cleanEmail = String(body.email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return res.json({ ok: true, message: "Если аккаунт с таким email существует, мы отправили ссылку для восстановления." });
  }
  const now = Date.now();
  let targetUser = null;
  let resetUrl = "";
  let hasLeadWithEmail = false;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => String(u.email || "").toLowerCase() === cleanEmail);
    if (!user) {
      hasLeadWithEmail = (db.leads || []).some((l) => String(l?.email || "").trim().toLowerCase() === cleanEmail);
      return;
    }
    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
    const tokenHash = hashPasswordResetToken(rawToken);
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpiresAt = new Date(now + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();
    user.updatedAt = new Date().toISOString();
    targetUser = user;
    const baseForLinks = PUBLIC_BASE_URL || `${req.protocol}://${req.get("host") || "localhost"}`;
    resetUrl = `${baseForLinks.replace(/\/+$/, "")}/auth.html?reset_token=${encodeURIComponent(rawToken)}`;
  });
  if (!targetUser) {
    if (hasLeadWithEmail) {
      return res.status(404).json({
        error: "account_not_found",
        message:
          "Email найден в заказах/заявках, но аккаунт с таким email не зарегистрирован. Сначала пройдите регистрацию.",
      });
    }
    return res.status(404).json({
      error: "account_not_found",
      message: "Аккаунт с таким email не найден. Проверьте email или зарегистрируйтесь.",
    });
  }
  if (!isTransactionalMailConfigured()) {
    return res.status(503).json({
      error: "mail_not_configured",
      message: "Восстановление недоступно: почтовый сервер не настроен.",
    });
  }
  if (targetUser && resetUrl && isTransactionalMailConfigured()) {
    try {
      const info = await sendPasswordResetMail({
        toEmail: targetUser.email,
        customerName: targetUser.name || "",
        resetUrl,
        ttlMinutes: Math.round(PASSWORD_RESET_TOKEN_TTL_MS / 60000),
      });
      if (!isProd) {
        console.log("[mail] password reset sent:", {
          to: targetUser.email,
          accepted: info?.accepted || [],
          response: info?.response || "",
        });
      }
    } catch (err) {
      console.error("[mail] password reset failed:", err?.message || err);
      return res.status(502).json({
        error: "mail_send_failed",
        message: "Не удалось отправить письмо для восстановления. Попробуйте позже.",
      });
    }
  }
  return res.json({
    ok: true,
    message: "Если аккаунт с таким email существует, мы отправили ссылку для восстановления.",
    ...(AUTH_DEBUG_RESET_URLS && !isProd ? { debugResetUrl: resetUrl || undefined } : {}),
  });
});

app.post("/api/auth/reset-password", authForgotPasswordLimiter, async (req, res) => {
  const body = req.body || {};
  const rawToken = String(body.token || "").trim();
  const newPassword = String(body.newPassword || "");
  const resetPasswordError = passwordPolicyError(newPassword);
  if (!rawToken || rawToken.length < 32) {
    return res.status(400).json({ error: "invalid_token", message: "Ссылка восстановления недействительна." });
  }
  if (resetPasswordError) {
    return res.status(400).json({ error: "invalid_new_password", message: resetPasswordError });
  }
  const tokenHash = hashPasswordResetToken(rawToken);
  let userOut = null;
  let newToken = null;
  let notFound = false;
  let expired = false;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => {
      const h = String(u.passwordResetTokenHash || "");
      if (!h) return false;
      return equalHashSafe(h, tokenHash);
    });
    if (!user) {
      notFound = true;
      return;
    }
    const exp = new Date(user.passwordResetExpiresAt || 0).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      expired = true;
      delete user.passwordResetTokenHash;
      delete user.passwordResetExpiresAt;
      user.updatedAt = new Date().toISOString();
      return;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.passwordResetTokenHash;
    delete user.passwordResetExpiresAt;
    user.updatedAt = new Date().toISOString();
    userOut = publicUser(user);
    newToken = signToken(user);
  });
  if (notFound || expired || !userOut || !newToken) {
    return res.status(400).json({ error: "invalid_or_expired_token", message: "Ссылка восстановления устарела или недействительна." });
  }
  setAuthCookie(res, newToken, 30 * 24 * 60 * 60 * 1000);
  return res.json({ ok: true, token: newToken, user: userOut });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const db = await crmSnapshot();
  const user = db.users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: "user_not_found" });
  ensureUserProfile(user);
  res.json({ ...publicUser(user), permissions: normalizeRolePermissions(db.meta.rolePermissions)[user.role || "client"] || {} });
});

/** Заказы и заявки, привязанные к аккаунту (оформление с токеном, LiqPay из кабинета). */
app.get("/api/auth/my-purchases", authMiddleware, async (req, res) => {
  const uid = Number(req.user.sub);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: "invalid_user" });
  const db = await crmSnapshot();
  const items = [];
  for (const lead of db.leads || []) {
    normalizeLeadCrm(lead);
    const crm = lead.crm || {};
    const acc = crm.accountUserId;
    const payUid = crm.payment && crm.payment.userId;
    const owned =
      (acc != null && Number(acc) === uid) || (payUid != null && Number(payUid) === uid);
    if (!owned) continue;
    items.push({
      id: lead.id,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      status: lead.status,
      source: lead.source || "",
      orderTotal: lead.orderTotal,
      deliveryMethod: lead.deliveryMethod,
      paymentMethod: lead.paymentMethod,
      cartLines: Array.isArray(lead.cartSnapshot) ? lead.cartSnapshot.length : 0,
      cartPreview: (lead.cartSnapshot || []).slice(0, 4).map((r) => ({
        title: r.title,
        qty: r.qty,
        lineTotal: r.lineTotal,
      })),
      paymentStatus: crm.payment?.status || null,
      paidAt: crm.payment?.paidAt || null,
    });
  }
  items.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  res.json({ items });
});

/** Сообщения менеджера в личный кабинет клиента (ответы по заявке). */
app.get("/api/me/site-messages", authMiddleware, async (req, res) => {
  const uid = Number(req.user.sub);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: "invalid_user" });
  const db = await crmSnapshot();
  const user = db.users.find((u) => u.id === uid);
  if (!user) return res.json({ items: [] });
  ensureUserProfile(user);
  const items = Array.isArray(user.profile.siteInbox) ? user.profile.siteInbox : [];
  res.json({ items });
});

app.patch("/api/me/site-messages/:msgId/read", authMiddleware, async (req, res) => {
  const uid = Number(req.user.sub);
  const msgId = String(req.params.msgId || "").trim();
  if (!msgId || !Number.isFinite(uid)) return res.status(400).json({ error: "invalid_params" });
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === uid);
    if (!user) return;
    ensureUserProfile(user);
    if (!Array.isArray(user.profile.siteInbox)) user.profile.siteInbox = [];
    const m = user.profile.siteInbox.find((x) => x && String(x.id) === msgId);
    if (m) m.read = true;
  });
  res.json({ ok: true });
});

app.get("/api/auth/permissions", authMiddleware, async (req, res) => {
  const db = await crmSnapshot();
  const role = req.user.role || "client";
  res.json({ role, permissions: normalizeRolePermissions(db.meta.rolePermissions)[role] || {} });
});

app.get("/api/admin/role-permissions", authMiddleware, roleMiddleware(["admin"]), async (_req, res) => {
  const db = await crmSnapshot();
  res.json({
    roles: ADMIN_ASSIGNABLE_ROLES.map((id) => ({ id, label: ROLE_LABELS_RU[id] || id })),
    permissions: ROLE_PERMISSION_KEYS.map((id) => ({ id, label: ROLE_PERMISSION_LABELS[id] || id })),
    matrix: normalizeRolePermissions(db.meta.rolePermissions),
  });
});

app.patch("/api/admin/role-permissions", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  const nextMatrix = normalizeRolePermissions(req.body?.matrix || req.body?.permissions || {});
  nextMatrix.admin = { ...DEFAULT_ROLE_PERMISSIONS.admin };
  await crmUpdate(async (db) => {
    db.meta.rolePermissions = normalizeRolePermissions(nextMatrix);
  });
  res.json({ ok: true, matrix: normalizeRolePermissions(nextMatrix) });
});

app.patch("/api/auth/profile", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const exit = { status: 0, json: null };
  let token;
  let userOut;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === req.user.sub);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "user_not_found" };
      return;
    }
    ensureUserProfile(user);

    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (n.length >= 2 && n.length <= 120) user.name = n;
    }
    if (typeof body.email === "string") {
      const em = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        exit.status = 400;
        exit.json = { error: "invalid_email", message: "Некорректный email." };
        return;
      }
      if (em !== user.email && db.users.some((u) => u.email === em)) {
        exit.status = 409;
        exit.json = { error: "email_exists", message: "Этот email уже занят." };
        return;
      }
      user.email = em;
    }

    const pr = body.profile;
    if (pr && typeof pr === "object") {
      if (pr.age !== undefined && pr.age !== null && pr.age !== "") {
        const a = Number(pr.age);
        user.profile.age = Number.isFinite(a) ? Math.max(0, Math.min(120, Math.round(a))) : null;
      } else if (pr.age === null || pr.age === "") {
        user.profile.age = null;
      }
      if (typeof pr.gender === "string") {
        const g = pr.gender.trim().toLowerCase();
        if (g === "") {
          user.profile.gender = "";
        } else {
          const allowed = new Set(["male", "female"]);
          user.profile.gender = allowed.has(g) ? g : user.profile.gender;
        }
      }
      if (typeof pr.countryRegion === "string") user.profile.countryRegion = pr.countryRegion.trim().slice(0, 200);
      if (typeof pr.lastName === "string") user.profile.lastName = pr.lastName.trim().slice(0, 200);
      if (typeof pr.city === "string") user.profile.city = pr.city.trim().slice(0, 200);
      if (typeof pr.website === "string") user.profile.website = pr.website.trim().slice(0, 200);
      if (typeof pr.isLegalEntity === "boolean") user.profile.isLegalEntity = pr.isLegalEntity;
      if (typeof pr.companyName === "string") user.profile.companyName = pr.companyName.trim().slice(0, 200);
      if (typeof pr.edrpou === "string") user.profile.edrpou = pr.edrpou.replace(/\s+/g, "").slice(0, 20);
      if (typeof pr.invoiceEmail === "string") user.profile.invoiceEmail = pr.invoiceEmail.trim().toLowerCase().slice(0, 120);
      if (typeof pr.billingIban === "string") user.profile.billingIban = pr.billingIban.replace(/\s+/g, "").toUpperCase().slice(0, 34);
      if (typeof pr.phone === "string") user.profile.phone = pr.phone.trim().slice(0, 80);
      if (typeof pr.legalAddress === "string") user.profile.legalAddress = pr.legalAddress.trim().slice(0, 500);
      if (typeof pr.deliveryAddress === "string") user.profile.deliveryAddress = pr.deliveryAddress.trim().slice(0, 500);
    }

    const pv = body.privacy;
    if (pv && typeof pv === "object") {
      for (const k of Object.keys(defaultPrivacy())) {
        if (typeof pv[k] === "boolean") user.profile.privacy[k] = pv[k];
      }
    }

    user.profileUpdatedAt = new Date().toISOString();
    token = signToken(user);
    userOut = publicUser(user);
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, token, user: userOut });
});

app.post("/api/auth/change-password", authMiddleware, authLoginLimiter, async (req, res) => {
  const b = req.body || {};
  const currentPassword = String(b.currentPassword || "");
  const newPassword = String(b.newPassword || "");
  if (!currentPassword) {
    return res.status(400).json({
      error: "current_required",
      message: "Введите текущий пароль.",
    });
  }
  const changePasswordError = passwordPolicyError(newPassword);
  if (changePasswordError) {
    return res.status(400).json({
      error: "invalid_new_password",
      message: changePasswordError,
    });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({
      error: "same_password",
      message: "Новый пароль должен отличаться от текущего.",
    });
  }
  const exit = { status: 0, json: null };
  let token;
  let userOut;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === req.user.sub);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "user_not_found" };
      return;
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      exit.status = 401;
      exit.json = { error: "wrong_password", message: "Неверный текущий пароль." };
      return;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.profileUpdatedAt = new Date().toISOString();
    token = signToken(user);
    userOut = publicUser(user);
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, token, user: userOut });
});

app.post("/api/auth/profile/avatar", authMiddleware, async (req, res) => {
  ensureUploadDirs();
  const raw = String((req.body || {}).imageBase64 || "").trim();
  const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) {
    return res.status(400).json({
      error: "invalid_image",
      message: "Ожидается изображение в формате data:image/png, jpeg или webp;base64,…",
    });
  }
  const ext = m[1].toLowerCase() === "jpeg" || m[1].toLowerCase() === "jpg" ? "jpg" : m[1].toLowerCase();
  let buf;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return res.status(400).json({ error: "invalid_base64", message: "Не удалось разобрать изображение." });
  }
  if (buf.length > 512 * 1024) {
    return res.status(400).json({ error: "too_large", message: "Файл больше 512 КБ." });
  }
  let avatarUrl;
  const exit = { status: 0, json: null };
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === req.user.sub);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "user_not_found" };
      return;
    }
    ensureUserProfile(user);
    const fname = `${user.id}.${ext}`;
    const fpath = path.join(AVATAR_DIR, fname);
    for (const e of ["png", "jpg", "webp"]) {
      const p = path.join(AVATAR_DIR, `${user.id}.${e}`);
      if (fs.existsSync(p) && p !== fpath) fs.unlinkSync(p);
    }
    fs.writeFileSync(fpath, buf);
    user.profile.avatarUrl = `/uploads/avatars/${fname}`;
    user.profileUpdatedAt = new Date().toISOString();
    avatarUrl = user.profile.avatarUrl;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, avatarUrl });
});

app.delete("/api/auth/profile/avatar", authMiddleware, async (req, res) => {
  ensureUploadDirs();
  const exit = { status: 0, json: null };
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === req.user.sub);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "user_not_found" };
      return;
    }
    ensureUserProfile(user);
    for (const e of ["png", "jpg", "webp"]) {
      const p = path.join(AVATAR_DIR, `${user.id}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    user.profile.avatarUrl = null;
    user.profileUpdatedAt = new Date().toISOString();
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true });
});

app.get("/api/users/:id/profile", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const db = await crmSnapshot();
  const target = db.users.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: "not_found", message: "Пользователь не найден." });
  res.json(peerProfileDto(req.user.role, req.user.sub, target));
});

app.get("/api/users", authMiddleware, permissionMiddleware("users.view"), async (req, res) => {
  const db = await crmSnapshot();
  const items = db.users.map((u) => staffUserDto(u));
  res.json({ items });
});

/** Полная выгрузка пользователей для отчётов (без хеша пароля). */
app.get("/api/users/export.csv", authMiddleware, permissionMiddleware("users.export"), async (req, res) => {
  const db = await crmSnapshot();
  const header = [
    "id",
    "name",
    "email",
    "role",
    "createdAt",
    "profileUpdatedAt",
    "age",
    "gender",
    "countryRegion",
    "companyName",
    "phone",
    "legalAddress",
    "deliveryAddress",
    "avatarUrl",
    "privacy_hideEmail",
    "privacy_hidePhone",
    "privacy_hideLegalAddress",
    "privacy_hideDeliveryAddress",
  ];
  const lines = [
    header.join(","),
    ...db.users.map((u) => {
      ensureUserProfile(u);
      const pr = u.profile;
      const pv = pr.privacy || defaultPrivacy();
      return [
        csvEscape(u.id),
        csvEscape(u.name),
        csvEscape(u.email),
        csvEscape(u.role),
        csvEscape(u.createdAt || ""),
        csvEscape(u.profileUpdatedAt || ""),
        csvEscape(pr.age),
        csvEscape(pr.gender),
        csvEscape(pr.countryRegion),
        csvEscape(pr.companyName),
        csvEscape(pr.phone),
        csvEscape(pr.legalAddress),
        csvEscape(pr.deliveryAddress),
        csvEscape(pr.avatarUrl || ""),
        csvEscape(pv.hideEmail),
        csvEscape(pv.hidePhone),
        csvEscape(pv.hideLegalAddress),
        csvEscape(pv.hideDeliveryAddress),
      ].join(",");
    }),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="users-export.csv"');
  res.send("\uFEFF" + lines.join("\n"));
});

app.post("/api/users", authMiddleware, permissionMiddleware("users.create"), async (req, res) => {
  const body = req.body || {};
  const cleanEmail = String(body.email || "").trim().toLowerCase();
  const cleanPassword = String(body.password || "");
  let cleanName = String(body.name || "").trim();
  const role = String(body.role || "client").trim();
  if (!cleanName && cleanEmail.includes("@")) cleanName = cleanEmail.split("@")[0] || "";
  if (!cleanName) cleanName = "Пользователь";
  const createUserPasswordError = passwordPolicyError(cleanPassword);
  if (!cleanEmail || !cleanEmail.includes("@") || createUserPasswordError) {
    return res.status(400).json({
      error: "invalid_payload",
      message: !cleanEmail || !cleanEmail.includes("@") ? "Укажите корректный email." : createUserPasswordError,
    });
  }
  if (!ADMIN_ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: "invalid_role", message: "Недопустимая роль." });
  }
  if (req.user.role !== "admin" && role === "admin") {
    return res.status(403).json({ error: "admin_role_required", message: "Назначать роль администратора может только администратор." });
  }
  const passwordHash = await bcrypt.hash(cleanPassword, 10);
  let user;
  await crmUpdate(async (db) => {
    if (db.users.some((u) => String(u.email || "").toLowerCase() === cleanEmail)) {
      user = null;
      return;
    }
    user = {
      id: db.meta.nextUserId++,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
      profile: defaultProfile(),
      profileUpdatedAt: null,
    };
    db.users.push(user);
  });
  if (!user) {
    return res.status(409).json({ error: "email_exists", message: "Пользователь с таким email уже существует." });
  }
  res.status(201).json({ ok: true, user: staffUserDto(user) });
});

app.patch("/api/users/:id", authMiddleware, permissionMiddleware("users.editRole"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const role = String((req.body || {}).role || "").trim();
  if (!ADMIN_ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: "invalid_role", message: "Недопустимая роль." });
  }
  const exit = { status: 0, json: null };
  let outUser;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Пользователь не найден." };
      return;
    }
    const admins = db.users.filter((u) => u.role === "admin");
    if (user.role === "admin" && role !== "admin" && admins.length <= 1) {
      exit.status = 400;
      exit.json = { error: "last_admin", message: "Нельзя снять последнего администратора." };
      return;
    }
    if (req.user.role !== "admin" && (user.role === "admin" || role === "admin")) {
      exit.status = 403;
      exit.json = { error: "admin_role_required", message: "Менять роль администратора может только администратор." };
      return;
    }
    user.role = role;
    outUser = publicUser(user);
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, user: outUser });
});

app.patch("/api/users/:id/account-manager", authMiddleware, permissionMiddleware("leads.assign"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const managerIdRaw = req.body?.managerId;
  const managerId = managerIdRaw === null || managerIdRaw === "" || managerIdRaw === undefined ? null : Number(managerIdRaw);
  const exit = { status: 0, json: null };
  let outUser = null;
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Пользователь не найден." };
      return;
    }
    ensureUserProfile(user);
    if (managerId == null) {
      user.profile.accountManagerId = null;
    } else {
      const manager = db.users.find((u) => u.id === managerId && isLeadStaffRole(u.role));
      if (!manager) {
        exit.status = 400;
        exit.json = { error: "invalid_manager", message: "Менеджер не найден." };
        return;
      }
      user.profile.accountManagerId = manager.id;
    }
    user.profileUpdatedAt = new Date().toISOString();
    outUser = staffUserDto(user);
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, user: outUser });
});

app.delete("/api/users/:id", authMiddleware, permissionMiddleware("users.delete"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  if (req.user.sub === id) {
    return res.status(400).json({
      error: "self_delete",
      message: "Нельзя удалить собственную учётную запись. Попросите другого администратора.",
    });
  }
  const exit = { status: 0, json: null };
  await crmUpdate(async (db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Пользователь не найден." };
      return;
    }
    const admins = db.users.filter((u) => u.role === "admin");
    if (user.role === "admin" && admins.length <= 1) {
      exit.status = 400;
      exit.json = { error: "last_admin", message: "Нельзя удалить последнего администратора." };
      return;
    }
    db.users = db.users.filter((u) => u.id !== id);
    for (const lead of db.leads) {
      if (lead.crm?.assigneeId === id) {
        lead.crm.assigneeId = null;
        lead.crm.assigneeName = null;
      }
    }
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true });
});

app.get("/api/users/managers", authMiddleware, permissionMiddleware("leads.view"), async (req, res) => {
  const db = await crmSnapshot();
  const items = db.users
    .filter((u) => isLeadStaffRole(u.role))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json({ items });
});

app.post("/api/leads", leadsPostLimiter, optionalAuthMiddleware, async (req, res) => {
  let payload = normalizeLeadInput(req.body || {});
  const accountUid = req.user && req.user.sub != null ? Number(req.user.sub) : null;
  const accountUserId = Number.isFinite(accountUid) ? accountUid : null;
  if (accountUserId) {
    const snap = await crmSnapshot();
    const u = snap.users.find((x) => x.id === accountUserId);
    if (u) {
      ensureUserProfile(u);
      if (!String(payload.phone || "").trim() && u.profile?.phone) {
        payload = { ...payload, phone: String(u.profile.phone).trim() };
      }
    }
  }
  if (!payload.customerName || !String(payload.phone || "").trim()) {
    return res.status(400).json({ error: "invalid_payload", message: "Укажите имя и телефон." });
  }
  if (String(payload.source || "") === "site_form" && !String(payload.topic || "").trim()) {
    return res.status(400).json({ error: "invalid_payload", message: "Укажите тему обращения." });
  }
  const topicBannerSources = ["site_callback_banner", "site_home_calc_banner"];
  if (
    topicBannerSources.includes(String(payload.source || "")) &&
    !String(payload.topic || "").trim()
  ) {
    return res.status(400).json({ error: "invalid_payload", message: "Укажите тему." });
  }
  if (String(payload.source || "") === "site_callback_banner") {
    const line = "Источник: кнопка «Заказать звонок» (баннер внизу страницы контактов).";
    payload.comment = [payload.comment, line].filter((x) => x && String(x).trim()).join("\n\n");
  }
  if (String(payload.source || "") === "site_home_calc_banner") {
    const line = "Источник: кнопка «Получить расчёт» (блок на главной странице).";
    payload.comment = [payload.comment, line].filter((x) => x && String(x).trim()).join("\n\n");
  }
  let lead;
  await crmUpdate(async (db) => {
    const assignee = pickAssignee(db);
    lead = {
      id: db.meta.nextLeadId++,
      status: "new",
      priority: "normal",
      ...payload,
      crm: {
        stage: "new",
        tags: [],
        managerNote: "",
        managerNotes: [],
        clientMessages: [],
        assigneeId: assignee?.id || null,
        assigneeName: assignee?.name || null,
        ...(accountUserId != null ? { accountUserId: accountUserId } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    normalizeLeadCrm(lead);
    db.leads.unshift(lead);
  });
  sendWebhook("lead_created", lead);
  if (!isStaffCrmRequest(req)) {
    if (isTransactionalMailConfigured()) {
      void sendLeadCreatedMails(lead).catch((err) => console.error("[mail] lead notify failed:", err?.message || err));
    }
    void notifyTelegramBannerLead(lead);
  }
  res.status(201).json({ ok: true, leadId: lead.id });
});

app.get("/api/leads", authMiddleware, permissionMiddleware("leads.view"), async (req, res) => {
  const db = await crmSnapshot();
  const summary = {
    total: db.leads.length,
    new: db.leads.filter((x) => x.status === "new").length,
    in_progress: db.leads.filter((x) => x.status === "in_progress").length,
    quoted: db.leads.filter((x) => x.status === "quoted").length,
    won: db.leads.filter((x) => x.status === "won").length,
    lost: db.leads.filter((x) => x.status === "lost").length,
  };
  const status = String(req.query.status || "all");
  const q = String(req.query.q || "").toLowerCase();
  const priority = String(req.query.priority || "all");
  const assigneeIdRaw = String(req.query.assigneeId ?? "all").trim();
  const deliveryFilter = String(req.query.delivery || "all").trim().toLowerCase();
  const paymentFilter = String(req.query.payment || "all").trim().toLowerCase();
  const sort = String(req.query.sort || "created_desc").trim();
  const items = db.leads.filter((lead) => {
    const statusOk = status === "all" || lead.status === status || lead.crm?.stage === status;
    if (!statusOk) return false;
    if (priority !== "all" && lead.priority !== priority) return false;
    if (assigneeIdRaw === "none" || assigneeIdRaw === "unassigned") {
      if (lead.crm?.assigneeId != null) return false;
    } else if (assigneeIdRaw !== "all") {
      const aid = Number(assigneeIdRaw);
      if (!Number.isFinite(aid) || lead.crm?.assigneeId !== aid) return false;
    }
    if (deliveryFilter !== "all") {
      const d = String(lead.deliveryMethod || "").toLowerCase();
      if (deliveryFilter === "none") {
        if (d) return false;
      } else if (d !== deliveryFilter) return false;
    }
    if (paymentFilter !== "all") {
      const p = String(lead.paymentMethod || "").toLowerCase();
      if (paymentFilter === "none") {
        if (p) return false;
      } else if (p !== paymentFilter) return false;
    }
    if (!q) return true;
    const noteHay = (lead.crm?.managerNotes || []).map((n) => n.text).join(" ");
    const legacyNote = typeof lead.crm?.managerNote === "string" ? lead.crm.managerNote : "";
    const snapHay = (lead.cartSnapshot || []).map((r) => `${r.title} ${r.details}`).join(" ");
    const deliv = String(lead.deliveryMethod || "");
    const paym = String(lead.paymentMethod || "");
    const hay = `${lead.customerName} ${lead.phone} ${lead.email} ${lead.topic || ""} ${lead.comment} ${noteHay} ${legacyNote} ${snapHay} ${deliv} ${paym} ${lead.source || ""}`.toLowerCase();
    return hay.includes(q);
  });
  const sign = (a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };
  items.sort((A, B) => {
    const tA = new Date(A.createdAt || 0).getTime();
    const tB = new Date(B.createdAt || 0).getTime();
    if (sort === "created_asc") return sign(tA, tB);
    if (sort === "total_desc" || sort === "total_asc") {
      const a = A.orderTotal != null && A.orderTotal !== "" ? Number(A.orderTotal) : NaN;
      const b = B.orderTotal != null && B.orderTotal !== "" ? Number(B.orderTotal) : NaN;
      const na = Number.isFinite(a) ? a : -Infinity;
      const nb = Number.isFinite(b) ? b : -Infinity;
      if (sort === "total_desc") return sign(nb, na);
      return sign(na, nb);
    }
    return sign(tB, tA);
  });
  res.json({ items, summary });
});

app.patch("/api/leads/:id", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const exit = { status: 0, json: null };
  let leadOut;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((x) => x.id === id);
    if (!lead) {
      exit.status = 404;
      exit.json = { error: "not_found" };
      return;
    }

    normalizeLeadCrm(lead);

    const body = req.body || {};
    const { status, priority, managerNote, tags, assigneeId, customerName, phone, email, comment, topic } = body;
    if (typeof status === "string" && status.trim()) {
      lead.status = status.trim();
      lead.crm.stage = status.trim();
    }
    if (typeof priority === "string" && priority.trim()) lead.priority = priority.trim();
    if (typeof customerName === "string" && customerName.trim()) lead.customerName = customerName.trim().slice(0, 300);
    if (typeof phone === "string" && phone.trim()) lead.phone = phone.trim().slice(0, 80);
    if (typeof email === "string") lead.email = email.trim().slice(0, 200);
    if (typeof comment === "string") lead.comment = comment.trim().slice(0, 2000);
    if (typeof topic === "string") lead.topic = topic.trim().slice(0, 200);
    if (typeof managerNote === "string" && managerNote.trim()) {
      const u = db.users.find((x) => x.id === req.user.sub);
      lead.crm.managerNotes.push({
        id: randomUUID(),
        text: managerNote.trim(),
        authorName: u?.name || req.user.name || req.user.email || "Менеджер",
        authorId: req.user.sub,
        createdAt: new Date().toISOString(),
      });
    }
    if (Array.isArray(tags)) lead.crm.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    if (Object.prototype.hasOwnProperty.call(body, "assigneeId")) {
      if (!roleHasPermission(db, req.user.role, "leads.assign")) {
        exit.status = 403;
        exit.json = { error: "forbidden_permission", message: "Недостаточно прав для назначения ответственного." };
        return;
      }
      if (assigneeId === null || assigneeId === undefined || assigneeId === "") {
        lead.crm.assigneeId = null;
        lead.crm.assigneeName = null;
      } else {
        const aid = Number(assigneeId);
        if (Number.isFinite(aid)) {
          const manager = db.users.find((u) => u.id === aid && isLeadStaffRole(u.role));
          if (manager) {
            lead.crm.assigneeId = manager.id;
            lead.crm.assigneeName = manager.name;
          }
        }
      }
    }
    lead.updatedAt = new Date().toISOString();
    leadOut = lead;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  sendWebhook("lead_updated", leadOut);
  res.json({ ok: true, item: leadOut });
});

app.patch(
  "/api/leads/:leadId/notes/:noteId",
  authMiddleware,
  permissionMiddleware("leads.edit"),
  async (req, res) => {
    const leadId = Number(req.params.leadId);
    const noteId = String(req.params.noteId || "").trim();
    if (!Number.isFinite(leadId) || !noteId) {
      return res.status(400).json({ error: "invalid_params", message: "Некорректные параметры." });
    }
    const text = String((req.body || {}).text ?? "").trim();
    if (!text) {
      return res.status(400).json({ error: "invalid_text", message: "Введите текст заметки." });
    }
    const exit = { status: 0, json: null };
    let leadOut;
    await crmUpdate(async (db) => {
      const lead = db.leads.find((x) => x.id === leadId);
      if (!lead) {
        exit.status = 404;
        exit.json = { error: "not_found", message: "Заявка не найдена." };
        return;
      }
      normalizeLeadCrm(lead);
      const note = lead.crm.managerNotes.find((n) => n && String(n.id) === noteId);
      if (!note) {
        exit.status = 404;
        exit.json = { error: "note_not_found", message: "Заметка не найдена." };
        return;
      }
      const u = db.users.find((x) => x.id === req.user.sub);
      note.text = text;
      note.editedAt = new Date().toISOString();
      note.editedById = req.user.sub;
      note.editedByName = u?.name || req.user.name || req.user.email || "";
      lead.updatedAt = new Date().toISOString();
      leadOut = lead;
    });
    if (exit.status) return res.status(exit.status).json(exit.json);
    sendWebhook("lead_updated", leadOut);
    res.json({ ok: true, item: leadOut });
  }
);

app.delete("/api/leads/:leadId/notes/:noteId", authMiddleware, permissionMiddleware("leads.deleteNotes"), async (req, res) => {
  const leadId = Number(req.params.leadId);
  const noteId = String(req.params.noteId || "").trim();
  if (!Number.isFinite(leadId) || !noteId) {
    return res.status(400).json({ error: "invalid_params", message: "Некорректные параметры." });
  }
  const exit = { status: 0, json: null };
  let leadOut;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((x) => x.id === leadId);
    if (!lead) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Заявка не найдена." };
      return;
    }
    normalizeLeadCrm(lead);
    const idx = lead.crm.managerNotes.findIndex((n) => n && String(n.id) === noteId);
    if (idx === -1) {
      exit.status = 404;
      exit.json = { error: "note_not_found", message: "Заметка не найдена." };
      return;
    }
    lead.crm.managerNotes.splice(idx, 1);
    lead.updatedAt = new Date().toISOString();
    leadOut = lead;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  sendWebhook("lead_updated", leadOut);
  res.json({ ok: true, item: leadOut });
});

app.get("/api/leads/export.csv", authMiddleware, permissionMiddleware("leads.export"), async (req, res) => {
  const db = await crmSnapshot();
  const header = [
    "id",
    "status",
    "priority",
    "assignee",
    "customerName",
    "phone",
    "email",
    "topic",
    "customerType",
    "deliveryMethod",
    "deliveryCity",
    "deliveryPoint",
    "paymentMethod",
    "comment",
    "createdAt",
    "updatedAt",
  ];
  const lines = [
    header.join(","),
    ...db.leads.map((l) =>
      [
        csvEscape(l.id),
        csvEscape(l.status),
        csvEscape(l.priority),
        csvEscape(l.crm?.assigneeName || ""),
        csvEscape(l.customerName),
        csvEscape(l.phone),
        csvEscape(l.email),
        csvEscape(l.topic),
        csvEscape(l.customerType),
        csvEscape(l.deliveryMethod),
        csvEscape(l.deliveryCity),
        csvEscape(l.deliveryPoint),
        csvEscape(l.paymentMethod),
        csvEscape(l.comment),
        csvEscape(l.createdAt),
        csvEscape(l.updatedAt),
      ].join(",")
    ),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"crm-leads.csv\"");
  res.send(lines.join("\n"));
});

app.get("/api/crm/modules/:module", authMiddleware, permissionMiddleware("leads.view"), async (req, res) => {
  const key = crmModuleKeyOrNull(req.params.module);
  if (!key) return res.status(404).json({ error: "module_not_found", message: "Модуль не найден." });
  const db = await crmSnapshot();
  const items = Array.isArray(db.modules?.[key]) ? db.modules[key] : [];
  res.json({ items });
});

app.post("/api/crm/modules/:module", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const key = crmModuleKeyOrNull(req.params.module);
  if (!key) return res.status(404).json({ error: "module_not_found", message: "Модуль не найден." });
  let item = null;
  await crmUpdate(async (db) => {
    if (!Array.isArray(db.modules?.[key])) db.modules[key] = [];
    const id = Number(db.meta.nextCrmEntityId++) || Date.now();
    const payload = sanitizeCrmModulePayload(req.body || {});
    item = {
      id,
      ...payload,
      authorId: req.user.sub || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.modules[key].unshift(item);
  });
  res.status(201).json({ ok: true, item });
});

app.patch("/api/crm/modules/:module/:id", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const key = crmModuleKeyOrNull(req.params.module);
  const id = Number(req.params.id);
  if (!key) return res.status(404).json({ error: "module_not_found", message: "Модуль не найден." });
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const exit = { status: 0, json: null };
  let out = null;
  await crmUpdate(async (db) => {
    if (!Array.isArray(db.modules?.[key])) db.modules[key] = [];
    const row = db.modules[key].find((x) => Number(x.id) === id);
    if (!row) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Запись не найдена." };
      return;
    }
    Object.assign(row, sanitizeCrmModulePayload(req.body || {}));
    row.updatedAt = new Date().toISOString();
    out = row;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true, item: out });
});

app.delete("/api/crm/modules/:module/:id", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const key = crmModuleKeyOrNull(req.params.module);
  const id = Number(req.params.id);
  if (!key) return res.status(404).json({ error: "module_not_found", message: "Модуль не найден." });
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const exit = { status: 0, json: null };
  await crmUpdate(async (db) => {
    if (!Array.isArray(db.modules?.[key])) db.modules[key] = [];
    const before = db.modules[key].length;
    db.modules[key] = db.modules[key].filter((x) => Number(x.id) !== id);
    if (db.modules[key].length === before) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Запись не найдена." };
    }
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.json({ ok: true });
});

app.post("/api/crm/contacts/dedupe", authMiddleware, permissionMiddleware("users.editRole"), async (_req, res) => {
  let merged = 0;
  await crmUpdate(async (db) => {
    merged = mergeDuplicateUsers(db);
  });
  res.json({ ok: true, merged });
});

app.post("/api/leads/:id/interactions", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id", message: "Некорректный id." });
  const body = req.body || {};
  const interaction = {
    id: randomUUID(),
    channel: String(body.channel || "note").trim().slice(0, 60) || "note",
    direction: String(body.direction || "outbound").trim().slice(0, 20) || "outbound",
    message: String(body.message || "").trim().slice(0, 3000),
    recordingUrl: String(body.recordingUrl || "").trim().slice(0, 1200) || null,
    createdAt: new Date().toISOString(),
    authorId: req.user.sub || null,
  };
  const exit = { status: 0, json: null };
  let leadOut = null;
  await crmUpdate(async (db) => {
    const lead = db.leads.find((x) => x.id === id);
    if (!lead) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Сделка не найдена." };
      return;
    }
    normalizeLeadCrm(lead);
    lead.crm.interactions.unshift(interaction);
    lead.updatedAt = new Date().toISOString();
    leadOut = lead;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  res.status(201).json({ ok: true, item: interaction, lead: leadOut });
});

app.post("/api/leads/:id/reply-to-client", authMiddleware, permissionMiddleware("leads.edit"), async (req, res) => {
  const id = Number(req.params.id);
  const message = String((req.body || {}).message || "").trim();
  if (!Number.isFinite(id) || !message) {
    return res.status(400).json({ error: "invalid_payload", message: "Введите текст сообщения." });
  }
  const exit = { status: 0, json: null };
  let clientEmail = null;
  let clientName = "";
  let mailTopic = "";
  let mailManager = "";
  await crmUpdate(async (db) => {
    const lead = db.leads.find((x) => x.id === id);
    if (!lead) {
      exit.status = 404;
      exit.json = { error: "not_found", message: "Сделка не найдена." };
      return;
    }
    normalizeLeadCrm(lead);
    const uid = lead.crm?.accountUserId;
    if (uid == null) {
      exit.status = 400;
      exit.json = {
        error: "no_account_link",
        message: "У заявки нет привязки к аккаунту клиента (оформите заявку с сайта, будучи авторизованы).",
      };
      return;
    }
    const user = db.users.find((u) => u.id === uid);
    if (!user) {
      exit.status = 400;
      exit.json = { error: "user_not_found", message: "Пользователь не найден." };
      return;
    }
    ensureUserProfile(user);
    if (!Array.isArray(user.profile.siteInbox)) user.profile.siteInbox = [];
    const mgr = db.users.find((x) => x.id === req.user.sub);
    const managerName = mgr?.name || req.user.name || req.user.email || "Менеджер";
    const msgId = randomUUID();
    const topic = String(lead.topic || `Заявка #${id}`).slice(0, 200);
    const row = {
      id: msgId,
      leadId: id,
      topic,
      body: message.slice(0, 5000),
      fromManagerName: managerName,
      createdAt: new Date().toISOString(),
      read: false,
    };
    user.profile.siteInbox.unshift(row);
    lead.crm.clientMessages = Array.isArray(lead.crm.clientMessages) ? lead.crm.clientMessages : [];
    lead.crm.clientMessages.unshift({ ...row, direction: "to_client" });
    lead.crm.interactions = Array.isArray(lead.crm.interactions) ? lead.crm.interactions : [];
    lead.crm.interactions.unshift({
      id: randomUUID(),
      channel: "site",
      direction: "outbound",
      message: `В личный кабинет: ${message.slice(0, 500)}`,
      createdAt: new Date().toISOString(),
      authorId: req.user.sub,
    });
    lead.updatedAt = new Date().toISOString();
    clientEmail = user.email;
    clientName = user.name || "";
    mailTopic = topic;
    mailManager = managerName;
  });
  if (exit.status) return res.status(exit.status).json(exit.json);
  if (isTransactionalMailConfigured() && clientEmail) {
    void sendSiteInboxMessageMail({
      toEmail: clientEmail,
      customerName: clientName,
      leadId: id,
      topic: mailTopic,
      body: message,
      managerName: mailManager,
    }).catch((err) => console.error("[mail] site inbox notify failed:", err?.message || err));
  }
  res.status(201).json({ ok: true, message: "Сообщение доставлено в личный кабинет." });
});

app.get("/api/integrations/gmail/oauth-url", authMiddleware, permissionMiddleware("leads.view"), async (req, res) => {
  const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/gmail/callback`;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "set-google-oauth-client-id";
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly");
  const state = Buffer.from(
    JSON.stringify({
      uid: req.user.sub,
      t: Date.now(),
    })
  ).toString("base64url");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${encodeURIComponent(state)}`;
  res.json({ url, redirectUri });
});

app.get("/api/integrations/gmail/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const stateRaw = String(req.query.state || "");
  let parsedState = {};
  try {
    parsedState = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    parsedState = {};
  }
  await crmUpdate(async (db) => {
    appendCrmModuleRecord(
      db,
      "integrations",
      {
        title: "gmail-oauth",
        value: code ? "authorization_code_received" : "authorization_failed",
        meta: `uid=${parsedState.uid || "unknown"}; ts=${new Date().toISOString()}`,
      },
      parsedState.uid || null
    );
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send("<!doctype html><html><body><p>Gmail OAuth callback получен. Можете закрыть окно и вернуться в CRM.</p></body></html>");
});

app.post("/api/integrations/binotel/webhook", async (req, res) => {
  const payload = req.body || {};
  await crmUpdate(async (db) => {
    appendCrmModuleRecord(db, "integrations", {
      title: "binotel-webhook",
      value: String(payload.callId || payload.id || `call-${Date.now()}`),
      meta: JSON.stringify({
        clientPhone: payload.clientPhone || payload.phone || "",
        manager: payload.manager || "",
        result: payload.result || payload.status || "",
      }),
    });
    const phone = normalizePhoneForDedup(payload.clientPhone || payload.phone || "");
    if (!phone) return;
    const lead = (db.leads || []).find((l) => normalizePhoneForDedup(l.phone || "") === phone);
    if (!lead) return;
    normalizeLeadCrm(lead);
    lead.crm.interactions.unshift({
      id: randomUUID(),
      channel: "phone",
      direction: "inbound",
      message: String(payload.result || payload.status || "binotel call").slice(0, 3000),
      recordingUrl: String(payload.recordingUrl || payload.record || "").trim().slice(0, 1200) || null,
      createdAt: new Date().toISOString(),
      authorId: null,
    });
    lead.updatedAt = new Date().toISOString();
  });
  res.json({ ok: true });
});

app.get("/api/site/product-overrides", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  const { productOverrides, heroSlides, heroSlideshowSettings, productsBannerSlides } = readSiteContent();
  res.json({
    productOverrides,
    heroSlides,
    heroSlideshowSettings,
    productsBannerSlides,
    siteContentRevision: siteContentMtimeMs(),
  });
});

app.get("/api/site/hero-slides", (_req, res) => {
  const { heroSlides } = readSiteContent();
  res.json({ heroSlides });
});

app.get("/api/site/delivery-copy", (_req, res) => {
  const { deliveryUkraine } = readSiteContent();
  res.json({ deliveryUkraine });
});

app.get("/api/site/products", (_req, res) => {
  res.json({ products: readProductsCatalog() });
});

app.post("/api/ai/catalog-search", aiCatalogSearchLimiter, async (req, res) => {
  const query = String(req.body?.query || "").trim();
  const strictAi = Boolean(req.body?.strictAi);
  if (!query || query.length < 3) {
    return res.status(400).json({ error: "invalid_query", message: "Введите запрос минимум из 3 символов." });
  }
  const products = readProductsCatalog();
  const aiResult = await aiParseIntentWithGemini(query);
  const aiIntent = aiResult?.intent || null;
  if (strictAi && !aiIntent) {
    return res.status(503).json({
      error: "ai_unavailable",
      message:
        String(aiResult?.error || "").trim() ||
        "ИИ-подбор временно недоступен. Проверьте GEMINI_API_KEY и подключение к сети.",
    });
  }
  const intent = aiIntent || aiHeuristicIntent(query);
  const scored = aiScoreCatalogProducts(products, intent);
  const productIds = scored.map((x) => String(x.product?.id || "")).filter(Boolean);
  const rows = scored.map((x) => ({
    id: x.product?.id ?? "",
    family: x.product?.family ?? "",
    code: x.product?.code ?? "",
    name: x.product?.name ?? "",
    score: x.score,
  }));
  return res.json({
    ok: true,
    provider: aiIntent ? "google-gemini" : "local-fallback",
    intent,
    productIds,
    products: rows,
    message: rows.length
      ? `Найдено ${rows.length} подходящих позиций.`
      : "Подходящие позиции не найдены. Уточните запрос (поверхность, назначение, условия эксплуатации).",
  });
});

/** Админка не должна получать устаревший site-content / каталог из кэша браузера (иначе фото «не меняется» после публикации). */
app.use("/api/admin", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});

/**
 * Защищённая выдача админских клиентских скриптов.
 * Скрипты не должны быть доступны анонимно через обычный static.
 */
app.get("/api/admin/runtime-script/:name", authMiddleware, roleMiddleware(["admin"]), adminRuntimeLimiter, (req, res) => {
  const name = String(req.params.name || "").trim();
  const allowlist = new Set(["admin-panel.js", "admin-product-cards.js", "crm.js", "crm-sales.js"]);
  if (!allowlist.has(name)) {
    return res.status(404).json({ error: "not_found", message: "Скрипт не найден." });
  }
  const abs = path.join(__dirname, name);
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: "not_found", message: "Скрипт отсутствует на сервере." });
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.type("application/javascript; charset=utf-8");
  return res.sendFile(abs);
});

/** Прямой static-доступ к чувствительным админским рантаймам запрещён. */
app.get(["/admin-panel.js", "/admin-product-cards.js", "/crm-sales.js"], (_req, res) => {
  res.status(404).send("Not found");
});

app.get("/api/admin/products-catalog", authMiddleware, permissionMiddleware("catalog.view"), (_req, res) => {
  res.json({ products: readProductsCatalog() });
});

app.put("/api/admin/products-catalog", authMiddleware, permissionMiddleware("catalog.edit"), (req, res) => {
  const parsed = sanitizeProductsCatalogArray(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, message: parsed.message });
  }
  const backup = createProductsCatalogBackup("before-save");
  writeProductsCatalog(parsed.products);
  res.json({ ok: true, count: parsed.products.length, backup });
});

app.get("/api/admin/products-catalog/backups", authMiddleware, permissionMiddleware("catalog.restore"), (_req, res) => {
  res.json({ backups: listProductsCatalogBackups() });
});

app.post("/api/admin/products-catalog/restore", authMiddleware, permissionMiddleware("catalog.restore"), (req, res) => {
  const backup = readProductsCatalogBackup(req.body?.id);
  if (!backup) {
    return res.status(404).json({ error: "backup_not_found", message: "Резервная копия каталога не найдена." });
  }
  const parsed = sanitizeProductsCatalogArray({ products: backup.products });
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, message: parsed.message });
  }
  const currentBackup = createProductsCatalogBackup("before-restore");
  writeProductsCatalog(parsed.products);
  res.json({
    ok: true,
    count: parsed.products.length,
    restoredFrom: { id: backup.id, createdAt: backup.createdAt },
    backup: currentBackup,
  });
});

app.post("/api/analytics/collect", analyticsCollectLimiter, (req, res) => {
  const b = req.body || {};
  const pathKey = String(b.path || "").trim().slice(0, 600);
  if (!pathKey) {
    return res.status(400).json({ error: "path_required", message: "Укажите path." });
  }
  const ev = {
    t: new Date().toISOString(),
    path: pathKey,
    referrer: String(b.referrer || "").trim().slice(0, 600),
    title: String(b.title || "").trim().slice(0, 400),
    visitorId: String(b.visitorId || "").trim().slice(0, 100) || "unknown",
    type: "pageview",
  };
  if (typeof b.event === "string" && b.event.trim()) {
    ev.event = b.event.trim().slice(0, 160);
  }
  appendAnalyticsEvent(ev);
  res.json({ ok: true });
});

app.get("/api/admin/site-content", authMiddleware, permissionMiddleware("siteContent.edit"), (_req, res) => {
  res.json(readSiteContent());
});

app.patch("/api/admin/site-content", authMiddleware, permissionMiddleware("siteContent.edit"), (req, res) => {
  const body = req.body || {};
  const incoming = body.productOverrides;
  const heroSlidesPatch = body.heroSlides;
  const heroSlideshowSettingsPatch = body.heroSlideshowSettings;
  const productsBannerSlidesPatch = body.productsBannerSlides;
  const deliveryPatch = body.deliveryUkraine;
  const hasPo = incoming != null && typeof incoming === "object";
  const hasHeroSlides = Array.isArray(heroSlidesPatch);
  const hasHeroSlideshowSettings =
    heroSlideshowSettingsPatch != null && typeof heroSlideshowSettingsPatch === "object";
  const hasProductsBannerSlides = Array.isArray(productsBannerSlidesPatch);
  const hasDelivery = deliveryPatch != null && typeof deliveryPatch === "object";
  if (
    !hasPo &&
    !hasHeroSlides &&
    !hasHeroSlideshowSettings &&
    !hasProductsBannerSlides &&
    !hasDelivery
  ) {
    return res.status(400).json({
      error: "invalid_payload",
      message:
        "Ожидается productOverrides, heroSlides, heroSlideshowSettings, productsBannerSlides и/или deliveryUkraine.",
    });
  }
  const content = readSiteContent();
  if (hasPo) {
    for (const [pid, raw] of Object.entries(incoming)) {
      const id = String(pid || "").trim();
      if (!id || id.length > 120) continue;
      if (!raw || typeof raw !== "object") continue;
      const sanitized = sanitizeProductOverride(raw);
      if (!content.productOverrides[id]) content.productOverrides[id] = {};
      applySanitizedProductOverridePatch(content.productOverrides[id], sanitized);
    }
  }
  if (hasHeroSlides) {
    content.heroSlides = normalizeHeroSlides(heroSlidesPatch);
  }
  if (hasHeroSlideshowSettings) {
    content.heroSlideshowSettings = normalizeHeroSlideshowSettings(heroSlideshowSettingsPatch);
  }
  if (hasProductsBannerSlides) {
    content.productsBannerSlides = normalizeHeroSlides(productsBannerSlidesPatch);
  }
  if (hasDelivery) {
    content.deliveryUkraine = normalizeDeliveryUkraine(deliveryPatch);
  }
  writeSiteContent(content);
  res.json({
    ok: true,
    productOverrides: content.productOverrides,
    heroSlides: content.heroSlides,
    heroSlideshowSettings: content.heroSlideshowSettings,
    productsBannerSlides: content.productsBannerSlides,
    deliveryUkraine: content.deliveryUkraine,
  });
});

/** Декодированное изображение карточки товара (JPEG/PNG/WebP). */
const MAX_ADMIN_PRODUCT_IMAGE_BYTES = Math.floor(2.3 * 1024 * 1024);

function parseAdminImageBase64(body) {
  const raw = String((body || {}).imageBase64 || "").trim();
  const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) {
    return {
      error: "invalid_image",
      message: "Ожидается data:image/png, jpeg или webp;base64,…",
    };
  }
  const ext = m[1].toLowerCase() === "jpeg" || m[1].toLowerCase() === "jpg" ? "jpg" : m[1].toLowerCase();
  let buf;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return { error: "invalid_base64", message: "Не удалось разобрать изображение." };
  }
  if (buf.length > MAX_ADMIN_PRODUCT_IMAGE_BYTES) {
    return { error: "too_large", message: "Файл больше 2,3 МБ." };
  }
  return { buf, ext };
}

function applyProductImageBuffer(productId, buf, ext) {
  ensureUploadDirs();
  const id = String(productId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return null;
  const fname = `${id}.${ext}`;
  const fpath = path.join(PRODUCT_IMAGES_DIR, fname);
  for (const e of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(PRODUCT_IMAGES_DIR, `${id}.${e}`);
    if (fs.existsSync(p) && p !== fpath) fs.unlinkSync(p);
  }
  fs.writeFileSync(fpath, buf);
  /* Уникальный query — в JSON меняется путь, сайт и админка не показывают закэшированное старое изображение с тем же URL. */
  return `/uploads/products/${fname}?_=${Date.now()}`;
}

function catalogPackSlugForKey(key) {
  return String(key || "")
    // Для имени файла исключаем ":" — на части окружений это ломает статическую раздачу.
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Фото для конкретной фасовки: `{productId}__{slug}.{ext}` — не затрагивает общее `{productId}.{ext}`. */
function applyProductPackImageBuffer(productId, packKey, buf, ext) {
  ensureUploadDirs();
  const id = String(productId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const slug = catalogPackSlugForKey(packKey);
  if (!id || !slug) return null;
  const base = `${id}__${slug}`;
  const fname = `${base}.${ext}`;
  const fpath = path.join(PRODUCT_IMAGES_DIR, fname);
  for (const e of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(PRODUCT_IMAGES_DIR, `${base}.${e}`);
    if (fs.existsSync(p) && p !== fpath) fs.unlinkSync(p);
  }
  fs.writeFileSync(fpath, buf);
  return `/uploads/products/${fname}?_=${Date.now()}`;
}

function unlinkProductPackImageFilesByBase(baseNoExt) {
  if (!baseNoExt) return;
  for (const e of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(PRODUCT_IMAGES_DIR, `${baseNoExt}.${e}`);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

function productImageBaseFromUrl(urlRaw) {
  const url = String(urlRaw || "").trim();
  const pathOnly = url.split("?")[0];
  const m = pathOnly.match(/^\/uploads\/products\/([a-zA-Z0-9_.-]+)\.(png|jpg|jpeg|webp)$/i);
  return m && m[1] ? m[1] : "";
}

function sameProductImageAsset(a, b) {
  const pa = String(a || "").trim().split("?")[0];
  const pb = String(b || "").trim().split("?")[0];
  return Boolean(pa && pb && pa === pb);
}

app.post("/api/admin/products/:id/image", authMiddleware, permissionMiddleware("siteContent.edit"), (req, res) => {
  const parsed = parseAdminImageBase64(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, message: parsed.message || parsed.error });
  }
  const pid = String(req.params.id || "").trim();
  if (!pid || pid.length > 120) {
    return res.status(400).json({ error: "invalid_id", message: "Некорректный id товара." });
  }
  const content = readSiteContent();
  if (!content.productOverrides[pid] || typeof content.productOverrides[pid] !== "object") {
    content.productOverrides[pid] = {};
  }
  const ov = content.productOverrides[pid];
  const packRaw = req.body && req.body.catalogPackKey;
  const hasPackKey = packRaw !== undefined && packRaw !== null && String(packRaw).trim() !== "";
  let relUrl;
  let catalogPackKey = null;
  if (hasPackKey) {
    const k = sanitizeCatalogPackImageKey(packRaw);
    if (!k) {
      return res.status(400).json({ error: "invalid_catalog_pack_key", message: "Некорректный ключ фасовки." });
    }
    relUrl = applyProductPackImageBuffer(pid, k, parsed.buf, parsed.ext);
    if (!relUrl) {
      return res.status(400).json({ error: "invalid_catalog_pack_key", message: "Некорректный ключ фасовки." });
    }
    const next = { ...(ov.catalogPackImages || {}) };
    next[k] = relUrl;
    ov.catalogPackImages = sanitizeCatalogPackImages(next);
    const packUrls = Object.values(ov.catalogPackImages || {}).map((x) => String(x || "").trim());
    const cardUrl = String(ov.cardImageUrl || "").trim();
    const heroUrl = String(ov.heroImageUrl || "").trim();
    if (cardUrl && packUrls.some((u) => sameProductImageAsset(u, cardUrl))) delete ov.cardImageUrl;
    if (heroUrl && packUrls.some((u) => sameProductImageAsset(u, heroUrl))) delete ov.heroImageUrl;
    catalogPackKey = k;
  } else {
    relUrl = applyProductImageBuffer(pid, parsed.buf, parsed.ext);
    if (!relUrl) {
      return res.status(400).json({ error: "invalid_id", message: "Некорректный id товара." });
    }
    ov.cardImageUrl = relUrl;
    if (!String(ov.heroImageUrl || "").trim()) ov.heroImageUrl = relUrl;
  }
  writeSiteContent(content);
  return res.json({
    ok: true,
    productId: pid,
    catalogPackKey,
    imageUrl: relUrl,
    override: ov,
  });
});

app.delete("/api/admin/products/:id/image", authMiddleware, permissionMiddleware("siteContent.edit"), (req, res) => {
  const pid = String(req.params.id || "").trim();
  if (!pid || pid.length > 120) {
    return res.status(400).json({ error: "invalid_id", message: "Некорректный id товара." });
  }
  const content = readSiteContent();
  const ov = content.productOverrides[pid];
  if (!ov || typeof ov !== "object") {
    return res.json({ ok: true, productId: pid, removed: false });
  }
  const packRaw = req.query && req.query.catalogPackKey;
  const hasPackKey = packRaw !== undefined && packRaw !== null && String(packRaw).trim() !== "";
  if (hasPackKey) {
    const k = sanitizeCatalogPackImageKey(packRaw);
    if (!k) {
      return res.status(400).json({ error: "invalid_catalog_pack_key", message: "Некорректный ключ фасовки." });
    }
    const map = ov.catalogPackImages && typeof ov.catalogPackImages === "object" ? { ...ov.catalogPackImages } : {};
    const prevUrl = map[k];
    delete map[k];
    if (Object.keys(map).length) ov.catalogPackImages = sanitizeCatalogPackImages(map);
    else delete ov.catalogPackImages;
    const base = productImageBaseFromUrl(prevUrl);
    if (base) unlinkProductPackImageFilesByBase(base);
    writeSiteContent(content);
    return res.json({ ok: true, productId: pid, catalogPackKey: k, removed: Boolean(prevUrl), override: ov });
  }
  const baseCard = productImageBaseFromUrl(ov.cardImageUrl);
  const baseHero = productImageBaseFromUrl(ov.heroImageUrl);
  delete ov.cardImageUrl;
  delete ov.heroImageUrl;
  if (baseCard) unlinkProductPackImageFilesByBase(baseCard);
  if (baseHero && baseHero !== baseCard) unlinkProductPackImageFilesByBase(baseHero);
  writeSiteContent(content);
  return res.json({ ok: true, productId: pid, removed: Boolean(baseCard || baseHero), override: ov });
});

function applyHeroSlideImageBuffer(slideId, buf, ext) {
  ensureUploadDirs();
  const id = String(slideId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  if (!id) return null;
  const fname = `${id}.${ext}`;
  const fpath = path.join(HERO_SLIDES_DIR, fname);
  for (const e of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(HERO_SLIDES_DIR, `${id}.${e}`);
    if (fs.existsSync(p) && p !== fpath) fs.unlinkSync(p);
  }
  fs.writeFileSync(fpath, buf);
  return `/uploads/hero-slides/${fname}`;
}

function applyProductsBannerImageBuffer(slideId, buf, ext) {
  ensureUploadDirs();
  const id = String(slideId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  if (!id) return null;
  const fname = `${id}.${ext}`;
  const fpath = path.join(PRODUCTS_BANNER_DIR, fname);
  for (const e of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(PRODUCTS_BANNER_DIR, `${id}.${e}`);
    if (fs.existsSync(p) && p !== fpath) fs.unlinkSync(p);
  }
  fs.writeFileSync(fpath, buf);
  return `/uploads/products-banner/${fname}`;
}

app.post("/api/admin/hero-slides/image", authMiddleware, permissionMiddleware("media.edit"), (req, res) => {
  const parsed = parseAdminImageBase64(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, message: parsed.message || parsed.error });
  }
  const rawId = String((req.body || {}).id || "").trim();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || randomUUID().replace(/-/g, "").slice(0, 16);
  const rel = applyHeroSlideImageBuffer(safeId, parsed.buf, parsed.ext);
  if (!rel) return res.status(400).json({ error: "invalid_id", message: "Некорректный id слайда." });
  res.json({ ok: true, id: safeId, url: rel });
});

app.post("/api/admin/products-banner/image", authMiddleware, permissionMiddleware("media.edit"), (req, res) => {
  const parsed = parseAdminImageBase64(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, message: parsed.message || parsed.error });
  }
  const rawId = String((req.body || {}).id || "").trim();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || randomUUID().replace(/-/g, "").slice(0, 16);
  const rel = applyProductsBannerImageBuffer(safeId, parsed.buf, parsed.ext);
  if (!rel) return res.status(400).json({ error: "invalid_id", message: "Некорректный id слайда баннера." });
  res.json({ ok: true, id: safeId, url: rel });
});

app.get("/api/admin/dashboard", authMiddleware, permissionMiddleware("analytics.view"), async (_req, res) => {
  const db = await crmSnapshot();
  const weekAgo = Date.now() - 7 * 86400000;
  const leadsLast7Days = db.leads.filter((l) => {
    const t = new Date(l.createdAt).getTime();
    return Number.isFinite(t) && t >= weekAgo;
  }).length;
  const agg = aggregateAnalytics(7);
  res.json({
    leadsLast7Days,
    usersTotal: db.users.length,
    leadsTotal: db.leads.length,
    pageviewsLast7Days: agg.totalPageviews,
    topPaths: agg.topPaths.slice(0, 8),
  });
});

app.get("/api/admin/analytics/summary", authMiddleware, permissionMiddleware("analytics.view"), (req, res) => {
  const days = Number(req.query.days);
  res.json(aggregateAnalytics(Number.isFinite(days) ? days : 14));
});

ensureUploadDirs();
app.use(
  "/uploads",
  express.static(UPLOADS_ROOT, {
    setHeaders(res) {
      /* Разрешаем встраивание картинок /uploads в админку даже при отличающемся origin (file://, другой порт/домен). */
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.get("/robots.txt", (req, res) => {
  const host = req.get("host") || "";
  const proto = req.protocol || "https";
  const sitemapUrl = host ? `${proto}://${host}/sitemap.xml` : "/sitemap.xml";
  res.type("text/plain; charset=utf-8");
  res.send(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const host = req.get("host") || "";
  const proto = req.protocol || "https";
  const base = host ? `${proto}://${host}` : "";
  const pages = [
    { url: "/", file: "index.html", changefreq: "daily", priority: "1.0" },
    { url: "/index.html", file: "index.html", changefreq: "daily", priority: "0.9" },
    { url: "/products.html", file: "products.html", changefreq: "daily", priority: "0.9" },
    { url: "/product.html", file: "product.html", changefreq: "daily", priority: "0.8" },
    { url: "/price.html", file: "price.html", changefreq: "daily", priority: "0.8" },
    { url: "/delivery.html", file: "delivery.html", changefreq: "weekly", priority: "0.7" },
    { url: "/contact.html", file: "contact.html", changefreq: "weekly", priority: "0.7" },
    { url: "/about.html", file: "about.html", changefreq: "monthly", priority: "0.5" },
    { url: "/offer.html", file: "offer.html", changefreq: "monthly", priority: "0.4" },
    { url: "/payment.html", file: "payment.html", changefreq: "weekly", priority: "0.6" },
    { url: "/checkout.html", file: "checkout.html", changefreq: "weekly", priority: "0.5" },
    { url: "/news.html", file: "news.html", changefreq: "daily", priority: "0.7" },
    { url: "/advice.html", file: "advice.html", changefreq: "weekly", priority: "0.6" },
    { url: "/ral.html", file: "ral.html", changefreq: "monthly", priority: "0.6" },
    { url: "/auth.html", file: "auth.html", changefreq: "monthly", priority: "0.4" },
    { url: "/account.html", file: "account.html", changefreq: "weekly", priority: "0.4" },
    { url: "/account-payment.html", file: "account-payment.html", changefreq: "weekly", priority: "0.4" },
    { url: "/intelligent-selection.html", file: "intelligent-selection.html", changefreq: "weekly", priority: "0.6" },
    { url: "/privacy-policy.html", file: "privacy-policy.html", changefreq: "yearly", priority: "0.3" },
  ];

  function isoDateByFile(fileName) {
    try {
      const st = fs.statSync(path.join(__dirname, fileName));
      return new Date(st.mtimeMs).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  const rows = pages
    .map((p) => {
      const loc = `${base}${p.url}`;
      const lastmod = isoDateByFile(p.file);
      return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`;
    })
    .join("");
  res.type("application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`);
});

app.use(express.static(__dirname));

(async () => {
  await initCrmBackend({ dbPath: DB_PATH, normalizeDb: normalizeCrmDatabase });
  if (!isProd) {
    await seedDefaultAdmin();
    await seedDemoRoleUsers();
  } else {
    console.log(
      "[security] Production: сиды демо-пользователей и тестового админа отключены. Первый зарегистрированный пользователь получит роль admin."
    );
  }
  const MAX_DEV_PORT_RETRIES = 20;
  function startServer(preferredPort, attempt = 0) {
    const port = Number(preferredPort) || 3000;
    const server = app
      .listen(port, () => {
        const mode = isProd ? "production" : "development";
        console.log(`DP Coatings API (${mode}) on http://localhost:${port}`);
        if (isTransactionalMailConfigured()) {
          console.log("[mail] Transactional SMTP enabled (Gmail: set SMTP_USER + SMTP_PASS in .env).");
        } else {
          console.log("[mail] Transactional mail disabled — add SMTP_USER, SMTP_PASS to .env (App Password) to enable.");
        }
      })
      .on("error", (err) => {
        if (err && err.code === "EADDRINUSE") {
          if (isProd) {
            console.error(`[server] Port ${port} is already in use in production. Set a valid PORT in environment.`);
            process.exit(1);
          }
          if (attempt >= MAX_DEV_PORT_RETRIES) {
            console.error(`[server] Failed to find a free port after ${MAX_DEV_PORT_RETRIES + 1} attempts.`);
            process.exit(1);
          }
          const nextPort = port + 1;
          console.warn(`[server] Port ${port} is busy, retrying on ${nextPort}...`);
          startServer(nextPort, attempt + 1);
          return;
        }
        throw err;
      });
    return server;
  }
  startServer(PORT);
})();
