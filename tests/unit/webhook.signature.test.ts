import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signPayload,
  verifySignature,
} from "../../src/webhook/webhook.signature.js";

const secret = "test-secret";
const body = JSON.stringify({ amount: 100 });
const timestamp = 1_700_000_000;

describe("webhook signature", () => {
  it("signs 'timestamp.body' with HMAC-SHA256 and sha256= prefix", () => {
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(signPayload(body, timestamp, secret)).toBe(`sha256=${expected}`);
  });

  it("accepts a signature made with the same secret, body and timestamp", () => {
    const signature = signPayload(body, timestamp, secret);

    expect(verifySignature(body, timestamp, signature, secret)).toBe(true);
  });

  it("rejects a different secret", () => {
    const signature = signPayload(body, timestamp, "other-secret");

    expect(verifySignature(body, timestamp, signature, secret)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = signPayload(body, timestamp, secret);
    const tampered = JSON.stringify({ amount: 999 });

    expect(verifySignature(tampered, timestamp, signature, secret)).toBe(false);
  });

  it("rejects a replayed signature with another timestamp", () => {
    const signature = signPayload(body, timestamp, secret);

    expect(verifySignature(body, timestamp + 1, signature, secret)).toBe(false);
  });

  it("rejects a signature with a different length without throwing", () => {
    expect(verifySignature(body, timestamp, "sha256=abc", secret)).toBe(false);
  });
});
