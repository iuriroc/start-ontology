import cors from "@fastify/cors";
import fp from "fastify-plugin";
import { env } from "../config/env.js";

export default fp(async (app) => {
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE"]
  });
});
