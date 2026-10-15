import { Router } from "express";
import { WebhookController } from "../controllers/webhook.controller.js";
import { validate } from "../middlewares/validate.js";
import { createWebhookBody, createWebhookHeaders } from "../schemas/webhook.schema.js";

export const webhookRoutes = Router();

webhookRoutes.post(
  "/webhooks",
  validate({ body: createWebhookBody, headers: createWebhookHeaders }),
  WebhookController.create,
);
