import type { Request, Response, NextFunction } from "express";
import type { ErrorResponse } from "../types/index.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorResponse["error"],
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ErrorResponse = { error: err.code, message: err.message };
    res.status(err.statusCode).json(body);
    return;
  }

  console.error("[unhandled error]", err);
  const body: ErrorResponse = {
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  };
  res.status(500).json(body);
}
