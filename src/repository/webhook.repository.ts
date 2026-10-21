import { db } from "../db/index.js";
import { webhooks } from "../db/schema.js";
import { eq } from "drizzle-orm";

export class WebhookRepository {
  static async findByIdempotencyKey(key: string) {
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.idempotency_key, key))
      .limit(1);

    return result[0] ?? null;
  }

  static async  create(data: {url: string; payload: unknown; idempotencyKey: string}){
    const result = await db 
    .insert(webhooks)
    .values({
        url_destiny: data.url,
        payload: data.payload,
        idempotency_key: data.idempotencyKey,   
        status: 'pending',
    }) 
    .onConflictDoNothing({target: webhooks.idempotency_key}) 
    .returning()

    return result[0] ?? null
  }
}
