import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
import postgres from "postgres";

/** Conexão postgres.js (exportada para ser fechada no graceful shutdown). */
export const client = postgres(env.DATABASE_URL);
/** Instância do Drizzle usada pelos repositories. */
export const db = drizzle(client);
