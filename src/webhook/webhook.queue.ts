import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { Redis } from "ioredis";

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue("webhook-delivery", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
  },
});
