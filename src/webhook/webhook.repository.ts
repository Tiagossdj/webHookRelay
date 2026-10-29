import { db } from "../db/index.js";
import { deliveryAttempts, webhooks } from "../db/schema.js";
import { asc, eq } from "drizzle-orm";

/** Linha da tabela `webhooks` como o Drizzle devolve num SELECT. */
export type SavedWebhook = typeof webhooks.$inferSelect;

/** Acesso ao Postgres via Drizzle: uma query por método, sem regra de negócio. */
export class WebhookRepository {
  /** @returns o webhook com essa Idempotency-Key ou `null`. */
  static async findByIdempotencyKey(key: string) {
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.idempotency_key, key))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Insere um webhook com status `pending`.
   * @returns a linha criada, ou `null` se a key já existia (ON CONFLICT DO NOTHING:
   * outra requisição venceu a corrida).
   */
  static async create(data: {
    url: string;
    payload: unknown;
    idempotencyKey: string;
  }) {
    const result = await db
      .insert(webhooks)
      .values({
        url_destiny: data.url,
        payload: data.payload,
        idempotency_key: data.idempotencyKey,
        status: "pending",
      })
      .onConflictDoNothing({ target: webhooks.idempotency_key })
      .returning();

    return result[0] ?? null;
  }

  /** @returns o webhook com esse id ou `null`. */
  static async findById(id: number) {
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, id))


    return result[0] ?? null
  }

  /**
   * Atualiza o status do webhook.
   * @returns a linha atualizada ou `null` se o id não existe.
   */
  static async updateStatus(id: number, status: SavedWebhook['status'] ) {
    const result = await db
      .update(webhooks)
      .set({ status: status })
      .where(eq(webhooks.id, id))
      .returning();

    return result[0] ?? null;
  }

  /** Registra uma tentativa de entrega (sucesso ou falha) no histórico. */
  static async createDeliveryAttempt(
    data: {
      webhook_id: number;
      attempt_number: number;
      status: "success" | "failed";
      http_code: number | null;
    },
  ) {

    const result = await db.insert(deliveryAttempts).values({
      webhook_id: data.webhook_id,
      attempt_number: data.attempt_number,
      status: data.status,
      http_code: data.http_code
    })
    .returning()

    return result[0] ?? null 
  }

  /** Lista as tentativas de um webhook em ordem de `attempt_number` (usa o índice em `webhook_id`). */
  static async findAttemptsByWebhookId(webhookId: number) {
    return db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.webhook_id, webhookId))
      .orderBy(asc(deliveryAttempts.attempt_number));
  }
}
