import type { NextFunction, Request, Response } from "express";

/** Último middleware: loga o erro e responde 500 sem expor detalhes ao cliente. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  req.log.error(err);
  res.status(500).json({ message: "Internal server error" });
}
