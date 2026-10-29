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

  it("rejects a multibyte signature with the same character count without throwing", () => {
    // Mesmo número de caracteres que uma assinatura real, mas "é" ocupa 2 bytes
    const multibyte = `sha256=${"é".repeat(64)}`;
    expect(multibyte.length).toBe(signPayload(body, timestamp, secret).length);

    expect(verifySignature(body, timestamp, multibyte, secret)).toBe(false);
  });

  it("accepts the raw timestamp header string", () => {
    const signature = signPayload(body, timestamp, secret);

    expect(verifySignature(body, String(timestamp), signature, secret)).toBe(true);
  });

  it("signs the timestamp text as received, so a reformatted value does not match", () => {
    const signature = signPayload(body, "1700000000.0", secret);

    expect(verifySignature(body, "1700000000.0", signature, secret)).toBe(true);
    expect(verifySignature(body, 1_700_000_000, signature, secret)).toBe(false);
  });
});
