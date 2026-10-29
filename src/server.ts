import { app } from "./app.js";
import { env } from "./config/env.js";
import { client } from "./db/index.js";
import { connection, webhookQueue } from "./webhook/webhook.queue.js";

const server = app.listen(env.PORT, "0.0.0.0", (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening on http://0.0.0.0:${env.PORT}`);
});

// Para de aceitar conexões, termina as requisições em andamento
// e só então fecha Redis e Postgres
function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  server.close(async () => {
    await webhookQueue.close();
    await connection.quit();
    await client.end();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
