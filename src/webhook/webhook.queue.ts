import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { Redis } from "ioredis";

/**
 * Conexão Redis compartilhada por fila e worker.
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ para workers.
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Fila de entregas. Cada job carrega só `{ webhookId }` (o Postgres é a fonte da verdade).
 * Política de retry: `DELIVERY_ATTEMPTS` tentativas com backoff exponencial
 * a partir de `DELIVERY_BACKOFF_MS` (padrão 5 tentativas: 1s, 2s, 4s, 8s).
 */
export const webhookQueue = new Queue("webhook-delivery", {
  connection,
  defaultJobOptions: {
    attempts: env.DELIVERY_ATTEMPTS,
    backoff: { type: "exponential", delay: env.DELIVERY_BACKOFF_MS },
  },
});
