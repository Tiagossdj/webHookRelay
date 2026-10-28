import type { Request, Response } from "express";
import { WebhookService } from "../webhook/webhook.service.js";
import type { CreateWebhookBody } from "../webhook/webhook.schema.js";

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
    if (result.conflict) {
      return res
        .status(409)
        .json({
          error: "Idempotency-Key already used with a different request body",
        });
    }

    if (result.created) {
      return res.status(201).json(result.webhook);
    } else {
      return res.status(200).json(result.webhook);
    }
  }
}
