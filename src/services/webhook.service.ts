import { WebhookRepository } from "../repository/webhook.repository.js";
import type { SavedWebhook } from "../repository/webhook.repository.js";

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
      if (this.isSameRequest(input, existing)) {
        return { webhook: existing, created: false, conflict: false };
      }
      return {
        webhook: existing,
        created: false,
        conflict: true,
      };
    }

    const newWebhook = await WebhookRepository.create(input);

    if (!newWebhook) {
      const winner = await WebhookRepository.findByIdempotencyKey(
        input.idempotencyKey,
      );

      if (this.isSameRequest(input, winner)) {
        return { webhook: winner, created: false, conflict: false };
      }

      return {
        webhook: winner,
        created: false,
        conflict: true,
      };
    }
    return { webhook: newWebhook, created: true, conflict: false };
  }

  private static isSameRequest(input: CreateWebhookInput, saved: SavedWebhook) {
    return (
      input.url === saved.url_destiny &&
      JSON.stringify(input.payload) === JSON.stringify(saved.payload)
    );
  }
}
