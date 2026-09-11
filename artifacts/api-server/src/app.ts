import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", router);

// Explicit 404 handler for unmatched API routes to prevent fallback to SPA HTML
app.use("/api", (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Explicit JSON error handler for all API errors (Multer, payload too large, invalid JSON, etc.)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API Error Handler Caught]:", err);
  const status =
    err.status ||
    err.statusCode ||
    (err.name === "MulterError" || err.type === "entity.too.large" ? 413 : 500);
  res.status(status).json({
    error:
      err.type === "entity.too.large"
        ? "Request payload exceeds the maximum size limit (50 MB)."
        : err.message || "An unexpected server error occurred.",
    code: err.code || undefined,
  });
});

export default app;
