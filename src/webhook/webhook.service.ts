import { UnrecoverableError } from "bullmq";
import { env } from "../config/env.js";
import { webhookQueue } from "./webhook.queue.js";
import { WebhookRepository } from "./webhook.repository.js";
import { signPayload } from "./webhook.signature.js";
import type { SavedWebhook } from "./webhook.repository.js";

/** Dados de entrada já validados pelo controller para registrar um webhook. */
interface CreateWebhookInput {
  /** URL de destino que vai receber o POST. */
  url: string;
  /** Corpo JSON repassado ao destino sem alteração. */
  payload: unknown;
  /** Valor do header Idempotency-Key enviado pelo cliente. */
  idempotencyKey: string;
}

/**
 * Regras de negócio dos webhooks: registro idempotente, consulta e entrega.
 * Não conhece HTTP (Express) nem SQL; fala com o repository e com a fila.
 */
export class WebhookService {
  /**
   * Registra um webhook de forma idempotente e enfileira a entrega.
   *
   * - key nova → cria e enfileira `{ webhookId }` (`created: true`)
   * - mesma key e mesmo body → devolve o original (`created: false`)
   * - mesma key e body diferente → `conflict: true` (controller responde 409)
   *
   * Requisições simultâneas com a mesma key: o insert usa ON CONFLICT DO NOTHING;
   * quem perde a corrida busca o registro vencedor e segue as mesmas regras.
   */
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

  /**
   * Busca um webhook com o histórico de tentativas ordenado por `attempt_number`.
   * @returns o webhook com `attempts` (lista vazia se ainda não houve tentativa) ou `null` se não existir.
   */
  static async getById(id: number) {
    const webhook = await WebhookRepository.findById(id);
    if (!webhook) return null;

    const attempts = await WebhookRepository.findAttemptsByWebhookId(id);

    return { ...webhook, attempts };
  }

  /** Compara url e payload para decidir entre replay (200) e conflito (409). */
  private static isSameRequest(input: CreateWebhookInput, saved: SavedWebhook) {
    return (
      input.url === saved.url_destiny &&
      JSON.stringify(input.payload) === JSON.stringify(saved.payload)
    );
  }

  /**
   * Faz uma tentativa de entrega (chamado pelo worker a cada execução do job).
   *
   * Envia POST assinado (headers `X-Webhook-Id`, `X-Webhook-Timestamp`,
   * `X-Webhook-Signature`) com timeout e grava a tentativa em `delivery_attempts`.
   * Em 2xx marca o webhook como `delivered`. Em falha grava a tentativa e lança
   * erro para o BullMQ agendar o retry; na última tentativa marca `failed`.
   *
   * @param webhookId id do webhook no Postgres (vem de `job.data`).
   * @param attemptNumber número desta tentativa, começando em 1 (`job.attemptsMade + 1`).
   * @param maxAttempts total de tentativas configurado no job (`job.opts.attempts`).
   * @throws {UnrecoverableError} se o webhook não existe (falha sem retry).
   * @throws {Error} se não houve resposta (rede/timeout) ou o status não é 2xx.
   */
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

  /**
   * Grava a tentativa como `failed` e, se era a última, marca o webhook como `failed`.
   * @param httpCode status recebido, ou `null` quando o destino não respondeu.
   */
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
