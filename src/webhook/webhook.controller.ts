import type { Request, Response } from "express";
import { WebhookService } from "../webhook/webhook.service.js";
import type { CreateWebhookBody } from "../webhook/webhook.schema.js";

/** Traduz HTTP ↔ service: lê a requisição já validada e escolhe o status da resposta. */
export class WebhookController {
  /**
   * `POST /webhooks`
   * @returns 201 criado · 200 replay idempotente (mesma key e body) · 409 key reutilizada com outro body
   */
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

  /**
   * `GET /webhooks/:id`
   * @returns 200 webhook + `attempts` · 404 se não existir
   */
  static async getById(req: Request<{ id: string }>, res: Response) {
    // validate já garantiu inteiro >= 1; o Express tipa params como string
    const webhook = await WebhookService.getById(Number(req.params.id));

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    return res.status(200).json(webhook);
  }
}
