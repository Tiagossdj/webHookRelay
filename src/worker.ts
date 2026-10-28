import { Worker } from "bullmq";
import { connection } from "./webhook/webhook.queue.js";
import { WebhookService } from "./webhook/webhook.service.js";

interface WebhookJobData {
  webhookId: number;
}

const worker = new Worker<WebhookJobData>(
  "webhook-delivery",
  async (job) => {
    await WebhookService.deliver(job.data.webhookId, job.attemptsMade + 1);
  },
  { connection, autorun: false },
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

worker.run();
