import { timestamp, integer, pgEnum, pgTable, varchar, json, index } from "drizzle-orm/pg-core";

/** Ciclo de vida do webhook: `pending` → `delivered` ou `failed` (esgotou as tentativas). */
export const webhook_status = pgEnum("webhook_status", [
  "pending",
  "delivered",
  "failed",
]);

/** Resultado de uma tentativa individual de entrega. */
export const attemptStatus = pgEnum("attempt_status", ["failed", "success"]);

/** Webhooks recebidos. `idempotency_key` é unique: base da idempotência e da proteção contra corrida. */
export const webhooks = pgTable("webhooks", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  url_destiny: varchar({ length: 255 }).notNull(),
  payload: json().notNull(),
  idempotency_key: varchar({ length: 255 }).notNull().unique(),
  status: webhook_status().notNull().default('pending'),
  created_at: timestamp().defaultNow().notNull(),
});

/**
 * Histórico de tentativas de entrega (uma linha por tentativa).
 * `http_code` é `null` quando o destino não respondeu (erro de rede ou timeout).
 */
export const deliveryAttempts = pgTable("delivery_attempts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  webhook_id: integer().notNull().references(() => webhooks.id),
  attempt_number: integer().notNull(),
  status: attemptStatus().notNull(),
  http_code: integer(),
  attempted_at: timestamp().defaultNow().notNull(),
}, (table) => [
  // Postgres não cria índice automático para foreign keys
  index("delivery_attempts_webhook_id_idx").on(table.webhook_id),
]);
