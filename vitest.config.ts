import { defineConfig } from "vitest/config";
import { testServices } from "./tests/helpers/test-env.js";

// Variáveis lidas pelo src/config/env.ts. O dotenv não sobrescreve
// o que já está em process.env, então estes valores vencem o .env
const env = {
  NODE_ENV: "test",
  ...testServices.integration,
  WEBHOOK_SECRET: "test-secret",
  DELIVERY_TIMEOUT_MS: "1000",
  DELIVERY_ATTEMPTS: "3",
  DELIVERY_BACKOFF_MS: "50",
};

export default defineConfig({
  test: {
    env,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          // Compartilham o mesmo banco: um arquivo por vez
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          // Banco e Redis próprios: roda em paralelo com a integração sem conflito
          env: { ...env, ...testServices.e2e },
          globalSetup: ["tests/helpers/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Pontos de entrada: cobertos pelo e2e via processos, não por import
      exclude: ["src/server.ts", "src/worker.ts", "src/db/migrate.ts"],
    },
  },
});
