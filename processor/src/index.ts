import * as dotenv from "dotenv";
dotenv.config();

const start = async () => {
  // Dynamic import ensures env vars are loaded BEFORE modules that read process.env.
  // In ESM, static imports are hoisted and evaluated before module body code,
  // which caused config.ts to read empty env vars before dotenv.config() ran.
  const { config, validateConfig } = await import("./config/config.js");
  const { setupFastify } = await import("./server/server.js");

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
