import { webhookQueue } from "./webhook.queue.js";
import { WebhookRepository } from "./webhook.repository.js";
import type { SavedWebhook } from "./webhook.repository.js";

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
    await webhookQueue.add("webhook-delivery", { webhookId: newWebhook.id });

    return { webhook: newWebhook, created: true, conflict: false };
  }

  private static isSameRequest(input: CreateWebhookInput, saved: SavedWebhook) {
    return (
      input.url === saved.url_destiny &&
      JSON.stringify(input.payload) === JSON.stringify(saved.payload)
    );
  }

  static async deliver(webhookId: number, attemptNumber: number) {
    const webhook = await WebhookRepository.findById(webhookId);

    if (!webhook) return console.log(`Sem registro de ID: ${webhookId}`);

    let res: Response;

    try {
      const response = await fetch(webhook.url_destiny, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhook.payload),
      });

      res =  response
      
    } catch (error) {
      await WebhookRepository.createDeliveryAttempt({
        webhook_id: webhook.id,
        attempt_number: attemptNumber,
        status: "failed",
        http_code: null,
      });

      throw new Error(`Error: ${error}`);
    }

    if (!res.ok) {
      await WebhookRepository.createDeliveryAttempt({
        webhook_id: webhook.id,
        attempt_number: attemptNumber,
        status: "failed",
        http_code: res.status,
      });

      throw new Error(`Error HTTP! status: ${res.status}`);
    }

    await WebhookRepository.createDeliveryAttempt({
      webhook_id: webhook.id,
      attempt_number: attemptNumber,
      status: "success",
      http_code: res.status,
    });

    await WebhookRepository.updateStatus(webhookId, "delivered");
  }
}
