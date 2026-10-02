import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import corsPlugin from "./plugins/cors.js";
import securityPlugin from "./plugins/security.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import tenantPlugin from "./plugins/tenant.js";
import { registerAllRoutes } from "./routes/index.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    bodyLimit: env.BODY_LIMIT_BYTES,
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      // Never log credentials, even if a header/body field is misnamed.
      redact: {
        paths: ["req.headers.authorization", "*.password", "*.DATABASE_URL", "*.token"],
        censor: "[REDACTED]"
      }
    }
  });

  app.register(corsPlugin);
  app.register(securityPlugin);
  app.register(errorHandlerPlugin);
  app.register(tenantPlugin);

  app.register(
    async (instance) => {
      registerAllRoutes(instance);
    },
    { prefix: "/api" }
  );

  return app;
}
