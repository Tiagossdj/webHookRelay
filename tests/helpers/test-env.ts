// Banco e Redis separados dos de desenvolvimento: os testes apagam dados.
// Redis usa o database lógico 1 (o dev usa o 0). No CI, sobrescreva pelas variáveis.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://docker:docker@localhost:5432/webhookrelay_test";

export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1";
