import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  createWebhookBody,
  createWebhookHeaders,
  webhookIdParams,
} from "./webhook.schema.js";

export const webhookRoutes = Router();

webhookRoutes.post(
  "/webhooks",
  validate({ body: createWebhookBody, headers: createWebhookHeaders }),
  WebhookController.create,
);

webhookRoutes.get(
  "/webhooks/:id",
  validate({ params: webhookIdParams }),
  WebhookController.getById,
);
