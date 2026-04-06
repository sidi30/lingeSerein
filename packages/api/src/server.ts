import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { buildApp } from "./app.js";

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env["API_PORT"]) || 3001;
  const host = process.env["API_HOST"] || "0.0.0.0";

  await app.listen({ port, host });
  app.log.info(`Linge Serein API v1 running on ${host}:${port}`);
  app.log.info(`Documentation: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/api/docs`);
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
