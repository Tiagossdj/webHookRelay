import Fastify from "fastify";

const isDev = process.env.NODE_ENV !== 'production' 

const app = Fastify({
  logger: isDev ? {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss',
        ignore: 'pid, hostname'
      }
    }
  }: true
});

app.get("/", async (req, reply) => {
  reply.send({ status: "ok" });
});

app.listen({ port: 3000, host: "0.0.0.0" }, (err, adress) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
