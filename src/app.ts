import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";

// --- CRITICAL: LOAD ENV CONFIGURATIONS BEFORE ANY OTHER IMPORTS ---
import dotenv from "dotenv";
// Explicitly look for the .env file relative to this backend source directory 
// to prevent execution directory path confusion from the frontend server runner.
dotenv.config({ path: path.resolve(__dirname, "../.env") });
// -----------------------------------------------------------------

import authRouter from "./routes/auth.routes";
import categoryRouter from "./routes/category.routes";
import productRouter from "./routes/product.routes";
import cartRouter from "./routes/cart.routes";
import orderRouter from "./routes/order.routes";
import reviewRouter from "./routes/review.routes";
import adminRouter from "./routes/admin.routes";

import { authenticateToken } from "./middleware/auth";
import { runMigrations } from "./db/migrations";

const app = express();

// Configure CORS to permit the decoupled frontend to speak to our endpoint
app.use(cors({
  origin: [
    'd3g7a1twk7q2ux.cloudfront.net',
    'http://ecommerce-frontend-shah.s3-website-us-east-1.amazonaws.com',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static directory local fallback uploads if present
const UPLOADS_PATH = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOADS_PATH));

// Global Cookie authentication initializer
app.use(authenticateToken);

// Mount routing trees
app.use("/api/auth", authRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/products", productRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/admin", adminRouter);

// Service Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// Run migrations on startup
let isDatabaseReady = false;
runMigrations()
  .then(() => {
    isDatabaseReady = true;
    console.log("APP_STARTUP: Database initialized and ready.");
  })
  .catch((err) => {
    console.error("APP_STARTUP: Database migration failed. Serving API with connection issues.", err);
  });

// Endpoint block defense for pending DB migrations
app.use((req, res, next) => {
  if (!isDatabaseReady && req.path.startsWith("/api")) {
    return res.status(503).json({
      error: "Database is initializing. Please retry in a few seconds.",
      code: "DB_INITIALIZING",
    });
  }
  next();
});

// Uniform Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("EXPRESS_GLOBAL_ERROR:", err);

  const status = err.status || 500;
  
  // Format Postgres error codes
  if (err.code === "23505") {
    return res.status(400).json({
      error: "Resource already exists. Unique constraint conflict.",
      code: "CONFLICT_ERROR",
      details: err.detail,
    });
  }

  return res.status(status).json({
    error: err.message || "An unexpected error occurred on the server.",
    code: err.code || "INTERNAL_SERVER_ERROR",
  });
});

export default app;
