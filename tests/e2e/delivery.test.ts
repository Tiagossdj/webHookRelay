import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifySignature } from "../../src/webhook/webhook.signature.js";
import { closeConnections, resetState } from "../helpers/db.js";

// Caixa-preta: API e worker rodam como processos separados (como em produção)
// e o teste só conversa com eles por HTTP. O destino é um servidor local.
// Env de teste (vitest.config.ts): 3 tentativas, backoff 50ms, timeout 1s.

interface ReceivedRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const received: ReceivedRequest[] = [];
let flakyCalls = 0;

const destination = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    received.push({ path: req.url!, headers: req.headers, body });

    if (req.url === "/ok") return res.writeHead(200).end();
    if (req.url === "/error") return res.writeHead(500).end();
    if (req.url === "/flaky") {
      flakyCalls++;
      return res.writeHead(flakyCalls <= 2 ? 503 : 200).end();
    }
    // "/hang": nunca responde, força o timeout
  });
});

let destinationUrl: string;
let apiUrl: string;
const processes: ChildProcess[] = [];

function startProcess(script: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", script], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout!.on("data", (d) => (output += d));
  child.stderr!.on("data", (d) => (output += d));
  processes.push(child);
  return () => output;
}

async function freePort() {
  const server = http.createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn().catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor timed out");
}

async function createWebhook(path: string, payload: object) {
  const res = await fetch(`${apiUrl}/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `e2e-${path}-${Date.now()}`,
    },
    body: JSON.stringify({ url: `${destinationUrl}${path}`, payload }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number };
}

/** Faz polling no GET até o webhook sair de pending (delivered ou failed). */
async function waitForFinalStatus(id: number) {
  return waitFor(async () => {
    const res = await fetch(`${apiUrl}/webhooks/${id}`);
    const webhook = await res.json();
    return webhook.status === "pending" ? undefined : webhook;
  });
}

beforeAll(async () => {
  await resetState();

  destination.listen(0);
  await new Promise((resolve) => destination.once("listening", resolve));
  destinationUrl = `http://127.0.0.1:${(destination.address() as AddressInfo).port}`;

  const port = await freePort();
  apiUrl = `http://127.0.0.1:${port}`;
  const serverOutput = startProcess("src/server.ts", { PORT: String(port) });
  startProcess("src/worker.ts", {});

  await waitFor(async () => ((await fetch(apiUrl)).ok ? true : undefined), 15000).catch(
    () => {
      throw new Error(`API did not start:\n${serverOutput()}`);
    },
  );
}, 30000);

afterAll(async () => {
  for (const child of processes) child.kill();
  destination.closeAllConnections();
  destination.close();
  await closeConnections();
});

describe("webhook delivery (api + worker + destination)", () => {
  it("delivers on the first try with the payload and a valid HMAC signature", async () => {
    const payload = { event: "order.paid", amount: 100 };
    const { id } = await createWebhook("/ok", payload);

    const webhook = await waitForFinalStatus(id);

    expect(webhook.status).toBe("delivered");
    expect(webhook.attempts).toMatchObject([
      { attempt_number: 1, status: "success", http_code: 200 },
    ]);

    const request = received.find((r) => r.path === "/ok")!;
    expect(JSON.parse(request.body)).toEqual(payload);
    expect(request.headers["x-webhook-id"]).toBe(String(id));
    expect(
      verifySignature(
        request.body,
        Number(request.headers["x-webhook-timestamp"]),
        String(request.headers["x-webhook-signature"]),
        "test-secret",
      ),
    ).toBe(true);
  });

  it("retries with backoff and delivers when the destination recovers", async () => {
    const { id } = await createWebhook("/flaky", { event: "retry" });

    const webhook = await waitForFinalStatus(id);

    expect(webhook.status).toBe("delivered");
    expect(webhook.attempts).toMatchObject([
      { attempt_number: 1, status: "failed", http_code: 503 },
      { attempt_number: 2, status: "failed", http_code: 503 },
      { attempt_number: 3, status: "success", http_code: 200 },
    ]);
  });

  it("marks the webhook failed after all attempts get an error status", async () => {
    const { id } = await createWebhook("/error", { event: "error" });

    const webhook = await waitForFinalStatus(id);

    expect(webhook.status).toBe("failed");
    expect(webhook.attempts).toHaveLength(3);
    expect(webhook.attempts.every((a: { http_code: number }) => a.http_code === 500)).toBe(true);
  });

  it("records attempts without http code when the destination times out", async () => {
    const { id } = await createWebhook("/hang", { event: "timeout" });

    const webhook = await waitForFinalStatus(id);

    expect(webhook.status).toBe("failed");
    expect(webhook.attempts).toMatchObject([
      { attempt_number: 1, status: "failed", http_code: null },
      { attempt_number: 2, status: "failed", http_code: null },
      { attempt_number: 3, status: "failed", http_code: null },
    ]);
  });
});
