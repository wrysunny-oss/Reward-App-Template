import type { Response } from "express";

/** 统一成功响应协议，requestId 可用于定位对应的服务端日志。 */
export const ok = <T>(res: Response, data: T, message = "ok", status = 200) =>
  res.status(status).json({ code: 0, message, data, requestId: res.locals.requestId });

/** 可预期业务异常；status 是 HTTP 状态，code 是稳定的前端业务码。 */
export class AppError extends Error {
  constructor(public status: number, public code: number, message: string, public details?: unknown) {
    super(message);
  }
}

/**
 * JSON 不支持 bigint。数据库 ID 在响应出口统一转成字符串，避免 JS 数字精度丢失。
 * 业务层仍然保留 Prisma 原生类型，不需要到处手工转换。
 */
export const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]));
  }
  return value;
};
