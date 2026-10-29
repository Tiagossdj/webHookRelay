import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { webhooks } from "../../src/db/schema.js";
import { webhookQueue } from "../../src/webhook/webhook.queue.js";
import { WebhookRepository } from "../../src/webhook/webhook.repository.js";
import { closeConnections, resetState } from "../helpers/db.js";

// Stack real (Express + Postgres + Redis), sem worker: os jobs ficam na fila
const body = { url: "https://example.com/hook", payload: { amount: 100 } };

function postWebhook(key: string, data: object = body) {
  return request(app).post("/webhooks").set("Idempotency-Key", key).send(data);
}

async function queuedJobs() {
  return webhookQueue.getJobs(["waiting", "delayed"]);
}

beforeEach(resetState);
afterAll(closeConnections);

describe("GET /", () => {
  it("responds with status ok", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("POST /webhooks", () => {
  it("201: stores the webhook as pending and enqueues one delivery job", async () => {
    const res = await postWebhook("key-1");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      url_destiny: body.url,
      payload: body.payload,
      idempotency_key: "key-1",
      status: "pending",
    });

    const jobs = await queuedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.data).toEqual({ webhookId: 1 });
  });

  it("200: same key and same body returns the original without duplicating", async () => {
    const first = await postWebhook("key-1");
    const second = await postWebhook("key-1");

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await db.select().from(webhooks)).toHaveLength(1);
    expect(await queuedJobs()).toHaveLength(1);
  });

  it("409: same key with a different body", async () => {
    await postWebhook("key-1");
    const res = await postWebhook("key-1", { ...body, payload: { amount: 999 } });

    expect(res.status).toBe(409);
    expect(await db.select().from(webhooks)).toHaveLength(1);
  });

  it("handles concurrent requests with the same key: one 201, the rest 200, one row", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => postWebhook("race-key")),
    );
    const statuses = responses.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(9);
    expect(await db.select().from(webhooks)).toHaveLength(1);
    expect(await queuedJobs()).toHaveLength(1);
  });

  it("400: missing Idempotency-Key header", async () => {
    const res = await request(app).post("/webhooks").send(body);

    expect(res.status).toBe(400);
    expect(res.body.errors.headers).toHaveProperty("idempotency-key");
  });

  it("400: invalid url and missing payload", async () => {
    const res = await postWebhook("key-1", { url: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.errors.body).toHaveProperty("url");
    expect(res.body.errors.body).toHaveProperty("payload");
    expect(await db.select().from(webhooks)).toHaveLength(0);
  });
});

describe("GET /webhooks/:id", () => {
  it("200: returns the webhook with attempts ordered by attempt_number", async () => {
    const { body: created } = await postWebhook("key-1");
    // Inseridas fora de ordem de propósito
    for (const attempt_number of [2, 1, 3]) {
      await WebhookRepository.createDeliveryAttempt({
        webhook_id: created.id,
        attempt_number,
        status: attempt_number === 3 ? "success" : "failed",
        http_code: attempt_number === 3 ? 200 : 503,
      });
    }

    const res = await request(app).get(`/webhooks/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.attempts.map((a: { attempt_number: number }) => a.attempt_number)).toEqual([1, 2, 3]);
    expect(res.body.attempts[2]).toMatchObject({ status: "success", http_code: 200 });
  });

  it("200: webhook without attempts returns an empty list (not 404)", async () => {
    const { body: created } = await postWebhook("key-1");

    const res = await request(app).get(`/webhooks/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.attempts).toEqual([]);
  });

  it("404: webhook does not exist", async () => {
    const res = await request(app).get("/webhooks/99999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Webhook not found" });
  });

  it.each(["abc", "0", "1.5", "-1"])("400: invalid id %s", async (id) => {
    const res = await request(app).get(`/webhooks/${id}`);

    expect(res.status).toBe(400);
    expect(res.body.errors.params).toHaveProperty("id");
  });
});
