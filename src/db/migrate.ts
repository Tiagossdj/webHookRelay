import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "../config/env.js";

// Roda as migrations sem drizzle-kit (devDependency), para funcionar na imagem
// de produção. postgres.js exige max: 1 para migrations
const client = postgres(env.DATABASE_URL, { max: 1 });

await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
console.log("Migrations applied");

await client.end();
