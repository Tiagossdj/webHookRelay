// Bancos e Redis separados dos de desenvolvimento: os testes apagam dados.
// Integração e e2e também ficam separados entre si, porque o Vitest roda
// projetos em paralelo e um TRUNCATE de um apagaria as linhas do outro.
// No CI, sobrescreva a base pelas variáveis TEST_DATABASE_URL / TEST_REDIS_URL.
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://docker:docker@localhost:5432/webhookrelay_test";

const baseRedisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";

function withDatabaseSuffix(url: string, suffix: string) {
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname}${suffix}`;
  return parsed.toString();
}

function withRedisDb(url: string, db: number) {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

export const testServices = {
  integration: {
    DATABASE_URL: baseDatabaseUrl,
    REDIS_URL: withRedisDb(baseRedisUrl, 1),
  },
  e2e: {
    DATABASE_URL: withDatabaseSuffix(baseDatabaseUrl, "_e2e"),
    REDIS_URL: withRedisDb(baseRedisUrl, 2),
  },
};

export type TestProjectName = keyof typeof testServices;
