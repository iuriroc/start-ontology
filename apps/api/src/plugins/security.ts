import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fp from "fastify-plugin";
import { env } from "../config/env.js";

export default fp(async (app) => {
  await app.register(helmet, {
    // API-only service: no HTML is served, so a strict default CSP is safe
    // and doesn't need per-route relaxing.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } }
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW
  });

  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1
    }
  });
});
