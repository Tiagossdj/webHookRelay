import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

interface RequestSchemas {
  body?: z.ZodType;
  headers?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, unknown> = {};

    for (const key of ["body", "headers", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        errors[key] = z.flattenError(result.error).fieldErrors;
        continue;
      }

      // No Express 5 req.query é um getter, então não pode ser reatribuído
      if (key === "body") req.body = result.data;
      if (key === "params") req.params = result.data as Request['params']
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: "Validation error", errors });
    }

    next();
  };
}
