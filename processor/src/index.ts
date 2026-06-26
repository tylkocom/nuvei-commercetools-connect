import "dotenv/config";

import { config, validateConfig } from "./config/config.js";
import { setupFastify } from "./server/server.js";
import { log } from "./libs/logger/index.js";

const start = async () => {
  validateConfig();
  log.info("Processor starting.", { port: config.port });
  const server = await setupFastify();
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    log.info("Processor listening.", { port: config.port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
