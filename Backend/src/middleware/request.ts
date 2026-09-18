import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError, toJsonSafe } from "../lib/http.js";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  // 优先透传网关生成的 ID，便于串联客户端报错、访问日志和审计记录。
  const suppliedRequestId = req.header("x-request-id")?.trim();
  res.locals.requestId = suppliedRequestId && /^[A-Za-z0-9._:-]{8,80}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
  res.setHeader("x-request-id", res.locals.requestId);
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(toJsonSafe(body))) as typeof res.json;
  next();
};

/** 校验并用 Zod 转换后的值覆盖原始输入，例如把分页参数从字符串转成数字。 */
export const validate = (schema: ZodType, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(new AppError(422, 1001, "参数校验失败", result.error.flatten()));

    // Express 5 将 req.query 改成了只读 getter，不能再像 Express 4 一样整体赋值。
    // 转换后的查询参数放到 locals，既保留 Zod 的默认值/类型转换，也不修改框架对象。
    if (source === "query") res.locals.validatedQuery = result.data;
    else (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
