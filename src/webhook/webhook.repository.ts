import { db } from "../db/index.js";
import { deliveryAttempts, webhooks } from "../db/schema.js";
import { asc, eq } from "drizzle-orm";

export type SavedWebhook = typeof webhooks.$inferSelect;

export class WebhookRepository {
  static async findByIdempotencyKey(key: string) {
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.idempotency_key, key))
      .limit(1);

    return result[0] ?? null;
  }

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

  static async findById(id: number) {
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, id))


    return result[0] ?? null
  }

  static async updateStatus(id: number, status: SavedWebhook['status'] ) {
    const result = await db
      .update(webhooks)
      .set({ status: status })
      .where(eq(webhooks.id, id))
      .returning();

    return result[0] ?? null;
  }

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

  static async findAttemptsByWebhookId(webhookId: number) {
    return db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.webhook_id, webhookId))
      .orderBy(asc(deliveryAttempts.attempt_number));
  }
}
