import Fastify from "fastify";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

app.get("/", async (req, reply) => {
  reply.send({ status: "ok" });
});

app.listen({ port: 3000, host: "0.0.0.0" }, (err, adress) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`server listening on ${adress}`);
});
