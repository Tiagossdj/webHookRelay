import { createHmac, timingSafeEqual } from "node:crypto";

// Assina "timestamp.body": o timestamp entra na assinatura para o destino
// conseguir rejeitar requisições antigas reenviadas (replay attack)
export function signPayload(body: string, timestamp: number, secret: string) {
  const hmac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return `sha256=${hmac}`;
}

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
