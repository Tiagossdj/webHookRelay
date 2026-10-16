import type { Request, Response } from "express";
import { WebhookService } from "../services/webhook.service.js";
import type { CreateWebhookBody } from "../schemas/webhook.schema.js";

export class WebhookController {
  static async create(
    req: Request<{}, unknown, CreateWebhookBody>,
    res: Response,
  ) {
    // Já validado pelo middleware validate
    const idempotencyKey = req.header("idempotency-key")!;
    const body = req.body;

    const result = await WebhookService.create({
      url: body.url,
      payload: body.payload,
      idempotencyKey,
    });

    if (result.created) {
      return res.status(201).json(result.webhook);
    } else {
      return res.status(200).json(result.webhook);
    }
  }
}
