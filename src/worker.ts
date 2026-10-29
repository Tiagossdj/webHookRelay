import { Worker } from "bullmq";
import { connection, webhookQueue } from "./webhook/webhook.queue.js";
import { client } from "./db/index.js";
import { WebhookService } from "./webhook/webhook.service.js";

interface WebhookJobData {
  webhookId: number;
}

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
