import { timestamp, integer, pgEnum, pgTable, varchar, json } from "drizzle-orm/pg-core";

export const webhook_status = pgEnum("webhook_status", [
  "pending",
  "delivered",
  "failed",
]);

export const attemptStatus = pgEnum("attempt_status", ["failed", "success"]);

export const webhooks = pgTable("webhooks", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  url_destiny: varchar({ length: 255 }).notNull(),
  payload: json().notNull(),
  idempotency_key: varchar({ length: 255 }).notNull().unique(),
  status: webhook_status().notNull().default('pending'),
  created_at: timestamp().defaultNow().notNull(),
});

export const deliveryAttempts = pgTable("delivery_attempts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  webhook_id: integer().notNull().references(() => webhooks.id),
  attempt_number: integer().notNull(),
  status: attemptStatus().notNull(),
  http_code: integer(),
  attempted_at: timestamp().defaultNow().notNull(),
});
