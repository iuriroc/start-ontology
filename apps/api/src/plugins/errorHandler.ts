import type { FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../errors.js";

/** Ensures the API never leaks a raw stack trace to the client (spec
 * section 47) and always responds with the { error: { code, message } }
 * shape, whether the failure is a known AppError, a body-too-large / rate
 * limit error from a plugin, or anything unexpected. */
export default fp(async (app) => {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    if (error.statusCode && error.statusCode < 500) {
      reply.code(error.statusCode).send({
        error: { code: error.code ?? "BAD_REQUEST", message: error.message }
      });
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    reply.code(500).send({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found" } });
  });
});
