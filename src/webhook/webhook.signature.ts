import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Gera a assinatura HMAC-SHA256 enviada no header `X-Webhook-Signature`.
 * Assina `"timestamp.body"`: o timestamp entra na assinatura para o destino
 * conseguir rejeitar requisições antigas reenviadas (replay attack).
 * @returns `sha256=<hex>`
 */
export function signPayload(body: string, timestamp: number, secret: string) {
  const hmac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return `sha256=${hmac}`;
}

/**
 * Confere uma assinatura do lado de quem recebe o webhook.
 * Compara em tempo constante (`timingSafeEqual`) para não vazar informação pelo tempo de resposta.
 * @param body corpo bruto recebido (string exata, antes de qualquer JSON.parse).
 * @param timestamp valor do header `X-Webhook-Timestamp`.
 * @param signature valor do header `X-Webhook-Signature`.
 */
export function verifySignature(
  body: string,
  timestamp: number,
  signature: string,
  secret: string,
) {
  const expected = Buffer.from(signPayload(body, timestamp, secret));
  const received = Buffer.from(signature);

  // timingSafeEqual exige o mesmo tamanho; comparar com === vazaria o tempo
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
