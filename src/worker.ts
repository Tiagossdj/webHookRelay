import { Worker } from "bullmq";
import { connection, webhookQueue } from "./webhook/webhook.queue.js";
import { client } from "./db/index.js";
import { WebhookService } from "./webhook/webhook.service.js";

/** Formato de `job.data`: o que o service enfileira em `create`. */
interface WebhookJobData {
  webhookId: number;
}

/**
 * Worker de entregas (processo separado da API).
 * Para cada job chama `WebhookService.deliver`; se ela lançar erro,
 * o BullMQ agenda o retry conforme a política da fila.
 */
const worker = new Worker<WebhookJobData>(
  "webhook-delivery",
  async (job) => {
    await WebhookService.deliver(job.data.webhookId, job.attemptsMade + 1, job.opts.attempts ?? 1);
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(job.id, job.data.webhookId);
});

worker.on("failed", (job, err) => {
  console.log(job?.id, job?.data.webhookId, err.message);
});

worker.on("error", (err) => {
  console.log(err.message);
});

// Para de pegar jobs novos e espera os que estão em andamento terminarem,
// assim um deploy/restart não deixa job "stalled" no meio da entrega
async function shutdown(signal: string) {
  console.log(`${signal} received, closing worker...`);
  await worker.close();
  await webhookQueue.close();
  await connection.quit();
  await client.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
