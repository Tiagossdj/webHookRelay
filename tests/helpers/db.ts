import { sql } from "drizzle-orm";
import { client, db } from "../../src/db/index.js";
import { connection, webhookQueue } from "../../src/webhook/webhook.queue.js";

/** Apaga todas as linhas e zera os ids, além dos jobs da fila (Redis db de teste). */
export async function resetState() {
  await db.execute(
    sql`TRUNCATE TABLE delivery_attempts, webhooks RESTART IDENTITY CASCADE`,
  );
  await connection.flushdb();
}

/** Fecha Postgres e Redis para o processo de teste terminar sem handles abertos. */
export async function closeConnections() {
  await webhookQueue.close();
  await connection.quit();
  await client.end();
}
