import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, "0.0.0.0", (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening on http://0.0.0.0:${env.PORT}`);
});
