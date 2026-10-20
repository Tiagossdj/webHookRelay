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

      if (input.url === existing.url_destiny) {
        if (
          JSON.stringify(input.payload) === JSON.stringify(existing.payload)
        ) {
          return { webhook: existing, created: false, conflict: false };
        }
      }

      return {
        webhook: existing,
        created: false,
        conflict: true,
      };
    }

    const newWebhook = await WebhookRepository.create(input);

    return { webhook: newWebhook, created: true, conflict: false};
  }
}
