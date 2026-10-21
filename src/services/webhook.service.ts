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

    if (!newWebhook) {
      const winner = await WebhookRepository.findByIdempotencyKey(input.idempotencyKey);

      if (input.url === winner.url_destiny) {
        if (JSON.stringify(input.payload) === JSON.stringify(winner.payload)) {
          return { webhook: winner, created: false, conflict: false };
        }
      }

      return {
        webhook: winner,
        created: false,
        conflict: true,
      };
    }
    return { webhook: newWebhook, created: true, conflict: false };
  }
}
