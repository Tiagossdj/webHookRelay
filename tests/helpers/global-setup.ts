import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Redis } from "ioredis";
import type { TestProject } from "vitest/node";
import { type TestProjectName, testServices } from "./test-env.js";

// Roda uma vez por projeto (integration / e2e) antes dos testes:
// cria o banco daquele projeto se não existir, aplica as migrations e limpa o Redis
export async function setup(project: TestProject) {
  const { DATABASE_URL, REDIS_URL } =
    testServices[project.name as TestProjectName];

  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.slice(1);

  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) {
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();

  const redis = new Redis(REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}
