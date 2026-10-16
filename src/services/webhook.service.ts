import { WebhookRepository } from "../repository/webhook.repository.js";

interface CreateWebhookInput {
  url: string;
  payload: unknown;
  idempotencyKey: string;
}

export class WebhookService {
  static async create(input: CreateWebhookInput) {
    const existing = await WebhookRepository.findByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing) {
      return { webhook: existing, created: false };
    }

    const newWebhook = await WebhookRepository.create(input);

    return { webhook: newWebhook, created: true };
  }
}
