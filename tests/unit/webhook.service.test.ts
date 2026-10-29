import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookService } from "../../src/webhook/webhook.service.js";
import { WebhookRepository } from "../../src/webhook/webhook.repository.js";
import { webhookQueue } from "../../src/webhook/webhook.queue.js";
import type { SavedWebhook } from "../../src/webhook/webhook.repository.js";
import { verifySignature } from "../../src/webhook/webhook.signature.js";

// Sem banco e sem Redis: o service é testado isolado das camadas de baixo
vi.mock("../../src/webhook/webhook.repository.js", () => ({
  WebhookRepository: {
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findAttemptsByWebhookId: vi.fn(),
    updateStatus: vi.fn(),
    createDeliveryAttempt: vi.fn(),
  },
}));

vi.mock("../../src/webhook/webhook.queue.js", () => ({
  webhookQueue: { add: vi.fn() },
}));

const repo = vi.mocked(WebhookRepository);
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const input = {
  url: "https://example.com/hook",
  payload: { amount: 100 },
  idempotencyKey: "key-1",
};

function savedWebhook(overrides: Partial<SavedWebhook> = {}): SavedWebhook {
  return {
    id: 1,
    url_destiny: input.url,
    payload: input.payload,
    idempotency_key: input.idempotencyKey,
    status: "pending",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WebhookService.create", () => {
  it("creates the webhook and enqueues only its id when the key is new", async () => {
    repo.findByIdempotencyKey.mockResolvedValue(null);
    repo.create.mockResolvedValue(savedWebhook());

    const result = await WebhookService.create(input);

    expect(result).toEqual({ webhook: savedWebhook(), created: true, conflict: false });
    expect(webhookQueue.add).toHaveBeenCalledWith("webhook-delivery", { webhookId: 1 });
  });

  it("returns the existing webhook when the same key comes with the same body", async () => {
    repo.findByIdempotencyKey.mockResolvedValue(savedWebhook());

    const result = await WebhookService.create(input);

    expect(result).toEqual({ webhook: savedWebhook(), created: false, conflict: false });
    expect(repo.create).not.toHaveBeenCalled();
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });

  it("flags a conflict when the same key comes with a different body", async () => {
    repo.findByIdempotencyKey.mockResolvedValue(
      savedWebhook({ payload: { amount: 999 } }),
    );

    const result = await WebhookService.create(input);

    expect(result.conflict).toBe(true);
    expect(result.created).toBe(false);
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });

  it("returns the winner when a concurrent request inserted the same key first", async () => {
    // 1ª busca não acha, o insert perde a corrida (ON CONFLICT DO NOTHING → null)
    repo.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedWebhook({ id: 7 }));
    repo.create.mockResolvedValue(null);

    const result = await WebhookService.create(input);

    expect(result).toEqual({
      webhook: savedWebhook({ id: 7 }),
      created: false,
      conflict: false,
    });
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });

  it("flags a conflict when it loses the race to a request with a different body", async () => {
    repo.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedWebhook({ url_destiny: "https://other.com" }));
    repo.create.mockResolvedValue(null);

    const result = await WebhookService.create(input);

    expect(result.conflict).toBe(true);
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });
});

describe("WebhookService.getById", () => {
  it("returns null when the webhook does not exist", async () => {
    repo.findById.mockResolvedValue(null);

    expect(await WebhookService.getById(1)).toBeNull();
    expect(repo.findAttemptsByWebhookId).not.toHaveBeenCalled();
  });

  it("returns the webhook with its delivery attempts", async () => {
    const attempts = [
      { id: 1, webhook_id: 1, attempt_number: 1, status: "failed" as const, http_code: 503, attempted_at: new Date() },
    ];
    repo.findById.mockResolvedValue(savedWebhook());
    repo.findAttemptsByWebhookId.mockResolvedValue(attempts);

    expect(await WebhookService.getById(1)).toEqual({ ...savedWebhook(), attempts });
  });
});

describe("WebhookService.deliver", () => {
  beforeEach(() => {
    repo.findById.mockResolvedValue(savedWebhook());
  });

  it("throws UnrecoverableError (no retries) when the webhook does not exist", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(WebhookService.deliver(1, 1, 5)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a success attempt and marks the webhook delivered on 2xx", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await WebhookService.deliver(1, 2, 5);

    expect(repo.createDeliveryAttempt).toHaveBeenCalledWith({
      webhook_id: 1,
      attempt_number: 2,
      status: "success",
      http_code: 200,
    });
    expect(repo.updateStatus).toHaveBeenCalledWith(1, "delivered");
  });

  it("posts the payload with a valid HMAC signature and a timeout signal", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await WebhookService.deliver(1, 1, 5);

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;

    expect(url).toBe(input.url);
    expect(init!.method).toBe("POST");
    expect(init!.body).toBe(JSON.stringify(input.payload));
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(headers["X-Webhook-Id"]).toBe("1");
    expect(
      verifySignature(
        init!.body as string,
        Number(headers["X-Webhook-Timestamp"]),
        headers["X-Webhook-Signature"]!,
        "test-secret",
      ),
    ).toBe(true);
  });

  it("records a failed attempt with the http code and throws on non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(WebhookService.deliver(1, 1, 5)).rejects.toThrow("503");

    expect(repo.createDeliveryAttempt).toHaveBeenCalledWith({
      webhook_id: 1,
      attempt_number: 1,
      status: "failed",
      http_code: 503,
    });
    // Ainda há tentativas: continua pending
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("records a failed attempt with null http code and throws when there is no response", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(WebhookService.deliver(1, 1, 5)).rejects.toThrow("fetch failed");

    expect(repo.createDeliveryAttempt).toHaveBeenCalledWith({
      webhook_id: 1,
      attempt_number: 1,
      status: "failed",
      http_code: null,
    });
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("marks the webhook failed when the last attempt fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(WebhookService.deliver(1, 5, 5)).rejects.toThrow();

    expect(repo.updateStatus).toHaveBeenCalledWith(1, "failed");
  });

  it("marks the webhook failed when the last attempt gets no response", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(WebhookService.deliver(1, 5, 5)).rejects.toThrow();

    expect(repo.updateStatus).toHaveBeenCalledWith(1, "failed");
  });
});
