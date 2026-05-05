import test from "node:test";
import assert from "node:assert/strict";
import { liqpayDecodeData, liqpayEncodeData, liqpaySign, liqpayVerify } from "../lib/liqpay.js";

test("liqpay encode/decode keeps payload intact", () => {
  const payload = {
    amount: "1499.99",
    currency: "UAH",
    description: "Order #A-1001",
    order_id: "A-1001",
  };

  const encoded = liqpayEncodeData(payload);
  const decoded = liqpayDecodeData(encoded);

  assert.deepEqual(decoded, payload);
});

test("liqpay signature validation succeeds for valid signature", () => {
  const privateKey = "test-private-key";
  const data = liqpayEncodeData({ order_id: "A-1002", status: "success" });
  const signature = liqpaySign(privateKey, data);

  assert.equal(liqpayVerify(privateKey, data, signature), true);
});

test("liqpay signature validation fails for tampered signature", () => {
  const privateKey = "test-private-key";
  const data = liqpayEncodeData({ order_id: "A-1003", status: "success" });
  const signature = liqpaySign(privateKey, data);

  assert.equal(liqpayVerify(privateKey, data, `${signature}tamper`), false);
});
