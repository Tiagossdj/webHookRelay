import { UnrecoverableError } from "bullmq";
import { env } from "../config/env.js";
import { webhookQueue } from "./webhook.queue.js";
import { WebhookRepository } from "./webhook.repository.js";
import { signPayload } from "./webhook.signature.js";
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

  static async getById(id: number) {
    const webhook = await WebhookRepository.findById(id);
    if (!webhook) return null;

    const attempts = await WebhookRepository.findAttemptsByWebhookId(id);

    return { ...webhook, attempts };
  }

  private static isSameRequest(input: CreateWebhookInput, saved: SavedWebhook) {
    return (
      input.url === saved.url_destiny &&
      JSON.stringify(input.payload) === JSON.stringify(saved.payload)
    );
  }

  static async deliver(
    webhookId: number,
    attemptNumber: number,
    maxAttempts: number,
  ) {
    const webhook = await WebhookRepository.findById(webhookId);

    // Tentar de novo não faz o webhook aparecer: falha sem retry
    if (!webhook) {
      throw new UnrecoverableError(`Webhook ${webhookId} not found`);
    }

    // Mesma string no body e na assinatura, senão o destino não confere
    const body = JSON.stringify(webhook.payload);
    const timestamp = Math.floor(Date.now() / 1000);

    let res: Response;

    try {
      const response = await fetch(webhook.url_destiny, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": String(webhook.id),
          "X-Webhook-Timestamp": String(timestamp),
          "X-Webhook-Signature": signPayload(body, timestamp, env.WEBHOOK_SECRET),
        },
        body,
        // Destino lento não pode prender o worker: estoura e cai no catch (caso A)
        signal: AbortSignal.timeout(env.DELIVERY_TIMEOUT_MS),
      });

      res = response;
      
    } catch (error) {
      await this.registerFailure(webhookId, attemptNumber, maxAttempts, null);

      throw new Error(`Error: ${error}`);
    }

    if (!res.ok) {
      await this.registerFailure(
        webhookId,
        attemptNumber,
        maxAttempts,
        res.status,
      );

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

  private static async registerFailure(
    webhookId: number,
    attemptNumber: number,
    maxAttempts: number,
    httpCode: number | null,
  ) {
    await WebhookRepository.createDeliveryAttempt({
      webhook_id: webhookId,
      attempt_number: attemptNumber,
      status: "failed",
      http_code: httpCode,
    });

    if (attemptNumber === maxAttempts) {
      await WebhookRepository.updateStatus(webhookId, "failed");
    }
  }
}
