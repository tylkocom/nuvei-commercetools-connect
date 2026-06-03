import "dotenv/config";

import { config, validateConfig } from "./config/config.js";
import { setupFastify } from "./server/server.js";

const start = async () => {
  validateConfig();
  const server = await setupFastify();
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
