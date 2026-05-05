/**
 * LiqPay — підпис data/signature (API v3).
 * @see https://www.liqpay.ua/documentation/api/aquiring/checkout/
 */
import crypto from "crypto";

export function liqpaySign(privateKey, dataBase64) {
  const s = String(privateKey || "") + String(dataBase64 || "") + String(privateKey || "");
  return crypto.createHash("sha1").update(s, "utf8").digest("base64");
}

export function liqpayVerify(privateKey, dataBase64, signature) {
  const expected = liqpaySign(privateKey, dataBase64);
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function liqpayEncodeData(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

export function liqpayDecodeData(dataBase64) {
  const raw = Buffer.from(String(dataBase64 || ""), "base64").toString("utf8");
  return JSON.parse(raw);
}
