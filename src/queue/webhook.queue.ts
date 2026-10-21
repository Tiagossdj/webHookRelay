import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { Redis } from "ioredis";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue("webhook-delivery", {
  connection,
});
