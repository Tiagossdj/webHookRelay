import express from "express";
import { pinoHttp } from "pino-http";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { errorHandler } from "./middlewares/error-handler.js";

const isDev = process.env.NODE_ENV !== "production";

const app = express();

app.use(
  pinoHttp(
    isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {},
  ),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.use(webhookRoutes);

app.use(errorHandler);

export { app };
