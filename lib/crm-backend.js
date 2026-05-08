/**
 * CRM-состояние (users, leads, meta): файл crm-db.json или одна строка JSONB в PostgreSQL.
 * Один объект — проще дорабатывать HTML / админку / CRM без миграций схемы.
 */
import fs from "fs";
import path from "path";

const EMPTY_META = () => ({
  nextLeadId: 1,
  nextUserId: 1,
  assignCursor: 0,
});

function emptyState() {
  return {
    users: [],
    leads: [],
    meta: EMPTY_META(),
  };
}

let dbPath = "";
let normalizeDb = () => false;
let usePg = false;
let pool = null;

let chain = Promise.resolve();

function runExclusive(fn) {
  const out = chain.then(() => fn());
  chain = out.catch(() => {}).then(() => {});
  return out;
}

function ensureFileExists() {
  if (!dbPath) return;
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(emptyState(), null, 2), "utf-8");
  }
}

function readFileState() {
  ensureFileExists();
  const raw = fs.readFileSync(dbPath, "utf-8");
  const db = JSON.parse(raw);
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.leads)) db.leads = [];
  if (!db.meta || typeof db.meta !== "object") db.meta = EMPTY_META();
  return db;
}

function writeFileState(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function validateStateOrThrow(prevDb, nextDb) {
  const prevUsers = Array.isArray(prevDb?.users) ? prevDb.users : [];
  const nextUsers = Array.isArray(nextDb?.users) ? nextDb.users : [];
  const nextLeads = Array.isArray(nextDb?.leads) ? nextDb.leads : [];

  // Не допускаем "битое" сохранение, когда пользователи внезапно исчезли.
  if (prevUsers.length > 0 && nextUsers.length === 0) {
    throw new Error("crm_integrity_error: users_cleared");
  }

  // При наличии лидов с accountUserId должны оставаться пользователи.
  const hasLinkedLeads = nextLeads.some((l) => l?.crm && l.crm.accountUserId != null);
  if (hasLinkedLeads && nextUsers.length === 0) {
    throw new Error("crm_integrity_error: linked_users_missing");
  }

  const emailSet = new Set();
  let maxUserId = 0;
  for (const u of nextUsers) {
    const idNum = Number(u?.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      throw new Error("crm_integrity_error: invalid_user_id");
    }
    maxUserId = Math.max(maxUserId, idNum);
    const email = normalizeEmail(u?.email);
    if (!email || !email.includes("@")) {
      throw new Error("crm_integrity_error: invalid_user_email");
    }
    if (!u?.passwordHash || typeof u.passwordHash !== "string") {
      throw new Error("crm_integrity_error: missing_password_hash");
    }
    if (emailSet.has(email)) {
      throw new Error("crm_integrity_error: duplicate_user_email");
    }
    emailSet.add(email);
  }

  if (!nextDb.meta || typeof nextDb.meta !== "object") {
    nextDb.meta = EMPTY_META();
  }
  const nextUserId = Number(nextDb.meta.nextUserId || 1);
  if (!Number.isFinite(nextUserId) || nextUserId < maxUserId + 1) {
    nextDb.meta.nextUserId = maxUserId + 1;
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS crm_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO crm_state (id, data)
VALUES (1, '{"users":[],"leads":[],"meta":{"nextLeadId":1,"nextUserId":1,"assignCursor":0}}'::jsonb)
ON CONFLICT (id) DO NOTHING;
`;

function parsePgRowData(data) {
  if (data == null) return emptyState();
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return emptyState();
    }
  }
  return typeof data === "object" ? data : emptyState();
}

function coerceStateShape(db) {
  const o = db && typeof db === "object" ? db : emptyState();
  if (!Array.isArray(o.users)) o.users = [];
  if (!Array.isArray(o.leads)) o.leads = [];
  if (!o.meta || typeof o.meta !== "object") o.meta = EMPTY_META();
  return o;
}

/**
 * @param {{ dbPath: string, normalizeDb: (db: object) => boolean }} opts
 */
export async function initCrmBackend(opts) {
  dbPath = opts.dbPath || "";
  normalizeDb = typeof opts.normalizeDb === "function" ? opts.normalizeDb : () => false;
  const url = String(process.env.DATABASE_URL || "").trim();
  usePg = Boolean(url);

  if (!usePg) {
    ensureFileExists();
    console.log("[crm] Хранилище: файл", dbPath);
    return;
  }

  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: url,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl:
      process.env.PGSSLMODE === "require" || String(process.env.DATABASE_URL || "").includes("sslmode=require")
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "0" }
        : undefined,
  });
  const c = await pool.connect();
  try {
    await c.query(SCHEMA_SQL);
  } finally {
    c.release();
  }
  console.log("[crm] Хранилище: PostgreSQL (таблица crm_state)");
}

/** Снимок для чтения (клон); при нормализации может сохранить файл/БД. */
export function crmSnapshot() {
  return runExclusive(async () => {
    if (!usePg) {
      const db = readFileState();
      const changed = normalizeDb(db);
      if (changed) writeFileState(db);
      return structuredClone(db);
    }
    const { rows } = await pool.query("SELECT data FROM crm_state WHERE id = 1");
    const db = coerceStateShape(parsePgRowData(rows[0]?.data));
    const changed = normalizeDb(db);
    if (changed) {
      await pool.query("UPDATE crm_state SET data = $1::jsonb, updated_at = now() WHERE id = 1", [
        JSON.stringify(db),
      ]);
    }
    return structuredClone(db);
  });
}

/** Атомарно: загрузить → нормализовать → mutator → сохранить. */
export function crmUpdate(mutator) {
  return runExclusive(async () => {
    if (!usePg) {
      const db = readFileState();
      const prevDb = structuredClone(db);
      normalizeDb(db);
      const maybe = mutator(db);
      if (maybe && typeof maybe.then === "function") await maybe;
      validateStateOrThrow(prevDb, db);
      writeFileState(db);
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT data FROM crm_state WHERE id = 1 FOR UPDATE");
      const db = coerceStateShape(parsePgRowData(rows[0]?.data));
      const prevDb = structuredClone(db);
      normalizeDb(db);
      const maybe = mutator(db);
      if (maybe && typeof maybe.then === "function") await maybe;
      validateStateOrThrow(prevDb, db);
      await client.query("UPDATE crm_state SET data = $1::jsonb, updated_at = now() WHERE id = 1", [
        JSON.stringify(db),
      ]);
      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  });
}

export function crmUsesPostgres() {
  return usePg;
}

export async function crmClosePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
